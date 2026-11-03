/**
 * ai.js —— 目标选择与走位评分。
 *
 * 原版的「AI」只有一个 70/30 的随机分支（bug ⑬：敌方是纯木桩）。
 * 这里给双方都用同一套评分函数，敌方会：
 *   - 优先击杀残血目标
 *   - 优先攻击己方王（形成「将军」）
 *   - 优先走位到能攻击到敌人的格子
 *   - 尽量避开敌方下一步能打到自己的格子（尤其是王）
 */

import { captureTargets, moveTargets, enPassantTarget, castlingMoves, opponentOf } from './movement.js';
import { expectedDamage } from './combat.js';

/** 棋盘上某个坐标是否被某方攻击 */
function attackedBy(board, index, bySide) {
  for (const p of board) {
    if (!p || p.side !== bySide) continue;
    if (captureTargets(board, p).includes(index)) return true;
  }
  return false;
}

/** 把棋子「假设」放到某个格子时的攻击范围 */
function attacksFrom(board, piece, file, rank) {
  const probe = { ...piece, file, rank };
  const idx = rank * 8 + file;
  const shadow = board.slice();
  const old = shadow[idx];
  shadow[idx] = probe;
  const list = captureTargets(shadow, probe);
  if (old) shadow[idx] = old;
  return list;
}

/** 切比雪夫距离（棋盘上 8 邻接的图距离） */
function chebyshev(a, b) {
  return Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank));
}

/**
 * 给一个目标打分（越高越优先打）。
 */
export function scoreTarget(attacker, target) {
  if (!target || target.hp <= 0) return -Infinity;

  let score = 0;

  // 能直接斩杀 → 最高优先
  const expected = expectedDamage(attacker.attack, attacker.critRate, attacker.critMult) * (attacker.ultMult ?? 1);
  if (expected >= target.hp) score += 900;

  // 残血优先
  score += ((target.maxHp - target.hp) / Math.max(1, target.maxHp)) * 500;

  // 对方王 → 生成「将军」
  if (target.isKing) score += 1200;

  // 威胁度：战力越高越值得先杀
  score += Math.min(400, target.attack * 0.5 + target.maxHp * 0.05);

  // 治疗单位优先（断奶）
  if ((target.recovery ?? 0) > 0) score += 120;

  // 距离越远越不优先
  score -= chebyshev(attacker, target) * 12;

  return score;
}

/**
 * 选出本回合要攻击的目标。
 * @param {Array} board
 * @param {object} piece
 * @returns {object|null}
 */
export function chooseTarget(board, piece, opponents) {
  const reach = captureTargets(board, piece);
  const candidates = [];
  for (const opp of opponents) {
    if (!opp || opp.hp <= 0) continue;
    const idx = opp.rank * 8 + opp.file;
    if (!reach.includes(idx)) continue;
    candidates.push(opp);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => scoreTarget(piece, b) - scoreTarget(piece, a));
  return candidates[0];
}

/**
 * 给一个候选落点打分。
 */
function scoreDestination(board, piece, dest, opponents) {
  const [file, rank] = dest;
  const idx = rank * 8 + file;
  const enemySide = opponentOf(piece.side);

  let score = 0;

  // 从这里能打到谁？
  const reach = attacksFrom(board, piece, file, rank);
  let canHit = 0;
  let canKill = 0;
  let hitKing = 0;
  for (const opp of opponents) {
    if (!opp || opp.hp <= 0) continue;
    if (!reach.includes(opp.rank * 8 + opp.file)) continue;
    canHit++;
    const expected = expectedDamage(piece.attack, piece.critRate, piece.critMult) * (piece.ultMult ?? 1);
    if (expected >= opp.hp) canKill++;
    if (opp.isKing) hitKing++;
  }
  score += canHit * 260 + canKill * 420 + hitKing * 500;

  // 离最近的敌人还有多远（打不到时更想靠近）
  let minDist = Infinity;
  for (const opp of opponents) {
    if (!opp || opp.hp <= 0) continue;
    minDist = Math.min(minDist, chebyshev({ file, rank }, opp));
  }
  if (minDist !== Infinity) score -= minDist * 55;

  // 危险度：这一格会不会被敌方下回合打到
  const danger = attackedBy(board, idx, enemySide);
  if (danger) {
    score -= piece.isKing ? 320 : 90;
  }

  // 血量低的时候更惜命
  if (piece.hp / Math.max(1, piece.maxHp) < 0.3 && danger) score -= 200;

  // 前压一点更主动
  const dir = piece.side === 'ally' ? 1 : -1;
  score += (rank - piece.rank) * dir * 12;

  return score;
}

/**
 * 选出本回合的落点。
 * @returns {{file:number, rank:number}|null}
 */
export function chooseDestination(board, piece, opponents) {
  const dests = moveTargets(board, piece);
  if (dests.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const idx of dests) {
    const file = idx % 8;
    const rank = Math.floor(idx / 8);
    const s = scoreDestination(board, piece, [file, rank], opponents);
    if (s > bestScore) {
      bestScore = s;
      best = { file, rank };
    }
  }
  return best;
}

/**
 * 是否值得王车易位。
 */
export function shouldCastle(board, piece, opponents) {
  const moves = castlingMoves(board, piece);
  if (moves.length === 0) return null;
  // 附近有敌人就别易位了
  const near = opponents.some((o) => o && o.hp > 0 && chebyshev(piece, o) <= 3);
  if (near) return null;
  return moves[0];
}

/**
 * 兵升变选哪个（按职业倾向与实用度打分）。
 */
export function choosePromotion(template, piece) {
  const options = template?.promoteTo ?? [];
  if (options.length === 0) return null;
  // 后 > 车 > 主教 > 马 的实用度排序（王不给兵升变）
  const pref = { queen: 5, rook: 4, bishop: 3, knight: 2 };
  return [...options].sort((a, b) => (pref[b] ?? 0) - (pref[a] ?? 0))[0];
}

export { enPassantTarget };
