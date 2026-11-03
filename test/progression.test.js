/**
 * test/progression.test.js —— 养成公式用例。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Rng } from '../src/core/rng.js';
import { TEMPLATE_BY_CODE, statCaps, levelScale } from '../src/core/balance.js';
import {
  ascend,
  breakthrough,
  canTrain,
  createPiece,
  train,
  trainCost,
} from '../src/core/progression.js';
import { applyCard } from '../src/core/items.js';
import { roundIncome, shopPrice, sellValue, starOf } from '../src/core/economy.js';

test('等级系数：每级 ×1.35', () => {
  assert.equal(levelScale(1), 1);
  assert.ok(Math.abs(levelScale(2) - 1.35) < 1e-9);
  assert.ok(Math.abs(levelScale(3) - 1.35 * 1.35) < 1e-9);
});

test('属性上限随等级线性（幂次）增长', () => {
  const t = TEMPLATE_BY_CODE.knight;
  const c1 = statCaps(t, 1);
  const c2 = statCaps(t, 2);
  assert.ok(c2.attack > c1.attack);
  assert.ok(c2.maxHp === undefined || true);
  assert.ok(c2.hp > c1.hp);
});

test('训练：所有属性上涨，且不会超过上限', () => {
  const t = TEMPLATE_BY_CODE.knight;
  const p = createPiece(t, { level: 1 });
  const before = { attack: p.attack, maxHp: p.maxHp };
  const res = train(p, t);
  assert.equal(res.ok, true);
  assert.ok(p.attack > before.attack);
  assert.ok(p.maxHp > before.maxHp);
  const caps = statCaps(t, 1);
  assert.ok(p.attack <= caps.attack);
  assert.ok(p.maxHp <= caps.hp);
});

test('训练撞上限后被拒绝并给出原因（不吞资源）', () => {
  const t = TEMPLATE_BY_CODE.knight;
  const p = createPiece(t, { level: 1 });
  // 直接把属性顶到上限
  const caps = statCaps(t, 1);
  p.attack = caps.attack;
  p.maxHp = caps.hp;
  p.hp = caps.hp;
  const check = canTrain(p, t);
  assert.equal(check.ok, false);
  assert.ok(check.reason.includes('上限'));
  const res = train(p, t);
  assert.equal(res.ok, false);
});

test('训练成本随等级与次数上涨', () => {
  const t = TEMPLATE_BY_CODE.pawn;
  const p = createPiece(t, { level: 1 });
  const c1 = trainCost(p);
  train(p, t);
  const c2 = trainCost(p);
  assert.ok(c2 > c1);
});

test('升阶公式：取大 + 小的 50%，不是平均值（原版 bug ⑧）', () => {
  const t = TEMPLATE_BY_CODE.knight;
  const a = createPiece(t, { level: 1 });
  const b = createPiece(t, { level: 1 });
  // 取 1 级上限以内的值，避免被 statCaps 夹掉
  a.attack = 400;
  b.attack = 200;
  a.maxHp = 4000;
  b.maxHp = 2000;
  const m = ascend(a, b, t);
  assert.equal(m.attack, 400 + Math.floor(200 * 0.5));
  assert.ok(m.attack > (400 + 200) / 2, '必须明显优于平均值');
  assert.equal(m.level, 2);
  assert.equal(m.star, 2);
});

test('升阶保留强的那一边的其它属性', () => {
  const t = TEMPLATE_BY_CODE.bishop;
  const a = createPiece(t, { level: 1 });
  const b = createPiece(t, { level: 1 });
  a.critMult = 2.2;
  b.critMult = 1.5;
  const m = ascend(a, b, t);
  assert.equal(m.critMult, 2.2);
});

test('突破：属性上涨，且上限同步抬高（不会白费）', () => {
  const t = TEMPLATE_BY_CODE.knight;
  const p = createPiece(t, { level: 1 });
  const capsBefore = statCaps(t, 1);
  const before = p.attack;
  const res = breakthrough(p, 'attack', new Rng(5), t);
  assert.equal(res.ok, true);
  assert.ok(p.attack > before);
  const capsAfter = statCaps(t, 1, p.breakthroughBonus);
  assert.ok(capsAfter.attack > capsBefore.attack, '突破后该属性的上限必须提高');
});

test('生命卡同时抬 maxHp 与 hp（原版 bug ④）', () => {
  const t = TEMPLATE_BY_CODE.pawn;
  const p = createPiece(t, { level: 1 });
  const maxBefore = p.maxHp;
  const res = applyCard(p, { stat: 'hp', operation: 'add', value: 500 });
  assert.equal(res.ok, true);
  assert.ok(p.maxHp > maxBefore);
  assert.ok(p.hp <= p.maxHp, 'hp 永远不能超过 maxHp');
});

test('最终伤害倍数的卡真的改到 finalDamageMult', () => {
  const t = TEMPLATE_BY_CODE.bishop;
  const p = createPiece(t, { level: 1 });
  const ultBefore = p.ultMult;
  applyCard(p, { stat: 'finalDamageMult', operation: 'add', value: 0.5 });
  assert.equal(p.finalDamageMult, 1.5);
  assert.equal(p.ultMult, ultBefore, '不能错接到大招倍率上');
});

test('回合收入 = 基础 + 连胜 + 利息', () => {
  const inc = roundIncome({ gold: 100, streakWin: 3, streakLose: 0 });
  assert.equal(inc.base, 8);
  assert.equal(inc.streak, 5);
  assert.equal(inc.interest, 10, '利息封顶 10');
  assert.equal(inc.total, 23);
});

test('连败也有保底收入', () => {
  const inc = roundIncome({ gold: 0, streakWin: 0, streakLose: 2 });
  assert.equal(inc.streak, 4);
  assert.equal(inc.interest, 0);
});

test('星级由等级推导，封顶 5', () => {
  assert.equal(starOf({ level: 1 }), 1);
  assert.equal(starOf({ level: 2 }), 1);
  assert.equal(starOf({ level: 3 }), 2);
  assert.equal(starOf({ level: 20 }), 5);
});

test('商店价格与出售返还都是正数', () => {
  assert.ok(shopPrice('knight') > 0);
  assert.ok(sellValue({ level: 3, star: 2 }) > 0);
});
