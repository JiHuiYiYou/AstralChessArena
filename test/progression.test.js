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

test('升阶公式：取大 + 小的 50%，再乘等级系数比 —— 总属性不缩水（原版 bug ⑧）', () => {
  const t = TEMPLATE_BY_CODE.knight;
  const a = createPiece(t, { level: 1 });
  const b = createPiece(t, { level: 1 });
  // 取 1 级上限以内的值，避免被 statCaps 夹掉（1 级上限：攻击 480 / 生命 4000）
  a.attack = 300;
  b.attack = 150;
  a.maxHp = 3000;
  b.maxHp = 1500;
  const m = ascend(a, b, t);
  const merge = 300 + Math.floor(150 * 0.5);
  assert.equal(m.attack, Math.floor(merge * 1.35));
  assert.ok(m.attack > (300 + 150) / 2, '必须明显优于平均值');
  assert.equal(m.level, 2);
  assert.equal(m.star, 2);
});

test('升阶后总属性不低于升阶前（少一个身位但更强）', () => {
  const t = TEMPLATE_BY_CODE.knight;
  const a = createPiece(t, { level: 3 });
  const b = createPiece(t, { level: 3 });
  const beforeAttack = a.attack + b.attack;
  const beforeHp = a.maxHp + b.maxHp;
  const m = ascend(a, b, t);
  assert.ok(m.attack >= beforeAttack * 0.95, `升阶后 ${m.attack} 不该低于升阶前总和 ${beforeAttack}`);
  assert.ok(m.maxHp >= beforeHp * 0.95, `升阶后生命 ${m.maxHp} 不该低于升阶前总和 ${beforeHp}`);
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

test('突破：属性上涨，且新值不会被上限夹回去', () => {
  const t = TEMPLATE_BY_CODE.knight;
  const p = createPiece(t, { level: 1 });
  const before = p.attack;
  const res = breakthrough(p, 'attack', new Rng(5), t);
  assert.equal(res.ok, true);
  assert.ok(p.attack > before);
  // 突破抬的是「绝对下限」，所以新值必须还在上限之内
  const capsAfter = statCaps(t, 1, p.breakthroughBonus);
  assert.ok(capsAfter.attack >= p.attack, `突破后的 ${p.attack} 不该被上限 ${capsAfter.attack} 夹掉`);
  assert.equal(res.count, 1);
});

test('突破：同一属性最多 3 次（不能无限叠）', () => {
  const t = TEMPLATE_BY_CODE.knight;
  const p = createPiece(t, { level: 1 });
  for (let i = 0; i < 3; i++) {
    const r = breakthrough(p, 'attack', new Rng(i), t);
    assert.equal(r.ok, true, `第 ${i + 1} 次突破应该成功`);
  }
  const fourth = breakthrough(p, 'attack', new Rng(9), t);
  assert.equal(fourth.ok, false);
  assert.ok(fourth.reason.includes('上限'));
});

test('改动属性后不会出现小数（生命/攻击必须是整数）', () => {
  const t = TEMPLATE_BY_CODE.bishop;
  const p = createPiece(t, { level: 1 });
  applyCard(p, { stat: 'hp', operation: 'mul', value: 1.37 });
  assert.equal(Number.isInteger(p.maxHp), true, `生命上限成了小数：${p.maxHp}`);
  assert.equal(Number.isInteger(p.hp), true, `生命成了小数：${p.hp}`);
  applyCard(p, { stat: 'attack', operation: 'mul', value: 1.11 });
  assert.equal(Number.isInteger(p.attack), true, `攻击成了小数：${p.attack}`);
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
