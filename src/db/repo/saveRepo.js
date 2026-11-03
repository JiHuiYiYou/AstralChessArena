/**
 * db/repo/saveRepo.js —— 存档、存档内棋子/卡牌、商店槽位。
 */

import { getDb, parseJson, queryAll, queryOne } from '../index.js';

/* -------------------------- 存档 -------------------------- */

export function listSaves() {
  return queryAll(`
    SELECT s.*,
      (SELECT COUNT(*) FROM save_heroes h WHERE h.save_id = s.id AND h.exist = 1) AS hero_count,
      (SELECT COUNT(*) FROM save_heroes h WHERE h.save_id = s.id AND h.exist = 1 AND h.is_ally = 1) AS ally_count,
      (SELECT COUNT(*) FROM save_cards c WHERE c.save_id = s.id AND c.is_used = 0) AS card_count
    FROM saves s ORDER BY s.slot
  `).map(mapSaveSummary);
}

export function getSaveRow(slot) {
  const row = queryOne('SELECT * FROM saves WHERE slot = ?', slot);
  return row ? mapSave(row) : null;
}

export function createSave(slot, rngSeed, rngState) {
  const db = getDb();
  db.prepare(`
    INSERT INTO saves (slot, rng_seed, rng_state)
    VALUES (?, ?, ?)
    ON CONFLICT(slot) DO UPDATE SET
      version = saves.version + 1,
      gold = excluded.gold,
      chapter = excluded.chapter,
      round = excluded.round,
      streak_win = 0,
      streak_lose = 0,
      shop_refreshed_round = 0,
      rng_seed = excluded.rng_seed,
      rng_state = excluded.rng_state,
      created_at = datetime('now'),
      updated_at = datetime('now')
  `).run(slot, rngSeed, JSON.stringify(rngState ?? {}));
  return getSaveRow(slot);
}

