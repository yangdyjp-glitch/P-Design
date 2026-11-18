# P-Design / 图序：新电脑 Codex 交接

更新日期：2026-11-18。适用对象：在另一台电脑上接续开发、同步 GitHub 并更新现有线上网站的 Codex。

**用户指定顺序：先把 GitHub 仓库完整克隆到新电脑，核对文件齐全，再修改本地代码、验证、推送，并核验线上更新。** 不先重建一个项目，不仅下载交接文件或几个源码，不从线上网页反推源码。

本文件是当前操作入口。旧交接内容保存在 [历史快照](docs/handoff-history-20261110.md)，主要供追溯；其中早期 Sites 地址、14 技能、旧登录和启动说明不能作为当前部署步骤。若后续代码发生变化，以新电脑取得的最新源码及实时健康接口为准。

## 1. 当前项目和同步目标

| 项目 | 当前基线 |
| --- | --- |
| 项目 | 图序 · AI 小红书设计工作台 |
| GitHub | https://github.com/yangdyjp-glitch/P-Design.git |
| 开发与发布分支 | `main` |
| 当前线上网站 | https://p-design.up.railway.app/ |
| 健康接口 | https://p-design.up.railway.app/api/health |
| 应用版本 | `0.7.1`，取自 `package.json` |
| 2026-11-18 文档更新前核对的线上提交 | `991fdb65d43d51df04d46a821d30bd017514fff2` |
| 当时实际状态 | `accounts` 登录、AI 开启、21/21 技能就绪、PostgreSQL 连通、数据库与文件卷均持久化 |
| Railway 项目 | `ad138118-c799-439e-93be-deca8106e9b2` |
| Railway 服务 | `7c2a4681-4f85-4e0f-b388-496ef831038b` |
| Railway 环境 | `1633ecfa-10c8-45a3-ac40-523cc8938c58` |

上面的提交是核查时的基线，不是要求新电脑回退到该提交。交接文档及后续代码推送也会产生新提交，接续时始终获取 `origin/main` 的最新状态，再比较线上实际 `release`。

同步关系：**GitHub main → 新电脑本地修改与验证 → GitHub main → 现有 Railway 服务部署。** 项目数据与照片继续保存在现有 PostgreSQL 和文件卷中，代码同步与业务数据迁移是两件事。

原 `tuxu-design-studio-20261106.phd-yang.chatgpt.site` 是历史 Sites 站点。此次接续默认更新上述 Railway 网站，不另建网站、不切换原 Sites 的访问范围，也不替换生产数据库或卷。

## 2. 第一步：完整下载 GitHub 仓库

先识别新电脑操作系统、可用目录、Git 和 Node。下面目录与环境变量命令使用 Windows PowerShell；其他系统使用等价语法，不沿用旧电脑的盘符、用户名、代理或 Codex 插件绝对路径。

在用户选定的父目录执行，目标 `P-Design` 文件夹应尚不存在：

```powershell
git clone --recurse-submodules https://github.com/yangdyjp-glitch/P-Design.git P-Design
cd P-Design
git switch main
git fetch origin --prune --tags
git pull --ff-only origin main
git submodule update --init --recursive
```

这里要使用完整 Git 克隆：不加 `--depth`、`--filter`、`--sparse`，不以下载 ZIP、复制几个文件或旧机缓存代替。默认取得完整历史和远端分支引用，并检出 main 的全部受版本控制文件。核查时仓库没有子模块或 Git LFS 配置；如果最新版本新增了它们，继续取得对应真实内容，不能只保留指针。

若新电脑已有同名目录，先确认其仓库来源及未提交修改，再决定复用或另选空目录；不要为方便克隆而删除或覆盖已有工作。

下载完成后核对：

```powershell
git remote -v
git status --short --branch
git rev-parse --is-shallow-repository
git rev-parse HEAD
git rev-parse origin/main
git ls-files --deleted
git fsck --full
```

要求：origin 指向本仓库；分支为 main；没有浅克隆、稀疏检出或缺失受控文件；刚克隆时 HEAD 与 origin/main 一致，工作区干净，Git 完整性检查无损坏。核对 `src/`、`server/`、`app/`、`worker/`、`db/`、`drizzle/`、`postgres/`、`scripts/`、`vendor/`、`public/`、`design-skills/` 和根目录配置已完整取得，尤其是中文字体、技能参考与第三方许可。

随后才阅读当前 `HANDOFF.md`、适用的 `AGENTS.md`、`README.md`、`package.json` 和所涉功能文档，再开始本地修改。

