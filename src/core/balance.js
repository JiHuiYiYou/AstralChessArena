/**
 * balance.js —— 全部数值表集中在这里。
 *
 * 设计原则（相对原版《星穹弈境》的改动见 SPEC.md「已修复 bug 对照表」）：
 *  - 成长是**乘法**的（每级上限 ×1.35，训练 ×1.12），数值能膨胀到百万级 → 割草爽感。
 *  - 升阶（融合）取「大的 + 小的 50%」，**不取平均** → 原版 bug ⑧。
 *  - 每个属性都有明确上限，撞上限时禁止操作并提示，**不吞资源** → 原版 bug ③。
 *  - `finalDamageMult` 是真实存在的结算项 → 原版 bug ①。
 */

/* ------------------------------------------------------------------ *
 * 职业
 * ------------------------------------------------------------------ */

export const PROFESSIONS = [
  { id: 1, code: 'assassin', name: '影刃', color: '#ff4757', blurb: '暴击与连击的极限，擅长一击打穿后排。' },
  { id: 2, code: 'mage', name: '奥术师', color: '#b829dd', blurb: '远程法术压制，大招倍率极高。' },
  { id: 3, code: 'healer', name: '圣疗者', color: '#2ed573', blurb: '治疗与护盾的提供者，前期最稳。' },
  { id: 4, code: 'guard', name: '铁卫', color: '#2d8cf0', blurb: '高生命与减伤，扛住伤害等待反击。' },
];

export const PROFESSION_BY_CODE = Object.fromEntries(PROFESSIONS.map((p) => [p.code, p]));

/* ------------------------------------------------------------------ *
 * 羁绊：同职业件数 → 三档加成
 * ------------------------------------------------------------------ */

export const SYNERGY_TIERS = [
  { tier: 1, count_required: 2, atk: 0.10, hp: 0.05, skill: 0.0, passive: null },
  { tier: 2, count_required: 4, atk: 0.25, hp: 0.12, skill: 0.25, passive: null },
  { tier: 3, count_required: 6, atk: 0.50, hp: 0.25, skill: 0.50, passive: 'combo' },
];

/** 6 件档专属被动：影刃暴击必带连击 */
export const SYNERGY_PASSIVES = {
  assassin: { code: 'combo', name: '影刃 6 件：暴击必定触发连击' },
};

/* ------------------------------------------------------------------ *
 * 棋子模板（棋盘上的 6 种国际象棋棋子）
 *
 * 攻击范围 = 走法（马/象/车/后/王一致），兵的移动与攻击分离（斜前吃子）。
 *
 * 字段一律用 camelCase —— 与 API / DB 映射层保持同一种形状，
 * 免得「一处 snake_case 一处 camelCase」把属性算成 NaN。
 * ------------------------------------------------------------------ */

