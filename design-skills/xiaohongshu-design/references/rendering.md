# 本地渲染

本技能的 `package.json` 和锁文件固定渲染依赖。首次需要时在本技能目录运行 `npm ci --ignore-scripts`。优先使用已安装的 Edge 或 Chrome；缺少浏览器时可运行 `npx playwright install chromium`。不要为渲染配置任何发布账号。

## HTML 约定

- 每张画布使用 `.xhs-card`；默认实际尺寸1080 × 1440 px。可以添加 `data-page="封面"` 等便于识别的标签。
- 页面内部保留正常的文本流和明确的布局；不要靠 `overflow:hidden` 掩盖放不下的正文。
- 正式文字块使用唯一的 `data-copy`；标记块之间不要嵌套，防止重复提取。
- 字体、图片等用本地相对路径；用 `@font-face` 加载本次选定的字体。
- 调试元素可用 `data-qa-ignore` 标识；仅真实装饰可用 `data-allow-overflow` 声明刻意的越界，文字不能豁免。

## 命令

```text
node "<skill-dir>/scripts/render.mjs" "<project>/cards.html" --out "<project>/exports" --copy-file "<project>/copy.json"
```

常用选项：`--width 1080`、`--height 1440`、`--scale 2`、`--selector .xhs-card`、`--browser "<浏览器绝对路径>"`。输入可为本地HTML或本次项目已启动的HTTP地址；本地HTML通过临时本地服务加载，结束时自动关闭。

工具输出每页PNG、360 px阅读预览、180 px缩略预览、总览HTML与PNG，以及 `render-manifest.json`。报告记录实际字体、文字提取、图片加载、边界问题、来源文件指纹及已导出的文件。

**完成标准**：退出码0表示工具未发现所检查的结构问题。仍须打开图片检查审美、中文断句、事实和阅读顺序。对照文案缺失或不匹配、字体/图片失败、文字裁切或越界时退出码非0，报告保留问题依据，不能称为已检查通过的成品。

360 px和180 px图是设计检查用的本地缩放预览，不代表真实平台界面的完整复现。
