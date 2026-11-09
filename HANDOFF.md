# P-Design / 图序：跨电脑交接

更新日期：2026-11-09。本文记录版本及接续方法；后续修改应同步更新本文的部署记录和限制。

**最新 0.5.2：预案一整套设计使用全部上传图片。** 任务保存必用图片清单，AI 按原图与内容分配页面，真实渲染、服务端校验及网页应用前逐张核对；缺文件提前报错，漏图进入原有的一次自动修正。最多 8 张，保留原图 80% 裁剪保护、单图范围与旧任务的原始约定。旧作品不自动重排，重新执行整套设计才使用新版预案（版本 5）。实现与验证入口见 [上传图片覆盖检查](docs/upload-coverage.md)。

**0.5.1：任务按钮显示目标页码和实际阶段。** 用「第 2 张 · 调整版式／搜索实景配图」替代统一的「AI 处理中」；真实网页逐页检查时显示「整套 · 检查 2/6 张」，随后显示保存画面。设计记录与详情同步，跨页/跨项目不误指当前图，保存成功后恢复发送。没有新增模型调用或数据库迁移；接续入口与验证边界见 [任务进度说明](docs/job-progress.md)。

**0.5.0：用户已要求登录与独立账户，取代 Railway 的匿名访客入口。** 登录页为 `/login`，管理员账户名 `admin`，按用户指定的初始密码创建；管理员可新建、启停普通账户。项目、素材、任务、下载、个人额度及本机缓存按账户隔离，管理员不直接读取其他人的作品。账号与会话保存在现有数据库，启动自动迁移，原 Sites 身份与当前 PostgreSQL TLS 配置保留。完整使用、隔离边界和开发方法见 [账户说明](docs/accounts.md)。发布需核对 Railway 部署、`/api/health` 的 `accessMode=accounts` 与真实登录；证据位于忽略的 `qa/railway/accounts/`。

历史阶段曾按用户要求先开放 Railway 访客 AI，启动命令、环境变量、自动技能上传与持久化前提见 [docs/railway.md](docs/railway.md)。其中匿名入口已由 0.5.0 替换，原 Sites 部署记录仍单独保留。

Railway 随后已配置密钥，公网文案生成及实际文件下载验证通过，14 个技能就绪。后续排版失败排查发现正常 CSS 子选择器与标准 SVG 命名空间被误拦；修复入口是 `server/design-result.ts`、`src/style-safety.js`，验证方法和发布前备份要求见上述 Railway 说明及 [QA.md](QA.md)。发布仍需单独核验，不把本地修复或提交视为已上线。

最新 0.3 自动工作流已合入 `main`，开发来源为 `feat/ai-first-workflow-20261106`：保留右侧文案，AI 自行择用 14 个模块、安排分页和画面并自动检查，合格且版本一致后自动呈现。技能按需加载，避免整批 ZIP 超出启动限制；见 [自动设计接续说明](docs/automatic-workflow.md)。2026-11-07 用户已确认没有需要保留的云端项目，发布前的数据保留限制已解除；已合入先前的排版兼容性修复并开始 Railway 发布，实际就绪状态需按上述说明核验。下表是原 Sites 的历史生产基线，不能当成 0.3 已部署记录。

## 1. 先看这里

0.4.3 按用户进一步要求区分三种排版原则：预案一由原图比例、主体与细节决定图框和独立文字区；预案二依据真实搜索照片的主体与留白形成大幅实景、偏轴图文或可读标题叠放；预案三按原文语义和文字密度建立整张文字主视觉，不留照片占位。对应规则版本为 4、2、2，保留来源、原文、上传图 80% 与单图边界。AI 记录实际看图与选版理由，再按各自重点检查；没有新增人工视觉设置。规则与后续修改入口见 [预案规则](docs/style-presets.md)，本轮本机真实验证证据存于忽略目录 `qa/railway/preset-layouts/`，生产状态仍需单独核验。

