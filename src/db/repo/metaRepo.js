/**
 * db/repo/metaRepo.js —— 静态内容的只读查询。
 */

import { parseJson, queryAll, queryOne } from '../index.js';

/** 棋子模板 */
export function listTemplates() {
  return queryAll(`
    SELECT t.*, p.code AS profession_code, p.name AS profession_name, p.color AS profession_color
    FROM piece_templates t JOIN professions p ON p.id = t.profession_id
    ORDER BY t.id
  `).map(mapTemplate);
}

export function getTemplate(id) {
  const row = queryOne(`
    SELECT t.*, p.code AS profession_code, p.name AS profession_name, p.color AS profession_color
    FROM piece_templates t JOIN professions p ON p.id = t.profession_id
    WHERE t.id = ?
  `, id);
  return row ? mapTemplate(row) : null;
}

function mapTemplate(r) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    glyph: r.glyph,
    movement: r.movement,
    skillName: r.skill_name,
    skillDesc: r.skill_desc,
    professionId: r.profession_id,
    profession: r.profession_code,
    professionCode: r.profession_code,
    professionName: r.profession_name,
    professionColor: r.profession_color,
    baseAttack: r.base_attack,
    baseHp: r.base_hp,
    baseSpeed: r.base_speed,
    baseCritRate: r.base_crit_rate,
    baseCritMult: r.base_crit_mult,
    baseDodge: r.base_dodge,
    baseDefense: r.base_defense,
    baseUltMult: r.base_ult_mult,
    baseUltCd: r.base_ult_cd,
    baseRecovery: r.base_recovery,
    shopWeight: r.shop_weight,
    promoteTo: parseJson(r.promote_to, []),
  };
}

/** 装备 */
export function listEquipments() {
  return queryAll('SELECT * FROM equipments ORDER BY id').map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    rarity: r.rarity,
    slot: r.slot,
    effect: parseJson(r.effect_json, {}),
  }));
}

/** 卡牌 */
export function listCards() {
  return queryAll('SELECT * FROM cards ORDER BY id').map((r) => ({
    id: r.id,
    code: r.code,
    stat: r.stat,
    statName: r.stat_name,
    operation: r.operation,
    value: r.value,
    rarity: r.rarity,
    weight: r.weight,
  }));
}
