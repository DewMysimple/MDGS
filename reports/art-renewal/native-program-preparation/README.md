# 原生材质程序的加载期准备

原作首访的长停顿主要落在程序首次使用时的同步信息查询。采用的改动在真实加载期提前链接相同材质变体，并用 KHR 非阻塞查询等待；原画、字段、相机、作者时钟、后期与采样上限均保持。程序完成不是链接正确的证明，原 `checkShaderErrors` 和实际首次绘制错误门控始终保留。

当前源码入口是 [ShaderWarmup.ts](../../../src/scene/ShaderWarmup.ts)、[SceneRenderer.ts](../../../src/scene/SceneRenderer.ts)。App 经 ScrollViewport 显式调用 `cancelPreparation()`；owner 取消对该 renderer 生命周期持久有效，覆盖 helper 尚未创建、纹理晚到和 context 恢复。源码固定预期 map 特征，没有实验 URL 分支或 DOM phase observer。

## 正式 C7 专项验收（后续追加）

最新C7的[独立范围与证据](../return-order-candidate-7/README.md)为：返回10/10、原硬件16/16，加一项真实部分纹理上传时GPU丢失/恢复的独立通过。首次合并17项报告因新增项读取过早的诊断前提失败，原样保留；其原16通过子集没有改写成整轮通过，修订后只重跑新增原生专项。831份产品输入、744份包及三包代码绑定同一C7冻结指纹。准确的已消费sampler前缀恢复由真实生产方法[CPU10回归](../texture-streaming-preparation/cpu-validation-at-adoption.json)断言，黑盒GPU专项只证明真实部分准备中断与恢复。正常路径的[同布局纹理A/B](../texture-streaming-preparation/README.md)与六组原画完全一致像素另存，不把短窗rAF改进当显示FPS保证。下方C6/C4文字均为当时历史记录。

## 正式 C6 专项验收

**当前最新实际包专项结果：C6 返回 10/10、原生准备硬件 16/16，均 0 errors。** 权威入口是[范围说明](../return-order-final/README.md)、[紧凑索引](../return-order-final/summary.json)、[逐文件归档清单](../return-order-final/manifest.json)；原始证据分别为[返回十组](../return-order-final/focused/validation.json)和[硬件十六组](../return-order-final/hardware/validation.json)。两轮绑定同一 C6 构建指纹，829 份完整源码/公共资源/配置输入与 744 个独立候选包文件前后不变；硬件轮同时核对 main dist、展示包五个代码文件和展示库存。整体 C6 根验收此时仍在运行，这 26 个专项组不能替代其保真、UI、声音与叙事总链。

十组真实覆盖普通/减弱动效的 0.65 与 1 进度 Back、Forward、session 深链刷新，按钮返回的实际编码结果在 Back 后才送达，以及正常 VIEWER 按钮截图回调明确注入 null 时即便已有匹配缓存也进入暖纸。成功路径要求非空真实预览与新编码，取得图像后才持久取消原画；加载期取消、helper 晚建和纹理晚到仍保持零提交。十六组保留原全部断言与真实 native hidden、GPU loss、GLSL 错误边界，没有放宽门槛。

[C4 的 Back 失败](../history/candidate-4-return-regression/manifest.json)与[C5 通过子集的边界说明](../history/candidate-5-return-order-subsets/README.md)保留。C5 的 8+16 子集通过不掩盖其根 snapshot 第12组正常按钮失败合同的真实失败。归档 driver 保留当时原相对路径用于溯源，应从清单所列 tmp 原位置执行，不能直接把归档副本当新的运行入口。

以下 C4 段落保留当时记录，其“当前”措辞只适用于彼时；没有将旧报告改写成 C6 或把历史原型性能冒充 C6 性能。

## 正式 C4 验收

[C4 构建指纹](../art-candidate-4-build.json) 是源/包身份记录，不能单独当作功能通过。正式驱动 [validate-hardware.cjs](validate-hardware.cjs) 只服务和检查已冻结包，不构建、不虚拟替换源码。最新结果写入 [hardware-latest.json](hardware-latest.json)，每次唯一目录保留完整原报告、driver 和失败现场；报告未生成或未通过时不得把历史预验当正式通过。

**当前有效正式结果：C4 真实 16/16 通过、0 errors。** [唯一原报告](hardware-runs/2026-10-23T00-26-44-109Z/validation.json) 与 hardware-latest 同一轮；829 份实际 src/public/config 输入、744 个候选包文件、实际 helper 与验收 driver 前后 SHA 一致，主 dist/展示包的 5 个代码文件及展示库存匹配 C4 冻结指纹。两个晚到 owner 用例都实际观察到离开后才创建的 helper 已 cancelled、batches0、原画提交0。

这轮是功能与生命周期验收，不是 C4 性能基准。下文 v1 的 ABBA 数据仅说明当时同源隔离原型的观测，不能冒充清理实验分支、显式 owner 接线、字库/UI 收束后的 C4 性能。C4 的正式性能结论需要另行约定安静窗口和实际采样。

