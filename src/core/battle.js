/**
 * battle.js —— 战斗引擎。
 *
 * 服务端一次性把整场战斗算完，产出**带时间戳的事件流**；前端只负责按时间轴播放。
 * 这样彻底避开了原版「innerHTML 全量重绘把正在播的动画冲掉」的架构病（bug ⑮），
 * 也让战斗可以被复盘（存进 battles 表）。
 *
 * 回合结构：
 *   for round in 1..MAX_ROUNDS
 *     己方阶段：按 speed 降序，每个存活棋子行动一次
 *     敌方阶段：同上
 *     回合末：冷却 -1、破防/减伤等状态衰减
 *
 * 胜负：一方王陨落（将死）/ 一方全灭 / 回合耗尽 → **平局**（原版 bug ⑨ 判负）。
 */

import { MAX_ROUNDS } from '../config.js';
import { chapterConfig, TEMPLATE_BY_CODE } from './balance.js';
import { Rng } from './rng.js';
import {
  BOARD_SIZE,
  SIDE_ALLY,
  SIDE_ENEMY,
  coord,
  createBoard,
  movePiece,
  placePiece,
  removePiece,
} from './board.js';
import {
  captureTargets,
  enPassantTarget,
  enPassantVictim,
  isPromotion,
} from './movement.js';
import { healPiece, powerOf, resolveAttack, tickStatuses } from './combat.js';
import { chooseDestination, choosePromotion, chooseTarget, shouldCastle } from './ai.js';
import { computeSynergies, applySynergy } from './synergy.js';
import { equipmentEffects } from './items.js';
import { createPiece } from './progression.js';

/* -------------------------- 事件时间轴常量 -------------------------- */

const T_ACTION = 300;      // 每个棋子行动的时长
const T_PHASE = 260;       // 阵营切换的间隔
const T_MOVE = 180;        // 一次移动的时长
const T_SKILL = 140;       // 大招发动的时长
const T_HIT = 160;         // 一次攻击结算的时长

/* -------------------------- 事件构造 -------------------------- */

class EventLog {
  constructor() {
    this.events = [];
    this.t = 0;
  }

  push(type, payload = {}) {
    this.events.push({ t: Math.round(this.t), type, ...payload });
    return this.events[this.events.length - 1];
  }

  advance(ms) {
    this.t += ms;
  }
}

/* -------------------------- 战斗态棋子 -------------------------- */

/**
 * 把存档里的棋子转成战斗态棋子。
 * @param {object} unit  save_heroes 行（含 items_json / breakthroughBonus）
 * @param {string} side
 * @param {number} file
 * @param {number} rank
 */
function toBattlePiece(unit, side, file, rank) {
  return {
    id: unit.id,
    templateId: unit.template_id ?? unit.templateId,
    code: unit.code,
    name: unit.name,
    glyph: unit.glyph,
    profession: unit.profession,
    isKing: !!unit.isKing,
    voiceLine: unit.voice_line ?? unit.voiceLine ?? '',
    level: unit.level,
    star: unit.star,
    attack: unit.attack,
    hp: unit.hp ?? unit.maxHp,
    maxHp: unit.maxHp,
    baseSpeed: unit.speed,
    speed: unit.speed,
    shield: unit.shield ?? 0,
    critRate: unit.critRate,
    critMult: unit.critMult,
    dodge: unit.dodge,
    defense: unit.defense,
    recovery: unit.recovery ?? 0,
    finalDamageMult: unit.finalDamageMult ?? 1,
    ultMult: unit.ultMult,
    ultCd: unit.ultCd,
    items: unit.items ?? [],
    side,
    file,
    rank,
    isAlive: true,
    breakMeter: 0,
    defenseBrokenRounds: 0,
    damageReductionRounds: 0,
    reflectRatio: 0,
    tauntRounds: 0,
    lastDoubleStep: false,
    hasMoved: unit.hasMoved ?? true,
    ultCooldown: 0,
  };
}

/**
 * 套用羁绊与装备，得到最终的战斗属性。
 */
