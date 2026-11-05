# Changelog

本项目遵循「Skill 是产品不是 prompt」：每一版都有清楚的为什么。

## [Unreleased] — 2026-07-08 · 图源清单核验修订

### 为什么
公开图源会关站，清单不核验就会把死站当活源，让 Agent 在取图时空跑或误引来源。本次按 2026-07-08 实测逐站核验并修订。

### 移除 / 更正
- **泼辣有图（polayoutu.com）已停运**（302 跳转泼辣修图产品官网）→ 从图源全集移除。
- **别样网（bieyang.info）已关站**（域名待售）→ 移除。
- **更正长期误标**：代码里 `ssyer`（ssyer.com）此前被标为「别样网」，实为**沙沙野**（有 ICP 备案、声明 CC0 1.0，存活）→ 全库更名为沙沙野，保留为国内 CC0 直取源。

### 降级 / 备注
- **cc0.cn 降为人工浏览入口**（`manual: true`，不进程序化取图顺序）：聚合部分仅预览图、原图须跳源站，「CC0」标签与源站真实协议（如 Unsplash License）可能不符，且无 API。
- **hippopx 标注「仅备选」**：可直链但全站无条款页 / 无作者 / 无来源追溯 / 无 DMCA，法律兜底最弱。
- **国内位主力改为沙沙野 + Pexels / Pixabay 中文站**（有中文界面、国内可访问、官方 API）。

### 工程
- 图源全集新增 `verified` 核验日期字段与 `manual` 标记，做成可热更清单；`providerOrderHeuristic` 默认顺序过滤 `manual` 源。
- 同步修订 `src/imageWorkflow.mjs`、`src/plan.mjs`、`references/image-source-workflow.md`、`references/image-sourcing.md`、`references/best-practices.md`、`SKILL.md`、`README.md` 与 `scripts/domestic-image-sources.test.mjs`。
- ⚠️ 待确认：国内直连可达性因本次核验经代理出口（美国），未能实测，需在真实国内网络复测一次。

## [1.2.0] — 2026-06-14 · 首个公开发布

### 命名
- 三套视觉语言定名：**静纸 Still Paper** / **实证 Signal Proof**（原名带「账本」记账味，改用「实证」贴「实证主义＝证据方法论」灵魂）/ **图桥 Bridge Canvas**。

### 设计升级（对标 SPD / TDC / Kinfolk / Apple keynote / 2026 趋势）
- **字阶 hero 反差**：每页一处 ≥3:1 巨字带（essay 92 / list 80 / keywords 86 / quote 80），从「规整内文」升到「杂志特稿开篇」的第一眼冲击。
- **图集 photo-essay 海报版**：英雄图满铺领头 + 标题压图（暖墨渐变）+ 不等大节奏小图。
- **影像吸睛**：三套 duotone 收高光端、拉黑白跨度（顶级 monochrome）；新增 **haze 散焦氛围 register**（`grade:"haze"` → blur + 压暗 + 颗粒 → cinematic 情绪底）。
- 新组件：marginalia 边注时间轴、截图 staged 证据卡、测评评分卡、手绘路线图。

### 退役 / 中性化
- 默认 layout 不再 fallback 到遗留 `statement-cover`，走干净的静纸标题版（修「无 brand 卡难看」根因）。
- plan 把 data/tutorial/product/news 重路由到**实证 Signal**（为这些内容而生），遗留 `planLegacyBrief` 退役。
- 中性化：用户卡面不印内部代号 / demo 假信息（`--brand` 才署名）；`files` 白名单排除无来源图、内部资产、local-tests。

### 发布物
- README hero 图 + badge + `npx skills add` 一行装入口 + 命名一致。
- 新增 `PRODUCT.md`、`docs/ASSET-OVERVIEW.md`（资产全貌）。

## [0.9.0]

- 「1 引擎 + 3 视觉语言」系统结构全部落地（静纸 / 实证 / 图桥）。
- 智能驱动工作流「五动作出图法」（读懂 → 定调 → 分页 → 落版 → 成图 + 把关）。
- 首批 accepted 封面母体（资产快照保护）。
- 图源工作流（CC0 国内源前置 + SOURCES 留痕 + 克制 AI 生图）。
- 多平台同源（3:4 / 1:1 / 16:9）。
