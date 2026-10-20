# 最终图层资产交付说明

本说明逐项读取最终 `prepared-assets.json`、`layers-inventory.json`、`runtime-bindings.json` 和 `layer-implementation.json`，并按实际资产引用与动效绑定反查。统计以唯一纹理、世界实例、HTML和配置绑定分别计数；“建议处理”不计作已实施。

两份运行清单的 canonical SHA-256 均为 `290e865749ec5a27c48c1c6b7f3dda55bcd809e0d9610ab98d791fd5042ef115`。原始场景/原图保留，选中版本的 raw、生产PNG、WebP和SHA见 [prepared-assets.json](prepared-assets.json)；实例与实际动作见 [layer-implementation.json](layer-implementation.json)，运动参数见 [runtime-bindings.json](runtime-bindings.json)。

## 最终统计与先期统计的区别

| 卷 | 原网格 | 原纹理 | 保留 | 修复 | 重生成 | 选中替换raster | 新增world | HTML |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 216 | 105 | 90 | 11 | 4 | 7 | 58 | 1 |
| 2 | 42 | 34 | 20 | 10 | 4 | 13 | 26 | 1 |
| 3 | 393 | 72 | 61 | 8 | 3 | 7 | 34 | 4 |
| 4 | 128 | 52 | 45 | 6 | 1 | 5 | 34 | 2 |
| 合计 | 779 | 263 | 216 | 35 | 12 | 32 | 152 | 8 |

先期审校为219保留／32修复／12重生成。后续样板和原尺寸过渡复核新增 `C1-T052`、`C3-T028`、`C3-T056` 三项修复，最终为 **216／35／12**，不是新增三张原纹理。35项修复与35张新图并不等价：**20项真实像素修复＋7项原像素材质墨边＋8项raster退役后改HTML＝35项**。本次逐项反查未发现只有推荐、没有替换/alpha/HTML动作的修复项。

选中生产raster共 **34份＝12重生成＋20像素修复＋2共享连接资产**；32份替换图各对应一个实际主实例。另有保留纹理上的局部UV恢复、纸底深度设置和辅助片退役，这些不改变该原纹理的像素审校类别。

## 34份选中raster：用途、叙事与实际motion

下表32份替换图的真实运行绑定均为静态，源动画样本也均为0。人物、建筑、器物不会因换图而整片摆动。共享薄墨有独立轻漂，远山静态；相机游观造成的投影变化不算图层独立motion。PNG保留完整RGBA，WebP最大边2048、quality90、alpha保留；技术打包为每侧原图尺寸约12%透明gutter，实际比例和误差记录在prepared清单。

