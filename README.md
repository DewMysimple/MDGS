# 国色长卷 · 数字牡丹赋

以一朵牡丹为引，连接山野、御苑、日常与诗意的电脑端数字艺术作品。观众可以亲启四卷、移步游观，在花与纹样之间参与，并在卷末择意钤印，留下一笺自己的春色。

采用 React、TypeScript、Vite 与 Three.js。原作四卷来自用户提供的“牡丹2.0”，活动版本为 `peony-2.0-2026-10-23`；首页、启卷、展览界面、参与和声音围绕「绢上春生，移步成卷」重新制作。设计依据与来源边界见[艺术调研](reports/art-renewal/design-research.md)。

## 本轮交付入口

当前艺术交付版本为第八轮，源与三份生产包均有固定指纹。创作表达见[作品说明](reports/art-renewal/作品说明.txt)，完整保真入口见[第八轮验收](reports/art-renewal/art-candidate-8-freeze.json)，观看、导览与独立包信息见[交付索引](reports/art-renewal/交付索引.txt)。

功能、艺术审视、像素对照各自记录实际范围；[精选证据清单](reports/art-renewal/git-evidence-manifest.json)明确哪些媒体随Git交付，原始JPEG/PCM/trace等留本机。

## 运行

```powershell
npm ci
npm run dev
```

也可双击 `runStart.cmd`。生产构建使用 `npm run build`，预览使用 `npm run preview`；以终端打印的实际端口进入本作。网页支持 HTTP 子目录部署，正常运行不需要 Blender、Python或外部字体服务。当前交互与排版以电脑端为验收范围。

可编辑 `.blend`、验收 PNG/JPG 等大文件沿用 Git LFS。获取完整交付先安装 Git LFS，再运行 `git lfs install` 和 `git lfs pull`。原始 `牡丹/`、`牡丹2.0/`、DOCX、参考图、缓存、本机配置与凭据不提交。

需要单独展示时，运行 `npm run export:exhibition`。生成的 `dist-exhibition/` 约541MB，只包含选用四卷、美术、声音、字体及运行库许可；原图与程序场逐字节复制，完整工程和历史素材仍保留。安装Node.js 18或更新版本后，可在该文件夹双击「启动展览.cmd」，或运行 `node serve.cjs --open`，无需项目依赖或Blender。也可交给静态HTTP服务器；不要直接双击HTML。导出库存及复制校验见 `reports/art-renewal/exhibition-package.json`。

Windows 独立程序使用 `npm run export:desktop -- --output "交付目录"` 制作，要求 Windows 和已安装的开发依赖。脚本构建网页、校验选用资源，使用 Electron 封装包含 Chromium、Node.js、字体、声音与四卷资源的单文件便携 EXE，再生成 ZIP 并实际解压、核对 SHA。收件人在 Windows 10/11 64 位双击「数字牡丹赋.exe」即可断网运行，无需另装浏览器或 Node.js。首次启动会释放内置文件到系统临时目录；F11 切换全屏、Esc 退出全屏，花笺使用系统保存对话框。文献参读链接按观众点击交给系统浏览器。输出目录已有同名交付时脚本拒绝覆盖。

桌面壳为 `desktop/main.cjs`，只加载固定来源 `mdgs://app/` 的内置资源，独立于本机开发服务器端口；窗口启用沙箱与隔离，设置保存在当前用户的应用数据目录。`electron-builder.config.cjs` 固定 Windows x64 便携目标。构建报告见 `reports/desktop/package.json`；使用 `npm run test:desktop -- --executable "dist-desktop/win-unpacked/数字牡丹赋.exe"` 验证捆绑内核、资源原字节、四卷、音频和花笺，QA 工具沿用 `MDGS_PLAYWRIGHT_MODULE`，不随程序分发。最终便携 EXE 另由 `scripts/validate-portable-desktop.mjs --executable "实际交付EXE"` 验证真实自解压启动。

### 画质与帧率

首页和卷内的「设置」均可选择720p、1080p、2K画质，以及30帧、60帧绘制上限。首次运行和缺失新字段的旧设置使用720p / 30帧，适合先在教室等设备上开启；选择即时生效并保存在本机，恢复默认也回到此档。设置中同时说明画质与帧率对清晰度、运动流畅度和设备性能的影响。

画质限制实际画布和离屏缓冲区的像素预算，并分档调整Film、景深、光照和阴影采样。CSS文字、控件、留白、相机取景和源动画保留；720p、1080p颜色贴图只在内存中缩小，交付中的原图与数值程序场保留原字节，2K可恢复原图。帧率是绘制上限，并不保证设备达到该数值，也不代表浏览器合成或显示器刷新率。隐藏页面停止绘制，资源未齐时保留上一完整画面；负载过高时仍按最多一个源帧推进，避免跳过作者的入场细节，实际播放时长可能延长。

