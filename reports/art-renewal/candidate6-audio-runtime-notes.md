# 候选6演播、声音与完整回归

当前：**C6八卷次实速soak与重新从头执行的六套完整回归全部通过，已封存为C7修改前对照**。用户随后提出侧边留白与首卷85%拖动卡顿反馈，root转入C7调整，因此本报告不是C7布局/输入或最终作品验收，C6正式导览不录。冻结包`tmp/art-candidate-6-dist`、身份`art-candidate-6-build.json`保持原样。没有build或改动src/public/包/录片脚本，音频代码与三MP3未变。功能验收按root排程与其他任务并行，不是安静环境性能基准。

独立封存入口`candidate6-runtime-seal.json`实际读取核验1760个唯一文件SHA，0不符：829当前冻结输入、完整744个包文件（739 public副本＋5代码）、9执行驱动及真实报告/日志/截图均绑定；首末41生命周期核心、333活跃资产稳定。封存器`seal-candidate-runtime.mjs`可按报告内完整command重现，只有原始soak与六套报告均pass且同包才允许输出，曾以真实C3 final＋C6 freeze验证错误身份拒绝。

| 本次实际运行 | 结果 |
| --- | --- |
| 两轮四卷原速soak | 787.816秒、21/21项、8卷次、820采样点 |
| UI完整重跑 | 83/83，六种桌面尺寸、真实GL故障与图片重试、四卷文化全文/花笺 |
| 共享声音完整重跑 | 15/15 |
| 原文runtime完整重跑 | 34/34、80原画节点、118次正文展示 |
| journey完整重跑 | 9/9 |
| settings完整重跑 | 18/18、181实际帧采样，含后台冻结及真实GL恢复 |
| subpath完整重跑 | 1组覆盖四卷、0资源/页面错误 |

通过链为`final-regressions/2026-10-23T01-44-13-093Z/validation.json`，09:44:13至09:58:12上海时间；本代理随后退出全部浏览器/服务并完成1.8秒离线封存，完整释放source/CPU/GPU给C7诊断。首轮failed链仍原样保存，下面保留其归因与修正依据。

C6只缩窄App失败处理：VIEWER中的普通返回按钮capture-error继续走原定暖纸降级；只有已经RETURNING的竞态才保留匹配缓存。C5中断记录、C4独立Back失败及其局部soak通过均保持原样。此前的pass或interrupted不作为C6的同包通过。

实际起始绑定已独立核对825产品＋4配置＝829输入，以及5个真实包文件，全部与C6 freeze相同；准备证据`candidate6-audio-runtime-preparation.json`。soak自己的41核心/333活跃资产/825产品/5包首末均稳定；两次六套链自己的825产品/5包/9驱动首末也各自稳定。稳定不消除首轮真实断言失败，完整通过仅对应上述重新从头执行的第二链。

本次soak有820个实际采样点，最大分段原生进度/墙钟差58.933ms；读笺实际音乐增益为−5.9414至−5.9343dB并恢复。全程1个AudioContext、3个loop；显式关闭后context为closed且3路均请求stop并disconnect。26个快照URL显式回收22个，4个有意的缓存各属一卷；两次花笺URL均显式回收。JS、console、资源及URL错误均为0。此时可选JS heap采样5,889,676至61,132,092字节，不代表VRAM、全进程占用或强制GC后的泄漏结论。

首轮六套run `final-regressions/2026-10-23T01-13-37-572Z/validation.json`于09:26:59结束。UI83、audio15、runtime34/80节点/118次原文展示、journey9与四卷subpath各自通过；settings在15个已通过检查之后失败于`validate-peony2-settings-driver.mjs:229`：模拟hidden后立即读取canvas进度0.417039，400ms后为0.417095。现场`rafRunning=false`、`shaderWarmup.hidden=true`。代码上hidden handler同步取消RAF/停止/持久化position，但canvas的React提交可能尚未完成；这只是待实证的取样竞态假设，尚未改测试/产品、未加误差容限、未重跑。失败报告/执行driver/截图保持原样，已通知root并释放本代理浏览器/服务/GPU。