| 选中ID | 处理 | 运行用途与叙事 | 实际motion / 几何 | 选中交付文件 |
| --- | --- | --- | --- | --- |
| `c1-t021` | 重生成 | 后景连续层；神都宫阙巡游后景，保持皇家礼仪秩序。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-1/c1-t021.png) · [WebP](../../public/assets/reconstruction/chapter-1/c1-t021.webp) · [选中raw](../../artwork/reconstruction/raw/c1-t021-palace-procession-v2.png) |
| `c1-t038` | 重生成 | 中景承接层；西苑初栽与寺院入苑的亭阁背景。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-1/c1-t038.png) · [WebP](../../public/assets/reconstruction/chapter-1/c1-t038.webp) · [选中raw](../../artwork/reconstruction/raw/c1-t038-pavilion-v2.png) |
| `c1-t047` | 重生成 | 中景承接层；洛阳牡丹初盛的宫殿与台阶。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-1/c1-t047.png) · [WebP](../../public/assets/reconstruction/chapter-1/c1-t047.webp) · [选中raw](../../artwork/reconstruction/raw/c1-t047-imperial-terrace-v2.png) |
| `c1-t052` | 修复 | 后景连续层；神都与寺院入苑段的连续山水城景。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-1/c1-t052.png) · [WebP](../../public/assets/reconstruction/chapter-1/c1-t052.webp) · [选中raw](../../artwork/reconstruction/raw/c1-t052-landscape-repair.png) |
| `c1-t059` | 修复 | 前景遮挡层；腊日宣诏百官仪式，补全群像下缘。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-1/c1-t059.png) · [WebP](../../public/assets/reconstruction/chapter-1/c1-t059.webp) · [选中raw](../../artwork/reconstruction/raw/c1-t059-repair.png) |
| `c1-t067` | 修复 | 中景承接层；文人整理、传播牡丹传说的书案与完整人物。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-1/c1-t067.png) · [WebP](../../public/assets/reconstruction/chapter-1/c1-t067.webp) · [选中raw](../../artwork/reconstruction/raw/c1-t067-repair.png) |
| `c1-t085` | 重生成 | 中景承接层；女帝宫廷背景，配合史实与传说对照。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-1/c1-t085.png) · [WebP](../../public/assets/reconstruction/chapter-1/c1-t085.webp) · [选中raw](../../artwork/reconstruction/raw/c1-t085-palace-gate-clean.png) |
| `c2-t002` | 修复 | 中景承接层；私园到宫苑的单一连续水岸，避免三组相同游人和竖直水墙。 | 静态；explicit-corners | [生产PNG](../../artwork/reconstruction/chapter-2/c2-t002.png) · [WebP](../../public/assets/reconstruction/chapter-2/c2-t002.webp) · [选中raw](../../artwork/reconstruction/raw/c2-t002-edge-repair-v2.png) |
| `c2-t004` | 重生成 | 主体叙事层；书房静赏，完整书案、人物与竹帘。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-2/c2-t004.png) · [WebP](../../public/assets/reconstruction/chapter-2/c2-t004.webp) · [选中raw](../../artwork/reconstruction/raw/c2-t004-rebuilt-v2.png) |
| `c2-t005` | 修复 | 后景连续层；去除烘焙长文后的城廓远山，文化正文留在抽屉。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-2/c2-t005.png) · [WebP](../../public/assets/reconstruction/chapter-2/c2-t005.webp) · [选中raw](../../artwork/reconstruction/raw/c2-t005-edge-repair.png) |
| `c2-t006` | 修复 | 后景连续层；静坐赏花的宫苑宴游背景，补檐和帷幔。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-2/c2-t006.png) · [WebP](../../public/assets/reconstruction/chapter-2/c2-t006.webp) · [选中raw](../../artwork/reconstruction/raw/c2-t006-edge-repair.png) |
| `c2-t010` | 修复 | 中景承接层；温和街巷花市，保留游人与花木，不添加斗花情节。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-2/c2-t010.png) · [WebP](../../public/assets/reconstruction/chapter-2/c2-t010.webp) · [选中raw](../../artwork/reconstruction/raw/c2-t010-edge-repair.png) |
| `c2-t011` | 修复 | 中景承接层；宫苑朝臣后景，补完整屋脊与接地。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-2/c2-t011.png) · [WebP](../../public/assets/reconstruction/chapter-2/c2-t011.webp) · [选中raw](../../artwork/reconstruction/raw/c2-t011-edge-repair.png) |
| `c2-t012` | 修复 | 前景遮挡层；牡丹山石前景，补石根和叶端。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-2/c2-t012.png) · [WebP](../../public/assets/reconstruction/chapter-2/c2-t012.webp) · [选中raw](../../artwork/reconstruction/raw/c2-t012-edge-repair.png) |
| `c2-t018` | 修复 | 中景承接层；宫门格窗与朱柱，补上檐和侧端。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-2/c2-t018.png) · [WebP](../../public/assets/reconstruction/chapter-2/c2-t018.webp) · [选中raw](../../artwork/reconstruction/raw/c2-t018-edge-repair.png) |
| `c2-t019` | 重生成 | 主体叙事层；宫苑女主人与侍从赏花，补完整衣摆。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-2/c2-t019.png) · [WebP](../../public/assets/reconstruction/chapter-2/c2-t019.webp) · [选中raw](../../artwork/reconstruction/raw/c2-t019-rebuilt.png) |
| `c2-t020` | 重生成 | 中景承接层；百姓春游观花，完整人物与衣袖。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-2/c2-t020.png) · [WebP](../../public/assets/reconstruction/chapter-2/c2-t020.webp) · [选中raw](../../artwork/reconstruction/raw/c2-t020-rebuilt.png) |
| `c2-t028` | 修复 | 前景遮挡层；前景牡丹花石，补底部叶片、石根。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-2/c2-t028.png) · [WebP](../../public/assets/reconstruction/chapter-2/c2-t028.webp) · [选中raw](../../artwork/reconstruction/raw/c2-t028-edge-repair.png) |
| `c2-t029` | 重生成 | 中景承接层；私园花径与春野静赏，完整树冠、花墙和石阶。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-2/c2-t029.png) · [WebP](../../public/assets/reconstruction/chapter-2/c2-t029.webp) · [选中raw](../../artwork/reconstruction/raw/c2-t029-rebuilt-v2.png) |
| `c2-t034` | 修复 | 前景遮挡层；牡丹水岸，补左岸与自然水纹外缘。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-2/c2-t034.png) · [WebP](../../public/assets/reconstruction/chapter-2/c2-t034.webp) · [选中raw](../../artwork/reconstruction/raw/c2-t034-edge-repair.png) |
| `c3-t001` | 重生成 | 中景承接层；牡丹织物与观花亭阁，完整建筑及帷幔。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-3/c3-t001.png) · [WebP](../../public/assets/reconstruction/chapter-3/c3-t001.webp) · [选中raw](../../artwork/reconstruction/raw/c3-t001-rebuilt.png) |
| `c3-t004` | 重生成 | 中景承接层；织物与牡丹器物桌案，补全桌腿和陈设。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-3/c3-t004.png) · [WebP](../../public/assets/reconstruction/chapter-3/c3-t004.webp) · [选中raw](../../artwork/reconstruction/raw/c3-t004-rebuilt.png) |
| `c3-t027` | 修复 | 后景连续层；凤穿牡丹婚嫁室内屏风，补顶端屏架。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-3/c3-t027.png) · [WebP](../../public/assets/reconstruction/chapter-3/c3-t027.webp) · [选中raw](../../artwork/reconstruction/raw/c3-t027-edge-repair.png) |
| `c3-t028` | 修复 | 后景连续层；婚礼街巷，补右屋檐回角、端柱与台阶。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-3/c3-t028.png) · [WebP](../../public/assets/reconstruction/chapter-3/c3-t028.webp) · [选中raw](../../artwork/reconstruction/raw/c3-t028-edge-repair.png) |
| `c3-t041` | 重生成 | 主体叙事层；家庭绣作的民居与牡丹墙饰，完整檐柱台基。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-3/c3-t041.png) · [WebP](../../public/assets/reconstruction/chapter-3/c3-t041.webp) · [选中raw](../../artwork/reconstruction/raw/c3-t041-rebuilt.png) |
| `c3-t054` | 修复 | 主体叙事层；宫苑牡丹墙饰与礼制装饰，补完整檐顶和阶台。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-3/c3-t054.png) · [WebP](../../public/assets/reconstruction/chapter-3/c3-t054.webp) · [选中raw](../../artwork/reconstruction/raw/c3-t054-edge-repair-v2.png) |
| `c3-t056` | 修复 | 主体叙事层；牡丹进入镜面、首饰和家具，补完整桌脚与垂布。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-3/c3-t056.png) · [WebP](../../public/assets/reconstruction/chapter-3/c3-t056.webp) · [选中raw](../../artwork/reconstruction/raw/c3-t056-edge-repair.png) |
| `c4-t007` | 修复 | 中景承接层；宴游场景的石地承托，保留原地坪摘取，不恢复遮人的高栏。 | 静态；preserve-region | [生产PNG](../../artwork/reconstruction/chapter-4/c4-t007.png) · [WebP](../../public/assets/reconstruction/chapter-4/c4-t007.webp) · [选中raw](../../artwork/reconstruction/raw/c4-t007-edge-repair.png) |
| `c4-t008` | 修复 | 中景承接层；盛美阶段的宫廷仕女与屏帘，补屏架、栏板和基座。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-4/c4-t008.png) · [WebP](../../public/assets/reconstruction/chapter-4/c4-t008.webp) · [选中raw](../../artwork/reconstruction/raw/c4-t008-edge-repair.png) |
| `c4-t020` | 重生成 | 后景连续层；沉香亭赏花题诗地标，完整屋檐、柱础与地台。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-4/c4-t020.png) · [WebP](../../public/assets/reconstruction/chapter-4/c4-t020.webp) · [选中raw](../../artwork/reconstruction/raw/c4-t020-rebuilt.png) |
| `c4-t027` | 修复 | 后景连续层；残阳兵马表现盛衰转折，补右侧完整骑者与马身。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-4/c4-t027.png) · [WebP](../../public/assets/reconstruction/chapter-4/c4-t027.webp) · [选中raw](../../artwork/reconstruction/raw/c4-t027-edge-repair.png) |
| `c4-t029` | 修复 | 前景遮挡层；游宴渐冷的屏案、翻杯与落花，补花叶及地面。 | 静态；full-uv-affine | [生产PNG](../../artwork/reconstruction/chapter-4/c4-t029.png) · [WebP](../../public/assets/reconstruction/chapter-4/c4-t029.webp) · [选中raw](../../artwork/reconstruction/raw/c4-t029-edge-repair.png) |
| `distant-ridge-bridge` | 共享新绘 | 后景连续层；36处低对比远山承接，避免场景块孤立，保留人物/题签周围留白。 | 36个world实例；无独立motion，静态 | [生产PNG](../../artwork/reconstruction/shared/distant-ridge-bridge.png) · [WebP](../../public/assets/reconstruction/shared/distant-ridge-bridge.webp) · [选中raw](../../artwork/reconstruction/raw/distant-ridge-bridge.png) |
| `ink-mist-bridge` | 共享新绘 | 连接过渡层；36处相邻分镜的低对比薄墨气口，连接地面与留白。 | 36个world实例；36个`drift`绑定，视锥/配额按需激活 | [生产PNG](../../artwork/reconstruction/shared/ink-mist-bridge.png) · [WebP](../../public/assets/reconstruction/shared/ink-mist-bridge.webp) · [选中raw](../../artwork/reconstruction/raw/ink-mist-bridge.png) |

