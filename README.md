# 国色长卷 · 数字牡丹赋

React、TypeScript、Vite 与 Three.js 数字手卷。首页以指定的浅淡工笔纸绢参考构图呈现书房与案上四卷，独立 HTML 题签依次进入神都花事、花入万家、锦绣花意、国色倾城。现行版本为 `peony-2.0-2026-10-22`，来自本轮“牡丹2.0”目录的四份 Blender；旧版补绘和 canonical 保留作历史资料，不参与新世界构建。

牡丹2.0已完成原生、资源、CPU和生产浏览器验证，首页铺满、自然环境和源材质入场动画已接入；Git交付以 [本轮验收记录](reports/peony-2.0/README.md) 的实际状态为准。[上一轮验收](reports/new-scrolls/README.md) 只代表历史 `peony-2026-10-21`。

## 运行

```powershell
npm ci
npm run dev
```

打开终端实际显示的 Local 地址。Windows 也可双击 `runStart.cmd`，它按自身目录启动并打开当前实例地址。正式构建使用 `npm run build`，检查构建使用 `npm run preview`。资源支持 HTTP 子目录部署，入口目录应保留结尾 `/`。正常运行不需要 Blender、Python 或外部字体服务。

派生 `.blend`、生产 PNG 和验收截图等大文件由 Git LFS 管理，获取完整交付时先安装 Git LFS，再运行 `git lfs install`、`git lfs pull`。运行用 WebP、JSON 和本地字体随仓库交付。`牡丹/`、`牡丹2.0/` 原始输入、根目录原始 DOCX/参考图、`source/`、本机配置、缓存和凭据不属于提交范围；运行用参考副本位于 `public/ui/study-projection/`。

## 首页与入卷

首页并非独立建模、独立贴图的完整书房。当前实现为**同一参考相机投影到连续有深度的 relief 网格，结合实体轴杆、曲面绢纸与纸厚、桌裙及主要器物体积**。这项取舍优先保持参考构图与绘画细节，真实观察相机产生克制视差；较大视角不能像完整独立场景一样自由绕行。参考 SHA256 为 `5ddde6154a57aa96bec01bdcb2f2e85bf0599ff28b01439988355768d1639f27`。

原图四处题签由局部补绘底板修复；入口是具有真实文字、焦点和触屏响应的 HTML 按钮，纸绢、玉饰、流苏与边框颜料取自参考。原图题字只显示一次。环境开关和系统减少动态设置控制花瓣、青烟、浮尘及微观察运动。首页只有素材编译和实际首绘均成功后才开放入口，着色器失败显示同风格重试界面。

取景使用等比例 cover 加3.5%观察出血，使首页覆盖整个视口；宽高比不同会裁去部分边缘，不拉伸参考。横屏四签仍随3D投影定位并限制在可操作边界内，竖屏采用可读的2×2入口。香炉使用连续卷曲薄烟网格，单瓣慢落并轻翻转、浮尘错峰漂移，两角枝叶只在局部曲面微动。静置环境最多30Hz重绘，环境关闭、系统reduce、后台和离场停动。

每次选择执行择卷、聚焦、进入加载画境、闭卷展开、入画。加载采用双面卷纸网格绕轴形变，实体杆分离、卷曲和阴影随之变化；`SCROLL_LOADING` 在前台至少展示4000ms，资源较慢继续等待。最低时间、画境自身准备、目标资源及真实首帧共同决定放行，不伪造百分比。减少动态保留闭合到展开的状态与时间；返回书房停止当前自动展卷，取消任务不能重新触发旧章节。

加载画心已重新采集为2.0真实 WebGL 首帧，环境关闭、HTML题跋透明后只截取画布；[卷面来源](reports/peony-2.0/cover-provenance.json) 逐卷记录源SHA、进度0和WebP身份。画面等比例cover到整张绢纸，裁去少量上下边缘，不拉伸、不留旧版内边距。卷纸具有实际柔和光照，不宣称截图逐像素同色。

## 新版四卷与源边界

| 卷名 | 本轮输入 | 网页网格 | 独立纹理 | 交互节点 | 源帧范围 |
| --- | --- | ---: | ---: | ---: | --- |
| 神都花事 | 画卷一_灼烧入场版.blend | 149 | 99 | 15 | 1—3024 |
| 花入万家 | 画卷二_街市建筑完整补全版.blend | 58 | 35 | 7 | 33—2184 |
| 锦绣花意 | 画卷三_分镜构图版_图层补全.blend | 79 | 66 | 9 | 1—2068 |
| 国色倾城 | 画卷四_画卷一节奏运镜版.blend | 52 | 43 | 9 | 1—1800 |

