# 新版四卷与沉浸书房交付验收

本页汇总2026-10-22本轮 `peony-2026-10-21` 的实际代码、原生交付和生产网页证据。当前四世界、首页、真实入卷、手机音频异常、计时和子目录验收已通过；功能与素材提交 **d849765** 已推送，远程 `main` 一致，Git LFS 完整性检查通过。历史 reconstruction、study-faithful 或第三卷专项报告不能替代本页新版证据。

2026-10-23交互更新：源素材交付事实保留，本轮设置、滚轮优化和用户指定的微透明纸底见[最新验收](../viewer-settings/README.md)。同名运行、入卷报告及代表截图已按本轮构建重跑通过；下表166片段、手机565px画心等数字属于2026-10-22记录，当前实际数值以报告JSON及最新验收页为准。原件审计、源SHA和此前Git交付记录仍是其所注明日期的证据。

## 七项目标与证据

| 目标 | 本轮实现与实际验收 | 证据 |
| --- | --- | --- |
| 1. 新版四份 Blender 与真实四世界 | 本轮“牡丹”输入替换四份活跃可编辑 `.blend`，网页网格149／58／79／53、纹理99／35／66／44。独立重新打开四输入及四交付，比较 SHA、几何/UV、相机/矩阵、全部整数帧可见性和打包原图；244张 WebP 完整解码。 | [原生](validation-native-new.json)、[资源](validation-assets-new.json)、[详细范围](audit-README.md) |
| 2. 画心与导航占位 | 顶部有当前卷名、四卷导航及返回。生产桌面1672×941中画心1626×737；手机390×844中画心360×565。四卷真实阅读节点在这两种尺寸各访问一次，共80次，实际源隐藏物体未意外显示。 | [运行30组](validation-runtime-new.json)、[桌面示例](runtime-c1-desktop-01.png)、[手机示例](runtime-c1-mobile-01.png) |
| 3. DOCX正文、楷体与渐显 | 原主线25段6／6／6／7逐字保留；本地楷体实际载入，CSS淡显、实际像素候选留白。实际访问166个响应式片段，桌面59、手机107，正文字符一致并检查画心内边界。实际 prepared 作者时序与每段非零阅读窗口另经 CPU 验证。 | [运行](validation-runtime-new.json)、[正文CPU](narrative-validation.json)、[正文说明](narrative-README.md)、[源时钟](validation-source-clock-new.json) |
| 4. 合理局部轻动 | 只给审阅通过的独立花瓣/飘带/单灯加入轻动，不移动人物、建筑及组合图层。四卷追加单瓣来自新源，同一纹理队列；实际环境 off、系统 reduce 及停止诊断通过，CPU另覆盖后台与末尾生命周期。 | [动效CPU](motion-validation.json)、[运行](validation-runtime-new.json)、[动效来源](motion-source-review.json)、[动效说明](motion-README.md) |
| 5. 卷末定格与落印 | 四卷桌面与手机均准确到进度1.000000，退出正文、停止局部轻动、保留最终源帧，显示大卷名、末句与落印动画。 | [运行](validation-runtime-new.json)、[桌面卷末](runtime-end-c3-desktop.png)、[手机卷末](runtime-end-c3-mobile.png) |
| 6. 背景古筝意境配乐 | 76.8秒原创五声音阶曲与合成拨弦音色，非真人古筝录音、无朗读。浏览器实际解码双声道 MP3、循环播放、非零 gain、音量变化、后台暂停与关闭释放通过；手机开启音乐后控件不压画心、音频503重试及返回清理通过，不等同物理扬声器听感验收。 | [运行](validation-runtime-new.json)、[手机故障重试](validation-journey-new.json)、[音频来源](../../public/audio/provenance.json)、[手机控件](journey-mobile-audio-playing.png) |
| 7. 参考同构图的实时首页与入卷 | 原图精确投影至有深度 relief，加实体杆、曲纸/厚度及主要体积；4个真实 HTML 题签有 hover/焦点/键盘/触屏反馈。首页13组含真实 GLSL失败门控和重试。四入口各经历闭→半→全开、至少4秒加载并进入对应世界，慢纹理持续运动、cover503重试及取消旧manifest通过。 | [首页13组](validation-projection-home.json)、[入卷8组](validation-journey-new.json)、[参考/素材](../../public/ui/study-projection/asset-manifest.json) |

## 首页与闭卷截图

![实际生产首页，参考尺寸1672×941](projection-home-reference-size.png)

首页的同构图通过参考投影保证；这是有实际深度、受限视角的 relief 加实体几何，**不是独立完整房间建模**。镜头只作克制观察，不能自由绕行。按钮文字是可聚焦的独立 HTML，原图题字不重复渲染。可查看 [悬停反馈](projection-button-hover.png)、[键盘焦点](projection-button-keyboard.png)、[手机首页](projection-home-mobile.png)、[着色器故障](projection-shader-error-gate.png) 与 [重试恢复](projection-shader-recovered.png)。

| 实际入口 | 闭合 | 半开 | 全开 | 前台加载可见时间 |
| --- | --- | --- | --- | ---: |
| 神都花事 | [闭](journey-c1-closed.png) | [半](journey-c1-half.png) | [全](journey-c1-opened.png) | 4013.2ms |
| 花入万家 | [闭](journey-c2-closed.png) | [半](journey-c2-half.png) | [全](journey-c2-opened.png) | 4008.6ms |
| 锦绣花意 | [闭](journey-c3-closed.png) | [半](journey-c3-half.png) | [全](journey-c3-opened.png) | 4008.0ms |
| 国色倾城 | [闭](journey-c4-closed.png) | [半](journey-c4-half.png) | [全](journey-c4-opened.png) | 4002.7ms |

