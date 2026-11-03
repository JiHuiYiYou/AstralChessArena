/**
 * tools/balance-sim.mjs —— 平衡性模拟。
 *
 * 跑一批模拟战斗，统计各章节的胜率 / 平均回合数 / 平均伤害量级，
 * 用来调数值（而不是靠肉眼看一局）。
 *
 * 用法：node tools/balance-sim.mjs [章节数] [每章局数] [我方等级]
 */

import { Rng } from '../src/core/rng.js';
import { generateEnemyRoster, runBattle } from '../src/core/battle.js';
import { TEMPLATE_BY_CODE } from '../src/core/balance.js';
import { createPiece } from '../src/core/progression.js';

const CHAPTERS = Number(process.argv[2] ?? 8);
const RUNS = Number(process.argv[3] ?? 40);
const ALLY_LEVEL = Number(process.argv[4] ?? 2);

function makeAlly(level, count, rng) {
  const codes = ['knight', 'rook', 'pawn', 'bishop', 'queen'];
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = TEMPLATE_BY_CODE[codes[i % codes.length]];
    const p = createPiece(t, { level });
    p.id = i + 1;
    p.isAlly = true;
    p.side = 'ally';
    p.file = (i * 2) % 8;
    p.rank = i % 4;
    out.push(p);
  }
  void rng;
  return out;
}

console.log(`\n平衡模拟 · 我方 ${ALLY_LEVEL} 级 × 5 子 · 每章 ${RUNS} 局\n`);
console.log('章节 | 胜率   | 平均回合 | 平均我方伤害 | 平均敌方伤害 | 最高单次伤害');
console.log('-----+--------+-----------+--------------+--------------+--------------');

const rows = [];
for (let chapter = 1; chapter <= CHAPTERS; chapter++) {
  let wins = 0;
  let rounds = 0;
  let allyDamage = 0;
  let enemyDamage = 0;
  let maxHit = 0;
  let draws = 0;

  for (let r = 0; r < RUNS; r++) {
    const rng = new Rng(chapter * 1000 + r);
    const allies = makeAlly(ALLY_LEVEL, 5, rng);
    const enemies = generateEnemyRoster(chapter, 4, rng);
    const res = runBattle({
      allyUnits: allies,
      enemyUnits: enemies,
      seed: chapter * 7919 + r,
      chapter,
      round: 4,
    });
    if (res.result === 'win') wins++;
    if (res.result === 'draw') draws++;
    rounds += res.rounds;
    for (const e of res.events) {
      if (e.type !== 'attack' || e.dodged) continue;
      if (e.side === 'ally') allyDamage += e.damage;
      else enemyDamage += e.damage;
      if (e.damage > maxHit) maxHit = e.damage;
    }
  }

  const rate = ((wins / RUNS) * 100).toFixed(0);
  rows.push({ chapter, rate: Number(rate) });
  console.log(
    `${String(chapter).padStart(4)} | ${`${rate}%`.padStart(6)} | `
    + `${(rounds / RUNS).toFixed(1).padStart(8)} | `
    + `${Math.round(allyDamage / RUNS).toString().padStart(12)} | `
    + `${Math.round(enemyDamage / RUNS).toString().padStart(12)} | `
    + `${maxHit.toString().padStart(12)}`
    + (draws ? `  (平局 ${draws})` : ''),
  );
}

console.log('');
console.log('目标曲线：第 1 章 90%+ 胜，第 3 章 70% 上下，第 6 章 40%，第 8 章 20% ——');
console.log('胜率应当**随章节平缓下降**，而不是第一章就崩。');
console.log('');
