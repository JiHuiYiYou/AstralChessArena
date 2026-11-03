/**
 * tools/browser-test.mjs —— 浏览器端全流程点击测试。
 *
 * 用 playwright-cli 驱动真实 Chrome，把界面上的按钮都点一遍，
 * 每一步都检查控制台有没有报错 —— 接口层测不到「handler 没定义」这类问题。
 *
 * 用法：先 npm run dev，再 node tools/browser-test.mjs [baseUrl]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] ?? process.env.ARENA_URL ?? 'http://127.0.0.1:5180';

/**
 * 直接调 playwright-cli 的 JS 入口，**不经过 shell**。
 * 经过 cmd.exe 的话，带空格的 eval 代码会被拆成多个参数（然后 eval 报帮助文本）。
 */
const PW_JS = 'C:/Users/liuzhen/miniconda3/node_modules/@playwright/cli/playwright-cli.js';

let failures = 0;
let consoleErrors = 0;

function pw(...args) {
  try {
    return execFileSync(process.execPath, [PW_JS, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return '';
  }
}

/** eval 的返回值可能是带引号的字符串，统一剥掉 */
function evalValue(code) {
  const out = pw('--raw', 'eval', code).trim();
  return out.replace(/^"(.*)"$/s, '$1').trim();
}

/** 读 playwright-cli 收集到的控制台错误 */
function consoleErrorCount() {
  const dir = path.join(ROOT, '.playwright-cli');
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith('console-') || !f.endsWith('.log')) continue;
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const line of text.split('\n')) {
      if (!line.includes('[ERROR]')) continue;
      // 「Failed to load resource」是 HTTP 状态码（比如金币不足的 402），不是 JS 异常
      if (line.includes('Failed to load resource')) continue;
      console.log(`    ⚠ ${line.trim().slice(0, 160)}`);
      n += 1;
    }
  }
  return n;
}

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 轮询等待某个条件成立。
 * 固定 sleep 不可靠：每次 playwright-cli 调用本身就要 1~2 秒，
 * 固定等待要么等太久，要么在状态还没变时就断言。
 */
async function waitFor(code, timeoutMs = 8000, label = '') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = evalValue(code);
    if (v === 'true' || v === '1') return true;
    await sleep(250);
  }
  if (label) console.log(`    (等待超时: ${label})`);
  return false;
}

/** 点一个按钮（按可见文字），返回是否点到了 */
function clickButton(text) {
  const out = pw('click', `getByRole('button', { name: '${text}' })`);
  return /Page URL|### Page/.test(out) && !/not found|Error/.test(out);
}

