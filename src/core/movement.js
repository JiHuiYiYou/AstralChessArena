/**
 * movement.js —— 六种国际象棋棋子的走法。
 *
 * 全部走法只依赖棋盘状态与棋子自身字段，是纯函数，可以直接单测。
 *
 * 棋子字段约定：
 *   code      'pawn'|'knight'|'bishop'|'rook'|'queen'|'king'
 *   side      'ally'|'enemy'
 *   file, rank 当前所在格
 *   hasMoved  是否动过（王车易位用）
 *   lastDoubleStep  上一回合是否走了两格（吃过路兵用）
 */

import { BOARD_SIZE, SIDE_ALLY, forwardDelta, inBounds, pieceAt, sq } from './board.js';

/** 马的 8 个偏移 */
const KNIGHT_OFFSETS = [
  [1, 2], [2, 1], [2, -1], [1, -2],
  [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];

/** 象/后 的斜线方向 */
const DIAGONALS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
/** 车/后 的直线方向 */
const ORTHOGONALS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** 王的 8 个方向 */
const KING_OFFSETS = [...DIAGONALS, ...ORTHOGONALS];

/** 兵的起始行 */
const PAWN_START_RANK = { ally: 1, enemy: 6 };
/** 兵的升变行（走到这一行就升变） */
const PAWN_PROMOTION_RANK = { ally: 7, enemy: 0 };

/**
 * 棋子可以「移动到」（不含吃子）的目标格。
 * @returns {number[]} 棋盘索引数组
 */
export function moveTargets(board, piece) {
  switch (piece.code) {
    case 'pawn': return pawnMoves(board, piece);
    case 'knight': return knightMoves(board, piece);
    case 'bishop': return slide(board, piece, DIAGONALS);
    case 'rook': return slide(board, piece, ORTHOGONALS);
    case 'queen': return slide(board, piece, [...DIAGONALS, ...ORTHOGONALS]);
    case 'king': return kingMoves(board, piece);
    default: return [];
  }
}

/**
 * 棋子可以「攻击到」的格（含普通吃子，不含吃过路兵）。
 */
export function captureTargets(board, piece) {
  switch (piece.code) {
    case 'pawn': return pawnCaptures(board, piece);
    case 'knight': return knightMoves(board, piece, true);
    case 'bishop': return slide(board, piece, DIAGONALS, true);
    case 'rook': return slide(board, piece, ORTHOGONALS, true);
    case 'queen': return slide(board, piece, [...DIAGONALS, ...ORTHOGONALS], true);
    case 'king': return kingMoves(board, piece, true);
    default: return [];
  }
}

/* ------------------------------------------------------------------ *
 * 各棋子的具体走法
 * ------------------------------------------------------------------ */

function pawnMoves(board, piece) {
  const delta = forwardDelta(piece.side);
  const out = [];
  const one = piece.rank + delta;
  if (inBounds(piece.file, one) && !pieceAt(board, piece.file, one)) {
    out.push(sq(piece.file, one));
    const startRank = PAWN_START_RANK[piece.side];
    const two = piece.rank + delta * 2;
    if (piece.rank === startRank && inBounds(piece.file, two) && !pieceAt(board, piece.file, two)) {
      out.push(sq(piece.file, two));
    }
  }
  return out;
}

function pawnCaptures(board, piece) {
  const delta = forwardDelta(piece.side);
  const out = [];
  for (const df of [-1, 1]) {
    const f = piece.file + df;
    const r = piece.rank + delta;
    if (!inBounds(f, r)) continue;
    const target = pieceAt(board, f, r);
    if (target && target.side !== piece.side) out.push(sq(f, r));
  }
  return out;
}

function knightMoves(board, piece, captureOnly = false) {
  const out = [];
  for (const [df, dr] of KNIGHT_OFFSETS) {
    const f = piece.file + df;
    const r = piece.rank + dr;
    if (!inBounds(f, r)) continue;
    const target = pieceAt(board, f, r);
    if (captureOnly) {
      if (target && target.side !== piece.side) out.push(sq(f, r));
    } else {
      if (!target && !isKnightLegBlocked(board, piece, df, dr)) out.push(sq(f, r));
    }
  }
  return out;
}

/**
 * 蹩马腿：马走「日」字时，两个拐角里任意一个被占就不能跳。
 * 走 (df, dr) 时，两个可能的拐角是 (file+sign(df), rank) 与 (file, rank+sign(dr))。
 */
function isKnightLegBlocked(board, piece, df, dr) {
  const legA = piece.file + Math.sign(df);
  const legB = piece.rank + Math.sign(dr);
  if (inBounds(legA, piece.rank) && pieceAt(board, legA, piece.rank)) return true;
  if (inBounds(piece.file, legB) && pieceAt(board, piece.file, legB)) return true;
  return false;
}

/**
 * 滑行类走法（象/车/后）。
 * @param {boolean} captureOnly 只取可吃的格
 */
function slide(board, piece, directions, captureOnly = false) {
  const out = [];
  for (const [df, dr] of directions) {
    let f = piece.file + df;
    let r = piece.rank + dr;
    while (inBounds(f, r)) {
      const target = pieceAt(board, f, r);
      if (!target) {
        // 空格：移动目标可以落这里
        if (!captureOnly) out.push(sq(f, r));
      } else {
        // 有子：只有「吃子模式」才把敌方棋子所在格算作目标，且不能穿过去
        if (captureOnly && target.side !== piece.side) out.push(sq(f, r));
        break;
      }
      f += df;
      r += dr;
    }
  }
  return out;
}

function kingMoves(board, piece, captureOnly = false) {
  const out = [];
  for (const [df, dr] of KING_OFFSETS) {
    const f = piece.file + df;
    const r = piece.rank + dr;
    if (!inBounds(f, r)) continue;
    const target = pieceAt(board, f, r);
    if (captureOnly) {
      if (target && target.side !== piece.side) out.push(sq(f, r));
    } else {
      if (!target) out.push(sq(f, r));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 特殊规则
 * ------------------------------------------------------------------ */

/** 全部可落脚点（移动 ∪ 吃子 ∪ 吃过路兵 ∪ 王车易位） */
export function allTargets(board, piece) {
  const set = new Set([...moveTargets(board, piece), ...captureTargets(board, piece)]);
  const ep = enPassantTarget(board, piece);
  if (ep !== null) set.add(ep);
  for (const m of castlingMoves(board, piece)) set.add(m.to);
  return [...set];
}

/** 兵走到升变行？ */
export function isPromotion(piece, toIndex) {
  if (piece.code !== 'pawn') return false;
  const rank = Math.floor(toIndex / BOARD_SIZE);
  return rank === PAWN_PROMOTION_RANK[piece.side];
}

/** 兵升变可以变成什么（按模板的 promote_to 列表） */
export function promotionOptions(piece, template) {
  return (template?.promoteTo ?? []).slice();
}

/**
 * 吃过路兵的目标格。
 *
 * 规则（0 基行号）：
 *   白兵在第 5 行（rank 4），黑兵刚从第 7 行（rank 6）两格走到第 5 行（rank 4）
 *   → 白兵可以斜跳到第 6 行（rank 5）吃掉那个黑兵。
 *   黑兵对称。
 *
 * @returns {number|null} 吃子落点的棋盘索引
 */
export function enPassantTarget(board, piece) {
  if (piece.code !== 'pawn') return null;
  const enemy = piece.side === SIDE_ALLY ? 'enemy' : 'ally';
  const victimRank = piece.side === SIDE_ALLY ? 4 : 3; // 敌兵所在的行
  const destRank = piece.side === SIDE_ALLY ? 5 : 2;    // 吃子落点所在的行
  if (piece.rank !== victimRank) return null;
  for (const df of [-1, 1]) {
    const f = piece.file + df;
    if (!inBounds(f, victimRank)) continue;
    const adjacent = pieceAt(board, f, victimRank);
    if (!adjacent || adjacent.side !== enemy) continue;
    if (adjacent.code !== 'pawn') continue;
    if (!adjacent.lastDoubleStep) continue;
    return sq(f, destRank);
  }
  return null;
}

/** 吃过路兵吃掉的其实是相邻那个敌兵（不是落点上的） */
export function enPassantVictim(board, piece, toIndex) {
  if (enPassantTarget(board, piece) !== toIndex) return null;
  const victimRank = piece.side === SIDE_ALLY ? 4 : 3;
  const f = toIndex % BOARD_SIZE;
  return pieceAt(board, f, victimRank);
}

/**
 * 王车易位。
 * @returns {Array<{to:number, rookFrom:number, rookTo:number}>}
 */
export function castlingMoves(board, piece) {
  if (piece.code !== 'king' || piece.hasMoved) return [];
  const homeRank = piece.side === SIDE_ALLY ? 0 : 7;
  if (piece.rank !== homeRank || piece.file !== 4) return [];
  // 王不能正被攻击
  if (isSquareAttacked(board, piece.file, piece.rank, opponentOf(piece.side))) return [];

  const out = [];
  // 右侧（h 文件）
  const rookRight = pieceAt(board, 7, homeRank);
  if (rookRight && rookRight.side === piece.side && rookRight.code === 'rook' && !rookRight.hasMoved) {
    if (!pieceAt(board, 5, homeRank) && !pieceAt(board, 6, homeRank)) {
      if (!isSquareAttacked(board, 5, homeRank, opponentOf(piece.side))
        && !isSquareAttacked(board, 6, homeRank, opponentOf(piece.side))) {
        out.push({ to: sq(6, homeRank), rookFrom: sq(7, homeRank), rookTo: sq(5, homeRank) });
      }
    }
  }
  // 左侧（a 文件）
  const rookLeft = pieceAt(board, 0, homeRank);
  if (rookLeft && rookLeft.side === piece.side && rookLeft.code === 'rook' && !rookLeft.hasMoved) {
    if (!pieceAt(board, 1, homeRank) && !pieceAt(board, 2, homeRank) && !pieceAt(board, 3, homeRank)) {
      if (!isSquareAttacked(board, 3, homeRank, opponentOf(piece.side))
        && !isSquareAttacked(board, 2, homeRank, opponentOf(piece.side))) {
        out.push({ to: sq(2, homeRank), rookFrom: sq(0, homeRank), rookTo: sq(3, homeRank) });
      }
    }
  }
  return out;
}

/**
 * 某格是否被某方攻击。
 * 做法：遍历该方每一个棋子，看它的攻击范围里有没有这一格。
 */
export function isSquareAttacked(board, file, rank, bySide) {
  const target = sq(file, rank);
  for (const p of board) {
    if (!p || p.side !== bySide) continue;
    if (captureTargets(board, p).includes(target)) return true;
  }
  return false;
}

/** 对手阵营 */
export function opponentOf(side) {
  return side === SIDE_ALLY ? 'enemy' : 'ally';
}
