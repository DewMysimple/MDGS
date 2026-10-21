# 独立分层书房与真实题签交付

2026-10-21，基于05dcd0e，按新视觉母版《国色长卷：牡丹雅韵四卷展》升级。原始参考逐字节保留在public/ui/study-layered/reference.png；原文件实际1671×941，生成层画布1672×941。旧版完整单图首页已被独立组装场景替代。四卷作品、叙事顺序、相机、原生产纹理和Blender均未修改。

## 空间、材质与交互

- 六幅独立运行画材：远园、透明窗框陈设、补绘空书案、四幅画卷、前景牡丹书籍、透明书法。四卷分别裁区，前景分左右，共九个可观察深度平面；窗口透明处始终有完整园林承接。
- 单RAF时钟平滑跟随鼠标，远园/窗框/案台/四卷/前景分别采用1.5/4/7/8/11或13的位移幅度。静置呼吸按深度作用，各层不同移，不用循环缩放背景。近景花枝、流苏、灯光、雾气、烟和瓣各自缓动。
- 四个真实HTML按钮按神都花事、花入万家、锦绣花意、国色倾城排列。绢纸、古铜双边、实体阴影、圆箭头与流苏均独立；hover和键盘焦点抬起，按下下压，选中画卷照亮并轻抬。绘画主体也可点击；命中裁区与绘画裁区一致，透明边缘不误入相邻卷。
- 手机重新取窗外景，四卷变为两列画作与横题签，章节名称18px，点击目标不小于44px；短横屏17px竖签并收起无空间的装饰流苏。标题只有一份可见书法。
- 提供环境开关，系统减少动态不做大幅推进；环境关闭或后台时停止合成时钟与循环。返回首页恢复焦点，重试会真正重建显示中的失败图层，而非只让离屏探针成功。

## 入卷与真实准备

每次入口、刷新、历史与重试均按苏醒400ms、推进800ms、幻境600ms、艺术加载至少3000ms、显色450ms、入画750ms执行。减少动态缩短结构移动、柔和渐显，但至少3秒艺术加载保持，后台时间不计入。真实资源慢时延长加载，禁止伪百分比。

现有ScrollViewport/SceneRenderer门控继续生效：真实清单、当前/邻近视野纹理、首帧和对应加载画材解码完成之后才开放交互。其他长卷资源保持流式加载。保留原有游观、分镜、进度、自动展卷、轻动、合成音、全屏与文化解读。失败题签支持重试或返回，不并行打开多卷。

## 素材和体积

新增位图通过内置imagegen生成/提取；原始PNG、准确提示词、透明边界和SHA保存在public/ui/study-layered的provenance及asset-manifest。浏览器实际使用六幅WebP，总2,438,908字节，源PNG总9,117,058字节；画质94、alphaQuality100，尺寸和透明轮廓保留，见runtime-manifest.json。可选离线编码工具scripts/prepare-study-layers.mjs，通过MDGS_SHARP_MODULE指定Sharp；普通启动和构建不需要Sharp。

没有使用原图作为最终铺底；也没有用普通色块代替宫苑、牡丹、器物和雕花。生成层的实际边界偏移通过裁区、取景和遮挡调整，未对建筑、人物或花朵整图扭曲。

## 运行证据

- [独立分层与题签验收](validation-layered-home.json)：九层/五种独立场景位图、真实视差、按钮hover/focus/press、边缘命中、1440×900/1920×1080/375×800/620×360、四卷真实进入与返回、环境关闭、减少动态、素材503重试。
- [真实全流程回归](../study/validation-journey.json)：慢纹理、首帧、重复选择、四卷、刷新位置、历史取消、手机触屏、清单和章节画材失败重试。
- [三秒展示与每次完整路径](../study/validation-timing.json)：正常/直达/刷新/历史/重试/减少动态及慢纹理。后台计时分支用synthetic visibility事件验证，报告未将其冒称真实OS切后台。
- [子目录与原控件回归](../validation-portable-subpath.json)、[原游观](../validation-viewing.json)和[原资产](../validation-assets.json)。
- 截图：[桌面首页](home-desktop.png)、[宽屏](home-wide.png)、[手机](home-mobile.png)、[短横屏](home-short-landscape.png)、[悬停](entry-hover.png)、[键盘焦点](entry-keyboard-focus.png)、[按下](entry-pressed.png)、[选中](entry-selected.png)、[加载画境](../study/loading-desktop.png)、[手机加载](../study/loading-mobile.png)、[失败与重试](home-material-recovered.png)。

实际执行npm run build、npm test、npm run validate:assets、npm run test:layered-home、npm run test:study、npm run test:study-timing、npm run test:subpath。测试为Windows/Edge（Chromium）与模拟手机触屏，未验证实体手机、Safari/Firefox或持续60FPS；未部署。不可把本机模拟器结果扩大为实体设备验收。

## 启动与维护

双击根目录runStart.cmd，或npm run dev后打开打印的Local地址。构建输出dist，通过HTTP访问，支持嵌套子目录。入口组件StudyHome，场景坐标与素材在data/studyLayers，深度时钟useStudyParallax，仪式时序useStudyJourney。继续开发先读wiki_memory当前状态，不运行旧builder重建已交付的四卷。
