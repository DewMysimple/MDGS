# 国色芳华 · 牡丹文化数字长卷

React + TypeScript + Vite + Three.js 的桌面端本地数字手卷展陈，按用户最新要求不开发移动端，建议窗口宽度至少 1024px，按最新概念图采用传统手卷装裱：青金织锦、象牙白卷轴和深木端头，主要验收尺寸为 1440×900 与 1680×945。四卷均使用提供的 Blender 工程中实际图像平面、网格、中文文字几何、世界变换、相机与时间轴标记；不使用网络占位图、视频或单幅长图。

## 运行

```powershell
cd C:\Users\16033\Desktop\MDGS
npm install
npm run dev
```

打开 http://localhost:5173/ 。开发服务器固定 5173 端口。正式构建用 `npm run build`，本地检查构建用 `npm run preview`。

## 游观

- 画卷内滚轮向下推进；按住并左右拖拽。
- 自动展卷可暂停、继续；滚轮、拖拽、时间轴和分镜操作立即接管。
- 四卷独立保存本次会话内的进度，返回已浏览章节可继续。
- 时间轴提供原 Blender 阅读标记；上一景、下一景平滑到达节点。
- 聚焦画卷后使用左右方向键、Home / End；外层画卷可用空格启停。进度条也支持原生键盘操作。
- 底部「画外拾遗」打开文化说明；首卷含完整《展卷序》。Escape 关闭，焦点返回入口。
- 「听音」由用户点击启用本地合成五声音阶环境声，无外部音频文件；再次点击关闭。支持全屏与系统减少动效偏好。
- 卷末显示题跋、一次落印和再观/下一卷入口。

## 资产接入

| 卷 | 网页题名 | 实际网格 | 纹理（含透明程序材质） | 真实阅读节点 | 原游观方向 |
|---|---|---:|---:|---:|---|
| 一 | 神都花事 | 216 | 105 | 15 | +X |
| 二 | 花入万家 | 42 | 34 | 7 | +X |
| 三 | 锦绣花意 | 393 | 72 | 9 | +Y |
| 四 | 国色倾城 | 128 | 52 | 9 | −Y |

四卷没有缺失源贴图或被跳过对象。纹理最大边长 2048px，WebP 保留透明通道。公开资源总计约 142.59 MiB（四卷按需加载，不一次载入全部）。源 `.blend` 文件只读打开，不保存、不覆盖；中间原图字节放在被忽略的 `.asset-cache/`。

场景保留 Blender 世界坐标，矩阵为列主序、四元数为 xyzw。前中远景使用实际深度，平移自然产生视差；鼠标有极小的横向视差偏移，不允许自由旋转。以原始阅读节点构图作为卷首，以空间距离替代电影停留时间，避免滚轮在静止帧上失效。第一卷末尾抬升与第二卷末尾大幅收卷拉远在网页路线外，源路径仍完整保存。

透明云气、淡墨接地影的原径向透明关系已恢复为小型 RGBA 纹理。纸面保留原材质配色；浏览器采用无光照绘画表面，未完整复刻 Blender 的灯光、噪声着色或全部程序材质。文字几何仍导出在原资产中，网页将独立 FONT 说明层收至文化抽屉；第二、三卷在已检查的留白区增加真实 HTML 竖排题字，由独立 CSS3D 层沿同一相机投影。图像本身的原有题文保留，部分含原作的横排字。

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
scripts/                      Blender导出、优化与验证
reports/                      资产审查、测试报告、参考渲染与网页截图
```

修改题名和文字用 `src/data/chapters.ts`；内容来自所提供的完整策划文字，四份本地 DOCX 脚本亦已逐段核对。`sceneOptions.ts` 可调整阅读结束帧与自动播放秒数；实际分镜名字和位置来自 `scene.json` 中的 `stops`，应优先在 Blender 标记中修改并重新导出。

## 重新导出

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-export.ps1
# 另生成960×540原场景参考图：
powershell -ExecutionPolicy Bypass -File .\scripts\run-export.ps1 -RenderReferences
```

默认调用 `F:\Blender\blender.exe`，四个工程路径定义于 `scripts/export_blender.py` / `audit_blender.py`。详见 `reports/assets-readme.md`。脚本依次读取、导出、索引化、WebP优化、恢复程序透明材质、统计并验证；全过程不保存原 Blender 文件。

## 检查与实际限制

```powershell
npm run validate:assets  # 全部资源、矩阵/几何、UV/索引、相机/分镜与文件完整性
npm test                # 四卷连续路径、分镜顺序、结束帧及原几何不被修改
npm run build           # TypeScript和生产构建
```

浏览器采用当前画卷的扩大可视范围加载纹理，最多4个并行加载；离开视野的纹理通过约160 MiB目标LRU释放（可见资源不强行卸载），切章节释放全部旧场景GPU资源，DPR上限1.65。实际峰值显存与帧率取决于设备，结构检查不等于所有设备性能保证。

网页截图见 `reports/screenshots/`；Blender参考图见 `reports/assets-reference-chapter-*.png`。本次 UI 重构与验证见 `reports/handscroll-ui-review.md`；此前场景功能记录见 `reports/browser-validation.md`。正式上线部署不在本次本地开发任务范围内。

## 工程记忆

后续开发从 [工程记忆导航](wiki_memory/README.md) 进入，先读根 `AGENTS.md` 与记忆维护协议。当前采用 lite 模式；维护工具已随仓库保存，无需依赖原技能目录。
