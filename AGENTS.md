# AGENTS.md

给在这个仓库里干活的 AI / 人看的**作业规约**。改代码前先读一遍。

---

## 1. 这是什么

**星穹弈境 · Astral Chess Arena** —— 棋盘自走棋。
NodeJS 后端（`node:http` + `node:sqlite`）+ 浏览器前端（原生 ES module，零打包器）。

游戏本体是「国际象棋的走法」×「云顶之弈的商店与羁绊」×「暴击连击链式的割草数值」。

---

## 2. 硬约束（不要违反）

| 约束 | 原因 |
|---|---|
| **零运行时依赖** | 老师/同学 `npm install` 不用下载任何东西，`npm run dev` 立刻能跑，不会因为网络装不上依赖而失败 |
| **前端不打包** | 用浏览器原生 ES module（`<script type="module">` + 相对路径 import）。不要引入 Vite/webpack/esbuild |
| **不要把整个游戏状态塞进一个 JSON 字段** | SQLite 要规范化。静态内容（职业/模板/装备/卡池）与动态数据（存档/棋子/战斗记录）分表 |
| **`core/` 里不许碰 IO** | `src/core/*` 是纯逻辑，不 import `db/`、不读文件、不用 `Math.random()`。这样才能单测 |
| **所有写操作必须在一个事务里** | `src/services/*` 用 `transaction(fn)` 包住「校验 → 扣资源 → 改数据 → 落盘」，任一步失败整体回滚 |
| **随机数必须走 `Rng`** | `src/core/rng.js` 的可播种 xorshift128+。不要用 `Math.random()`（战斗要能复现） |
| **字段名统一 camelCase** | JS 侧（含 `balance.js` 的模板对象）一律 camelCase；**只有 SQL 列名**是 snake_case。混用会把属性算成 NaN |
| **界面不要加多余的副标签和说明文字** | 让布局本身解释（用位置、颜色、分区）。见 `feedback-no-redundant-labels` 的同款原则 |

---

## 3. 目录分层

```
src/core/      纯逻辑，无 IO。可以在 test/ 里直接 import
src/db/        SQLite 连接、schema、seed、repo（唯一写 SQL 的地方）
src/services/  业务编排，事务边界在这一层
src/http/      路由、body 解析、routes
public/        浏览器前端
test/          node:test 单元测试
tools/         开发脚本（平衡模拟、冒烟、文档、截图）
```

**依赖方向是单向的**：`http → services → db/core ← core`。
`core` 永远不 import 上层。

---

## 4. 命名与风格

- 2 空格缩进，单引号，分号结尾。
- `const` / `let`，不要 `var`。
- 注释与 UI 文案用中文；标识符用英文。
- 一个文件只干一件事；文件顶部写一行中文注释说明用途。
- 注释解释**为什么**，不解释**做了什么**。

---

## 5. 数值改动流程

**所有数值集中在 `src/core/balance.js`，不要散落在别处。**

改完数值后必须跑：

```bash
npm test                       # 单元测试
node tools/balance-sim.mjs     # 平衡模拟，看各章节胜率曲线
```

平衡目标曲线（`tools/balance-sim.mjs` 的输出）：

| 章节 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| 期望胜率 | 90%+ | 85% | 70% | 60% | 50% | 40% | 30% | 20% |

胜率要**随章节平缓下降**，不能第一章就崩，也不能一路平躺。

---

## 6. 前端改动要点

- **动画只动 `transform` / `opacity` / `filter`**，不要动 `top/left/width/height`（layout thrash）。
- **不要用 `innerHTML` 全量重绘**。棋子元素按 id 缓存复用（`public/js/render/board.js` 的 `pieceIndex`），
  血条只改 `width`，动效只加/删 class —— 否则正在播的动画会被下一次渲染冲掉。
- 战斗动效走 `public/js/battle/vfx.js`，战斗流程走 `public/js/battle/player.js`，
  不要在业务代码里直接操作 DOM。
- 新增 CSS 类要先在 `public/styles/` 里定义（4 个文件分工：base / board / panels / vfx）。

---

## 7. 测试

```bash
npm test                          # node:test， glob "test/*.test.js"
node tools/smoke-api.mjs          # 需要先 npm run dev，跑通全部 REST 接口
node tools/balance-sim.mjs        # 批量战斗模拟
```

新增玩法逻辑 → **必须**在 `test/` 里加用例。数值公式尤其要加：
伤害结算的每一步、升阶公式、上限判定、工资公式。

---

## 8. 版本控制（Jujutsu）

本仓库用 jj 管理（Git 后端）。**本机 jj 会自动进分页器并吃掉你的输入**，
所有命令务必加 `--no-pager`：

```bash
jj status --no-pager
jj diff --no-pager
jj describe -m "说明" --no-pager
jj new
jj log --no-pager
```

提交粒度：**一个里程碑一个 commit**，提交信息用中文写清楚做了什么。

---

## 9. 交付物

作业要提交的东西都在 `deliverables/`：

| 文件 | 内容 |
|---|---|
| `提交材料.docx` | **一份文档装全部**：提示词输入 + 模型输出（按会话分段并标注新会话）、参考了哪些游戏、游戏截图、AGENTS/SPEC/TASK 全文 |
| `screenshots/*.png` | 游戏截图（会被内嵌进 docx） |

生成命令：

```bash
npm run doc          # 会话 JSONL → Markdown → pandoc → docx
node tools/shoot.mjs # 截图
```

`tools/build-doc.mjs` 会从 `~/.claude/projects/<slug>/*.jsonl` 读会话记录，
按 `sessionId` 分段，抽出 user 的文本输入与 assistant 的 `text` 块（不含 thinking / tool_use）。
