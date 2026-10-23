# 第八轮正式原画验收

当前最终候选为art-candidate-8；完整实际入口[art-candidate-8-freeze.json](../art-renewal/art-candidate-8-freeze.json)，run 2026-10-23T03-21-16-365Z。831产品输入/911含驱动原生基准输入前后相同；22展示、59原生帧与243完整RGBA及四卷结构、37启卷、15续看、24像素全部重跑通过。最差MAE1.4877064043、p99=10、>20比例.0003915895、alpha0，原2/12/.005/0阈值未改。

标准两JSON按C8 run原字节提升，PNG指向真实独立捕获。C7整体因第三卷键盘初始焦点失败而不接受，C8只改两个可操作锚点选择器并更新字体语料指纹；C7原画通过仍为历史局部证据，旧标准入口原字节见[提升记录](../art-renewal/history/canonical-before-art-candidate-8/promotion-manifest.json)。C8采用同一只读packed源图cache，源原件和原生基准不变。

## 历史验收说明

# 第七轮正式原画验收

当前正式候选为 art-candidate-7，完整入口[art-candidate-7-freeze.json](../art-renewal/art-candidate-7-freeze.json)，run 2026-10-23T02-42-03-794Z。831产品输入/911含驱动原生基准输入前后稳定，22展示/59关键帧与243完整RGBA及四卷结构/37启卷/15续看/24像素均实际重跑通过。59帧最差MAE1.4877089763、p99=10、误差>20比例.0003915895、alpha0，未放宽2/12/.005/0阈值。

本页两份标准JSON按真实C7 run原字节提升，PNG仍指向独立run。旧C6标准JSON与原README保存在[提升前存档](../art-renewal/history/canonical-before-art-candidate-7/promotion-manifest.json)。首次C7因外部工作树原图缓存被清理而未开始像素比较；从SHA一致的四份只读packed原件恢复243源图后，同包完整重跑通过，见[恢复记录](../art-renewal/candidate7-original-cache-recovery.json)。没有重建、覆盖或降低运行图像。

## 历史说明（以下保留前版内容）

# 牡丹 2.0 原生保真证据

本目录只保存本轮用户指定的“牡丹2.0”四份文件对应证据，不覆盖 `reports/new-scrolls` 的历史结果。所有 `.blend` 输入只读，以 SHA256 绑定；报告中的源路径只保留可移植卷名。

## 当前艺术候选6证据

当前统一入口为[art-candidate-6-freeze.json](../art-renewal/art-candidate-6-freeze.json)，run `2026-10-23T01-00-12-268Z`，生产目录`tmp/art-candidate-6-dist`、入口`index-CTrqtaDU.js`。同一次完整运行22展示包、59原生帧及243张全分辨率原图/四卷结构、37启卷、15续看和24截图对照，全部通过；909项源码/资产/配置/驱动/原生参考输入前后相同，五代码文件与当前dist及展示包一致。

阈值仍为MAE≤2、p99≤12、超过20级的像素比例≤0.005、alpha差0。实测最差为1.4877089763、10、0.0003915895062、0。243原图解码RGBA全部相等，338网格/材质程序及源相机、形态、显隐和时钟证据继续独立核对。实际捕获和四张contact在该run的`fidelity/runs/2026-10-23T01-01-14-293Z/`，JSON IO重试为0。

顶层`validation-fidelity.json`、`browser-captures.json`现为该完整通过轮的原字节副本，截图路径保留真实独立run；先前入口原字节与提升记录在`history/canonical-before-art-candidate-6/`。C4的浏览器Back、C5的普通截图失败退出回归及相应真实失败均保留在[候选说明](../art-renewal/art-candidate-notes.md)，没有放宽测试以转为通过。当前结论仅覆盖本节范围；诗意、声音、连续演播与导览另有独立证据，不以像素合格替代艺术与交互审视。

## 历史艺术候选3证据

