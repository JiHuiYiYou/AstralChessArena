/**
 * progression.js —— 养成：训练、升阶、突破、卡牌附魔。
 *
 * 相对原版《星穹弈境》的改动：
 *  - 训练有明确的「当前是否已到上限」判定，撞上限时**直接禁止并说明**，
 *    不再像原版那样收下金币还悄悄把属性夹回去（bug ③）。
 *  - 升阶（融合）取「大的 + 小的 50%」，不是平均值（bug ⑧）。
 *  - 突破会同时抬高该属性的**上限**，所以永远不会「突破到满却没长」。
 */

import {
  ASCEND,
  BREAKTHROUGH,
  BREAKTHROUGH_STATS,
  STAT_HARD_CAPS,
  TRAIN_MULTIPLIER,
  TRAIN_SOFT_MULTIPLIER,
  TRAINING,
  levelScale,
  statCaps,
} from './balance.js';
import { applyCard } from './items.js';

/* ------------------------------------------------------------------ *
 * 构造
 * ------------------------------------------------------------------ */

/**
 * 用模板 + 星级造一个棋子。
 * @param {object} template  piece_templates 行
 * @param {object} opts { level, star, name, voiceLine }
 */
export function createPiece(template, opts = {}) {
  const level = Math.max(1, opts.level ?? 1);
  const s = levelScale(level);
  const caps = statCaps(template, level);
  // 初始值 = 模板基础值 × 等级系数，**不是上限**。
  // （一开始就把属性顶到上限的话，就永远没空间训练了 —— 这是个很容易踩的坑。）
  const hp = Math.min(caps.hp, Math.floor(template.baseHp * s));
  return {
    templateId: template.id,
    code: template.code,
    name: opts.name || template.name,
    glyph: template.glyph,
    profession: template.profession,
    isKing: template.code === 'king',
    voiceLine: opts.voiceLine ?? '',
    level,
    star: opts.star ?? 1,
    baseScore: level,
    attack: Math.min(caps.attack, Math.floor(template.baseAttack * s)),
    hp,
    maxHp: hp,
    shield: 0,
    speed: Math.min(STAT_HARD_CAPS.speed, template.baseSpeed),
    critRate: Math.min(caps.critRate, template.baseCritRate * s),
    critMult: Math.min(caps.critMult, template.baseCritMult * s),
    dodge: Math.min(caps.dodge, template.baseDodge * s),
    defense: Math.min(caps.defense, template.baseDefense * s),
    recovery: Math.min(caps.recovery, template.baseRecovery * s),
    finalDamageMult: 1,
    ultMult: Math.min(caps.ultMult, template.baseUltMult * s),
    ultCd: Math.max(1, template.baseUltCd),
    items: [],
    attributes: {},
    breakthroughBonus: {},
    trainCount: 0,
    // 战斗态字段
    side: 'ally',
    file: -1,
    rank: -1,
    isAlive: true,
    breakMeter: 0,
    defenseBrokenRounds: 0,
    lastDoubleStep: false,
    hasMoved: true,
    ultCooldown: 1,
  };
}

/* ------------------------------------------------------------------ *
 * 训练
 * ------------------------------------------------------------------ */

/** 训练一次的成本 */
export function trainCost(piece) {
  return Math.floor(
    TRAINING.baseCost
    * Math.pow(TRAINING.costPerLevel, piece.level - 1)
    * Math.pow(TRAINING.costPerTrain, piece.trainCount ?? 0),
  );
}

/**
 * 能不能训练。返回 { ok, reason }。
 * 只要**任何一个**受训练影响的属性已经到上限，就禁止训练（原版 bug ③）。
 */
export function canTrain(piece, template) {
  const caps = statCaps(template, piece.level, piece.breakthroughBonus);
  const checks = [
    ['attack', piece.attack, caps.attack],
    ['maxHp', piece.maxHp, caps.hp],
    ['critMult', piece.critMult, caps.critMult],
    ['ultMult', piece.ultMult, caps.ultMult],
    ['critRate', piece.critRate, caps.critRate],
    ['defense', piece.defense, caps.defense],
    ['dodge', piece.dodge, caps.dodge],
  ];
  const capped = checks.filter(([, v, cap]) => v >= cap - 1e-6);
  if (capped.length === 0) return { ok: true, reason: null };
  const names = { attack: '基础攻击力', maxHp: '生命', critMult: '暴击倍率', ultMult: '大招倍率', critRate: '暴击率', defense: '防御系数', dodge: '闪避系数' };
  return {
    ok: false,
    reason: `${capped.map(([k]) => names[k]).join('、')} 已达当前等级上限，需要升阶（融合）`,
    capped: capped.map(([k]) => k),
  };
}

/**
 * 执行一次训练。所有属性乘以倍率后夹到上限。
 * @returns {{ok:boolean, reason?:string, delta:object}}
 */
