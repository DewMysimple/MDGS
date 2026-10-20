# 四卷空白补设计与首卷跳层整改

本轮四卷静态构图、网页交互/响应式与四份新Blender副本均已验收通过。完整范围见 [requirements.md](requirements.md)。

当前canonical：`dec52de0566ca29fcae9a767cec8f7970bd3dc98a226ac8a6ea54ebf654d8fa8`。本轮新增22项独立透明资产、45个世界图层，运行WebP共5,969,360字节。现共197世界层、原8文字层；上一轮152层是冻结基线，不能冒充本轮完成证据。原四源Blender未覆盖。

## 四卷交付

| 章节 | 叙事补充 | 新资产/层 | 逐图审查 | 派生Blender |
|---|---|---:|---|---|
| 神都花事 | 山寺苗圃、皇家花径、宫前石坪、雪庭宽坡，书案/亭阶接地 | 4/14 | [57张通过](expanded-v6/visual-review-chapter-1.md) | [第一卷](../../artwork/blender-blank-design/chapter-1_reconstructed.blend) |
| 花入万家 | 私园水岸、春径、书斋庭院，解除纸地末端硬边 | 3/7 | [25张通过](expanded-v3/visual-review-chapter-2.md) | [第二卷](../../artwork/blender-blank-design/chapter-2_reconstructed.blend) |
| 锦绣花意 | 民俗院坪、锦架织物、吉庆花器盒器、巷路灯彩 | 5/12 | [33张通过](expanded-v3/visual-review-chapter-3.md) | [第三卷](../../artwork/blender-blank-design/chapter-3_reconstructed.blend) |
| 国色倾城 | 宫苑水岸阶台，转为空亭、疏水、诗卷孤灯 | 10/12 | [33张通过](pilot-v4/visual-review.md) | [第四卷](../../artwork/blender-blank-design/chapter-4_reconstructed.blend) |

同相机进度实际网页对照：[第一卷](final/chapter-1-comparison.jpg)、[第二卷](final/chapter-2-comparison.jpg)、[第三卷](final/chapter-3-comparison.jpg)、[第四卷](final/chapter-4-comparison.jpg)。仅标签和缩放，无场景修饰；[输入图片与哈希](final/comparison-evidence.json)。

148张接受视图包含40停驻、36中点、72四分点。各章快照内容与最终canonical严格等价，截图保留各自拍摄时的完整父清单哈希，不混用不同批次。[验收来源](final/acceptance-sources.json)。

## 审查与最终分类

先冻结76个原停驻/中点视图，再审190区域：92保留留白、96叙事/衔接补充、2已有层修复。原坐标、问题类型、A–F内容类型、叙事与UI影响见 [第一/二卷](audit-chapters-1-2.md)、[第三/四卷](audit-chapters-3-4.md) 及同名JSON；[冻结基线](before/baseline.json) 保留原图哈希。

初审96待补区域均有规划映射。终审将第一卷gap1上部天空改判为气口，最终190区域主分类为 **93留白保留、95叙事补充、2已有层修复**；第四卷另列6处局部混合事实，不能把整区说成全部填满或完全未动。[最终逐区表](final/region-implementation.md)、[JSON](final/region-implementation.json)、[CSV](final/region-implementation.csv) 逐区保留原裁决、最终理由、局部坐标、实际对象、前后截图与哈希。[22资产/45对象/4副本总清单](final/asset-and-object-delivery.json)。保留主要为题字/诗文、云气、人物侧面呼吸、边缘/UI安全区和盛衰停顿、尾声；新内容主要承接低位岸线/地台及主体之间。

已有层修复：第一卷由相机横移导致的透明大片中心深度交叉，改用源相机推导的稳定视轴排序，不改源矩阵/几何/路线。[完整诊断](layer-sorting.md)、[终版1066帧/0翻转补验](final/sorting-focus.md)。第二卷确认实体纸地末端及色差导致硬矩形，网页派生退役该对象，Blender使用独立暖纸World、保留源World数据，[实际显隐诊断](background-and-c2-rectangle.md)。

第三卷另退役不透明水脉、276个TR树冠/疏林/水波占位及6个山形辅助，保留水岸留金与淡云金线，[真实同帧显隐](third-occlusion/README.md) 证明它们原先裁断花器/布面。第四卷派生隐藏两团游离小花。源文件中对象、几何和层级均保留。

## Blender与资产

