# 国色长卷 · 数字牡丹赋

React + TypeScript + Vite + Three.js 数字手卷展陈。首页按《国色长卷：牡丹雅韵四卷展》重建独立园林、窗框陈设、书案、四卷和前景花枝，六幅独立画材组成九个景深平面。真实绢纸题签支持鼠标、键盘与触屏，配合克制的视差、花瓣、香烟、灯光、流苏和雾气。手机重新取景并将四卷排为两列，文字保持可读。四卷仍使用原 Blender 工程的图像平面、网格、变换、相机和时间轴标记。

本轮分层书房、按钮反馈和运行截图见 [分层首页交付说明](reports/study-layered/README.md)。原始参考文件保留，当前首页由独立透明景物和真实HTML按钮组装，不再将整张参考图加热区作为最终呈现。每次入卷（含刷新、历史与重试）执行完整仪式，艺术加载至少展示3秒；减少动态同样保留3秒，后台时间不计入。真实清单、纹理、画材解码和WebGL首帧仍是进入条件，不伪造下载百分比。此前版本的[加载与场景基础](reports/study/README.md)继续保留。

当前版本为第三卷《锦绣花意》专项整改：九组主景重排、三处截口透明补绘、15组独立竖排题文；四卷合计197世界层/19文字层。短窗口按文字需要撑开画心，可纵向滚动。审查、方案、网页截图、前后对照和可编辑Blender副本见 [第三卷交付索引](reports/chapter-3-refinement/README.md)。当前清单用 `scripts/build-chapter-3-refinement.mjs` 重建。此前四卷22项资产/45新层的补白交付保留在 [历史索引](reports/blank-design/README.md)；旧builder会恢复历史清单。

## 运行

```powershell
npm ci
npm run dev
```

在工程目录运行以上命令，打开终端实际显示的 Local 地址。开发和预览默认由系统选择空闲端口，可与其他开发服务器同时运行；每次启动的端口可能不同。需要指定端口时可传 `-- --port <端口>`，占用时会尝试其他可用端口。

仓库中的派生 `.blend`、生产PNG和验收截图/录像由 Git LFS 管理。需要获取这些交付物时，在安装 Git LFS 后运行 `git lfs install`、`git lfs pull`；网页运行所需的WebP与清单仍是普通Git文件。原始 `source/` 素材和本机路径配置不上传。

Windows 可直接双击根目录的 `runStart.cmd`：它以自身位置定位工程，检查 Node/npm 与依赖，并自动打开当前实例的实际地址。无需修改磁盘路径、端口或浏览器窗口尺寸。关闭启动窗口或按 Ctrl+C 可停止该实例。

正式构建用 `npm run build`，本地检查构建用 `npm run preview`。构建使用相对资源地址，可放在站点根目录或子目录；通过 HTTP 服务访问，子目录入口需保留结尾 `/`。

## 游观

- 画卷内滚轮向下推进；按住并左右拖拽。
- 自动展卷可暂停、继续；滚轮、拖拽、时间轴和分镜操作立即接管。
- 四卷独立保存本次会话内的进度，返回已浏览章节可继续。
- 时间轴提供原 Blender 阅读标记；上一景、下一景平滑到达节点。
- 聚焦画卷后使用左右方向键、Home / End；外层画卷可用空格启停。进度条也支持原生键盘操作。
- 底部「画外拾遗」打开文化说明；首卷含完整《展卷序》。Escape 关闭，焦点返回入口。
- 「听音」由用户点击启用本地合成五声音阶环境声，无外部音频文件；再次点击关闭。支持全屏与系统减少动效偏好。
- 「画中轻动」控制局部花枝、灯彩、云气与花瓣，独立于自动展卷并记住用户选择；系统减少动效或页面转入后台时暂停。第四卷从第五景起逐渐减速、减少花瓣与云气。
- 卷末显示题跋、一次落印和再观/下一卷入口。

## 资产接入