async function main() {
  console.log(`\n浏览器端全流程测试 → ${BASE}\n`);

  // 清掉上一轮的控制台日志
  const dir = path.join(ROOT, '.playwright-cli');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('console-')) fs.rmSync(path.join(dir, f));
    }
  }

  pw('close-all');
  await sleep(500);
  pw('open', '--browser=chrome', BASE);
  await sleep(2500);

  // 1. 存档选择
  check('打开页面弹出存档选择', clickButton('读取'));
  await sleep(1500);

  // 2. 四个标签页
  for (const [tab, expect] of [['商店', '星域商店'], ['阵容', '我方阵容'], ['羁绊', '羁绊'], ['图鉴', '棋子图鉴']]) {
    clickButton(tab);
    await waitFor(
      `(document.querySelector('#tab-body .panel-title')?.textContent ?? '') === '${expect}'`,
      8000,
      `标签页 ${tab}`,
    );
    const title = evalValue("document.querySelector('#tab-body .panel-title')?.textContent ?? ''");
    check(`标签页「${tab}」渲染出内容`, title === expect, `title=${title}`);
  }

  // 3. 商店：买一个能买得起的
  clickButton('商店');
  await sleep(600);
  const bought = evalValue("String(document.getElementsByClassName('shop-slot').length)");
  check('商店渲染出槽位', Number(bought) > 0, `slots=${bought}`);

  // 4. 阵容面板：训练 / 升阶 / 突破 / 出售 / 装备
  clickButton('阵容');
  await sleep(700);
  // data-act 用的是英文标识（train / ascend / break）
  for (const [act, label] of [['train', '训练'], ['ascend', '升阶'], ['break', '突破']]) {
    const has = evalValue(`String(Array.from(document.getElementsByClassName('hero-card')).flatMap(h => Array.from(h.querySelectorAll('button'))).filter(b => b.getAttribute('data-act') === '${act}').length)`);
    check(`阵容面板有「${label}」按钮`, Number(has) > 0, `count=${has}`);
  }
  // 点第一个「训练」
  pw('eval', "(() => { const b = Array.from(document.getElementsByClassName('hero-card')).flatMap(h => Array.from(h.querySelectorAll('button'))).find(x => x.getAttribute('data-act') === 'train'); if (b) b.click(); return 'ok'; })()");
  await sleep(1200);
  check('点「训练」后没有报错', consoleErrorCount() === 0);

  // 4b. 下场：上阵的棋子要能撤下来，否则既换不了人也卖不掉
  const before = evalValue("String(document.querySelectorAll('#board-grid .piece').length)");
  const hadDeployOff = await waitFor(
    "(() => { const b = Array.from(document.querySelectorAll('#tab-body [data-act]')).find(x => x.getAttribute('data-act') === 'deploy-off'); if (!b) return false; b.click(); return true; })()",
    8000,
    '下场按钮',
  );
  check('上阵的棋子有「下场」按钮', hadDeployOff);
  const after = await waitFor(
    `document.querySelectorAll('#board-grid .piece').length < ${Number(before)}`,
    8000,
    '下场生效',
  );
  check('点「下场」后棋子从棋盘上撤下来', after, `before=${before}`);
  // 放回去，免得影响后面的战斗
  await waitFor(
    "(() => { const p = document.querySelector('#board-grid .square[data-file=\"0\"][data-rank=\"3\"]'); if (!p) return false; p.click(); return true; })()",
    4000,
    '重新上场',
  );

  // 5. 升阶：没有同种棋子对子时会提示「需要另一个同种棋子」而不是弹窗，两种都算有响应
  pw('eval', "(() => { const b = Array.from(document.getElementsByClassName('hero-card')).flatMap(h => Array.from(h.querySelectorAll('button'))).find(x => x.getAttribute('data-act') === 'ascend'); if (b) b.click(); return 'ok'; })()");
  const responded = await waitFor(
    "(document.getElementById('modal').classList.contains('hidden') === false || document.getElementById('toast-host').textContent.trim().length > 0)",
    8000,
    '升阶响应',
  );
  check('点「升阶」有响应（弹窗或提示）', responded, '既没有弹窗也没有提示');
  pw('eval', "(() => { document.getElementById('modal').classList.add('hidden'); return 'ok'; })()");
  await sleep(300);

  // 6. 章节选择
  const chips = evalValue("String(document.getElementsByClassName('chapter-chip').length)");
  check('章节选择渲染出 12 个按钮', Number(chips) === 12, `chips=${chips}`);
  pw('eval', "(() => { const c = Array.from(document.getElementsByClassName('chapter-chip')).find(x => x.getAttribute('data-chapter') === '1'); if (c) c.click(); return 'ok'; })()");
  await sleep(600);

  // 7. 开打
  check('点「开始战斗」进入战斗阶段', clickButton('开始战斗'));
  await sleep(2500);
  const inBattle = evalValue("!document.getElementById('stage-battle').classList.contains('hidden')");
  check('战斗阶段已显示', inBattle === 'true');

  // 8. 跳过动画 → 结果面板
  clickButton('跳过动画');
  await waitFor("!!document.querySelector('.result-panel')", 10000, '战斗结果');
  const result = evalValue("document.querySelector('.result-panel')?.getAttribute('data-result') ?? ''");
  check('战斗结束出现结果面板', ['win', 'lose', 'draw'].includes(result), `result=${result}`);
  const rows = evalValue("String(document.getElementsByClassName('reward-row').length)");
  check('结果面板有奖励明细', Number(rows) >= 4, `rows=${rows}`);

  // 8b. 历史战报 + 回放
  const histCount = await waitFor(
    "document.getElementById('battle-history').querySelectorAll('[data-replay]').length > 0",
    10000,
    '历史战报',
  );
  check('战斗后出现历史战报', histCount, '没有可回放的记录');

  const replayed = await waitFor(
    "(() => { const b = document.querySelector('#battle-history [data-replay]'); if (!b) return false; b.click(); return true; })()",
    10000,
    '点击回放',
  );
  check('能点开回放', replayed);
  await waitFor(
    "document.getElementById('battle-title').textContent.includes('回放')",
    10000,
    '回放标题',
  );
  const replayTitle = evalValue("document.getElementById('battle-title').textContent ?? ''");
  check('回放模式标题正确', replayTitle.includes('回放'), `title=${replayTitle}`);

  // 回放默认 ×2 速，一整场仍要几十秒 —— 直接跳过动画
  clickButton('跳过动画');
  await waitFor("!!document.querySelector('.result-panel')", 15000, '回放结束');
  await waitFor(
    "!document.getElementById('btn-battle-back').classList.contains('hidden')",
    8000,
    '回到准备按钮',
  );

  // 9. 回到准备
  check('点「回到准备」回到准备阶段', clickButton('回到准备'));
  await sleep(1200);
  const backToPrep = evalValue("!document.getElementById('stage-prep').classList.contains('hidden')");
  check('准备阶段已恢复', backToPrep === 'true');

  // 10. 存档面板
  pw('eval', "(() => { document.getElementById('btn-saves').click(); return 'ok'; })()");
  const opened = await waitFor(
    "!document.getElementById('modal').classList.contains('hidden')",
    10000,
    '存档面板',
  );
  const modalTitle = evalValue("document.querySelector('.modal-head')?.textContent ?? ''");
  if (!opened || !modalTitle.includes('存档')) {
    const dbg = evalValue("JSON.stringify({hidden: document.getElementById('modal').classList.contains('hidden'), head: document.querySelector('.modal-head')?.textContent ?? '', panelLen: document.getElementById('modal-panel').textContent.length, stage: document.getElementById('stage-prep').classList.contains('hidden') ? 'battle' : 'prep'})");
    console.log(`    (诊断: ${dbg})`);
  }
  check('存档面板能打开', opened && modalTitle.includes('存档'), `opened=${opened} title=${modalTitle}`);
  pw('eval', "(() => { document.getElementById('modal').classList.add('hidden'); return 'ok'; })()");

  const errs = consoleErrorCount();
  consoleErrors = errs;
  check('全程控制台零报错', errs === 0, `errors=${errs}`);

  pw('close-all');
  console.log(failures === 0 ? '\n全部通过 ✓\n' : `\n${failures} 项失败 ✗\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