四卷新版游观方向均为源 `+X`，网页完整保留**原作者时间进度0..1**，相机、物体动画和显隐沿同一时序推进。静止相机不代表画面停止：第三卷后段仍在切换场景和主体；按相机距离重排曾把最后三景压到极短滑块区间，连带末两段正文没有有效展示时间，因此新版已停用该压缩。第四卷较快转场和阅读停留也遵循作者时序；距离路线只保留给历史版本。第三卷完整 markers 保留9个“参考全景”，它们不重复进入交互 stops。第二卷第一标记原帧-3保留在 `authoredFrame`，实际入口按源起始帧33。首卷149个导出物体中45个首帧可见、104个以后出现；另一个原生 MESH 全程隐藏，不应强行显示。

现行资源由 `src/data/sourceEdition.ts` 指向 `public/assets/new-scrolls/chapter-1..4/`。新 `sourceRevision` 不运行旧 `ArtDirectionLayer` 和 `CalligraphyLayer` 的补画/题字流程，旧结束帧也不截断新版路线。世界矩阵、相机、标记、源动画及逐帧可见性来自本轮文件；贴图加载回调不会把源隐藏物体提前显示。

四份活跃可编辑交付位于 `artwork/blender-reconstructed/chapter-{1..4}_reconstructed.blend`，本轮已替换为2.0输入的打包副本。按用户授权，旧 `牡丹/` 四件输入已先校验备份至忽略目录 `.asset-cache/peony-pre-2.0/`，再替换为新版本；[替换记录](reports/peony-2.0/input-replacement.json) 保留前后SHA，`牡丹2.0/` 原件未保存改写。四件本轮输入无缺图，不再需要上一轮首卷的旧图恢复。网页 WebP 最大边长2048，保持透明通道。源材质入场节点、scalar曲线和坐标信息已导出并通过网页uniform shader译制；首卷25个真实形态键对象保留相对顶点delta和原作权重轨道，使用GPU morph，不对这些对象额外叠加环境风动。不宣称逐像素复刻所有 Blender 灯光与程序噪声。

126个材质入场图沿作者时间使用真实scalar采样，保留UV方向、世界坐标灼烧和原生边缘羽化。仅当空间区间证明完成后的alpha恒定时才走廉价uniform分支；109个图可走快路，17个仍保留空间mask，避免把“完成”误作整幅不透明。噪声与Voronoi使用确定性的WebGL近似，具体边界见[材质验证](reports/peony-2.0/validation-source-effects-cpu.json)。

## 游观、文字与配乐

滚轮、拖拽、方向键、Home/End、时间轴与分镜继续控制真实画卷；自动展卷可暂停，手动输入接管，四卷会话进度独立保存。顶部显示当前卷名、四卷导航与返回书房。画心占据主要可用空间，手机另行取景并保留清晰入口。

主线正文只读提取自 `主线内容(2).docx`，25段按四卷6／6／6／7段逐字保留。`newNarrative.ts` 保存正文，`narrativeTrack.ts` 按新源节点顺序分配短题跋，并按字数保留最低阅读窗口，短句也留出渐显时间。测试直接使用实际 `prepareScene` 的当前时序，检查25段及各响应式片段均有非零区间。楷体由本地霞鹜文楷子集提供，许可证和来源在 `public/fonts/`；文字独立于原画，以650ms CSS 渐显渐隐，减少动态为180ms，不拦截游观输入。`NarrativeSpace` 采样实际 WebGL 画面，在候选区比较纸白与边缘密度后选择较安静位置；此为启发式避让，本轮节点截图保留实际布局。较密区域使用很淡的纸绢衬底。

卷末退去正文，停止局部动效并显示大卷名、末句题跋与一次落印；保留再观和下一卷入口。局部动效只绑定经过纹理审阅的独立花瓣、少量飘带和灯笼，人物、建筑、组合画层保持源姿态；追加单瓣取自新版首卷真实纹理，按世界坐标加入同一资源和释放队列。

「古筝配乐」须用户点击开启，可调音量，离开画卷或页面隐藏时暂停。`public/audio/peony-guzheng-original.mp3` 是脚本创作的五声音阶乐曲与**合成古筝意境拨弦音色**，并非真人古筝录音，也无语音朗读。乐谱、生成脚本与来源说明一并保留。

## 维护入口

| 入口 | 用途 |
| --- | --- |
| `src/scene/StudyRoomRenderer.ts`、`components/StudyHome.tsx` | 参考投影 relief、实体卷杆与题签 |
| `src/hooks/useStudyJourney.ts`、`scene/ScrollUnfurlScene.ts` | 状态、最低展示与几何闭卷展开 |
| `src/scene/SceneRenderer.ts`、`prepareScene.ts` | 新源几何、完整作者时序、流式纹理与可见性 |
| `src/scene/SceneManifestLoader.ts`、`manifest.worker.ts` | 后台清单解析与可取消的源准备 |
| `src/scene/SourceMaterialEffects.ts` | 原生水墨/灼烧/淡入图及真实scalar时钟 |
| `src/data/newNarrative.ts`、`narrativeTrack.ts`、`scene/NarrativeSpace.ts` | 本轮正文、节点与画面留白采样 |
| `src/data/newMotionProfiles.ts`、`scene/NewScrollAtmosphere.ts` | 新源独立局部轻动 |
| `scripts/peony-2.0-sources.json` | 当前2.0四卷本地源位置 |
| `scripts/export-new-scrolls.py`、`prepare-new-scrolls.py` | 源导出、索引化与 WebP |
| `scripts/pack-new-scroll-delivery.py` | 活跃可编辑副本打包 |
| `scripts/create-peony-music.py` | 原创合成拨弦配乐制作 |

