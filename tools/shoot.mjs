/**
 * tools/shoot.mjs —— 给游戏截图，输出到 deliverables/screenshots/。
 *
 * 依赖 playwright-cli（这台机器上必须显式 --browser=chrome，默认浏览器是坏的）。
 * 用法：先 npm run dev，再 node tools/shoot.mjs [baseUrl]
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'deliverables', 'screenshots');
const BASE = process.argv[2] ?? process.env.ARENA_URL ?? 'http://127.0.0.1:5180';

fs.mkdirSync(OUT, { recursive: true });

/**
 * 调 playwright-cli。
 * Windows 上 playwright-cli 是 .cmd 批处理，必须走 shell（cmd.exe），
 * 直接 spawnSync 会报 EINVAL。
 */
const pw = (...args) => {
  const cmd = ['playwright-cli', ...args.map((a) => `"${a}"`)].join(' ');
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
  } catch (err) {
    console.error('[playwright-cli 失败]', cmd, String(err.message).split('\n')[0]);
    return '';
  }
};

const shot = (name) => {
  const file = path.join(OUT, `${name}.png`);
  pw('screenshot', `--filename=${file}`);
  if (fs.existsSync(file)) {
    console.log(`  ✓ ${name}.png  (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
  } else {
    console.log(`  ✗ ${name}.png  生成失败`);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`\n截图 → ${OUT}\n`);

  pw('close-all');
  await sleep(500);
  pw('open', '--browser=chrome', BASE);
  await sleep(2500);

  // 1. 存档选择
  shot('01-选择存档');

  // 2. 主界面（棋盘 + 商店）
  pw('click', "getByRole('button', { name: '读取' })");
  await sleep(1800);
  shot('02-主界面-棋盘与商店');

  // 3. 阵容
  pw('click', "getByRole('button', { name: '阵容' })");
  await sleep(900);
  shot('03-阵容与养成');

  // 4. 羁绊
  pw('click', "getByRole('button', { name: '羁绊' })");
  await sleep(900);
  shot('04-羁绊');

  // 5. 图鉴
  pw('click', "getByRole('button', { name: '图鉴' })");
  await sleep(900);
  shot('05-棋子图鉴');

  // 6. 战斗进行中
  pw('click', "getByRole('button', { name: '开始战斗' })");
  await sleep(2600);
  shot('06-战斗进行中');

  // 7. 战斗结算
  pw('click', "getByRole('button', { name: '跳过动画' })");
  await sleep(2500);
  shot('07-战斗结算');

  pw('close-all');
  console.log('\n完成。\n');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
