# 导览录制器静态审查与诊断边界

2026-10-23。最初只读审查主录制器；之后经root明确授权，修改独立`exhibition-tour-audio.mjs`增强诊断，并进行离线PCM分析、独立原生参考实验及有证据的录制时标修正。没有修改产品、原画或作品音轨。以下先保留初次静态审查快照，末节另列后续实验与修正，不把参考证明或短捕获扩展成完整App录制通过。

审查快照：`capture-exhibition-tour.mjs` SHA256 `f9fbd5ec7982bde4b92d5f71c8c0af9f3a39025bdd9fb6364fa2c7c17a19b8fc`；增强后helper SHA256 `7226ef7c14ea282d2ae9e033e555bb2feee72eaa784791e901c518b3abfd0461`。旧helper SHA为`7ef1819fa0c1d70d5fdf581b2cd2179561ddf62a1b1d493e4efed466eba2472a`，逐字节副本及说明保存在ignored目录`tmp/art-renewal/tour-audio-history/2026-10-22T23-11-01-718Z/`。主录制器由root继续修改；后续版本须以实际录制JSON内SHA为准。

## 时钟、声路与声明

录制器读取CDP画面交换的UTC秒时间戳；AudioWorklet给出源context的帧位置，`getOutputTimestamp`把音频输出contextTime与performanceTime联系起来。公式`(timeOrigin+performanceTime)/1000-contextTime`求context零点的epoch，再加`firstFrame/sampleRate`求首样本时间，单位和偏移方向正确。正offset在片头补出启声前的无声时间，负offset裁去早于首画面的声音。这里的片头/片尾对齐填充与修补音轨内部丢样不同，不能用它掩盖PCM连续性错误。[W3C输出时钟说明](https://www.w3.org/TR/webaudio-1.0/#dom-audiocontext-getoutputtimestamp)、[CDP Page原始协议](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Page.pdl)、[UTC秒定义](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Network.pdl)。

当前公式取全段offset中位数，另保存spread；它没有证明全段无漂移，也没有给出误差阈值。成片统一30fps，正延迟还经毫秒取整，不能称样本级视听同步；建议声明“按原生输出时间估计与画面时间戳对齐”，同时发布实际clockSpread、首末时钟及视频帧间隔。`adelay`默认以毫秒计，支持另用样本单位，但改成样本单位也不能取消视频帧粒度与时钟估计误差。[FFmpeg adelay](https://ffmpeg.org/ffmpeg-filters.html#adelay)。

当前产品第一条destination连接确为共享声图master：弦句/清气经music/filter，绢雾与短声接master，用户音量在master。因此tap读到真实音乐、duck、氛围和短声；没有外置配乐替换。原master→destination连接保留，额外tap→零增益支路不向扬声器叠加声音，worklet输出也未写入非零数据。包装先调用原生connect/start并保留返回值，不修改source.when、offset、gain、loop或产品context时钟。它仍增加处理负担，不能称零性能影响。

录制器只捕首次匹配context；本次流程只主动开启一次声音、结尾关闭，符合这一限制。三条原生loop的when/duration/offset/channels/rate有真实记录，短声经过同一master一并捕获；若以后录片流程增加关声再开或context故障重建，须扩展多context记录，不能静默沿用第一次context。

原始Float32捕获可称未压缩PCM；成片使用JPEG源帧、H.264与AAC192k，属于有损导览节选，不是无损录屏、全程四卷实播或原画像素验收。脚本中“原速节选/真实交互”与实际短段播放、按钮引导和第四卷后半连续播放相符。编码中的`apad`只用于影片尾部对齐，不是内部补洞。

## 实际失败及增强内容

root报告`tmp/exhibition-tour/2026-10-22T23-03-31-867Z/`走完产品交互后，原PCM检查发现上一包终点1687552、下一包起点1687424，重叠128帧。旧helper会让第一次断言拒绝整条Promise写链，后续原始PCM无法继续写，且finish等待pending拒绝时未返回browser state；它不足以定位是原生currentFrame、port/binding顺序还是其他原因。已有8.78秒App证明没有覆盖约35秒处，不能据此宣称长录制稳定。普通4096帧包在未armTail时出现128帧重叠更像worklet已flush异常前的partial，但这是待证推断，不是Chromium根因结论。

按root授权，helper现逐次记录processSeq、PCM packetSeq、全部portMessageSeq、浏览器bindingCallSeq和Node receivedIndex；异常记录expected/actual/currentTime、前一/当前/后一量子的帧数与FNV位指纹。前后指纹用于定位，哈希相同不能单独证明听觉或全部样本相同，且静音量子本来可能相同。

所有原始包仍按收到顺序写入，连续性、序号、元数据及I/O问题累计在violations中，finish仍严格失败；没有补静音、去重、重排或改产品时钟。每次实际`bytesWritten`被循环累计，writtenFrames由真实写入字节计算，另列min/max/globalSpan与声明帧数，不再拿end-first掩盖重叠。Node文件API返回实际bytesWritten，显式顺序等待与部分写入循环有必要。[Node FileHandle.write](https://nodejs.org/api/fs.html#filehandlewritebuffer-offset-length-position)。

finish先保存browser state，再以allSettled等待绑定，失败后async diagnostics仍返回初始/最终/live state、全部received/packets、时钟/状态变化/异常及实际总量。初始化失败会关闭文件；dispose清理tap/端口/时钟监听、移除observer专属边，并仅在仍属于自身时恢复prototype包装，不停止产品音乐context或source。已实际执行`node --check`，并用`vm.Script`单独解析内嵌worklet文本；两项只证明语法，不证明原生采集无gap。新版长捕获结果由root后续实际JSON补证。

## 主脚本仍须关注的失败路径

在上述主脚本SHA中，帧回调直接保存`writeFile` Promise，直到片末才Promise.all；写盘若提前拒绝，可能先成为unhandled rejection。已即时通知root：应在每个Promise创建时捕获并累计frameWriteErrors，最终仍fail，并在所有退出路径stop screencast及allSettled排空帧写入。当前catch已新增失败audio diagnostics、frames.json及排空，但不替代每个写Promise的即时错误监听。此问题与128帧重叠没有已证因果关系。

此外，发布前应查看实际context状态及首尾样本范围：现有armTail在关闭音乐前清空partial并逐量子flush，主脚本再等产品淡出/关闭后finish，方向合理；单靠“等待1000ms”不能作为任何机器上最终样本齐全的通用保证。若以后允许active context直接finish，应新增明确停止/末包握手，避免把端口关闭当作所有未来消息已排空。最终是否覆盖淡出至安静、实际时钟spread是否可接受、视频尾时长和声音头尾是否合适，应依据成功新run的原始记录审查，本报告没有试听或处理音频。

## 后续原生参考、错误前提与修正

本节更新于2026-10-23；前述“没有处理音频”等表述是初次静态审查的阶段边界。本节已经实际分析原始Float32 PCM，并在独立无WebGL页运行原生参考，但没有声称试听。主脚本已由root增强帧写Promise即时catch、片末强断言、失败路径stop/drain；本次看到的主脚本SHA为`95e22c96a086aa62a4f47ab9c8731d1dd5324cc13207feabe63f89e3f4c51fa2`，原先指出的问题不应继续当作该新快照的已知缺陷。完整App成片须以主脚本自己的新run为准。

增强诊断版实际App run为`tmp/exhibition-tour/2026-10-22T23-16-37-522Z/`。它保留完整7,873,024帧PCM，2137包的packet/port顺序正常。两处native global标签分别少前进128帧、下一量子恢复；前一和当前量子的Float32位指纹不同。离线报告`tour-pcm-quantum-analysis.json`只支持“不是逐样本重复，疑似标签冻结”，不能单凭不同哈希或正常包边界幅度证明声源相位连续。该App run仍是原始failed结果，没有回填为pass。

为独立检验标签与实际声音，建立60秒原生参考：左声道由原生ConstantSource的a-rate AudioParam线性斜坡编码真实声源采样序号（除以2^32），右声道由独立原生997Hz Oscillator产生。参考生成不使用worklet的`currentFrame`。固定merger/master保持连接，另以12个无输入GainNode每8ms连接/断开destination制造可复现graph竞争；没有WebGL、产品代码、fake clock或PCM修补。

三个实际run分别保留，未覆盖旧报告：

| 独立run | 当时helper的严格结果 | 未编辑PCM的独立参考 |
| --- | --- | --- |
| `2026-10-22T23-26-48-570Z` | failed：旧版把native标签视作每包的实际采样位置 | ramp误差≤0.25帧，sine相关系数0.99998957；实际PCM连续 |
| `2026-10-22T23-37-35-204Z` | failed：仅允许单量子冻结，遇到4量子标签保持不变 | 同样全部实际采样连续；`tour-native-clock-reference-v2-analysis.json`明确保留failed |
| `2026-10-22T23-43-28-035Z` | passed：累计实际process帧为主序，逐量子native标签独立严格审计 | 11项检查全部通过；正式参考证据为`tour-native-clock-reference-v3-analysis.json` |

第二次失败额外证明：native标签在209280保持不变，实际process累计位置依次前行209408、209536、209664、209792，随后标签精确回到209920对应的原有absolute offset；这些位置的斜坡采样仍全部连续。因此“必须每个global标签都递增”以及后来“最多只能冻结一个量子”都是错误的时标前提。不同量子位指纹只是定位线索；独立原生逐采样斜坡与sine才提供连续性证据。当前没有确认某个Chromium构建符号层面的完整根因，不把可能的graph锁机制写成已证浏览器缺陷。

最终helper SHA为`c3ce6432133fa6403c40a7842473ee0894f8f2631d591289c47faa00017dd4c3`。包的`startFrame`现在明确指实际process累计帧；原始`nativeStartFrame`和每量子native global仍完整保存。没有删样本、补样本、去重、重排或改变产品声图。稳定的`nativeGlobalFrame−counterFrame`确定绝对锚；最初一个标签若冻结，不会直接拿它把整段对齐错128帧。每个process的序号、累计帧、包首尾量子偏移、binding/port/packet顺序与实际写入字节相互校验；实际写入量必须与全部process累计帧一致。native标签跨度另列，不拿它替代实际写入量。

唯一允许的native metadata模式是**完整的恒定标签冻结段**：必须从已知稳定标签开始，native标签逐次保持同一个值，实际每process严格前进128帧，随后精确恢复同一稳定absolute offset。首段只接受可由后续稳定锚核实的起始冻结模式。段长和每步−128/−256等偏差原样记录，规则不是一般的±N帧容差。未恢复的片尾、持续offset改变、跳到不同offset、实际process漏调/乱序、包缺失、边界或I/O错误仍严格fail。首段/中段/四量子冻结、真实漏调后持续偏移、不恢复、乱序、NaN等17组正反断言，以及100量子12,800帧逐Float32相等的mock-worklet包结构检查，见可复现`tour-clock-counter-tests.mjs/json`；mock不冒充原生证明。

最终同压力原生run的22,725个process对应2,908,800实际帧、23,270,400字节，0 packet/port/write gap。181,776次graph修改保持原压力；11次单量子与2次双量子标签冻结均精确恢复。2,879,744个有效ramp参考样本最大误差0.25帧，误差≥0.5帧为0；sine相关系数0.999989573755、最大绝对误差3.9544e−6。原始PCM SHA256为`40197ba8aa98c1e1e87ae0736785940366f48d1da4133db987c71595303a7661`，恰与更早参考实验的完整PCM一致。输出主时钟epoch spread实测0.2432ms；当前helper另强制spread≤1/30秒，超出一帧不默许成片。

源码历史均逐字节保留在ignored `tmp/art-renewal/tour-audio-history/`：初版`23-11-01-718Z`、诊断版`23-32-45-278Z`、单量子规则版`23-39-36-287Z`、最终版`23-44-23-313Z`。原失败App和两次失败参考报告均未修改。最终参考通过只授权按该helper重新录制完整App，不能把原先失败的App录片改称成功，也不能把video同步精度说成样本级。

可在项目根目录重现（需设置本机Playwright模块与Chromium路径环境变量）：

```powershell
node reports/art-renewal/tour-clock-counter-tests.mjs
node reports/art-renewal/tour-native-clock-probe.mjs
# probe输出本次新run目录后，将该目录交给分析器，使用新的报告文件名
python reports/art-renewal/tour-native-clock-analysis.py <new-run-directory> --output <new-report.json>
```

独立probe与分析器随报告保存，参考页结束后会关闭context、浏览器和本地服务。最终完整App录片的首尾淡出、所有真实声源、资源释放及音视频映射仍由新录制run验收；本节没有把这60秒已知参考信号当作最终作品配乐或最终导览音轨。
