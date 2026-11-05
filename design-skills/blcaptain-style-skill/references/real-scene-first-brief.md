# 首张真实场景 Brief

## 目标

不再做 gallery、contact sheet 或小卡片矩阵。下一步只做一张真实比例 PNG，让用户根据实际效果判断：

```text
有希望
不对
值得继续
淘汰
```

## 首张任务

```text
ID: SP-MF-R01-PROOF
平台: 小红书
画幅: 1080×1440
系统: Still Paper
主题: SP-01 Mist Field
Recipe: SP-MF-R01 Field Photo Cover
源头: references/visual-direction-boards/01.png
内容场景: 安静山野 / 湖边人物 / 专注力预热封面
```

这张必须先做，因为 `01.png` 是当前 Still Paper · Mist Field 的源头方向稿。先把它拆成一张可看的真实 3:4 成图，再讨论是否进入单张精修；不能先扩其它系统、其它 recipe 或总览展示。

## 一眼要看懂

```text
这不是米色模板，
而是一张有纸感、有照片情绪、有安静判断的 Still Paper 封面。
```

## 画面结构

1. 顶部：低声 meta，显示 `Still Paper · Mist Field / Visual Direction · 01 / SP-MF-R01`。
2. 主标题：中文判断，2-3 行，不能碎成每行两三个字。
3. 短 lead：只解释情绪，不讲方法论。
4. 主照片：山、湖、雾、树林、人物背影或安静物件，占画布 40%–55%。
5. 图像规则：必须声明 subject map、safe text zone、avoid zone 和 object-position。
6. 底部：一句低声 note、一个小 stamp、一个克制 footer。

## 文字草案

主标题：

```text
在湖边，
找回呼吸的节奏。
```

副标题：

```text
一段关于慢下来、重新听见自己的记录。
```

低声 note：

```text
让画面先安静下来
文字只留下一句判断，风景负责把情绪放慢。
```

Footer：

```text
Still Paper / Mist Field
Record · Reflect · Realign
v1.0
```

## 配图

优先级：

1. 用户提供或项目内已有的湖边女孩 / 山野人物图。
2. AI 生成的纯净写实摄影资产：无文字、无边框、无海报感。
3. 公开图源：Unsplash -> Pexels -> StockSnap CC0 -> Pixabay -> Kaboompics -> Flickr CC0 / Public Domain -> Openverse CC0 / Public Domain -> Wallhaven -> 直接搜索。

当前 proof 可先使用项目内已有湖边女孩图：

```text
examples/sp-c01-photo-lake-girl/assets/hero-sp-c01-lake-girl.png
```

该图只用于验证 `01.png` 的意境和版式逻辑。最终生产前仍要重新确认资产纯净度或替换成明确来源的公开图源。

## 验收

必须通过：

```text
像 01.png 的 Still Paper · Mist Field，而不是泛米色模板
照片足够大，且不是装饰
标题像一句安静判断
英文 meta 有刊物节奏，不像系统 fallback
主体避让清楚，文字不压人物或湖面核心
底部信息克制
不是 deck-gallery
不是 contact sheet
不是缩略矩阵
```

通过后，才允许把 `SP-MF-R01 Field Photo Cover` 反推为 seed template 或 engine binding。
