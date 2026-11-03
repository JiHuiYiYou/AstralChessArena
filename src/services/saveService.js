/**
 * services/saveService.js —— 存档读写。
 *
 * 关键：所有写操作都在**一个事务**里落盘（原版 bug ⑫：
 * 原版只在锻造/合成/战斗结束三处 autosave，买东西、升级、附魔都不落盘）。
 */

import { getDb, transaction } from '../db/index.js';
import { randomSeed, Rng } from '../core/rng.js';
import { rollShop } from '../core/economy.js';
import { createPiece } from '../core/progression.js';
import { powerOf } from '../core/combat.js';
import { TEMPLATE_BY_CODE } from '../core/balance.js';
import * as saveRepo from '../db/repo/saveRepo.js';

/** 读出某个槽位的完整状态 */
export function getState(slot) {
  const save = saveRepo.getSaveRow(slot);
  if (!save) return null;
  return {
    save,
    // 战力在服务端算好 —— 前端只负责显示，不重复实现公式
    heroes: saveRepo.listHeroes(save.id).map((h) => ({ ...h, power: powerOf(h) })),
    cards: saveRepo.listSaveCards(save.id),
    items: saveRepo.listItems(save.id),
    shop: saveRepo.listShopSlots(save.id),
  };
}

/** 存档列表（带摘要） */
export function listAll() {
  return saveRepo.listSaves();
}

/**
 * 新建（或覆盖）一个存档。
 * @param {number} slot 1-3
 */
export function createNew(slot) {
  const seed = randomSeed();
  const rng = new Rng(seed);

  return transaction((d) => {
    d.prepare('DELETE FROM save_heroes WHERE save_id IN (SELECT id FROM saves WHERE slot = ?)').run(slot);
    d.prepare('DELETE FROM save_cards WHERE save_id IN (SELECT id FROM saves WHERE slot = ?)').run(slot);
    d.prepare('DELETE FROM save_items WHERE save_id IN (SELECT id FROM saves WHERE slot = ?)').run(slot);
    d.prepare('DELETE FROM shop_slots WHERE save_id IN (SELECT id FROM saves WHERE slot = ?)').run(slot);

    const save = saveRepo.createSave(slot, seed, rng.snapshot());
    const rngSnap = rng.snapshot();
    saveRepo.updateSave(save.id, { rng_state: rngSnap });

    // 起手：两个棋子（兵 + 马），给点启动金币
    const starters = [
      { code: 'pawn', file: 3, rank: 0 },
      { code: 'knight', file: 4, rank: 0 },
    ];
    for (const s of starters) {
      const p = createPiece(TEMPLATE_BY_CODE[s.code], { level: 1 });
      p.name = s.code === 'pawn' ? '新兵' : '游侠';
      p.voiceLine = s.code === 'pawn' ? '为了荣耀！' : '取你首级。';
      p.isAlly = true;
      p.file = s.file;
      p.rank = s.rank;
      saveRepo.insertHero(save.id, p);
    }

    saveRepo.updateSave(save.id, { gold: 60 });
    saveRepo.replaceShop(save.id, rollShop(rng, 1, 1));

    return getState(slot);
  });
}

/**
 * 整体保存一次（前端提交完整状态，服务端校验后落盘）。
 * @param {number} slot
 * @param {object} payload { heroes, shop, gold, chapter, round, ... }
 */
export function saveState(slot, payload) {
  return transaction((d) => {
    const save = saveRepo.getSaveRow(slot);
    if (!save) throw Object.assign(new Error('存档不存在'), { code: 'NOT_FOUND' });

    if (payload.heroes) {
      saveRepo.clearHeroes(save.id);
      for (const h of payload.heroes) {
        saveRepo.insertHero(save.id, h);
      }
    }
    if (payload.shop) saveRepo.replaceShop(save.id, payload.shop);
    if (payload.cards) {
      d.prepare('DELETE FROM save_cards WHERE save_id = ?').run(save.id);
      for (const c of payload.cards) {
        if (c.cardId) saveRepo.insertSaveCard(save.id, c.cardId);
      }
    }
    saveRepo.updateSave(save.id, {
      gold: payload.gold,
      chapter: payload.chapter,
      round: payload.round,
      streak_win: payload.streakWin,
      streak_lose: payload.streakLose,
      shop_refreshed_round: payload.shopRefreshedRound,
      rng_seed: payload.rngSeed,
      rng_state: payload.rngState,
    });
    return getState(slot);
  });
}

/** 删除存档 */
export function remove(slot) {
  return transaction(() => {
    const save = saveRepo.getSaveRow(slot);
    if (!save) return false;
    getDb().prepare('DELETE FROM saves WHERE id = ?').run(save.id);
    return true;
  });
}
