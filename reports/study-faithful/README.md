# 参考图构图与工笔风格修正

本轮基于f366e0b，回应用户“画面大致一样，风格一样，其他按上面的要求”的纠正。上一版虽然已有实体书房和完整入卷流程，但卷面偏短、标题偏低、雕饰稀疏，牡丹像折纸，整体与参考图仍有明显差距。本轮直接修正同一Three.js首页，保留原四卷及实体展卷系统。

## 实际画面

这是运行网页截图，可对照完整保留的[用户参考](../../public/ui/study-faithful/reference.png)：

- [修正前](home-before.png)：从f366e0b中的Git LFS截图原件恢复，SHA保存在implementation.json。
- [当前桌面首页](home-desktop.png)、[宽屏](home-wide.png)、[手机](home-mobile.png)、[短横屏](home-short-landscape.png)。
- [悬停](entry-hover.png)、[键盘聚焦](entry-focus.png)、[按下](entry-pressed.png)。
- [初始闭卷](scroll-closed.png)、[展开中](scroll-unfurling.png)、[完全展开后等待真实资源](scroll-open-waiting.png)。

卷面从约画面三分之一处延伸到六成处，四卷成为书案主体；标题上移，窗框从侧边切入，留出安静的浅绢天空。案前增加暗金牡丹雕板，取消不符合参考的宽大垂桌旗；四幅画各自有完整的竖幅构图。近景花冠改为精细工笔描绘，花瓣轮廓、纸绢般颜料与薄厚曲面共同呈现，而非旧版粗略折瓣。

目视仍有可辨认的简化：实时窗格、灯具和家具轮廓比参考绘画更规整，花冠使用三种共享颜料形态，器物装饰没有逐件复刻原图。目标是相近构图与统一风格，不宣称像素一致或完全复原原画。

## 实现与素材

StudyRoomRenderer仍使用真实Box、Lathe、Cylinder、Tube和细分曲纸构成房间主体。透视相机、遮挡、实际投影题签、柔和接触阴影及局部运动继续保留。卷绢绕在圆柱轴杆上，具有可见厚度。GongbiBloom从透明花冠轮廓生成闭合有厚度的杯状网格，3份几何共享同一位图，复用一次像素读取。花枝/叶片合批并释放源几何；卷画atlas取样内缩半纹素，避免邻卷渗色。

室内地面截止窗墙，避免遮住窗外画境。手机保留独立取景与2×2真实卷位，远景比例单独调整；地毯顶面位于石缝上方，避免缝线穿过织物。所有四卷入口仍是真实HTML按钮，画卷主体通过真实几何raycast选择。

新增五幅生产WebP共3434912字节：疏朗山水、四卷竖幅atlas、四行雕饰atlas、透明工笔花冠、米绢牡丹地毯；复用旧织锦与题字后，首页七幅主要位图共4758116字节。它们只承担独立表面/窗外远景，页面不请求原参考作为背景。原参考、生成PNG、完整提示词、生成来源和SHA都在public/ui/study-faithful的provenance与manifest文件中，素材哈希已逐项核对。

本轮未修改原场景渲染器、原四卷作品、章节顺序、相机路径或Blender。canonical清单SHA256保持4433928f6e6160acbd275ba6430d65fa3128df736a7eb59ef7607e61312d10cb。

## 运行和验证

双击根目录runStart.cmd，或npm ci后npm run dev，打开终端实际Local地址。npm run build生成生产包，npm run preview预览。

新增npm run test:faithful-home检查可观察构图比例、真实曲面、八个卷绢圆柱、五份独立表面素材、来源哈希、四卷进入/返回、重复点击、慢纹理、持续动画、环境关闭、键盘和手机减少动态触屏。绘画质量另由实际截图人工比较，数值测试不代替美术判断。

本轮实际通过npm run build、npm test、npm run validate:assets；Windows/Edge生产volume-home15组、study-timing8例、嵌套子目录四卷与九组原控件回归通过。实际JSON为本目录validation-faithful-home.json、reports/study-volume/validation-volume-home.json、reports/study/validation-timing.json及reports/validation-portable-subpath.json，分别记录真实时间与范围。

实体首页413个网格，纸面投影高度约37.18%—61.48%，标题顶端3%；闭卷实测0→0.6259→1，轴杆间距、曲率和阴影随之改变。计时专项所有可见加载均≥4002.2ms；缓存刷新6.343秒、浏览历史6.004秒、新Hash5.641秒，首次冷直达7.824秒含真实准备。慢纹理延长展示，等待期间持续渲染，volume采样最长帧间隔368.1ms，只证明该段没有秒级冻结，不代表稳定60FPS。

四入口/返回、重复触发锁、纸面射线与真实遮挡、手机触屏、短横屏、关闭环境、减少动态、首页材质503/世界503重试和展卷WebGL恢复均通过；零页面错误、非预期控制台错误和资源失败。子目录回归保留滚轮、拖拽、键盘、分镜、自动播放、动态开关、全屏、进度Home及抽屉焦点恢复。

## 验证边界

本机Windows/Edge及触屏尺寸模拟。未验证实体手机、Safari/Firefox、持续60FPS、真实OS后台节流或线上部署。最少四秒是可见展卷时间，不是伪造的下载进度；实际资源较慢时继续等待。原闭卷及真实资源/首帧门控没有被静态演示替代。