export const PIECE_TEMPLATES = [
  {
    id: 1, code: 'pawn', name: '兵', glyph: '♟', movement: '前进 1 格（首动可 2 格），斜前方 1 格吃子；抵达底线升变。',
    profession: 'healer',
    baseAttack: 60, baseHp: 850, baseSpeed: 3,
    baseCritRate: 0.05, baseCritMult: 1.5, baseDodge: 0.02, baseDefense: 0.05,
    baseUltMult: 1.5, baseUltCd: 3, baseRecovery: 40,
    skillName: '战地鼓舞', skillDesc: '治疗全体友军并提供护盾。',
    shopWeight: 34, promoteTo: ['knight', 'bishop', 'rook'],
  },
  {
    id: 2, code: 'knight', name: '马', glyph: '♞', movement: '日字 8 格跳跃，受蹩马腿限制。',
    profession: 'assassin',
    baseAttack: 120, baseHp: 780, baseSpeed: 8,
    baseCritRate: 0.35, baseCritMult: 2.5, baseDodge: 0.12, baseDefense: 0.02,
    baseUltMult: 2.0, baseUltCd: 3, baseRecovery: 0,
    skillName: '影刃连斩', skillDesc: '连续斩击，本次行动额外发动一次攻击。',
    shopWeight: 28, promoteTo: null,
  },
  {
    id: 3, code: 'bishop', name: '主教', glyph: '♝', movement: '沿斜线任意格移动，路径不可穿越。',
    profession: 'mage',
    baseAttack: 110, baseHp: 680, baseSpeed: 5,
    baseCritRate: 0.20, baseCritMult: 2.2, baseDodge: 0.05, baseDefense: 0.02,
    baseUltMult: 2.2, baseUltCd: 3, baseRecovery: 0,
    skillName: '奥术穿透', skillDesc: '无视目标一半防御力。',
    shopWeight: 22, promoteTo: null,
  },
  {
    id: 4, code: 'rook', name: '车', glyph: '♜', movement: '沿横竖直线任意格移动，路径不可穿越。',
    profession: 'guard',
    baseAttack: 90, baseHp: 1150, baseSpeed: 3,
    baseCritRate: 0.10, baseCritMult: 1.8, baseDodge: 0.02, baseDefense: 0.25,
    baseUltMult: 1.6, baseUltCd: 4, baseRecovery: 0,
    skillName: '铁壁反击', skillDesc: '受到攻击时反弹伤害并获得护盾。',
    shopWeight: 20, promoteTo: null,
  },
  {
    id: 5, code: 'queen', name: '后', glyph: '♛', movement: '沿横竖或斜线任意格移动，路径不可穿越。',
    profession: 'mage',
    baseAttack: 150, baseHp: 900, baseSpeed: 6,
    baseCritRate: 0.25, baseCritMult: 2.8, baseDodge: 0.08, baseDefense: 0.05,
    baseUltMult: 3.0, baseUltCd: 4, baseRecovery: 0,
    skillName: '群星陨落', skillDesc: '对全体敌人造成大招倍率伤害。',
    shopWeight: 12, promoteTo: null,
  },
  {
    id: 6, code: 'king', name: '王', glyph: '♚', movement: '向周围 8 个方向移动 1 格。',
    profession: 'guard',
    baseAttack: 70, baseHp: 1400, baseSpeed: 2,
    baseCritRate: 0.10, baseCritMult: 2.0, baseDodge: 0.02, baseDefense: 0.20,
    baseUltMult: 1.5, baseUltCd: 4, baseRecovery: 0,
    skillName: '王之守护', skillDesc: '为全体友军提供减伤，光环随羁绊增强。',
    shopWeight: 8, promoteTo: null,
  },
];

export const TEMPLATE_BY_CODE = Object.fromEntries(PIECE_TEMPLATES.map((t) => [t.code, t]));

/* ------------------------------------------------------------------ *
 * 等级与属性上限
 * ------------------------------------------------------------------ */

/** 每升 1 级，等级系数 ×1.35（对应「每级 +35% 上限」） */
export const LEVEL_SCALE_STEP = 1.35;

/** 1 级时属性上限相对模板基础值的倍数 */
export const CAP_MULTIPLIER = 4;

/** 训练（不升阶也能变强）的倍率 */
export const TRAIN_MULTIPLIER = 1.12;
/** 训练对有硬上限的属性（暴击率/防御/闪避）的缓慢倍率 */
export const TRAIN_SOFT_MULTIPLIER = 1.03;

/** 属性硬上限（无论等级多高都封顶） */
export const STAT_HARD_CAPS = {
  critRate: 0.80,
  critMult: 10,
  ultMult: 10,
  defense: 0.60,
  dodge: 0.50,
  finalDamageMult: 5,
  attack: Number.POSITIVE_INFINITY,
  hp: Number.POSITIVE_INFINITY,
  speed: 30,
  recovery: Number.POSITIVE_INFINITY,
};

/** 等级系数 */
export function levelScale(level) {
  return Math.pow(LEVEL_SCALE_STEP, Math.max(0, level - 1));
}

/**
 * 某等级下某棋子的属性上限。
 * @param {object} template 棋子模板
 * @param {number} level    等级（>=1）
 * @param {object} [breakthroughBonus] { statKey: 倍数 } —— 突破会把该属性的上限再抬高
 */
