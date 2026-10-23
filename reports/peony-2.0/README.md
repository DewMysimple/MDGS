# 牡丹2.0当前验收记录

活动源为`peony-2.0-2026-10-22`。本页记录2026-10-22至23的实现与实际验证，功能、原生资源、CPU和生产浏览器验收均已完成，Git交付尚待最后核对。下面结果均引用本轮报告；上一轮`reports/new-scrolls/`的pass、截图、cover身份和提交不代表本轮。当前选择见[ADR-007](../../wiki_memory/决策/ADR-007-牡丹2点0源与全视口自然环境.md)。

| 范围 | 当前证据 | 结果与边界 |
| --- | --- | --- |
| 源与打包副本 | [native](validation-native-new.json)、[资产](validation-assets-new.json)、[输入替换](input-replacement.json)、[交付](native-delivery.json) | 最终八次只读重开pass；几何/UV、相机/矩阵样本、整数帧显隐、材质scalar和源图身份；25形态键delta及源/副本各75,600整数帧权重。最终manifest SHA与243 WebP完整解码pass。 |
| 正文 | [CPU报告](narrative-validation.json)、[节点映射](narrative-mapping.json) | 7组、25段逐字、59默认片段；prepared及作者帧路线×三种切片长度均有非零阅读窗口。实际布局另见下方生产runtime证据。 |
| 首页铺满与自然环境 | [结构及生命周期](validation-home-layout.json)、[实现说明](home-environment-implementation.md) | 10尺寸、30观察覆盖、独立按钮、连续烟与off/reduce/hidden/离场/销毁pass。此报告GPU/DOM为stub，实际GLSL/像素另见本轮projection报告。 |
| 四卷独立轻动与源形态键 | [CPU报告](motion-validation.json)、[实际纹理审阅](motion-source-review.json)、[morph交付](morph-delivery.json) | 9组、120节点/比例、80逐瓣下落/侧风、未绑定主体矩阵保持；25个真实GPU morph目标/125权重正确，和新增原生轻动无交集。最多同时2瓣+1独立原层，off/reduce/hidden/end及单帧单上传通过。 |
| 原生材质入场 | [CPU报告](validation-source-effects-cpu.json)、[源材质摘要](source-effects-summary.json) | 126个图、14,536个scalar采样、23种shader拓扑；世界坐标灼烧/真实驱动时钟、UV方向、完成态羽化等5组检查通过。31,339次UV检查证明109图可走完成快路，17图保留空间mask。程序噪声是WebGL近似，非Cycles逐像素复刻。 |
| 闭卷形变与画心覆盖 | [CPU报告](validation-unfurl-cpu.json)、[2.0首帧来源](cover-provenance.json) | 保留2,415顶点、UV及真实闭卷曲率；解析法线与保守包围体检查通过。画心等比cover到1536×574整个纸面，不留旧内边距；四张cover均已从2.0真实WebGL进度0采集。 |
| 首页真实WebGL与按钮 | [浏览器报告](validation-projection-home.json) | 13组pass：五种实际按钮布局、真实透视/环境连续运行、悬停/键盘聚焦、环境关闭/reduce、键盘进入/手机触屏、真实shader错误门控与重试。pageErrors、consoleErrors、badResponses为空。 |
| 入卷与故障恢复 | [浏览器报告](validation-journey-new.json)、[编译时取消](validation-compile-cancel.json) | 入卷8组pass：四卷闭/半/全开与返回、慢纹理持续运行、画心错误重试、取消旧清单及手机音频失败重试。四次加载展示4.009/4.038/4.007/4.003秒。实际KHR并行编译未完成时取消，再选另一真实世界通过。 |
| 正文全节点与原浏览功能 | [生产浏览器报告](validation-runtime-new.json) | 30组pass，桌面/手机共80次节点、166段响应式正文及8个真实末帧/落印；四卷motion off/reduce、实际本地楷体和MP3解码/循环/音量/后台暂停/释放通过，errors为空。 |
| 性能 | [生产取样](validation-performance.json)、[前改动基线](baseline-performance.json) | 最后修复后复跑完成，四卷冷前进与暖回退共8个8秒窗口，均无>50ms RAF间隔；冷p95为13.9/7.1/7.1/13.9ms，暖13.8/7.0/7.0/13.9ms。加载截图采样章一/四各1次>50ms，保留原始结果，不宣称稳定60FPS。旧production内容不同，且存在并行离线工作影响，不直接计算倍率。 |
| 入卷调度 | [真实浏览器时序](validation-timing.json) | 8组pass：首次/缓存/新Hash/后退/reduce/重试均完整仪式；正常加载4.004秒、总6.662秒，缓存加载4.014秒、总5.769秒。合成hidden事件时排除1.5秒隐藏时长；真实慢纹理使加载延长至5.042秒。pageErrors为空。 |
| 嵌套子目录 | [生产浏览器报告](validation-portable-subpath.json) | 当前2.0四卷通过`/portable/nested/`，Worker清单由真实服务器请求确认；画心/纹理/字体/音频、12类列明交互、CSS资源重写及文化抽屉通过，无pageErrors/失败资源。 |
| Git交付 | 待最后核对 | 普通提交、推送及LFS无需再次申请授权；由根任务完成后记录实际提交和远程结果，本地提交不等于远程完成。 |

当前网页网格149/58/79/52，纹理99/35/66/43，正文节点15/7/9/9；完整原marker17/21/18/9另保留。帧范围1—3024/33—2184/1—2068/1—1800；第二卷原marker -3保留在authoredFrame，入口夹到33。原生与WebP最终验证JSON均pass；若修改manifest，应重跑SHA绑定验证，不能沿用当前pass。

可直接重跑：

```powershell
npm run test:new-narrative
npm run test:home-layout
npm run test:new-motion
npm run test:source-effects
npm run test:unfurl
npx tsc -b
```

本轮CPU脚本默认写本目录，不再覆盖历史new-scrolls。展卷同进程CPU专项中位数为1.352ms→0.112ms，计算不含WebGL上传/渲染，不能当作网页FPS倍率。生产性能报告的RAF间隔同时包含浏览器调度与GPU/驱动等待；冷指同一章节新文档的首次遍历，进入首帧已按门控预载，未强制禁HTTP缓存；暖指同renderer立即反向，内存预算可能淘汰纹理。无实体手机、其他浏览器、稳定60FPS、物理音响或部署验收声明。

性能环境为Windows、Edge 155 Headless、WebGL2/ANGLE AMD Radeon R7 430、1440×900、DPR1。时间轴通过真实HTML input事件每RAF连续推进，测得的RAF是浏览器刷新间隔，不等于每个间隔均有一次新的GPU绘制。加载采样包含截图，截图读回可能扰动样本；游观8个窗口没有截图操作。高水位CPU/上传数据是累计值，不能误作单窗口峰值。

本轮实际截图：[桌面首页](projection-home-desktop.png)、[手机首页](projection-home-mobile.png)、[悬停反馈](projection-button-hover.png)、[键盘焦点](projection-button-keyboard.png)、[闭卷](journey-c1-closed.png)、[半开](journey-c1-half.png)、[全开](journey-c1-opened.png)、[慢加载](journey-slow-waiting.png)、[错误重试](journey-cover-error.png)。它们来自运行中的网页，不是概念稿。
