# 第三卷技术专项审查

当前canonical SHA256：`dec52de0566ca29fcae9a767cec8f7970bd3dc98a226ac8a6ea54ebf654d8fa8`。本审查只写报告，未修改产品/素材/Blender，也未启动Blender。

原393网格/72图像/6原文字；当前7图像替换、2几何补全、0墨边、287源层隐藏、46追加层（含本轮补白12）、4HTML文字。

## 用户截图问题定位

|截图/景|精确对象|当前问题与处理建议|
|---|---|---|
|2 / 第2景|`SC02_06_上方人物背景`|左右幕台硬边及顶部拥挤。保留人物与真实柱体，先将舞台群重排至中下部，再对两侧岩石/栏杆/远景像素做有结构的外扩和自然收束；不整幅统一渐隐。|
|3 / 第3景|`SC03_07-left-room-background`|左屏风竖直切线。屏风外缘/花纹与帷幔应有完整轮廓；原PNG左边在画布边界截止，需定向外扩或退役该块高大侧景，不再恢复UV。|
|3 / 第3景|`SC03_04-procession`|右迎亲宫门/队伍竖直切线。修右侧宫门、树冠、灯彩/栏杆端点并将迎亲队伍适度内收；人物仍完整，薄背景可退为轻景。|
|4 / 第5景|`SC05_08_左下街景_重做`|雪巷左侧长竖切。沿左缘雪树/檐口/石栏补安全外延，原屋面/树冠不保留笔直切面；景组下移并让上部雪山更轻。|
|5 / 第7景|`SC07_01_左侧镜台陈设`|镜台垂布/桌腿硬截与景组遮挡。不要重绘已完整镜面与器物；先审c3-t056当前图卡完整UV及地台遮挡；保持垂布自然尖端与桌脚，不以雾遮桌腿。|
|5 / 第7景|`SC07_02_上方宫苑场景`|上部宫苑舞台悬浮、屋面顶到画框。优先删减/退役上部旁叙宫苑图卡或改为小幅器纹说明；如保留则以明确派生几何下移缩小并接地，顶部留纸，不再加山云填满。|

所有对象的源材质名、sourceName、完整列主序matrix、local positions/UV、世界bounds、源/当前图片路径、SHA、alpha silhouette数据均在同名JSON `objectIssues[]`。

## 已核实的技术边界

第二景幕台原31顶点的L形UV缺口已补成完整UV，但两侧图片自身截边仍未修。第三景屏风/迎亲、第五景雪巷都是4顶点完整UV；重复full-UV不会修复源像素竖切。当前外缘均有8px左右透明padding，旧“外圈透明=无硬边”的指标不足；JSON测量内侧不透明轮廓长直线，并保留目视判断。

第七景镜台当前c3-t056已经画全桌腿与垂布；应审当前载体、地台遮挡和图卡构图，避免重绘完整镜面。宫苑c3-t054虽然主体完整，却在画心上方孤立悬着，顶边拥堵仍存在。当前accepted-v3第二/第七景画心已直接查看，旧passed不视为本轮完成。

## 字体与新增排版

网页4新文字是3横排caption加1竖排印章。`src/scene/CalligraphyLayer.ts/.css`以CSS3D共用相机；只seal有vertical-rl，caption是横排。正文/标题依赖本机宋体/楷体fallback，无打包webfont。opening题签独立支持竖排，不应破坏。

窄屏placeReadableText会把正文放大到12px、标题16px并挪入viewport边内，需实测防止盖画和挤压顶部。range在网页控制显隐，Blender只写progress_range属性；当前render-blank-blender不应用range。

Blender `add_text_layers`固定横排title/body，需与网页共同增加显式竖排配置；建议逐列可编辑FONT。当前6原DOCX FONT在网页被isText跳过，派生Blender保留原6+新7=13FONT，现场对照应明确/解决该差异。当前pack的字体是原场景KaiTi Regular。

## 修改入口与源保护

当前`build-blank-design.mjs`会从冻结290e基线重建canonical；只手改manifest会在重建丢失。应新建第三卷专项冻结基线、plan、确定性builder，其他三卷子树严格保持。新副本建议`artwork/blender-chapter-3-refinement`，报告`reports/chapter-3-refinement/blender`，不覆盖既有两轮副本。

源matrix override尚无实现。可用已支持replacement explicit-corners更改派生local carrier几何（源matrix保留），或显式隐藏原对象再追加独立图卡；若引入统一transform override，必须两端同实现并明确不变项例外。

墨边支持left/right/top/bottom与uvRect，两端已有GLSL/节点实现，适合次要背景边界；无法发明缺失人物/建筑结构，也不该整幅统一淡化。

Blender重构支持`--check-only`、`--dry-run`、分离`--output-dir`/`--report-dir`，所有源哈希、原矩阵/相机/动画/层级、非目标几何、打包图片/字体、保存后重开均有现行验证。最终还需独立`validate-reconstructed-blender.py --report ... --source-config ...`。

`render-blank-blender.py`只读原相机姿态临时预览，不保存blend。当前C3只有gap的blankDesign锚点，`--stops`仅能选已有stop锚，无法直接渲染本轮重点2/3/5/7停驻；需新增明确source-frame或审查后stop映射。实际参数、限制、保护列表详见JSON。

## 验证范围

本报告是技术事实与方案，不宣称整改完成。已直接查看用户5附件、6处当前图片、原屏风PNG，以及现有第二/第七景真实画心截图。尚需root完整逐景审查、构图方案定稿、修改、全卷正反滚动及宽窄屏、Blender另存独立重开与实际预览。
