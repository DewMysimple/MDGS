# 候选5演播、声音与完整回归

当前：**按root明确指令安全中断，未完成八卷次，六套回归未开始，不是pass**。冻结包`tmp/art-candidate-5-dist`，身份为`art-candidate-5-build.json`；实际run为`soak/2026-10-23T00-50-53-862Z/`。原始partial `validation.json`字节保留，采用状态入口为`validation-interrupted.json`，另有`interruption-seal.json`。没有build或修改产品/包，测试按root功能窗口与其他验收并行，不是安静性能基准。

Root在独立快照专项中真实复现C5正常返回按钮capture-error未进入原定fallback：保护RETURNING已有cache的条件被扩到了VIEWER。Root将以C6恢复VIEWER失败降级，只保留RETURNING竞态保护，并明确要求中止已知缺陷候选。本soak自身已持久化5个检查通过、2卷次结束、270个样本，最后在首轮第三卷0.565；这些是partial覆盖，不能升级为八卷次验收。

停止通过SIGINT/Ctrl+C，观察退出码1。自身soak Node不再存在、专属preview `127.0.0.1:11798`拒绝连接；未终止其他浏览器/进程。停点独立核对829源/资产/配置与5个包代码SHA仍精确匹配C5 freeze，2张卷末PNG实际SHA匹配。最终音频stop/disconnect断言没有执行，不能把浏览器结束当作产品显式关闭或URL revoke。`soak-latest.json`现指向interrupted，不能被后续六套误用为pass。已通知root source/GPU释放。

C5相对C4修复App/hook的viewer-origin history返回快照顺序与并发返回所有权，并更新provenance；原生renderer、ShaderWarmup、MP3及声音引擎未改变。旧C4八卷次21/21与独立Back失败均保留；没有把C4局部通过改称C4整体通过，也没有用它替代新C5的同包门控。

起始绑定已独立核对：825个src/public/index产品文件、4个配置与5个实际包代码文件全部匹配C5冻结清单829输入。记录与预固定导览检查器见`candidate5-audio-runtime-preparation.json`。

## 原计划与中断后的恢复

1. 真实八卷次：两轮四卷自然时间线、每卷encounter阅读降声与恢复、自然结束、真实返序厅/再入续看、下一卷、花笺预览与释放。原生rate1，不改时钟、不缩短影片。
2. **未执行**C5六套回归；因root中止，移至真正冻结的C6及其新同包soak之后。仍需串行UI83、声音15、original正文桌面runtime、journey、settings和四卷子目录，每套用独立run目录，不接受C4 pass或C5 interrupted指针作为同包通过。
3. C6身份另行校验，不能重写C5 partial或把本次旧source hash重新贴成新包稳定。C5没有录制新导览；下述预固定checker只是C5准备，不是影片验收。

## 导览预固定检查器

新片前已归档`candidate5-tour-checker.mjs`，SHA256 `c083f47d6ca8f9d9837798bc1c2a7fcbdc5fd468f068d84ab498e21580f0ffbd`，与当时canonical `validate-tour-recording.mjs`字节相同。必须传`--candidate5-build-manifest`，验证候选编号5、实际目录与冻结代码完整集合；并检查同源font、真实JS年代注与集成renderer/ShaderWarmup源绑定。不会仅因font/renderer和C4相同就接受旧包，也不会静默跳过四项身份检查。

已用真实旧stage run＋真实C5 manifest运行轻量反例，准确在bundle/renderer两项失败、candidate=5但identityVerified=false，见`candidate5-tour-negative-stage-test/metadata-validation.json`；它不是C5产品失败，不代表已有C5影片。没有启动额外浏览器或读PCM来做这个反例。

完整检查固定35 required。尾部位零/末样本/峰/RMS均为required:false observations，不替换成事后dB或听觉阈值；真正连续性、实际写入/process一致、完整关闭覆盖、有限且无削波仍required。C3/stage/C4所有旧checker及错误前提失败证据保持原样。

```powershell
node reports/art-renewal/validate-tour-recording.mjs --run-dir <actual-C5-tour-run> --report-dir <new-C5-tour-report-directory> --candidate5-build-manifest reports/art-renewal/art-candidate-5-build.json --with-pcm
```

导览为实际交互节选，H264/AAC有损；通过上述录制完整性检查也不单独证明整站已发布、所有GPU一致或原画显示FPS。最终判断须连同原画、快照、启卷、字体与正文专项的真实C5结果。
