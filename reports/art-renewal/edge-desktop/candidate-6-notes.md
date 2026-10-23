# C6 · Windows Edge 桌面补充验收

**实际冻结 C6 包：UI 83/83、Sound 15/15，0 errors。** 这轮是额外的 Edge 桌面功能验收，不代表完整跨浏览器认证、Edge 原画59帧、270条正文、长时声音或性能基准。

权威入口：

- [原始 Edge 总报告](candidate-6-2026-10-23T01-19-43-432Z/edge-validation.json)
- [C6 源码与包绑定 sidecar](candidate-6-binding-2026-10-23T01-19-43-432Z.json)
- [UI83 原报告](candidate-6-2026-10-23T01-19-43-432Z/ui/ui-all-validation.json)
- [Sound15 原报告](candidate-6-2026-10-23T01-19-43-432Z/sound15-validation.json)
- [sidecar 当时原驱动副本](candidate-6-2026-10-23T01-19-43-432Z/binding-driver.cjs)

实际运行目录是 `tmp/art-candidate-6-dist`。运行前先逐项核对829份 src/public/config 输入与[C6冻结指纹](../art-candidate-6-build.json)，核对744个候选包文件，并校验该独立包、main dist、dist-exhibition 的五个代码文件都等于同一指纹。结束后再次核对全部输入、候选包、三包代码、验收驱动与此前 C3 原报告，均未变化。原 Edge driver、UI83 和 Sound15 driver 全程未修改；原 Edge driver 的 C3 默认值保留，通过显式 `--build-dir` 与独立 `--run-dir` 运行 C6。Sidecar 也保存了自己当时的 SHA。

真实 Edge 路径从 C3 报告读取，为 `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`，本次观测版本 **155.0.4283.62**。UI 运行实际查询的 WebGL renderer 为 **ANGLE / NVIDIA GeForce RTX 5070 Ti / D3D11**。`--enable-unsafe-swiftshader` 只是允许回退，本轮实际不是软件渲染。Sound15 使用同一个 Edge executable；该原驱动没有发布自己的 browser.version 或 GPU 字段，不能把 UI 的实测字段冒写成第二次独立声音运行也采集了这些值。

UI83 覆盖首页图层加载失败与重试、1280×720至3440×1440及1100×650等桌面布局、序/指南、动态停止与恢复、首页可选湿色 WebGL 丢失回退、返回焦点、四卷文化正文/来源/标签/焦点边界，以及四卷题跋花笺的选择、钤印、实际PNG下载、字形和再次落印焦点。服务器在 `/exhibition/ui-qa/` 前缀下实际返回五份代码 HTTP 200，并逐字节匹配冻结文件。Sound15 保留原生 WebAudio 的既有15组启停、状态和容错断言，没有追加启动旗标或改作者时钟。

开始时间为上海时间09:19:43，结束于09:22:49。两个原驱动正常退出，全部自有浏览器、GPU页和本地服务已关闭，随后只写本说明。原 C3 notes、报告、截图及 driver 保留原字节；本文件仅描述 C6 的本次补充结果。整体 C6 的保真、叙事、声音长时与交付总链仍以其各自正式报告为准。
