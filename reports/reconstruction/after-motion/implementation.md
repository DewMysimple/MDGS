# 四卷网页轻动扩展

记录日期：2026-10-20。首卷完整样板已展示后，按授权扩展二至四卷。本页记录动效代码与本轮独立证据；首卷历史样板在 `../pilot-motion/` 保留。

本页保留首次扩展与首轮资产定向批次的历史预算，最终修订以末尾“最终静态修订与恢复一致性”及canonical `290e8657…2ef115` 为准；旧27项与 `3aa8df9d…d5c7bf` 不代表最终版本。

## 实现范围

`src/data/motionProfiles.ts` 按完整网格名明确绑定四卷，共71/21/51/45项。人物、建筑、桌案、铜镜、花瓶与器物纹样保持原矩阵；未使用字符串泛匹配扩散动作。第二卷只微摆独立牡丹花枝；第三卷微摆独立锦带、单灯与花枝，已有水线/云线只做微透明度变化；第四卷从真实第五个阅读节点“繁华落幕”进入连续盛衰。

`MotionDirector.deriveUvBasis` 从各图层实际局部positions和UV拟合有符号U/V与法向，不用世界朝向猜局部平面。支持第一卷XZ、第二卷斜UV、第三/四卷YZ、独立XY及裁区图集。支点由UV坐标定位，每帧从源矩阵/源动画采样矩阵叠加增量，避免累积漂移。管状CURVE不套图片平面，仅以1.5%–2.5%的微量透明度呼吸，关闭与释放恢复材质标志。

环境时钟独立于游观进度，绘制预算约30Hz；每卷最多6个视锥内动作，优先少数单瓣与1层新薄雾。独立单瓣以淡入/淡出包络循环下落，不带动整张合并图。切章释放所有资源与监听；减少动态偏好、关闭轻动、后台及上下文丢失停止环境时钟。窄窗视锥内没有任何已审独立动作时，时钟与ambient RAF同样停止，resize/游观/纹理完成可重新唤醒，不挪动原世界锚点凑动作。新增资产共用原有4并发队列、视锥预取和LRU机制。

## 第四卷盛衰

读取prepared manifest真实stops，第5景progress约0.5004329354开始。通过连续smoothstep插值并积分时钟，拖动进度不重写已有相位。

| 真实阅读节点 | 时钟速度 | 单瓣密度权重 | 云量权重 |
| --- | --- | --- | --- |
| 第5景繁华落幕 | 1 | 1 | 1 |
| 第6景 | .70 | .62 | .72 |
| 第7景 | .52 | .38 | .52 |
| 第8景 | .40 | .18 | .34 |
| 第9景 | .32 | .08 | .22 |

第二片花瓣随密度先渐隐，尾声最多1瓣、总动作最多3项；旧层动作名额随进度从3连续收束到1，保留水线与留白，静止源画面不随名额消失。减少动态/关闭时仍维持当前叙事位置的疏云状态，避免尾声突然恢复浓云。

## 首轮扩展实测（历史阶段）

四卷canonical已激活，以下命令均实际通过。浏览器为本机Chromium、1440×900窗口；各截图画心随布局自适应，不是固定画布尺寸。

- `npm run build`：TypeScript与生产构建通过。
- `node scripts/validate-motion.mjs`：首批27项检查通过，真实188个绑定逐项UV基、支点/法向、无漂移、源基底、曲线仅透明度、全UV补全/错误拒绝、第四卷301点连续单调包络与尾声上限。该脚本与同名 `validation-motion-unit.json` 后续已扩为末节所述最终29项；`motion-local-planes.json`也按最终配置刷新。
- `node scripts/validate-all-motion.mjs`：四卷首尾两端预算、实际斜UV花枝/独立单灯、开关与reduced/hidden、切章单canvas资源、四卷各一次真实纹理失败显式恢复、第四卷真实WEBGL_lose_context恢复全部通过，零pageerror。结果见 `validation-all-motion-browser.json`。
- `python scripts/measure-all-motion.py`：四卷停留时均出现实际局部像素变化；关闭与reduced的两帧逐像素相同。抽样柱/石栏、文人桌案/亭梁、器物盒/寺梁、诗人/石桌共8个结构区域的可见变化均为0；第三卷独立单灯区域367像素RGB变化>5。结果见 `frame-differences.json`、`chapter-3-independent-lamp-detail.jpg`。
- `node scripts/validate-motion-refresh.mjs`：最终C2-T004/T029 v2与题签比例重建后，12个定向样本通过：1440×900的C2第1/6/7景及C4末景，360×800四卷首尾。含最终canonical与两项新图SHA256；运行前后canonical一致、零pageerror和页面横向溢出。第三/四卷窄窗首景active0时实测0重绘、RAF与时钟冻结；真实resize到宽窗恢复5/4个动作，缩回后再冻结，原canvas与progress保持。见 `validation-motion-refresh.json`。

| 卷 | 首景/卷尾画面重绘次数每秒 | 首景纹理MiB / 卷尾MiB | 卷尾动作数 |
| --- | --- | --- | --- |
| 1 | 30.36 / 29.84 | 193.74 / 163.63 | 5 |
| 2 | 30.29 / 30.54 | 155.91 / 158.35 | 4 |
| 3 | 30.33 / 30.46 | 128.36 / 155.06 | 6 |
| 4 | 29.92 / 30.31 | 79.32 / 159.94 | 3，含1瓣 |

