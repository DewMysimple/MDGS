# C8 透明游观组：独立补充诊断

原 `compact-user-viewport/compact-desktop-validation.json` 保持失败状态：308 条中 307 通过，唯一失败是卷二标题五个 Range 字格比 `.art-gaze-paper` 的逻辑组上边高 1 CSS px。原 driver、断言、报告和截图均不修改。本补充不把 308 条改称全部通过，也不替代其他功能测试。

2026-10-23 11:52（上海），单一 Chrome 156.0.8078.47 context 通过真实首页、第二卷及“画中有遇”按钮打开同一 C8 冻结包；没有注入 CSS、替换字体或模拟产品状态。HTTP HTML SHA 与 C8 一致。03:52:38.538Z 浏览器已关闭，临时 HTTP server 随后关闭。

`transparent-heading-computed.json` 记录实际 computed：

| 对象 | overflow | background | border | 字号 / 行高 |
| --- | --- | --- | --- | --- |
| `.art-gaze-paper` | visible | rgba(0,0,0,0)，无 image | 四边 0px | 继承正文 |
| 标题 h2 | visible | rgba(0,0,0,0)，无 image | 四边 0px | 26px / 32.5px |

标题、heading 包装和游观组均没有 clip-path、mask、contain 或 transform。真正 `overflow:hidden` 的祖先是覆盖整个画心的 `.art-encounters` 与 `.painting`，所有标题字格都在该裁切范围内。透明组上边 y=887.40625；h2 实际行盒高 32.5px；Range 字格 y=886.40625、高 34px。Range 含字体上下度量空白，不能等同于墨迹。

对原始 2553×1354 PNG、DPR1.25 的五字区域做可复现像素检查：只选深墨绿像素 `R<110 && G<130 && G>R+5 && G>B+4`，852 个像素的物理 bbox 为 `[313,1114,489,1144)`；换算 CSS 顶边 **891.2px**，比透明组顶边向内 **3.79375px**。此阈值只定位实心墨迹，不把所有抗锯齿像素都称为已分类；完整 PNG 人工审视也未见截笔、遮前景或越画心。新补拍 PNG 与既有截图分别保留 SHA。

本地相同 WOFF SHA 的真实 glyf 轮廓补充表明，“共此一城春”墨迹的 yMin/yMax 分别为 `[-75,798]、[-54,770]、[319,430]、[-84,808]、[-94,822]`，unitsPerEm=1000。它们不是 34px 高的实心矩形。字体轮廓仅为解释字格/墨迹差异，不冒充浏览器精确 baseline 测量。

Root 已独立看过原 PNG，并判定标题墨迹完整、游观组透明无框、没有越画心或遮住前景。本补证支持该人工范围修正：本例应检查**真实裁切祖先、墨迹可读和绘画主体**，无框布局组不要求整个字体 em 字格内缩。保留原严格检查结果作为测试范围缺陷的记录；不为此增加 padding，不改产品，不产生 C9。