0.4.2 按用户明确要求将 [三个预案](docs/style-presets.md) 分成上传配图、联网实景配图、纯文字无图。图片入口自动联动，来源规则同时用于任务输入、工具权限、结果校验、网页应用及导出。预案一保留暖白/深墨/苔绿与实景编辑的视觉方向，版本为 3；预案二、三来源规则版本为 1。默认自动设计仍可用。本轮在独立工作副本 `feat/preset-one-editorial-20261108` 修改，并合并已进入 main 的 PostgreSQL 适配，保留该存储升级。实际验证产物位于忽略的 `qa/railway/preset-one/`。

Supabase 接入代码起于 `feat/supabase-storage-20261108`，已合入 main。Railway 配置 `DATABASE_URL` 时使用 PostgreSQL，启动创建 `tuxu` schema，并只将卷内旧 D1 数据导入空目标；图片、结果和访客签名秘密继续保存在卷中。Railway 的 workerd 请求通过容器内回环端口连接，由 Node 按配置完成远端 TLS；原 Sites 保留 D1。详见 [Supabase 接续说明](docs/supabase.md)。当前 64 项测试及本地完整 PostgreSQL 启动流程的 13 项 API 检查通过；真实 Supabase 接通与部署状态必须另查 `/api/health` 的 `databaseProvider`、`databaseConnected` 与 `storagePersistent`，不能把源码完成视为已上线。

0.4.1 增加三个固定风格预案入口，位于新建图文的「整套初始方向」，当时均待设定。后续逐一修改 `src/style-presets.js` 对应条目。选择随项目保存，服务端解析可信规则并将版本固定在任务快照，自动修正沿用同一版本。原文、素材、裁剪和单图范围规则优先。开发来源为 `feat/style-preset-entries-20261108`，发布目标仍为 Railway 的 main；实际部署核验记录位于忽略的 `qa/railway/style-presets/`。

0.4 图片规则已从 `feat/photo-rules-and-search-20261108` 合入 `main` 发布：上传图保留至少 80% 的原图面积，搜图由项目开关明确授权，网络配图优先实景并保存真实来源。裁剪检查同时用于 AI 渲染记录、网页应用和导出；搜图采用可恢复的真实下载和环境附件流程。启动时自动应用 `0002_whole_pandemic.sql`，不增加密钥。本次沿用既有 Railway 发布目标；实际就绪需核对部署、公网资源与接口，证据保存在忽略的 `qa/railway/photo-rules/`。详细语义、来源边界和接续入口见 [docs/photo-policy.md](docs/photo-policy.md)。

0.3.1 逐图修改已从 `fix/page-design-notes-20261108` 合入 `main` 发布：右侧要求改为每张图自己的 `requirements`，新增就近发送按钮与 Ctrl / ⌘ + Enter；单图任务、结果校验、检查、自动修正和应用均限制在目标页。顶部仍可设计整套。2026-11-08 用户确认没有需要保留的项目并授权发布，本次发布的数据保留限制已解除。接续细节见 [docs/page-notes.md](docs/page-notes.md)；实际部署以 Railway 状态、公网资源及接口核验为准，证据保存在忽略的 `qa/railway/`。

这是一个制作小红书封面与图文组图的网站，名称为「图序 · AI 小红书设计工作台」。用户在网页提交文案、照片与要求，服务端调用 AI 和完整设计技能，结果可预览、编辑、下载。

**换电脑后，克隆本仓库，先读本文，再按第 3 节启动。** 生产密钥、云端项目和素材不随 Git 转移；修改源码不需要把它们下载到电脑。2026-11-08 已核验 Railway 修复版本 `41236e33909acd3a4a274bcbff20d440f4c0ac37`：真实 PostgreSQL 查询成功、`tuxu` schema 可用、文件卷标记为 true，独立访客的项目与图片读写、版本保护及隔离均通过。跨部署留存和清理结果保存于执行电脑忽略的 `qa/railway/supabase/retention.json`，部署前仍应检查实时健康状态与最新记录。只有测试本地真实 AI 时，才需要单独准备本机凭证与技能文件清单。

