/**
 * test/movement.test.js —— 棋子走法用例。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBoard, placePiece, sq } from '../src/core/board.js';
import {
  allTargets,
  captureTargets,
  enPassantTarget,
  enPassantVictim,
  isPromotion,
  moveTargets,
} from '../src/core/movement.js';

function piece(code, side, file, rank, extra = {}) {
  return {
    id: Math.floor(Math.random() * 1e9),
    code,
    side,
    file,
    rank,
    hasMoved: true,
    lastDoubleStep: false,
    ...extra,
  };
}

/** 在空棋盘上放一个棋子，返回 { board, p } */
function scene(code, side, file, rank, extra = {}) {
  const board = createBoard();
  const p = piece(code, side, file, rank, extra);
  placePiece(board, file, rank, p);
  return { board, p };
}

test('马：日字 8 格', () => {
  const { board, p } = scene('knight', 'ally', 3, 3);
  const targets = moveTargets(board, p).map((i) => [i % 8, Math.floor(i / 8)]);
  assert.equal(targets.length, 8);
  // (3,3) 的 8 个马步
  assert.ok(targets.some(([f, r]) => f === 4 && r === 5));
  assert.ok(targets.some(([f, r]) => f === 5 && r === 4));
  assert.ok(targets.some(([f, r]) => f === 1 && r === 2));
  assert.ok(targets.some(([f, r]) => f === 2 && r === 1));
  assert.ok(!targets.some(([f, r]) => f === 5 && r === 5), '对角线不是马步');
});

test('马：蹩马腿 —— 拐角被占就不能跳', () => {
  const { board, p } = scene('knight', 'ally', 3, 3);
  placePiece(board, 3, 4, piece('pawn', 'ally', 3, 4)); // 正好堵在「上」向四个马步的拐角
  const targets = moveTargets(board, p).map((i) => [i % 8, Math.floor(i / 8)]);
  for (const [f, r] of [[4, 5], [2, 5], [5, 4], [1, 4]]) {
    assert.ok(!targets.some(([tf, tr]) => tf === f && tr === r), `(${f},${r}) 应当被蹩住`);
  }
  // 向下不受影响
  assert.equal(targets.length, 4);
});

test('马：拐角被占时，斜后方向也不该被误伤', () => {
  const { board, p } = scene('knight', 'ally', 3, 3);
  placePiece(board, 3, 4, piece('pawn', 'ally', 3, 4));
  const targets = moveTargets(board, p).map((i) => [i % 8, Math.floor(i / 8)]);
  assert.ok(targets.some(([f, r]) => f === 5 && r === 2));
  assert.ok(targets.some(([f, r]) => f === 1 && r === 2));
});

test('车：横竖直线，路径被挡就停', () => {
  const { board, p } = scene('rook', 'ally', 0, 0);
  placePiece(board, 0, 3, piece('pawn', 'enemy', 0, 3));
  const targets = moveTargets(board, p).map((i) => [i % 8, Math.floor(i / 8)]);
  assert.ok(targets.some(([f, r]) => f === 0 && r === 2));
  assert.ok(!targets.some(([f, r]) => f === 0 && r === 3), '被挡住的格子不能作为落点');
  assert.ok(!targets.some(([f, r]) => f === 0 && r === 4), '不能穿过阻挡');
  // 阻挡格本身是可吃的
  const caps = captureTargets(board, p).map((i) => [i % 8, Math.floor(i / 8)]);
  assert.ok(caps.some(([f, r]) => f === 0 && r === 3));
});

test('主教：斜线，遇到阻挡停下', () => {
  const { board, p } = scene('bishop', 'ally', 0, 0);
  const targets = moveTargets(board, p).map((i) => [i % 8, Math.floor(i / 8)]);
  assert.equal(targets.length, 7);
  assert.ok(targets.some(([f, r]) => f === 3 && r === 3));
});

