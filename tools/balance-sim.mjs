/**
 * tools/balance-sim.mjs —— 平衡性模拟。
 *
 * 按「玩家在该章节应有的状态」（等级 = 章节，棋子数 = 2 + 章节/2）模拟，
 * 统计各章节胜率。目标曲线：胜率随章节平缓下降，第 1 章 ~90%，第 6 章 ~40%。
 *
 * 用法：node tools/balance-sim.mjs [最大章节] [每章局数]
 */

import { Rng } from '../src/core/rng.js';
import { generateEnemyRoster, runBattle } from '../src/core/battle.js';
import { TEMPLATE_BY_CODE, ENEMY_GEAR } from '../src/core/balance.js';
import { createPiece } from '../src/core/progression.js';

const MAX_CHAPTER = Number(process.argv[2] ?? 8);
const RUNS = Number(process.argv[3] ?? 60);
const CODES = ['knight', 'rook', 'pawn', 'bishop', 'queen'];

/** 玩家在该章节「应该」达到的状态 */
function expectedAlly(chapter) {
  const count = Math.min(5, 2 + Math.floor(chapter / 2));
  const level = Math.max(1, chapter);
  return CODES.slice(0, count).map((code, i) => {
    const p = createPiece(TEMPLATE_BY_CODE[code], { level });
    p.id = i + 1;
    p.isAlly = true;
    p.side = 'ally';
    p.file = (i * 2) % 8;
    p.rank = i % 2 === 0 ? 3 : 2;   // 真实玩家会把棋子顶到前线
    // 玩家也会买到装备 —— 模拟里要给同样的装备数，否则对比不公平
    p.items = [...(ENEMY_GEAR[Math.min(ENEMY_GEAR.length, chapter) - 1] ?? [])];
    return p;
  });
}

console.log(`\n平衡模拟 · 每章 ${RUNS} 局\n`);
console.log('章节 | 胜率   | 平局 | 平均回合 | 我方战力 | 敌方战力 | 敌方配置');
console.log('-----+--------+-----+----------+----------+----------+----------');

for (let chapter = 1; chapter <= MAX_CHAPTER; chapter++) {
  let wins = 0;
  let draws = 0;
  let rounds = 0;
  let allyPower = 0;
  let enemyPower = 0;
  let cfg = null;

  for (let r = 0; r < RUNS; r++) {
    const rng = new Rng(chapter * 977 + r);
    const allies = expectedAlly(chapter);
    const enemies = generateEnemyRoster(chapter, 1, rng);
    const res = runBattle({
      allyUnits: allies,
      enemyUnits: enemies,
      seed: chapter * 7919 + r,
      chapter,
      round: 1,
    });
    if (res.result === 'win') wins++;
    if (res.result === 'draw') draws++;
    rounds += res.rounds;
    allyPower += res.allyPower;
    enemyPower += res.enemyPower;
    if (!cfg) {
      cfg = {
        count: enemies.length,
        level: enemies[0].level,
        star: enemies[0].star,
      };
    }
  }

  const rate = Math.round((wins / RUNS) * 100);
  console.log(
    `${String(chapter).padStart(4)} | ${`${rate}%`.padStart(6)} | ${String(draws).padStart(4)} | `
    + `${(rounds / RUNS).toFixed(1).padStart(8)} | ${Math.round(allyPower / RUNS).toString().padStart(8)} | `
    + `${Math.round(enemyPower / RUNS).toString().padStart(8)} | `
    + `${cfg.count}子 Lv.${cfg.level} ${cfg.star}★`,
  );
}

console.log('');
