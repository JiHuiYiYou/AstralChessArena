# TASK.md —— 作业任务清单

> 图例：`[x]` 已完成 · `[~]` **进行中** · `[ ]` 未开始
> 最后更新：2026-11-03

---

## 阶段一 · 立项与设计

- [x] 摸清原版《星穹弈境》（`legacy/星穹弈境.html`，5041 行）的问题清单
- [x] 通读原版源码，定位 **20 个真实 bug**（含"最终伤害倍数"卡实际加的是大招倍率、
      初始棋子攻击力被上限静默砍掉、升级撞上限仍吞金币、取消弹窗吞金丹、闪避判定在连击链之后、
      100 回合超时判负、布阵整条链路是死代码……）
- [x] 确定产品方向：**NodeJS + SQLite 后端 + 浏览器前端**，**棋盘自走棋**玩法，**割草式**数值
- [x] 定技术选型：**零运行时依赖**（`node:http` + `node:sqlite` + 原生 ES module，无打包器）
- [x] 设计分层架构：`core / db / services / http / public`
- [x] 设计 SQLite 规范化表结构（10 张表，不塞大 JSON）
- [x] 设计战斗**事件流**协议（服务端算完整场 → 前端按时间轴播放）
- [x] 写 `SPEC.md`（规则、公式、API、表结构、原版 bug 对照表）
- [x] 写 `AGENTS.md`（仓库规约）
- [x] 写 `README.md`（怎么跑 + 参考了哪些游戏）

## 阶段二 · 核心玩法引擎

- [x] `core/board.js` —— 8×8 棋盘与坐标
- [x] `core/movement.js` —— 六种棋子走法
  - [x] 马的**蹩马腿**
  - [x] 兵升变、**吃过路兵**、**王车易位**
  - [x] 滑行类的路径阻挡（修复：可吃的格子被误当成落点）
- [x] `core/combat.js` —— 伤害结算全流程
  - [x] 无界暴击连击链（保留原版爽感 + 12 层上限与衰减）
  - [x] **破防**累积
  - [x] **护盾**吸收
  - [x] **最终伤害倍率**（原版缺失，bug ①）
  - [x] **处决**（残血 <15% 直接斩杀，无视护盾）
  - [x] 闪避判定提前到连击链之前（bug ⑤）
- [x] `core/battle.js` —— 回合循环 + 事件流产出
  - [x] 按 speed 排序的行动顺序（原版没有 speed 字段，bug 17）
  - [x] `runPhase(side)` 统一友方/敌方阶段（消除 60 行复制粘贴，bug 16）
  - [x] 将死 / 平局判定（bug ⑨）
- [x] `core/ai.js` —— 双方共用的目标与走位评分（敌方不再是纯木桩）
- [x] `core/synergy.js` —— 羁绊（敌我双方都生效）
- [x] `core/progression.js` —— 训练 / 升阶 / 突破 / 附魔
  - [x] 升阶「取大 + 小的 50%」（bug ⑧）
  - [x] 训练撞上限直接禁用，不吞资源（bug ③）
  - [x] 突破同步抬高该属性上限
- [x] `core/economy.js` —— 回合收入 / 利息 / 商店
- [x] `core/items.js` —— 装备与卡牌（生命卡同改 maxHp，bug ④）
- [x] `core/rng.js` —— 可播种 xorshift128+，种子入库（bug ⑭）
- [x] `core/balance.js` —— 全部数值表集中一处

## 阶段三 · 数据与后端

- [x] `db/schema.sql` —— 10 张表
- [x] `db/index.js` —— 连接、PRAGMA、事务封装
- [x] `db/seed.js` —— 静态内容幂等灌库
- [x] `db/repo/` —— meta / save / battle 三个 repo
- [x] `services/` —— 事务边界在这一层（校验 → 扣资源 → 改数据 → 落盘）
- [x] `http/` —— 极简路由、JSON body、全部 REST 端点
- [x] `server.js` / `dev.js` —— 静态资源 + 端口顺延 + 自动开浏览器
- [x] 修复：`queryAll` 漏传参数导致查询静默返回空 → 加占位符数量校验
- [x] 修复：模板字段 camelCase / snake_case 混用导致属性算成 NaN
- [x] 修复：`save_heroes` 缺 code/glyph/职业 → JOIN 模板表

## 阶段四 · 前端

- [x] `public/styles/` —— base / board / panels / vfx 四个文件（黑金深空风）
- [x] `public/js/api.js` —— 接口封装
- [x] `public/js/render/board.js` —— 棋盘渲染（**增量更新**，不整盘重绘）
- [x] `public/js/render/shop.js` / `roster.js` / `synergy.js` —— 侧栏面板
- [x] `public/js/battle/vfx.js` —— 屏幕震动 / 顿帧 / 飘字 / 处决 / 升变 / 将死
- [x] `public/js/battle/sound.js` —— 程序化 WebAudio 音效（18 种，无音频文件）
- [x] `public/js/battle/player.js` —— 事件流播放器（可调速、可跳过）
- [x] `public/js/main.js` —— 主控
- [x] 棋盘朝向修正（敌在上我在下）+ 上下色带区分敌我（不靠文字说明）
- [x] 矮屏自适应（棋盘按视口高度收缩，保证一屏可见）

## 阶段五 · 测试与调优

- [x] `test/combat.test.js` —— 伤害结算 15 条用例（含蒙特卡洛验证期望伤害公式）
- [x] `test/movement.test.js` —— 走法 12 条用例（含蹩马腿、吃过路兵）
- [x] `test/progression.test.js` —— 养成公式 14 条用例
- [x] `tools/smoke-api.mjs` —— 端到端接口冒烟（30 项全通过）
- [x] `tools/balance-sim.mjs` —— 批量战斗模拟，按章节统计胜率
- [x] 平衡调整：敌方等级不再跟着玩家回合暴涨、大招初始冷却、基础上调生命
- [x] 浏览器实测：建档 → 商店 → 布阵 → 训练 → 突破 → 战斗全流程跑通

## 阶段六 · 作业交付

- [~] **生成提交用 Word 文档**（一份文档装全部：提示词输入 + 模型输出、
      会话边界标注、参考了哪些游戏、游戏截图、AGENTS/SPEC/TASK 全文）
- [~] **游戏截图**（主界面 / 商店 / 阵容 / 羁绊 / 战斗 / 结算）
- [ ] 文档内容校对与排版微调
- [ ] jj 提交最终版本并推送到 GitHub

## 阶段七 · 后续可做（不阻塞交作业）

- [ ] 章节关卡地图 UI（把 12 章做成一张路线图）
- [ ] 战斗回放界面（`battles` 表已经存了完整事件流，只差 UI）
- [ ] 更多装备与卡牌稀有度（史诗卡的掉落保底）
- [ ] 敌方 AI 加「开局抢位」与「集火」策略
- [ ] 棋盘坐标显示（a1–h8）与走法提示
- [ ] 存档导入/导出（JSON 文本，便于换机继续）
- [ ] 服务端 WebSocket 推送（现在是轮询式的一次性请求）
