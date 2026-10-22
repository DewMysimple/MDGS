# 国色长卷 · 数字牡丹赋

React、TypeScript、Vite 与 Three.js 数字手卷。首页以指定的浅淡工笔纸绢参考构图呈现书房与案上四卷，独立 HTML 题签依次进入神都花事、花入万家、锦绣花意、国色倾城。现行版本为 `peony-2026-10-21`，来自本轮“牡丹”目录的四份新版 Blender；旧版补绘和 canonical 保留作历史资料，不参与新世界构建。

本轮新版世界、首页、真实入卷、手机音频异常、计时和子目录验收已通过，正在收尾 Git 交付。完整目标、证据及截图见 [本轮总验收](reports/new-scrolls/README.md)，不以旧版本报告证明新版通过。

## 运行

```powershell
npm ci
npm run dev
```

打开终端实际显示的 Local 地址。Windows 也可双击 `runStart.cmd`，它按自身目录启动并打开当前实例地址。正式构建使用 `npm run build`，检查构建使用 `npm run preview`。资源支持 HTTP 子目录部署，入口目录应保留结尾 `/`。正常运行不需要 Blender、Python 或外部字体服务。

派生 `.blend`、生产 PNG 和验收截图等大文件由 Git LFS 管理，获取完整交付时先安装 Git LFS，再运行 `git lfs install`、`git lfs pull`。运行用 WebP、JSON 和本地字体随仓库交付。`牡丹/` 原始输入、根目录原始 DOCX/参考图、`source/`、本机配置、缓存和凭据不属于提交范围；运行用参考副本位于 `public/ui/study-projection/`。

## 首页与入卷

首页并非独立建模、独立贴图的完整书房。当前实现为**同一参考相机投影到连续有深度的 relief 网格，结合实体轴杆、曲面绢纸与纸厚、桌裙及主要器物体积**。这项取舍优先保持参考构图与绘画细节，真实观察相机产生克制视差；较大视角不能像完整独立场景一样自由绕行。参考 SHA256 为 `5ddde6154a57aa96bec01bdcb2f2e85bf0599ff28b01439988355768d1639f27`。

原图四处题签由局部补绘底板修复；入口是具有真实文字、焦点和触屏响应的 HTML 按钮，纸绢、玉饰、流苏与边框颜料取自参考。原图题字只显示一次。环境开关和系统减少动态设置控制花瓣、青烟、浮尘及微观察运动。首页只有素材编译和实际首绘均成功后才开放入口，着色器失败显示同风格重试界面。

每次选择执行择卷、聚焦、进入加载画境、闭卷展开、入画。加载采用双面卷纸网格绕轴形变，实体杆分离、卷曲和阴影随之变化；`SCROLL_LOADING` 在前台至少展示4000ms，资源较慢继续等待。最低时间、画境自身准备、目标资源及真实首帧共同决定放行，不伪造百分比。减少动态保留闭合到展开的状态与时间；返回书房停止当前自动展卷，取消任务不能重新触发旧章节。

加载卷面分别取自当前四卷真实 WebGL 首帧画心截图，关闭环境轻动并隐藏 HTML 题跋后转换为 WebP，不重绘或重新构图。来源、当前字节 SHA 与对应 Blender 身份见 [cover-provenance.json](reports/new-scrolls/cover-provenance.json)。这些卷面不再使用旧 paintings-atlas，按原比例装裱到纸面；卷纸保留实际暖光材质，颜色会受光照影响，不宣称与截图逐像素同色。实际衔接由本轮加载截图验收。

## 新版四卷与源边界

| 卷名 | 本轮输入 | 网页网格 | 独立纹理 | 交互节点 | 源帧范围 |
| --- | --- | ---: | ---: | ---: | --- |
| 神都花事 | 画卷一_最终修订.blend | 149 | 99 | 15 | 1—3024 |
| 花入万家 | 画卷二_街市建筑完整补全版.blend | 58 | 35 | 7 | 33—2184 |
| 锦绣花意 | 画卷三_分镜构图版_图层补全.blend | 79 | 66 | 9 | 1—2068 |
| 国色倾城 | 画卷四_转场运镜加快版.blend | 53 | 44 | 9 | 1—2160 |

