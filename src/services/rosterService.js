/**
 * services/rosterService.js —— 阵容与养成。
 *
 * 每个写操作都是「校验 → 扣资源 → 改数据 → 落盘」，四步在同一个事务里。
 * 任何一步失败就整体回滚，**绝不出现「扣了钱没给东西」或者「白扣钱」**。
 */

import { transaction } from '../db/index.js';
import * as saveRepo from '../db/repo/saveRepo.js';
import * as metaRepo from '../db/repo/metaRepo.js';
import { Rng } from '../core/rng.js';
import {
  ascend,
  breakthrough,
  breakthroughCost,
  canTrain,
  train,
  trainCost,
} from '../core/progression.js';
import { applyCard, canEquip, describeEquipment } from '../core/items.js';
import { MAX_BOARD_PIECES } from '../core/balance.js';

class ServiceError extends Error {
  constructor(message, code = 'BAD_REQUEST') {
    super(message);
    this.code = code;
  }
}

/** 需要的存档，找不到就抛错 */
function requireSave(slot) {
  const save = saveRepo.getSaveRow(slot);
  if (!save) throw new ServiceError('存档不存在', 'NOT_FOUND');
  return save;
}

/* ------------------------------------------------------------------ *
 * 布阵
 * ------------------------------------------------------------------ */

/**
 * 设置棋盘站位。
 * @param {number} slot
 * @param {Array<{heroId:number, file:number, rank:number}>} placements
 */
export function setFormation(slot, placements) {
  return transaction(() => {
    const save = requireSave(slot);
    const heroes = saveRepo.listHeroes(save.id);
    const byId = new Map(heroes.map((h) => [h.id, h]));

    const occupied = new Map();
    const next = new Map();
    for (const p of placements) {
      const hero = byId.get(p.heroId);
      if (!hero) throw new ServiceError('棋子不存在', 'NOT_FOUND');
      if (p.file < 0 || p.file > 7 || p.rank < 0 || p.rank > 3) {
        throw new ServiceError('只能布置在己方半场（rank 0-3）', 'BAD_POSITION');
      }
      const key = `${p.file},${p.rank}`;
      if (occupied.has(key)) throw new ServiceError('同一格不能站两个棋子', 'BAD_POSITION');
      occupied.set(key, p.heroId);
      next.set(p.heroId, { file: p.file, rank: p.rank });
    }

    if (next.size > MAX_BOARD_PIECES) {
      throw new ServiceError(`最多上阵 ${MAX_BOARD_PIECES} 个棋子`, 'TOO_MANY');
    }

    // 先全部下场，再按新站位放上去
    for (const h of heroes) {
      const pos = next.get(h.id);
      const updated = {
        ...h,
        file: pos ? pos.file : null,
        rank: pos ? pos.rank : null,
      };
      saveRepo.updateHero(h.id, updated);
    }
    return { ok: true, count: next.size };
  });
}

/* ------------------------------------------------------------------ *
 * 训练
 * ------------------------------------------------------------------ */

export function trainHero(slot, heroId) {
  return transaction(() => {
    const save = requireSave(slot);
    const hero = saveRepo.getHero(heroId);
    if (!hero || !hero.exist) throw new ServiceError('棋子不存在', 'NOT_FOUND');
    const template = metaRepo.getTemplate(hero.templateId);
    if (!template) throw new ServiceError('棋子模板缺失', 'INTERNAL');

    const check = canTrain(hero, template);
    if (!check.ok) throw new ServiceError(check.reason, 'AT_CAP');

    const cost = trainCost(hero);
    if (save.gold < cost) throw new ServiceError(`金币不足，需要 ${cost}`, 'NO_GOLD');

    saveRepo.updateSave(save.id, { gold: save.gold - cost });
    const result = train(hero, template);
    if (!result.ok) throw new ServiceError(result.reason, 'AT_CAP');
    saveRepo.updateHero(heroId, hero);

    return { ok: true, cost, delta: result.delta, hero };
  });
}

/* ------------------------------------------------------------------ *
 * 升阶（融合）
 * ------------------------------------------------------------------ */

export function ascendHeroes(slot, heroIdA, heroIdB) {
  return transaction(() => {
    const save = requireSave(slot);
    const a = saveRepo.getHero(heroIdA);
    const b = saveRepo.getHero(heroIdB);
    if (!a || !b || !a.exist || !b.exist) throw new ServiceError('棋子不存在', 'NOT_FOUND');
    if (a.templateId !== b.templateId) throw new ServiceError('只能升阶同种棋子', 'BAD_PAIR');
    if (a.id === b.id) throw new ServiceError('不能与自己升阶', 'BAD_PAIR');

    const cost = 20 + a.level * 10;
    if (save.gold < cost) throw new ServiceError(`金币不足，需要 ${cost}`, 'NO_GOLD');

    const template = metaRepo.getTemplate(a.templateId);
    if (!template) throw new ServiceError('棋子模板缺失', 'INTERNAL');

    const merged = ascend(a, b, template);
    merged.id = a.id;
    merged.name = a.name;
    merged.voiceLine = a.voiceLine;
    merged.isAlly = a.isAlly;
    merged.exist = true;
    // 升阶后保留站位（用 a 的位置），否则下场
    merged.file = a.file;
    merged.rank = a.rank;

    saveRepo.updateSave(save.id, { gold: save.gold - cost });
    saveRepo.updateHero(a.id, merged);
    saveRepo.deleteHero(b.id);

    return { ok: true, cost, hero: merged };
  });
}