首卷实际卷纸2415顶点，闭合到全开轴杆间距0.6134→9.4382，纸面Z跨度0.63496→0.01447；不是图片横向拉伸。最低展示期间仍等待资源和首帧。另有 [持续慢加载](journey-slow-waiting.png) 和 [指定章节cover失败](journey-cover-error.png)。注入的 cover503、音频503 属于预期测试故障，运行报告无非预期错误。

加载卷面是当前四世界源进度0的真实画心截图，关闭环境、隐藏HTML题跋后转换WebP，不重绘、不换构图、不使用旧paintings-atlas。见 [四份来源和SHA](cover-provenance.json)。卷面按原比例装裱，纸面保留实际暖光材质，不能宣称与首帧截图逐像素同色。

## 时序与正文验收细节

新版 `prepareScene` 保留作者时间0..1，相机、主体动画与显隐沿同一时钟。第三卷末段相机静止但画面仍变化；原距离映射曾把末三景压到极短滑块区间并令末两段题跋零窗口，现已修复。第四卷快速转场和阅读停留保留作者节奏，历史版本才继续距离映射。独立执行当前纯TS函数核对全部458／468／891／1236个相机样本及所有 stops 的时间身份，见 [源时钟复核](validation-source-clock-new.json)。

正文实际访问数量如下；每个片段都在真实网页时间轴定位、完成渐显后检查，不把DOM中存在隐藏段落视为已读到：

| 卷 | 原DOCX段落 | 桌面片段 | 手机片段 | 本文字符 |
| --- | ---: | ---: | ---: | ---: |
| 神都花事 | 6 | 14 | 28 | 770 |
| 花入万家 | 6 | 14 | 25 | 727 |
| 锦绣花意 | 6 | 16 | 28 | 770 |
| 国色倾城 | 7 | 15 | 26 | 736 |
| 合计 | 25 | 59 | 107 | 3003 |

运行报告完成于2026-10-22 05:54:18 UTC，30组通过、errors为空；入卷最终报告完成于06:46:16 UTC，8组通过，包含手机音乐控件/音频503重试/返回清理；首页报告完成于05:08:26 UTC，13组通过。完整80节点的临时逐景抓图路径记录在运行JSON；本目录另交付8张接触表及各卷桌面/手机卷首、卷末代表图。文字区域选择是像素纸白与边缘密度启发式，边界和透明状态通过不等于所有主体语义避让均可自动证明，需结合截图审阅。

| 全部源节点接触表 | 桌面 | 手机 |
| --- | --- | --- |
| 神都花事15景 | [桌面](contact-c1-desktop.jpg) | [手机](contact-c1-mobile.jpg) |
| 花入万家7景 | [桌面](contact-c2-desktop.jpg) | [手机](contact-c2-mobile.jpg) |
| 锦绣花意9景 | [桌面](contact-c3-desktop.jpg) | [手机](contact-c3-mobile.jpg) |
| 国色倾城9景 | [桌面](contact-c4-desktop.jpg) | [手机](contact-c4-mobile.jpg) |

## 交付文件与验证命令

- 活跃 `.blend`：`artwork/blender-reconstructed/chapter-1_reconstructed.blend` 至 `chapter-4_reconstructed.blend`，由Git LFS交付。
- 活跃世界：`public/assets/new-scrolls/chapter-1..4/`，包括scene.json、纹理及本轮cover。
- 首页：`public/ui/study-projection/`；正文与配乐的本地字体/来源在`public/fonts/`、`public/audio/`。
- “牡丹”四输入、根原DOCX和原参考图只读留本机；派生运行副本与上述4份活跃输出才属于本轮交付。首卷原输入的旧绝对路径缺图只修复到交付副本，不改原件。

```powershell
npm run build
npm test
npm run validate:assets
npm run validate:new-assets
npm run test:new-narrative
npm run test:new-motion
npm run test:projection-home
node scripts/validate-new-scroll-runtime.mjs
node scripts/validate-new-scroll-journey.mjs
npm run test:study-timing
npm run test:subpath
```

原生只读复核：`blender --background --disable-autoexec --python scripts/validate-new-scroll-native.py`。`validate:new-assets`需要有Pillow的Python，可用`MDGS_PYTHON`指定；浏览器测试需Playwright/Chromium，可指定`MDGS_PLAYWRIGHT_MODULE`、`MDGS_TEST_BROWSER`及可选`MDGS_PREVIEW_URL`。这些是验收依赖，普通网页不需要。历史测试适用范围见 [test-applicability.md](test-applicability.md)。

## Git交付与限制

`test:study-timing`于2026-10-22 06:10:47 UTC最终通过8组，见 [计时报告](../study/validation-timing.json)；旧测试已改为只拦world纹理，避免把新增cover也一并拦住。后台可见时间采用模拟visibility事件检查，不推断真实OS后台行为。`test:subpath`于06:18:07 UTC通过 `/portable/nested/` 中当前四卷、字体/音乐/cover路径和保留交互，页面与资源错误均为空，见 [子目录报告](../validation-portable-subpath.json)。

手机开启音乐控件布局与音频503重试已通过，控件位于画心上方并支持返回清理。功能与素材提交 `d849765dea149c8fe7fd9ede965ca8c47fa4e89c` 已成功推送 `origin/main`，直接读取GitHub远程提交号核对相等，核对前工作树干净，`git lfs fsck --objects HEAD` 返回 OK。见 [Git交付证据](git-delivery.json)。本段终态记录作为后续文档提交交付；最终分支HEAD以Git核对为准。

尚未验证实体手机、Safari/Firefox、持续60FPS、物理扬声器听感和线上部署；浏览器没有逐像素复刻Blender程序着色/灯光，首页不是完整自由视角场景。