## 35项修复审校的逐纹理实施闭环

以下按唯一原纹理计数。真实像素修复的交付路径已在上表列出；材质墨边通过实际 `edgeRepairs` 和 `applyInkEdge` 改alpha，不新增绘画像素。保留原像素的七项在当前构图内作为局部背景、接地口或象征性剪影使用，不能对外称为“重新补完整独立主体”。实景复核和各卷说明是该取舍的边界。

| 原纹理 | 已实施方式 | 实际动作 / 绑定 | 原像素保留理由或处理边界 |
| --- | --- | --- | --- |
| C1-T003 | 原像素＋实际alpha墨边 | `c1-t-db70fdd8913812ab-ink-edge`；左7% / 右3.5% / 上0% / 下6.5% | 保留殿宇近景构图与完整屋脊；侧墙/下缘作为局部接地口融合。未新增柱础或把它声称为新绘完整整殿。 |
| C1-T020 | 原像素＋实际alpha墨边 | `c1-t-a64ebf298212b1d3-ink-edge`；左2.5% / 右2.5% / 上9% / 下4% | 侍女衣袂保留；顶部伞盖按原近景摘取接薄云。只融合帷幔上口，未扩绘整顶伞盖，不摆动整组人物。 |
| C1-T050 | 原像素＋实际alpha墨边 | `c1-t-ec9506a43fe18f42-ink-edge`；左2% / 右2% / 上0% / 下8.5% | 僧人衣摆与花头保留；岩土下口接淡墨地气，未新增石根像素。 |
| C1-T052 | 真实像素修复 | `c1-t052` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C1-T055 | 原像素＋实际alpha墨边 | `c1-t-408f37a91eeaf014-ink-edge`；左2% / 右7% / 上0% / 下8% | 保留女帝/侍女与阶台的局部宫苑构图，右/底边口作材质融合；未宣称把局部背景扩成独立完整宫殿。 |
| C1-T059 | 真实像素修复 | `c1-t059` → 1个实际替换实例；`full-uv-affine`；另有材质墨边 | 原PNG归档保留；网页使用补全后的交付图。 |
| C1-T065 | 原像素＋实际alpha墨边 | `c1-t-682027b57089852a-ink-edge`；左2% / 右2% / 上0% / 下10% | 跪拜人物姿态和可见衣摆保留；下部接地墨化，不重画或摇动群像。 |
| C1-T067 | 真实像素修复 | `c1-t067` → 1个实际替换实例；`full-uv-affine`；另有材质墨边 | 原PNG归档保留；网页使用补全后的交付图。 |
| C1-T074 | 原像素＋实际alpha墨边 | `c1-t-e2a1b0d11ff61f17-ink-edge`；左2.5% / 右2.5% / 上0% / 下14% | 原本就是有意半身的青绿象征剪影，保留该语义并向留白渐淡；不把半身象征误判为需新画全身。 |
| C1-T075 | 原像素＋实际alpha墨边 | `c1-t-57c9ca6c93e9f10d-ink-edge`；左3% / 右3.5% / 上8% / 下8% | 保留宫帘/金圆与柱架的局部背景构图，接相邻云气并软化低频上下口；未扩绘整幢宫门。 |
| C1-T092 | 退役raster＋真实HTML | `r1-readable-title`；牡丹登高位 | 不再显示原低清长文/纸片；长文由原解读抽屉承载，原文件保留。 |
| C2-T002 | 真实像素修复 | `c2-t002` → 1个实际替换实例；`explicit-corners`；2个旧辅助片退役 | 原PNG归档保留；网页使用补全后的交付图。 |
| C2-T005 | 真实像素修复 | `c2-t005` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C2-T006 | 真实像素修复 | `c2-t006` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C2-T010 | 真实像素修复 | `c2-t010` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C2-T011 | 真实像素修复 | `c2-t011` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C2-T012 | 真实像素修复 | `c2-t012` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C2-T018 | 真实像素修复 | `c2-t018` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C2-T028 | 真实像素修复 | `c2-t028` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C2-T030 | 退役raster＋真实HTML | `c2-t030-readable-caption`；春野静赏 | 不再显示原低清长文/纸片；长文由原解读抽屉承载，原文件保留。 |
| C2-T034 | 真实像素修复 | `c2-t034` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C3-T026 | 退役raster＋真实HTML | `c3-t026-readable-caption`；凤穿牡丹 | 不再显示原低清长文/纸片；长文由原解读抽屉承载，原文件保留。 |
| C3-T027 | 真实像素修复 | `c3-t027` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C3-T028 | 真实像素修复 | `c3-t028` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C3-T033 | 退役raster＋真实HTML | `c3-t033-readable-caption`；花结良缘 | 不再显示原低清长文/纸片；长文由原解读抽屉承载，原文件保留。 |
| C3-T051 | 退役raster＋真实HTML | `c3-t051-readable-caption`；岁岁圆满 | 不再显示原低清长文/纸片；长文由原解读抽屉承载，原文件保留。 |
| C3-T052 | 退役raster＋真实HTML | `c3-t052-readable-seal`；吉庆 | 41×54原朱印退役；新“吉庆”为中性数字展陈文字印，不作为历史真印。 |
| C3-T054 | 真实像素修复 | `c3-t054` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C3-T056 | 真实像素修复 | `c3-t056` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C4-T007 | 真实像素修复 | `c4-t007` → 1个实际替换实例；`preserve-region`；另有材质墨边 | 原PNG归档保留；网页使用补全后的交付图。 |
| C4-T008 | 真实像素修复 | `c4-t008` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C4-T011 | 退役raster＋真实HTML | `c4-t011-readable-caption`；人花合一 | 不再显示原低清长文/纸片；长文由原解读抽屉承载，原文件保留。 |
| C4-T027 | 真实像素修复 | `c4-t027` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C4-T029 | 真实像素修复 | `c4-t029` → 1个实际替换实例；`full-uv-affine` | 原PNG归档保留；网页使用补全后的交付图。 |
| C4-T048 | 退役raster＋真实HTML | `c4-t048-readable-caption`；千古兴衰 | 不再显示原低清长文/纸片；长文由原解读抽屉承载，原文件保留。 |

