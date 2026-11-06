# Railway 访客 AI 接入

2026-11-06 新增。此方案沿用现有 Worker / D1 / R2 接口，在 Railway 容器内运行，先供无需账号登录的 AI 试用。原 Sites 项目和访问范围保持不变。

## 当前部署与接续

- Railway 地址：https://p-design.up.railway.app/
- 项目 ID：`ad138118-c799-439e-93be-deca8106e9b2`
- 服务 ID：`7c2a4681-4f85-4e0f-b388-496ef831038b`
- 环境 ID：`1633ecfa-10c8-45a3-ac40-523cc8938c58`
- 原启动命令已确认能监听 `0.0.0.0:8787`，公网首页已返回 200。
- 新版访客 AI 的线上就绪情况，以部署后的 `/api/health` 和真实任务结果为准；本机验证通过不等于线上变量已完成配置。

仓库推送可能触发 Railway 自动构建。推荐将 Custom Start Command 设为下面这一行，明确启用初始化流程：

```text
npm run start:railway
```

新版也兼容此前包含 `--import ./scripts/sites-env.mjs` 的完整排查命令：在 Railway 中会自动转入同一初始化流程，并保留命令显式指定的端口。这样旧设置也能接续。本机手动运行该长命令时仍保持原本地预览行为。构建命令仍为 `npm run build`。

## 必需配置

在 Railway 服务的 Variables 中安全设置：

| 变量 | 内容 |
| --- | --- |
| `OPENAI_API_KEY` | 已获授权、具备当前模型与 Agents API 访问权限的真实密钥；仅填值，不加变量名或引号 |
| `PORT` | 当前域名目标端口为 `8787`，可显式设置 `8787` 并保持两侧一致 |
| `APP_ORIGIN` | `https://p-design.up.railway.app`；若平台已提供 `RAILWAY_PUBLIC_DOMAIN`，可由启动流程自动生成 |

密钥保留在 Railway 服务端，不放浏览器输入框，不提交 `.env` 或源码。原 Sites 的生产变量不自动复制到 Railway。

可选变量：

| 变量 | 行为 |
| --- | --- |
| `SKILL_FILES_JSON` | 同一 OpenAI 项目中已有的 15 个文件记录。省略时启动流程从仓库打包并上传，输出保存在数据目录下的 `skill-release/` |
| `AGENT_MODEL` | 默认 `gpt-6-astra`，沿用现有模型 |
| `IMAGE_MODEL` | 默认 `gpt-image-2.5-flare`，沿用现有图像模型 |
| `VISITOR_SESSION_SECRET` | 可提供至少 32 字符的随机秘密；省略时在数据目录生成并保存，不会输出到日志 |
| `AI_ENABLED` | 设为 `false` 可关闭新 AI 任务 |
| `TUXU_DATA_DIR` | 自定义数据目录；默认优先使用平台卷挂载路径，否则使用容器内 `.wrangler/railway/` |

`SKILL_FILES_JSON` 只能复用同一 OpenAI 项目的文件。它不是 API 密钥，但属于运行配置，不上传公开仓库。

`OPENAI_WEBHOOK_SECRET` 尚未配置。本轮不登记或宣称已启用独立后台回调；处理任务时保持网页打开，重新进入可继续推进。仅填写回调秘密不等于完成 OpenAI 项目级回调登记。

## 数据目录

需要在重新部署后保留访客项目、图片和结果时，为当前服务挂载 Railway Volume。启动流程读取平台的 `RAILWAY_VOLUME_MOUNT_PATH`，将以下内容保存在卷内：

- `state/`：容器内 D1 / R2 数据。
- `skill-release/`：自动打包、上传的技能及文件记录。
- `visitor-session-secret`：访客 Cookie 的签名秘密。

仅设置一个目录变量不等于挂载持久化卷。没有卷也能进行 AI 测试，但重新部署可能丢失数据；网页访客空间会提示导出备份。此方案没有把原 Sites 的云端数据复制到 Railway。

此阶段仍通过 Wrangler 的本地 Worker 运行环境承载接口。它不是已经完成的 Cloudflare 生产存储迁移或多实例部署；面向长期正式运营时，应另行选择生产运行时和外部持久化方案。保持当前单实例部署。

## 启动流程

`scripts/start-railway.mjs` 会依次执行：

1. 检查端口与公网 origin，选择数据目录，加载或生成访客签名秘密。
2. 若已有 `SKILL_FILES_JSON`，直接复用；否则使用服务端密钥打包、上传 14 个完整技能和共享字体，按包哈希复用缓存。
3. 从构建结果生成忽略目录内的运行配置。配置只声明秘密名称，由 Wrangler 从子进程环境读取秘密值，并作为隐藏绑定使用。
4. 按记录应用尚未执行的数据库迁移，不重复执行已完成迁移。
5. 在 `0.0.0.0:$PORT` 启动网页与 API。

