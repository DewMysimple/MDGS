# 牡丹 2.0 原生保真证据

本目录只保存本轮用户指定的“牡丹2.0”四份文件对应证据，不覆盖 `reports/new-scrolls` 的历史结果。所有 `.blend` 输入只读，以 SHA256 绑定；报告中的源路径只保留可移植卷名。

## 当前结果

当前生产构建 `index-CArimptk.js` 已完成正式原生对照：**59/59 关键帧通过**，243 张全分辨率原图解码 RGBA 逐字节相等，四卷结构与 338 个材质程序来源核验通过。完整绑定指纹为 `c144d633bb7f4e8b6a0ea75aefe824af60845a732c769d525fba9da3553fca28`，含 270 个实际 HTTP 响应、独立内存重编和前后输入冻结检查。

| 卷 | 对照帧 | 最差 RGB MAE /255 | 最差 p99 通道差 /255 |
| --- | ---: | ---: | ---: |
| 一 | 3/3 | 1.487706 | 10 |
| 二 | 3/3 | 0.776465 | 7 |
| 三 | 29/29 | 1.159673 | 8 |
| 四 | 24/24 | 0.775817 | 8 |

原严格阈值保持为 MAE≤2、p99≤12、通道差>20 的像素≤0.5%、Alpha 差为零。见 `validation-fidelity.json`、`browser-captures.json` 和四张 `contact-chapter-N.jpg`。

用户随后明确“不考虑移动端优化，赶紧结束合并到主线”，因此停止后续功能扩展，**功能报告是 `partial-user-scoped-stop`，不是整套通过**：已完成 19 项断言、62 个节点观测；第一/二/三卷桌面分别通过 15/7/9 节点、14/14/16 个排版段落及终帧/印章；第一/二卷真实源 FPS、暂停和额外运动移除通过。此前取得的手机证据保留：第一/二卷全项和第三卷 9 节点/31 段正文，第三卷手机终帧与源时钟未完成。第四卷功能遍历、最终全局字体审计、真实音频生命周期和 journey 门控未执行，不能从四卷像素通过推导这些功能已验收。详细范围见 `runtime/validation-runtime-peony2.json`。

暂停核验严格区分控制器与异步绘制：暂停瞬间记录滑块的已停止源帧，控制器前后必须完全不变；画布以原有 1e-7 帧门槛追上该目标，再与自身基准严格比较 400ms 不变。`pause-probe.json` 记录了最后在途画面约 16ms 后提交的实测，避免把绘制时序或跨路径约 1e-12 帧的浮点差误判为继续播放；产品未因此修改。

## 验收层次

- `validation-native.json`：重新用 Blender 打开四原件，对当前网页清单独立核验。检查每整数帧镜头及景深参数、所有可见对象的世界矩阵和显隐、几何/UV、25 个相对形态键的 Basis/目标和全部帧权重，并以 Blender evaluated 几何核对关键变形帧。相同保持段允许删除冗余中间键，非保持帧不能遗漏。
- `chapter-N-native.json`：源节点图、材质动画和 driver 的实际整数帧参数、灯光/世界/合成器、坐标对象矩阵、原生渲染及独立核验的详细数据。`*-capture.json` 是额外原生基准采集，不等于网页验收通过。
- `validation-fidelity.json`：复核当前清单和原生证据的散列、四份可编辑文件与输入原件逐字节相等、全部实际原图集合、243 张网页纹理解码 RGBA 与全分辨率原图逐字节相等、材质可达动画参数和程序字段，并实际对照网页关键帧。单独的结构命令写 `validation-structural.json`；其 `structural-pass` 明确表示视觉仍未验收，不会覆盖完整画面比较的结论。
- `renders/`：原生材质、灯光、景深和合成器保持原样，输出分辨率为源的 50%。包含第一卷 2540/2568/2596 帧、第二卷 350/656/955 帧、第三卷 1627 帧和水墨/淡入关键进度、第四卷 1407/1575 帧和六组出场效果关键进度。逐张来源及散列见各章原生报告。
- `ablations/`：分别关闭源灯光、景深、合成器的实际渲染，用于判断这些源设置是否影响已选帧。第一卷另包含 World Background Strength=0 的对照。关闭 World 后山岩和火焰主体明显变暗，因此 World 不能只处理为直见背景。
- `browser/` 与 `browser-captures.json`：完整模式生成的真实浏览器画心截图。临时样式只用于验收，按源相机比例和原生 PNG 尺寸输出，去除 HTML 题跋/装裱；通过当前整数源帧诊断和资源就绪诊断绑定画面。
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

独立检查当前生产构建与源码/资产绑定，以及保留原有功能标准的 2.0 版浏览器回归：

```powershell
node scripts/validate-peony2-fidelity.mjs --check-binding
node scripts/validate-peony2-runtime.mjs
node scripts/validate-peony2-runtime.mjs --journey
```

功能适配器保留历史的字体、全文、边界、音频、结束、进入、重试和取消断言，新增真实源帧率播放/暂停与额外运动移除核验；输出分别写入本目录 `runtime/` 和 `journey/`，不改写旧报告。

浏览器可通过 `MDGS_PLAYWRIGHT_MODULE` / `MDGS_TEST_BROWSER` / `MDGS_PREVIEW_URL` 指定；Pillow Python 可通过 `MDGS_PYTHON` 指定。原图缓存为忽略目录 `.asset-cache/new-scrolls/peony-2.0-2026-10-23/chapter-N/<id>.source`，原生核验已将其 SHA256 绑定到实际输入原字节。没有原源或缓存时不能声称完成原生/逐像素纹理核验。

完整画面比较保留小幅栅格容差：RGB 平均绝对差不超过 2/255，99% 像素的最大通道差不超过 12/255，通道差超过 20/255 的像素不超过 0.5%，Alpha 必须相同。该界限不能用来替换源效果或忽略构图、灯光、运动差异；报告保留每帧实际数值和失败状态。