其中C1-T059、C1-T067既有新像素，也沿用边缘融合，所以材质pass数不能再与20份像素图相加当唯一纹理数。C4-T007使用新像素并保留地坪区域摘取/局部边墨；C2-T002使用一个审核过四角载体和单一水岸，两份旧河片明确退役。第三卷两处fullUV恢复使用完整原图：`SC02_03_右上仕女群`、`SC02_06_上方人物背景`，没有重画原本完整的身体和柱脚。第四卷重复山水helper和阶梯mask辅助片已退役，主片保留。

## 152个追加world与8个HTML的作用

152是实例数量，不是152张新图：**80个独立花瓣＋36个薄墨桥＋36个静态远山＝152**。80花瓣从已有 `c1-t-c11727871864eb21` 原透明图中以UV选区取出，原像素不改、不新增第35份生成raster；选区来源见 [petal-atlas.json](petal-atlas.json)。同一共享PNG由世界矩阵定位到各分镜间隙，仍使用原相机投影。

| 卷 | 花瓣fall | 薄墨drift | 静态远山 | 新world合计 | 独立motion配置总数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 30 | 14 | 14 | 58 | 71 |
| 2 | 14 | 6 | 6 | 26 | 21 |
| 3 | 18 | 8 | 8 | 34 | 51 |
| 4 | 18 | 8 | 8 | 34 | 45 |
| 合计 | 80 | 36 | 36 | 152 | 188 |