function applyBuffs(pieces) {
  const synergies = computeSynergies(pieces);
  for (const p of pieces) {
    const buffed = applySynergy(p, synergies);
    Object.assign(p, {
      attack: buffed.attack,
      maxHp: buffed.maxHp,
      hp: Math.min(p.hp, buffed.maxHp),
      critMult: buffed.critMult,
      ultMult: buffed.ultMult,
      alwaysCombo: !!buffed.alwaysCombo,
    });
    const fx = equipmentEffects(p.items);
    if (fx.critRate) p.critRate = Math.min(0.95, p.critRate + fx.critRate);
    if (fx.speed) p.baseSpeed += fx.speed;
    p.speed = p.baseSpeed;
    p.lifesteal = fx.lifesteal;
    p.armorPierce = fx.armorPierce;
    p.alwaysCombo = p.alwaysCombo || fx.alwaysCombo;
    p.killHeal = fx.killHeal;
    p.startShield = fx.startShield;
    p.enemySpeedDebuff = fx.enemySpeedDebuff;
    if (fx.startShield > 0) p.shield += Math.floor(p.maxHp * fx.startShield);
  }
  return synergies;
}

/** 重新计算速度光环（寒霜核心） */
function refreshAuras(pieces) {
  for (const p of pieces) p.speed = p.baseSpeed;
  for (const p of pieces) {
    if (!p.enemySpeedDebuff || !p.isAlive) continue;
    for (const o of pieces) {
      if (o.side === p.side || !o.isAlive) continue;
      o.speed = Math.max(1, o.speed - p.enemySpeedDebuff);
    }
  }
}

/* -------------------------- 大招效果 -------------------------- */

const ULT_SKILLS = {
  pawn: { name: '战地鼓舞', desc: '治疗全体友军并附加护盾' },
  knight: { name: '影刃连斩', desc: '连续斩击，追加一次攻击' },
  bishop: { name: '奥术穿透', desc: '本次攻击无视目标一半防御' },
  rook: { name: '铁壁反击', desc: '获得护盾并反弹伤害' },
  queen: { name: '群星陨落', desc: '对全体敌人造成大招伤害' },
  king: { name: '王之守护', desc: '全体友军获得减伤' },
};

/* -------------------------- 主流程 -------------------------- */

/**
 * @param {object} args
 * @param {Array} args.allyUnits   己方棋子（存档行 + 棋盘坐标 file/rank）
 * @param {Array} args.enemyUnits  敌方棋子
 * @param {number} args.seed
 * @param {number} args.chapter
 * @param {number} args.round
 * @returns {{result:string, rounds:number, events:Array, allyPower:number, enemyPower:number, allies:Array, enemies:Array}}
 */
export function runBattle({ allyUnits, enemyUnits, seed, chapter = 1, round = 1 }) {
  const rng = new Rng(seed);
  const log = new EventLog();
  const board = createBoard();

  const allies = allyUnits.map((u) => toBattlePiece(u, SIDE_ALLY, u.file, u.rank));
  const enemies = enemyUnits.map((u) => toBattlePiece(u, SIDE_ENEMY, u.file, u.rank));

  for (const p of allies) placePiece(board, p.file, p.rank, p);
  for (const p of enemies) placePiece(board, p.file, p.rank, p);

  const allySynergies = applyBuffs(allies);
  const enemySynergies = applyBuffs(enemies);
  refreshAuras([...allies, ...enemies]);

  const allyPower = allies.reduce((s, p) => s + powerOf(p), 0);
  const enemyPower = enemies.reduce((s, p) => s + powerOf(p), 0);

  log.push('battle_start', {
    ally: allies.map((p) => describePiece(p)),
    enemy: enemies.map((p) => describePiece(p)),
    allySynergies,
    enemySynergies,
    allyPower,
    enemyPower,
    chapter,
  });

  const ctx = { board, allies, enemies, log, rng, chapter, round };

  let result = null;
  let rounds = 0;
  let roundStart = 0;

  for (let r = 1; r <= MAX_ROUNDS; r++) {
    rounds = r;
    // 回合起点接在上一回合最后一个事件之后 —— 时间戳必须单调不减，
    // 否则前端按 delta 播放会出现「负延迟」。
    ctx.log.t = Math.max(ctx.log.t, roundStart);
    roundStart = ctx.log.t;
    log.push('round_start', { round: r, allyAlive: allies.filter((p) => p.isAlive).length, enemyAlive: enemies.filter((p) => p.isAlive).length });

    runPhase(log, ctx, SIDE_ALLY);
    if (checkEnd(ctx)) break;

    log.advance(T_PHASE);
    runPhase(log, ctx, SIDE_ENEMY);
    if (checkEnd(ctx)) break;

    // 回合末状态衰减
    for (const p of [...allies, ...enemies]) {
      if (!p.isAlive) continue;
      tickStatuses(p);
      if (p.damageReductionRounds > 0) p.damageReductionRounds -= 1;
      if (p.tauntRounds > 0) p.tauntRounds -= 1;
      if (p.ultCooldown > 0) p.ultCooldown -= 1;
    }
    refreshAuras([...allies, ...enemies]);
    log.push('round_end', { round: r });
    log.advance(T_PHASE);
  }

  const end = evaluateEnd(ctx);
  result = end.result;
  log.push('battle_end', {
    result,
    rounds,
    reason: end.reason,
  });

  return {
    result,
    rounds,
    events: log.events,
    allyPower,
    enemyPower,
    allies: allies.map((p) => describePiece(p)),
    enemies: enemies.map((p) => describePiece(p)),
  };
}

