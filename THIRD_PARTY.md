# 来源与许可

- 照片：用户在当前会话提供的两张途洋教育环境与交流场景照片，项目内复制原文件用于制作示例；不推断人物身份，不作为师资资历证明。
- 示例文案及HTML/CSS：来自本工作区20261105/eju_1，按本次用户授权接入网站。EJU内容属于示例项目，不属于通用规则。
- Noto Sans SC：使用已安装xhs-note-creator资源中的Regular、Medium、Bold、Black四个字重；完整转换TTF为WOFF2，仅改变文件格式，保留全部字形。许可为SIL Open Font License 1.1，全文随assets/fonts/OFL.txt提供。
- 0.5.7 新增网页预览子集：由上述四份完整 WOFF2 派生，内部字体名改为 TuXu Preview Sans，保留版权、许可证及原有归属信息，附 `assets/fonts/preview/OFL.txt`。6356 字符取自通用拉丁/标点、GB2312 一级、JIS0208 一级及假名集合，不含产品定制字表。完整字体未改动；子集构建工具 FontTools（MIT）与 Brotli 仅用于本地生成，不加入运行依赖。
- html-to-image 1.11.13：https://github.com/bubkoo/html-to-image ，MIT。
- JSZip 3.10.1：https://github.com/Stuk/jszip ，本项目按MIT许可使用。
- 构建工具esbuild，MIT；开发验证Playwright，Apache-2.0。
- 图序图标与工作台界面为本次编制。设计方法来自已安装小红书工作流中的保真、构图和检查规范；当前版本未执行远程模型或生成图片服务。

# 0.2 云端扩展

网站框架使用 Sites 提供的 Vinext/React/Cloudflare 集成，结构化数据使用 Drizzle。供应集成的许可保留在 scripts/vite 与 vendor 中。14个设计模块来自本机已安装的完整技能，上传包保留其中原有的来源记录、版本、脚本、模板、字体及许可；各模块的文件ID与实际上传ZIP的SHA-256记录于部署时的服务端技能清单。中文字体继续附带SIL Open Font License。

真实机构照片属于用户输入，不属于可供其他用户复用的公共模板素材；已迁至仅网站所有者可取得的服务器种子资源。

0.7.0 新增 copywriting、copy-editing、content-strategy、social（Corey Haines / marketingskills，MIT，四个目录附上游 LICENSE），humanizer-zh（op7418/Humanizer-zh，MIT，保留原许可）。content-research-writer 的功能参考来自 ComposioHQ/awesome-claude-skills；核对时上游未声明许可，网站仅分发独立编写的集成规范，原技能仅按用户要求安装在用户本机。详见 `design-skills/writing-sources.json` 和 `design-skills/content-research-writer/PROVENANCE.md`。上游技能中的样例、问卷与营销约定不构成当前项目事实或额外权限。

0.7.1 新增 Taste（Leonxlnx/taste-skill，版本 2.5.1，提交 f6b76575f949707b4e3c37cd86cb44b0b98643e8，MIT，Copyright © 2026 Leonxlnx）。网站保留上游完整说明、参考、相关布局与视觉系统资源及 LICENSE，另编写静态图文适配；不分发上游样例照片、着色器库和网站执行脚本。完整版本按用户要求安装于本机技能库。来源和适配范围见 `design-skills/taste-skill/PROVENANCE.md`。

