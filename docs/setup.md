# 开发与部署

Railway 的无账号 AI 试用模式见 [railway.md](railway.md)。下文默认描述原 Sites 开发环境，两者的服务端变量和数据库不会自动共享。

## 本机

使用Node>=22.13与npm。首次运行npm ci安装锁定依赖，再运行npm run build，按下文初始化本地数据库，最后npm run dev。日常修改src后运行npm run build:editor重建编辑器；npm run build会自动包含该步骤。类型检查为npx tsc --noEmit。完整跨电脑步骤见[HANDOFF.md](../HANDOFF.md)。

本地ChatGPT登录模拟仅对回环地址生效，通过/signin-with-chatgpt?return_to=/进入。模拟账户仅用于开发，生产身份由Sites注入。生产的每项项目、素材与任务操作仍按用户ID检查权限。

## 数据库

.openai/hosting.json声明DB和BUCKET。D1迁移位于drizzle/，在已有数据库上只追加迁移，不重放或修改已经应用的迁移。构建后，本机首次按顺序执行：

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_peaceful_sleeper.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_clammy_moondragon.sql
```

以上只操作本机数据库。Sites发布过程应用云端迁移并绑定R2。

## AI与技能

开发凭证文件是.env.local，被Git忽略。生产通过Sites服务端秘密配置OPENAI_API_KEY、SKILL_FILES_JSON、ADMIN_EMAIL、AGENT_MODEL和IMAGE_MODEL，不放进前端或hosting.json。

完整技能位于design-skills。pack-skills.mjs默认从这里打包，也接受DESIGN_SKILLS_ROOT指定其他根目录；upload-skills.mjs上传包并记录文件ID。SKILL_FILES_JSON使用生成的uploaded.json结构，属于部署运行配置，不在公开仓库保存。

当前开发配置从outputs/skill-release/uploaded.json读取技能清单，并固定经127.0.0.1:8789调用AI；本地真实AI需要另行启动node scripts/dev-ai-proxy.mjs。该转发服务读取.env.local，仅监听回环地址，生产不使用它。

可选OPENAI_WEBHOOK_SECRET用于验证/api/openai/webhook的原始请求签名。只有回调地址可从OpenAI访问并已完成项目级回调登记，才应宣称任务能在关闭网页后可靠收尾。私有访问方式下继续使用网页任务轮询。

## 许可与用户数据

各技能、字体和第三方代码的来源及许可随原文件保留，另见THIRD_PARTY.md。用户原图、作品、数据库、本机缓存、API凭证与测试产物不在公开仓库中。历史素材导入接口在公开导出默认无内置照片。