| 项目 | 交接基线 |
| --- | --- |
| GitHub 仓库 | https://github.com/yangdyjp-glitch/P-Design |
| 开发分支 | `main` |
| 线上网址 | https://tuxu-design-studio-20261106.phd-yang.chatgpt.site/ |
| 网站版本 | `0.2.0` |
| Sites 项目 ID | `appgprj_6aecb5faa0b881919c03675fe284bf42` |
| 最近核验的生产源码提交 | `38ac060abe604bb3a574bcff3e6ddc85f1d727e3` |
| GitHub 首次源码导出提交 | `6f912b1d923757b6c4229c8b95104a3d54393104`；后续以 `main` 最新提交为准 |
| 网站访问范围 | 所有者私有；尚未改成公开或邀请他人 |
| 本地开发地址 | `http://127.0.0.1:5173` |

最近核验成功的生产版本 ID：

```text
appgprj_6aecb5faa0b881919c03675fe284bf42~appgver_4cc3db99fef48191a2c046f739c0ece8
```

部署 ID：`appgdep_6aecdc5b9de4819194b34b2e8b69bb42`。以上是交接记录，接续发布前应通过 Sites 工具读取现状。

**Sites 需单独发布；Railway 的 main 推送可能触发自动部署。** 当前改版已获发布授权并合入 main。下文涉及原 Sites 生产站点的发布操作应与 Railway 区分；后续发布仍应先处理需要保留的云端项目。

## 2. 产品要求与完成范围

必须保留的要求：

- 面向小红书用图，适用于不同产品、机构和主题。EJU、留学课程等只是历史案例，不得重新写成通用规则或默认文案。
- 根据任务选择主技能和辅助技能，保持系列变化与可读性；不把 14 个模块全部串行执行。
- 已确定的原文默认锁定，保留正文、数字与标点。文案创作是单独授权的任务。
- 真实照片由用户提供。AI 素材标记为示意素材，不冒充真实教师、课堂或成果。
- 普通使用者从网站直接使用 AI 与技能，无须在自己电脑安装 Codex 技能或提供网站运营者的密钥。
- 保留右侧文案编辑、云端保存、版本冲突保护、桌面和手机入口。0.3 自动设计与检查通过后直接呈现，视觉参数由 AI 判断。

已实现：

- Sites 按 ChatGPT 用户 ID、Railway 按登录账户 ID 隔离云端项目、图片、AI 任务及交付文件；历史访客数据保留原归属。
- 0.3 主界面统一为自动设计；后台保留旧版设计、局部改稿、参考分析、封面、排版复核、文案创作、图像素材与模板接口。
- 14 个完整技能包按需传入 OpenAI 托管环境，执行 Python、Node 和浏览器渲染；必要的示意图片由服务端调用生成。
- 原文校验、HTML/CSS 清理、项目版本检查、任务幂等、取消及基础额度控制。
- 自动分页与照片安排、版本恢复、自动检查、2160×2880 PNG、ZIP、可编辑 HTML 及项目文件导入导出。人工排版和裁切控件已移除。

尚未完成或启用：

- 原 Sites 的公开访问或邀请设置仍未启用；Railway 提供登录入口，普通账户由管理员创建。
- 关闭网页后的可靠后台任务推进。签名回调代码已实现，但未配置生产回调秘密与公开可达的回调链路。当前处理任务应保持网页打开，重新进入可继续处理、查看结果。
- 收费、订阅、团队协作和按金额计费的预算上限。
- 小红书账号登录、自动发帖、评论等运营功能。
- 全部技能、风格、模板组合的穷举验证。已完成验证的范围见 [QA.md](QA.md)。

## 3. 新电脑：首次运行

安装 Git、Node.js 和 npm。项目要求 Node `>=22.13.0`；原机验证版本为 Node `24.15.0`、npm `11.12.1`。保留 `package-lock.json`，使用锁定依赖，不要因换电脑直接升级整套框架。