export function statCaps(template, level, breakthroughBonus = {}) {
  const s = levelScale(level);
  const bonus = (key) => breakthroughBonus[key] ?? 1;
  const cap = (base, key, hardCap) => {
    const v = base * s * CAP_MULTIPLIER * bonus(key);
    return hardCap === undefined ? Math.floor(v) : Math.min(hardCap, v);
  };
  return {
    attack: cap(template.baseAttack, 'attack'),
    hp: cap(template.baseHp, 'hp'),
    critRate: cap(template.baseCritRate, 'critRate', STAT_HARD_CAPS.critRate),
    critMult: cap(template.baseCritMult, 'critMult', STAT_HARD_CAPS.critMult),
    ultMult: cap(template.baseUltMult, 'ultMult', STAT_HARD_CAPS.ultMult),
    defense: cap(template.baseDefense, 'defense', STAT_HARD_CAPS.defense),
    dodge: cap(template.baseDodge, 'dodge', STAT_HARD_CAPS.dodge),
    finalDamageMult: cap(1, 'finalDamageMult', STAT_HARD_CAPS.finalDamageMult),
    recovery: cap(template.baseRecovery, 'recovery'),
    speed: STAT_HARD_CAPS.speed,
  };
}

/* ------------------------------------------------------------------ *
 * 战斗结算
 * ------------------------------------------------------------------ */

/** 暴击倍率波动的下限/上限 */
export const CRIT_VARIATION = { min: 1.0, max: 1.5 };

/** 暴击波动超过此值时触发连击（沿用原版 1.2 阈值） */
export const COMBO_THRESHOLD = 1.2;

/** 连击链最大层数，超过后每层 ×0.85 衰减（保住爽感又可控） */
export const MAX_COMBO = 12;
export const COMBO_DECAY = 0.85;

/** 破防：连续命中同一目标累积满此值 → 目标 3 回合内防御归零 */
export const BREAK_METER_MAX = 100;
export const BREAK_METER_PER_HIT = 34;
export const BREAK_ROUNDS = 3;

/** 处决：目标生命低于此比例直接斩杀 */
export const EXECUTE_HP_RATIO = 0.15;

/** 铁卫「王之守护」光环减伤 */
export const GUARD_AURA_REDUCTION = 0.10;

/* ------------------------------------------------------------------ *
 * 经济与商店
 * ------------------------------------------------------------------ */

export const ECONOMY = {
  baseIncome: 8,
  winBonusBase: 20,
  winBonusPerChapter: 10,
  streakBonusBase: 2,
  streakBonusCap: 12,
  loseStreakBonusCap: 8,
  interestRate: 0.10,
  interestCap: 10,
  shopSlots: 5,
  shopFreeRefreshPerRound: 1,
  shopRefreshCost: 2,
  sellRefundBase: 1,
};

export const TRAINING = {
  baseCost: 10,
  costPerLevel: 1.2,
  costPerTrain: 1.15,
};

export const ASCEND = {
  /** 升阶需要几个同棋子 */
  cost: 2,
  /** 取大 + 小的这个比例 */
  minorRatio: 0.5,
};

export const BREAKTHROUGH = {
  baseCost: 25,
  costPerLevel: 1.35,
  rateMin: 1.30,
  rateMax: 1.60,
  /** 突破后该属性上限的抬升倍数 */
  capBonus: 1.5,
};

/** 可被突破的属性 */
export const BREAKTHROUGH_STATS = [
  { key: 'attack', name: '基础攻击力' },
  { key: 'hp', name: '生命' },
  { key: 'critRate', name: '暴击率' },
  { key: 'critMult', name: '暴击倍率' },
  { key: 'ultMult', name: '大招倍率' },
  { key: 'ultCd', name: '大招冷却' },
  { key: 'defense', name: '防御系数' },
  { key: 'dodge', name: '闪避系数' },
  { key: 'finalDamageMult', name: '最终伤害倍数' },
];

/* ------------------------------------------------------------------ *
 * 章节（难度）
 * ------------------------------------------------------------------ */

export const CHAPTERS = 12;

/** 每方最多上阵的棋子数 */
export const MAX_BOARD_PIECES = 5;

