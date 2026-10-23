# C8 · Windows Edge补验

真正冻结C8包在Edge155中 **UI83/83、Sound15/15通过，0 errors**。本轮未改变原driver或C3默认值，通过显式C8包与唯一run目录执行。它是桌面功能补验，不是Edge全原画59帧、全片正文、键盘遇景专项或拖动性能认证。

- [实际Edge总报告](candidate-8-2026-10-23T03-30-26-157Z/edge-validation.json)
- [C8完整source/package/三包code/driver绑定](candidate-8-binding-2026-10-23T03-30-26-157Z.json)
- [UI83](candidate-8-2026-10-23T03-30-26-157Z/ui/ui-all-validation.json)
- [Sound15](candidate-8-2026-10-23T03-30-26-157Z/sound15-validation.json)
- [当次sidecar驱动原字节](candidate-8-2026-10-23T03-30-26-157Z/binding-driver.cjs)

831份src/public/config与C8冻结一致，744份独立包全量前后不变；独立包、主dist、展示包的五份代码均相同。HTTP实际返回的五份代码body也匹配。原UI、声音、Edge驱动、此前C3总报告以及sidecar自身SHA首末相同。

实际UI浏览器为Microsoft Edge155.0.4283.62，路径`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`；GPU查询为ANGLE / NVIDIA GeForce RTX5070Ti / D3D11。Sound15使用同一个Edge executable，但原声音driver没有单独发布browser.version/GPU，不伪造第二次采集。

UI83实际覆盖首页资源失败重试、多桌面尺寸1280×720至3440×1440和1100×650、序/指南/动态、首页可选WebGL丢失回退、四卷文化全文/来源/焦点、四卷题跋花笺的布局/选择/落印/PNG实际下载/字形与再次落印焦点。原生WebAudio保持既有15项断言。C8新增的遇景初始焦点与主动Tab时不抢焦点由[独立Chrome专项](../candidate-8-poetic-runs/2026-10-23T03-20-46-613Z/initial-focus/initial-focus-validation.json)负责，不把本Edge83扩大成该专项。

本轮11:30:26开始，约11:33完成；精确结束时间见sidecar。所有自有Edge浏览器、GPU页和HTTP服务已关闭。C7/C6/C3原报告、notes与driver保留原字节；整体C8验收和最终导览另报。
