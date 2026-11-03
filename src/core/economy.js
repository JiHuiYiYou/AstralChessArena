/**
 * economy.js —— 经济、商店与回合结算。
 */

import { ECONOMY, EQUIPMENTS, PIECE_TEMPLATES, TEMPLATE_BY_CODE, chapterConfig } from './balance.js';

/**
 * 回合收入明细。
 * @param {object} state { gold, streakWin, streakLose }
 * @returns {{base:number, streak:number, interest:number, total:number}}
 */
export function roundIncome(state) {
  const base = ECONOMY.baseIncome;
  const streak = state.streakWin > 0
    ? Math.min(ECONOMY.streakBonusCap, ECONOMY.streakBonusBase + state.streakWin)
    : state.streakLose > 0
      ? Math.min(ECONOMY.loseStreakBonusCap, ECONOMY.streakBonusBase + state.streakLose)
      : 0;
  const interest = Math.min(ECONOMY.interestCap, Math.floor((state.gold ?? 0) * ECONOMY.interestRate));
  return { base, streak, interest, total: base + streak + interest };
}

/**
 * 战斗结算奖励。
 * @param {'win'|'lose'|'draw'} result
 * @param {number} chapter
 * @param {number} streakWin 当前连胜数（胜利后 +1）
 * @param {number} streakLose 当前连败数
 */
export function battleReward(result, chapter, streakWin, streakLose) {
  if (result === 'win') {
    const cfg = chapterConfig(chapter, 1);
    const gold = cfg.goldReward + ECONOMY.winBonusBase;
    const streakBonus = Math.min(ECONOMY.streakBonusCap, ECONOMY.streakBonusBase + streakWin);
    return { gold, spins: 0, streak: streakBonus };
  }
  if (result === 'draw') {
    return { gold: Math.floor(ECONOMY.baseIncome * 0.5), spins: 0, streak: 0 };
  }
  return { gold: Math.floor(ECONOMY.baseIncome * 0.5), spins: 0, streak: 0 };
}

/**
 * 商店里某个棋子的价格。
 * 星级越高越贵；同名棋子重复购买有轻微递增。
 */
export function shopPrice(templateCode, ownedCount = 0) {
  const t = TEMPLATE_BY_CODE[templateCode];
  if (!t) return 999;
  const base = 2 + Math.round(t.baseAttack / 18) + Math.round(t.baseHp / 160);
  return base + ownedCount;
}

/** 卖出返还 */
export function sellValue(piece) {
  const star = starOf(piece);
  return ECONOMY.sellRefundBase + star;
}

/** 星级：由等级推导，1-2 级 1★，3-4 级 2★……封顶 5★ */
export function starOf(piece) {
  return Math.max(1, Math.min(5, Math.ceil((piece.level ?? 1) / 2)));
}

/**
 * 刷新商店：生成 5 个槽位。
 * 槽位可以是棋子（常见）、装备（中概率）或卡牌（少量）。
 * @param {import('./rng.js').Rng} rng
 * @param {number} round 当前回合
 * @param {number} chapter 当前章节
 */
export function rollShop(rng, round, chapter) {
  const slots = [];
  // 章节越高，高星棋子出现概率越大
  const highStarChance = Math.min(0.45, 0.04 * chapter);
  for (let i = 0; i < ECONOMY.shopSlots; i++) {
    const roll = rng.float();
    if (roll < 0.10) {
      slots.push({ kind: 'card', price: 3 });
      continue;
    }
    if (roll < 0.28) {
      const eq = rng.pick(EQUIPMENTS.map((e) => ({
        ...e,
        weight: e.rarity === 'common' ? 50 : e.rarity === 'rare' ? 30 : 12,
      })));
      slots.push({
        kind: 'equipment',
        equipmentCode: eq.code,
        name: eq.name,
        rarity: eq.rarity,
        price: EQUIPMENT_PRICE[eq.rarity] ?? 12,
      });
      continue;
    }
    const pool = PIECE_TEMPLATES.map((t) => {
      let weight = t.shopWeight;
      if (t.code === 'king') weight *= 0.5 + chapter * 0.08;
      if (t.code === 'queen') weight *= 0.6 + chapter * 0.06;
      if (t.code === 'pawn') weight *= Math.max(0.4, 1.2 - chapter * 0.05);
      return { ...t, weight };
    });
    const chosen = rng.pick(pool);
    slots.push({
      kind: 'piece',
      templateId: chosen.id,
      templateCode: chosen.code,
      name: chosen.name,
      glyph: chosen.glyph,
      profession: chosen.profession,
      price: shopPrice(chosen.code),
      highStar: rng.chance(highStarChance),
    });
  }
  return slots;
}

/** 装备售价（按稀有度） */
export const EQUIPMENT_PRICE = { common: 12, rare: 20, epic: 32 };

/** 商店里买到的棋子的初始星级（受章节与 highStar 影响） */
export function shopStar(rng, chapter, highStar) {
  if (highStar) return Math.min(5, 2 + Math.floor(chapter / 4));
  const roll = rng.float();
  const bump = Math.min(0.25, chapter * 0.03);
  if (roll < 0.70 - bump) return 1;
  if (roll < 0.92 - bump * 0.5) return 2;
  return 3;
}