/** 第 N 章的敌方阵容配置 */
export function chapterConfig(chapter, playerRound) {
  const n = Math.max(1, Math.floor(chapter));
  return {
    chapter: n,
    count: Math.min(MAX_BOARD_PIECES, 2 + Math.floor(n / 2)),
    level: Math.max(1, 1 + Math.floor(n * 0.9) + Math.floor(playerRound * 0.25)),
    star: Math.min(5, 1 + Math.floor(n / 3)),
    gear: Math.min(3, Math.floor(n / 2)),
    hpScale: 1 + 0.18 * (n - 1),
    atkScale: 1 + 0.22 * (n - 1),
    goldReward: ECONOMY.winBonusBase + ECONOMY.winBonusPerChapter * n,
  };
}

/* ------------------------------------------------------------------ *
 * 装备
 * ------------------------------------------------------------------ */

export const EQUIPMENTS = [
  { id: 1, code: 'crit_claw', name: '暴击爪', rarity: 'common', slot: 1, effect: { critRate: 0.15 } },
  { id: 2, code: 'blood_fury', name: '血怒', rarity: 'common', slot: 1, effect: { lifesteal: 0.20 } },
  { id: 3, code: 'ward_gen', name: '护盾发生器', rarity: 'common', slot: 1, effect: { startShield: 0.15 } },
  { id: 4, code: 'swift', name: '疾风', rarity: 'rare', slot: 1, effect: { speed: 2 } },
  { id: 5, code: 'armor_break', name: '破甲', rarity: 'rare', slot: 1, effect: { armorPierce: 0.20 } },
  { id: 6, code: 'combo_seed', name: '连击种子', rarity: 'epic', slot: 1, effect: { alwaysCombo: true } },
  { id: 7, code: 'frost_core', name: '寒霜核心', rarity: 'rare', slot: 1, effect: { enemySpeedDebuff: 1 } },
  { id: 8, code: 'soul_leech', name: '汲魂', rarity: 'epic', slot: 1, effect: { killHeal: 0.10 } },
];

export const EQUIPMENT_BY_CODE = Object.fromEntries(EQUIPMENTS.map((e) => [e.code, e]));

/** 每个棋子最多装备几件 */
export const MAX_ITEMS = 3;

/* ------------------------------------------------------------------ *
 * 卡牌（附魔 / 魔盒）
 * ------------------------------------------------------------------ */

export const CARD_STATS = [
  { key: 'attack', name: '基础攻击力', addMax: 40, mulMin: 1.00, mulMax: 1.40, rarity: 'common', weight: 14 },
  { key: 'critRate', name: '暴击率', addMax: 0.08, mulMin: 1.00, mulMax: 1.30, rarity: 'common', weight: 14 },
  { key: 'critMult', name: '暴击倍率', addMax: 1.5, mulMin: 1.00, mulMax: 1.30, rarity: 'common', weight: 13 },
  { key: 'recovery', name: '回复', addMax: 40, mulMin: 1.00, mulMax: 1.30, rarity: 'common', weight: 8 },
  { key: 'hp', name: '生命', addMax: 250, mulMin: 1.00, mulMax: 1.25, rarity: 'common', weight: 13 },
  { key: 'ultMult', name: '大招倍率', addMax: 1.5, mulMin: 1.00, mulMax: 1.30, rarity: 'common', weight: 13 },
  { key: 'ultCd', name: '大招冷却', addMax: 1, mulMin: 1.00, mulMax: 1.25, rarity: 'rare', weight: 8, lowerIsBetter: true },
  { key: 'defense', name: '防御系数', addMax: 0.05, mulMin: 1.00, mulMax: 1.30, rarity: 'common', weight: 8 },
  { key: 'dodge', name: '闪避系数', addMax: 0.04, mulMin: 1.00, mulMax: 1.30, rarity: 'rare', weight: 8 },
  { key: 'finalDamageMult', name: '最终伤害倍数', addMax: 0.5, mulMin: 1.00, mulMax: 1.25, rarity: 'epic', weight: 3 },
];

export const CARD_STAT_BY_KEY = Object.fromEntries(CARD_STATS.map((c) => [c.key, c]));

/** 卡的稀有度权重 */
export const CARD_RARITY_WEIGHT = { common: 70, rare: 26, epic: 4 };
