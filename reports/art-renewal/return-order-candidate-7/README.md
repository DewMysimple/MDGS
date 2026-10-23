# C7 · 返回10项、原硬件16项、原生部分上传恢复专项

同一真正冻结C7包的要求已在绑定运行中完成：返回10/10、原硬件16/16，以及新增的真实部分纹理上传中断/恢复1/1。**初次合并17项报告仍是failed，未被改写成通过。** 范围与原字节路径见 [summary.json](summary.json) 和 [manifest.json](manifest.json)。全作品总验收另由C7根链记录，本目录不代表Edge、原画59帧或全部功能。

- [返回10项原报告](focused10/validation.json)：普通/减弱动效下，按钮、历史Back到`.65`和`1`、前进、session续看、按钮PNG编码在途后Back竞态，以及`toBlob(null)`时已有匹配缓存仍须暖纸返回。10/10通过。
- [初次17项原报告](initial17-with-diagnostic-failure/validation.json)：原16项均已实际通过，新增第17在瞬时诊断字段前提失败；原driver、错误截图和整个failed报告按原字节保存。
- [新增原生部分上传恢复专项](partial-native-context/validation.json)：只执行修订后的第17项，通过。没有重复已通过16项；产品、包、原16断言未变。
- [真正桌面隐藏/恢复原报告](native-hidden/validation.json)：原16中的一项以本进程自己的非headless Chrome最小化产生可信visibility事件，保留当次driver与自有窗口启动器。

所有运行核对831份 src/public/config 输入、744份独立C7包以及三份包五个代码文件/展示库存，前后SHA一致，绑定[冻结指纹](candidate-7-build.json)。实际Chrome156.0.8078.47 / ANGLE NVIDIA RTX5070Ti D3D11，非软件回退。大包、浏览器profile、缓存没有复制进报告。

原16项保留原生着色器错误及显式重建重试、真实GPU丢失/恢复、KHR不可用与永不完成的明确API注入/30秒有界回退、前台/真实后台、四卷实际首帧、resize、部分启卷单调收卷、资源503重试、慢纹理到达后取消，以及manifest/source-materials晚到时owner取消后0native draw。

第17项观察真实`HTMLImageElement`进入`prepareNextTexture → renderer.initTexture → texSubImage2D`，选中的图确有原材质image字段sampler，随后microtask请求真正`WEBGL_lose_context`。最初立即读到`textureUploads=0`是此前尚未刷新的诊断；原生lost事件后的诊断已显示3份pending/4份loading。首次报告在该瞬时断言停止，尚未执行恢复，不能说那次恢复失败。修订专项改在实际lost事件后确认pending，再恢复；观测到trusted lost/restored事件、目标原图重新上传、全部upload/loading/queue归零及真实firstFrameReady。

此黑盒原生专项证明实际部分准备过程丢失/恢复，不区分同source共享的每个内部sampler调用。**精确已消费前缀全部重新入队**由真实生产方法的[CPU10专项](../texture-streaming-preparation/cpu-validation-at-adoption.json)断言；其GPU为显式stub，两个证据边界分开。正常路径性能与六组完全一致像素见[同布局隔离A/B](../texture-streaming-preparation/README.md)。

所有原生专项浏览器和服务已在10:46前关闭。随后另行启动的Edge补验有独立报告，不属于本目录原生专项。归档driver保留原位置假设，复跑请使用其原tmp路径，不能直接从本归档层级执行。