“完整仓库”包括 Git 跟踪的全部项目内容，不包括被忽略的密钥、`node_modules/`、构建结果、数据库、私有照片、用户作品和旧机测试缓存。这些缺失不代表克隆不完整，恢复方式见第 8 节。

## 3. 建立独立本地环境

项目要求 Node `>=22.13.0`，旧机验证过 Node `24.15.0` / npm `11.12.1`。优先采用兼容的 Node 24 环境，保留 `package-lock.json`。不要因为换电脑就更新框架、模型或全部依赖。

在仓库根目录安装并建立基线：

```powershell
npm ci
npx tsc --noEmit
node --test tests/*.test.mjs
npm run build
```

当前没有 `npm test` 脚本，完整自动检查使用上面的 `node --test`。`npm run build` 会先执行 `build:editor`，从 `src/` 重新生成 `public/editor.js`。不要直接编辑生成文件代替源文件。先查看构建是否改变受控产物，再决定随本轮提交的内容。

### 推荐：先运行与线上一致的账户模式，不调用真实 AI

以下变量仅设置在本终端；不连接生产数据库，不需要 API 密钥：

```powershell
$env:TUXU_RUNTIME = 'railway'
$env:PORT = '5177'
$env:APP_ORIGIN = 'http://127.0.0.1:5177'
$env:TUXU_BIND_IP = '127.0.0.1'
$env:TUXU_DATA_DIR = Join-Path (Get-Location).Path '.wrangler/handoff-local'
$env:DATABASE_URL = ''
$env:DATABASE_CA_CERT = ''
$env:RAILWAY_VOLUME_MOUNT_PATH = ''
$env:TUXU_LOCAL_VISITOR_QA = 'false'
$env:OPENAI_API_KEY = ''
$env:SKILL_FILES_JSON = '{}'
$env:AI_ENABLED = 'false'
npm run start:railway
```

打开 `http://127.0.0.1:5177/`。启动流程会自动应用全部本地 `drizzle/` 迁移，采用本地 D1 和文件存储，提供账户登录页。新空库管理员用户名为 `admin`，本地初始化约定可查 `server/account-bootstrap.ts` 和 `tests/accounts.test.mjs`；线上使用已有账户与当前密码，不从本地初始化推断线上密码，也不重置线上账户。

本阶段健康接口应为 `status=ok`、`accessMode=accounts`、`databaseProvider=d1`；AI 关闭、技能未载入、文件存储非生产持久卷均属预期。它用于本地界面和账户功能，不是生产配置缺失。

Windows 重建前先停止本轮占用 `dist/` 的预览服务，避免文件锁；不要结束其他任务或用户的全部 Node 进程。

### 可选：开发热更新路径

`npm run dev` 沿用原 Sites/Vite 开发模拟，通常在 `127.0.0.1:5173`，与 Railway 账户模式不同。本次换机优先使用上面的账户模式；只有专门需要热更新时再准备该开发路径的独立 `.wrangler/state` 数据库。首次空库应依次应用 `drizzle/` 的全部迁移（核查时为 0000 至 0003），不照旧说明只建前两份，也不对已有库重复执行建表 SQL。原构建配置没有指定迁移目录，不能假定在该配置下直接执行 `d1 migrations apply` 就会发现根目录的 `drizzle/`。

此路径的本地模拟登录为 `/signin-with-chatgpt?return_to=/`。其开发身份不能用于生产认证验收；测试真实账户交互时用前面的本地 Railway 模式。

## 4. 新电脑：本地真实 AI

只有调整 AI 执行、技能路由或需要真实生成验收时才配置本地 AI。普通文档、界面和离线逻辑修改先完成不依赖密钥的部分；真实模型任务会产生实际用量。

1. 在本机安全编辑器中由 `.env.example` 建立被忽略的 `.env.local`，配置已授权的 `OPENAI_API_KEY`。该本地文件不填写生产 `DATABASE_URL` 或生产卷路径。生产密钥继续保存在 Railway Variables，不能因换机把空模板覆盖到线上。
2. 复用同一 OpenAI 项目且仍有效的 `outputs/skill-release/uploaded.json`，可通过安全渠道迁移；没有该记录才重新打包、上传。文件 ID 与 API 项目必须匹配。
3. 网站运行所需的 21 个技能资源已在仓库 `design-skills/` 中，不依赖旧电脑个人的 Codex 技能目录。打包得到 21 份技能与 1 份共享字体，共 22 份资源。

在新的终端执行，避免第 3 节设置的空密钥覆盖 `.env.local`。若当前进程存在旧的 `OPENAI_API_KEY`，仅从本终端移除该变量，不显示其值：