/* -------------------------- 阵营阶段 -------------------------- */

/** 一个阵营的所有棋子行动一轮 */
function runPhase(log, ctx, side) {
  const { allies, enemies } = ctx;
  const mine = side === SIDE_ALLY ? allies : enemies;
  const theirs = side === SIDE_ALLY ? enemies : allies;

  // 按速度降序行动（同一速度按 id 稳定排序）
  const order = mine
    .filter((p) => p.isAlive)
    .slice()
    .sort((a, b) => b.speed - a.speed || a.id - b.id);

  for (const piece of order) {
    if (!piece.isAlive) break;
    log.advance(T_ACTION);
    actPiece(log, ctx, piece, theirs);
  }
}

/** 单个棋子的行动：治疗 → 攻击/移动 → 大招 */
function actPiece(log, ctx, piece, opponents) {
  const { board, rng, allies, enemies } = ctx;

  // 被动治疗
  if ((piece.recovery ?? 0) > 0 && piece.hp < piece.maxHp) {
    const healed = healPiece(piece, piece.recovery);
    if (healed > 0) {
      log.push('heal', { side: piece.side, id: piece.id, amount: Math.round(healed), hpAfter: Math.round(piece.hp) });
    }
  }

  const ultReady = piece.ultMult > 1 && piece.ultCooldown <= 0;

  // ---- 选择目标 ----
  let target = chooseTarget(board, piece, opponents);
  // 嘲讽优先
  const taunter = opponents.find(
    (o) => o.isAlive && o.tauntRounds > 0
      && captureTargets(board, piece).includes(o.rank * BOARD_SIZE + o.file),
  );
  if (taunter) target = taunter;

  if (target) {
    performAttack(log, ctx, piece, target, opponents, ultReady);
    return;
  }

  // ---- 没有可攻击目标：尝试王车易位 / 移动 ----
  const castle = shouldCastle(board, piece, opponents);
  if (castle) {
    const from = piece.rank * BOARD_SIZE + piece.file;
    const kingTo = castle.to;
    const rookFrom = castle.rookFrom;
    const rookTo = castle.rookTo;
    const rook = board[rookFrom];
    board[rookFrom] = null;
    board[kingTo] = null;
    board[rookTo] = rook;
    board[kingTo] = piece;
    rook.file = rookTo % BOARD_SIZE;
    rook.rank = Math.floor(rookTo / BOARD_SIZE);
    rook.hasMoved = true;
    piece.file = kingTo % BOARD_SIZE;
    piece.rank = Math.floor(kingTo / BOARD_SIZE);
    piece.hasMoved = true;
    log.advance(T_MOVE);
    log.push('move', {
      side: piece.side, id: piece.id, kind: 'castle',
      from: coord(from), to: coord(kingTo),
      rookFrom: coord(rookFrom), rookTo: coord(rookTo),
    });
    return;
  }

  // 吃过路兵也算一次攻击
  const ep = enPassantTarget(board, piece);
  if (ep !== null) {
    const victim = enPassantVictim(board, piece, ep);
    if (victim) {
      const from = piece.rank * BOARD_SIZE + piece.file;
      removePiece(board, victim.file, victim.rank);
      victim.hp = 0;
      victim.isAlive = false;
      board[ep] = piece;
      piece.file = ep % BOARD_SIZE;
      piece.rank = Math.floor(ep / BOARD_SIZE);
      piece.lastDoubleStep = false;
      log.advance(T_MOVE);
      log.push('move', { side: piece.side, id: piece.id, kind: 'en_passant', from: coord(from), to: coord(ep) });
      log.push('attack', {
        side: piece.side, id: piece.id, target: victim.id, targetName: victim.name,
        damage: 0, crit: false, combo: 0, rawDamage: 0, execute: true,
        hpBefore: victim.hp, hpAfter: 0, kill: true, kind: 'en_passant',
      });
      log.push('death', { side: victim.side, id: victim.id, name: victim.name });
      return;
    }
  }

  const dest = chooseDestination(board, piece, opponents);
  if (!dest) return;

  const from = piece.rank * BOARD_SIZE + piece.file;
  const to = dest.rank * BOARD_SIZE + dest.file;
  const wasDouble = piece.code === 'pawn' && Math.abs(dest.rank - piece.rank) === 2;
  movePiece(board, from, to);
  piece.file = dest.file;
  piece.rank = dest.rank;
  piece.hasMoved = true;
  piece.lastDoubleStep = wasDouble;

  log.advance(T_MOVE);
  log.push('move', { side: piece.side, id: piece.id, kind: 'normal', from: coord(from), to: coord(to) });

  // 升变
  if (isPromotion(piece, to)) {
    const template = TEMPLATE_BY_CODE[piece.code];
    const pick = choosePromotion(template, piece);
    if (pick) {
      promotePiece(piece, pick);
      log.push('promotion', { side: piece.side, id: piece.id, code: pick, name: piece.name, glyph: piece.glyph });
    }
  }

  // 走完可能刚好能打了 —— 立即结算一次攻击
  const after = chooseTarget(board, piece, opponents);
  if (after) performAttack(log, ctx, piece, after, opponents, ultReady);
}

