# 《一庭春深》v2 候选记录（历史）

2026-10-23 的 v2 候选实验记录；研究后已被三轨 v3 方案替代，当前声音实现见 `audio-v3-notes.md`。下文控件与验证均指当时 v2，不代表当前 v3 或整站已经验收。

新版资源为 `artwork/audio/candidates/v2/peony-courtyard-v2.mp3`，160 秒、44.1 kHz、双声道、160 kbps。原版音频与其溯源文件保留。`scripts/create-peony-music.py` 可用 NumPy 和 FFmpeg 重新生成新版、乐谱、溯源与数值报告；网页运行不需要这些工具。

音乐以 D 宫五声音列创作，分为「山野初醒、花入人间、锦绣寄意、国色余韵」四段。55 个事件包括疏落拨弦、低音回应、泛音和少量长音；撤去原版规律低音重复，以慢速呼吸、较长衰减和远处应答围绕画面留白。数字弦音采用不同阻尼的非谐波模态、轻微双极化拍频和柔化触弦；少量气息长音、扩散残响均为本地合成。没有借用录音、旋律、样本或他人乐曲，不宣称真人古筝/洞箫演奏。

技术研究仅用于理解合成与声图生命周期，代码和乐谱独立编写：[Julius O. Smith《The Ideal Plucked String》](https://www.dsprelated.com/freebooks/pasp/Ideal_Plucked_String.html)、[W3C Web Audio API](https://www.w3.org/TR/webaudio-1.0/)。弦模态阻尼、反射扩散和连续参数变化是本次原创实现中的工程选择。

控件仍由用户主动开启，默认 36% 音量，保存调整值。第一次解码后渐入；关闭时 220ms 渐出，约 260ms 后关闭声图；离开可见画卷短暂渐出并暂停同一音乐时钟，隐藏标签页立即暂停。重新回到画卷恢复原时钟。`chapterId` 为可选参数，四卷之间用 1.4 秒时间常数缓缓调整低通色彩，不重新开曲、不增加播放器。关闭/重开、失败重试、迟到请求和卸载均释放相应声图。

实际验证：

- `python scripts/create-peony-music.py` 通过，MP3 解码帧数与原 PCM 一致（7,056,000 帧）；新版解码峰值 −5.81 dBFS、RMS −21.92 dBFS、接缝相邻样本跃变 −65.21 dBFS；没有削波。详见 `audio-validation.json`。
- FFmpeg `ebur128=peak=true` 实测新版综合响度 −19.3 LUFS、响度范围 7.6 LU、真峰值 −5.8 dBFS。旧版对应 −19.4 LUFS、3.3 LU、−3.9 dBFS；新版增加呼吸动态并保留余量。
- `npm exec tsc -- -b` 通过。
- 独立 Vite + Playwright/Chromium、React StrictMode 中，真实 MP3 解码、主动启声、503 后重试、渐入、音量保存、离开暂停/同钟恢复、换卷音色渐变、后台暂停、淡出释放、取消下载不复活、快速开关和卸载全部通过，无页面错误。共 10 组检查，详见 `audio-browser-validation.json`。测试脚本与隔离页面位于忽略目录 `tmp/`，没有进入产品代码。

数值分析验证余量与接缝，不能代替真人对音乐审美与实体音箱的试听。没有声称进行实体扬声器或所有浏览器验收。旧版站级测试中的 MP3 路径断言需对应新版；「立即 closed」应等待淡出释放完成。

2026-10-23 最终归档：自创 v2 候选、乐谱与来源说明移至 `artwork/audio/candidates/v2/`，保留原字节与当时验证结论，不再随运行资源部署。用户旧 MP3 未移动、未改写。
