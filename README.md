# 国色长卷 · 数字牡丹赋

React、TypeScript、Vite 与 Three.js 数字手卷。当前四卷来自用户提供的“牡丹2.0”，活动版本为 `peony-2.0-2026-10-23`。本次整改已合入 GitHub `fa08c92` 的游观平滑、独立设置与微透明文字底板。

## 运行

```powershell
npm ci
npm run dev
```

也可双击 `runStart.cmd`。生产构建使用 `npm run build`，预览使用 `npm run preview`。网页支持 HTTP 子目录部署，正常运行不需要 Blender、Python或外部字体服务。

可编辑 `.blend`、验收 PNG/JPG 等大文件沿用 Git LFS。获取完整交付先安装 Git LFS，再运行 `git lfs install` 和 `git lfs pull`。原始 `牡丹/`、`牡丹2.0/`、DOCX、参考图、缓存、本机配置与凭据不提交。

## 当前四卷

| 卷名 | 原生文件 | 网格 | 独立原图 | 节点 | 源帧范围 | 端点时长 |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| 神都花事 | 画卷一_灼烧入场版.blend | 149 | 99 | 15 | 1—3024 | 100.7667秒 |
| 花入万家 | 画卷二_街市建筑完整补全版.blend | 58 | 35 | 7 | 33—2184 | 71.7秒 |
| 锦绣花意 | 画卷三_分镜构图版_图层补全.blend | 79 | 66 | 9 | 1—2068 | 68.9秒 |
| 国色倾城 | 画卷四_画卷一节奏运镜版.blend | 52 | 43 | 9 | 1—1800 | 59.9667秒 |

四源均为30fps。自动展卷使用 `(end-start)*fpsBase/fps` 与真实墙钟，低显示刷新率不减慢原片；完整影片包含首尾帧的时长另多一帧。手动游观保留原作者时间0..1，不按镜头距离压缩静止场景。第二卷原帧1的标记保留 `authoredFrame`，实际入口为33；效果边界保留在完整 markers，交互 stops 仅使用正文场景节点。

四份 `artwork/blender-reconstructed/chapter-N_reconstructed.blend` 为当前输入的完整打包副本，逐字节 SHA 相同。四原件只读，不保存改写。第四卷旧版多余的“09 · 04_中部人物群.png · 中景”及其孤立纹理已移除。

## 本次整改

- **源数据**：每个整数帧的相机、世界矩阵、显隐与实际材质参数；首卷25个形态键对象恢复相对顶点和真实权重。243张原图以全分辨率无损格式交付，解码RGBA逐字节一致。
- **材质与光照**：按源节点图计算透明度、淡入、水墨与灼烧，使用原生程序场；高频纸面Noise直接实时求值，避免低分辨率字段混叠。按DITHERED深度层与BLENDED原点顺序合成真实alpha，修复雪山穿过人物；保留源世界光、SUN/AREA和阴影。图像采样保留CLIP/REPEAT。
- **后期**：线性HDR处理源Film采样、景深与首卷AOV光晕，总渲染缓冲限制为4M像素、240MiB（不含图像与阴影）。光晕仅提取原生Glare的后期贡献，几何、镜头、图层和材质仍由实时3D绘制。半浮点程序场兼容宿主自动gzip解码和普通二进制gzip两种响应。
- **构图与时间**：按源画幅完整显示，窄屏居中留边。关闭追加画层与鼠标镜头偏移；源动画随游观时间运行。短题跋按真实片长保留可见窗口。

浏览器中的光照、透明阴影、景深和Film为源设置的数值重建；Film使用子像素网格近似EEVEE时间采样，景深采用单层透明阈值深度。是否满足当前画面要求由[本轮原生与网页对照](reports/peony2-fidelity/README.md)的实际逐帧指标证明，不宣称与Blender完整渲染数学等价。

## 首页、交互与文字

首页保留参考相机投影到连续relief深度网格，加实体轴杆、曲面纸、纸厚和主要器物体积；支持克制微观察，大角度不能自由绕行。原图题签底板修复后使用真实HTML文字和按钮，参考图不重复显示标题。

择卷后执行聚焦、闭卷展开和入画。加载在前台至少4000ms，资源、加载画境及真实首帧共同决定放行；提供失败重试、取消及返回书房。四卷封面取自当前真实WebGL首帧，来源见 `reports/peony2-fidelity/cover-provenance.json`。

滚轮、拖拽、键盘、分镜、时间轴和自动展卷控制同一进度。设置保留四卷独立速度与平滑、微透明文字底板的不透明度/留白/圆角/边框，浏览器保存并支持恢复默认。HTML正文与原画分离，25段仍与已验收的主线转录逐字一致；本地霞鹜文楷与许可证在 `public/fonts/`。留白定位为启发式，保留手动暂停阅读。

「古筝配乐」须点击开启，可调音量，隐藏或离开画卷暂停。它是原创五声音阶与合成古筝意境拨弦音色，非真人录音，无语音朗读。

## 资产管线

配置 `scripts/new-scroll-sources.json` 的相对源目录，或用命令行/环境变量提供本机源路径。使用 **Blender 5.2**，并启用Python错误退出码：

```powershell
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/export-new-scrolls.py -- --config scripts/new-scroll-sources.json
python scripts/prepare-new-scrolls.py
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/export-source-materials.py
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/export-source-render.py
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/bake-source-glare.py -- --source "牡丹2.0/画卷一_灼烧入场版.blend"
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/pack-new-scroll-delivery.py
```

以脚本实际参数说明为准。源导出与准备后须重新生成材质、光照及后期；报告默认进入 `reports/peony2-fidelity/`。历史 `build-reconstruction`、`build-blank-design`、`build-chapter-3-refinement` 不可用于恢复当前源。

## 验证

```powershell
npm run build
npm test
npm run validate:assets
npm run validate:new-assets
npm run test:peony2-clock
npm run test:peony2-narrative
npm run test:render-performance
npm run test:peony2-fidelity
npm run test:peony2-runtime
npm run test:peony2-journey
```

原生复核与完整命令见[本轮证据](reports/peony2-fidelity/README.md)。`validate:new-assets` 仅代表结构与源数据检查，不代表视觉通过。完整像素验收绑定当前源码、构建、材质、光照设置和资源SHA，比较全部59个原生关键帧；没有实际抓图不能得到视觉通过。

浏览器脚本使用 `MDGS_PLAYWRIGHT_MODULE`、`MDGS_TEST_BROWSER`，图像核验使用带Pillow的 `MDGS_PYTHON`，均为本机验证配置。原始DOCX当前工作区不存在，正文回归明确使用已跟踪转录，不宣称重新验证原DOCX字节。其他浏览器、实体手机、跨设备持续帧率及线上部署不由本地Chromium验证覆盖。

## 工程记忆

从[工程记忆导航](wiki_memory/README.md)进入。当前整改与边界见[牡丹2.0保真决策](wiki_memory/决策/ADR-007-牡丹2.0保真整改.md)。旧源与旧功能的历史证据保留在 `reports/new-scrolls/` 和 `reports/viewer-settings/`。