| 卷 | 网页题名 | 实际网格 | 纹理（含透明程序材质） | 真实阅读节点 | 原游观方向 |
|---|---|---:|---:|---:|---|
| 一 | 神都花事 | 216 | 105 | 15 | +X |
| 二 | 花入万家 | 42 | 34 | 7 | +X |
| 三 | 锦绣花意 | 393 | 72 | 9 | +Y |
| 四 | 国色倾城 | 128 | 52 | 9 | −Y |

原资产导出完整且没有缺失源贴图；网页跳过12个独立 FONT 网格，并按重构清单退役重复辅助片及低清题签。纹理最大边长2048px，WebP保留透明通道。原纹理约142.59 MiB，上一轮34项选定新图约14.75 MiB，当前补白另22项约5.69 MiB，均按章节和视野加载。源 `.blend` 文件只读；整理结果另存于 `artwork/blender-reconstructed/`。

场景保留 Blender 世界坐标，矩阵为列主序、四元数为 xyzw。前中远景使用实际深度，平移自然产生视差；鼠标有极小的横向视差偏移，不允许自由旋转。以原始阅读节点构图作为卷首，以空间距离替代电影停留时间，避免滚轮在静止帧上失效。第一卷末尾抬升与第二卷末尾大幅收卷拉远在网页路线外，源路径仍完整保存。

透明云气、淡墨接地影的原径向透明关系已恢复为小型 RGBA 纹理。纸面保留原材质配色；浏览器采用无光照绘画表面，未完整复刻 Blender 的灯光、噪声着色或全部程序材质。四卷共19组真实HTML题文/中性装饰印，其中第三卷15组竖题；沿同一相机投影，按窗口与文字需求保障可读，文化长文仍在抽屉。指定低清题文已清除或退役，其余原画题文保留。

## 上一轮基础图层重构

四卷263张源纹理完成审校：216保留、35修复、12重生成。实际选用12项重生成、20项像素补绘和2项共享云气/远山，共34项生产图；补入152个独立世界图层及8个HTML文字层。图层裁决与逐实例实施结果分别记录，修复还包括完整UV、自然墨边和退役重复辅助片。

完整交付、图层表、四份Blender副本、修改文件清单、前后截图和动效录像见 [重构交付索引](reports/reconstruction/README.md)。原四份源工程保留不变，网页通过 `public/assets/reconstruction/manifest.json` 叠加可追溯修订，原相机路径与阅读节点保持。

历史维护入口：`scripts/build-reconstruction.mjs` 与 `scripts/build-blank-design.mjs` 生成前两轮清单（当前改用 `scripts/build-chapter-3-refinement.mjs`）；`scripts/prepare-reconstruction-assets.py` 负责透明安全边和WebP；`scripts/reconstruct-blender.py` 生成派生副本；`scripts/report-reconstruction-status.mjs` 对照实际运行逻辑输出逐实例实施表。正常启动网页无需Blender或Python。

## 目录与可配置项

```text
src/
  App.tsx                     统一展陈框架、导航、时间轴、卷末
  styles.css                  样式入口
  styles/
    exhibition-theme.css      颜色、字体、装裱尺寸统一配置
    handscroll.css            手卷、卷轴、织锦、宣纸与桌面布局
    reading-panel.css         文化解读与卷末题跋
  components/
    ScrollViewport.tsx        滚轮、指针拖拽、键盘
    CulturePanel.tsx          文化全文、总序、焦点管理
    AudioController.tsx       点击启用的合成环境声
    ScrollOrnaments.tsx       可复用卷轴、织锦和氛围装饰
  hooks/useScrollController.ts 平滑移动、自动展卷、独立进度
  scene/
    SceneRenderer.ts          Three.js真实网格、视差、按需纹理/释放
    ArtDirectionLayer.ts      可追溯图像替换、完整UV、自然边缘和连接层
    MotionDirector.ts         局部UV基、独立时钟、动作配额与第四卷盛衰
    prepareScene.ts           原相机轨迹到连续游观进度的映射
    CalligraphyLayer.ts/.css   随世界位置移动的 HTML 竖排题字
  data/
    chapters.ts               四卷标题、策划正文、总序、题跋
    sceneOptions.ts           各卷阅读结束帧、自动展卷时长
    annotations.ts            四卷题字配置、世界位置、字号、显示区间
  types.ts                    资产接口
public/assets/chapter-1..4/
  scene.json                  资产清单、变换、深度、完整相机/分镜/动画
  textures/*.webp             原始平面提取与优化图像
public/assets/reconstruction/ 修订清单与34项选定透明生产图
artwork/                      原始生成图、生产PNG和四卷派生Blender
scripts/                      Blender导出、优化与验证
reports/                      资产审查、测试报告、参考渲染与网页截图
```

