/**
 * items.js —— 装备与卡牌（附魔）。
 *
 * 装备：每人最多 3 件，效果在战斗开始时合成为棋子的战斗属性。
 * 卡牌：对棋子属性做 +/× 的即时修改。
 */

import { CARD_STAT_BY_KEY, EQUIPMENT_BY_CODE, MAX_ITEMS, STAT_HARD_CAPS } from './balance.js';

/* ------------------------------------------------------------------ *
 * 装备
 * ------------------------------------------------------------------ */

/** 校验装备是否可装配 */
export function canEquip(piece, code) {
  const eq = EQUIPMENT_BY_CODE[code];
  if (!eq) return { ok: false, reason: '未知的装备' };
  const items = piece.items ?? [];
  if (items.length >= MAX_ITEMS) return { ok: false, reason: `装备槽已满（最多 ${MAX_ITEMS} 件）` };
  if (items.includes(code)) return { ok: false, reason: '已经装配了这件装备' };
  return { ok: true };
}

/**
 * 把装备效果折算成战斗属性，生成战斗态棋子的附加字段。
 * @param {string[]} itemCodes
 */
export function equipmentEffects(itemCodes = []) {
  const fx = {
    lifesteal: 0,
    armorPierce: 0,
    startShield: 0,
    speed: 0,
    enemySpeedDebuff: 0,
    alwaysCombo: false,
    killHeal: 0,
  };
  for (const code of itemCodes) {
    const eq = EQUIPMENT_BY_CODE[code];
    if (!eq) continue;
    const e = eq.effect ?? {};
    if (e.critRate) fx.critRate = (fx.critRate ?? 0) + e.critRate;
    if (e.lifesteal) fx.lifesteal += e.lifesteal;
    if (e.startShield) fx.startShield += e.startShield;
    if (e.speed) fx.speed += e.speed;
    if (e.armorPierce) fx.armorPierce += e.armorPierce;
    if (e.enemySpeedDebuff) fx.enemySpeedDebuff += e.enemySpeedDebuff;
    if (e.alwaysCombo) fx.alwaysCombo = true;
    if (e.killHeal) fx.killHeal += e.killHeal;
  }
  return fx;
}

/** 装备的展示描述 */
export function describeEquipment(code) {
  const eq = EQUIPMENT_BY_CODE[code];
  if (!eq) return code;
  const parts = [];
  const e = eq.effect ?? {};
  if (e.critRate) parts.push(`暴击率 +${Math.round(e.critRate * 100)}%`);
  if (e.lifesteal) parts.push(`吸血 ${Math.round(e.lifesteal * 100)}%`);
  if (e.startShield) parts.push(`开战护盾 ${Math.round(e.startShield * 100)}% 最大生命`);
  if (e.speed) parts.push(`速度 +${e.speed}`);
  if (e.armorPierce) parts.push(`无视 ${Math.round(e.armorPierce * 100)}% 防御`);
  if (e.enemySpeedDebuff) parts.push(`光环：敌方速度 -${e.enemySpeedDebuff}`);
  if (e.alwaysCombo) parts.push('暴击必定连击');
  if (e.killHeal) parts.push(`击杀回复 ${Math.round(e.killHeal * 100)}% 最大生命`);
  return parts.join('，') || '—';
}

/* ------------------------------------------------------------------ *
 * 卡牌
 * ------------------------------------------------------------------ */

/**
 * 应用一张卡到棋子。
 *
 * 关键修正（相对原版）：
 *  - 生命类卡**同时**提升 maxHp 与 hp（原版 bug ④：只加 hp，破坏 hp ≤ maxHp）。
 *  - `finalDamageMult` 是真实生效的独立属性（原版 bug ①：它被错接到大招倍率上）。
 *  - 每个属性都会按硬上限夹紧，夹紧后如果一点没涨，返回 `effective:false` 让上层提示，
 *    避免「花了钱什么都没变」（原版 bug ③ 的思路）。
 *
 * @param {object} piece
 * @param {object} card  { stat, operation:'add'|'mul', value }
 * @returns {{ok:boolean, reason?:string, before:object, after:object, effective:boolean}}
 */
export function applyCard(piece, card) {
  const stat = CARD_STAT_BY_KEY[card.stat];
  if (!stat) return { ok: false, reason: '未知的卡牌属性', effective: false };

  const before = snapshot(piece);
  const op = card.operation === 'mul' ? 'mul' : 'add';
  let value = card.value;

  if (stat.lowerIsBetter && op === 'add') value = -Math.abs(value);

  if (stat.key === 'hp') {
    // 生命：同时抬 maxHp 和 hp（hp 不得超过新的 maxHp）
    const oldMax = piece.maxHp;
    let newMax = op === 'add' ? piece.maxHp + value : piece.maxHp * value;
    newMax = Math.floor(Math.max(1, newMax));
    piece.maxHp = newMax;
    piece.hp = Math.min(piece.hp, newMax);
    if (piece.hp <= 0) piece.hp = newMax;
  } else if (stat.key === 'ultCd') {
    const old = piece.ultCd;
    let v = op === 'add' ? piece.ultCd + value : piece.ultCd * value;
    v = Math.max(1, Math.floor(v));
    piece.ultCd = v;
  } else {
    const current = piece[stat.key] ?? 0;
    let v = op === 'add' ? current + value : current * value;
    const hard = STAT_HARD_CAPS[stat.key];
    if (hard !== undefined && hard !== Infinity) v = Math.min(hard, v);
    if (stat.key === 'critRate' || stat.key === 'defense' || stat.key === 'dodge') {
      v = Math.max(0, v);
    }
    piece[stat.key] = v;
  }

  const after = snapshot(piece);
  const effective = Object.keys(before).some((k) => before[k] !== after[k]);
  return { ok: true, effective, before, after, statName: stat.name, operation: op };
}

function snapshot(piece) {
  return {
    attack: piece.attack,
    maxHp: piece.maxHp,
    hp: piece.hp,
    critRate: piece.critRate,
    critMult: piece.critMult,
    ultMult: piece.ultMult,
    ultCd: piece.ultCd,
    defense: piece.defense,
    dodge: piece.dodge,
    finalDamageMult: piece.finalDamageMult,
    recovery: piece.recovery,
  };
}

/**
 * 随机生成一张卡。
 * @param {import('./rng.js').Rng} rng
 * @param {Array} pool CARD_STATS
 */
export function rollCard(rng, pool) {
  const picked = rng.pick(pool);
  if (!picked) return null;
  const isMul = rng.chance(0.45);
  const value = isMul
    ? rng.range(picked.mulMin, picked.mulMax)
    : rng.range(picked.addMax * 0.25, picked.addMax);
  return {
    stat: picked.key,
    statName: picked.name,
    operation: isMul ? 'mul' : 'add',
    value: isMul ? Number(value.toFixed(3)) : Number(value.toFixed(3)),
    rarity: picked.rarity,
  };
}