以下命令在仓库根目录执行，适用于 PowerShell。已有仓库时，先检查未提交修改，再拉取最新代码，不要强制覆盖本地工作。

```powershell
git clone https://github.com/yangdyjp-glitch/P-Design.git
cd P-Design
git switch main
npm ci
npx tsc --noEmit
npm run build
```

**首次初始化本地空数据库**：构建完成后，依次执行现有两条迁移。它们仅操作本机 `.wrangler/state`，不要添加 `--remote`。

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_peaceful_sleeper.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_clammy_moondragon.sql
npm run dev
```

打开 `http://127.0.0.1:5173`。本地登录模拟入口为 `/signin-with-chatgpt?return_to=/`，仅对本地回环地址生效。开发账号为 `seedy@sites.test`，不代表生产账号。

已有本地数据库不要重复执行建表 SQL。后续数据库变更通过 `npm run db:generate` 新增迁移；已应用迁移保持不变。

只改样式、编辑器或检查构建时，可以暂不配置 API 密钥。云端 AI 资源状态未就绪属于预期，不能据此宣称真实 AI 已验证。

日常启动：`npm run dev`。修改 `src/` 后执行 `npm run build:editor` 重新生成 `public/editor.js`；`npm run build` 会自动执行这一步。

## 4. 新电脑：本地真实 AI

### 4.1 凭证与资源

- 从 `.env.example` 建立被 Git 忽略的 `.env.local`，在安全的本地编辑器中配置 `OPENAI_API_KEY`。不要把实际密钥贴进聊天、写入命令参数、提交到 Git 或放进前端变量。
- `vite.config.ts` 在开发时读取 `.env.local` 和 `outputs/skill-release/uploaded.json`。仅设置系统环境变量不等于这两个文件已经准备好。
- 生产密钥已保存在 Sites 服务端；GitHub 克隆不会得到它，也不需要为了换电脑重置生产密钥。
- 本地真实 AI 需要有权访问 Agents 托管环境及当前模型的 OpenAI 项目。测试会产生实际 API 用量。
- 技能文件 ID 需要与使用的 OpenAI 项目匹配。可通过安全渠道迁移同项目的 `uploaded.json`，或在需要时重新打包、上传。

只有准备好本机凭证，且确实需要重新建立或更新技能资源时，执行：

```powershell
node scripts/pack-skills.mjs
node scripts/upload-skills.mjs
```

打包来源默认是仓库内 `design-skills/`，无需依赖原电脑的个人技能目录。输出为 14 个技能 ZIP 加 1 个共享字体 `_runtime.zip`，共 15 个资源。上传记录在 `outputs/skill-release/uploaded.json`，重复上传会按包哈希跳过已记录的匹配资源。

修改网页界面不需要重传全部技能。修改技能内容后，才需要重新打包、上传，并在部署时安全更新 `SKILL_FILES_JSON`。上传记录属于运行配置，不提交到公开仓库。

### 4.2 开发转发服务是当前必需步骤

当前 `vite.config.ts` 将开发 AI 地址固定为 `http://127.0.0.1:8789`。因此，本地真实 AI 测试需要在另一个终端保持下面的服务运行，即使本机可以直接联网：

```powershell
node scripts/dev-ai-proxy.mjs
```

如电脑必须通过系统代理联网，按实际环境设置该终端的 `HTTPS_PROXY` 和 Node 的代理支持，再启动服务。不要把原电脑的代理地址写死到仓库。生产站点直接调用服务端 API，不依赖此本机转发服务。

完成凭证、技能清单及转发服务配置后，重新启动 `npm run dev`，再检查网页技能状态与真实任务。将开发转发地址改成可选配置，是可独立安排的后续改进，目前尚未修改。

## 5. 架构与改动入口

```text
浏览器编辑器
  → /api/* 服务端：身份、权限、项目、素材、AI 任务
  → D1：项目、任务、版本与设置
  → R2：图片与任务交付文件
  → OpenAI 托管环境：完整技能、执行脚本、浏览器渲染
  → 服务端工具：图像生成
  → 预览、校验、应用结果、导出
```

