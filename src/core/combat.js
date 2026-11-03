/**
 * combat.js —— 伤害结算。
 *
 * 结算顺序（固定，见 SPEC.md）：
 *   1. 闪避判定 —— **整条连击链一起判**。被闪避就不产生任何暴击数字，
 *      避免原版「先打暴击日志、再发现被闪避」的 bug ⑤。
 *   2. 连击链 —— 暴击倍率在 [1.0,1.5) 波动，波动 >1.2 触发下一段连击；
 *      超过 MAX_COMBO 的部分每层 ×0.85 衰减（保留爽感但可控）。
 *   3. 破防 —— 连续命中同一目标累积破防值，满则目标 3 回合防御归零。
 *   4. 护盾 —— 先扣护盾，溢出部分才扣血。
 *   5. 防御 —— hpDamage = raw × (1 - defense)，可被破甲穿透。
 *   6. 最终伤害倍率 —— finalDamageMult（**原版缺失这一项，bug ①**）。
 *   7. 大招倍率 —— 冷却归零的那一击。
 *   8. 处决 —— 目标剩余生命低于 15% 直接斩杀，无视护盾。
 */

import {
  BREAK_METER_MAX,
  BREAK_METER_PER_HIT,
  BREAK_ROUNDS,
  COMBO_DECAY,
  COMBO_THRESHOLD,
  CRIT_VARIATION,
  EXECUTE_HP_RATIO,
  MAX_COMBO,
} from './balance.js';

/** 连击链的硬上限，防止极端暴击率下循环过长 */
const MAX_CHAIN = MAX_COMBO + 8;

/**
 * 结算一次攻击。
 *
 * @param {object} args
 * @param {object} args.attacker  攻击方棋子（战斗态）
 * @param {object} args.defender  防御方棋子（战斗态）
 * @param {import('./rng.js').Rng} args.rng
 * @param {boolean} [args.ult]    本次攻击是否携带大招
 * @param {number} [args.defenseIgnoreRatio] 额外无视目标防御的比例（0-1），主教大招用
 * @returns {object} 结算结果
 */
export function resolveAttack({ attacker, defender, rng, ult = false, defenseIgnoreRatio = 0 }) {
  const result = {
    dodged: false,
    crit: false,
    combo: 0,
    rawDamage: 0,
    damage: 0,
    shieldAbsorbed: 0,
    hpBefore: defender.hp,
    hpAfter: defender.hp,
    maxHpAfter: defender.maxHp,
    execute: false,
    brokeDefense: false,
    ult: !!ult,
    lifesteal: 0,
    killHeal: 0,
    shieldBroken: false,
    shieldBonus: false,
    armorPierced: attacker.armorPierce ?? 0,
  };

  // ---- 1. 闪避（整条链一起判，先判后打） ----
  if (rng.chance(defender.dodge ?? 0)) {
    result.dodged = true;
    return result;
  }

  // ---- 2. 连击链 ----
  const hits = [];
  let combo = 0;
  for (let i = 0; i < MAX_CHAIN; i++) {
    if (rng.chance(attacker.critRate ?? 0)) {
      const variation = rng.range(CRIT_VARIATION.min, CRIT_VARIATION.max);
      const dmg = variation * (attacker.critMult ?? 1) * attacker.attack;
      hits.push({ dmg, variation, crit: true });
      result.crit = true;
      // 连击种子（装备）：暴击必定触发连击
      const threshold = attacker.alwaysCombo ? COMBO_THRESHOLD + 0.4 : COMBO_THRESHOLD;
      if (variation > threshold) {
        combo++;
        continue;
      }
    } else {
      hits.push({ dmg: attacker.attack, variation: 1, crit: false });
    }
    break;
  }
  result.combo = combo;

  // 超过连击上限的部分逐层衰减
  let raw = 0;
  for (let i = 0; i < hits.length; i++) {
    let d = hits[i].dmg;
    if (i >= MAX_COMBO) d *= Math.pow(COMBO_DECAY, i - MAX_COMBO + 1);
    raw += d;
  }
  result.rawDamage = raw;

  // ---- 3. 破防 ----
  defender.breakMeter = (defender.breakMeter ?? 0) + BREAK_METER_PER_HIT;
  if (defender.breakMeter >= BREAK_METER_MAX) {
    defender.breakMeter = 0;
    defender.defenseBrokenRounds = BREAK_ROUNDS;
    result.brokeDefense = true;
  }

  // ---- 5. 防御（含破甲穿透、破防归零与主教大招的额外无视） ----
  let defense = defender.defense ?? 0;
  if (defender.defenseBrokenRounds > 0) defense = 0;
  defense = Math.max(0, defense - result.armorPierced);
  defense = defense * (1 - Math.max(0, Math.min(1, defenseIgnoreRatio)));
  let hpDamage = raw * (1 - defense);

  // ---- 6. 最终伤害倍率 ----
  hpDamage *= attacker.finalDamageMult ?? 1;

  // ---- 7. 大招倍率 ----
  if (ult) hpDamage *= attacker.ultMult ?? 1;

  hpDamage = Math.max(0, Math.floor(hpDamage));

  // ---- 8. 处决（无视护盾） ----
  const remaining = defender.hp - hpDamage;
  if (!ult && remaining > 0 && defender.maxHp > 0 && remaining / defender.maxHp < EXECUTE_HP_RATIO) {
    result.execute = true;
    result.damage = hpDamage;
    defender.hp = 0;
    result.hpAfter = 0;
    return finish(attacker, defender, result);
  }

  // ---- 4. 破盾加伤（上一击打碎的护盾，在这一击生效） ----
  if (attacker.shieldBreakBonus > 0) {
    hpDamage *= 1 + attacker.shieldBreakBonus;
    attacker.shieldBreakBonus = 0;
    result.shieldBonus = true;
  }

  // ---- 5. 护盾 ----
  // 护盾上限 = 最大生命的 25%。
  // 没有上限的话，「铁壁反击」每几回合加一大片护盾，
  // 而每回合伤害又打不穿 —— 两个车会永远僵持（实测 40 回合 0 伤害）。
  const shieldCap = Math.floor(defender.maxHp * 0.25);
  const shield = Math.min(defender.shield ?? 0, shieldCap);
  if (defender.shield !== undefined) defender.shield = shield;
  if (shield > 0) {
    const absorbed = Math.min(shield, hpDamage);
    defender.shield = shield - absorbed;
    result.shieldAbsorbed = absorbed;
    hpDamage -= absorbed;
    if (defender.shield <= 0 && absorbed > 0) {
      // 护盾被打碎：攻击方**下一次**打这个目标伤害 +30%
      result.shieldBroken = true;
      attacker.shieldBreakBonus = 0.3;
    }
  }

  defender.hp = Math.max(0, defender.hp - hpDamage);
  result.damage = hpDamage;
  result.hpAfter = defender.hp;

  return finish(attacker, defender, result);
}

