# 发布检查清单

本清单用于打 tag 或公开发布前检查。

当前状态：

```text
工程健康：以 npm run release:check 为准
发布判断：工程检查 + 样张渲染 + 人工视觉确认
视觉系统：三套视觉语言（Still Paper / Signal Proof / Bridge Canvas）已落地
```

技术 PASS 不等于视觉 PASS。机器 gate 只证明工程健康，人工视觉确认才是最终发布闸门。

## 1. 安装与基础检查

```bash
npm install
npx playwright install chromium
npm run check
npm run test:gates
```

## 2. 构建与渲染样张

```bash
node bin/blcaptain-style.mjs demo
npm run build:agent
npm run render:agent
npm run validate:agent
```

单个任务也可以走标准链路（智能驱动：先写 brief.json，再 build → render → validate）：

```bash
node bin/blcaptain-style.mjs build <brief.json> --out <deck>
node bin/blcaptain-style.mjs render <deck>
node bin/blcaptain-style.mjs validate <deck>
```

## 3. 视觉与质量检查

工程质量线：

- 样张能完成 build / render / validate。
- `npm run check` 与 `npm run test:gates` 通过。
- 渲染样张齐全、对比联系图存在。

## 4. 工程健康检查

```bash
npm run release:check
```

`release:check` 只证明工程健康。它不替代人工视觉确认，也不代表发布就绪。

## 5. 人工视觉检查（最终闸门）

逐张检查：

- 是否有明确焦点、标题是否足够大。
- 截图是否可读、图片主体是否被文字遮挡。
- 是否有无意义装饰、页脚 / 正文是否碰撞、是否有低对比小字。
- 三套视觉语言是否各有身份，而不是同一套换色模板。

## 6. 最终发布就绪

当前仓库没有单独的发布就绪 npm script。最终发布前必须由维护者完成以下人工判断：

- `npm run release:check` PASS。
- 代表样张已重新 render / validate。
- 人工视觉检查完成，没有不合格项。
- README / SKILL / package files 没有断链、内部路径或过期命令。

## 发布判断

可以进入发布前准备：

- `release:check` PASS。
- 人工视觉确认完成，没有不合格项。

不得发布：

- 人工视觉尚未确认，或存在不合格项。
- README / SKILL / RELEASE 中存在不可执行命令或未上传路径。