| 文件 / 目录 | 用途及注意点 |
| --- | --- |
| `app/page.tsx`、`app/Editor.tsx` | 网页入口；编辑器脚本在 React 挂载后加载，避免界面被 hydration 覆盖 |
| `src/app.js` | 编辑器交互、项目、文案、照片、撤销和导出 |
| `src/style-presets.js` | 三个固定风格预案及可信解析；目前均待设定，按用户确认逐一完善 |
| `src/engine.js` | 文案拆分、页面渲染、HTML/CSS 清理、排版检查；保留 `data-copy` 文案块标记 |
| `src/cloud.js` | 登录状态、云端同步、技能库、AI 表单、轮询、结果预览和应用 |
| `server/accounts.ts`、`src/accounts.js`、`public/accounts.css` | Railway 账户认证、管理、跨标签页退出及登录页面 |
| `public/app.css`、`public/ai.css` | 编辑器与 AI 界面样式 |
| `public/editor.js` | 从 `src/` 生成的文件；应修改源文件后重建 |
| `public/assets/fonts/` | 中文字体及许可，网页和托管渲染共用 |
| `server/routes.ts` | API 路由与业务入口 |
| `server/core.ts` | 身份、资源所有权、跨站写入限制、文件检查和服务端 API 访问 |
| `server/agent.ts` | 托管环境、任务推进、技能文件、命令执行、交付收集及图像工具 |
| `server/copy-integrity.ts` | 原文块 ID、数量、正文与数字校验 |
| `server/skills.ts` | 14 个技能注册及任务路由 |
| `server/webhooks.ts`、`worker/index.ts` | 回调签名、重放处理及 Worker 入口；回调尚未在生产启用 |
| `db/schema.ts`、`drizzle/` | D1 数据模型与迁移 |
| `design-skills/` | 完整技能说明、脚本、模板、参考、字体及各自许可 |
| `scripts/pack-skills.mjs`、`scripts/upload-skills.mjs` | 技能打包与 Files API 上传 |
| `.openai/hosting.json`、`vite.config.ts` | 原站点身份、DB/BUCKET 绑定与开发配置；保留 Sites 集成 |
| `QA.md`、`UPGRADE.md`、`THIRD_PARTY.md` | 已验证范围、升级说明和第三方来源 |

框架为 React / Vinext / Vite，服务端部署到 Cloudflare Workers。不要直接改成普通静态站，否则服务端身份、D1、R2 和 AI 路由会丢失。Worker 本身不运行本机 Python、Node 子进程或浏览器；这些任务在 OpenAI 托管环境中执行。

### 已接入的 14 个技能

| 分组 | 技能目录 ID |
| --- | --- |
| 设计主流程 | `xiaohongshu-design`、`victor-design` |
| 参考与封面判断 | `xhs-reference-contract`、`xhs-cover-lab` |
| 构图与精修 | `xhs-poster-composition`、`xhs-design-polish` |
| 生成式封面、插画、信息图 | `baoyu-cover-image`、`baoyu-xhs-images`、`baoyu-infographic`、`xhs-images-design` |
| 模板与文字卡片 | `auto-redbook`、`xhs-note-creator`、`blcaptain-style-skill` |
| 文案策划 | `xhs-writer` |

网站能力来自服务端技能资源及执行代码，不依赖访客电脑上的 Codex 技能安装状态。维护者需要安装 Sites 插件才能按现有托管流程发布；发布时先读新电脑上实际安装版本的 `sites:sites` 技能，插件路径不要沿用原机绝对路径。

## 6. 生产配置与数据

`.openai/hosting.json` 的现有配置：

```json
{
  "project_id": "appgprj_6aecb5faa0b881919c03675fe284bf42",
  "d1": "DB",
  "r2": "BUCKET"
}
```

生产服务端已配置以下变量。本文只记录用途，不包含秘密值或文件 ID：

