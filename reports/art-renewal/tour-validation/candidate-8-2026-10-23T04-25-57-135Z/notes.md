# C8导览母版独立核验

实际对象为`tmp/exhibition-tour-candidate8/2026-10-23T04-25-57-135Z`，明确绑定冻结C8包`tmp/art-candidate-8-dist`及清单SHA256 `305dc8b9b429415093889642ae885ffe564cdd33f156edf30a637bac4a172ea9`。`validation.json`由录片前已固定的检查器`e6a9a58bffba9e09768bb679b9edbc30003aed067c662d8e0f101e496a04e481`实际执行完整模式，**35/35 required通过，另1项端点观测required:false**。本页只审导览完整性，不替代原画保真、整站功能、视觉颜色或人类试听评审。

主录制器实际归档SHA为`fc52cb9d1bfe0ff329f2fcd7c7e5cbc87dbbec36984bf788569cf864b4f98210`，声音helper为`c3ce6432133fa6403c40a7842473ee0894f8f2631d591289c47faa00017dd4c3`，前后及归档字节一致。主录制器只修stop响应后的接收gate，固定结束边界，未改作品时钟/动作/声音/编码参数。上一份C8影片的34/35失败及4172/4173不一致仍原字节保留在`../candidate-8-2026-10-23T04-14-51-310Z/`，没有回填旧JSON或删除旧JPG来通过。

本次原始PCM为48kHz双声道Float32，7,711,616帧、61,692,928字节、160.6586667秒；60,247个128帧process及2108个包全部计数匹配，逐包SHA与逐量子指纹错误均0，无非有限或削波样本，context实际关闭且采样覆盖其结束帧。三路循环源同从context .607秒、offset0、rate1开始，按原生时钟覆盖1/1/6个预计循环边界；不是解码分轨逐波形拼接重建证明。本次native标签冻结次数0，不能据此重复宣称压力分支覆盖。

输出时钟epoch spread实际0.20313ms；PCM开始比第一幅CDP画面晚4.5092812秒，编码按4509ms延迟，量化差−0.2812ms。原始声景之后片尾约0.88343秒按实际影片时长补齐，未在PCM内部补洞/删帧/重排。30fps、主时钟估计和AAC仍有精度边界，不能称样本级音视频同步。原始PCM SHA256 `8b12cd05c2b0b335af086b1c80601885c2200bb0032cec758921becb0ac7bba4`。

样本峰值−14.76749dBFS（非过采样true peak），尾128帧峰值−119.99251dBFS、RMS−125.72500dBFS；末双声道样本均约3.7923e−8，并非逐位0。端点只按预固定规则记录，未添加事后听觉门限，不把单次实测当作普遍关闭保证。

4170张实际CDP源JPEG与JSON、concat、report的首末及计数一致。ffprobe实际H.264 1920×1080、30fps、4982编码帧、166.066667秒，AAC为48kHz双声道、166.051秒；18段UTF-8侧挂SRT与真实动作清单对应，不是烧录字幕。本片为真实交互节选，第四卷部分连续原速至末，并非四卷全部完整影片。四卷全长两轮另见C8 soak证据。

**最大无新CDP帧间隔2.688837秒仍如实保留**，位于片内58.12865—60.81749秒，动作上下文和第9条SRT为“展开第3卷”。四卷上下文最大间隔分别.25010/.59996/2.68884/.62770秒。这是合成抓帧间隔及实际保留画面，不是原画显示FPS，也不足以单独归因某函数；不据35通过宣称全片流畅。JPEG、H.264及色度采样均有损，兼容色彩副本若另行制作须单独声明，不能覆盖或冒称本母版验收。

实际母版SHA256 `9f4d50dc9d9e183ec4641baa629d8a4a52ff245b5db0e9267c3debe18bfc0306`。本检查读取原始PCM/媒体和清单，没有重编码、修改源媒体或执行编码视频全解码；严格全片解码及解码颜色另有独立报告。

```powershell
node reports/art-renewal/validate-tour-recording.mjs --run-dir tmp/exhibition-tour-candidate8/2026-10-23T04-25-57-135Z --report-dir <new-report-directory> --candidate8-build-manifest reports/art-renewal/art-candidate-8-build.json --with-pcm
```
