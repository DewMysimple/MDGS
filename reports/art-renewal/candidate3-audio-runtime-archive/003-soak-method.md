# 两轮原速演播与生命周期验收方法

入口：`scripts/validate-art-renewal-soak.mjs`。只输出方案、不启动构建/浏览器：

```text
node scripts/validate-art-renewal-soak.mjs --plan
```

设置既有 `MDGS_PLAYWRIGHT_MODULE` / `MDGS_TEST_BROWSER` 后，在核心代码冻结期间运行：

```text
node scripts/validate-art-renewal-soak.mjs --build --build-dir tmp/soak-dist
```

脚本固定四卷两轮，不提供加速、缩短轮次或fake-clock参数。四卷原生时长100.7667/71.7/68.9/59.9667秒，两轮合计602.6667秒；加上真实入卷、读笺、返回、续卷和下一卷，预计约12–14分钟。这里的时长是源帧端点差除以源fps，不是以显示器帧数推算。

每次运行生成独立 `reports/art-renewal/soak/<UTC时间>/validation.json`，`soak-latest.json`只指向最近一次实际运行及其状态。失败或部分执行不会冒称八卷次全部通过。实际截图在ignored的 `tmp/art-renewal-soak/<时间>/`，报告记录SHA256。

## 真实浏览路径

从序厅主动启声一次，进入第一卷。每卷用原生“自动展卷”播放至实际交互目标附近，通过真实“画中有遇”按钮进入；该按钮本身会轻微校正到作者定义的交互进度，脚本如实记录这一UI seek，不冒称播放完全无中断。分别切换传说/史料、花舟桥视线、键盘选花入锦、展读/合上原诗，测量原生music GainNode的约−6dB读笺衰减。关闭后音量恢复，再用真实自动展卷从该位置继续至精确1.0与卷末。

随后实际返回序厅，验证原画canvas卸载及旧原生GL上下文释放；重新选择同卷，验证保存的1.0位置、原生末帧和续卷快照，再从题跋点“展开下一卷/重游四卷”。第二轮依靠真实“再观此卷”回到0，再原速播放。第四卷每轮另打开/关闭一次花笺预览，以区分其临时URL和快照缓存。最后返回序厅并主动关闭声音，验证原生context淡出后关闭、三循环源均实际收到stop()/disconnect()。ended事件是否已经派发另行记录，不要求它与context.close同步。

自动播放按每段实际进度变化与 `performance.now()` 墙钟比较，没有替换Date、RAF、AudioContext.currentTime，也没有改播放速率。脚本不依赖固定15秒sleep推断状态；长段期间每秒取样，按真实进度和DOM阶段推进。

## URL与原生资源计数

原生 `canvas.toBlob`、`URL.createObjectURL/revokeObjectURL` 被透明观察，返回值和时序不变。通过实际toBlob尺寸/当时卷号，把源画快照与1200×1600花笺预览分开计数。URL创建累计值不等于泄漏：

- 稳定HOME/VIEWER且没有加载层时，每卷未撤销快照URL不超过1，总计不超过4。
- 过渡中旧快照若仍由加载DOM、handoff图像或data-painting-src引用，可暂时与新缓存并存；它们与尚在传递中的新URL分开记录，不按“缓存大于4”简单误报。
- 稳定关闭花笺后，其预览URL应明确撤销；已经关闭的dialog里残留的img src字符串不当作活跃消费者。
- 活跃快照消费者不应指向已经明确撤销的URL。缓存保留本身合法；文档退出引发的浏览器自动清理不伪称为主动调用revokeObjectURL。

AudioContext、GainNode、BufferSource和GL/canvas观察均用WeakRef，避免测试保存旧对象强引用。三条loop源与短促one-shot提示音分别统计；“同一context、累计三条循环源”不禁止合法的启卷、读笺、落印短声。GL释放根据真实context lost状态/对象可回收状态与DOM卸载观察，不以移除canvas单独证明显存已经归零。

## 内存与绑定边界

只采集浏览器实际提供的 `performance.memory`、CDP `Performance.getMetrics` 中JSHeap值、DOM文档/节点/监听计数，以及SceneRenderer自己的纹理字节预算。JS堆不是显存；应用纹理估算也不等于驱动总VRAM，均不包括全部framebuffer/驱动缓存/其他进程。未强制GC，不把峰值或尚未GC的堆增长直接判为泄漏，也不以这些取样证明整个进程绝无泄漏。历史记录主要存Node端，浏览器只保留较小的观测索引。

绑定独立生产JS/CSS/HTML及实际HTTP HTML、App与clock/hooks/snapshot/audio/encounter等核心文件、全部src/scene模块；四卷完整运行资源及三条实际音轨逐文件比较public和生产包SHA256，并在结束复核。另记录全部src/public/index.html的前后hash与changedProductFiles，不把未进入核心清单的修改默认为没有发生。核心或包/资产改变会失去绑定；只有其他product修改时标为pass-core-only-product-changed，不宣称当前完整前端稳定。无关报告可以继续工作，不能替换正在演播的独立生产包。这不替代原生59帧像素回归、25段原文回归或最终83组UI验收。

本方法文件只描述脚本能力。某次实际是否完成、检查数量、八个卷次结果、错误、资源计数和内存样本，以该次JSON与latest状态为准。

首份诊断`soak/2026-10-22T21-33-19-100Z/validation.json`保留为失败：第1卷读笺源帧已精确为1969，原生music增益约.50445、暂停正确，页面无错误；新harness却把step=.001的range显示值.651与交互目标.651008931直接作1e-7比较，误判精度。已仅修测试：源帧用精确值核验，range允许半个步长量化；静止检查同时等真实RAF/读取/纹理队列停稳。这不是产品修复，也不计作完整演播通过。随后重新从序厅开始固定两轮，未从该卷中点续跑来凑次数。

