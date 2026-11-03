-- 星穹弈境 · SQLite 数据结构
-- 约定：静态内容（职业/棋子/装备/卡池）与动态数据（存档/棋子/战斗记录）分表，
--      不用「整个游戏状态塞一个 JSON 字段」的做法。

PRAGMA foreign_keys = ON;

-- ---------- 职业 ----------
CREATE TABLE IF NOT EXISTS professions (
  id      INTEGER PRIMARY KEY,
  code    TEXT NOT NULL UNIQUE,
  name    TEXT NOT NULL,
  color   TEXT NOT NULL,
  blurb   TEXT NOT NULL DEFAULT ''
);

-- ---------- 羁绊（职业 × 档位） ----------
CREATE TABLE IF NOT EXISTS synergies (
  id              INTEGER PRIMARY KEY,
  profession_id   INTEGER NOT NULL REFERENCES professions(id) ON DELETE CASCADE,
  tier            INTEGER NOT NULL,
  count_required  INTEGER NOT NULL,
  bonus_json      TEXT NOT NULL DEFAULT '{}',
  UNIQUE (profession_id, tier)
);

-- ---------- 棋子模板（棋谱 / 图鉴） ----------
CREATE TABLE IF NOT EXISTS piece_templates (
  id              INTEGER PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  glyph           TEXT NOT NULL,
  movement        TEXT NOT NULL DEFAULT '',
  skill_name      TEXT NOT NULL DEFAULT '',
  skill_desc      TEXT NOT NULL DEFAULT '',
  profession_id   INTEGER NOT NULL REFERENCES professions(id),
  base_attack     INTEGER NOT NULL,
  base_hp         INTEGER NOT NULL,
  base_speed      INTEGER NOT NULL,
  base_crit_rate  REAL    NOT NULL,
  base_crit_mult  REAL    NOT NULL,
  base_dodge      REAL    NOT NULL,
  base_defense    REAL    NOT NULL,
  base_ult_mult   REAL    NOT NULL,
  base_ult_cd     INTEGER NOT NULL,
  base_recovery   INTEGER NOT NULL DEFAULT 0,
  shop_weight     INTEGER NOT NULL DEFAULT 10,
  promote_to      TEXT    NOT NULL DEFAULT '[]'
);

-- ---------- 装备 ----------
CREATE TABLE IF NOT EXISTS equipments (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  rarity      TEXT NOT NULL DEFAULT 'common',
  slot        INTEGER NOT NULL DEFAULT 1,
  effect_json TEXT NOT NULL DEFAULT '{}'
);

-- ---------- 卡牌（附魔） ----------
CREATE TABLE IF NOT EXISTS cards (
  id         INTEGER PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  stat       TEXT NOT NULL,
  stat_name  TEXT NOT NULL,
  operation  TEXT NOT NULL DEFAULT 'add',
  value      REAL NOT NULL,
  rarity     TEXT NOT NULL DEFAULT 'common',
  weight     INTEGER NOT NULL DEFAULT 10
);

