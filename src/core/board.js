/**
 * board.js —— 8×8 棋盘。
 *
 * 坐标：`file` 0-7 对应 a-h，`rank` 0-7 对应 1-8。
 * 己方部署区 rank 0-3，敌方部署区 rank 4-7。
 * 棋盘用扁平数组存，长度 64，索引 = rank * 8 + file。
 */

export const BOARD_SIZE = 8;
export const SQUARE_COUNT = BOARD_SIZE * BOARD_SIZE;

/** 己方（玩家）阵营 */
export const SIDE_ALLY = 'ally';
/** 敌方阵营 */
export const SIDE_ENEMY = 'enemy';

/** 格坐标 → 棋盘索引 */
export function sq(file, rank) {
  return rank * BOARD_SIZE + file;
}

/** 棋盘索引 → { file, rank } */
export function coord(index) {
  return { file: index % BOARD_SIZE, rank: Math.floor(index / BOARD_SIZE) };
}

/** 坐标是否在棋盘内 */
export function inBounds(file, rank) {
  return file >= 0 && file < BOARD_SIZE && rank >= 0 && rank < BOARD_SIZE;
}

/** 创建空棋盘：64 个 null */
export function createBoard() {
  return new Array(SQUARE_COUNT).fill(null);
}

/**
 * 取某个格上的棋子。
 * @param {Array} board
 * @param {number} file
 * @param {number} rank
 */
export function pieceAt(board, file, rank) {
  if (!inBounds(file, rank)) return null;
  return board[sq(file, rank)];
}

/**
 * 放置棋子。返回是否成功（格子必须为空）。
 */
export function placePiece(board, file, rank, piece) {
  if (!inBounds(file, rank)) return false;
  const i = sq(file, rank);
  if (board[i]) return false;
  board[i] = piece;
  return true;
}

/** 移除棋子 */
export function removePiece(board, file, rank) {
  const i = sq(file, rank);
  const p = board[i];
  board[i] = null;
  return p;
}

/** 移动棋子（不做合法性判断，合法性由 movement.js 保证） */
export function movePiece(board, from, to) {
  const p = board[from];
  board[from] = null;
  board[to] = p;
  return p;
}

/** 某个阵营的部署区 rank 范围 */
export function deployRanks(side) {
  return side === SIDE_ALLY ? [0, 1, 2, 3] : [4, 5, 6, 7];
}

/** 阵营的「前进方向」：己方向 rank 增大 */
export function forwardDelta(side) {
  return side === SIDE_ALLY ? 1 : -1;
}