第二份`soak/2026-10-22T21-37-56-189Z/validation.json`完整执行798.653秒，8卷次全部完成、前20组通过，最终第21组因要求context.close后立即派发三个ended回调而失败；实际context已closed、sourceCount和retiredGraphs均0。原档维持fail。改进harness为直接观察每个原生source.stop/disconnect调用与context关闭，不再把事件派发时机当同步保证。该次运行只绑定选定核心，不含NarrativeCalligraphy；root随后明确报告它在运行期间修了手动samebucket行为，本文件没有为旧运行补写一个当时未采集的NarrativeCalligraphy起始hash，也不将该次当统一新版最终证据。再次改用统一候选2包`tmp/art-candidate-2-dist`（index-BmVq5_Bq.js / index-Bc7VfaY-.css）完整从序厅重跑，追加全部product前后hash；最终是否通过仍看实际新JSON。

## 统一候选2的完整运行

[`soak/2026-10-22T21-55-32-202Z/validation.json`](soak/2026-10-22T21-55-32-202Z/validation.json) 实际完成797.064秒、8卷次、21/21组通过。完成于2026-10-23上海06:08:49；当次40项选定核心、824项src/public/index.html、333项实际原画/音乐资产及生产包前后均未变化。8张卷末截图的SHA已逐一复核。JS、console、HTTP资源及URL消费者违规记录均为空。

十次实际阅读（8处画内相遇、2次花笺）测得music增益−5.941至−5.934dB，关闭后恢复至至少0.997。16段原速自动播放的墙钟与源进度差最大378.6ms；四卷两轮源片时长602.667秒，观测到的累计前进603.735秒包含交互按钮的小幅回定位重播，不把两者混为一项精确值。一次原生AudioContext、三条同ID循环源贯穿全程，最后三源都实际stop/disconnect、context为closed；此时ended事件尚未派发，报告如实保留null。

共创建26个原画快照URL，明确撤销22个、保留每卷1份缓存；2个花笺URL全部撤销。最后HOME没有原画canvas，17个实际原画GL和26个展开GL均已lost且脱离DOM，仍挂载的可选首页颜料GL属于正常首页。827份内存取样中的CDP JS堆范围约5.62–61.60MiB；不作VRAM、进程总内存或绝无泄漏的结论。

同一候选的独立专项随后发现“展开途中取消返回”的收卷纸面缺陷，主任务准备修复。本次路径是实际卷末后返回，没有覆盖该取消路径，故此通过不等于候选2全站通过，也不用于替代修复版的验收。原报告与hash封存，不在修复后补写新hash。83组UI、15组声音与四类完整历史回归等待修复后的统一包。

串行最终回归入口已准备为 `scripts/validate-art-renewal-final.mjs --build-dir <冻结生产包>`：先确认同包完整soak，再逐条运行UI、声音、原作模式runtime、journey、settings、subpath。独立目录保存真实命令/日志/退出码、新鲜报告及SHA、实际新截图SHA、全部产品和驱动前后hash；不会在运行时构建或替换包。入口语法已检查，当前尚未执行，不提前计为通过。

最终入口不提供默认生产包，缺少`--build-dir`会在任何落盘/浏览器启动之前拒绝；`--plan --build-dir <路径>`只显示计划。UI新增可选`--report-dir/--shots-dir`，声音新增`--report-file`，四类历史wrapper新增可选`--report-dir/--shots-dir`，默认单独运行仍兼容旧入口；最终串行入口为它们逐一传入该次独占目录。因而既有`ui-all-validation.json`、`audio-final-app-validation.json`和历史`runtime/*-latest.json`不会被这条最终链覆盖；只有总索引`final-regression-latest.json`更新到最近一次真实运行。语法、计划和缺少显式包参数时的拒绝已实际验证，完整链仍等待新冻结包。

## 统一候选3的完整运行

取消收卷修复及有据文案修订后，使用冻结`tmp/art-candidate-3-dist`重新从序厅完成两轮原速演播，没有借用候选2结果替换hash。HTML SHA为`806eb52d8a41bcc4774d1253902b58fecc4734225d77b6f889f6ec726410a769`，JS为`index-C6ZfivTN.js`、CSS为`index-Bc7VfaY-.css`。正式证据为[`soak/2026-10-22T22-18-57-289Z/validation.json`](soak/2026-10-22T22-18-57-289Z/validation.json)。

本次796.627秒、8卷次、21/21组通过，完成于上海2026-10-23 06:32:13。40项核心、824项产品、333项原画/音乐资产及生产包前后均未变化；8张真实末景截图SHA逐一复核。827份取样无JS/console/HTTP错误或失效URL消费者，16段原速的墙钟/源进度差最大46.667ms。十次阅读实测−5.984至−5.934dB；仍只有1个实际AudioContext、3条同ID循环源，最终均收到stop/disconnect并关闭context。

26个原画快照明确撤销22个、各卷保留1份；2个花笺预览全部撤销。JS堆实测范围5,867,080–64,462,428字节，只是本机CDP JS堆取样，不代表VRAM或全进程内存。取消中途的完整收卷由独立启卷专项覆盖，本次完整长测不代替该专项。新包的83UI、15声音和四类历史链已在同一冻结包启动，其最终状态仍以独立`final-regression-latest.json`为准。

随后这一冻结包的六套串行链全部通过，完成上海06:47:20：UI83、声音15、原作运行34、旅程9、设置18、子路径1综合/四卷。824产品、5包入口文件、9驱动前后均稳定；详见[完整回归说明](final-regression-notes.md)，不再把上文“等待/进行中”的历史恢复点当作当前未完成状态。