-- ---------- 存档槽 ----------
CREATE TABLE IF NOT EXISTS saves (
  id                  INTEGER PRIMARY KEY,
  slot                INTEGER NOT NULL UNIQUE CHECK (slot BETWEEN 1 AND 3),
  version             INTEGER NOT NULL DEFAULT 1,
  gold                INTEGER NOT NULL DEFAULT 0,
  chapter             INTEGER NOT NULL DEFAULT 1,
  max_chapter         INTEGER NOT NULL DEFAULT 1,
  round               INTEGER NOT NULL DEFAULT 1,
  streak_win          INTEGER NOT NULL DEFAULT 0,
  streak_lose         INTEGER NOT NULL DEFAULT 0,
  shop_refreshed_round INTEGER NOT NULL DEFAULT 0,
  rng_seed            INTEGER NOT NULL,
  rng_state           TEXT NOT NULL DEFAULT '{}',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- 存档里的棋子 ----------
CREATE TABLE IF NOT EXISTS save_heroes (
  id                 INTEGER PRIMARY KEY,
  save_id            INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  template_id        INTEGER NOT NULL REFERENCES piece_templates(id),
  name               TEXT NOT NULL,
  voice_line         TEXT NOT NULL DEFAULT '',
  is_ally            INTEGER NOT NULL DEFAULT 1,
  exist              INTEGER NOT NULL DEFAULT 1,
  board_file         INTEGER,
  board_rank         INTEGER,
  star               INTEGER NOT NULL DEFAULT 1,
  level              INTEGER NOT NULL DEFAULT 1,
  base_score         INTEGER NOT NULL DEFAULT 1,
  attack             INTEGER NOT NULL,
  hp                 INTEGER NOT NULL,
  max_hp             INTEGER NOT NULL,
  speed              INTEGER NOT NULL DEFAULT 3,
  shield             INTEGER NOT NULL DEFAULT 0,
  crit_rate          REAL NOT NULL DEFAULT 0,
  crit_mult          REAL NOT NULL DEFAULT 1,
  dodge              REAL NOT NULL DEFAULT 0,
  defense            REAL NOT NULL DEFAULT 0,
  recovery           INTEGER NOT NULL DEFAULT 0,
  final_damage_mult  REAL NOT NULL DEFAULT 1,
  ult_mult           REAL NOT NULL DEFAULT 1,
  ult_cd             INTEGER NOT NULL DEFAULT 3,
  train_count        INTEGER NOT NULL DEFAULT 0,
  items_json         TEXT NOT NULL DEFAULT '[]',
  attributes_json    TEXT NOT NULL DEFAULT '{}',
  bonus_json         TEXT NOT NULL DEFAULT '{}',
  is_king            INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_save_heroes_save ON save_heroes(save_id);

-- ---------- 存档里的卡牌 ----------
CREATE TABLE IF NOT EXISTS save_cards (
  id            INTEGER PRIMARY KEY,
  save_id       INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  card_id       INTEGER NOT NULL REFERENCES cards(id),
  is_used       INTEGER NOT NULL DEFAULT 0,
  used_hero_id  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_save_cards_save ON save_cards(save_id);

-- ---------- 存档里的装备背包 ----------
CREATE TABLE IF NOT EXISTS save_items (
  id              INTEGER PRIMARY KEY,
  save_id         INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  equipment_code  TEXT NOT NULL,
  acquired_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_save_items_save ON save_items(save_id);

-- ---------- 商店槽位（每回合刷新） ----------
CREATE TABLE IF NOT EXISTS shop_slots (
  id              INTEGER PRIMARY KEY,
  save_id         INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  slot_index      INTEGER NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'piece',   -- piece | card | equipment
  template_id     INTEGER REFERENCES piece_templates(id),
  card_id         INTEGER REFERENCES cards(id),
  equipment_code  TEXT NOT NULL DEFAULT '',
  name            TEXT NOT NULL DEFAULT '',
  glyph           TEXT NOT NULL DEFAULT '',
  profession      TEXT NOT NULL DEFAULT '',
  rarity          TEXT NOT NULL DEFAULT '',
  star            INTEGER NOT NULL DEFAULT 1,
  price           INTEGER NOT NULL DEFAULT 0,
  sold            INTEGER NOT NULL DEFAULT 0,
  UNIQUE (save_id, slot_index)
);

-- ---------- 战斗记录 ----------
CREATE TABLE IF NOT EXISTS battles (
  id           INTEGER PRIMARY KEY,
  save_id      INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  chapter      INTEGER NOT NULL,
  round        INTEGER NOT NULL DEFAULT 1,
  result       TEXT NOT NULL,
  rounds       INTEGER NOT NULL,
  ally_power   INTEGER NOT NULL,
  enemy_power  INTEGER NOT NULL,
  seed         INTEGER NOT NULL,
  events_json  TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_battles_save ON battles(save_id, id DESC);
