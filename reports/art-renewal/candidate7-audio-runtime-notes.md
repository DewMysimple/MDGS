# C7声音、实速演播与导览准备

当前本组C7原速两轮四卷soak及完整六套回归全部通过并封存；独立遇景键盘失败仍使整体C7不接受，不录正式导览。soak实际`soak/2026-10-23T02-38-23-616Z/validation.json`，10:38:23至10:51:33上海时间，789.372秒、21/21项、8卷次、822采样点；42生命周期核心、333活跃资产、827产品、5代码包首末稳定。冻结包`tmp/art-candidate-7-dist`，清单`art-candidate-7-build.json` SHA256 `1ab1ac859466a2ffbb2c069fe12086eea5ec0d0e803b220a7495f82c97653745`，827产品＋4配置＝831输入。six run `final-regressions/2026-10-23T02-51-46-664Z/validation.json`于10:51:46至11:05:15实际完成，827产品/5包/9驱动首末稳定。本代理没有build或改src/audio/三MP3/原画/录制器，完成后已释放source/CPU/GPU。C6与C7证据均保留原版本，不沿用为后续包通过。

`candidate7-runtime-seal.json`独立读取核验1762个唯一文件SHA，0差异，包含831冻结输入、完整744包（739 public副本＋5代码）、9执行驱动、实际报告/日志/截图。其状态明确为local functional scope，不是整体发布接受。

| 本组C7实际运行 | 结果 |
| --- | --- |
| 原速两轮四卷soak | 789.372秒、21/21、8卷次、822采样 |
| UI | 83/83 |
| 共享声音 | 15/15 |
| original-mode runtime | 34/34、80原画节点、118次正文展示 |
| journey | 9/9 |
| settings | 18/18、163实际帧采样、真实GPU恢复 |
| subpath | 1组覆盖四卷，0页面/资源错误 |

独立遇景验收出现第三卷键盘入口连续Enter未进入入锦的真实失败，poetic又在三次冷启动中确认锦面先出现并抢到初始焦点，花出现后未纠正，两次回车无效。证据入口`candidate-7-poetic-runs/2026-10-23T02-39-01-689Z/notes.txt`及其原始失败记录。逐纹理到达暴露了焦点时序问题，不能用本scope的soak或六套局部通过覆盖该失败。若转C8，必须按新冻结包重新执行同包正式链。

本次soak实际读笺降声−5.9496至−5.9343dB并恢复；全程1个原生AudioContext与3路循环源，最终显式关闭后context为closed且原生stop/disconnect完成。JS、console、资源及URL错误均为0。原生进度时钟、URL消费者与有界缓存的完整明细在该唯一run报告，内存观测不代表VRAM或全进程泄漏判定。

准备入口`candidate7-validation-preparation.json`。两个正式驱动的`--plan --build-dir tmp/art-candidate-7-dist`均实际成功，保持完整两轮四卷原生rate1、21项、约13分钟soak，再以同一产品/包SHA门控约14分钟的83UI/15声音/runtime/journey/settings/subpath六套。报告仍用唯一run目录，旧失败、中断和C6结果不覆盖。settings保留经实证修正后的同步controller/rawinput/draw/tick精确冻结，不跨字段比较浮点序列化，仍18项及真实GL恢复。

本次C7运行前固定的检查器及`candidate7-tour-checker.mjs`副本SHA256均为`a5a93ac8d84dd62db46abf596757607b27cad9372f4801e143d5539245dbdb47`；副本保持原字节，canonical随后为C8增加独立身份分支，不把新字节倒写为C7执行版本。C6原字节`candidate6-tour-checker.mjs`仍为`33d1fc388507adcec7d0bf70fecd19b57ec4367edfb324528321415c5d402ed7`。C7版本只增加显式`--candidate7-build-manifest`及版本/错误说明，不改35 required、端点required:false或采样连续性规则。

预冻结协议反例已实际执行：旧stage＋真实但故意不匹配的C6清单配合C7 flag，正确输出candidate=7/identityVerified=false，包身份与renderer两项失败；竞争的C6/C7双flag也在读取影片前拒绝。它验证参数分支，不是使用真实C7清单的正式反例。

真实冻结后，已先逐字节读取全部831输入与5个实际代码文件，全部与C7清单一致，证据`candidate7-runtime-binding-at-start.json`。随后真实执行旧stage＋实际C7清单反例，`candidate7-tour-negative-stage-test/metadata-validation.json`正确29/31、candidate=7/identityVerified=false、绑定实际C7清单SHA，包身份与renderer两项失败。未读PCM、未新录片或把旧影片冒称C7。

正式序列：核对真实冻结身份→真实C7反例→原速soak→同包完整六套→独立全输入/全包/驱动/日志/截图SHA封存→退出浏览器/服务并释放CPU/GPU→root安静同包最终录片→用录片前已固定的C7检查器独立审核真实PCM/量子/时钟/包/SRT/ffprobe元数据。影片完整性不代表原画显示FPS、全浏览器认证或人类声音审美验收。

```powershell
node scripts/validate-art-renewal-soak.mjs --build-dir tmp/art-candidate-7-dist
node scripts/validate-art-renewal-final.mjs --build-dir tmp/art-candidate-7-dist
node reports/art-renewal/validate-tour-recording.mjs --run-dir <actual-C7-tour> --report-dir <new-C7-tour-report-dir> --candidate7-build-manifest reports/art-renewal/art-candidate-7-build.json --with-pcm
```