test('后：八方向', () => {
  const { board, p } = scene('queen', 'ally', 3, 3);
  const targets = moveTargets(board, p);
  assert.equal(targets.length, 27);
});

test('王：周围 8 格', () => {
  const { board, p } = scene('king', 'ally', 3, 3);
  const targets = moveTargets(board, p);
  assert.equal(targets.length, 8);
});

test('兵：前进 1 格，首动可 2 格', () => {
  const { board, p } = scene('pawn', 'ally', 3, 1, { hasMoved: false });
  const targets = moveTargets(board, p).map((i) => [i % 8, Math.floor(i / 8)]);
  assert.ok(targets.some(([f, r]) => f === 3 && r === 2));
  assert.ok(targets.some(([f, r]) => f === 3 && r === 3), '起始行应该能走两格');

  const moved = scene('pawn', 'ally', 3, 2);
  const t2 = moveTargets(moved.board, moved.p).map((i) => [i % 8, Math.floor(i / 8)]);
  assert.ok(!t2.some(([f, r]) => f === 3 && r === 4), '不是起始行不能走两格');
});

test('兵：只能斜前吃子', () => {
  const { board, p } = scene('pawn', 'ally', 3, 3);
  placePiece(board, 4, 4, piece('pawn', 'enemy', 4, 4));
  const caps = captureTargets(board, p).map((i) => [i % 8, Math.floor(i / 8)]);
  assert.equal(caps.length, 1);
  assert.deepEqual(caps[0], [4, 4]);
});

test('兵：到底线触发升变', () => {
  const p = piece('pawn', 'ally', 3, 6);
  assert.equal(isPromotion(p, sq(3, 7)), true);
  assert.equal(isPromotion(p, sq(3, 5)), false);
  const enemy = piece('pawn', 'enemy', 3, 1);
  assert.equal(isPromotion(enemy, sq(3, 0)), true);
});

test('吃过路兵：敌兵刚走两格时可斜吃', () => {
  const board = createBoard();
  // 白兵在第 5 行（0 基 rank 4），黑兵刚从 rank 6 两格走到 rank 4
  const p = piece('pawn', 'ally', 3, 4);
  placePiece(board, 3, 4, p);
  const victim = piece('pawn', 'enemy', 4, 4, { lastDoubleStep: true });
  placePiece(board, 4, 4, victim);
  // 吃子落点在 rank 5，而不是敌人所在的 rank 4
  assert.equal(enPassantTarget(board, p), sq(4, 5));

  // 标记失效后就不能吃了
  victim.lastDoubleStep = false;
  assert.equal(enPassantTarget(board, p), null);
});

test('吃过路兵：被吃的是相邻那个敌兵，不是落点上的', () => {
  const board = createBoard();
  const p = piece('pawn', 'ally', 3, 4);
  placePiece(board, 3, 4, p);
  const victim = piece('pawn', 'enemy', 4, 4, { lastDoubleStep: true });
  placePiece(board, 4, 4, victim);
  const target = enPassantTarget(board, p);
  const eaten = enPassantVictim(board, p, target);
  assert.equal(eaten, victim);
  assert.equal(eaten.rank, 4);
});

test('allTargets 合并移动与攻击范围', () => {
  const { board, p } = scene('knight', 'ally', 3, 3);
  placePiece(board, 5, 4, piece('pawn', 'enemy', 5, 4));
  const all = allTargets(board, p);
  assert.ok(all.includes(sq(5, 4)), '可吃的格子也要包含进来');
  assert.ok(all.length >= 8);
});

test('棋子不能落在有子的格子上', () => {
  const { board, p } = scene('rook', 'ally', 0, 0);
  placePiece(board, 0, 1, piece('pawn', 'ally', 0, 1));
  const targets = moveTargets(board, p).map((i) => [i % 8, Math.floor(i / 8)]);
  assert.ok(!targets.some(([f, r]) => f === 0 && r === 1), '己方棋子不能被吃掉');
});