/* ------------------------------------------------------------------ *
 * 突破
 * ------------------------------------------------------------------ */

export function breakthroughHero(slot, heroId, statKey) {
  return transaction(() => {
    const save = requireSave(slot);
    const hero = saveRepo.getHero(heroId);
    if (!hero || !hero.exist) throw new ServiceError('棋子不存在', 'NOT_FOUND');
    const template = metaRepo.getTemplate(hero.templateId);
    if (!template) throw new ServiceError('棋子模板缺失', 'INTERNAL');

    const cost = breakthroughCost(hero);
    if (save.gold < cost) throw new ServiceError(`金币不足，需要 ${cost}`, 'NO_GOLD');

    // 需要一个可复现的随机数：从存档的 RNG 状态取
    const rng = Rng.restore(save.rngState?.seed ? save.rngState : { seed: save.rngSeed });

    const result = breakthrough(hero, statKey, rng, template);
    if (!result.ok) throw new ServiceError(result.reason, 'BAD_REQUEST');

    saveRepo.updateSave(save.id, { gold: save.gold - cost, rng_state: rng.snapshot() });
    saveRepo.updateHero(heroId, hero);

    return { ok: true, cost, ...result, hero };
  });
}

/* ------------------------------------------------------------------ *
 * 附魔（卡牌）
 * ------------------------------------------------------------------ */

export function enchantHero(slot, heroId, saveCardId) {
  return transaction(() => {
    const save = requireSave(slot);
    const hero = saveRepo.getHero(heroId);
    if (!hero || !hero.exist) throw new ServiceError('棋子不存在', 'NOT_FOUND');

    const card = saveRepo.listSaveCards(save.id).find((c) => c.id === saveCardId);
    if (!card) throw new ServiceError('卡牌不存在', 'NOT_FOUND');
    if (card.isUsed) throw new ServiceError('这张卡已经用过了', 'BAD_REQUEST');

    const cost = 5 + hero.level * 3;
    if (save.gold < cost) throw new ServiceError(`金币不足，需要 ${cost}`, 'NO_GOLD');

    const res = applyCard(hero, {
      stat: card.stat,
      operation: card.operation,
      value: card.value,
    });
    if (!res.ok) throw new ServiceError(res.reason, 'BAD_REQUEST');
    if (!res.effective) {
      throw new ServiceError('属性已达上限，这张卡不会生效', 'AT_CAP');
    }

    saveRepo.updateSave(save.id, { gold: save.gold - cost });
    saveRepo.markCardUsed(saveCardId, heroId);
    saveRepo.updateHero(heroId, hero);

    return { ok: true, cost, card, hero };
  });
}

/* ------------------------------------------------------------------ *
 * 装备
 * ------------------------------------------------------------------ */

export function toggleEquipment(slot, heroId, equipmentCode) {
  return transaction(() => {
    const save = requireSave(slot);
    const hero = saveRepo.getHero(heroId);
    if (!hero || !hero.exist) throw new ServiceError('棋子不存在', 'NOT_FOUND');

    const items = [...(hero.items ?? [])];
    const idx = items.indexOf(equipmentCode);
    if (idx >= 0) {
      items.splice(idx, 1);
    } else {
      const check = canEquip(hero, equipmentCode);
      if (!check.ok) throw new ServiceError(check.reason, 'BAD_REQUEST');
      items.push(equipmentCode);
    }

    hero.items = items;
    saveRepo.updateHero(heroId, hero);
    return { ok: true, items, describe: describeEquipment(equipmentCode) };
  });
}

/**
 * 把背包里的装备装到棋子身上（并从背包移除）。
 * 装备只有在商店里买得到 —— 没有装备就等于没有这个系统。
 */
export function equipFromBag(slot, itemId, heroId) {
  return transaction(() => {
    const save = requireSave(slot);
    const hero = saveRepo.getHero(heroId);
    if (!hero || !hero.exist) throw new ServiceError('棋子不存在', 'NOT_FOUND');

    const item = saveRepo.listItems(save.id).find((i) => i.id === itemId);
    if (!item) throw new ServiceError('装备不存在', 'NOT_FOUND');

    const check = canEquip(hero, item.code);
    if (!check.ok) throw new ServiceError(check.reason, 'BAD_REQUEST');

    hero.items = [...(hero.items ?? []), item.code];
    saveRepo.updateHero(heroId, hero);
    saveRepo.removeItem(itemId);

    return { ok: true, items: hero.items, describe: describeEquipment(item.code) };
  });
}

/** 装备背包 */
export function listBag(slot) {
  const save = requireSave(slot);
  return saveRepo.listItems(save.id);
}

export { ServiceError };
