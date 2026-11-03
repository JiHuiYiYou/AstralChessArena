/**
 * db/repo/battleRepo.js —— 战斗记录（可回看）。
 */

import { getDb, queryAll, queryOne } from '../index.js';

export function insertBattle(rec) {
  const info = getDb().prepare(`
    INSERT INTO battles (save_id, chapter, round, result, rounds, ally_power, enemy_power, seed, events_json)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    rec.saveId, rec.chapter, rec.round, rec.result, rec.rounds,
    rec.allyPower, rec.enemyPower, rec.seed, JSON.stringify(rec.events ?? []),
  );
  return Number(info.lastInsertRowid);
}

export function listBattles(saveId, limit = 30) {
  return queryAll(`
    SELECT id, save_id, chapter, round, result, rounds, ally_power, enemy_power, seed, created_at
    FROM battles WHERE save_id = ? ORDER BY id DESC LIMIT ?
  `, saveId, limit).map((r) => ({
    id: r.id,
    saveId: r.save_id,
    chapter: r.chapter,
    round: r.round,
    result: r.result,
    rounds: r.rounds,
    allyPower: r.ally_power,
    enemyPower: r.enemy_power,
    seed: r.seed,
    createdAt: r.created_at,
  }));
}

export function getBattle(battleId) {
  const row = queryOne('SELECT * FROM battles WHERE id = ?', battleId);
  if (!row) return null;
  return {
    id: row.id,
    saveId: row.save_id,
    chapter: row.chapter,
    round: row.round,
    result: row.result,
    rounds: row.rounds,
    allyPower: row.ally_power,
    enemyPower: row.enemy_power,
    seed: row.seed,
    events: JSON.parse(row.events_json || '[]'),
    createdAt: row.created_at,
  };
}
