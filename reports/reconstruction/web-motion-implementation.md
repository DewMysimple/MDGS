# 第一卷网页轻动实现记录

此页保留首卷样板阶段的历史范围。样板展示通过后的四卷配置、实际有符号UV基、第四卷盛衰及新增实测见 [四卷轻动扩展](after-motion/implementation.md)；下文“其余卷未启用”不代表当前状态。

记录日期：2026-10-20。此记录覆盖第一卷动效引擎、控制与恢复机制；不是四卷整体完成声明。新图与Blender派生副本的视觉验收由整体样板记录另行证明。

## 当前实现

- `src/data/motionProfiles.ts` 只启用第一卷，显式绑定71项：23个既有淡云、2根独立金带、1组完整花枝、1组原花瓣，以及14个新薄雾连接层和30个UV图集单瓣实例；没有根据文件名泛匹配人物、建筑或合并群像。第二至四卷仍未启用，等待第一卷样板展示通过后扩展。
- `src/scene/MotionDirector.ts` 使用独立可暂停时间，与游观progress分离；每次从原矩阵/源动画采样矩阵计算局部增量，避免逐帧旋转累积。27个已绑定源层经真实positions/UV相关性逐项验证为局部XZ、Y法线（不把其他未绑定源图的平面当成相同）；44个新增标准Plane明确使用XY、Z法线，证据在 `motion-local-planes.json`。花枝/锦带以局部支点微摆，云气仅小幅位移和极浅透明度变化。最多6个实际视锥内动效绑定同时更新，优先给2片单瓣和1层新薄雾，避免旧云挤掉新层；单瓣单向缓落、两端淡至透明后循环，静止建筑与人物不动。
- `SceneRenderer` 保留真实相机、源动画采样、DPR上限1.65、扩大视锥预取、4个并行纹理请求、160MiB目标LRU与12秒过期。新增ArtDirectionLayer资源进入同一objects数组、加载队列和销毁生命周期；当前已验证配置接入5替换、9修边、58新增层及1个原生HTML题签，计数写入canvas便于运行核对。
- 停留时环境画面约30Hz绘制，用户输入仍可即时请求相机绘制。关闭画中轻动、系统减少动效、后台与WebGL丢失上下文均停止环境时间；静止关闭后不再排队RAF。后台回到前台重置时间基准，不补跑墙钟时间。
- `setMotionEnabled`、`getMotionState`、`subscribeMotionState` 与 `getRecoveryState` 支持已有App/ScrollViewport接线。轻动与自动展卷分开，用户偏好本地保存；存储不可用有回退。运行中更改系统减少动效偏好立即生效。
- `retryFailedAssets` 只在用户明确重试时重置失败纹理集合，避免每帧无限请求。WebGL丢失可一次尝试恢复原上下文，仍失败则由有限UI重建，保留游观进度。切章释放几何、材质、纹理、媒体/可见性/上下文监听、恢复定时器与RAF。
- 诊断只写入canvas的data属性，不在用户界面展示内部信息。含motionTime、renderCount、rafTicks、activeMotionLayers、纹理数量/估算字节、请求/失败数与context恢复次数；持续诊断限约10Hz以减少DOM写入。

## 当前验证证据

| 证据 | 实际覆盖 |
| --- | --- |
| `npm run build` | 当前代码完整TypeScript与Vite生产构建通过 |
| `node scripts/validate-motion.mjs` / `validation-motion-unit.json` | 18项配置/矩阵检查：71绑定真实存在、逐项UV局部轴、独立时间、不累计漂移、源动画基底保留、复位透明度/矩阵、可见上限/新层配额、单瓣落向与淡入淡出、长间隔限制、销毁、其他卷未启用，以及截UV补全/轻法线起伏接受/错误或退化UV拒绝/大起伏拒绝/5个当前替换实测 |
| `validation-motion-ui.json` | 6种窗口、键盘与偏好、动态减少动效、隐藏全站停RAF/恢复、manifest有限恢复与progress保留、存储不可用回退 |
| `validation-recovery-ui.json` | 实际WebP请求abort后显式重试、实际WEBGL_lose_context恢复、原canvas复用与进度保留、焦点恢复、零pageerror |
| `node scripts/validate-motion-budget.mjs` / `validation-motion-budget.json` | 第一卷首景progress恒定时环境持续绘制；实测约29Hz、纹理峰值4并发；暂停后绘制数/RAF数/时间均冻结 |
| `node scripts/validate-pilot-motion.mjs` 与 `python scripts/measure-pilot-motion.py` | 实际首景与第7景“盛世华容”的on/off/resume/reduced序列、两景关键帧/局部放大与短WEBM；on仅433/428像素RGB变化>5，off和reduced逐像素完全相同；固定柱/石栏/石阶区域无可见变化，见 `pilot-motion/validation.json` 与 `frame-differences.json` |

浏览器脚本允许从连接运行库的NODE_PATH或MDGS_PLAYWRIGHT_MODULE解析Playwright，MDGS_TEST_BROWSER可指定浏览器；工程文件不包含本机运行库/浏览器路径。普通开发与生产构建不需要浏览器测试依赖。

当前预算实测修订激活范围为JSON内 `activeRevisionChapters:[1]`，已包含新图与连接层：首景28个可见纹理估算193.74MiB，实际draw calls为68，仍保持约29Hz与纹理峰值4并发。此前未激活修订的25纹理估算为166.87MiB，增加约26.87MiB。160MiB是驱逐目标而不是可见资源硬上限；纹理估算与本机Chromium不能替代跨显卡GPU测量。

## 待样板整体闭环

新位图/世界连接层已激活并补显式动作绑定及新增资源性能检查；15节点与跨景边界、完整建筑/地台及Blender派生副本仍由整体样板验收证明。第一卷样板展示通过后才启用二至四卷，并为第四卷另加真实节点驱动的盛衰包络。不可用当前第一卷结果证明后续三卷完成。

未来三卷只读候选已定位在 `motion-candidates-chapters-2-4.json`，生成命令为 `node scripts/build-motion-candidates.mjs`：第二卷1项、第三卷29项、第四卷11项；明确区分斜置UV基、YZ图层与管状曲线，尚未改profiles或启用后续卷。第四卷按真实第5节点归一化progress约0.50043开始连续减速、减瓣与疏云，避免用源片时间或固定四等分替代阅读进度。