完整统一入口为 [art-candidate-3-freeze.json](../art-renewal/art-candidate-3-freeze.json)，run `2026-10-22T22-30-46-013Z`，生产目录 `tmp/art-candidate-3-dist`、入口 `index-C6ZfivTN.js`。同轮真实重跑59/59帧、243张原图无损RGBA和四卷结构，并与22展示包、37启卷、15+24续看绑定；908项输入前后完全相同。严格阈值未改，最差MAE1.4877064043、p99=10、超20比例0.0003915895、alpha差0。

该轮完整报告、原生截图和contact在 `reports/art-renewal/art-candidate-3-runs/2026-10-22T22-30-46-013Z/fidelity/`。本目录顶层 `validation-fidelity.json` 与 `browser-captures.json` 在完整通过后按原字节复制为当前入口；截图路径仍指向真实独立run。前两次固定JSON写入UNKNOWN失败与事后权限/占用诊断均保留，详见 [候选验收说明](../art-renewal/art-candidate-notes.md)。该阶段仍属于十小时创作任务的中间候选，不等于主任务结束。

## 历史阶段基线

下列结果对应 2026-10-23 04:18–04:25 冻结字节。主任务随后继续界面与叙事精修，故此处暂为历史阶段基线，不能冒充后续产品当前通过；原始主报告/浏览器记录已另存 `reports/art-renewal/fidelity-baseline-2026-10-23/`，等待下一次最终冻结重新验收。

2026-10-23 艺术迭代冻结后的生产构建 `index-Bor-xIou.js` 已完成正式原生对照：**59/59 关键帧通过**，243 张全分辨率原图解码 RGBA 逐字节相等，四卷结构与 338 个材质程序来源核验通过。此次实际运行目录为 `tmp/fidelity-art-dist`，完整绑定指纹为 `f57b438602b45b39bd868230319812da39b01cf7cbf0ff70c6d4fd2ecdfec65d`，含 268 个实际 HTTP 响应、独立内存重编和前后输入冻结检查。Chrome 实际版本为 156.0.8078.47；画心回归没有操作花笺导出，因此该懒加载 chunk 只作为显式 HTTP 字节探针记录，不声称其 UI 在这项测试中执行。

| 卷 | 对照帧 | 最差 RGB MAE /255 | 最差 p99 通道差 /255 |
| --- | ---: | ---: | ---: |
| 一 | 3/3 | 1.487709 | 10 |
| 二 | 3/3 | 0.776465 | 7 |
| 三 | 29/29 | 1.161172 | 8 |
| 四 | 24/24 | 0.775821 | 8 |

原严格阈值保持为 MAE≤2、p99≤12、通道差>20 的像素≤0.5%、Alpha 差为零。见 `validation-fidelity.json`、`browser-captures.json` 和 `runs/2026-10-22T20-18-07-131Z/` 内四张 contact。该目录的 UTC runId 对应北京时间 2026-10-23 04:18 开始；旧顶层 contact 和 `browser/` 为历史产物，没有覆盖。先前有效 JSON 已在 `history/<runId>/` 归档。

本节下述功能范围属于上轮交付历史；本次艺术迭代的界面、声音与启卷证据另见 `reports/art-renewal/`，不能把历史用户缩减范围当成本次停止工作指令，也不能以画心像素通过替代交互验收。

用户随后明确“不考虑移动端优化，赶紧结束合并到主线”，因此停止后续功能扩展，**功能报告是 `partial-user-scoped-stop`，不是整套通过**：已完成 19 项断言、62 个节点观测；第一/二/三卷桌面分别通过 15/7/9 节点、14/14/16 个排版段落及终帧/印章；第一/二卷真实源 FPS、暂停和额外运动移除通过。此前取得的手机证据保留：第一/二卷全项和第三卷 9 节点/31 段正文，第三卷手机终帧与源时钟未完成。第四卷功能遍历、最终全局字体审计、真实音频生命周期和 journey 门控未执行，不能从四卷像素通过推导这些功能已验收。详细范围见 `runtime/validation-runtime-peony2.json`。

