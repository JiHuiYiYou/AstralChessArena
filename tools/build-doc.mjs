/**
 * tools/build-doc.mjs —— 生成作业提交用的 Word 文档。
 *
 * 一份文档装全部提交内容：
 *   1. 项目简介
 *   2. 参考了哪些游戏
 *   3. 游戏截图（内嵌 PNG）
 *   4. 开发过程记录：所有提示词输入 + 模型在文字框里的输出，按会话分段
 *      （新开启的会话会额外标注）
 *   5. 附录：AGENTS.md / SPEC.md / TASK.md 全文
 *
 * 用法：node tools/build-doc.mjs
 * 依赖：pandoc（本机在 PATH 上）
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'deliverables');
const SHOTS = path.join(OUT_DIR, 'screenshots');
const MD_PATH = path.join(OUT_DIR, '提交材料.md');
const DOCX_PATH = path.join(OUT_DIR, '提交材料.docx');

/** 本项目所在的目录（会话记录的 cwd 在它或它的父目录下） */
const PROJECT_ROOT = path.resolve(ROOT, '..');

/* ------------------------------------------------------------------ *
 * 1. 读会话记录
 * ------------------------------------------------------------------ */

/** 找出所有会话 jsonl */
function findSessionFiles() {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(projectsDir)) return [];
  const out = [];
  for (const dir of fs.readdirSync(projectsDir)) {
    const full = path.join(projectsDir, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const f of fs.readdirSync(full)) {
      if (f.endsWith('.jsonl')) out.push(path.join(full, f));
    }
  }
  return out;
}

/** 从一条 jsonl 里抽出会话消息 */
function readSession(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const messages = [];
  let sessionId = path.basename(file, '.jsonl');
  let cwd = '';
  let startedAt = null;

  for (const line of lines) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }

    if (o.sessionId) sessionId = o.sessionId;
    if (o.cwd && !cwd) cwd = o.cwd;
    if (!startedAt && o.timestamp) startedAt = o.timestamp;

    if (o.type === 'user') {
      // 跳过工具结果、注入的系统提示、压缩摘要
      if (o.isMeta || o.isCompactSummary || o.toolUseResult) continue;
      const content = o.message?.content;
      let text = '';
      if (typeof content === 'string') {
        text = content;
      } else if (Array.isArray(content)) {
        text = content
          .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text)
          .join('\n');
      }
      text = text.trim();
      if (!text) continue;
      // 去掉 <system-reminder> 之类的自动注入块
      text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
      if (!text) continue;
      messages.push({ role: 'prompt', text, ts: o.timestamp });
    } else if (o.type === 'assistant') {
      const content = o.message?.content;
      if (!Array.isArray(content)) continue;
      // 只要「文字框里的输出」：text 块，不要 thinking / tool_use
      const text = content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (!text) continue;
      messages.push({ role: 'output', text, ts: o.timestamp });
    }
  }

  return { file, sessionId, cwd, startedAt, messages };
}

/**
 * 与本项目相关的会话才算数。
 *
 * 同一个工作目录下还有**别的作业**的会话（JHYY 介绍页、jj 回退作业），
 * 那些不能混进本作业的提交材料里。
 *
 * 判定：
 *   1) cwd 在本项目目录内 —— 一定相关；
 *   2) 或者首条提示词里出现本项目的关键词 —— 也算相关
 *      （本项目最早是在上级目录里开的，会话 cwd 不是项目目录）。
 */
const PROJECT_KEYWORDS = ['SQLite', 'AstralChessArena', 'astral-chess-arena', '星穹弈境', 'NodeJS项目'];

function isRelevant(s) {
  const cwd = s.cwd ? path.resolve(s.cwd).toLowerCase() : '';
  const workshop = path.resolve(PROJECT_ROOT).toLowerCase();
  const projectDir = path.resolve(ROOT).toLowerCase();

  // 前置条件：会话必须是在本工作目录（vibecoding研修课）里开的
  if (cwd !== workshop && !cwd.startsWith(workshop + path.sep)) return false;

  // 其一：cwd 就在本项目目录里 —— 一定相关
  if (cwd === projectDir || cwd.startsWith(projectDir + path.sep)) return true;

  // 其二：同一个工作目录下的别的作业（JHYY 介绍页、jj 回退作业）——
  //       只有首条提示词提到本项目关键词时才收进来
  const first = s.messages.find((m) => m.role === 'prompt')?.text ?? '';
  return PROJECT_KEYWORDS.some((k) => first.includes(k));
}

