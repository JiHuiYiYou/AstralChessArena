# docs/frontend.md —— 前端渲染与动效规约

> 改前端前先读这一份。前端是**浏览器原生 ES module**，无打包器、无框架、无依赖。

---

## 1. 渲染模型

```
public/js/
  api.js              接口封装（唯一发请求的地方）
  main.js             主控：拉数据 → 改 state → 调 render
  render/board.js     棋盘（增量更新）
  render/shop.js      商店
  render/roster.js    阵容 + 装备背包
  render/synergy.js   羁绊
  battle/player.js    战斗事件流播放器
  battle/vfx.js       打击感（震动/飘字/处决/升变/将死）
  battle/sound.js     程序化 WebAudio 音效
  ui/toast.js         轻提示
  ui/modal.js         弹窗
  ui/particles.js     背景粒子
```

---

## 2. 三条铁律

### ① 不要 `innerHTML` 全量重绘

棋子元素按 id 缓存复用（`render/board.js` 的 `pieceIndex`）：

- 血条**只改 `style.width`**，不重建元素 —— 否则 CSS 的 `transition` 失效，血条「啪」地跳。
- 动效**只加/删 class**，不重建节点 —— 否则正在播的动画会被下一次渲染冲掉。
  （这是原版最大的架构病：`innerHTML` 全量重绘把 `attacking` / `taking-damage` /
  组合斩 / 伤害飘字全部打断。）

### ② 动画只动 `transform` / `opacity` / `filter`

不要动 `top` / `left` / `width` / `height`，也不要动 `letter-spacing`
（它会触发 layout）。飘字用 `transform: translate(-50%, -50%)` 起步，
动画里只改 `translateY` / `scale` / `opacity`。

### ③ 战斗是「事件流播放」，不是「边算边画」

服务端算完整场战斗 → 产出带时间戳的事件数组 → 前端按 `t` 的差值播放。
前端**不参与战斗计算**。

好处：
- 动画不会被下一次渲染冲掉。
- 速度可调（0.5×/1×/2×/4×）与「跳过」都不影响结果。
- 战斗可以存进 `battles` 表回看 —— 回放用的是同一个播放器，观感完全一致。

---

## 3. 新增动效的流程

1. 在 `public/styles/vfx.css` 里定义 `@keyframes` 与配套 class
   （`animation-fill-mode: forwards`、`will-change: transform, opacity`）。
2. 在 `public/js/battle/vfx.js` 里加一个导出函数：**加 class → setTimeout 移除**。
3. 在 `public/js/battle/player.js` 的事件处理里调用它。

不要在业务代码里直接操作 DOM。

---

## 4. 样式文件的分工

| 文件 | 内容 |
|---|---|
| `public/styles/base.css` | 变量、重置、顶栏、按钮、标签页、面板、toast、modal、表单、滚动条、响应式 |
| `public/styles/board.css` | 8×8 网格、格子状态、棋子、血条、坐标、覆盖层 |
| `public/styles/panels.css` | 英雄卡、商店槽、羁绊行、阵容、图鉴、战斗日志、结果面板 |
| `public/styles/vfx.css` | 全部 `@keyframes` 与动效类 |

**加载顺序必须 base → board → panels → vfx**（vfx 最后，让动效规则压过其它规则）。

`@media (prefers-reduced-motion: reduce)` 每个文件都要有。

---

## 5. 布局约定

- 敌我用**上下两条色带**区分（`.board::before` 红 / `.board::after` 绿），
  **不要**再写「我方半场」「敌方半场」这种说明文字。
- 界面不要加多余的副标签和说明文字 —— 让布局本身解释。
- 矮屏下棋盘按视口高度收缩（`.board-frame { max-width: calc(100vh - 245px) }`），
  保证棋盘与下方按钮一屏可见。

---

## 6. 输入处理

- 布阵是**点选**（点棋子 → 点格子），不是拖拽。棋子元素 `pointer-events: none`，
  由外层格子处理点击。
- `playwright-cli` 自动化时**必须显式 `--browser=chrome`** —— 这台机器的默认浏览器是坏的。
- 截图产物落在 CWD 的 `.playwright-cli/`，**记得 `.gitignore` 掉并及时清理**。

---

## 7. 音效

全部是 WebAudio 程序化合成（`battle/sound.js`），**不引入任何音频文件**。

- `ensure()` 必须在**用户手势**里第一次调用（浏览器自动播放策略）。
- `AudioContext` 被拒时静默降级，不要抛异常。
- 每个音效用完 `stop()` 释放节点，别泄漏。
