# deliverables —— 作业提交材料

这一目录里是**需要提交给老师/评委的全部内容**。
项目根目录另有一份 `提交材料.docx` 副本，方便直接取。

| 文件 | 内容 |
|---|---|
| `提交材料.docx` | **主交付物，一份文档装全部**：项目简介 / 参考了哪些游戏 / 游戏截图（内嵌）/ 全部提示词输入 + 模型文字框输出（按会话分段，新会话已标注）/ AGENTS.md、SPEC.md、TASK.md 全文附录 |
| `提交材料.md` | 上面那份文档的 Markdown 源（`提交材料.docx` 由它经 pandoc 生成，便于 diff 与重生成） |
| `screenshots/*.png` | 7 张游戏截图，已内嵌进 docx；单独保留是为了方便单独提交 |

## 怎么重新生成

```bash
# 1. 起服务（截图需要）
npm run dev

# 2. 重新截图
node tools/shoot.mjs

# 3. 重新生成 Word 文档
npm run doc
```

`tools/build-doc.mjs` 会扫描 `~/.claude/projects/` 下**本工作目录**的会话记录，
只收录与本项目相关的会话（首条提示词里出现 `SQLite` / `AstralChessArena` /
`astral-chess-arena` / `星穹弈境` / `NodeJS项目` 的），
按 `sessionId` 合并、按时间排序，逐条抽出：

- **提示词输入** = user 消息里的文本块（去掉自动注入的 `<system-reminder>`）
- **模型输出** = assistant 消息里的 `text` 块（**不含** thinking 与 tool_use）

每段会话单独成节，第二个及以后的会话标题带 `【新开启的会话】` 标注。

## 提交清单自检

- [x] Word 文档一份，含全部要求的内容
- [x] 提示词输入与模型输出**全部**收录，按会话分段
- [x] 新开启的会话**已额外标注**
- [x] 说明参考了哪些游戏（文档第二章 + `README.md`）
- [x] 自己游戏的截图（文档第三章，7 张）
- [x] `AGENTS.md` / `SPEC.md` / `TASK.md`（项目根目录，文档附录 A/B/C）