重新制作资源需本机原始输入与 Blender/Python 依赖；先检查配置和源 SHA，再执行对应脚本。**旧 `build-reconstruction.mjs`、`build-blank-design.mjs`、`build-chapter-3-refinement.mjs` 只对应历史版，不得用于恢复当前新源。**旧交付来由保存在 [历史重构](reports/reconstruction/README.md)、[历史第三卷](reports/chapter-3-refinement/README.md) 和 [前轮首页](reports/study-faithful/README.md)。

## 本轮验证与限制

```powershell
npm run build
npm test
npm run validate:new-assets
npm run test:new-narrative
npm run test:new-motion
npm run test:source-effects
npm run test:unfurl
npm run test:home-layout
npm run test:projection-home
npm run test:new-runtime
npm run test:new-journey
npm run test:compile-cancel
npm run test:performance
npm run test:study-timing
npm run test:subpath
```

独立资源验证需要包含 Pillow 的 Python，可由 `MDGS_PYTHON` 指定；原生验证命令为 `blender --background --disable-autoexec --python scripts/validate-new-scroll-native.py`。浏览器脚本需要 Playwright/Chromium，可由 `MDGS_PLAYWRIGHT_MODULE`、`MDGS_TEST_BROWSER`、`MDGS_PREVIEW_URL` 指定，均不属于产品运行配置。`--static-only` 的首页检查只验证文件身份，不证明浏览器画面。

当前2.0实际通过：四源及四交付独立Blender只读重开，几何/UV、相机和矩阵样本、全整数帧可见性与材质scalar曲线；首卷25对象的相对形态键delta及源/副本各75,600次整数帧权重核对；最终manifest SHA与243张WebP完整解码；25段正文逐字、真实prepared及作者帧路线的响应式非零阅读窗口；120次节点/宽高比动效覆盖、80个逐瓣重力和25GPU目标/125权重检查；首页10尺寸/30观察覆盖及off/reduce/hidden/离场生命周期；126个材质图/14,536个scalar样本与31,339次完成态UV样本；TypeScript及npm test的551处显隐边界。当前CPU报告写入`reports/peony-2.0/`，历史`reports/new-scrolls/`不覆盖。原生数据与CPU正确不等于浏览器像素和帧率验收。

游观性能改动包括Worker解析大清单、分片构造对象、预分解矩阵、ImageBitmap异步解码、每帧至多一次纹理上传和方向预取。题跋留白分析改为停滑后低分辨率异步GPU读回并缓存，避开输入时的整帧同步读取。展卷保留2,415顶点和原UV，改用解析法线、共享背面几何及固定保守包围体；同进程CPU专项中每帧几何中位数由1.352ms降至0.112ms，该专项不包括GPU渲染，不能等同网页FPS倍数。实际生产浏览器结果见本轮验收，不与内容不同的旧版基线直接计算提升倍数。

本轮生产浏览器实际通过：30组画卷/正文与音频、13组首页、8组入卷恢复、KHR编译时取消、8组调度时序和四卷嵌套子目录。桌面/手机共80次节点、166段响应式正文及8个真实末帧/落印；冷前进与暖回退各8秒，四卷p95均在7.0—13.9ms。正常入卷总时长6.662秒、缓存5.769秒，加载画境各4.004/4.014秒；慢资源继续展卷，系统reduce仍保留四秒。子目录通过实际服务器路径确认Worker清单请求，四卷画心、纹理、字体和音频均按base加载。Git推送待根任务最后核对。

性能数据来自Windows Edge155、AMD Radeon R7 430、1440×900、DPR1；加载采样含截图，章一/四各有一次>50ms间隔，原始结果保留在[本轮验收](reports/peony-2.0/README.md)。手机为浏览器触屏/视口模拟，隐藏计时以合成visibility事件检验。未验收实体手机、Safari/Firefox、稳定60FPS、物理扬声器听感或线上部署。

## 工程记忆

后续开发从 [工程记忆导航](wiki_memory/README.md) 进入，先读根 `AGENTS.md` 与记忆维护协议。当前实现选择见 [ADR-007](wiki_memory/决策/ADR-007-牡丹2点0源与全视口自然环境.md)，它替代前轮活动源和contain取景，继续保留参考投影结构、四秒闭卷和真实首帧门控。