随后经root允许做独立、同C6包的25次真实autoplay/hidden复现，见`candidate6-hidden-commit-analysis.json`：18次立即canvas诊断与同步保存控制器位置不同，3次在hidden之后诊断进度才更新，但25次同步sessionStorage字符串、暂停提交后的原始range值、原生WebGL绘制计数及canvas renderCount/rafTicks在400ms窗口均不变。实际时序与原失败相同，证明诊断值晚更新可以产生该断言反例；不能把data-progress直接解释为已绘帧。尚未据此修改正式9驱动或把首轮fail改成pass，下一步需review后重验。独立probe第一版因要求input数值表示与session全精度相等而timeout的旧失败、当时probe源码也完整保留；第二版观察到raw input字符串与保存字符串的尾数表示不同，step实际为any，并未使用epsilon。

root审阅上述实证后明确授权仅修settings hidden小块，原9驱动及首轮21件真实报告/日志先按字节归档于`candidate6-settings-commit-failure-archive/archive-manifest.json`。新方法在同次dispatch后保存同步session字符串及renderCount/rafTicks，等待“自动展卷”按钮的真实暂停提交后保存raw input字符串，400ms后要求四者各自严格相等，canvas请求进度仅记录；不跨字段比较不同浮点序列化、不增加容差或碰运气睡眠，仍保留18项规模及后续真实GPU恢复/设置检查。

唯一变更驱动`validate-peony2-settings-driver.mjs`新SHA为`42fef886ed1d500ddfeb4bd83a0c5826e61ec5a649c76f9c02623fec6b695fce`，语法通过并在启动前固定源码副本与完整9哈希，见`candidate6-settings-retest-preparation.json`。字节比对确认只有获准hidden块变化，前后全部其他内容及LF保持。新run `final-regressions/2026-10-23T01-44-13-093Z/validation.json`于09:44:13开始完整串行六套并实际全部通过，未继承首轮五套通过；仍以同一C6产品/包及实际787.816秒soak门控。

## 执行链

1. `node scripts/validate-art-renewal-soak.mjs --build-dir tmp/art-candidate-6-dist`：真实两轮四卷，原生rate1，完整自然时间线与encounter读笺、返回卸载、续看、下一卷、花笺预览/降声/释放。最终显式关闭原生声音并核对stop/disconnect/context关闭。不加速或缩短，没有`--build`。
2. 本次soak成功后执行`node scripts/validate-art-renewal-final.mjs --build-dir tmp/art-candidate-6-dist`，只有真实同包soak的产品/包哈希匹配才继续。串行83 UI、15声音、original-mode正文桌面runtime、journey、settings和四卷子目录。各套独立唯一目录，不覆盖旧失败或旧说明。
3. 已独立复核C6 freeze、报告/驱动/日志/真实截图SHA，并确认自己的浏览器与服务结束后通知root释放GPU。由于新的用户反馈，窗口交给C7输入/布局诊断，C6不录正式导览。

同引擎与三MP3不变，不重复此前623秒三轨波形同步；本轮正常15声音与完整全站生命周期仍重跑。采集JS heap/DOM/应用纹理估计不冒称VRAM或全进程内存。

## 导览检查器已在新片之前固定

`candidate6-tour-checker.mjs` SHA256 `33d1fc388507adcec7d0bf70fecd19b57ec4367edfb324528321415c5d402ed7`，与当前canonical `validate-tour-recording.mjs`相同。必须显式传`--candidate6-build-manifest`；候选编号6、实际目录和冻结code完整集合必须匹配，另保留font双绑定、真实JS年代注与renderer/ShaderWarmup源身份四项。旧4/5/stage checker副本保持。

轻量反例用真实旧stage影片元数据＋C6 freeze，正确在bundle/renderer两项失败，candidate=6、identityVerified=false，见`candidate6-tour-negative-stage-test/metadata-validation.json`。没有制造虚假C6录片输入，也未因反例启动新浏览器/读取PCM。

完整35 required与端点required:false规则不变：末样本/位零/峰/RMS是观测，没有事后dB门限；采样连续、实际写入/process计数、最终context覆盖、有限且无削波仍必须通过。

```powershell
node reports/art-renewal/validate-tour-recording.mjs --run-dir <actual-C6-tour-run> --report-dir <new-C6-tour-report-directory> --candidate6-build-manifest reports/art-renewal/art-candidate-6-build.json --with-pcm
```

C6导览尚未录制/核验，按root新排程不再录制。未来最终包需另行固定对应候选的显式身份检查器，不能用此C6分支把C7录片命名为已通过。录片只能证明具体同包实际交互节选的完整性，H264/AAC有损、CDP源帧间隔非原画显示FPS；不能单凭本报告称线上部署或跨GPU认证。