export function train(piece, template) {
  const check = canTrain(piece, template);
  if (!check.ok) return { ok: false, reason: check.reason, delta: {} };

  const caps = statCaps(template, piece.level, piece.breakthroughBonus);
  const before = { attack: piece.attack, maxHp: piece.maxHp, critMult: piece.critMult, ultMult: piece.ultMult, critRate: piece.critRate, defense: piece.defense, dodge: piece.dodge };

  piece.attack = Math.min(caps.attack, piece.attack * TRAIN_MULTIPLIER);
  const newMax = Math.min(caps.hp, piece.maxHp * TRAIN_MULTIPLIER);
  piece.hp = Math.min(newMax, piece.hp * TRAIN_MULTIPLIER);
  piece.maxHp = newMax;
  piece.critMult = Math.min(caps.critMult, piece.critMult * TRAIN_MULTIPLIER);
  piece.ultMult = Math.min(caps.ultMult, piece.ultMult * TRAIN_MULTIPLIER);
  piece.critRate = Math.min(caps.critRate, piece.critRate * TRAIN_SOFT_MULTIPLIER);
  piece.defense = Math.min(caps.defense, piece.defense * TRAIN_SOFT_MULTIPLIER);
  piece.dodge = Math.min(caps.dodge, piece.dodge * TRAIN_SOFT_MULTIPLIER);
  piece.trainCount = (piece.trainCount ?? 0) + 1;
  piece.baseScore = piece.level * 10 + piece.trainCount;

  const delta = {
    attack: Math.floor(piece.attack - before.attack),
    maxHp: Math.floor(piece.maxHp - before.maxHp),
    critMult: Number((piece.critMult - before.critMult).toFixed(2)),
    ultMult: Number((piece.ultMult - before.ultMult).toFixed(2)),
    critRate: Number((piece.critRate - before.critRate).toFixed(3)),
    defense: Number((piece.defense - before.defense).toFixed(3)),
    dodge: Number((piece.dodge - before.dodge).toFixed(3)),
  };
  return { ok: true, delta };
}

/* ------------------------------------------------------------------ *
 * 升阶（融合）
 * ------------------------------------------------------------------ */

/**
 * 两个同棋子升阶成一个更高等级的棋子。
 *
 * 公式（**不是平均值**）：
 *   新ATK = max(a, b) + floor(min(a, b) × 0.5)
 *   新HP  = max(a, b) + floor(min(a, b) × 0.5)
 *   新等级 = max(level) + 1
 *
 * 其它属性取「强的那一边」，保证升级不倒退。
 *
 * @param {object} a
 * @param {object} b
 * @param {object} template
 */
export function ascend(a, b, template) {
  const newLevel = Math.max(a.level, b.level) + 1;
  const caps = statCaps(template, newLevel);

  const attack = Math.min(caps.attack, Math.floor(Math.max(a.attack, b.attack) + Math.min(a.attack, b.attack) * ASCEND.minorRatio));
  const maxHp = Math.min(caps.hp, Math.floor(Math.max(a.maxHp, b.maxHp) + Math.min(a.maxHp, b.maxHp) * ASCEND.minorRatio));

  return {
    ...a,
    level: newLevel,
    star: Math.min(5, Math.max(a.star, b.star) + 1),
    baseScore: newLevel * 10,
    attack,
    maxHp,
    hp: maxHp,
    shield: 0,
    critRate: Math.min(caps.critRate, Math.max(a.critRate, b.critRate)),
    critMult: Math.min(caps.critMult, Math.max(a.critMult, b.critMult)),
    ultMult: Math.min(caps.ultMult, Math.max(a.ultMult, b.ultMult)),
    ultCd: Math.max(1, Math.min(a.ultCd, b.ultCd)),
    defense: Math.min(caps.defense, Math.max(a.defense, b.defense)),
    dodge: Math.min(caps.dodge, Math.max(a.dodge, b.dodge)),
    recovery: Math.min(caps.recovery, Math.max(a.recovery, b.recovery)),
    finalDamageMult: Math.max(a.finalDamageMult ?? 1, b.finalDamageMult ?? 1),
    trainCount: 0,
    items: [...(a.items ?? []), ...(b.items ?? [])].slice(0, 3),
    attributes: { ...(a.attributes ?? {}) },
    breakthroughBonus: { ...(a.breakthroughBonus ?? {}) },
  };
}

/* ------------------------------------------------------------------ *
 * 突破
 * ------------------------------------------------------------------ */

/** 突破成本 */
export function breakthroughCost(piece) {
  return Math.floor(BREAKTHROUGH.baseCost * Math.pow(BREAKTHROUGH.costPerLevel, piece.level - 1));
}

/**
 * 执行突破：选定属性 ×rate，同时把该属性的上限抬升 capBonus 倍，
 * 这样突破永远不会「数值被夹回去、白花资源」。
 */
export function breakthrough(piece, statKey, rng, template) {
  const stat = BREAKTHROUGH_STATS.find((s) => s.key === statKey);
  if (!stat) return { ok: false, reason: '未知的突破属性' };

  const rate = rng.range(BREAKTHROUGH.rateMin, BREAKTHROUGH.rateMax);
  const bonus = { ...(piece.breakthroughBonus ?? {}) };
  bonus[statKey] = (bonus[statKey] ?? 1) * BREAKTHROUGH.capBonus;
  piece.breakthroughBonus = bonus;

  const caps = statCaps(template, piece.level, bonus);
  const before = piece[statKey];

  if (statKey === 'hp') {
    piece.maxHp = Math.min(caps.hp, Math.floor(piece.maxHp * rate));
    piece.hp = Math.min(piece.maxHp, Math.floor(piece.hp * rate));
  } else if (statKey === 'ultCd') {
    piece.ultCd = Math.max(1, Math.floor(piece.ultCd / rate));
  } else {
    let v = (piece[statKey] ?? 0) * rate;
    const hard = STAT_HARD_CAPS[statKey];
    if (hard !== undefined && hard !== Infinity) v = Math.min(hard, v);
    piece[statKey] = v;
  }

  // 记录锁定属性（后续突破默认沿用）
  piece.attributes = { ...(piece.attributes ?? {}), stat: statKey, name: stat.name };

  return {
    ok: true,
    statKey,
    statName: stat.name,
    rate: Number(rate.toFixed(3)),
    before,
    after: piece[statKey],
    effective: piece[statKey] !== before,
  };
}

/* ------------------------------------------------------------------ *
 * 附魔
 * ------------------------------------------------------------------ */

/** 给棋子附魔，返回结算明细 */
export function enchant(piece, card) {
  return applyCard(piece, card);
}