暂停核验严格区分控制器与异步绘制：暂停瞬间记录滑块的已停止源帧，控制器前后必须完全不变；画布以原有 1e-7 帧门槛追上该目标，再与自身基准严格比较 400ms 不变。`pause-probe.json` 记录了最后在途画面约 16ms 后提交的实测，避免把绘制时序或跨路径约 1e-12 帧的浮点差误判为继续播放；产品未因此修改。

## 验收层次

- `validation-native.json`：重新用 Blender 打开四原件，对当前网页清单独立核验。检查每整数帧镜头及景深参数、所有可见对象的世界矩阵和显隐、几何/UV、25 个相对形态键的 Basis/目标和全部帧权重，并以 Blender evaluated 几何核对关键变形帧。相同保持段允许删除冗余中间键，非保持帧不能遗漏。
- `chapter-N-native.json`：源节点图、材质动画和 driver 的实际整数帧参数、灯光/世界/合成器、坐标对象矩阵、原生渲染及独立核验的详细数据。`*-capture.json` 是额外原生基准采集，不等于网页验收通过。
- `validation-fidelity.json`：复核当前清单和原生证据的散列、四份可编辑文件与输入原件逐字节相等、全部实际原图集合、243 张网页纹理解码 RGBA 与全分辨率原图逐字节相等、材质可达动画参数和程序字段，并实际对照网页关键帧。单独的结构命令写 `validation-structural.json`；其 `structural-pass` 明确表示视觉仍未验收，不会覆盖完整画面比较的结论。
- `renders/`：原生材质、灯光、景深和合成器保持原样，输出分辨率为源的 50%。包含第一卷 2540/2568/2596 帧、第二卷 350/656/955 帧、第三卷 1627 帧和水墨/淡入关键进度、第四卷 1407/1575 帧和六组出场效果关键进度。逐张来源及散列见各章原生报告。
- `ablations/`：分别关闭源灯光、景深、合成器的实际渲染，用于判断这些源设置是否影响已选帧。第一卷另包含 World Background Strength=0 的对照。关闭 World 后山岩和火焰主体明显变暗，因此 World 不能只处理为直见背景。
- `runs/<runId>/browser/` 与 `browser-captures.json`：完整模式生成的真实浏览器画心截图。临时样式只用于验收，按源相机比例和原生 PNG 尺寸输出，去除 HTML 题跋/装裱；通过当前整数源帧诊断和资源就绪诊断绑定画面。旧 `browser/` 保留历史图像，新轮不会覆盖它。
- 完整捕获绑定所有当前源码/构建配置、实际 `dist` 的 HTML/JS/CSS、四卷清单/材质/渲染设置及所有图片和字段的 SHA256，并核对实际 HTTP 响应字节。捕获前以 Vite 内存构建逐字节复核生产构建，前后重新核对输入；任何后续代码或资产改变都会使旧捕获失效。`--dev` 不能用于正式像素验收。
- 所有 338 个材质程序的 `surfaceRenderMethod` 必须与独立原生材质的 `DITHERED` / `BLENDED` 一致；材质是否带 Alpha 不能替代该源属性。独立明细另见 `source-surface-render-methods.json`。
- `native-glare.json`：第一卷原生 AOV → Glare 的 **Glare** 输出乘源 RGBA ADD 的 float Factor（输入 0，约 0.32），只离线烘焙后期光晕分量。全 3024 帧实际进度证明变化窗口 2541–2595；全分辨率场景线性 EXR 检查后，61 个帧描述中 35 个非零 float16 字段共 67,455,094 字节，其余为零哨兵。三帧独立重开原源，以“完整合成减直出 Image”核对字段，最大线性差 0.0001220703125，符合半浮点量化；输入源未保存且 SHA 不变。
- `diagnostic-opaque/`：修复高频纸噪声及 Film 采样之前的 59 帧失败诊断，缺少新完整构建绑定，不能作为最终通过证据。
- `diagnostic-transport/`：第二轮 59 帧的诊断归档，像素为 58/59 达标；唯一超线为第一卷 2596 帧 RGB MAE 2.229806。该轮旧工具误将 HTTP 自动解码的 gzip body 与磁盘压缩文件直接比较，绑定失败，不能作为正式通过证据。修复后用 `--check-binding --http-probe` 独立核对压缩文件 SHA、HTTP Content-Encoding 和实际解码 body SHA；正式验收需重新捕获。
- `diagnostic-before-rt-budget/`：恢复源透明渲染分阶段及阴影后，59/59 帧全部达到原严格阈值；但捕获结束时产品加入 RT 内存预算，前后输入绑定检测正确拒绝了这轮结果，因此仍只作诊断，不能证明后续预算版本。