本轮实现针对低配置减少渲染负担，未取得学校教学机的实机数据，不能宣称全部老旧核显或无WebGL设备都稳定30帧。

## 当前四卷

| 卷名 | 原生文件 | 网格 | 独立原图 | 节点 | 源帧范围 | 端点时长 |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| 神都花事 | 画卷一_灼烧入场版.blend | 149 | 99 | 15 | 1—3024 | 100.7667秒 |
| 花入万家 | 画卷二_街市建筑完整补全版.blend | 58 | 35 | 7 | 33—2184 | 71.7秒 |
| 锦绣花意 | 画卷三_分镜构图版_图层补全.blend | 79 | 66 | 9 | 1—2068 | 68.9秒 |
| 国色倾城 | 画卷四_画卷一节奏运镜版.blend | 52 | 43 | 9 | 1—1800 | 59.9667秒 |

四源均为30fps。自动展卷使用 `(end-start)*fpsBase/fps` 的源时长与经过帧率门控的时间，完整影片包含首尾帧的时长另多一帧；等待资源的时间不计入进度，慢设备最多逐源帧推进以保留入场细节。手动游观保留原作者时间0..1，不按镜头距离压缩静止场景。第二卷原帧1的标记保留 `authoredFrame`，实际入口为33；效果边界保留在完整 markers，交互 stops 仅使用正文场景节点。

四份 `artwork/blender-reconstructed/chapter-N_reconstructed.blend` 为当前输入的完整打包副本，逐字节 SHA 相同。四原件只读，不保存改写。第四卷旧版多余的“09 · 04_中部人物群.png · 中景”及其孤立纹理已移除。

## 原画与实时渲染

- **源数据**：每个整数帧的相机、世界矩阵、显隐与实际材质参数；首卷25个形态键对象恢复相对顶点和真实权重。243张原图以全分辨率无损格式交付，解码RGBA逐字节一致。
- **材质与光照**：按源节点图计算透明度、淡入、水墨与灼烧，使用原生程序场；高频纸面Noise直接实时求值，避免低分辨率字段混叠。按DITHERED深度层与BLENDED原点顺序合成真实alpha，修复雪山穿过人物；保留源世界光、SUN/AREA和阴影。图像采样保留CLIP/REPEAT。
- **后期**：线性HDR处理源Film采样、景深与首卷AOV光晕，总渲染缓冲限制为4M像素、240MiB（不含图像与阴影）。光晕仅提取原生Glare的后期贡献，几何、镜头、图层和材质仍由实时3D绘制。半浮点程序场兼容宿主自动gzip解码和普通二进制gzip两种响应。
- **构图与时间**：按源画幅完整显示，窄屏居中留边。关闭追加画层与鼠标镜头偏移；源动画随游观时间运行。短题跋按真实片长保留可见窗口。

浏览器中的光照、透明阴影、景深和Film为源设置的数值重建；Film使用子像素网格近似EEVEE时间采样，景深采用单层透明阈值深度。是否满足当前画面要求由[本轮原生与网页对照](reports/peony2-fidelity/README.md)的实际逐帧指标证明，不宣称与Blender完整渲染数学等价。

首次进入时，原生材质程序在候卷期间分批链接，通过`KHR_parallel_shader_compile`检查完成，再由真实资源和实际首帧放行。页面将取消信号显式传给渲染器，后台停止准备任务的调度和轮询，GPU恢复后重新排队；没有该扩展时沿用原有首次绘制路径。原来的着色器错误检测继续生效。实现见[ShaderWarmup](src/scene/ShaderWarmup.ts)，对照、取消与硬件异常证据区分隔离原型和正式候选。

原图在浏览器完成解码后进入有界上传队列，每个动画回合预备一个纹理或其实际原生采样变体，全部就绪后再交给原材质；保留CLIP/REPEAT等源参数。近期离开画面的资源另有约96MiB图像、24MiB后期场的估算保留预算与5秒期限，改善反向游观；这些不是总GPU显存承诺。GPU恢复会重排尚未完成的全部采样变体。未降低原图分辨率或压缩作者时钟；同源隔离对照与失败原型见[拖动与纹理准备](reports/art-renewal/texture-streaming-preparation/README.md)。

## 首页、交互与文字

首页以青绿远山、朱红主牡丹、粉白小枝与独立书写主标题构成四个画层，保留纸白和花的向背。微风、湿色与视差回应指针；WebGL 不可用时，牡丹仍由同一原图完整显示。画材由生成式图像辅助创作，[原始PNG](artwork/homepage-generated/README.md)与[完整提示来源](public/ui/peony-atlas/provenance.json)独立交付。真实HTML负责主要文字和操作。

