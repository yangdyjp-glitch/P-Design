# 实施流程

本文件定义 Agent 真正执行 BLCaptain Style Skill 时的生产路径：从读懂内容到出图把关的固定 7 步。

核心原则：先锁定一个真实使用场景（平台 / 画幅 / 内容 / 图），输出真实比例成图，再迭代精修。技术 PASS 不等于视觉 PASS——机器 gate 只证明结构没坏，最终由人工视觉确认。

## 固定 7 步

### 1. Intake

先抓 4 件事：

- 目标平台和画幅
- 风格系统与主题倾向
- 内容素材、标题、正文、截图或数据
- 用户是否已有图片、截图或产品图

无图且布局需要图片时，只问一次 A/B/C：

```text
A. 你提供自己的实拍图 / 截图 / 产品图
B. 我先用 AI 生成纯净写实摄影图
C. 我按 Unsplash -> Pexels -> StockSnap CC0 -> Pixabay -> Kaboompics -> Flickr CC0 / Public Domain -> Openverse CC0 / Public Domain -> Wallhaven -> 直接搜索取图，并写 SOURCES.md
```

不要二次劝导用户选 A。

### 2. Style & Theme

在三套视觉语言中按内容认领一套：

- `Still Paper` 静纸 —— 生活 / 随笔 / 旅行 / 读书
- `Signal Proof` 实证 —— tech / AI / 数据 / 职场
- `Bridge Canvas` 图桥 —— 跨平台 cinematic 封面与多画幅同源

主题：静纸 `SP-01 Mist Field` / `SP-02 Warm Study` / `SP-03 Coastal Quiet` / `SP-04 Night Grain` / `SP-05 Hearth & Table`；实证 `SL-01 Electric Blue` / `SL-02 Graphite Mint` / `SL-03 Safety Coral` / `SL-04 Acid Lime` / `SL-05 Signal Noir`；图桥 `BC-01` cinematic split-tone。

### 3. Layout Contract Selection

先选布局合同，再写或压缩文案。

布局选择必须能说明：

- 这张卡的唯一任务
- 标题和正文上限
- 图片角色
- 来源记录方式
- 是否需要满铺图主体避让
- 是否需要中英混排角色

### 4. Asset Prep

图片资产必须先准备，再进入渲染。

每个需要图片的任务必须生成：

```text
assets/IMAGE_REQUESTS.md
assets/SOURCES.md
```

公开图源顺序固定：

```text
Unsplash -> Pexels -> StockSnap CC0 -> Pixabay -> Kaboompics -> Flickr CC0 / Public Domain -> Openverse CC0 / Public Domain -> Wallhaven -> 直接搜索
```

图片必须落本地，来源必须写入 `SOURCES.md`。成图内是否显示来源，由用户或任务要求决定，但本地来源记录不可省略。

满铺图必须声明：

- 主体地图
- 文字安全区
- 避让区
- 遮罩 token
- `object-position`

### 5. Compose & Render

优先使用现有 CLI、engine、style/layout 系统，不新增不必要抽象。

生产链路：

```bash
node bin/blcaptain-style.mjs build <brief.json> --out <task-dir>
node render.mjs <task-dir>
```

渲染产物必须在 `output/` 下生成 PNG。

### 6. Gate & Review

自动 gate 默认要跑，不是“按需验证”。

单卡或任务目录常规验证：

```bash
npm run check
node scripts/asset-source-gate.mjs <task-dir>
node scripts/layout-geometry-gate.mjs <task-dir>
node render.mjs <task-dir>
node validate-social-deck.mjs <task-dir>
python3 scripts/visual-audit.py <task-dir>
```

发布工程健康验证：

```bash
npm run release:check
```

发布前判断：

- `npm run release:check` PASS 只代表工程健康。
- 代表样张必须完成 build / render / validate。
- 人工视觉确认完成后，才允许进入 tag 或公开发布。

### 7. Iterate

用户给反馈后，只在当前对象内迭代：

- `PASS`：记录状态，可进入下一步。
- `PASS_WITH_MINOR_TUNE`：只做小调优，再重新渲染和验证。
- `FAIL_VISUAL`：停在当前视觉对象内调方向，不进入下一阶段。
- `FAIL_ASSET`：重做图片资产和来源记录。
- `FAIL_CONTRACT`：回到布局合同，不直接改样式绕过。
- `FAIL_COPY`：重压文案，再走渲染和验证。
- `FAIL_SUBJECT_OCCLUSION` / `FAIL_CONTRAST` / `FAIL_CROP`：只针对满铺图主体避让、遮罩、裁切和安全区修正。

所有最终人工状态只能通过用户明确确认后写入：

```bash
npm run manual:set-status -- --id <ITEM_ID> --status <STATUS> --confirmed-by-user --note "<用户确认记录>"
```

不得手动伪造 `tasks/manual-review-status.json`。

## 参考边界

可以研究 业界优秀项目 和业界最佳实践中的流程、方法、质量门禁和产品化组织方式。

不得复制任何设计、代码、模板、CSS、配色、资产、布局 ID 或视觉身份。我们的视觉语言必须保持 `Still Paper` 和 `Signal Proof` 自身的合同约束。
