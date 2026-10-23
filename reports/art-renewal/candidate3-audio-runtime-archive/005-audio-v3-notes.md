# 《一庭春深》三层原创数字声景 v3

2026-10-23，本轮用户要求先完成调研再进入制作；制作依据为 `design-research.md`。本文只记录声音子任务，不把独立声景检查当作整站视觉、原画或全部旅程验收。

## 声音与来源

三条音轨由原创乐谱与本地合成重新渲染，没有使用 MP3 分离、外部录音、样本或借用旋律。A「弦句」为 160 秒双声道短拨弦与少量低音，B「清气」为 160 秒单声道泛音/气息回应，C「绢雾」为 24 秒单声道无音高纸感空气。A/B 同周期，C 是独立无音高短循环。曲目采用当代 D 宫五声音列作为材料，不称还原唐乐，不冒充真人古琴、古筝或洞箫。

资源：`public/audio/peony-v3-strings.mp3`、`peony-v3-breath.mp3`、`peony-v3-atmosphere.mp3`；乐谱、源说明和字节哈希见同目录 `peony-v3-score.json`、`peony-v3-provenance.json`、`peony-v3-manifest.json`。用户旧 MP3 保留原位；自创 v2 候选归档到 `artwork/audio/candidates/v2/`。[`artwork/audio/peony-v3-audition.mp3`](../../artwork/audio/peony-v3-audition.mp3) 是三轨同位混合试听，网页不下载它，它也不代表实际旅程中的分区混音。

