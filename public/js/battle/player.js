/**
 * battle/player.js —— 战斗事件流播放器。
 *
 * 服务端已经把整场战斗算完，这里只负责**按时间轴播放**：
 *   move      → 棋子平滑滑到目标格
 *   skill     → 大招全屏闪 + 技能横幅
 *   attack    → 伤害飘字 + 受击闪 + 屏幕震动 + 顿帧
 *   execute   → 处决演出
 *   death     → 棋子灰掉
 *   checkmate → 全屏将死
 *
 * 播放速度可随时调整；跳过后直接把所有事件一次性结算。
 */

import {
  animateMoveTo,
  markPieceDead,
  pieceEl,
  renderPieces,
  updatePieceHp,
} from '../render/board.js';
import {
  breakMark,
  checkPulse,
  checkmateOverlay,
  comboBanner,
  damageNumber,
  dodgeFx,
  executeFx,
  formatNum,
  healPulse,
  hitFlash,
  hitStop,
  promoteBeam,
  shake,
  shakeByDamage,
  shieldBreak,
  ultFlash,
} from './vfx.js';
import { sfx } from './sound.js';

/**
 * @param {object} opts
 * @param {HTMLElement} opts.gridEl
 * @param {HTMLElement} opts.overlayEl
 * @param {HTMLElement} opts.boardEl
 * @param {Array} opts.events
 * @param {{value:number, skip:boolean}} opts.ctrl 播放控制（速度 / 跳过）
 * @param {(text:string, type:string)=>void} opts.onLog
 * @param {()=>void} [opts.onEnd]
 */