正式范围为原 14 组加两个 late-owner 场景，共 16 组：首帧前与已备薄卷取消，真实 GPU loss/restore，真实非法 GLSL 拦截和重建重试，无 KHR 退回原生路径，真实 native hidden 暂停/恢复，30 秒有界退回，慢纹理取消与 503 重试，四卷首帧，reduce/resize；另分别延迟 scene.json 和 source-materials.json，在 helper 尚未创建时离开，随后释放响应，检查晚建 helper 仍取消且无原画提交。

[首次正式运行](hardware-runs/2026-10-23T00-24-04-100Z/validation.json) 的 16 个功能组都通过，但 driver 末尾遗留的实验 helper 路径引发 ENOENT，整轮如实标 failed。该原始报告和当时 driver 保留；修正为实际 src helper 路径后重新执行完整 16 组，不能把前轮改写为通过。

KHR 不存在和永不 ready 是明确的 API 测试注入，不声称真实驱动发生了该故障。非法 GLSL 与 WEBGL_lose_context 则进入真正的原生 GPU 错误/恢复路径。隐藏测试由自己的屏幕外 Chrome/profile 经 CDP noDefaults 连接；禁用仅 Windows 屏幕外遮挡分类后，真正 minimize/restore 发出可信 visibilitychange。没有覆盖 document.hidden 或伪造事件，不操作用户其他浏览器。临时 profile 放在 tmp，不提交。

执行需要本机 Playwright/Chrome 路径环境变量和冻结目录，例如：

```powershell
$env:MDGS_NATIVE_DIST = 'tmp/art-candidate-4-dist'
node reports/art-renewal/native-program-preparation/validate-hardware.cjs
```

## 历史原型与采用关系

下面的报告全部保留原字节。其路径可能指向原始 tmp 捕获；被选入 Git 的小证据由 [archive-manifest.json](archive-manifest.json) 列出，不能把未复制的大型本地捕获声称为远端交付。档案中的 driver 是当时版本，保留原相对路径用于追溯；正式执行应使用上面的正式 driver。

- **v1**：[ABBA 原报告](history/runs/2026-10-22T23-39-18-467Z/validation.json)、[派生摘要](history/ab-comparison-summary.json)、[说明](history/ab-comparison-notes.md)。同源四个新 Chrome 实速窗，base 最大 rAF 间隔 588.9/633.3ms，warm 44.5/33.4ms；零→.5 程序信息查询 CPU 自耗由 8270/8442ms 降至 63/54ms。采样有开销、OS/驱动缓存未清；rAF 与累计提交均不是显示 FPS。原 driver 的过早纸面 ready 起点在派生摘要中明确纠正，原报告未改。
- **v2**：[首轮 14 组失败报告](history/hardware-runs/2026-10-22T23-53-07-134Z/validation.json)、[第二次隐藏方法失败](history/hardware-runs/2026-10-22T23-58-06-375Z/validation.json)、[保留现场的第二卷失败](history/chapter2-runs/2026-10-23T00-04-09-704Z/validation.json)。最初 90 秒第二卷超时缺现场，仍标未知；后一次真实现场确认 queue0/pending0 但 completed57/batches58，最后复用已完成 program 的 submitted 项未再次调度，原生提交仍 0。不能倒写最初超时必定同因。失败现场经 root 审阅后才关闭。
- **v3**：[尾项反例 v2 实际失败](history/tail-finalization-v2.json)、[同反例 v3 通过](history/tail-finalization-v3.json)。最小修复把 submitted.length 纳入调度工作条件。[隔离硬件 14 组](history/hardware-runs/2026-10-23T00-08-28-970Z/validation.json)、[第二卷三冷 context 含 .65 返入](history/chapter2-runs/2026-10-23T00-10-21-413Z/validation.json)、[59 帧及 243 原图预验](history/v3/fidelity/validation-fidelity.json) 全过。像素阈值仍 MAE≤2、p99≤12、误差>20比例≤.005、alpha误差0；最差 MAE1.4877064、p99 10。该像素报告使用显式 virtual override 的独立内存复建，明确属于原型，不冒充采用后的生产源码验证。

采用版本保留 v3 的真实几何/材质代理、linear target、opaque DoubleSide 与透明 Back/Front、全 native handle 轮询、generation、30 秒上限与尾项修复。产品化仅去实验模式/observer，换为显式 owner 链，并清理 helper 自有集合。[采用时源码快照](adoption-source-at-archive/src/scene/ShaderWarmup.ts) 及一并归档的 Renderer、Viewport、App 四文件 SHA 都匹配 C4 构建指纹；正式验收以冻结指纹与实际包报告为准。

原型代码、CPU profiles、小 JSON 与必要失败图共约 18.35MiB；没有复制运行包、59 张正常 PNG、大型 GPU trace、浏览器 profile 或缓存。复制过程不删除原本地文件，档案逐个 SHA 验证后复制。两个真实 headless 方法失败及 v2 尾项失败报告都保持原字节。早期 about:blank 原生探针使用固定输出，第二次探针覆盖了第一次；第一次 stdout 已另存为明确标记的 recovered-console 记录，不冒充原文件或原文件 SHA。
