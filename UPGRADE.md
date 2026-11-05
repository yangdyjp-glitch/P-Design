# 图序 0.2

沿用原网站和原编辑器，增加可实际执行的云端 AI 与多用户数据层。

已接入14个设计模块：xiaohongshu-design、victor-design、xhs-reference-contract、xhs-cover-lab、xhs-poster-composition、xhs-design-polish、baoyu-cover-image、baoyu-xhs-images、baoyu-infographic、xhs-images-design、auto-redbook、xhs-note-creator、blcaptain-style-skill、xhs-writer。每个模块保留完整 SKILL.md、脚本、参考、模板和许可；服务端按任务选择主流程与辅助模块，不把所有模块强行串联。

网页支持设计、局部改稿、封面、排版复核、参考分析、内容创作、生成视觉素材与模板制图；可指定主技能。执行经过真实 Agents API 托管环境，项目输入、技能 ZIP 与中文字体传入当前任务的隔离环境。图像生成通过服务端工具调用，不向沙箱或浏览器提供 API 密钥。实际使用技能、执行与未执行的检查、来源和交付文件都保存在结果中。

云端项目与图片分别保存在 D1、R2。每次操作通过 Sites 提供的稳定用户ID校验所有权；资料不按邮箱分区。管理员初次身份使用服务端所有者邮箱引导，随后固定为该站点的用户ID。素材、任务与交付文件均经过逐项权限检查。浏览器缓存也按用户区分，旧版缓存只向确认的网站所有者迁移。

原文默认锁定。服务端校验 AI 返回的文案块ID、数量、正文与数字；前端清理不支持的HTML/CSS。结果先供查看，应用前检查项目版本，保护任务提交后产生的新修改。内容创作作为新项目草稿，不覆盖现有原文。生成图片明确标记为示意素材。

生产密钥已通过 Sites 的服务端秘密配置接入。项目中的 .env.local 仅作本机用途，被 Git 忽略，不进入发布包。保留每日每人10次、全站60次、每人1个及全站6个同时运行任务的限制；每次生成素材最多1张。额度是任务次数，不是固定金额的费用上限。

当前保留原网站的所有者私有访问范围。邀请或公开注册使用，需要在网站分享设置中指定受众。签名回调接口与校验已实现；在公开可达并配置 OPENAI_WEBHOOK_SECRET 前，任务通过网页驱动推进，处理期间应保持网页打开。重新打开可查看和继续已有任务。未声称私有网站已支持关闭网页后的可靠后台收尾。

本机开发：npm ci；npm run build:editor；npm run dev。Sites构建使用插件 build-site.mjs，部署沿用 .openai/hosting.json 的原 project_id。D1迁移在drizzle目录，后续只追加。Windows系统代理环境下，开发可用 scripts/dev-ai-proxy.mjs；它仅绑定127.0.0.1，生产构建不使用此代理。上传技能使用 pack-skills.mjs 与 upload-skills.mjs，输出和文件清单位于已忽略的outputs目录；重复执行上传只补充尚未成功的资源。

验证详见QA.md。14个模块均完成资源接入；不把单条路径的验证等同于所有风格、模板和任务组合均已测试。