export async function playBattle(opts) {
  const { gridEl, overlayEl, boardEl, events, ctrl, onLog, onEnd } = opts;
  const positions = new Map(); // id → {file, rank, hp, maxHp}
  let last = 0;

  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms / (ctrl.value || 1))));

  const log = (text, type = '') => onLog?.(text, type);

  for (const ev of events) {
    if (ctrl.skip) {
      applyEventInstant(ev);
      continue;
    }
    const wait = ev.t - last;
    if (wait > 0) await sleep(wait);
    last = ev.t;
    await handleEvent(ev);
  }

  if (ctrl.skip) {
    applyEventInstant({ type: 'battle_end' });
  }
  onEnd?.();

  /* ---------------- 事件处理 ---------------- */

  async function handleEvent(ev) {
    switch (ev.type) {
      case 'battle_start': {
        renderPieces(gridEl, [...ev.ally, ...ev.enemy], { sideKey: 'enemy' });
        for (const p of [...ev.ally, ...ev.enemy]) {
          positions.set(p.id, { file: p.file, rank: p.rank, hp: p.hp, maxHp: p.maxHp });
        }
        log(`战斗开始 · 我方战力 ${formatNum(ev.allyPower)} / 敌方战力 ${formatNum(ev.enemyPower)}`, 'info');
        break;
      }

      case 'round_start':
        log(`── 第 ${ev.round} 回合 ──`, 'round');
        break;

      case 'move': {
        const pos = positions.get(ev.id);
        if (!pos) break;
        const el = pieceEl(gridEl, ev.id);
        if (ev.kind === 'castle') {
          positions.set(ev.id, { ...pos, file: ev.to.file, rank: ev.to.rank });
          await animateMoveTo(gridEl, ev.id, ev.to.file, ev.to.rank);
          if (ev.rookFrom) {
            positions.set(ev.rookFrom, { file: ev.rookTo.file, rank: ev.rookTo.rank });
            await animateMoveTo(gridEl, ev.rookFrom, ev.rookTo.file, ev.rookTo.rank);
          }
          log(`${sideName(ev.side)} ${ev.kind === 'en_passant' ? '吃过路兵！' : '移动'}`, 'move');
        } else {
          positions.set(ev.id, { ...pos, file: ev.to.file, rank: ev.to.rank });
          await animateMoveTo(gridEl, ev.id, ev.to.file, ev.to.rank);
          if (ev.kind === 'en_passant') log(`${sideName(ev.side)} 吃过路兵！`, 'crit');
        }
        void el;
        break;
      }

      case 'skill': {
        ultFlash();
        sfx.skill();
        log(`${sideName(ev.side)} 发动大招【${ev.name}】 ×${ev.mult}`, 'skill');
        await hitStop(90);
        break;
      }

      case 'attack': {
        const target = positions.get(ev.target);
        const tEl = pieceEl(gridEl, ev.target);
        if (!target) break;

        if (ev.reflect) {
          // 铁卫反击：伤害打在攻击方身上
          const aEl = pieceEl(gridEl, ev.id);
          const aPos = positions.get(ev.id);
          hitFlash(aEl, false);
          damageNumber(overlayEl, aPos?.file ?? 0, aPos?.rank ?? 0, ev.damage, {});
          shakeByDamage(ev.damage);
          sfx.hit();
          break;
        }

        if (ev.dodged) {
          dodgeFx(tEl);
          damageNumber(overlayEl, target.file, target.rank, 0, { miss: true });
          sfx.dodge();
          log(`${target.name ?? ''} 闪避了攻击！`, 'dodge');
          break;
        }

        // 飘字 + 受击闪 + 震动
        const isAlly = ev.side === 'ally';
        damageNumber(overlayEl, target.file, target.rank, ev.damage, {
          crit: ev.crit, exec: ev.execute,
        });
        hitFlash(tEl, ev.crit);
        shakeByDamage(ev.damage);
        if (ev.shieldAbsorbed > 0) shieldBreak(overlayEl, target.file, target.rank);
        if (ev.brokeDefense) breakMark(overlayEl, target.file, target.rank);

        if (ev.crit) {
          sfx.crit();
          if (ev.combo >= 2) {
            comboBanner(ev.combo);
            sfx.combo(ev.combo);
          }
          await hitStop(70 + Math.min(80, ev.combo * 6));
        } else {
          sfx.hit();
          await hitStop(28);
        }

        // 更新血条
        const newHp = ev.hpAfter ?? target.hp;
        target.hp = newHp;
        updatePieceHp(gridEl, ev.target, newHp, target.maxHp);

        const combo = ev.combo >= 2 ? `（连击 ×${ev.combo}）` : '';
        const crit = ev.crit ? '暴击！' : '';
        const brk = ev.brokeDefense ? ' 破防！' : '';
        log(`${sideName(ev.side)} ${ev.name ?? ''} → ${ev.targetName ?? ''} ${crit}${formatNum(ev.damage)} 伤害${combo}${brk}`, ev.crit ? 'crit' : 'damage');
        break;
      }

      case 'heal': {
        const pos = positions.get(ev.id);
        const el = pieceEl(gridEl, ev.id);
        healPulse(el);
        if (pos) {
          damageNumber(overlayEl, pos.file, pos.rank, ev.amount, { heal: true });
          pos.hp = ev.hpAfter ?? pos.hp;
          updatePieceHp(gridEl, ev.id, pos.hp, pos.maxHp);
        }
        sfx.heal();
        log(`${sideName(ev.side)} ${ev.name ?? ''} 回复 ${formatNum(ev.amount)} 生命`, 'heal');
        break;
      }

      case 'promotion': {
        const pos = positions.get(ev.id);
        if (pos) promoteBeam(overlayEl, pos.file, pos.rank);
        sfx.promote();
        log(`${sideName(ev.side)} ${ev.name} 升变为 ${ev.glyph ?? ''}`, 'promote');
        break;
      }

      case 'execute': {
        executeFx(ev.name);
        sfx.execute();
        shake(4);
        await hitStop(140);
        log(`☠ 处决！${ev.name} 被直接斩杀`, 'execute');
        break;
      }

      case 'death': {
        markPieceDead(gridEl, ev.id);
        const pos = positions.get(ev.id);
        if (pos) pos.hp = 0;
        break;
      }

      case 'checkmate': {
        checkmateOverlay('将 死');
        sfx.check();
        shake(4);
        break;
      }

      case 'round_end':
        break;

      case 'battle_end': {
        const label = ev.result === 'win' ? '胜利' : ev.result === 'lose' ? '失败' : '平局';
        if (ev.result === 'win') sfx.victory();
        else if (ev.result === 'lose') sfx.defeat();
        log(`战斗结束：${label}（${ev.rounds} 回合）${ev.reason ? ` · ${ev.reason}` : ''}`, 'result');
        break;
      }

      default:
        break;
    }
  }

  /** 跳过模式：一次性把结果落到 DOM 上 */
  function applyEventInstant(ev) {
    switch (ev.type) {
      case 'battle_start': {
        renderPieces(gridEl, [...ev.ally, ...ev.enemy], { sideKey: 'enemy' });
        for (const p of [...ev.ally, ...ev.enemy]) {
          positions.set(p.id, { file: p.file, rank: p.rank, hp: p.hp, maxHp: p.maxHp });
        }
        break;
      }
      case 'move': {
        const pos = positions.get(ev.id);
        if (!pos) break;
        pos.file = ev.to.file;
        pos.rank = ev.to.rank;
        const el = pieceEl(gridEl, ev.id);
        if (el) {
          const target = gridEl.querySelector(`.square[data-file="${ev.to.file}"][data-rank="${ev.to.rank}"]`);
          if (target) target.appendChild(el);
        }
        if (ev.rookFrom) {
          const rp = positions.get(ev.rookFrom);
          if (rp) { rp.file = ev.rookTo.file; rp.rank = ev.rookTo.rank; }
          const rel = pieceEl(gridEl, ev.rookFrom);
          const rt = gridEl.querySelector(`.square[data-file="${ev.rookTo.file}"][data-rank="${ev.rookTo.rank}"]`);
          if (rel && rt) rt.appendChild(rel);
        }
        break;
      }
      case 'attack': {
        const pos = positions.get(ev.target);
        if (!pos) break;
        if (ev.reflect) break;
        if (ev.dodged) break;
        pos.hp = ev.hpAfter ?? pos.hp;
        updatePieceHp(gridEl, ev.target, pos.hp, pos.maxHp);
        break;
      }
      case 'heal': {
        const pos = positions.get(ev.id);
        if (pos) {
          pos.hp = ev.hpAfter ?? pos.hp;
          updatePieceHp(gridEl, ev.id, pos.hp, pos.maxHp);
        }
        break;
      }
      case 'death': {
        markPieceDead(gridEl, ev.id);
        const pos = positions.get(ev.id);
        if (pos) pos.hp = 0;
        break;
      }
      case 'battle_end':
        break;
      default:
        break;
    }
  }
}

function sideName(side) {
  return side === 'ally' ? '【我方】' : '【敌方】';
}