```powershell
Remove-Item -LiteralPath Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
node --env-file=.env.local scripts/pack-skills.mjs
node --env-file=.env.local scripts/upload-skills.mjs
```

如果已有匹配的完整上传清单，无须执行上述打包上传。不要将 `.env.local`、ZIP 或 `uploaded.json` 提交到公开仓库。

继续使用本地账户模式时，在该新终端设置本地参数、启用 AI 并载入上传清单：

```powershell
$env:PORT = '5177'
$env:APP_ORIGIN = 'http://127.0.0.1:5177'
$env:TUXU_BIND_IP = '127.0.0.1'
$env:TUXU_DATA_DIR = Join-Path (Get-Location).Path '.wrangler/handoff-local'
$env:DATABASE_URL = ''
$env:RAILWAY_VOLUME_MOUNT_PATH = ''
$env:TUXU_LOCAL_VISITOR_QA = 'false'
$env:AI_ENABLED = 'true'
$env:SKILL_FILES_JSON = [System.IO.File]::ReadAllText((Join-Path (Get-Location).Path 'outputs/skill-release/uploaded.json'))
node --env-file=.env.local --input-type=module -e "delete process.env.DATABASE_URL; delete process.env.DATABASE_CA_CERT; await import('./scripts/start-railway.mjs');"
```

构建后的账户模式默认直连 OpenAI。只有本机网络确实需要转发时，另开终端运行 `node --env-file=.env.local scripts/dev-ai-proxy.mjs`，并在本地启动进程设 `DEV_OPENAI_BASE_URL=http://127.0.0.1:8789`。它仅用于回环地址，不写入生产配置。代理地址按新电脑实际环境设置，不复制旧机固定代理端口。

`npm run dev` 的 Vite 路径目前把 AI 开发地址固定为 `127.0.0.1:8789`，使用该路径时必须启动上述转发服务，并使用默认位置的上传清单。两种本地启动路径不要混为一谈。

验证真实任务时创建独立本地项目，核对真实结果、独立复核、自动应用及保存，随后清理本轮临时资源；不以线上用户作品做试验，不因本地缺少旧机 `qa/` 产物而假定功能损坏。

## 5. 必须延续的产品规则

- 面向通用小红书用图，EJU、留学课程等是历史内容案例，不能写入通用默认产品规则。
- 新建顺序为：只输入原稿 → AI 文案优化与独立审校 → 用户可编辑并确认 → 上传图片/选择预案 → AI 设计与自动检查。确认稿与人工编辑状态均需保留。
- 设计阶段锁定已确认原文、数字、标点和文案块 ID；已明确分页保留原页数、顺序及每页归属，让图片适配页面，不能为放图增页或跨页搬文案。
- 右侧文案和每张图的补充要求保留。单图请求只修改目标页，其他页不变；逐项说明实际改动，不把几乎未变的结果冒称完成。
- 预案一使用用户上传图，整套使用全部必用上传图；预案二搜索真实场景照片并保留来源；预案三完全无图，按内容重新组织文字构图。三者排版原则不同，主题色均为 `#021539`。
- 上传图应用时至少保留 80% 原图面积，明确要求完整显示则保留 100%；只有服务端标记的搜索照片不受该上传裁剪限制。不能伪造真实教师、课堂、资历或成果。
- 新视觉任务默认使用 `xiaohongshu-design`、`victor-design`、`xhs-poster-composition`、`xhs-design-polish` 和 `taste-skill`；逐页记录真实来源、具体手法和内容原因，主动匹配十个可选专长。新任务最多载入九个，旧任务与修正继承原快照。
- Taste 等网站方法须适配静态小红书图片。方法参考不等于执行整个上游流程，不因原技能样例增加文案、照片配额、动效或其他产品规则。
- 实际渲染、独立审美复核和网页应用检查均保留。独立请求看实际成图，不接受设计者自评代替；共享既有一次自动修正预算，不能无限返工。
- 保留账户隔离、管理员建账号、云端版本冲突保护、项目删除、备份和高清/可编辑导出。尽量由 AI 判断画面，不重新增加大量用户视觉参数。

目前网站共 21 个模块：视觉可用 15 个、写作可用 7 个，共用 `xhs-writer`。其中六个新增写作模块为 `copywriting`、`copy-editing`、`humanizer-zh`、`content-research-writer`、`content-strategy`、`social`。新电脑 Codex 中能看到的其他个人技能不会自动成为网站能力；新增网站技能还需注册、打包、路由、实际应用与复核。

