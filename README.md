# 图序 · AI 小红书设计工作台

从文案与真实素材，到可编辑的小红书图文。0.3 以右侧文案为中心，由 AI 自动决定画面、分页与技能，执行检查后呈现；改版发布状态与流程见 [自动设计说明](docs/automatic-workflow.md)。

换电脑接续开发，请先读 [HANDOFF.md](HANDOFF.md)，包含首次运行、AI配置、源码入口、发布步骤和当前限制。

Railway 部署新增无需账号的访客 AI 模式，配置与验证见 [Railway 接入说明](docs/railway.md)。推荐启动命令为 `npm run start:railway`，此前带 sites-env 预加载的长命令也已兼容；需要配置 Railway 服务端密钥。原 Sites 站点仍沿用原认证与存储。

- Railway 无需登录即可使用独立访客空间；原 Sites 保留平台身份路径。
- 保留右侧文案编辑，AI 自行判断分页、构图、配色、字重、照片安排和必要的示意素材。
- 14 个完整设计模块由 AI 按需加载与使用，界面无需选择任务类型、主技能或排版参数。
- 完整技能和脚本在隔离的托管环境执行，密钥始终保留在服务端。
- AI 渲染自检与网页独立检查通过后自动呈现；有新文案时保留最新内容，旧结果不覆盖新版本。
- 保留版本恢复、2160×2880 PNG、ZIP、可编辑 HTML 和项目备份。

0.3.1 已合入 `main` 发布，改为 [每张图独立的补充要求](docs/page-notes.md)：切页分别保存，点击「发送并修改本图」或按 Ctrl / ⌘ + Enter，仅调整当前图；整套设计保留为顶部独立入口。2026-11-08 用户确认没有需要保留的项目并授权发布；实际生产就绪以部署和公网验证为准。

0.4 已合入 `main` 发布，新增 [上传图裁剪保护与联网配图](docs/photo-policy.md)：上传图片最多裁剪 20%，自动检查至少保留 80% 的原图面积；可不上传图片，选择让 AI 从网上找实景配图。应用搜索的照片另行标记、保留来源，不受上传图裁剪上限限制。实际生产就绪以部署和公网验证为准。

原 [Sites 站点](https://tuxu-design-studio-20261106.phd-yang.chatgpt.site) 保留所有者私有范围；[Railway 站点](https://p-design.up.railway.app/) 已开放独立访客空间。2026-11-07 用户确认没有需要保留的云端项目，0.3 已合入 main 进行发布；生产就绪仍以实际部署及公网验证为准。本仓库保存源码和技能资源，不包含运行凭证或用户作品。原 Sites 部署记录见[部署记录](docs/deployment.md)。

开发需要 Node>=22.13。首次运行 `npm ci`、`npm run build`，按[开发与部署说明](docs/setup.md)初始化本地数据库，再运行 `npm run dev`。本地地址为 http://127.0.0.1:5173 。类型检查运行 `npx tsc --noEmit`，构建运行 `npm run build`。开发凭证放在被忽略的 `.env.local`，生产凭证通过 Sites 的服务端秘密配置管理；网页代码无需填写密钥。当前本地真实AI还需要技能上传清单和开发转发服务 `scripts/dev-ai-proxy.mjs`，详见[交接文件](HANDOFF.md#4-新电脑本地真实-ai)。生产站点不经过本机。

`design-skills/` 包含14个模块的完整说明、脚本、模板、字体、参考及各自许可。`node scripts/pack-skills.mjs` 从本仓库打包技能；`node scripts/upload-skills.mjs` 用已配置的服务端API凭证上传。打包结果位于被忽略的 `outputs/skill-release/`。上传文件ID和网站运行密钥不进入本仓库。

原 Sites 生产站点必须沿用 `.openai/hosting.json` 的身份，不重复创建，需单独执行 Sites 发布。Railway 的 main 推送可能触发自动构建；未挂持久化卷时，先备份项目再发布。独立部署者应在自己的环境重新配置资源和秘密。

详见UPGRADE.md、QA.md和THIRD_PARTY.md。签名回调已实现；公开可达并配置回调前，执行任务时保持网页打开，重新打开可继续。未提供小红书账号发布或评论功能。