/* -------------------------- 攻击 -------------------------- */

function performAttack(log, ctx, attacker, target, opponents, ultReady) {
  const { board, rng, allies, enemies } = ctx;

  const skill = ULT_SKILLS[attacker.code];
  const useUlt = ultReady && !!skill;
  if (useUlt) {
    log.advance(T_SKILL);
    log.push('skill', {
      side: attacker.side, id: attacker.id, name: skill.name, desc: skill.desc,
      mult: attacker.ultMult,
    });
    attacker.ultCooldown = Math.max(1, attacker.ultCd);
  }

  // 大招效果预处理
  let defenseIgnoreRatio = 0;
  let aoe = false;
  if (useUlt) {
    switch (attacker.code) {
      case 'pawn': {
        // 治疗全体友军 + 护盾
        const mine = attacker.side === SIDE_ALLY ? allies : enemies;
        for (const a of mine) {
          if (!a.isAlive) continue;
          const healed = healPiece(a, (attacker.recovery || 40) * 2);
          a.shield += Math.floor(a.maxHp * 0.10);
          log.push('heal', { side: a.side, id: a.id, amount: Math.round(healed), hpAfter: Math.round(a.hp), fromSkill: true });
        }
        break;
      }
      case 'bishop':
        defenseIgnoreRatio = 0.5;
        break;
      case 'rook':
        attacker.shield += Math.floor(attacker.maxHp * 0.25);
        attacker.reflectRatio = 0.30;
        attacker.tauntRounds = 2;
        break;
      case 'queen':
        aoe = true;
        break;
      case 'king':
        for (const a of (attacker.side === SIDE_ALLY ? allies : enemies)) {
          if (a.isAlive) a.damageReductionRounds = 3;
        }
        break;
      default:
        break;
    }
  }

  const targets = aoe ? opponents.filter((o) => o && o.isAlive) : [target];
  let anyKill = false;

  for (const t of targets) {
    if (!t || !t.isAlive) continue;
    const res = resolveAttack({
      attacker,
      defender: t,
      rng,
      ult: useUlt,
      defenseIgnoreRatio,
    });

    // 减伤光环（王之守护 / 敌方王之守护）
    const reduction = t.damageReductionRounds > 0 ? 0.10 : 0;
    let finalDamage = res.damage;
    if (reduction > 0) {
      const absorbed = Math.floor(finalDamage * reduction);
      finalDamage -= absorbed;
      t.hp = Math.min(t.hp + absorbed, t.maxHp);
    }

    // 铁卫反击
    if (t.reflectRatio > 0 && finalDamage > 0) {
      const reflect = Math.floor(finalDamage * t.reflectRatio);
      attacker.hp = Math.max(0, attacker.hp - reflect);
      log.push('attack', {
        side: t.side, id: t.id, name: t.name, target: attacker.id, targetName: attacker.name,
        damage: reflect, crit: false, combo: 0, rawDamage: reflect,
        hpBefore: attacker.hp + reflect, hpAfter: attacker.hp, reflect: true,
      });
    }

    if (res.dodged) {
      log.advance(T_HIT);
      log.push('attack', {
        side: attacker.side, id: attacker.id, name: attacker.name, target: t.id, targetName: t.name,
        damage: 0, crit: false, combo: 0, rawDamage: 0, dodged: true,
        hpBefore: t.hp, hpAfter: t.hp,
      });
      continue;
    }

    log.advance(T_HIT);
    log.push('attack', {
      side: attacker.side, id: attacker.id, target: t.id, targetName: t.name,
      damage: finalDamage,
      crit: res.crit,
      combo: res.combo,
      rawDamage: Math.round(res.rawDamage),
      shieldAbsorbed: res.shieldAbsorbed,
      brokeDefense: res.brokeDefense,
      execute: res.execute,
      ult: useUlt,
      hpBefore: Math.round(res.hpBefore),
      hpAfter: Math.round(t.hp),
      maxHp: t.maxHp,
      lifesteal: res.lifesteal,
    });

    if (res.execute) {
      log.push('execute', { side: t.side, id: t.id, name: t.name, killer: attacker.id });
    }

    if (t.hp <= 0) {
      t.isAlive = false;
      anyKill = true;
      removePiece(board, t.file, t.rank);
      log.push('death', { side: t.side, id: t.id, name: t.name });
      if (t.isKing) {
        log.push('checkmate', { side: t.side, id: t.id, name: t.name });
      }
    }
  }

  // 马的大招：追加一次攻击
  if (useUlt && attacker.code === 'knight' && !anyKill) {
    const second = chooseTarget(board, attacker, opponents);
    if (second) {
      const res = resolveAttack({ attacker, defender: second, rng, ult: false });
      log.push('attack', {
        side: attacker.side, id: attacker.id, target: second.id, targetName: second.name,
        damage: res.damage, crit: res.crit, combo: res.combo, rawDamage: Math.round(res.rawDamage),
        shieldAbsorbed: res.shieldAbsorbed, brokeDefense: res.brokeDefense, execute: res.execute,
        ult: false, secondStrike: true, hpBefore: Math.round(res.hpBefore), hpAfter: Math.round(second.hp),
        maxHp: second.maxHp,
      });
      if (second.hp <= 0) {
        second.isAlive = false;
        removePiece(board, second.file, second.rank);
        log.push('death', { side: second.side, id: second.id, name: second.name });
        if (second.isKing) log.push('checkmate', { side: second.side, id: second.id, name: second.name });
      }
    }
  }

  // 攻击移动过的兵要清掉吃过路兵标记
  attacker.lastDoubleStep = false;
}