技能和字体许可见 [THIRD_PARTY.md](THIRD_PARTY.md)；研究写作采用独立适配规范，Taste 网站分发适用资料，不能把仓库适配包称为全部上游工具的完整执行。维护者若要在 Codex 对话中直接使用本机完整版技能，可另行安装；网站用户无需安装。

## 6. 源码与文档入口

| 范围 | 入口 |
| --- | --- |
| 页面、编辑器和账户界面 | `app/`、`src/app.js`、`src/accounts.js`、`public/*.css` |
| 文案准备与确认 | `src/copy-workflow.js`、`src/copy-wizard.js`、`server/copy-workflow.ts`、`server/copy-agent.ts` |
| 云端保存、任务、单图应用 | `src/cloud.js`、`src/ai-workflow.js`、`src/page-revision.js`、`src/job-progress.js` |
| 预案、分页、图片规则 | `src/style-presets.js`、`src/preset-images.js`、`src/pagination-policy.js`、`src/image-policy.js` |
| 视觉策略和主动专长选择 | `src/visual-design.js`、`src/specialist-routing.js`、`server/skills.ts` |
| AI 执行、实际渲染及独立看图 | `server/agent.ts`、`server/visual-review.ts`、`server/image-check-runner.mjs` |
| 原文和结果校验 | `server/copy-integrity.ts`、`server/design-result.ts`、`src/style-safety.js` |
| 接口、认证与隔离 | `server/routes.ts`、`server/core.ts`、`server/accounts.ts`、`worker/` |
| 数据库与迁移 | `db/`、`drizzle/`、`postgres/`、`scripts/migrate-postgres.mjs` |
| Railway 启动与本地配置 | `scripts/start-railway.mjs`、`scripts/start.mjs`、`vite.config.ts` |
| 技能与中文字体 | `design-skills/`、`public/assets/fonts/`、打包/上传脚本 |
| 真实验证范围 | `QA.md`、`tests/` |
| 当前功能说明 | `docs/copy-workflow.md`、`docs/taste-skill.md`、`docs/visual-design.md`、`docs/specialist-routing.md` |
| 生产连接与存储 | `docs/railway.md`、`docs/supabase.md`、`docs/accounts.md` |

结构为 React / Vinext / Vite 与 Worker 接口。当前 Railway 由 Node 启动 Wrangler Worker 运行环境，结构化数据在 PostgreSQL 的 `tuxu` schema，照片/交付文件在现有卷；AI 执行、脚本和浏览器渲染位于托管环境。不要把它改成只上传静态页面的项目。

`public/editor.js` 是生成文件。`docs/source-manifest.json` 是公开源码资源清单，涉及已登记文件时按实际字节数与 SHA-256 更新；其中历史 `deployedCommit` 不是 Railway 当前版本，线上以 `/api/health.release` 为准。旧机仓库外的辅助脚本不是新电脑的依赖。

## 7. 每次修改：本地与线上同步闭环

### 修改前先同步

```powershell
git status --short --branch
git fetch origin --prune --tags
git pull --ff-only origin main
```

只有确认工作区及当前分支适合时才直接快进更新。有本机修改或远端分叉时先保留并整合，不使用强制覆盖、清空目录或强推来消除差异。多台电脑交替工作时，上一台先提交并推送，下一台先拉取；不并行改同一份未同步源码。

### 本地完成并验证

按用户当前需求修改源文件与适用技能，执行相关测试、`npx tsc --noEmit`、`npm run build` 和 `git diff --check`。界面改动检查实际页面；AI 行为改动按需要在隔离本地环境进行真实任务验收。文档修改不默认启动付费模型测试。

2026-11-10 的应用基线曾通过 175 项自动检查及真实单图验收，详情在 `QA.md`；这些历史结果不等于新电脑已经完成本轮验证。

### 推送 GitHub，再确认 Railway 发布

检查将提交的文件、维护必要文档及资源清单，选择本轮文件提交：

```powershell
git diff --stat
git add -- <本轮确认要提交的文件>
git diff --cached --check
git commit -m "说明本轮改动"
git push origin main
```

`<本轮确认要提交的文件>` 必须替换为真实文件列表，不能照抄占位符执行。不要无检查地把密钥、数据库、私有作品或测试缓存加入提交。推送需要本机已有仓库写入权限；通过正常 GitHub 登录授权，不把令牌拼进远端 URL。

现有 main 推送会触发 Railway 自动部署。核对第 1 节的原服务与环境，不另建站点。构建命令为 `npm run build`，启动命令为 `npm run start:railway`；端口与域名目标保持匹配，沿用既有生产 Variables、数据库和卷。改源码不需要重新填写生产密钥。

