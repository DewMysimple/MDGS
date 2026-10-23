# C6 · 真实后台暂停的独立观察

**真实原生窗口最小化三轮通过。** 第四卷在实际 SCROLL_VIEWER 启动约200ms自动展卷，然后分别最小化400、500、600ms，再恢复窗口。29个隐藏期外部CDP采样中，同步持久化的session字符串、原画renderCount与rafTicks各自严格不变；恢复后继续暂停，session没有补算隐藏时长。没有改源时钟、替换 document.hidden、伪造 visibilitychange 或覆盖浏览器API。

权威入口：[紧凑摘要](summary.json)、[成功轮原报告](trusted-three-cycles-passed/validation.json)、[成功轮原驱动](trusted-three-cycles-passed/driver.cjs)、[逐字节归档清单](manifest.json)。829份产品输入与[C6冻结身份](candidate-6-build.json)一致，744份独立包文件及当时全部scripts和原生启动器前后SHA不变。Chrome实测156.0.8078.47，实际GPU为ANGLE NVIDIA GeForce RTX5070Ti / D3D11；本轮是功能观察，不是显示FPS、GPU完成率或像素完全相同的证明。

| 轮次 | 请求/实际隐藏采样时长 | 同步保存的进度字符串 | 隐藏期原画计数 | 恢复后 |
| --- | --- | --- | --- | --- |
| 1 | 400 / 403.59ms | `0.41761367426347995` | renderCount257、rafTicks344均不增 | 原session，仍暂停 |
| 2 | 500 / 503.07ms | `0.41744024458027296` | renderCount511、rafTicks611均不增 | 原session，仍暂停 |
| 3 | 600 / 609.99ms | `0.4175536409114687` | renderCount764、rafTicks877均不增 | 原session，仍暂停 |

三个hidden和三个visible事件均实际记录为trusted。启动器只创建和最小化自己的屏幕外Chrome窗口/profile，CDP `noDefaults`避免Playwright自动focus/visibility模拟；仅关闭Windows屏幕外遮挡分类，让正常恢复仍可见。它没有操作用户其他窗口。独立profile留在tmp且未归档；全部自有浏览器与HTTP服务在报告结束前关闭。归档driver保留当时原相对路径用于追溯，不能直接在归档目录运行。

## 原始失败观察点也保留

[首轮真实failed](first-observer-baseline-failed/validation.json)及其[当时driver](first-observer-baseline-failed/driver.cjs)没有改写。原假设是在捕获阶段的visibility监听器内排入microtask，就能读到所有产品监听器之后的同步save。实际记录否定了这个假设：捕获回调及其microtask仍读旧session `0.414`、playing=true；随后该事件的timeout0和全部八个真正hidden采样已读 `0.41798387993329644`，renderCount262、rafTicks344从未再增长。因此这次failed是把分发前段观察值与分发后段结果强等的探针错误，不能改成“产品通过”，也不能当作产品在后台继续走时的证据。

第二轮只增加一个SCROLL_VIEWER准备完成后才注册的只读bubble观察器，明确在已经安装的产品监听器之后取得同步保存基线；早期capture/microtask仍保留作因果对照。400/500/600ms、session字符串严格相等、renderCount/rafTicks零增与恢复后无补时的断言均未放宽。随后重新执行全部三轮成功。

## 诊断字段与控制状态的边界

`SceneRenderer.updateDiagnostics`写的是`this.progress`请求值；`ScrollViewport`在React passive effect中调用`setProgress`，异步叙事读回的finally也能更新诊断而不绘制。`sourceFrame`同样由该请求值推导。因此canvas.progress晚写一次，不能单独证明作者时钟或GPU绘制在后台继续。

本轮分别记录session字符串、input.value、input的value属性、step、playing、canvas进度、renderCount、rafTicks和叙事pending。当前原生UI step实测为0.001，输入property分别为0.418、0.417、0.418，value属性保存全精度。它们是独立字段，不要求与session跨字段字符串相同；本次三个真正native窗口轮次里**没有再现**隐藏后的canvas进度晚变。相关晚变的证据归属于另一份独立synthetic探针，不把别轮观察移植到本报告。

独立证据入口为[synthetic探针v1真实timeout](../hidden-commit-probe/2026-10-23T01-34-05-665Z/validation.json)、[v2完整25轮通过](../hidden-commit-probe/2026-10-23T01-35-56-132Z/validation.json)与[绑定同一C6的分析](../candidate6-hidden-commit-analysis.json)。v2中18次立即canvas诊断不同于同步保存位置，round7/15/16在hidden后诊断晚变，但原生绘制调用、renderCount、rafTicks及session均冻结。这是synthetic事件条件下的独立实测，不混为本轮trusted事件的结果；其各自当时driver与身份清单也保留在原目录。

需要同时更正先前的根因猜测：上游synthetic探针v1超时最终记录为input序列化 `0.416751571287274` 与session `0.41675157128727375` 的双精度尾位差，那个探针的step实际为any；先前“可能是step=.001量化”的猜测不是它的真实失败原因。本轮独立原生UI确有step=.001量化，是另一个观测，不能据此归因上游那次超时。

原[C6六套链settings第229行真实failed](../final-regressions/2026-10-23T01-13-37-572Z/validation.json)仍单独保留，本报告不将其改写为通过。settings检查若据独立证据更正观察字段，必须保存旧driver/失败后重新跑完整六套；这三轮不能代替那条完整链。Sound代理在本轮释放并完成所有scripts前后指纹后才写入已授权的settings检查修订；后续新链不属于本报告的“当时全部scripts未变”结论。