/* -------------------------- 升变 -------------------------- */

function promotePiece(piece, code) {
  const t = TEMPLATE_BY_CODE[code];
  if (!t) return;
  piece.code = code;
  piece.glyph = t.glyph;
  piece.name = `${piece.name}·${t.name}`;
  piece.profession = t.profession;
  piece.isKing = false;
  piece.attack = Math.max(piece.attack, Math.floor(t.baseAttack * piece.level));
  piece.maxHp = Math.max(piece.maxHp, Math.floor(t.baseHp * piece.level));
  piece.hp = Math.min(piece.maxHp, piece.hp + Math.floor(t.baseHp * piece.level * 0.5));
  piece.speed = Math.max(piece.speed, t.baseSpeed);
  piece.critRate = Math.max(piece.critRate, t.baseCritRate);
  piece.critMult = Math.max(piece.critMult, t.baseCritMult);
  piece.ultMult = Math.max(piece.ultMult, t.baseUltMult);
}

/* -------------------------- 结束判定 -------------------------- */

function checkEnd(ctx) {
  const { allies, enemies } = ctx;
  const allyAlive = allies.some((p) => p.isAlive);
  const enemyAlive = enemies.some((p) => p.isAlive);
  if (!allyAlive || !enemyAlive) return true;
  const allyKing = allies.find((p) => p.isKing);
  const enemyKing = enemies.find((p) => p.isKing);
  if (allyKing && !allyKing.isAlive) return true;
  if (enemyKing && !enemyKing.isAlive) return true;
  return false;
}

