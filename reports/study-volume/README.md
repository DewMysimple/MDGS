# 立体纸绢书房与闭卷展开

本轮基于95460cc，按2026-10-21最新浅淡工笔纸绢参考升级。首页主体为实时Three.js实体几何，不使用整张参考图或平面景物叠层呈现房间。原四卷作品、叙事、相机和资产清单保持。

## 实现

- StudyRoomRenderer：实体书案、雕饰、桌旗、窗棂、灯笼、瓶、香炉、书册、牡丹与曲纸；真实透视、几何遮挡、柔影和距离变化。小幅观察角度、独立枝叶、花瓣、尘、烟、灯火。
- StudyHome：四个真实绢纸题签，朱砂清晰卷名、古铜边、淡玉扣、箭头、流苏、抬起/聚焦/按下/选中；世界卷面另有真实raycast。手机调整相机、窗框、案深，四卷两排。
- scrollGeometry / ScrollUnfurlScene：2415顶点的双面纸张及圆柱轴杆，闭合卷绕→纸面弧度变化→全幅画境；初态、半开、全开可在运行诊断与截图比较。展开约3.35秒，四秒展示窗口含赏画。
- useStudyJourney：4000ms可见门槛，真实资源/解码/首帧联合门控，每次点击/刷新/历史/重试均执行；普通基础时序5.55秒，真实资源较慢继续等待。减少动态不缩短4秒、不取消清晰展卷。
- 加载画境自身失败具有独立错误状态，后到的原世界onReady不能清掉它；显式重试重建。首页留在内存而在世界中停止RAF，返回无需重造书房，取消后旧任务失效。

直达章节或刷新不额外构造尚未访问的书房，先呈现闭卷画境并按真实阶段准备世界，首次返回才构建书房；正常从首页选择仍保留题签反馈、卷轴聚焦和实际镜头推进。首页首次绘制在材质就绪并compileAsync后进行，避免缺图/有图两次同步着色器准备。三维花枝和地面合批，避免重复轮廓提取。

## 美术与原件

最新参考保存在 [reference.png](../../public/ui/study-volume/reference.png)，SHA256为5ddde6154a57aa96bec01bdcb2f2e85bf0599ff28b01439988355768d1639f27。三张绘画/织锦表面与透明题字由内置imagegen依据该参考制作，保留PNG原件、实际prompt于provenance.json和文件哈希于asset-manifest.json。四张WebP合计2975206字节；其余细粒纸绢木纹由运行代码绘制，普通运行无需素材制作工具。

首页卷面保持绘画比例，按各卷题材取横画中的竖幅局部，加载卷轴展示更完整横向画境。材质不是烘焙整间房间、案台、窗框或按钮的场景截图。原始四卷纹理与Blender未改。

## 运行与验证

双击根目录runStart.cmd，或npm ci后npm run dev，打开当次Local地址。生产构建npm run build，预览npm run preview。验证命令为npm test、npm run validate:assets、npm run test:volume-home、npm run test:study-timing、npm run test:study、npm run test:subpath。历史test:layered-home命令已别名到当前实体书房验收；旧script保留为历史基线。

实际执行生产build、原游观和原资源校验，全部通过。Windows/Edge生产验收：test:volume-home共15项、test:study共10项、test:study-timing共8项通过；零页面错误、控制台错误及意外HTTP失败。具体JSON位于本目录validation-volume-home.json与reports/study。截图为运行网页采集，不是概念图。

最终构建在`/portable/nested/`嵌套HTTP子目录下也通过四卷加载及九组原控件回归：滚轮、拖拽、键盘、下一景、自动展卷暂停、动态开关、全屏、进度Home、文化抽屉Escape与焦点恢复；无页面错误/资源失败，见reports/validation-portable-subpath.json。

实测435个实体网格，每卷纸2415个顶点；笔筒阻挡后方卷面误选，直接点击实际第二卷纸面进入正确世界。闭合0→半开0.4496→全开1，轴杆间距与真实曲面Z范围均改变。慢纹理等待期间持续渲染896帧，采样最大RAF间隔305.6ms；这只证明该段未出现秒级冻结，不代表持续60FPS。

全部计时路径可见加载不少于4002.2ms；缓存刷新6.244秒、历史导航6.099秒，新Hash5.635秒、缓存首页点击6.621秒，各卷按钮5.898–6.636秒。首冷直达7.761秒，含真实准备。模拟后台时间不计入四秒；资源慢时继续等待，不提前暴露空画心。加载WebGL丢失后，真实世界稍后ready仍不能吞掉错误；重试可恢复。

截图：[桌面首页](home-desktop.png)、[手机首页](home-mobile.png)、[短横屏](home-short-landscape.png)、[悬停](entry-hover.png)、[键盘焦点](entry-keyboard-focus.png)、[按下](entry-pressed.png)、[选中](entry-selected.png)、[实体遮挡](home-solid-occlusion.png)、[闭卷](scroll-closed.png)、[半开](scroll-unfurling.png)、[全开](scroll-open.png)、[持续慢加载](scroll-slow-waiting.png)、[手机加载](scroll-mobile.png)、[WebGL失败](scroll-webgl-error.png)。

## 限制

本机Windows/Edge与触屏尺寸模拟。未验证实体手机、Safari/Firefox、持续60FPS或真实OS后台节流，未部署线上。可见时间暂停分支使用模拟visibility事件，不能替代物理后台验收。初次GL初始化和资源准备可能延长总时长；展示时间不是下载百分比。
