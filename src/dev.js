/**
 * dev.js —— `npm run dev` 的入口。
 *
 * 流程：建库 → 灌静态数据 → 监听端口（被占就顺延）→ 打开浏览器。
 */

import { spawn } from 'node:child_process';
import { openDb, closeDb } from './db/index.js';
import { seed } from './db/seed.js';
import { createServer } from './server.js';
import { MAX_PORT_TRIES, PREFERRED_PORT, DB_PATH } from './config.js';

const server = createServer();

/** 监听一个端口，失败就换下一个 */
function listen(port, triesLeft) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('error', onError);
      if (err.code === 'EADDRINUSE' && triesLeft > 0) {
        resolve(listen(port + 1, triesLeft - 1));
      } else {
        reject(err);
      }
    };
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onError);
      resolve(port);
    });
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32'
    ? { file: 'cmd', args: ['/c', 'start', '""', url] }
    : process.platform === 'darwin'
      ? { file: 'open', args: [url] }
      : { file: 'xdg-open', args: [url] };
  try {
    const child = spawn(cmd.file, cmd.args, { stdio: 'ignore', detached: true });
    child.unref();
  } catch {
    console.log('（没能自动打开浏览器，请手动访问上面的地址）');
  }
}

async function main() {
  openDb();
  seed();

  const port = await listen(PREFERRED_PORT, MAX_PORT_TRIES);
  // 用 127.0.0.1 而不是 localhost —— localhost 在本机会解析到 ::1，
  // 可能命中别的 IPv6 服务（这台机器上就有一个 Vite 占着 ::1:5173）。
  const url = `http://127.0.0.1:${port}/`;

  console.log('');
  console.log('  ✦ 星穹弈境 · Astral Chess Arena');
  console.log('  ────────────────────────────────────────');
  console.log(`  ➜  地址    ${url}`);
  console.log(`  ➜  数据库  ${DB_PATH}`);
  console.log('  ➜  按 Ctrl+C 退出');
  console.log('');

  if (process.env.ARENA_NO_OPEN !== '1') openBrowser(url);
}

process.on('SIGINT', () => {
  console.log('\n再见。');
  closeDb();
  process.exit(0);
});

main().catch((err) => {
  console.error('启动失败：', err);
  closeDb();
  process.exit(1);
});