/** 挑出与本项目相关的会话，按开始时间排序 */
function collectSessions() {
  const sessions = findSessionFiles()
    .map(readSession)
    .filter((s) => s.messages.length > 0);

  const relevant = sessions.filter(isRelevant);

  // 同一个 sessionId 可能落在多个 jsonl 里（续聊），按时间合并
  const byId = new Map();
  for (const s of relevant) {
    const key = s.sessionId;
    if (!byId.has(key)) byId.set(key, { ...s, messages: [] });
    byId.get(key).messages.push(...s.messages);
  }

  const list = [...byId.values()];
  for (const s of list) {
    s.messages.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    s.startedAt = s.messages[0]?.ts ?? s.startedAt;
  }
  list.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  return list;
}

/* ------------------------------------------------------------------ *
 * 2. 组装 Markdown
 * ------------------------------------------------------------------ */

const fence = (text) => text.replace(/```/g, '``​`');

function transcriptMarkdown(sessions) {
  if (sessions.length === 0) return '_（没有找到本项目的会话记录）_\n';

  const parts = [];
  sessions.forEach((s, i) => {
    const n = i + 1;
    const isNew = i > 0;
    const time = s.startedAt ? new Date(s.startedAt).toLocaleString('zh-CN') : '未知时间';
    parts.push(`### 会话 ${n}${isNew ? '　【新开启的会话】' : ''}`);
    parts.push('');
    parts.push(`- 会话 ID：\`${s.sessionId}\``);
    parts.push(`- 开始时间：${time}`);
    parts.push(`- 记录条数：${s.messages.length}`);
    if (isNew) {
      parts.push('');
      parts.push('> **标注：以上为一次新开启的会话**（与上一段会话之间是重新打开的上下文）。');
    }
    parts.push('');
    parts.push('---');
    parts.push('');

    for (const m of s.messages) {
      if (m.role === 'prompt') {
        parts.push('#### ▶ 提示词输入（用户）');
        parts.push('');
        parts.push(fence(m.text));
      } else {
        parts.push('#### ◀ 模型输出（文字框）');
        parts.push('');
        parts.push(fence(m.text));
      }
      parts.push('');
    }
  });
  return parts.join('\n');
}

function screenshotsMarkdown() {
  if (!fs.existsSync(SHOTS)) return '_（没有截图）_\n';
  const files = fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png')).sort();
  if (files.length === 0) return '_（没有截图）_\n';

  const captions = {
    '01': '存档选择界面：三个存档槽，显示金币、章节、我方/敌方棋子数与卡牌数。',
    '02': '主界面：左侧 8×8 棋盘（红边为敌方半场、绿边为我方半场），右侧商店与卡牌背包。',
    '03': '阵容与养成面板：每个棋子的属性、星级、训练/升阶/突破/出售按钮与装备栏。',
    '04': '羁绊面板：同职业件数、已激活档位与下一档提示。',
    '05': '棋子图鉴：六种棋子的走法、基础属性与专属大招。',
    '06': '战斗进行中：服务端算完整场战斗，前端按事件流播放走位、攻击、暴击与飘字。',
    '07': '战斗结算：右侧滚动战斗日志，底部给出金币奖励与下一步操作。',
  };

  const parts = [];
  files.forEach((f) => {
    const key = f.slice(0, 2);
    parts.push(`![${f}](screenshots/${encodeURI(f)})`);
    parts.push('');
    parts.push(`**${f.replace(/\.png$/, '')}** —— ${captions[key] ?? ''}`);
    parts.push('');
  });
  return parts.join('\n');
}

function appendix(name) {
  const p = path.join(ROOT, name);
  if (!fs.existsSync(p)) return `_（缺少 ${name}）_\n`;
  return `\`\`\`markdown\n${fs.readFileSync(p, 'utf8').replace(/```/g, '``​`')}\n\`\`\`\n`;
}

