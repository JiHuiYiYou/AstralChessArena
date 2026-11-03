/**
 * db/seed.js —— 把 balance.js 里的静态内容灌进 SQLite。
 *
 * 静态内容（职业/羁绊/棋子模板/装备/卡池）只写一次；
 * 每次启动都跑一遍 upsert，保证改了 balance.js 后刷新就能生效。
 */

import {
  CARD_STATS,
  EQUIPMENTS,
  PIECE_TEMPLATES,
  PROFESSIONS,
  SYNERGY_TIERS,
} from '../core/balance.js';
import { getDb, transaction } from './index.js';

/** 幂等灌数据 */
export function seed() {
  const db = getDb();
  transaction((d) => {
    // 职业
    const insProf = d.prepare(`
      INSERT INTO professions (id, code, name, color, blurb)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        name = excluded.name, color = excluded.color, blurb = excluded.blurb
    `);
    for (const p of PROFESSIONS) insProf.run(p.id, p.code, p.name, p.color, p.blurb);

    // 羁绊
    const insSyn = d.prepare(`
      INSERT INTO synergies (profession_id, tier, count_required, bonus_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(profession_id, tier) DO UPDATE SET
        count_required = excluded.count_required, bonus_json = excluded.bonus_json
    `);
    for (const p of PROFESSIONS) {
      for (const t of SYNERGY_TIERS) {
        insSyn.run(
          p.id,
          t.tier,
          t.count_required,
          JSON.stringify({
            atk: t.atk,
            hp: t.hp,
            skill: t.skill,
            passive: t.passive,
          }),
        );
      }
    }

    // 棋子模板
    const insTpl = d.prepare(`
      INSERT INTO piece_templates (
        id, code, name, glyph, movement, skill_name, skill_desc, profession_id,
        base_attack, base_hp, base_speed, base_crit_rate, base_crit_mult,
        base_dodge, base_defense, base_ult_mult, base_ult_cd, base_recovery,
        shop_weight, promote_to
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(code) DO UPDATE SET
        name = excluded.name, glyph = excluded.glyph, movement = excluded.movement,
        skill_name = excluded.skill_name, skill_desc = excluded.skill_desc,
        profession_id = excluded.profession_id,
        base_attack = excluded.base_attack, base_hp = excluded.base_hp,
        base_speed = excluded.base_speed, base_crit_rate = excluded.base_crit_rate,
        base_crit_mult = excluded.base_crit_mult, base_dodge = excluded.base_dodge,
        base_defense = excluded.base_defense, base_ult_mult = excluded.base_ult_mult,
        base_ult_cd = excluded.base_ult_cd, base_recovery = excluded.base_recovery,
        shop_weight = excluded.shop_weight, promote_to = excluded.promote_to
    `);
    for (const t of PIECE_TEMPLATES) {
      const profId = PROFESSIONS.find((p) => p.code === t.profession)?.id ?? 1;
      insTpl.run(
        t.id, t.code, t.name, t.glyph, t.movement, t.skillName, t.skillDesc, profId,
        t.baseAttack, t.baseHp, t.baseSpeed, t.baseCritRate, t.baseCritMult,
        t.baseDodge, t.baseDefense, t.baseUltMult, t.baseUltCd, t.baseRecovery,
        t.shopWeight, JSON.stringify(t.promoteTo ?? []),
      );
    }

    // 装备
    const insEq = d.prepare(`
      INSERT INTO equipments (id, code, name, rarity, slot, effect_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        name = excluded.name, rarity = excluded.rarity, slot = excluded.slot,
        effect_json = excluded.effect_json
    `);
    for (const e of EQUIPMENTS) {
      insEq.run(e.id, e.code, e.name, e.rarity, e.slot, JSON.stringify(e.effect));
    }

    // 卡牌：每种属性一张「基准卡」，实际数值由开卡时随机（见 core/items.js rollCard）
    const insCard = d.prepare(`
      INSERT INTO cards (code, stat, stat_name, operation, value, rarity, weight)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        stat = excluded.stat, stat_name = excluded.stat_name,
        rarity = excluded.rarity, weight = excluded.weight
    `);
    for (const c of CARD_STATS) {
      insCard.run(`stat_${c.key}`, c.key, c.name, 'add', c.addMax, c.rarity, c.weight);
    }
  });

  return db;
}