export function updateSave(saveId, fields) {
  const allowed = new Set([
    'gold', 'chapter', 'max_chapter', 'round', 'streak_win', 'streak_lose',
    'shop_refreshed_round', 'rng_seed', 'rng_state',
  ]);
  const sets = [];
  const values = [];
  for (const [k, v] of Object.entries(fields)) {
    const key = snake(k);
    if (!allowed.has(key)) continue;
    sets.push(`${key} = ?`);
    values.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
  }
  if (sets.length === 0) return;
  values.push(saveId);
  getDb().prepare(`UPDATE saves SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values);
}

/* -------------------------- 棋子 -------------------------- */

/**
 * 棋子要 JOIN 模板表才能拿到 code / glyph / 职业 ——
 * save_heroes 只存 template_id，属性全是「这个棋子自己的」，不随模板变。
 */
const HERO_SELECT = `
  SELECT h.*, t.code AS tpl_code, t.glyph AS tpl_glyph, t.name AS tpl_name,
         p.code AS profession_code, p.name AS profession_name, p.color AS profession_color
  FROM save_heroes h
  JOIN piece_templates t ON t.id = h.template_id
  JOIN professions p ON p.id = t.profession_id
`;

export function listHeroes(saveId) {
  return queryAll(`${HERO_SELECT} WHERE h.save_id = ? ORDER BY h.id`, saveId).map(mapHero);
}

export function getHero(heroId) {
  const row = queryOne(`${HERO_SELECT} WHERE h.id = ?`, heroId);
  return row ? mapHero(row) : null;
}

export function insertHero(saveId, hero) {
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO save_heroes (
      save_id, template_id, name, voice_line, is_ally, exist,
      board_file, board_rank, star, level, base_score,
      attack, hp, max_hp, speed, shield,
      crit_rate, crit_mult, dodge, defense, recovery,
      final_damage_mult, ult_mult, ult_cd, train_count,
      items_json, attributes_json, bonus_json, is_king
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    saveId, hero.templateId, hero.name, hero.voiceLine ?? '', hero.isAlly ? 1 : 0, hero.exist === false ? 0 : 1,
    hero.file ?? null, hero.rank ?? null, hero.star ?? 1, hero.level ?? 1, hero.baseScore ?? 1,
    hero.attack, hero.hp, hero.maxHp, hero.speed ?? 3, hero.shield ?? 0,
    hero.critRate ?? 0, hero.critMult ?? 1, hero.dodge ?? 0, hero.defense ?? 0, hero.recovery ?? 0,
    hero.finalDamageMult ?? 1, hero.ultMult ?? 1, hero.ultCd ?? 3, hero.trainCount ?? 0,
    JSON.stringify(hero.items ?? []), JSON.stringify(hero.attributes ?? {}),
    JSON.stringify(hero.breakthroughBonus ?? {}), hero.isKing ? 1 : 0,
  );
  return Number(info.lastInsertRowid);
}

export function updateHero(heroId, hero) {
  const db = getDb();
  db.prepare(`
    UPDATE save_heroes SET
      name = ?, voice_line = ?, exist = ?, board_file = ?, board_rank = ?,
      star = ?, level = ?, base_score = ?, attack = ?, hp = ?, max_hp = ?,
      speed = ?, shield = ?, crit_rate = ?, crit_mult = ?, dodge = ?, defense = ?,
      recovery = ?, final_damage_mult = ?, ult_mult = ?, ult_cd = ?, train_count = ?,
      items_json = ?, attributes_json = ?, bonus_json = ?, is_king = ?
    WHERE id = ?
  `).run(
    hero.name, hero.voiceLine ?? '', hero.exist === false ? 0 : 1,
    hero.file ?? null, hero.rank ?? null,
    hero.star ?? 1, hero.level ?? 1, hero.baseScore ?? 1,
    hero.attack, hero.hp, hero.maxHp, hero.speed ?? 3, hero.shield ?? 0,
    hero.critRate ?? 0, hero.critMult ?? 1, hero.dodge ?? 0, hero.defense ?? 0, hero.recovery ?? 0,
    hero.finalDamageMult ?? 1, hero.ultMult ?? 1, hero.ultCd ?? 3, hero.trainCount ?? 0,
    JSON.stringify(hero.items ?? []), JSON.stringify(hero.attributes ?? {}),
    JSON.stringify(hero.breakthroughBonus ?? {}), hero.isKing ? 1 : 0,
    hero.id,
  );
}

export function deleteHero(heroId) {
  getDb().prepare('DELETE FROM save_heroes WHERE id = ?').run(heroId);
}

export function clearHeroes(saveId) {
  getDb().prepare('DELETE FROM save_heroes WHERE save_id = ?').run(saveId);
}

/* -------------------------- 卡牌 -------------------------- */

export function listSaveCards(saveId) {
  return queryAll(`
    SELECT sc.*, c.code, c.stat, c.stat_name, c.operation, c.value, c.rarity
    FROM save_cards sc JOIN cards c ON c.id = sc.card_id
    WHERE sc.save_id = ? ORDER BY sc.id
  `, saveId).map((r) => ({
    id: r.id,
    cardId: r.card_id,
    code: r.code,
    stat: r.stat,
    statName: r.stat_name,
    operation: r.operation,
    value: r.value,
    rarity: r.rarity,
    isUsed: !!r.is_used,
    usedHeroId: r.used_hero_id,
  }));
}

export function insertSaveCard(saveId, cardId) {
  const info = getDb().prepare('INSERT INTO save_cards (save_id, card_id) VALUES (?, ?)').run(saveId, cardId);
  return Number(info.lastInsertRowid);
}

export function markCardUsed(saveCardId, heroId) {
  getDb().prepare('UPDATE save_cards SET is_used = 1, used_hero_id = ? WHERE id = ?').run(heroId, saveCardId);
}

/* -------------------------- 装备背包 -------------------------- */

export function listItems(saveId) {
  return queryAll(
    'SELECT id, equipment_code, acquired_at FROM save_items WHERE save_id = ? ORDER BY id',
    saveId,
  ).map((r) => ({
    id: r.id,
    code: r.equipment_code,
    acquiredAt: r.acquired_at,
  }));
}

export function insertItem(saveId, equipmentCode) {
  const info = getDb()
    .prepare('INSERT INTO save_items (save_id, equipment_code) VALUES (?, ?)')
    .run(saveId, equipmentCode);
  return Number(info.lastInsertRowid);
}

export function removeItem(itemId) {
  getDb().prepare('DELETE FROM save_items WHERE id = ?').run(itemId);
}

/* -------------------------- 商店 -------------------------- */

export function listShopSlots(saveId) {
  return queryAll(`
    SELECT ss.*, t.code AS template_code, t.glyph AS template_glyph,
           p.name AS profession_name, p.color AS profession_color
    FROM shop_slots ss
    LEFT JOIN piece_templates t ON t.id = ss.template_id
    LEFT JOIN professions p ON p.code = ss.profession
    WHERE ss.save_id = ? ORDER BY ss.slot_index
  `, saveId).map((r) => ({
    id: r.id,
    slotIndex: r.slot_index,
    kind: r.kind,
    templateId: r.template_id,
    templateCode: r.template_code,
    cardId: r.card_id,
    equipmentCode: r.equipment_code,
    name: r.name,
    glyph: r.glyph || r.template_glyph || '',
    profession: r.profession,
    professionName: r.profession_name,
    professionColor: r.profession_color,
    rarity: r.rarity,
    star: r.star,
    price: r.price,
    sold: !!r.sold,
  }));
}

export function replaceShop(saveId, slots) {
  const db = getDb();
  db.prepare('DELETE FROM shop_slots WHERE save_id = ?').run(saveId);
  const ins = db.prepare(`
    INSERT INTO shop_slots (save_id, slot_index, kind, template_id, card_id, equipment_code,
                            name, glyph, profession, rarity, star, price, sold)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)
  `);
  slots.forEach((s, i) => {
    ins.run(
      saveId, i, s.kind, s.templateId ?? null, s.cardId ?? null, s.equipmentCode ?? '',
      s.name ?? '', s.glyph ?? '', s.profession ?? '', s.rarity ?? '', s.star ?? 1, s.price ?? 0,
    );
  });
}

export function markSlotSold(saveId, slotIndex) {
  getDb().prepare('UPDATE shop_slots SET sold = 1 WHERE save_id = ? AND slot_index = ?').run(saveId, slotIndex);
}

/* -------------------------- 映射 -------------------------- */

function mapSave(r) {
  return {
    id: r.id,
    slot: r.slot,
    version: r.version,
    gold: r.gold,
    chapter: r.chapter,
    maxChapter: r.max_chapter,
    round: r.round,
    streakWin: r.streak_win,
    streakLose: r.streak_lose,
    shopRefreshedRound: r.shop_refreshed_round,
    rngSeed: r.rng_seed,
    rngState: parseJson(r.rng_state, {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapSaveSummary(r) {
  return {
    id: r.id,
    slot: r.slot,
    version: r.version,
    gold: r.gold,
    chapter: r.chapter,
    maxChapter: r.max_chapter,
    round: r.round,
    heroCount: r.hero_count,
    allyCount: r.ally_count,
    cardCount: r.card_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapHero(r) {
  return {
    id: r.id,
    saveId: r.save_id,
    templateId: r.template_id,
    code: r.tpl_code,
    glyph: r.tpl_glyph,
    templateName: r.tpl_name,
    profession: r.profession_code,
    professionName: r.profession_name,
    professionColor: r.profession_color,
    name: r.name,
    voiceLine: r.voice_line,
    isAlly: !!r.is_ally,
    exist: !!r.exist,
    file: r.board_file,
    rank: r.board_rank,
    star: r.star,
    level: r.level,
    baseScore: r.base_score,
    attack: r.attack,
    hp: r.hp,
    maxHp: r.max_hp,
    speed: r.speed,
    shield: r.shield,
    critRate: r.crit_rate,
    critMult: r.crit_mult,
    dodge: r.dodge,
    defense: r.defense,
    recovery: r.recovery,
    finalDamageMult: r.final_damage_mult,
    ultMult: r.ult_mult,
    ultCd: r.ult_cd,
    trainCount: r.train_count,
    items: parseJson(r.items_json, []),
    attributes: parseJson(r.attributes_json, {}),
    breakthroughBonus: parseJson(r.bonus_json, {}),
    isKing: !!r.is_king,
  };
}

function snake(k) {
  return k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}
