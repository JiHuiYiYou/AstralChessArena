# AGENTS.md

**星穹弈境 · Astral Chess Arena** —— 棋盘自走棋。NodeJS 后端（`node:http` + 内置 `node:sqlite`）
+ 浏览器前端（原生 ES module，无打包器）。**零运行时依赖。**

本文件是**索引**：只写每次都要用到的内容。更细的规约按主题拆在下面的小文档里，需要时再读。

---

## Environment

- Windows 10 + MSYS2 bash。Node **≥ 22.5**（推荐 24，`node:sqlite` 需要）。
- 端口 **5180**（不要用 5173 —— 本机有个 Vite 绑在 IPv6 的 ::1 上，
  浏览器访问 `localhost:5173` 会命中它而不是本项目）。端口被占时自动 +1 顺延。
- 数据库 `data/arena.db`（SQLite，gitignored）。改 `schema.sql` 后跑 `npm run db:reset`。
- 版本控制用 **Jujutsu**（Git 后端）。远程 `git@github.com:JiHuiYiYou/AstralChessArena.git`。
  **所有 jj 命令必须加 `--no-pager`**（本机 jj 会自动进分页器并吃掉后续输入）。

## Conventions

- **零运行时依赖**，前端**不打包**。不要引入 Express / Vite / webpack / 任何 UI 框架。
- `src/core/` 是纯逻辑：**不许碰 IO**，不许用 `Math.random()`（要用 `core/rng.js` 的可播种 Rng）。
- 所有写操作在**一个事务**里（`transaction(fn)`），失败整体回滚。
- **JS 侧字段一律 camelCase**，只有 SQL 列名是 snake_case —— 混用会把属性算成 NaN。
- 数值全部集中在 `src/core/balance.js`。
- 界面**不要加多余的副标签和说明文字**，让布局本身解释（用位置、颜色、分区）。
- 注释与 UI 文案用中文；标识符用英文。

## 常用命令

```bash
npm run dev          # 起服务 + 自动开浏览器（不需要 npm install）
npm test             # node:test 单元测试
npm run balance      # 平衡模拟：按章节统计胜率曲线
npm run doc          # 从会话记录生成提交用的 Word 文档
node tools/smoke-api.mjs   # 端到端接口冒烟（需先 npm run dev）
node tools/shoot.mjs       # 游戏截图 → deliverables/screenshots/
npm run db:reset     # 删库重建
```

## Reference —— 按需加载

| 主题 | 文件 |
|---|---|
| 完整规格：棋盘走法、伤害公式、API、表结构、事件流 | [SPEC.md](SPEC.md) |
| 数值与平衡调参规约（改数值前必读） | [docs/balance.md](docs/balance.md) |
| 前端渲染与动效规约（改前端前必读） | [docs/frontend.md](docs/frontend.md) |
| 踩过的坑清单（原版 20 个 bug + 本项目自己踩的） | [docs/pitfalls.md](docs/pitfalls.md) |
| 任务清单（当前进度） | [TASK.md](TASK.md) |
| 怎么跑 / 参考了哪些游戏 | [README.md](README.md) |
| 作业提交材料说明 | [deliverables/README.md](deliverables/README.md) |

## 目录分层

```
src/core/      纯逻辑，无 IO，可在 test/ 里直接 import
src/db/        SQLite：schema.sql / index.js / seed.js / repo/
src/services/  业务编排，事务边界在这一层
src/http/      极简路由 + JSON body + routes/
public/        浏览器前端（原生 ES module）
test/          node:test 单元测试
tools/         平衡模拟、接口冒烟、文档生成、截图
legacy/        原版单文件 HTML 游戏（保留作对照）
```

依赖方向单向：`http → services → db/core ← core`。**`core` 永远不 import 上层。**