function evaluateEnd(ctx) {
  const { allies, enemies } = ctx;
  const allyAlive = allies.filter((p) => p.isAlive);
  const enemyAlive = enemies.filter((p) => p.isAlive);

  const allyKing = allies.find((p) => p.isKing);
  const enemyKing = enemies.find((p) => p.isKing);

  if (enemyKing && !enemyKing.isAlive) return { result: 'win', reason: '将死：敌方王陨落' };
  if (allyKing && !allyKing.isAlive) return { result: 'lose', reason: '将死：我方王陨落' };
  if (enemyAlive.length === 0) return { result: 'win', reason: '敌方全灭' };
  if (allyAlive.length === 0) return { result: 'lose', reason: '我方全灭' };
  return { result: 'draw', reason: `回合耗尽（${MAX_ROUNDS} 回合）` };
}

/* -------------------------- 敌方阵容生成 -------------------------- */

/**
 * 按章节生成敌方阵容。
 * 敌方的等级、星级、装备、羁绊都会随章节成长（原版 bug ⑬：只缩放 HP/ATK）。
 *
 * @param {number} chapter
 * @param {number} playerRound
 * @param {import('./rng.js').Rng} rng
 * @returns {Array} 敌方棋子（带 file/rank 的战斗单位）
 */
export function generateEnemyRoster(chapter, playerRound, rng) {
  const cfg = chapterConfig(chapter, playerRound);
  const templates = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
  const pool = templates.map((code) => TEMPLATE_BY_CODE[code]);
  // 章节越高，王越容易出现
  const weights = pool.map((t) => {
    let w = t.code === 'king' ? 6 + chapter * 6 : t.code === 'queen' ? 12 + chapter * 2 : t.shopWeight;
    return { ...t, weight: w };
  });

  const chosen = [];
  for (let i = 0; i < cfg.count; i++) {
    const t = rng.pick(weights);
    chosen.push(t);
  }
  // 保证敌方有一个王（否则「将死」永远触发不了）
  if (!chosen.some((t) => t.code === 'king')) {
    chosen[chosen.length - 1] = TEMPLATE_BY_CODE.king;
  }

  const roster = chosen.map((t, i) => {
    const piece = createPiece(t, { level: cfg.level, star: cfg.star });
    piece.attack = Math.floor(piece.attack * cfg.atkScale);
    piece.maxHp = Math.floor(piece.maxHp * cfg.hpScale);
    piece.hp = piece.maxHp;
    piece.critRate = Math.min(0.85, piece.critRate + cfg.chapter * 0.01);
    piece.critMult = Math.min(10, piece.critMult + Math.floor(cfg.chapter / 2) * 0.5);
    piece.ultMult = Math.min(10, piece.ultMult + Math.floor(cfg.chapter / 2) * 0.5);
    piece.side = SIDE_ENEMY;
    piece.id = 900000 + i;
    piece.name = `${t.name}·敌方`;
    piece.glyph = t.glyph;
    // 敌方装备
    const gearPool = ['crit_claw', 'blood_fury', 'ward_gen', 'swift', 'armor_break', 'frost_core'];
    piece.items = [];
    for (let g = 0; g < cfg.gear && g < 3; g++) {
      piece.items.push(gearPool[rng.int(0, gearPool.length - 1)]);
    }
    // 布阵在敌方半场（散开一点，不要挤成一排）
    piece.file = (i * 3) % 8;
    piece.rank = Math.min(7, 4 + Math.floor(i / 3));
    return piece;
  });

  return roster;
}

function describePiece(p) {
  return {
    id: p.id,
    side: p.side,
    code: p.code,
    name: p.name,
    glyph: p.glyph,
    profession: p.profession,
    level: p.level,
    star: p.star,
    attack: p.attack,
    hp: Math.round(p.hp),
    maxHp: p.maxHp,
    speed: p.speed,
    critRate: p.critRate,
    critMult: p.critMult,
    defense: p.defense,
    dodge: p.dodge,
    isKing: !!p.isKing,
    file: p.file,
    rank: p.rank,
    ultCd: p.ultCd,
    ultMult: p.ultMult,
  };
}

export { describePiece };