四卷新版游观方向均为源 `+X`，网页完整保留**原作者时间进度0..1**，相机、物体动画和显隐沿同一时序推进。静止相机不代表画面停止：第三卷后段仍在切换场景和主体；按相机距离重排曾把最后三景压到极短滑块区间，连带末两段正文没有有效展示时间，因此新版已停用该压缩。第四卷较快转场和阅读停留也遵循作者时序；距离路线只保留给历史版本。第三卷完整 markers 保留9个“参考全景”，它们不重复进入交互 stops。第二卷第一标记原帧1保留在 `authoredFrame`，实际入口按源起始帧33。首卷149个导出物体中45个首帧可见、104个以后出现；另一个原生 MESH 全程隐藏，不应强行显示。

现行资源由 `src/data/sourceEdition.ts` 指向 `public/assets/new-scrolls/chapter-1..4/`。新 `sourceRevision` 不运行旧 `ArtDirectionLayer` 和 `CalligraphyLayer` 的补画/题字流程，旧结束帧也不截断新版路线。世界矩阵、相机、标记、源动画及逐帧可见性来自本轮文件；贴图加载回调不会把源隐藏物体提前显示。

四份活跃可编辑交付位于 `artwork/blender-reconstructed/chapter-{1..4}_reconstructed.blend`，本轮已替换为新输入的打包副本。首卷输入原件仍有一张旧绝对路径未打包图片，交付副本已装入精确原图；输入未保存改写。网页 WebP 最大边长2048，保持透明通道，采用未打光绘画表面，不宣称复刻所有 Blender 灯光或程序着色。

## 游观、文字与配乐

滚轮、拖拽、方向键、Home/End、时间轴与分镜继续控制真实画卷；自动展卷可暂停，手动输入接管，四卷会话进度独立保存。顶部显示当前卷名、四卷导航与返回书房。画心占据主要可用空间，手机另行取景并保留清晰入口。

主线正文只读提取自 `主线内容(2).docx`，25段按四卷6／6／6／7段逐字保留。`newNarrative.ts` 保存正文，`narrativeTrack.ts` 按新源节点顺序分配短题跋，并按字数保留最低阅读窗口，短句也留出渐显时间。测试直接使用实际 `prepareScene` 的当前时序，检查25段及各响应式片段均有非零区间。楷体由本地霞鹜文楷子集提供，许可证和来源在 `public/fonts/`；文字独立于原画，以650ms CSS 渐显渐隐，减少动态为180ms，不拦截游观输入。`NarrativeSpace` 采样实际 WebGL 画面，在候选区比较纸白与边缘密度后选择较安静位置；这是启发式避让，是否遮挡主体仍需逐景截图审阅。较密区域使用很淡的纸绢衬底。

卷末退去正文，停止局部动效并显示大卷名、末句题跋与一次落印；保留再观和下一卷入口。局部动效只绑定经过纹理审阅的独立花瓣、少量飘带和灯笼，人物、建筑、组合画层保持源姿态；追加单瓣取自新版首卷真实纹理，按世界坐标加入同一资源和释放队列。

「古筝配乐」须用户点击开启，可调音量，离开画卷或页面隐藏时暂停。`public/audio/peony-guzheng-original.mp3` 是脚本创作的五声音阶乐曲与**合成古筝意境拨弦音色**，并非真人古筝录音，也无语音朗读。乐谱、生成脚本与来源说明一并保留。

## 维护入口