188为配置绑定，包括116个新动效实例和72个原有独立图层绑定；实际是否动由视锥、纹理驻留、总额与分组配额决定，并非188个同时动。每卷通常最多6个活跃绑定。第四卷第5景起按真实阅读节点逐步把时钟速度1降至0.32、花瓣密度1降至0.08、云密度1降至0.22，尾段上限收至3。独立轻动受开关、系统减少动态偏好和后台停帧控制，与自动展卷暂停分开；原有5个源动画对象仍按游观进度采样。

8个新增HTML是7个短题签和1个中性“吉庆”印记，均静态、真实文字、同一世界相机投影；不生成烘焙长文。可见时标题约16px以上、正文约12px以上，安全边与最小字适配不会改变源锚点；锚点出实际窄窗视锥时允许隐藏，长文仍在原解读抽屉。它们不计入152个WebGL新增world实例，也不替代原卷首书法配置。

| 卷 | HTML ID | 显示内容 | 作用 |
| --- | --- | --- | --- |
| 1 | `r1-readable-title` | 牡丹登高位 / 苑囿初栽，花入神都。 / 华贵与傲骨，留在一朵牡丹的记忆之中。 | 以短题签承接牡丹文化地位，替代434×282低清原图。 |
| 2 | `c2-t030-readable-caption` | 春野静赏 / 花由苑囿入私园。 / 春游静赏，渐入寻常。 | 春野静赏；长策划正文退出画心。 |
| 3 | `c3-t026-readable-caption` | 凤穿牡丹 / 花入嫁衣，寄托良缘。 / 凤凰穿花，锦绣承愿。 | 凤穿牡丹与婚嫁锦绣寓意。 |
| 3 | `c3-t033-readable-caption` | 花结良缘 / 凤凰寄祥瑞，牡丹寓富贵。 / 同心相映，祈愿家业兴旺。 | 良缘、富贵与家业兴旺。 |
| 3 | `c3-t051-readable-caption` | 岁岁圆满 / 花盘与香囊，寄意人丁兴旺。 / 牡丹满开，愿家运昌隆。 | 人丁、家运与岁岁圆满。 |
| 3 | `c3-t052-readable-seal` | 吉庆 | 中性当代展陈文字印；不声称历史真印。 |
| 4 | `c4-t011-readable-caption` | 人花合一 / 牡丹与美人相映。 / 花意由此华贵倾城。 | 牡丹、美人与盛世文化意象。 |
| 4 | `c4-t048-readable-caption` | 千古兴衰 / 盛世寄富贵，故国留追忆。 / 花开花落，诗意代代流传。 | 盛世与故国追忆的卷尾收束。 |