原图集合按实际可见几何使用的原字节去重，分别为 **99 / 35 / 66 / 43**；四卷对应几何对象分别为 **149 / 58 / 79 / 52**。源文件可能包含重复或未使用的图像数据块，不能将其数量当成独立原图数量。

时间字段区分滑块从首帧到末帧的时长 `(end-start)/fps` 与完整影片包含首尾帧的时长 `(end-start+1)/fps`。网页使用前者作为端点时钟，原生报告同时记录两种值。

## 复现

先采原生基准（只采集，未验收网页）：

```powershell
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/validate-peony2-native.py -- --source-root <牡丹2.0目录> --capture-only --render-keyframes --render-ablations
```

网页资源生成完成后，重新打开源进行独立核验：

```powershell
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/validate-peony2-native.py -- --source-root <牡丹2.0目录>
node scripts/validate-peony2-fidelity.mjs --structural-only
```

完成当前生产构建后，对全部原生关键帧采集真实网页像素并比较：

```powershell
node scripts/validate-peony2-fidelity.mjs --capture-browser
```

可用 `--dist-dir <生产构建目录>` 验证隔离构建，`--report-dir <证据目录>` 输出预检；未传时继续使用 `dist` 与本目录。每轮截图/contact 使用独立 runId，旧 JSON 自动归档。Python 子进程显式以 UTF-8 读取 Node 的 JSON，避免 Windows GBK 损坏中文项目路径；真实失败与修复预检保存在 `reports/art-renewal/fidelity-adapter-preflight/`。

独立检查当前生产构建与源码/资产绑定，以及保留原有功能标准的 2.0 版浏览器回归：

```powershell
node scripts/validate-peony2-fidelity.mjs --check-binding
node scripts/validate-peony2-runtime.mjs
node scripts/validate-peony2-runtime.mjs --journey
```

功能适配器保留历史的字体、全文、边界、音频、结束、进入、重试和取消断言，新增真实源帧率播放/暂停与额外运动移除核验；输出分别写入本目录 `runtime/` 和 `journey/`，不改写旧报告。

浏览器可通过 `MDGS_PLAYWRIGHT_MODULE` / `MDGS_TEST_BROWSER` / `MDGS_PREVIEW_URL` 指定；Pillow Python 可通过 `MDGS_PYTHON` 指定。原图缓存为忽略目录 `.asset-cache/new-scrolls/peony-2.0-2026-10-23/chapter-N/<id>.source`，原生核验已将其 SHA256 绑定到实际输入原字节。没有原源或缓存时不能声称完成原生/逐像素纹理核验。

完整画面比较保留小幅栅格容差：RGB 平均绝对差不超过 2/255，99% 像素的最大通道差不超过 12/255，通道差超过 20/255 的像素不超过 0.5%，Alpha 必须相同。该界限不能用来替换源效果或忽略构图、灯光、运动差异；报告保留每帧实际数值和失败状态。