| 入口 | 用途 |
| --- | --- |
| `src/scene/StudyRoomRenderer.ts`、`components/StudyHome.tsx` | 参考投影 relief、实体卷杆与题签 |
| `src/hooks/useStudyJourney.ts`、`scene/ScrollUnfurlScene.ts` | 状态、最低展示与几何闭卷展开 |
| `src/scene/SceneRenderer.ts`、`prepareScene.ts` | 新源几何、完整作者时序、流式纹理与可见性 |
| `src/data/newNarrative.ts`、`narrativeTrack.ts`、`scene/NarrativeSpace.ts` | 本轮正文、节点与画面留白采样 |
| `src/data/newMotionProfiles.ts`、`scene/NewScrollAtmosphere.ts` | 新源独立局部轻动 |
| `scripts/new-scroll-sources.json` | 新四卷本地源位置 |
| `scripts/export-new-scrolls.py`、`prepare-new-scrolls.py` | 源导出、索引化与 WebP |
| `scripts/pack-new-scroll-delivery.py` | 活跃可编辑副本打包 |
| `scripts/create-peony-music.py` | 原创合成拨弦配乐制作 |

重新制作资源需本机原始输入与 Blender/Python 依赖；先检查配置和源 SHA，再执行对应脚本。**旧 `build-reconstruction.mjs`、`build-blank-design.mjs`、`build-chapter-3-refinement.mjs` 只对应历史版，不得用于恢复当前新源。**旧交付来由保存在 [历史重构](reports/reconstruction/README.md)、[历史第三卷](reports/chapter-3-refinement/README.md) 和 [前轮首页](reports/study-faithful/README.md)。

## 本轮验证与限制

```powershell
npm run build
npm test
npm run validate:assets
node scripts/validate-new-scroll-assets.mjs
node scripts/validate-new-narrative.mjs
node scripts/validate-new-motion.mjs
node scripts/validate-projection-home.mjs
node scripts/validate-new-scroll-runtime.mjs
node scripts/validate-new-scroll-journey.mjs
```

独立资源验证需要包含 Pillow 的 Python，可由 `MDGS_PYTHON` 指定；原生验证命令为 `blender --background --disable-autoexec --python scripts/validate-new-scroll-native.py`。浏览器脚本需要 Playwright/Chromium，可由 `MDGS_PLAYWRIGHT_MODULE`、`MDGS_TEST_BROWSER`、`MDGS_PREVIEW_URL` 指定，均不属于产品运行配置。`--static-only` 的首页检查只验证文件身份，不证明浏览器画面。

已实际通过的新版证据：四源及四交付的独立 Blender 只读重开、几何/UV、相机和矩阵轨道、全整数帧可见性、当前文件 SHA、244张 WebP 完整像素解码；完整源区间和可见性映射；25段正文逐字、真实 prepared 时序与各响应式片段非零窗口校验；局部动效 CPU/状态校验；投影首页素材静态哈希与 TypeScript 检查。详见 [源与资产复核](reports/new-scrolls/audit-README.md)、[正文说明](reports/new-scrolls/narrative-README.md)、[动效说明](reports/new-scrolls/motion-README.md)。

实际生产浏览器新版运行30组通过：桌面/手机80次节点、166个响应式正文片段全部访问，25段正文字符一致，末帧/落印、实际音乐解码与gain、off/reduce通过；首页13组通过。入卷最终8组覆盖真实四入口闭半全开、持续慢加载、cover503重试、取消旧manifest、手机音乐布局/音频503重试/返回清理。计时8组和生产子目录四卷/字体音乐/保留交互均通过，详见 [总验收页与8张全节点接触表](reports/new-scrolls/README.md)。功能与素材提交 `d849765` 已推送并核对 `origin/main` 一致，`git lfs fsck --objects HEAD` 通过；终态记录见 [Git交付证据](reports/new-scrolls/git-delivery.json)。尚不宣称实体手机、Safari/Firefox、稳定60FPS、物理扬声器听感或线上部署通过。

## 工程记忆

后续开发从 [工程记忆导航](wiki_memory/README.md) 进入，先读根 `AGENTS.md` 与记忆维护协议。当前实现选择见 [ADR-006](wiki_memory/决策/ADR-006-新版四卷与参考投影书房.md)，它替代前轮首页与活动源选择，继续保留四秒闭卷和真实首帧门控。
