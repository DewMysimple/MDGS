# 第三卷《锦绣花意》专项整改

整改与验收已完成。网页清单、可编辑Blender副本、逐景审查、前后对照及关键截图均已核对；历史失败候选保留，不作为终版通过证据。

本轮将空白分成保留气口、修复承接、文字排版三类。九个主景内收，删减顶部重复旁景；三处真截口做透明补绘；15组竖排短题与两列文化短文进入侧白及过渡纸面。第2景仍保留无正文的停顿，没有用新大场景把空纸填满。

当前canonical SHA256：`4433928f6e6160acbd275ba6430d65fa3128df736a7eb59ef7607e61312d10cb`。原四份源工程、前两轮8份副本及其他三卷的修订子树保持不变。

## 交付入口

|用户要求|交付位置|
|---|---|
|先逐景审查留白、截断、生硬、衔接、构图、顶部|[33图初审](audit-visual.md)、[对象与图源技术定位](technical-audit.md)|
|先重排再补充，给出文字/图像/边缘/上部删减方案|[方案与最终执行差异](plan.md)、[完整布局参数](layout-plan.json)|
|哪些区域实际修改、哪些留白保留|[逐视点实施与文字表](final/implementation.md)、[对象/矩阵/素材/证据JSON](final/implementation.json)|
|Blender整改结果|[新独立副本](../../artwork/blender-chapter-3-refinement/chapter-3_reconstructed.blend)、[保存/独立重开/源保护](blender/final/delivery-summary.json)|
|网页效果和关键截图|[33个终版视点](final/visual-review.md)、[三种窗口文字](text-layout-accepted/visual-review.md)、[两种短窗](text-short-window-v3/visual-review.md)|
|修改前后对比|[顶部与截口](final/comparison-top-and-edges.jpg)、[图文与构图](final/comparison-typography-and-composition.jpg)、[衔接与终景](final/comparison-transitions.jpg)|

正常启动仍双击根目录 [runStart.cmd](../../runStart.cmd)，或运行 `npm run dev` 打开当次实际地址。路径、开发端口、窗口和画心尺寸继续自适应。网页不依赖Blender/Python。

## 具体整改

- 婚嫁幕台两端、迎亲远景右端、雪巷左端分别补出完整树石、檐口、栏端与自然透明轮廓；原图片保留。第3景截边高屏风退役，保留独立新娘、绣女、凤凰与锦架。
- 第1/2/3/4/6/7/8主景缩至原构图的82%，第5景74%，第9景78%，以原下沿为支点保中下重心；源相机姿态、对象世界矩阵与原动画不动。第7景工坊地面略内收上接镜台右足，完整镜面、垂布和桌腿沿用。
- 本轮额外退役31个源旁景/辅助对象：3个高大重复背景、2个游离重复花枝、1个有硬顶口的重复山水、25条实际穿过人物和锦布的辅助细线。真正第9景山水城景保留。[同帧显隐归因](line-diagnostic/conclusion.md)给出实际对象与像素差，不用“透明外圈”指标替代截口审查。
- 8个过渡及第3/4/5/6/7/8/9景设置15组竖排文字。既有横题改排，长文化正文继续在画外拾遗；文案是本轮原创展陈短句，未冒充古诗或史料。第7景用一枚中性“安居”小印，终景删去多余小印，让远山保持空纸边界。
- 锦架gap02围绕脚部内收6%，让题签与锦布分开，原落脚点保持。其他低地坪沿用，不新增高山/大屋遮边。顶部纸天、题首外围、凤凰羽翼外、分镜间气口继续留白。

## 可编辑文字与响应布局

清单中的15组文字独立于图像；网页使用同一源相机的CSS3D文字，Blender为15组46个新FONT对象，图像与1份中文字体均打包。原6份长文FONT只在新副本隐藏，以对应网页的阅读面板策略。原FONT和原源文件保留。