| 名称 | 用途 / 交接状态 |
| --- | --- |
| `OPENAI_API_KEY` | 生产 AI 凭证，已配置 |
| `SKILL_FILES_JSON` | 14 个技能与 `_runtime` 的上传文件记录，已配置 |
| `ADMIN_EMAIL` | 所有者首次管理员身份引导，已配置；随后绑定稳定用户 ID |
| `AGENT_MODEL` | 交接时生产值为 `gpt-6-astra` |
| `IMAGE_MODEL` | 交接时生产值为 `gpt-image-2.5-flare` |
| `OPENAI_WEBHOOK_SECRET` | 尚未配置；不能据此宣称后台回调已经上线 |

更新界面和源码时保留现有服务端变量，不用空的 `.env.example` 覆盖。模型名称是交接配置记录；更换模型前单独检查兼容性与项目访问权限。

云端身份来自 Sites 注入的稳定用户 ID。生产用户隔离不能改成只按邮箱判断，也不能把本地模拟身份或测试请求头作为生产登录方案。

云端 D1/R2 仍在原站点，换电脑后登录同一获准账号可访问对应云端数据。浏览器里尚未同步的项目与本地修改不会由 Git 转移；换设备前在网页导出 `.tuxu.json` 备份，照片与私有作品另行妥善保存。

## 7. 验证方法与已知前置条件

一般源码改动的基本检查：

```powershell
npx tsc --noEmit
npm run build
git diff --check
```

界面改动再检查桌面与约 390px 手机宽度：登录、新建、文案编辑、云端同步、图片裁切、AI 结果入口及 PNG 导出。涉及 AI 时检查真实结果能否查看、下载、保留原文并正确应用；不能只凭按钮存在就判定完成。

| 验证脚本 | 使用前必须知道 |
| --- | --- |
| `scripts/qa-cloud.mjs` | 需要已安装 Chrome、5173 开发服务、5174 构建预览、共享本地数据库及 14 个技能资源就绪；会写入本地项目、素材和任务 |
| `scripts/qa-ai-live.mjs`、`scripts/probe-agent.mjs`、`scripts/probe-design.mjs` | 真实、可能计费的 API 检查；依赖本机凭证、资源和网络，不作为普通文档修改的默认检查 |
| `scripts/qa-apply-result.mjs` | 依赖先前真实任务生成的 `qa/v2/live-web/result.json`，全新克隆没有该文件 |
| `scripts/qa-e2e.mjs`、`scripts/qa-visual.mjs` | 早期静态版本的验证脚本，部分端口和产物前提与当前版本不同，不是新电脑开箱入口 |

`qa-cloud.mjs` 所需第二服务可在构建后用 `npm start -- --port 5174` 启动。5174 不带开发登录模拟，其测试身份头仅用于本地验证。现有完整云端验证实际通过 13 项，真实技能渲染、文案生成和应用、图像生成也已验证；详细记录见 [QA.md](QA.md)。

Windows 上重新构建前，先停止占用 `dist/` 的预览进程，避免文件锁导致 `EPERM`。新电脑首次运行脚本不应默认具有旧机的 `qa/`、`outputs/` 或运行缓存。

## 8. 更新 GitHub 与更新线上网站

### GitHub 源码

先查看当前分支和未提交修改。工作区干净时用 `git pull --ff-only` 更新，再修改、做对应检查、选择需要提交的文件，提交并推送到 `main`。发生分叉或存在他人的修改时先处理，不使用强制推送。

这是公开仓库。不要提交 `.env.local`、上传文件清单、数据库、用户照片、作品、测试产物、部署凭证或原 Sites 私有 Git 历史。保留第三方许可。

### 原 Sites 网站

接续现有站点，使用第 1 节的 `project_id`，不要创建一个替代网站，也不要改写原站点的 D1/R2 绑定。