function buildMarkdown() {
  const sessions = collectSessions();
  const total = sessions.reduce((s, x) => s + x.messages.length, 0);
  const prompts = sessions.reduce((s, x) => s + x.messages.filter((m) => m.role === 'prompt').length, 0);
  const outputs = sessions.reduce((s, x) => s + x.messages.filter((m) => m.role === 'output').length, 0);

  return `# 星穹弈境 · Astral Chess Arena

## —— 作业提交材料 ——

**项目**：星穹弈境 · 棋盘自走棋（NodeJS + SQLite + 浏览器前端）

**仓库**：\`git@github.com:JiHuiYiYou/AstralChessArena.git\`

**目录**：\`study/vibecoding研修课/astral-chess-arena/\`

**运行方式**：

\`\`\`bash
cd astral-chess-arena
npm run dev        # 起服务并自动打开浏览器（零依赖，不需要 npm install）
npm test           # 单元测试
\`\`\`

---

## 一、项目简介

把国际象棋的走法搬进自走棋：8×8 棋盘上，英雄按国际象棋六种棋子的走法自动走位与攻击，
外层套上自走棋的商店、经济、羁绊、装备与养成循环。

- **后端**：NodeJS（\`node:http\` + 内置 \`node:sqlite\`），零运行时依赖，规范化表结构，10 张表。
- **前端**：浏览器原生 ES module，无打包器。棋盘增量渲染，战斗由服务端产出**带时间戳的事件流**、前端按时间轴播放。
- **传统机制**：兵升变、将军/将死、王车易位、吃过路兵、蹩马腿、终局和棋。
- **自走棋机制**：商店与刷新、回合经济（基础收入/连胜连败/存款利息）、职业羁绊（2/4/6 件三档）、装备、章节难度。
- **数值取向**：割草膨胀。无界暴击连击链 + 破防 + 护盾 + 最终伤害倍率 + 大招倍率 + 残血处决。
- **打击感**：屏幕震动（按伤害量级分 4 档）、命中顿帧、分级伤害飘字、连击横幅、处决十字斩、将死全屏黑闪，外加程序化 WebAudio 音效。

由原版单文件浏览器游戏《星穹弈境》（5041 行，localStorage 存档）重写而来，
原版保留在 \`legacy/\` 供对照，移植过程中修掉了它 **20 个已确认的 bug**（见附录 SPEC.md 的对照表）。

---

## 二、参考了哪些游戏

| 来源 | 借鉴了什么 |
|---|---|
| **国际象棋** | 六种棋子的走法与阻挡规则、蹩马腿、兵升变、将军/将死、王车易位、吃过路兵、终局和棋 |
| **《云顶之弈》(TFT)** | 商店与刷新、回合经济（基础收入 / 连胜连败 / 存款利息）、职业羁绊（2/4/6 件三档）、星级与棋子池、章节式难度推进 |
| **《Dota 2》自走棋 (autochess)** | 棋盘自走棋的形态本身：棋子上场占位、前后排站位、装备栏、「自动战斗 + 前后各一半回合」的节奏 |
| **《炉石传说》** | 卡牌附魔（\`+\` / \`×\` 两种操作、10 种属性）、卡牌稀有度、随机强化 |
| **《杀戮尖塔》(Slay the Spire)** | 单局构筑思路：每回合做「买 / 刷 / 强化」的有限决策，章节式推进 |
| **原版《星穹弈境》**（本仓库 \`legacy/\`） | 暴击连击链、暴击倍率波动、职业分工（影刃/奥术师/圣疗者/铁卫）、等级成长上限表、战前布阵与回合循环 |

---

## 三、游戏截图

${screenshotsMarkdown()}
---

## 四、开发过程记录

> 记录了本项目**全部的提示词输入**与**模型在文字框里的输出**（不含思考过程与工具调用）。
> 按会话分段，**新开启的会话已额外标注**。

- 会话数：${sessions.length}
- 提示词输入：${prompts} 条
- 模型输出：${outputs} 条

${transcriptMarkdown(sessions)}
---

## 五、附录

### 附录 A · AGENTS.md（给 AI 协作者的仓库规约）

${appendix('AGENTS.md')}
### 附录 B · SPEC.md（完整规格）

${appendix('SPEC.md')}
### 附录 C · TASK.md（任务清单）

${appendix('TASK.md')}
### 附录 D · docs/balance.md（数值与平衡调参规约）

${appendix('docs/balance.md')}
### 附录 E · docs/frontend.md（前端渲染与动效规约）

${appendix('docs/frontend.md')}
### 附录 F · docs/pitfalls.md（踩过的坑）

${appendix('docs/pitfalls.md')}
`;
}

/* ------------------------------------------------------------------ *
 * 3. 生成 docx
 * ------------------------------------------------------------------ */

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const md = buildMarkdown();
  fs.writeFileSync(MD_PATH, md, 'utf8');
  console.log(`Markdown 已生成：${MD_PATH}（${(md.length / 1024).toFixed(0)} KB）`);

  // pandoc 需要能解析到相对路径的图片
  execFileSync('pandoc', [
    MD_PATH,
    '-o', DOCX_PATH,
    '--resource-path', OUT_DIR,
    '--toc',
    '--toc-depth=2',
  ], { stdio: 'inherit' });

  const kb = (fs.statSync(DOCX_PATH).size / 1024).toFixed(0);
  console.log(`Word 文档已生成：${DOCX_PATH}（${kb} KB）`);
}

main();
