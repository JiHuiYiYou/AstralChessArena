/**
 * services/shopService.js —— 商店：购买、出售、刷新。
 *
 * 原版的 market[].number 是死字段（永远 0），商店是无限供应的静态价目表（bug ⑱）。
 * 这里每次回合真实刷新 5 个槽位，售出后标记 sold。
 */

import { transaction } from '../db/index.js';
import * as saveRepo from '../db/repo/saveRepo.js';
import * as metaRepo from '../db/repo/metaRepo.js';
import { Rng } from '../core/rng.js';
import { ECONOMY } from '../core/balance.js';
import { createPiece } from '../core/progression.js';
import { rollCard } from '../core/items.js';
import { rollShop, sellValue, shopStar, roundIncome } from '../core/economy.js';

class ServiceError extends Error {
  constructor(message, code = 'BAD_REQUEST') {
    super(message);
    this.code = code;
  }
}

function requireSave(slot) {
  const save = saveRepo.getSaveRow(slot);
  if (!save) throw new ServiceError('存档不存在', 'NOT_FOUND');
  return save;
}

function rngOf(save) {
  return Rng.restore(save.rngState?.seed ? save.rngState : { seed: save.rngSeed });
}

/** 商店面板数据 */
export function getShop(slot) {
  const save = requireSave(slot);
  const slots = saveRepo.listShopSlots(save.id);
  const freeLeft = Math.max(0, ECONOMY.shopFreeRefreshPerRound - (save.shopRefreshedRound === save.round ? 1 : 0));
  return {
    gold: save.gold,
    round: save.round,
    slots,
    refreshCost: freeLeft > 0 ? 0 : ECONOMY.shopRefreshCost,
    freeRefreshLeft: freeLeft,
  };
}

/**
 * 购买商店槽位。
 */
export function buy(slot, slotIndex) {
  return transaction(() => {
    const save = requireSave(slot);
    const slots = saveRepo.listShopSlots(save.id);
    const target = slots.find((s) => s.slotIndex === slotIndex);
    if (!target) throw new ServiceError('商店槽位不存在', 'NOT_FOUND');
    if (target.sold) throw new ServiceError('这个槽位已经卖掉了', 'BAD_REQUEST');
    if (save.gold < target.price) throw new ServiceError(`金币不足，需要 ${target.price}`, 'NO_GOLD');

    const rng = rngOf(save);
    let created = null;

    if (target.kind === 'card') {
      const pool = metaRepo.listCards();
      const card = rollCard(rng, pool.length ? pool.map((c) => ({
        key: c.stat,
        name: c.statName,
        addMax: c.value,
        mulMin: 1.0,
        mulMax: 1.3,
        rarity: c.rarity,
        weight: c.weight,
      })) : []);
      if (!card) throw new ServiceError('卡池为空', 'INTERNAL');
      const base = pool.find((c) => c.stat === card.stat);
      const cardId = saveRepo.insertSaveCard(save.id, base.id);
      created = { kind: 'card', cardId, stat: card.stat, statName: card.statName, operation: card.operation, value: card.value };
    } else {
      const template = metaRepo.getTemplate(target.templateId);
      if (!template) throw new ServiceError('棋子模板缺失', 'INTERNAL');
      const star = shopStar(rng, save.chapter, target.star > 1);
      const p = createPiece(template, { level: Math.max(1, star), star });
      p.name = template.name;
      p.voiceLine = '';
      p.isAlly = true;
      p.file = null;
      p.rank = null;
      const heroId = saveRepo.insertHero(save.id, p);
      created = { kind: 'piece', heroId, templateCode: template.code, name: template.name, star };
    }

    saveRepo.updateSave(save.id, { gold: save.gold - target.price, rng_state: rng.snapshot() });
    saveRepo.markSlotSold(save.id, slotIndex);

    return { ok: true, price: target.price, created, gold: save.gold - target.price };
  });
}

/**
 * 出售棋子。
 */
export function sell(slot, heroId) {
  return transaction(() => {
    const save = requireSave(slot);
    const hero = saveRepo.getHero(heroId);
    if (!hero || !hero.exist) throw new ServiceError('棋子不存在', 'NOT_FOUND');
    if (hero.file !== null && hero.rank !== null) {
      throw new ServiceError('先把它从棋盘上撤下来再卖', 'ON_BOARD');
    }
    const refund = sellValue(hero);
    saveRepo.updateSave(save.id, { gold: save.gold + refund });
    saveRepo.deleteHero(heroId);
    return { ok: true, refund, gold: save.gold + refund };
  });
}

/**
 * 刷新商店。
 */
export function refresh(slot) {
  return transaction(() => {
    const save = requireSave(slot);
    const freeLeft = Math.max(0, ECONOMY.shopFreeRefreshPerRound - (save.shopRefreshedRound === save.round ? 1 : 0));
    const cost = freeLeft > 0 ? 0 : ECONOMY.shopRefreshCost;
    if (save.gold < cost) throw new ServiceError(`金币不足，刷新需要 ${cost}`, 'NO_GOLD');

    const rng = rngOf(save);
    const slots = rollShop(rng, save.round, save.chapter);
    saveRepo.replaceShop(save.id, slots);
    saveRepo.updateSave(save.id, {
      gold: save.gold - cost,
      shop_refreshed_round: save.round,
      rng_state: rng.snapshot(),
    });
    return { ok: true, cost, slots: saveRepo.listShopSlots(save.id), gold: save.gold - cost };
  });
}

/**
 * 回合开始：发收入、刷商店、推进回合。
 */
export function startRound(slot) {
  return transaction(() => {
    const save = requireSave(slot);
    const rng = rngOf(save);
    const income = roundIncome({ gold: save.gold, streakWin: save.streakWin, streakLose: save.streakLose });

    const slots = rollShop(rng, save.round + 1, save.chapter);
    saveRepo.replaceShop(save.id, slots);
    saveRepo.updateSave(save.id, {
      gold: save.gold + income.total,
      round: save.round + 1,
      shop_refreshed_round: 0,
      rng_state: rng.snapshot(),
    });

    return { ok: true, income, gold: save.gold + income.total, round: save.round + 1, slots };
  });
}

export { ServiceError };