1. 使用同一所有者账号的 Sites 插件，调用 `get_site` 读取现状及访问范围，再取得同项目的 `create_source_repository_write_credential`。
2. 按当前 Sites 技能指引，使用 `scripts/site-workflow.mjs --project-id <原项目 ID>` 打开 Sites 管理的源码。凭证只经隐藏 stdin 传递，不放命令参数、文件或日志；保存 helper 返回的完整 opening result。
3. 建议将 GitHub 开发目录和 Sites 管理目录分开。把本轮修改的应用文件同步到 Sites 目录，保留其 Git 状态、站点身份及私有数据，不直接更换 GitHub 的 `origin`。
4. 按 Sites 技能通过 source helper 执行剩余检查及 `build-site.mjs` 构建、提交、推送与打包。使用本机安装的插件绝对路径，打包输出放在源码目录外；只执行尚未通过或输入已改变的检查。
5. 将 helper 核验的 `project_id`、`commit_sha`、`archive` 原样交给发布工具。保持当前所有者私有范围时使用 `save_version_and_deploy_private`；发布前访问范围若有变化，先按实际范围选择正确工具。
6. 核验部署终态为成功，记录实际新源码提交、版本 ID 和部署结果。GitHub 提交与 Sites 提交可能不同，分别记录。

不得为了回调可达或方便测试而擅自公开整个网站。用户未来希望他人使用，但公开或邀请范围仍待明确；访问设置变更应另行按用户选择执行。

### 两份源码的有意差异

GitHub 是经过清理的公开导出，未包含原部署的私有历史和照片。`server/legacy-photos.json` 在公开仓库为空对象；这是预期，不是资源丢失。原网站仍保留所有者受保护的历史素材。

从公开仓库同步回原 Sites 时，不要用空的历史照片清单无意覆盖原站私有清单。从 Sites 同步到公开仓库时，也不要反向带出原照片、`private-seed/` 或历史提交。

其他差异：公开仓库内置 `design-skills/`；打包脚本默认读该目录；类型检查排除了技能资源内独立工程。详见 [docs/deployment.md](docs/deployment.md)。`docs/source-manifest.json` 记录公开资源的大小和哈希，修改已登记文件或新增交付文件时同步维护，清单不包含自身。

## 9. 当前限制与后续方向

当前每人每天 10 个任务、全站每天 60 个；每人最多 1 个并行任务，全站最多 6 个；每次图像素材生成最多 1 张。项目最多 20 页、每用户最多 60 个项目。图片支持 PNG/JPEG/WebP，单张最多 12 MB。这些限制不是固定金额的费用上限。

后续若开放他人使用，建议按具体需求安排：

1. 明确公开或邀请范围，验证真实第二用户登录及其项目隔离。
2. 为关闭页面后的任务推进建立公开可达、签名校验的回调或其他服务端调度，并实际验证全链路。
3. 补充使用量、失败任务和成本观察，再决定管理、收费或团队功能。
4. 将本地 AI 转发地址改为可配置项，减少跨电脑开发步骤。

这些是待办方向，不代表已经实施，也不要求接手时全部重做。

## 10. 可复制给新电脑 Codex 的接续说明

```text
这是 P-Design / 图序项目。先阅读根目录 HANDOFF.md、README.md、docs/setup.md、docs/deployment.md 和 QA.md，再检查当前 Git 分支及工作区。按我接下来提出的需求继续开发。

保留通用小红书设计定位、14 个技能按任务路由、原文保真、真实照片、用户数据隔离、结果先预览再应用和版本冲突保护。EJU 等历史产品不作为全局默认规则。

现有 Sites 项目 ID 是 appgprj_6aecb5faa0b881919c03675fe284bf42。保留原站点身份、D1/R2、服务端秘密及访问范围；发布时阅读本机的 Sites 技能，通过其源码工作流更新原站点。GitHub 推送和 Sites 发布分别核验。

不要输出或提交密钥、用户作品、私有照片和 Sites 私有历史。新电脑缺少本地凭证时，先完成不依赖真实 AI 的修改与检查，再按 HANDOFF 配置所需环境。不要把旧机测试产物存在当作前提，不要把尚未启用的后台回调或公开分享描述为已完成。
```
