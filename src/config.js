import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** 项目根目录 */
export const ROOT = path.resolve(here, '..');

/** 静态资源目录 */
export const PUBLIC_DIR = path.join(ROOT, 'public');

/** SQLite 数据库文件 */
export const DB_PATH = process.env.ARENA_DB ?? path.join(ROOT, 'data', 'arena.db');

/**
 * 首选端口。
 * 不用 5173 —— 那是 Vite 的默认端口，本机已经有别的 Vite 服务占着，
 * 而且它绑在 IPv6 的 ::1 上，浏览器访问 localhost 会优先命中它。
 */
export const PREFERRED_PORT = Number(process.env.PORT ?? 5180);

/** 端口顺延上限 */
export const MAX_PORT_TRIES = 20;

/** 战斗最大回合数，超时判平局（不是判负 —— 原版 bug ⑨） */
export const MAX_ROUNDS = 40;