纹理请求峰值为4。第四卷尾实际speed=.32、petalDensity=.08、cloudDensity=.22，恢复/暂停不改变阅读进度。历史 `fourth-sheng-shuai.webm`及同名JSON记录第三景盛美和第八景追忆的真实停留：相隔3.5秒的局部变化由54713像素降到39像素（RGB阈值5）；两处构图和花枝大小不同，不能把该像素比当作线性动画速度比。视觉对比放大图在本目录 `fourth-flourishing-detail-*` 与 `fourth-afterglow-detail-*`。这些早期图像含最终静态退役/裁边前构图，保留为历史动效证据；最终预览改用末节 `final-fourth-motion.webm`。

首轮资产定向批次（历史阶段）：桌面C2首景/第6景/末景实测30.37/29.56/30.67次重绘每秒，估算纹理155.91/186.35/158.35MiB；C4末景28.17次/秒、3动作含1瓣。窄窗有可见动作时27.25–31.44次/秒；第三/四卷首景没有独立动作进入狭窄视锥，按需静止。纹理估算受游观历史与LRU驻留影响，不等于显卡实测峰值。当时候选canonical SHA256为 `3aa8df9dab7955adcd1bb20df0339148421d50564ae430f360d9d673d7d5c7bf`，不是最终hash。

定向截图的题签位置仍保持作者世界锚位；第三卷窄窗题签部分在authored frustum外而按约定隐藏，正文保留阅读抽屉，不能把预算通过当作所有窄窗题签均显示。该阶段曾把C2第6景T030屋梁对比度交整体主审，最终题签和40节点/36间隙静态图、Blender副本验收由主任务记录。

## 最终静态修订与恢复一致性（当前）

最终canonical SHA256为 `290e865749ec5a27c48c1c6b7f3dda55bcd809e0d9610ab98d791fd5042ef115`。动效profiles未改变；静态修订包括第二卷单一连续水岸explicit-corners载体与两片重复aux退休、第三卷新街景/独立carrier补全、第四卷保留主山水裁区并退休重复helper。

`node scripts/validate-motion.mjs` 实际通过最终29项，原27项保留。新增实际 `applyArtDirection` dispatch检查四角/正向完整UV、有限非退化平行平面、只扩透明安全边、不再二次aspect补偿；原manifest数组、几何positions/UV/indices与原矩阵保持，两个旧水岸副本明确隐藏；坏角数、NaN、退化和非平行输入由生产分支拒绝。结果见 `validation-motion-unit.json` 的explicitCarrierReconstruction，不把手工构造预期当作生产路径通过。

`node scripts/validate-motion-corners.mjs` 只补第二卷节点4/5、第四卷gap5/节点8，四景正常、零页面错误；第8景从reduce恢复轻动仍为speed=.4、最多1瓣和3动作。真实WEBGL_lose_context恢复保持原canvas、游观progress、冻结时钟、所有材质/矩阵/采样设置，并等待纹理与预取刷新完成。最新图为 `corners-chapter-*`，运行数据为 `validation-motion-corners.json`；没有反复全量GPU测试。

这轮发现并修复了响应式小数尺寸下的context恢复误差：画心宽1386.75 CSS像素，正常setSize将GL viewport取整为1387，而恢复默认viewport跟随整数drawing buffer为1386，导致大量纹理采样发生约1像素差，且Three重建时重置了clearColor。`SceneRenderer.onContextRestored`现重新应用当前自适应width/height的viewport、原clearColor及outputColorSpace，不固定窗口尺寸。诊断只在浏览器测试响应中注入只读data属性，产品没有调试全局或面板。

`python scripts/measure-motion-corners.py` 实测修复后约66万像素中仅15个像素有1个RGB码值差，>1及>5的变化像素均为0；`exactlyIdentical:false` 如实记录，未宣称逐位相同。检查限值为最大1个8位RGB码值且变化比例<0.01%；实际比例约0.0023%。相机/投影/viewport/clear state和材质/采样设置均完全一致。证据见 `motion-corners-pixels.json`，此前约13万像素的可见差异已消除。

最终预览为 `final-fourth-motion.webm` 与同名JSON：只保留当前canonical第3/8景的停留，剪去加载与首卷前导，使用未注入测试诊断的生产场景代码；进度保持、时间独立前进、尾声最多1瓣/3动作。旧pilot与早期四卷视频均未覆盖。

复录命令为 `node scripts/capture-final-fourth-motion.mjs`，本次成片9.65秒。FFmpeg由PATH或可选 `MDGS_FFMPEG` 提供；浏览器库/可执行文件由既有测试环境参数提供，脚本不含固定本机路径或端口，普通网页构建不依赖这些录制工具。

逐层实施结果由 `node scripts/report-reconstruction-status.mjs` 生成在上级目录 `layer-implementation.json/.csv` 与 `runtime-bindings.json`：931条世界库存实例=779原实例+152新层，另列8 HTML题签；188个真实profile绑定含应用修订后实际UV basis与叙事用途。原实例752保留身份、7aux退役、8低清题签退役、12FONT跳过。像素按实例计为394保留原图、32换图、15退役、338非栅格，不是独立纹理数。几何carrier修复、墨边与独立轻动分别列出，保留审校原结论并明确推荐与实际实施的区别；原库存与总审校表未修改。

浏览器运行库/可选可执行文件由环境提供；开发服务由Vite自动端口分配，工程未加入固定本机路径或端口。纹理字节为CPU估算、LRU目标不是可见资源硬上限，本机Chromium结果不能代表所有显卡与浏览器。