## 来源与验证边界

原779实例加152新world合计931条世界清单。12个源FONT不由WebGL绘制，8个低清文字片和7个辅助片退役，余752个原实例仍可参与渲染；加152新world为904个可进入渲染的世界实例，实际在屏数量随视锥/驻留变化。原实例“保留”状态指身份与世界矩阵保留，其中32个实际换raster、2个修UV载体，不能误读为原像素全未变。

审校依据：[统一库存](layers-inventory.json)、[最终视觉裁决](visual-review.json)、[UV与纸基底专项](geometry-review-chapters-2-4.json)。交付依据：[生产资产](prepared-assets.json)、[实际逐实例动作](layer-implementation.json)、[实际动效绑定](runtime-bindings.json)。选中生成提示词/版本和暖纸alpha复核见相应pixel-repair/image-prompts报告；旧变体仍在raw归档但不计入34份selected。

图像资产的生成、技术alpha验证、静态构图验收和运行生命周期验收分别记录，不互相代替。最终原尺寸阅读节点/过渡截图在 [after](after/)，第三卷复核见 [visual-acceptance-chapter-3.json](visual-acceptance-chapter-3.json)，运行恢复/预算见 [after-motion/implementation.md](after-motion/implementation.md)。本说明只核对最终文件与实际配置，未重新抓GPU或改变canonical/runtime。