择卷后，薄纸沿真实曲面舒卷，木玉轴杆随之转动；原画按各自真实比例呈现，展开图与观卷canvas画心同位接力。加载在前台至少4000ms，真实资源与首帧共同决定放行；提供失败重试、取消及返回序厅。四卷封面取自当前真实WebGL首帧，来源见 `reports/peony2-fidelity/cover-provenance.json`。

观卷区采用紧凑页眉与控制区，把更多窗口留给完整原画；1080p画心高954px，较此前850px增加约12%，保留各卷源比例与题跋阅读纸边。窄纸边的卷末标题自适应字号，避免挤出底部操作。

每卷保存本次会话的位置。非零续看与收卷复制实际成功绘制的GPU画心，保持当前源进度；不会用卷首封面冒充上次画面。快照仅保存在本机运行时，缓存/可见消费者分别管理URL引用；GPU失效时可以暖纸淡出返回。

「画中有遇」直接落在原画上：第一卷辨传说与文献，第二卷循花、舟、桥游观，第三卷选花入锦，第四卷展读诗笺。锚点由原mesh的UV经真实形变、世界矩阵和相机投影得到，随画幅正确定位。新增短笺利用留白，保留原作内容。

「画外拾遗」区分新增花事札记与完整原作文字，并附文献、馆藏入口；跨时代参读不冒充同时代史证。卷末题跋优先进入原画留边；观者可择意、钤印并在本机保存1200×1600花笺PNG。花笺为当代新题，不伪托古人，不上传个人信息。

默认「诗意短章」以45条当代新题伴画，按原作真实时长分配阅读与纯画留白；同句保持题跋位置，下一句再重新选择留白。设置也可切到「原作叙事」或「静观画卷」。25段原作正文仍逐字保留在原作模式和「画外拾遗」，不会被短章替换。

滚轮、拖拽、键盘、分镜、时间轴和自动展卷控制同一进度。时间轴的节点与轨道共用手势，从节点起拖也可连续游观，轻点与键盘仍准确选择分镜。设置保留四卷独立速度与平滑、微透明文字底板的不透明度/留白/圆角/边框，浏览器保存并支持恢复默认。HTML正文与原画分离，本地霞鹜文楷与许可证在 `public/fonts/`。留白定位为启发式，保留手动暂停阅读。

文楷子集保留原有全部码点，并补齐当前源码语料。修改文案后可用`scripts/prepare-kai-font.py`重新制作，再用`scripts/validate-kai-font.py`检查实际WOFF2覆盖及原字形、行度量；制作环境需FontTools和Brotli，网页无需这些依赖。固定上游版本、字体SHA和语料SHA在`public/fonts/provenance.json`，实际浏览器字体仍以CDP检查与排版实测为准。

「原创数字声景」须主动启声，三条独立合成轨随首页、启卷、四卷及返首页连续变化，切卷保留同一音乐时钟；读笺时降低音乐，隐藏页面暂停，返回继续。它是当代原创数字拨弦、泛音与气息声景，非真人器乐录音或古乐复原；音量可随时调整，无语音朗读。

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
node scripts/validate-artwork-projection.mjs
node scripts/validate-peony-soundscape.mjs
node scripts/validate-art-renewal-ui.mjs
```

原生复核与完整命令见[本轮证据](reports/peony2-fidelity/README.md)。`validate:new-assets` 仅代表结构与源数据检查，不代表视觉通过。完整像素验收绑定当前源码、构建、材质、光照设置和资源SHA，比较全部59个原生关键帧；没有实际抓图不能得到视觉通过。

浏览器脚本使用 `MDGS_PLAYWRIGHT_MODULE`、`MDGS_TEST_BROWSER`，图像核验使用带Pillow的 `MDGS_PYTHON`，均为本机验证配置；原图缓存可通过保真脚本的 `--raw-cache` 显式提供。原始DOCX当前工作区不存在，正文回归明确使用已跟踪转录，不宣称重新验证原DOCX字节。其他浏览器、跨设备持续帧率及线上部署不由本地Chromium验证覆盖。

若本机原图缓存缺失，可从仓库内已打包、与源SHA相同的四份blend只读恢复：`blender --background --disable-autoexec --python-exit-code 1 --python reports/art-renewal/restore-original-image-cache.py -- tmp/peony2-original-image-cache`，再给保真脚本传`--raw-cache tmp/peony2-original-image-cache`。此步骤不保存blend，不替换运行图像。

## 工程记忆

从[工程记忆导航](wiki_memory/README.md)进入。[牡丹2.0保真决策](wiki_memory/决策/ADR-007-牡丹2.0保真整改.md)约束原画源与渲染，[艺术表达决策](wiki_memory/决策/ADR-008-牡丹数字游观的艺术表达.md)记录本轮界面、参与、声音与来源选择。旧源与旧功能的历史证据保留在 `reports/new-scrolls/` 和 `reports/viewer-settings/`。