四份副本均实际保存、保存进程重开、独立新进程重开验证。四源哈希、原世界矩阵、相机采样、动画、marker、父子/集合层级不变；几何例外只沿用上一轮明确修复载体，没有扩大。

| 卷 | 内嵌图像/字体 | 实际Cycles PNG与目视 |
|---|---:|---|
| 一 | 109/1 | [5帧](blender/preview-chapter-1/preview-report.md) |
| 二 | 39/1 | [3帧含卷尾](blender/preview-chapter-2/visual-review.md) |
| 三 | 76/1 | [3帧](blender/preview-chapter-3/preview-report.md) |
| 四 | 59/1 | [3帧](blender/preview/preview-report.md) |

每章 `blender/blender-reconstruction-chapter-N.json`、`blender/blender-reopen-validation-chapter-N.json` 记录实际哈希、打包与不变项。第二卷World实际背景距网页纸色不超过1个RGB码值，无黑底/旧硬边；其他卷保留源竖纸幕，仅派生隐藏会截断图卡的横向地面。Blender源纸材/文字与网页机制不同，不宣称像素相同。

原图在 `artwork/blank-design/raw/`，生产PNG在 `artwork/blank-design/chapter-N/`，运行WebP在 `public/assets/blank-design/chapter-N/`。仅裁全透明外行，保留非零alpha像素，加每侧12%安全边，不拉伸或镜像。[三套尺寸/哈希/alpha](prepared-assets.json)。独立内置imagegen提示词及纸底QA：[C1](asset-generation-chapter-1.json)、[C2](asset-generation-chapter-2.json)、[C3](asset-generation-chapter-3.json)、[C4前段](asset-generation-front.json)、[后段](asset-generation-tail.json)、[斜阶](asset-generation-steps.json)。

## 样板与验证

严格先审四卷，再完成第四卷样板：33网页静帧、真实逐层像素、三窗宽62图、原路线双向/交互、新Blender保存/独立重开/实际渲染，全部通过并展示后才扩展其余三卷。[样板gate](pilot-v4/gate.json)。初版纸幕遮挡、第二版浮物/重复、第一卷中间批浮雪条等失败均保留。

- [45层真实帧缓冲显隐](final/validation-pixels.json)：每层实际draw、纹理已载且像素贡献非零；[矩阵/自然比例/纸幕距离](validation-placement.json) 另验。
- `npm run build`、`npm test`、`npm run validate:assets` 通过，资源0错误/0警告。
- [启动冲突](final/validation-startup.json)：从无关临时目录启动3开发/2预览，独立端口、指定占用回退、真实URL/资源、5自有监听关闭后才通过。测试器冷扫描取消竞态已修，原exit13保留。
- [子目录构建运行](../validation-portable-subpath.json)：四卷197层/8文字层、装裱资源及滚轮/拖拽/键盘/分镜/自动展卷/轻动/全屏/抽屉通过，0页面错误/404/横向溢出。
- [统一宽/中/窄运行](final/validation-runtime.md)：1920/960/360三窗宽102张稳定截图、12段真实双向wheel、9组控件与四章切换通过；0页面/控制台/资源/请求错误与横向溢出。45新层不进入轻动预算，矩阵保持静态。119张运行PNG哈希已核对。窄360仅第二卷次要右下收束草径位于原相机画心外，实际1001点投影与浏览器证明是裁视；主线和其它新层正常绘制，不移动原世界锚点来挤入窄窗。C4章节严格等价样板，复用其62图完整深验并加终版smoke。Chromium override通知问题用真实viewport生命周期刷新后自然投递，产品未改；所有失败与恢复路径/SHA保留。

正常双击根目录 `runStart.cmd` 或 `npm run dev`。端口自动分配，路径从工程/参数/环境解析，画心/UI随窗口自适应；运行网页无需Blender/Python。测试需Playwright/Chromium，离线Blender从调用环境解析，本机安装路径不写入运行代码。

```text
node scripts/build-blank-design.mjs
node scripts/validate-blank-placement.mjs
node scripts/validate-blank-pixels.mjs --expected-hash=<当前完整SHA> --batch=final
node scripts/validate-blank-runtime.mjs --expected-hash=<当前完整SHA>
python scripts/report-blank-design.py
```

勿用上一轮 `build-reconstruction.mjs` 覆盖本轮清单。未提交、推送、部署或上传用户source。已验证本机Windows/Chromium和Blender5.0；较新源版本提示在日志保留，核心不变项实际验证。其他浏览器、实体移动设备及正式部署未核实。