首次上传技能可能需要等待，并受 OpenAI Files API 速率限制。上传会有限重试并保留成功记录；初始化失败会停止启动，不假装所有技能已连接。

在 Railway 环境下，`npm start` 也会自动选择此流程。显式使用 `npm run start:railway` 最便于维护；之前包含 sites-env 预加载的长命令也已做兼容。本地不带 Railway 环境变量的 `npm start -- --port 5174` 仍是原 Sites 预览模式。

## 无账号的工作空间

- 不创建账号或登录页面。首次进入时获得随机访客空间，使用服务端签名、HttpOnly、SameSite Cookie 识别，HTTPS 下使用 Secure Cookie。
- 访客的项目、素材、任务和交付文件仍按不同 ID 检查所有权，不共用一个全站访客账号。
- 公网请求自带的 `oai-authenticated-user-*` 头会被清除，不能通过伪造平台身份进入其他空间。
- 访客不具有管理员权限，也无法读取原所有者的历史照片接口。
- Cookie 有效期为 30 天；换浏览器、清除 Cookie 或过期后，不保证自动找回原访客空间。应导出项目文件及交付文件备份。
- 原有每日每空间 10 次、全站 60 次、每空间 1 个及全站 6 个并行任务限制继续生效。这是任务次数限制，不是按金额的预算上限。

已有匿名编辑缓存会在首次进入访客模式时从同一浏览器的 `tuxu-studio-guest` 缓存接续，不从其他账号的空间导入。

## 核验

完成构建、变量配置与部署后：

1. 打开 `/api/health`，应返回 `status: "ok"`、`accessMode: "visitor"`、`ai: true`、`skillsReady: 14`、`skillsTotal: 14`。
2. 挂载卷后应为 `storagePersistent: true`。未挂载时显示 `false`，不能宣称重新部署后数据已受保护。
3. 网页右上角显示「访客空间」，AI 设计按钮直接打开任务表单。
4. 新建项目并启动一页实际任务，等待完成，查看和下载真实交付文件，最后检查预览及应用。

接口显示 `ai: true` 只证明配置存在；真实任务成功才证明模型权限、网络、技能文件和执行环境均能工作。

本机检查：

```powershell
npx tsc --noEmit
npm run test:visitor
npm run test:design-result
npm run test:automatic
npm run build
```

启动本地 Railway 预览时设置 `TUXU_RUNTIME=railway`、`PORT=5177`、`APP_ORIGIN=http://127.0.0.1:5177`。本机凭证仅通过忽略的本地配置或进程环境传入，不放命令参数。服务就绪后运行：

```powershell
npm run qa:visitor
```

默认检查地址为 `http://127.0.0.1:5177`，可通过 `QA_BASE_URL` 指定其他测试地址。此检查会写入测试项目、图片及排队任务，结束时清理测试项目；不会推进任务或调用付费 AI。应在独立测试环境运行。

Windows 上构建后的 Worker 若无法经本机系统代理访问 OpenAI，可单独运行 `scripts/dev-ai-proxy.mjs`，并在本地 Railway 启动进程设置 `DEV_OPENAI_BASE_URL=http://127.0.0.1:8789`。只有 `APP_ORIGIN` 与转发地址均为回环地址时，构建后的程序才允许此测试转发。公网 Railway 配置忽略它，仍直接访问官方 OpenAI API。

测试记录位于 [QA.md](../QA.md)。正式修改应保留原文校验、结果预览与版本冲突保护，不因访客模式放宽这些约束。

0.3 自动分页、技能按需装载、自动检查与修正、版本保护及接续入口见 [自动设计工作流](automatic-workflow.md)。界面不再要求人工设置画面或技能；正常版本自动呈现，历史手动提案仍可查看。

## 排版结果被拒绝时

`src/style-safety.js` 由服务端结果校验及浏览器预览、应用、导出共用。CSS 子元素选择器的 `>` 是正常语法；标准 SVG 的 `xmlns` 只是命名空间，也不属于外部资源请求。浏览器保留 SVG 的 `g` 分组及常用变换、透明度属性，避免删掉整组矢量图。不要把这些正常结构作为危险内容整体拦截。

结果校验错误会记录 `AI_RESULT_VALIDATION_FAILURE`、任务编号、固定错误代码及页码原因，不记录原始文案、HTML 或密钥。脚本、事件、外部资源、字体定义和样式导入仍拒绝；锁定原文、页面范围和应用前版本检查继续保留。可下载 HTML 母版与 `result.json` 的页面片段不同：片段不能带 `head/style/script/link` 等整页配置。

旧版只有笼统错误，且失败后已清理托管环境。不能仅凭历史截图断定具体触发项，也不能宣称旧任务结果已恢复。发布修复前应先备份项目，尤其在没有 Railway Volume 时。
