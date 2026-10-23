# 第三卷首访程序等待定位

有效摘要：[c3-cold-profile.json](c3-cold-profile.json)，run `2026-10-22T23-10-32-165Z`，`profiled`，0运行错误。原始CPU采样、driver与trace位于 `c3-profile-runs/<run>/`；最长任务的独立切窗统计见 [c3-cold-profile-summary.json](c3-cold-profile-summary.json)。产品、原画、相机、时钟、debug错误检测都未修改。

使用新Chrome156上下文、1920×1080/DPR1，实际ANGLE / RTX5070Ti / D3D11。正常从卷首开始自动播放，没有seek到目标或加速，按真实进度在0.15与0.5打userTiming标记，目标窗口24,116.881ms。CPU采样间隔1000μs，结合devtools.timeline、V8 compile与GPU调度事件。采样/trace本身有开销，因此这一轮不是无诊断开销的FPS基准；浏览器/OS/驱动此前接触过相同内容，不能称物理设备全冷。

CPU timeDelta与trace共享标记对齐，窗口覆盖24,119.650ms。关键证据：

| 观察 | 窗口累计 | 单次/任务边界 |
|---|---:|---:|
| CPU样本 `getProgramInfoLog`，两调用节点合计 | 5744.189ms | 最长851ms任务中775.283ms，约91.10% |
| renderer主线程trace `GLES2Implementation::GetProgramiv` | 5733.219ms /1027次 | 最长123.074ms；多个查询可聚在同一长任务 |
| CPU样本 `texSubImage2D` | 394.136ms | 最长任务中62.902ms，约7.39% |
| trace `Decode Image` | 323.276ms /18次 | 最长24.391ms |
| trace `Layout` | 197.422ms | 最长0.494ms |
| trace `UpdateLayoutTree` | 1061.095ms | 最长0.947ms |

另两个长任务574ms、373ms，`getProgramInfoLog`采样占比分别约98.81%、98.56%。这些是统计CPU self-time及主线程同步查询时间，不是shader编译器的独占GPU耗时；trace调度层级有嵌套，不能把所有total相加。它们足以将这组长停顿的主要关注点转到首次program信息/状态查询等待，而不是单次布局、单次图像decode或GC。纹理上传也有成本，尚不能凭其总量宣称所有抖动仅一个原因。

本机固定Three r180的 `WebGLProgram.js:921` 在首次 `getUniforms/getAttributes`时进入 `onFirstUse`，默认debug检查调用 `getProgramInfoLog`、shader日志及LINK_STATUS；`compile`阶段创建/link程序但不触发该uniform/attribute读取。`compileAsync`使用KHR完成状态，但只跟踪每个material最后的currentProgram，透明DoubleSide的Back/Front及取消生命周期需要额外处理。不能关闭 `debug.checkShaderErrors`换一个好看的数字，那会破坏已验证的shader失败门控。

候选方向是保留相同程序和真实错误检测，先link、等待所有目标native programs的非阻塞完成，再让正常首用完成原有诊断。Khronos明确提供 `COMPLETION_STATUS_KHR`非阻塞轮询，并说明它不保证减少总编译墙时；[扩展规范](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/)。Three官方说明了异步预编译的用途及场景配置前提；[WebGLRenderer文档](https://threejs.org/docs/pages/WebGLRenderer.html)。具体隔离原型方案另记，不在本轮直接改产品。

完整源码/public/配置与driver、生产代码及展示库存前后SHA相同，并绑定上轮8窗基线摘要。原始CPUprofile约0.58MiB，详细trace为254,135,304B，建议只在本地保存该大型原始JSON；它的SHA留在原报告，Git可保留摘要、CPUprofile、driver和说明。精选Git证据不能冒称完整raw trace随仓库上传。
