# 候选4声音、演播与运行回归

当前状态：**C4八卷次实速演播已完成并封存，21/21通过；六套回归未运行，按root指令移至后续C5**。实际run为`soak/2026-10-23T00-30-06-094Z/validation.json`，exit0，实耗787.598秒；完成于上海08:43:13，独立封存见`candidate4-soak-seal.json`。本轮按root排程与原画/启卷/诗意功能检查并行，不称安静环境的性能基准。没有自行重建或更改包，也不沿用候选3结果冒称通过。

**候选4整体暂未验收**：root同步原画59帧/243结构及22展示检查通过，但独立snapshot15的最后browser Back预览为空，前14项通过；art正在诊断。当前已按root最新指令完成并封存同源soak，通知source可释放给C5最小修复；六套检查移至C5。source/public/三个包在本次首末校验间未变。局部通过只适用于本轮覆盖范围，不能覆盖该独立失败或称C4全站已通过。

冻结入口为`art-candidate-4-build.json`，含829个源/资产/配置输入、5个实际代码文件hash、同源字体hash与展示库存hash。当前静态准备记录为`candidate4-audio-runtime-preparation-v2.json`，旧v1仍保留；静态准备时只读取包的代码、字体与清单，没有启动GPU/浏览器。后续实际结果另按唯一run目录记录。

## 已保存的历史

`candidate3-audio-runtime-archive/archive-manifest.json`已逐字节核对53份记录，共7,696,792字节：包含候选3的soak/六回归指针、完整报告和小JSON/log、原说明，以及9份与候选3验收SHA完全相同的验证驱动。原来的唯一run目录、失败记录、截图与候选3说明均留在原处。候选4不覆盖这些说明。

## 实际执行与后续

1. 已执行`node scripts/validate-art-renewal-soak.mjs --build-dir tmp/art-candidate-4-dist`：两轮四卷，原生时钟、不加速，真实读笺/结束/续看/再展/返序厅及花笺。核对实际context/3个loop、阅读降声与恢复、快照消费者/每卷缓存、卸载、错误和内存可测范围。没有`--build`。
2. 本次21项全通过，8次原生时间线完整游观，41个core、333个活动原画/MP3资产、825个产品文件与5个包文件首末相同；独立核对825产品加4配置与C4 freeze的829输入一致，8张卷末截图真实SHA匹配。0页面/console/资源/URL错误；native播放段最大wall时差41.4ms，仅为这次并行功能检查的实际观察。
3. 八次encounter读笺实测−5.9414至−5.9343dB，两次花笺预览的降声/恢复与URL释放另通过各自断言。最终1个context关闭，3个loop都实际收到stop与disconnect；26个快照URL中22个显式revoke，保留每卷1个缓存，2个花笺URL全部revoke。没有把document关闭当作显式revoke或把JS heap当VRAM。
4. **没有启动C4六套链或新C4导览**。后续完整UI83、声音15、original-mode runtime、journey、settings、子目录与新导览移到C5。仍需真正同包soak门控，不能将C4的pass指针用于不同C5包；当前`final-regression-latest.json`继续指向历史C3，未生成C4六套结果。3条MP3与引擎未变，本轮不重复此前623秒波形实验。

## C4导览检查器

`validate-tour-recording.mjs`已有显式`--candidate4-build-manifest`分支：原来的四项stage身份检查被替换为实际C4冻结bundle匹配、同源字体、真实JS中的年代注、集成renderer/ShaderWarmup标记及其源hash绑定。不会因包目录不同而悄悄少检查；完整模式另强制required数量为35。传C4 flag时强制走C4校验，不能对旧base影片仍走旧分支冒充通过。已用真实旧stage run和真实C4 manifest做轻量反例，如期在bundle/renderer两项失败且identityVerified=false（`candidate4-tour-negative-stage-test/metadata-validation.json`）；没有伪造C4录制输入，也未读PCM或开浏览器。新C4影片尚待真实录制。

当前预固定副本为`candidate4-tour-checker-v2.mjs`，SHA256 `409c099ae4c1640ed5ba697ef3e1d96b0baa8517af2323af1132b176ce4edf34`。Poetic agent独立只读审查确认四项身份检查、35 required计数、端点观测及旧stage反例护栏无阻断；未来实际报告仍必须绑定当时真正执行的checker字节。

端点规则在C4录制前固定：数字零、末样本、尾窗口峰值与RMS为`required:false` observations，不引入事后dB或听觉阈值。真正的连续性、实际写入/process计数、关闭末帧完整覆盖、所有PCM有限且无削波仍required。旧stage的错误位零断言失败与其归档源码不变。

```powershell
node reports/art-renewal/validate-tour-recording.mjs --run-dir <actual-C4-tour-run> --report-dir <new-C4-tour-report-directory> --candidate4-build-manifest reports/art-renewal/art-candidate-4-build.json --with-pcm
```

源帧间隔仅按真实CDP时间和字幕列出，不称原画显示FPS或通用设备性能。H264/AAC导览属于有损节选，不能替代原画59帧保真、全部字体排版或整站发布验收。