重现命令为 `python scripts/create-peony-music.py --edition v3`。NumPy/FFmpeg 仅用于制作，普通网页不依赖它们。脚本保留 `--edition v2` 重现旧候选的入口。物理建模研究参考 [Julius O. Smith](https://www.dsprelated.com/freebooks/pasp/Ideal_Plucked_String.html)，声图生命周期参考 [W3C Web Audio](https://www.w3.org/TR/webaudio-1.0/)；音乐与实现独立编写。

## 全站结构

`src/hooks/usePeonySoundscape.tsx` 的 `SoundscapeProvider` 必须包住完整 App，位于条件显示的首页/画卷之外。接口为 `phase、chapterId、progress、reading、children`，其中 reading 表示已打开的花笺/文化阅读面板。`usePeonySoundscape` 提供共享状态、开关、音量和可选 `cue('unfurl'|'note'|'seal')`。多个 `AudioController` 是同一引擎的视图；`variant='foyer'|'viewer'` 只改变音量浮层位置，active 只禁用该控件。

`src/audio/PeonySoundscape.ts` 初次主动启声后创建一条 AudioContext，三条音轨在同一时刻启动。切卷、阅读和返回首页改变混音，不重建播放器、不重复请求、不从曲首重播。后台立即暂停同一时钟；返回继续。停声短暂淡出并关闭活动声图，保存音乐位置；再次启声复用解码缓存并从保存位置继续。缓存保留到 Provider 卸载，以避免反复下载；卸载也清理缓存、短声和正在淡出的旧声图。

`src/audio/cueMap.ts` 绑定 `peony-2.0-2026-10-23` 实际源节点。第四卷 42.52362424% 进入马嵬段落，明亮声部随之退出；不是将整卷都处理成盛放庆典。音景边界依据源 stop，阅读 duck 依据实时 reading 状态。正文容量可改变 narrativeTrack 的阅读边界，因此不硬编码正文百分比。

快速 seek 只取最终目标混音，350ms 稳定后再过渡，不补播跨过节点。短声全局间隔至少 1.5 秒、同类至少 3 秒；启卷不循环高潮，卷末去重，恢复/大幅 seek 不触发收束串音。音乐 bus 读笺时降 6dB，关闭约 1 秒恢复。新会话默认不开声；音量默认 52%，尊重已有保存值。可见文案、标题与无障碍按钮/音量标签统一使用「原创数字声景」。音量采用不挤占画心的桌面浮层，文字至少 12px。

## 已完成的数值与浏览器检查

`audio-v3-validation.json` 绑定实际 MP3 编码/解码结果：音乐层以 100ms RMS 窗口统计，59.6 秒低于 −45dBFS，超过 12 秒目标；六段预留留静在乐谱中明列。A/B 解码循环边界相邻样本都为零，环境边界跃变 −68.18dBFS。三轨混合试听经 FFmpeg ebur128 实测真峰值 −8.4dBTP；最大分区系数同时开启、音量100%再经3200/5100/6600Hz低通实测真峰值分别为−7.3/−6.8/−6.7dBTP，见 `audio-v3-maximum-mix-validation.json`；最大分区声部增益再加保守短声余量的样本幅度上界约 −4.23dBFS。

`audio-v3-browser-validation.json` 是隔离 Vite/Chromium、React StrictMode 的真实解码验证，13 组通过且无页面错误：主动启声前无请求/声图；分轨失败后释放并重试；两处控件共享；同时启动；首页/启卷/画卷及控件卸载保持同钟；读笺实测 −5.999dB；第四卷落幕撤去亮色；快速反向 seek 无声音事件堆积及平滑大跳转不误触发收束；浮层键盘/音量保存；后台停钟；停声再启恢复位置；快速开关/Provider 卸载；取消请求不复活。浏览器实际解码缓存为 96,768,000 字节（48kHz 上下文），三轨下载合计 4,676,049 字节。

`audio-v3-ten-minute-sync.json` 已通过真实 623.8 秒持续播放检查：关闭开发HMR以固定版本，没有加速播放或伪造时钟；初始与最终三条原生 AnalyserNode 波形分别与对应解码样本互相关，相关度均为1.0、相对误差0样本。期间每分钟切换首页/画卷音景，始终只有一个AudioContext、三个音乐源，无页面错误。该报告绑定当次引擎、cueMap与Provider的SHA256。

`audio-v3-ui-validation.json` 的1280×720、1440×900、1920×1080、2560×1440四种桌面尺寸、左上/右下/右上三种边缘位置共12项通过，音量浮层完整留在窗口内、所有浮层文字至少12px。`audio-v3-cues-validation.json`验证三种短声在32/44.1/48kHz下的实际合成峰值均小于0.02。

早期隔离验收页面位于忽略目录 `tmp/`。这些报告保留当次源码哈希；其中旧版控件标签不代表目前名称。623.8 秒同步报告绑定的引擎、cueMap 与 Provider 哈希仍与当前源码一致，当前 MP3 也逐一匹配 manifest；复核记录见 `audio-final-artifact-validation.json`。本次没有重复长时播放。

## 整站接入后的最终声音回归

`scripts/validate-peony-soundscape.mjs` 是可复现的正式声音验收入口，实际加载完整生产 App，在 `/exhibition/audio-qa/` 子路径运行，不替换页面或声景引擎。`audio-final-app-validation.json` 的 15 组检查通过、页面错误为零；绑定所验生产 JS 与当前声音源码哈希。它覆盖主动启声前无声图/下载、单轨 503 后完整释放及重试、三个独立 MP3 原生同刻启动、首页/启卷/全部四卷/返回首页保持同一时钟、键盘音量及真实 master 增益、桌面浮层不越界且字号至少 12px、实际文化解读/画外互动/卷末观者花笺均降低音乐约 6dB、第四卷撤亮色、反向 seek 不排队、注入 visibility 信号后停钟/恢复、淡出关闭、缓存恢复三个循环的准确位置、取消真实请求后不复活。visibility 验证实际监听器，但不等同跨设备系统后台测试。

复现时先设置 `MDGS_PLAYWRIGHT_MODULE` 与 `MDGS_TEST_BROWSER` 为本机 Playwright 模块及 Chromium 路径，再执行：

```text
npm exec tsc -- -b
npm exec vite -- build --outDir tmp/audio-final-dist
node scripts/validate-peony-soundscape.mjs --build-dir tmp/audio-final-dist
```

也可在正式 `npm run build` 后执行 `node scripts/validate-peony-soundscape.mjs`，默认验 `dist/`。最终报告只证明其绑定构建的声音接入，不代替整站视觉或原画保真回归。历史 `validate-new-scroll-runtime.mjs`、`validate-new-scroll-journey.mjs`、`validate-subpath.mjs` 的音频段已改为共享引擎、三轨、准确名称与等待淡出释放，语法检查通过；其余旧版首页/源版断言仍属于对应历史验收范围，不声称整套历史脚本本次均已运行通过。

自创 v2 候选与 v3 同位试听已移到 `artwork/audio/`，构建验证确认不再复制部署；合计移出两个 MP3 5,763,061 字节。制作脚本同步更新输出路径。用户旧 `peony-guzheng-original.mp3` 仍在原位且 SHA256 保持 `0bc51f9d166ab5522f2068994bb14671838fbe91d0f8c16398cf0ec2f2b30fc7`。目前播放器只请求选用三轨；该检查不删除或评价用户旧素材。

本轮实际执行 TypeScript 构建、Python 制作脚本语法解析与四份音频相关浏览器脚本语法检查，均通过。引擎调试入口只公开 `window.__MDGS_AUDIO__.snapshot()`，用于核查活动源数量、时钟、读笺增益与内存。

数值分析和波形同步检查不能代替真人审美与实体音箱试听；没有声称已完成人类听觉评分、真实乐器演奏验收或所有浏览器验证。

统一候选3冻结后，实际在`tmp/art-candidate-3-dist`（`index-C6ZfivTN.js`）重跑全部15组整站声音回归，通过且页面错误为0。新证据为[`final-regressions/2026-10-22T22-32-44-628Z/audio-app-validation.json`](final-regressions/2026-10-22T22-32-44-628Z/audio-app-validation.json)，与早期默认`audio-final-app-validation.json`分开保留；报告内六项声音源码/驱动SHA完成后复核一致。此前另在这一生产包完整执行796.627秒、两轮四卷的真实原速生命周期检查，见`soak-method.md`；没有把候选2的哈希替换成候选3来凑长测。串行总入口的其他套件仍在运行，最终状态以`final-regression-latest.json`为准。

最终六套已全部通过，产品/包/驱动前后稳定，见[完整回归说明](final-regression-notes.md)。以上“其他套件仍在运行”为当时声音套件结束时的记录；原报告没有回填或改写。
