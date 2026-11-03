/**
 * test/combat.test.js —— 伤害结算的数值用例。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Rng } from '../src/core/rng.js';
import { resolveAttack, expectedDamage, healPiece, powerOf } from '../src/core/combat.js';
import { BREAKTHROUGH_STATS } from '../src/core/balance.js';

/** 造一个可控的战斗态棋子 */
function fighter(over = {}) {
  return {
    id: 1,
    side: 'ally',
    attack: 100,
    hp: 1000,
    maxHp: 1000,
    shield: 0,
    critRate: 0,
    critMult: 1,
    dodge: 0,
    defense: 0,
    recovery: 0,
    finalDamageMult: 1,
    ultMult: 1,
    ultCd: 3,
    speed: 5,
    isKing: false,
    breakMeter: 0,
    defenseBrokenRounds: 0,
    ...over,
  };
}

test('普攻：伤害等于攻击力', () => {
  const a = fighter();
  const d = fighter({ attack: 0 });
  const r = resolveAttack({ attacker: a, defender: d, rng: new Rng(1) });
  assert.equal(r.damage, 100);
  assert.equal(d.hp, 900);
  assert.equal(r.crit, false);
});

test('防御：伤害按 (1 - defense) 折算', () => {
  const a = fighter({ attack: 100 });
  const d = fighter({ defense: 0.25 });
  const r = resolveAttack({ attacker: a, defender: d, rng: new Rng(1) });
  assert.equal(r.damage, 75);
});

test('闪避：整条链一起判定，被闪避时**不产生**暴击数字', () => {
  const a = fighter({ attack: 100, critRate: 1, critMult: 5 });
  const d = fighter({ dodge: 1 });
  const r = resolveAttack({ attacker: a, defender: d, rng: new Rng(1) });
  assert.equal(r.dodged, true);
  assert.equal(r.damage, 0);
  assert.equal(r.crit, false, '被闪避时不应该标记为暴击（原版 bug ⑤）');
  assert.equal(d.hp, 1000);
});

test('最终伤害倍率真的生效（原版 bug ①：它被错接到大招倍率上）', () => {
  const a = fighter({ attack: 100, finalDamageMult: 2.5 });
  const d = fighter();
  const r = resolveAttack({ attacker: a, defender: d, rng: new Rng(1) });
  assert.equal(r.damage, 250);
});

test('大招倍率叠乘在连击总和上', () => {
  const a = fighter({ attack: 100, ultMult: 3 });
  const d = fighter();
  const r = resolveAttack({ attacker: a, defender: d, rng: new Rng(1), ult: true });
  assert.equal(r.damage, 300);
});

test('护盾先吸收，溢出才扣血', () => {
  const a = fighter({ attack: 100 });
  const d = fighter({ shield: 60 });
  const r = resolveAttack({ attacker: a, defender: d, rng: new Rng(1) });
  assert.equal(r.shieldAbsorbed, 60);
  assert.equal(r.damage, 40);
  assert.equal(d.shield, 0);
  assert.equal(d.hp, 960);
});

test('处决：目标残血时直接斩杀', () => {
  const a = fighter({ attack: 100 });
  const d = fighter({ hp: 120, maxHp: 1000, shield: 500 });
  const r = resolveAttack({ attacker: a, defender: d, rng: new Rng(1) });
  assert.equal(r.execute, true);
  assert.equal(d.hp, 0, '处决无视护盾，直接归零');
});

test('不残血时不会处决', () => {
  const a = fighter({ attack: 100 });
  const d = fighter({ hp: 900, maxHp: 1000 });
  const r = resolveAttack({ attacker: a, defender: d, rng: new Rng(1) });
  assert.equal(r.execute, false);
  assert.equal(d.hp, 800);
});

test('破防：连续命中累积满值后目标防御归零', () => {
  const a = fighter({ attack: 100 });
  const d = fighter({ defense: 0.5 });
  const rng = new Rng(7);
  let broke = false;
  for (let i = 0; i < 5; i++) {
    const r = resolveAttack({ attacker: a, defender: d, rng });
    if (r.brokeDefense) broke = true;
  }
  assert.equal(broke, true);
  assert.equal(d.defenseBrokenRounds > 0, true);
  // 破防后的伤害应当高于 50%
  const after = resolveAttack({ attacker: a, defender: d, rng });
  assert.equal(after.damage, 100, '破防期间防御归零');
});

test('吸血：按伤害回复攻击方生命', () => {
  const a = fighter({ attack: 100, lifesteal: 0.5, hp: 500 });
  const d = fighter();
  const r = resolveAttack({ attacker: a, defender: d, rng: new Rng(1) });
  assert.equal(r.lifesteal, 50);
  assert.equal(a.hp, 550);
});

test('期望伤害公式与连击链的解析解一致', () => {
  // 解析解：E = atk × ((1-c) + 1.25·c·critMult) / (1 - 0.6·c)
  const atk = 1480;
  const c = 0.8;
  const cm = 10;
  const expected = expectedDamage(atk, c, cm);
  const analytic = atk * ((1 - c) + 1.25 * c * cm) / (1 - 0.6 * c);
  assert.ok(Math.abs(expected - analytic) < 1e-6);

  // 蒙特卡洛验证（固定种子，结果应当接近解析解）
  const rng = new Rng(20240915);
  const a = fighter({ attack: atk, critRate: c, critMult: cm });
  const d = fighter({ hp: 1e12, maxHp: 1e12 });
  let total = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const before = d.hp;
    resolveAttack({ attacker: a, defender: d, rng });
    total += before - d.hp;
  }
  const observed = total / N;
  assert.ok(
    Math.abs(observed - analytic) / analytic < 0.06,
    `蒙特卡洛 ${observed.toFixed(0)} 应当接近解析解 ${analytic.toFixed(0)}`,
  );
});

test('连击链有上限，不会无限增长', () => {
  const a = fighter({ attack: 100, critRate: 1, critMult: 5 });
  const d = fighter({ hp: 1e9, maxHp: 1e9 });
  const r = resolveAttack({ attacker: a, defender: d, rng: new Rng(3) });
  assert.ok(r.combo <= 12, `连击层数 ${r.combo} 不该超过上限`);
});

test('治疗不会超过最大生命', () => {
  const p = fighter({ hp: 900, maxHp: 1000 });
  const healed = healPiece(p, 500);
  assert.equal(healed, 100);
  assert.equal(p.hp, 1000);
});

test('战力公式：攻击力更高的棋子战力更高', () => {
  const weak = fighter({ attack: 100, maxHp: 1000 });
  const strong = fighter({ attack: 300, maxHp: 1000 });
  assert.ok(powerOf(strong) > powerOf(weak));
});

test('突破属性表里包含最终伤害倍数', () => {
  assert.ok(BREAKTHROUGH_STATS.some((s) => s.key === 'finalDamageMult'));
});