/** 吸血 / 击杀回血等后处理 */
function finish(attacker, defender, result) {
  const lifesteal = attacker.lifesteal ?? 0;
  if (lifesteal > 0 && result.damage > 0) {
    const heal = Math.min(Math.floor(result.damage * lifesteal), attacker.maxHp - attacker.hp);
    if (heal > 0) {
      attacker.hp += heal;
      result.lifesteal = heal;
    }
  }
  if (result.hpAfter <= 0) {
    const killHeal = attacker.killHeal ?? 0;
    if (killHeal > 0) {
      const heal = Math.min(Math.floor(attacker.maxHp * killHeal), attacker.maxHp - attacker.hp);
      if (heal > 0) {
        attacker.hp += heal;
        result.killHeal = heal;
      }
    }
  }
  return result;
}

/**
 * 治疗。返回实际治疗量。
 */
export function healPiece(piece, amount) {
  if (!piece || piece.hp <= 0 || amount <= 0) return 0;
  const before = piece.hp;
  piece.hp = Math.min(piece.maxHp, piece.hp + amount);
  return piece.hp - before;
}

/**
 * 回合末的状态衰减：破防剩余回合 -1。
 */
export function tickStatuses(piece) {
  if (piece.defenseBrokenRounds > 0) piece.defenseBrokenRounds -= 1;
  if (piece.breakMeter > 0) piece.breakMeter = Math.max(0, piece.breakMeter - BREAK_METER_PER_HIT);
}

/**
 * 期望单次伤害（用于 UI 展示「战力」与平衡调试）。
 * E = atk × ((1-c) + 1.25·c·critMult) / (1 - 0.6·c)
 */
export function expectedDamage(attack, critRate, critMult) {
  const c = Math.min(0.95, critRate);
  const denom = 1 - 0.6 * c;
  if (denom <= 0) return attack * critMult * 10;
  return attack * ((1 - c) + 1.25 * c * critMult) / denom;
}

/**
 * 棋子的综合战力（界面上的「战力」数字，以及战斗前的强弱预估）。
 *
 * **以输出为主、生存为辅** —— 之前血量权重太高，
 * 一个 8000 血但打不动人的坦克会把数字撑到 1.1 万，
 * 出现「我方战力 1.1 万 vs 敌方 2416，结果输了」这种自相矛盾的数字。
 */
export function powerOf(piece) {
  const dps = expectedDamage(piece.attack, piece.critRate, piece.critMult);
  return Math.floor(dps * 25 + piece.maxHp / 25 + (piece.speed ?? 0) * 50);
}