必须等部署成功并实际访问网站。GitHub 推送成功、Railway 构建成功和线上可访问是不同检查点；短暂启动或网络问题先查部署及运行日志，不盲目改数据库、账户和存储配置。

```powershell
$localCommit = (git rev-parse HEAD).Trim()
$remoteCommit = (git rev-parse origin/main).Trim()
$health = Invoke-RestMethod 'https://p-design.up.railway.app/api/health'
$health | Select-Object status,accessMode,ai,skillsReady,skillsTotal,databaseProvider,databaseConnected,databasePersistent,storagePersistent,release
if ($localCommit -ne $remoteCommit) { throw '本地提交与 origin/main 尚未一致。' }
if ($health.release -ne $localCommit) { throw '线上尚未运行本次提交，请继续核对部署。' }
```

验收当前功能时，期望账户模式、AI 可用、21/21 技能、PostgreSQL 连通且数据库和文件卷持久化；若本轮有意调整模块数量，按实际新注册表核对。正常登录后检查相关界面和保存，确认原有项目及照片仍可读取。不得仅凭 `ai=true` 声称真实模型任务已测试。

最终向用户报告：本轮改动、实际检查、推送提交、部署结果、线上 `release` 是否匹配，以及仍未完成的内容。只更新了本地或 GitHub 时明确说明，不能称为线上已更新。

若需要回滚，使用原服务的既有部署记录或可审阅的 Git 回退提交；代码回滚不应重置生产业务数据。后续修改继续遵循先拉取、后验证、再推送和核验的顺序。

## 8. 不随仓库迁移的内容与已知限制

| 内容 | 新电脑处理方式 |
| --- | --- |
| `node_modules/`、`dist/`、本地运行缓存 | 由依赖安装、构建和首次启动生成 |
| API 密钥、数据库 URL、会话秘密 | 生产保留原 Variables；本地需要时由用户安全配置，不能写入公开交接文件 |
| `outputs/skill-release/uploaded.json` | 同一 API 项目安全迁移，或按第 4 节重新生成 |
| 云端账户、项目与任务 | 留在现有数据库，通过现有网站和账户访问 |
| 照片、私有作品、结果文件 | 留在现有卷；需要本地项目时由用户导出备份后导入隔离本地环境 |
| `.tuxu.json` 项目备份 | 单独安全传输，不加入公开 Git 仓库 |
| 旧机 `qa/`、`outputs/`、仓库外 helper | 不作为开箱前提；公开验证结论见 `QA.md`，所需测试在新机重新执行 |
| 旧机个人 Codex skills、插件与登录 | 按新机实际需要安装/登录，不复制整个用户配置目录代替仓库部署 |

账号与云端数据不因换电脑而重建。`server/legacy-photos.json` 在公开仓库为空属于预期，不用私有照片补进 Git。保留现有生产连接，不把生产数据库当作本地测试库，也不以代码同步为由清空或迁移用户资料。

目前仍依赖网页轮询推进任务，签名回调代码存在但不能仅据此宣称已启用可靠后台收尾。每账户每日 10 次、全站每日 60 次等限制仍以源码为准；文案与设计分别计任务。所有风格和技能组合未穷举验证，模型审美也可能误判。不要因为接手机器就重做这些功能或宣称新增了它们。

## 9. 可直接交给新电脑 Codex 的接续指令

```text
继续维护 P-Design / 图序项目，GitHub 仓库：
https://github.com/yangdyjp-glitch/P-Design.git

先在这台电脑完整克隆仓库，包含全部受版本控制的源码、技能、字体、脚本、迁移与许可；不要浅克隆、部分下载、只读交接文件就重建项目。若本地已有目录，先检查并保留其中未提交修改。完整下载和文件核对完成后，阅读最新 HANDOFF.md、适用的 AGENTS.md 及相关功能文档，报告本地目录、分支、HEAD 和线上 /api/health.release 的基线。

按我接下来的需求继续调整。先建立独立本地环境，保留文案优化与确认、三种不同构图预案、主题蓝、原文及原分页、上传图裁剪保护、单页边界、账户隔离、主动技能应用和独立审美复核。网站默认更新现有 Railway 服务 https://p-design.up.railway.app/。

每次修改前从 GitHub main 同步，修改后完成相应本地检查，提交并推送，再等 Railway 部署和核验线上实际提交一致。保留生产密钥、数据库、文件卷与用户项目；本地真实 AI 仅在需要时安全配置。不要输出或提交密钥、私有照片、用户作品、数据库及旧机私有缓存，也不要把只推送源码说成线上部署已完成。
```
