/**
 * http/routes/index.js —— 把所有 API 挂到路由上。
 */

import { createRouter } from '../router.js';
import * as metaRepo from '../../db/repo/metaRepo.js';
import * as saveService from '../../services/saveService.js';
import * as rosterService from '../../services/rosterService.js';
import * as shopService from '../../services/shopService.js';
import * as battleService from '../../services/battleService.js';
import {
  BREAKTHROUGH_STATS,
  CARD_STATS,
  EQUIPMENTS,
  MAX_BOARD_PIECES,
  PIECE_TEMPLATES,
  PROFESSIONS,
  SYNERGY_TIERS,
} from '../../core/balance.js';

export function buildRouter() {
  const router = createRouter();

  /* ---------------- 元数据 ---------------- */

  router.get('/api/meta', () => ({
    professions: PROFESSIONS,
    synergyTiers: SYNERGY_TIERS,
    templates: metaRepo.listTemplates(),
    equipments: metaRepo.listEquipments(),
    cards: metaRepo.listCards(),
    breakthroughStats: BREAKTHROUGH_STATS,
    maxBoardPieces: MAX_BOARD_PIECES,
    limits: {
      items: 3,
      shopSlots: 5,
    },
  }));

  /* ---------------- 存档 ---------------- */

  router.get('/api/saves', () => saveService.listAll());

  router.post('/api/saves/:slot', ({ params }) => saveService.createNew(Number(params.slot)));

  router.get('/api/saves/:slot', ({ params }) => {
    const state = saveService.getState(Number(params.slot));
    if (!state) {
      throw Object.assign(new Error('存档不存在'), { code: 'NOT_FOUND' });
    }
    return state;
  });

  router.put('/api/saves/:slot', ({ params, body }) => saveService.saveState(Number(params.slot), body));

  router.delete('/api/saves/:slot', ({ params }) => ({ removed: saveService.remove(Number(params.slot)) }));

  /* ---------------- 阵容与养成 ---------------- */

  router.post('/api/saves/:slot/formation', ({ params, body }) =>
    rosterService.setFormation(Number(params.slot), body.placements ?? []));

  router.post('/api/saves/:slot/train', ({ params, body }) =>
    rosterService.trainHero(Number(params.slot), Number(body.heroId)));

  router.post('/api/saves/:slot/ascend', ({ params, body }) =>
    rosterService.ascendHeroes(Number(params.slot), Number(body.heroIdA), Number(body.heroIdB)));

  router.post('/api/saves/:slot/breakthrough', ({ params, body }) =>
    rosterService.breakthroughHero(Number(params.slot), Number(body.heroId), body.stat));

  router.post('/api/saves/:slot/enchant', ({ params, body }) =>
    rosterService.enchantHero(Number(params.slot), Number(body.heroId), Number(body.saveCardId)));

  router.post('/api/saves/:slot/equip', ({ params, body }) =>
    rosterService.toggleEquipment(Number(params.slot), Number(body.heroId), body.equipmentCode));

  router.get('/api/saves/:slot/bag', ({ params }) => rosterService.listBag(Number(params.slot)));

  router.post('/api/saves/:slot/equip-item', ({ params, body }) =>
    rosterService.equipFromBag(Number(params.slot), Number(body.itemId), Number(body.heroId)));

  /* ---------------- 商店 ---------------- */

  router.get('/api/saves/:slot/shop', ({ params }) => shopService.getShop(Number(params.slot)));

  router.post('/api/saves/:slot/shop/buy', ({ params, body }) =>
    shopService.buy(Number(params.slot), Number(body.slotIndex)));

  router.post('/api/saves/:slot/shop/sell', ({ params, body }) =>
    shopService.sell(Number(params.slot), Number(body.heroId)));

  router.post('/api/saves/:slot/shop/refresh', ({ params }) => shopService.refresh(Number(params.slot)));

  router.post('/api/saves/:slot/round', ({ params }) => shopService.startRound(Number(params.slot)));

  /* ---------------- 战斗 ---------------- */

  router.post('/api/saves/:slot/battle', ({ params }) => battleService.startBattle(Number(params.slot)));

  router.post('/api/saves/:slot/chapter', ({ params, body }) =>
    battleService.setChapter(Number(params.slot), Number(body.chapter)));

  router.get('/api/saves/:slot/battles', ({ params, query }) =>
    battleService.listBattles(Number(params.slot), Number(query.limit ?? 30)));

  router.get('/api/battles/:id', ({ params }) => {
    const b = battleService.getBattle(Number(params.id));
    if (!b) throw Object.assign(new Error('战斗记录不存在'), { code: 'NOT_FOUND' });
    return b;
  });

  /* ---------------- 静态常量（给前端做提示文案） ---------------- */

  router.get('/api/reference', () => ({
    professions: PROFESSIONS,
    templates: PIECE_TEMPLATES,
    cards: CARD_STATS,
    equipments: EQUIPMENTS,
  }));

  return router;
}
