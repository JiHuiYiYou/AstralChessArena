/**
 * synergy.js —— 羁绊。
 *
 * 同职业件数达到 2 / 4 / 6 三档，依次给全队对应职业的棋子加攻、血、技能加成，
 * 6 件档额外激活该职业的专属被动。
 *
 * 注意：羁绊是**双方都生效**的 —— 敌方 AI 也会吃羁绊加成（原版 bug ⑬：
 * 敌方只有 HP/ATK 被缩放，等级/星级/装备/羁绊全都不长）。
 */

import { PROFESSION_BY_CODE, SYNERGY_PASSIVES, SYNERGY_TIERS } from './balance.js';

/**
 * 根据一组棋子算出激活的羁绊。
 * @param {Array<{profession:string}>} pieces
 * @returns {Array<{profession:string, professionName:string, count:number, tier:number, atk:number, hp:number, skill:number, passive:object|null}>}
 */
export function computeSynergies(pieces) {
  const counts = new Map();
  for (const p of pieces) {
    if (!p || !p.profession) continue;
    counts.set(p.profession, (counts.get(p.profession) ?? 0) + 1);
  }

  const out = [];
  for (const [profession, count] of counts) {
    let best = null;
    for (const t of SYNERGY_TIERS) {
      if (count >= t.count_required) best = t;
    }
    if (!best) continue;
    const passive = best.passive ? (SYNERGY_PASSIVES[profession] ?? null) : null;
    out.push({
      profession,
      professionName: PROFESSION_BY_CODE[profession]?.name ?? profession,
      count,
      tier: best.tier,
      atk: best.atk,
      hp: best.hp,
      skill: best.skill,
      passive,
    });
  }
  out.sort((a, b) => b.tier - a.tier || b.count - a.count);
  return out;
}

/**
 * 某棋子能从羁绊拿到的加成。
 * @param {string} profession
 * @param {Array} synergies computeSynergies 的结果
 */
export function bonusFor(profession, synergies) {
  const s = synergies.find((x) => x.profession === profession);
  if (!s) return { atk: 0, hp: 0, skill: 0, passive: null };
  return { atk: s.atk, hp: s.hp, skill: s.skill, passive: s.passive };
}

/**
 * 把羁绊加成算进棋子属性（返回新对象，不改原对象）。
 * @param {object} piece
 * @param {Array} synergies
 */
export function applySynergy(piece, synergies) {
  const b = bonusFor(piece.profession, synergies);
  if (b.atk === 0 && b.hp === 0 && b.skill === 0 && !b.passive) return piece;
  return {
    ...piece,
    attack: Math.floor(piece.attack * (1 + b.atk)),
    maxHp: Math.floor(piece.maxHp * (1 + b.hp)),
    hp: Math.min(piece.hp, Math.floor(piece.maxHp * (1 + b.hp))),
    critMult: piece.critMult * (1 + b.skill * 0.5),
    ultMult: piece.ultMult * (1 + b.skill),
    alwaysCombo: piece.alwaysCombo || (b.passive?.code === 'combo'),
  };
}

/** 羁绊面板用的展示数据（含未激活的下一档） */
export function synergySummary(pieces, synergies) {
  const counts = new Map();
  for (const p of pieces) {
    if (!p || !p.profession) continue;
    counts.set(p.profession, (counts.get(p.profession) ?? 0) + 1);
  }
  const rows = [];
  for (const [profession, count] of counts) {
    const active = synergies.find((s) => s.profession === profession) ?? null;
    const nextTier = SYNERGY_TIERS.find((t) => t.count_required > count) ?? null;
    rows.push({
      profession,
      professionName: PROFESSION_BY_CODE[profession]?.name ?? profession,
      count,
      tier: active?.tier ?? 0,
      atk: active?.atk ?? 0,
      hp: active?.hp ?? 0,
      skill: active?.skill ?? 0,
      passive: active?.passive ?? null,
      next: nextTier ? { count_required: nextTier.count_required, atk: nextTier.atk, hp: nextTier.hp } : null,
    });
  }
  rows.sort((a, b) => b.tier - a.tier || b.count - a.count);
  return rows;
}