宽窗保留世界锚点；窄窗按真实字带的最小可读宽高预留纸面，原视点等比收入下部；短窗以内容需要撑开画心并纵向滚动。正文至少14px、标题至少18px；同一时间仅一组正文，进入/离开平滑淡化。卷首仍用原开题文案，小窗重新排入纸面。纸面题字不截获滚轮/拖拽。

短窗口按文字的实际内容高度展开画心，允许页面纵向滚动；没有将原画压成底部缩略条，也没有删除节点或改变源相机姿态。Blender保留宽窗世界排版，不宣称等同网页的窄窗响应排版。源纸纹与字体着色也有差异，二者不作逐像素相同的承诺。

## 素材与提示词

三张修边素材由**内置image_gen**分别编辑，透明输出，未使用CLI；原始输出逐字节复制，生产处理仅做全透明外行裁除、透明安全边与WebP转换。精确提示词、输入/输出SHA及工具源路径见 [asset-generation.json](asset-generation.json)。

- [marriage-stage.png](../../artwork/chapter-3-refinement/raw/marriage-stage.png)：婚嫁幕台两端。
- [procession.png](../../artwork/chapter-3-refinement/raw/procession.png)：迎亲右端。
- [snow-street.png](../../artwork/chapter-3-refinement/raw/snow-street.png)：雪巷左端。

生产PNG/WebP及alpha/自然比例/字节证据见 [prepared-assets.json](prepared-assets.json)。原源图和原Blender未覆盖。

## 验证与实景证据

- 33个宽窗视点：9停驻、8中点、16四分点；19张变化图重新逐张看，14张与已逐张审过的v4图完整SHA相同。[终版复核](final/visual-review.json)。v4保留2问题拒绝记录，终版分别修复镜台地缝与重复山水硬顶边。
- 48张三窗口文字实景和同帧无字底图，另8张两种短窗实景；正文、逐字边界、完整性、语义唯一、人物遮挡、开题均独立检查。[文字复核](text-layout-accepted/visual-review.json)。
- 170次五窗口正反状态，退休层在纹理加载、反向游观后不复活；实际滚轮/拖拽及真实WebGL丢失恢复通过，五窗口源相机姿态逐项相等，短窗纵滚后自动展卷控件可达、跨章高度清理/恢复通过。[运行报告](final/runtime/validation.json)，[短窗整页、控件与布局生命周期独立复核](final/short-window-review.md)。
- 新Blender实际保存、保存内重开、独立进程重开；原四源和前两轮8份副本再hash不变。72图像/1字体打包、69次布局应用覆盖68个独立源网格，非目标几何保持。[独立重开](blender/final/blender-reopen-validation-chapter-3.json)。
- 8张真实Cycles PNG：停驻2/3/5/7/8/9，中点2/6；全部逐张目视。[渲染与视觉复核](blender/final/preview/visual-review.md)。
- `npm test`、`npm run validate:assets`、`npm run build`、`npm run test:subpath`通过；子目录四卷197图层/19文字及滚轮、拖拽、键盘、分镜、自动展卷、轻动、全屏、抽屉焦点通过，零页错/404。[汇总核验](final/checks.json)。

三份前后对照包含9组同进度真实浏览器截图，只加标签与等比缩放，未修饰场景像素。[输入与SHA](final/comparison-evidence.json)。本轮验证范围为本机Windows/Chromium/Blender5.0；未扩大到实体移动设备或已部署站点。

## 维护与恢复

当前只用 `node scripts/build-chapter-3-refinement.mjs` 从本轮冻结dec52基线及布局/生产素材重建。历史 `build-blank-design.mjs` 和 `build-reconstruction.mjs` 会恢复旧交付，不可用来覆盖当前第三卷。

`scripts/report-third-refinement.py` 汇总时核对当前清单、33图、48+8排版图、170运行状态、新Blender及8实际渲染、原4源/旧8副本、9组对照与生产清单，拒绝混用旧revision。原始审查、候选、失败诊断和日志按目录保留。
