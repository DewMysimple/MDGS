# C7 · Windows Edge 桌面补验

实际冻结C7包在Edge155中 **UI83/83、Sound15/15通过，0 errors**。这为新纹理解码/上传阶段、紧凑桌面控件、花笺与音频提供真实Windows浏览器功能覆盖；不是Edge手动拖动性能、原画59帧、返回10项、原生故障硬件或全片长时认证。

权威入口：

- [原始Edge总报告](candidate-7-2026-10-23T02-47-33-948Z/edge-validation.json)
- [C7输入/包/三包代码/驱动绑定sidecar](candidate-7-binding-2026-10-23T02-47-33-948Z.json)
- [UI83原报告](candidate-7-2026-10-23T02-47-33-948Z/ui/ui-all-validation.json)
- [Sound15原报告](candidate-7-2026-10-23T02-47-33-948Z/sound15-validation.json)
- [当次sidecar驱动副本](candidate-7-2026-10-23T02-47-33-948Z/binding-driver.cjs)

本轮显式指定`tmp/art-candidate-7-dist`和新run目录，原`verify-edge-desktop.cjs`的C3默认值未改，C3/C6报告与notes保留原字节。先校验831份src/public/config输入与C7冻结指纹一致，再记录744份包文件、main dist / 独立C7包 / dist-exhibition五份代码；结束后所有输入、包、代码和驱动SHA不变。实际服务器五份代码HTTP200且body逐字节匹配冻结文件，源代码和包未因测试改变。

Edge路径来自此前真实C3报告，为`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`，实际UI运行版本155.0.4283.62。查询的GPU为ANGLE / NVIDIA GeForce RTX5070Ti / D3D11；本轮使用硬件，不能把允许回退的启动旗标说成正在使用SwiftShader。Sound15由同一Edge executable启动，原声音驱动没有再次发布browser.version/GPU字段，保留这一采集边界。

UI83覆盖首页失败重试、1280×720至3440×1440及1100×650的多桌面布局、首页序/指南/动态、可选首页WebGL丢失回退、四卷文化全文/来源/标签/焦点、四卷卷末题跋与花笺的边界/选择/落印/再次落印焦点/实际PNG下载和字形。原声音15项保留原生WebAudio既有行为断言，没有加速时钟、额外启动模式或源码hook。新时间轴的真实pointer专项与拖动CPU证据属于Chrome的独立报告，未在本轮Edge83中追加这些断言。

本轮上海时间10:47:33开始，10:50:39结束。所有自有Edge浏览器、GPU页面和HTTP服务已正常关闭，随后仅补静态说明。总体C7以各自正式根链与原画验收为准。
