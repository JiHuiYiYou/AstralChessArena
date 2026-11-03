/**
 * db/index.js —— SQLite 连接与事务封装。
 *
 * 用 Node 24 内置的 node:sqlite（无需任何 npm 依赖）。
 * 注意：node:sqlite 返回的是 **null 原型对象**，要做扩展/比较时先 spread 一份。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

let db = null;

/** 打开（并初始化）数据库 */
export function openDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  const schema = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  db.exec(schema);

  return db;
}

/** 拿到连接（未打开时自动打开） */
export function getDb() {
  return db ?? openDb();
}

/** 关闭连接 */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * 在一个事务里跑一段逻辑。出错自动回滚。
 * @template T
 * @param {(d: import('node:sqlite').DatabaseSync) => T} fn
 * @returns {T}
 */
export function transaction(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const result = fn(d);
    d.exec('COMMIT');
    return result;
  } catch (err) {
    try { d.exec('ROLLBACK'); } catch { /* 回滚失败时保留原始错误 */ }
    throw err;
  }
}

/**
 * 把 node:sqlite 的 null 原型行转成普通对象。
 */
export function plain(row) {
  return row ? { ...row } : row;
}

/** 批量取普通对象 */
export function plainAll(rows) {
  return rows.map((r) => ({ ...r }));
}

/** JSON 字段的安全解析 */
export function parseJson(text, fallback) {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    const v = JSON.parse(text);
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

/**
 * 便捷查询：取一行普通对象
 *
 * 防呆：SQL 里有 ? 占位符却没传参数时直接抛错。
 * （漏传参数时 SQLite 会把占位符绑成 NULL，查询静默返回空结果，很难查。）
 */
export function queryOne(sql, ...params) {
  assertParams(sql, params);
  const row = getDb().prepare(sql).get(...params);
  return plain(row);
}

/** 便捷查询：取多行普通对象 */
export function queryAll(sql, ...params) {
  assertParams(sql, params);
  return plainAll(getDb().prepare(sql).all(...params));
}

/** 校验占位符数量与实参数量是否对得上 */
function assertParams(sql, params) {
  const placeholders = (String(sql).match(/\?/g) ?? []).length;
  if (placeholders !== params.length) {
    throw new Error(
      `SQL 占位符数量（${placeholders}）与参数数量（${params.length}）不一致：${String(sql).trim().slice(0, 120)}`,
    );
  }
}
