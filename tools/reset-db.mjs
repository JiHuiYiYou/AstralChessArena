/**
 * tools/reset-db.mjs —— 删掉本地数据库并重建（改完 schema.sql 之后用）。
 *
 * 用法：npm run db:reset
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_PATH } from '../src/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const suffix of ['', '-wal', '-shm']) {
  const p = `${DB_PATH}${suffix}`;
  if (fs.existsSync(p)) {
    fs.rmSync(p);
    console.log(`已删除 ${path.basename(p)}`);
  }
}

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });

const { openDb } = await import('../src/db/index.js');
const { seed } = await import('../src/db/seed.js');
openDb();
seed();
console.log(`数据库已重建：${DB_PATH}`);
