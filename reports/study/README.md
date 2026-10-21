# 国色长卷·数字牡丹赋：书房与入卷体验

本页保留初版书房及真实加载基础的历史说明。后续用户要求已将首页升级为独立分层、真实HTML题签及每次至少三秒加载；当前交付以[分层首页说明](../study-layered/README.md)为准，本目录运行回归JSON和截图会随当前版本更新。原implementation.json是初版来源快照，不作为新版源码哈希证据。

2026-10-21，基于 `c98e148` 的现有 React / TypeScript / Vite / Three.js 工程开发。原四卷场景、相机、分镜、图层与 Blender 源文件未改。

## 实现

- 首页 `StudyHome` 完整使用用户原始 1672×941 图片；SHA256 `3453de338d47604f30aa4efc629407216cf2cddde73be716c955ee951999aa10e`，工程副本与原件一致。SVG 热区和图片共享 viewBox 与缩放，桌面完整等比显示；手机竖屏保留完整图并增加四卷宣纸题签。
- `StudyAtmosphere` 提供少量有叶脉的曲线花瓣、原香炉位置青烟、窗侧微尘及暖光。没有移动或扭曲整张建筑图片。页面隐藏、系统减少动态和用户开关均受尊重。
- `useStudyJourney` 管理 HOME → SCROLL_AWAKENING → CAMERA_ENTERING → ARTISTIC_TRANSITION → SCROLL_LOADING → PAINTING_REVEAL → ENTERING_VIEWER → SCROLL_VIEWER → RETURNING_HOME。正常基本仪式约4.5秒，慢资源按真实状态延长。计时只控制仪式展示，不生成下载百分比。
- 独立 `ScrollLoadingScene` 使用同风格新绘的工笔牡丹、青绿宫苑和章节画材，中央卷面通过遮罩展开、木杆向两侧移动，墨稿、重彩、金纹分层显现。关闭环境动态保留必要展开仪式，系统减少动态另缩短过渡。
- 四卷中央画材分别对应神都宫苑、民间赏花、织锦器物与盛唐仕女。生成素材和准确提示词随 `public/ui/study/` 保存；装裱为轻量 HTML/CSS/SVG，不宣称物理纸张仿真。
- `SceneRenderer` 在后台实际加载章节清单、修订层与当前视野及相邻视野所需纹理。只在真实尺寸 WebGL 完成纹理上传及绘制后发出 ready；进入前 resize 会重新核验首帧。剩余长卷资源沿用流式加载，不把卷首计数宣称整章150MB下载进度。
- 入画通过展开卷面与透明孔径露出同屏的真实 WebGL。返回时立刻停播，保留当前画面参与柔化收卷，再释放 renderer 回书房。
- 锚点 `#chapter-1` 至 `#chapter-4` 支持直达、刷新、浏览器前进后退。进度存入 sessionStorage，存储受限时退回内存。旧请求在组件销毁后失效，重复选择受锁定；错误题签支持重试及返回。
- 原滚轮、拖拽、键盘、自动展卷、分镜、时间轴、画中轻动、合成声音、全屏与文化解读保留。新增共享色彩取原图的杏色绢纸、灰青绿、古铜金、深胡桃木与朱砂，去掉外部字体请求以使用中文衬线回退。

## 验证与截图

本轮实际执行 `npm run build`、`npm test`、`npm run validate:assets`、`npm run test:subpath`、`npm run test:study`、`npm run test:study-renderer`。浏览器测试需要本机可用 Playwright 和 Chromium，分别可通过 `MDGS_PLAYWRIGHT_MODULE` / `MDGS_TEST_BROWSER` 指定，不写进产品配置。

- [完整流程报告](validation-journey.json)：真实纹理延迟门控、完整阶段、重复选择、四卷原图热区、刷新位置、历史与取消、手机触屏、动态开关、失败重试、减少动态。
- [底层准备报告](../validation-study-renderer.json)：首帧、resize新增资源、旧清单取消、必要纹理失败重试、真实 GPU 上下文恢复与输入锁定。
- [子目录与原控件回归](../validation-portable-subpath.json)：四卷资产、游观、全屏和抽屉焦点，零404与页面错误。
- [桌面书房](home-desktop.png)、[悬停](home-hover.png)、[首卷加载](loading-desktop.png)、[二卷加载](loading-chapter-2.png)、[三卷加载](loading-chapter-3.png)、[四卷加载](loading-chapter-4.png)、[真实画卷](viewer-desktop.png)、[返回](returning-home.png)。
- [手机书房](home-mobile.png)、[手机加载](loading-mobile.png)、[手机真实长卷](viewer-mobile.png)、[异常题签](loading-error.png)。

验证环境为本机 Windows / Edge（Chromium）及浏览器模拟手机触屏。未以此宣称实体手机、Safari / Firefox、持续60 FPS测量或线上部署通过。新增素材提升加载画境细节，真实四卷保持既有作品；没有重新制作章节艺术内容。

## 运行与恢复

在根目录双击 `runStart.cmd`，或 `npm ci` 后 `npm run dev`，打开实际打印的 Local 地址。`npm run build` 输出 `dist/`，通过 HTTP 使用。所有新资源跟随 Vite BASE_URL，可从子目录访问。

继续修改优先读 `src/data/study.ts`（图片与原图热区）、`src/hooks/useStudyJourney.ts`（状态与调度）、两套 study/loading 样式与 `ScrollViewport` / `SceneRenderer`（真实准备门控）。严禁为了调整首页而重建旧 Blender 资产管线。

## Git交付状态

功能提交为 `7ad5a13`。2026-10-21首次push返回403，随后再次执行标准 `git push origin main` 成功，将功能及交接提交 `fe4dcfa` 推到远端；13个LFS对象约19MB全部上传，核实时本地与origin/main为0/0。代码、美术及验收截图已同步。状态更正文档另随提交交付，最终revision以Git为准；未更改全局认证或仓库LFS策略。