修改题名和文字用 `src/data/chapters.ts`；内容来自所提供的完整策划文字，四份本地 DOCX 脚本亦已逐段核对。`sceneOptions.ts` 可调整阅读结束帧与自动播放秒数；实际分镜名字和位置来自 `scene.json` 中的 `stops`，应优先在 Blender 标记中修改并重新导出。

## 重新导出

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-export.ps1 -SourceRoot '<四卷源工程的上级目录>' -MaterialsRoot '<素材目录>'
# 另按源场景尺寸生成参考图（可用 -ReferenceWidth / -ReferenceHeight 调整）：
powershell -ExecutionPolicy Bypass -File .\scripts\run-export.ps1 -SourceRoot '<四卷源工程的上级目录>' -MaterialsRoot '<素材目录>' -RenderReferences
```

Blender、Python、Node 从 `PATH` 查找，也可传 `-Blender` / `-Python` / `-Node` 指定。源工程与素材位置统一由 `scripts/asset_config.py` 解析，可使用命令行参数、`MDGS_*` 环境变量或根目录的 `asset-pipeline.local.json`；配置示例见 `scripts/asset-pipeline.example.json`。本机配置被 Git 忽略，配置中的相对路径按配置文件所在目录解析。详见 `reports/assets-readme.md`。脚本依次读取、导出、索引化、WebP优化、恢复程序透明材质、统计并验证；全过程不保存原 Blender 文件。浏览网页无需这些外部源工程与工具。

## 检查与实际限制

```powershell
npm run validate:assets  # 全部资源、矩阵/几何、UV/索引、相机/分镜与文件完整性
npm test                # 四卷连续路径、分镜顺序、结束帧及原几何不被修改
npm run build           # TypeScript和生产构建
```

浏览器采用当前画卷的扩大可视范围加载纹理，最多4个并行加载；离开视野的纹理通过约160 MiB目标LRU释放（可见资源不强行卸载），切章节释放全部旧场景GPU资源，DPR上限1.65。实际峰值显存与帧率取决于设备，结构检查不等于所有设备性能保证。

网页截图见 `reports/screenshots/`；Blender参考图见 `reports/assets-reference-chapter-*.png`。本次 UI 重构与验证见 `reports/handscroll-ui-review.md`；此前场景功能记录见 `reports/browser-validation.md`。正式上线部署不在本次本地开发任务范围内。

最新启动冲突、路径可移植和窗口自适应整改见 [验收记录](reports/portability-review.md)，包括并发启动、端口占用回退、9种窗口尺寸及子目录资源加载验证。重新验证启动行为前先 `npm run build`，再运行 `npm run test:startup`。

最终重构版本已复测生产子目录的全部四卷和核心交互。浏览器测试环境提供Playwright/Chromium后运行 `npm run test:subpath`；可用 `MDGS_PLAYWRIGHT_MODULE` / `MDGS_TEST_BROWSER` 指定工具，不作为正常运行依赖。

## 工程记忆

后续开发从 [工程记忆导航](wiki_memory/README.md) 进入，先读根 `AGENTS.md` 与记忆维护协议。当前采用 lite 模式；维护工具已随仓库保存，无需依赖原技能目录。
