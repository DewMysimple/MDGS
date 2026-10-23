# 首屏资源与部署体积审计

2026-10-23，只读审计，未改产品源码、未新增库、未删除或重新编码资产。核心作者图像不得缩放、重压缩、裁切、改色或替换。另将当前 243 张原画纹理逐一与 `fidelity-final-freeze.json` 输入哈希比较：**243/243 字节一致**。这里核对的是文件保存状态，原生像素保真仍以独立 RGBA/59 帧验收为准。

原始证据：[performance-budget.json](performance-budget.json)，含所有导航阶段、PerformanceResourceTiming、CDP 响应记录、实际 WebGL renderer、首帧纹理指标、部署目录清单及派生汇总。受测生产主包为 `index-Df8-tEFX.js`，其 SHA256 与 HTML/相关源码绑定均在报告中。根目录 `dist` 另外做了体积快照；真实浏览器使用独立的 `tmp/performance-audit-dist`，避免并行构建改动被测文件。

## 实测边界

本机 Windows、Chromium 156、ANGLE / NVIDIA RTX 5070 Ti / D3D11，1600×1000 CSS px、DPR=1。Vite 生产预览、127.0.0.1 回环、没有网络/CPU 限速。每个入口测一次冷 HTTP 缓存、同上下文正常热重载；另测一次首页可选 GL 初始化不可用的对照，共 11 次导航。没有清空操作系统文件缓存或显卡驱动缓存；不是公网、低性能电脑或 p95 基准。

“冷”由全新浏览器上下文加 CDP 清 HTTP 缓存定义；“热”仍允许服务器验证缓存，不伪造 `immutable`。实际预览头为 `Cache-Control: no-cache`。HTTP 缓存可以保留实体并向服务器重新验证；不能将 `no-cache` 理解为不保存实体。[Cache-Control 定义](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)

## 首次可用与实际传输

首页入口启用指真实按钮 enabled、资源遮罩已移除；另报主要入场元素 opacity≥.95 的时刻。画卷首帧指原生 canvas 的 `firstFrameReady`，可交互则是实际 `SCROLL_VIEWER`。均从导航起算，采样约一帧精度，不采用泛化的 Lighthouse TTI 命名。

| 入口 | 冷缓存入口/画卷可交互 | 热重载入口/画卷可交互 | 冷缓存原生首帧 | 冷缓存实际 HTTP 事件 | 冷响应总字节，含头与文档 |
| --- | ---: | ---: | ---: | ---: | ---: |
| HOME | 0.392s | 0.136s | — | 16 | 6.226MB |
| 第一卷直达 | 7.564s | 5.716s | 2.647s | 26 | 22.482MB |
| 第二卷直达 | 6.164s | 5.854s | 1.236s | 22 | 19.224MB |
| 第三卷直达 | 8.597s | 5.957s | 3.920s | 28 | 27.462MB |
| 第四卷直达 | 6.082s | 5.779s | 1.149s | 21 | 20.256MB |

首页主要入场呈现冷/热为 1.820s / 1.558s。四幅图层实际解码尺寸分别为 1672×941、1536×1024、1536×1024、2172×724；冷缓存约 0.081s 已取得这四幅实际图像。首页存在一次 235ms 长任务，具体函数归因没有做 Timeline 剖析，不直接归因给某段代码。

画卷交互时间包含创作规定的至少四秒前台启卷。实际四卷 `SCROLL_LOADING→PAINTING_REVEAL` 均约 4.00s；后面还存在原画同位接力阶段。不能将 6–8.6 秒全部当成传输耗时，也不建议为了数字好看移除这段艺术表达。第三卷本机冷启动长任务最大 1147ms、总计约 3586ms，值得后续单独定位解析/准备/编译阶段；这组数据不能证明某一函数占用的具体比例。

热重载的 CDP 实际响应字节为：首页 2292B，第一至四卷分别 4186B、3522B、4544B、3135B，存在 304 或缓存复用，不是零请求。本机 Chromium 有 `deliveryType=cache` 但 `transferSize=300` 的记录，因此不能只用 `transferSize===0` 判断本次所有缓存命中。报告同时保留原始字段、实际 304 数和 CDP 接收字节；重复实体的 `encodedBodySize` 不相加当成下载量。[Resource Timing](https://www.w3.org/TR/resource-timing/)、[transferSize](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/transferSize)、[CDP loadingFinished](https://chromedevtools.github.io/devtools-protocol/tot/Network/#event-loadingFinished)

## 请求是否必要、是否共享

首次 HOME 请求四张首页画层、当前 CSS/JS/本地字体、四卷封面。四张卡片都在桌面视口内，`loading=lazy` 不会使它们免于加载；四封面实体共 4,181,406B，约占这次冷首页响应字节的 67%。首页未请求四卷 `scene.json`、画卷纹理、旧书房图片或音频。字体与 Three.js 模块的预加载仍在，都是当前入口实际使用的资源。

首页牡丹同一 URL 有三条计时/请求事件：HTML 图像、预解码与 Three.js 纹理使用同一实体。本次只有一次完整 522,226B 图像响应，后两次总共约 306B 小响应；其余首页画层均只有一次完整实体。四卷封面在 HOME 各一份完整响应。当前共享有效，没有发现将同一幅牡丹完整下载三遍的情况；不能只数 URL 出现次数下结论。

直达 `#chapter-4` 没有挂载完整首页：只请求第四卷 `scene.json`、该卷首帧所需纹理/字段、该卷 cover 与启卷用远山背景，以及共用程序/字体/纹饰；没有下载第一至三卷封面、其他首页花枝/题字、旧书房或音频。预加载、实体卷与同位接力使用的第四卷 cover 仅一次完整实体响应。所有四卷直达均只出现自己那一卷的封面和远山背景。`index.html` 已没有旧书房两张图的 preload；该行为在实际导航记录中吻合。

## 首页可选 GL 与首帧纹理预算

首页默认一条可选颜料 WebGL 上下文。实际 canvas 为 816×650，RGBA 单颜色面估算 2,121,600B，MSAA samples=4；这不包括深度、抗锯齿内部面和浏览器合成。四幅首页图像的单份 RGBA 解码估算合计 25,166,432B；包含四张可见封面、按 URL 去重后的首页 DOM 图像估算合计 40,905,312B。牡丹另上传为 GL 纹理，RGBA 加完整 mip 链的数学估算约 8MiB。这些是尺寸估算，不能冒充浏览器实测 VRAM 总量。

模拟 GL 初始化不可用时，首页静态图可用、活动 GL 上下文为零，但仍加载同一 Three.js chunk（磁盘 481,608B，冷 HTTP gzip 实体 121,435B）。因此“关闭可选 GL”目前不等于不下载 Three.js。对照入口启用约 0.152s、主要呈现 1.575s；该对照位于测量序列末尾，不能把与首轮的时间差当作严格因果收益。

| 卷 | 原生首帧已就绪纹理数 | SceneRenderer 首帧纹理预算估算 |
| --- | ---: | ---: |
| 一 | 14 | 94,964,356B / 90.565MiB |
| 二 | 10 | 80,941,957B / 77.192MiB |
| 三 | 16 | 119,609,559B / 114.069MiB |
| 四 | 9 | 54,291,784B / 51.777MiB |

`textureBytes` 对 DataTexture 采用 typed-array 字节数，对普通纹理采用宽×高×4×1.333 的 mip 预算；它既不是网络文件大小，也不含后处理 render target、深度缓冲、浏览器解码副本或 shader program。上表仅为 p=0 首帧，并非整卷全程峰值。原作后续画面仍需其余流式资源，不能将本次首帧未下载的文件判为无用。

## 部署目录

单位 MB=1,000,000B，MiB=1,048,576B。隔离生产目录共有 744 文件、795,178,251B；同刻根目录 dist 为 795,178,254B，主程序构建命名不同，不视为完全同一构建。

| 分组 | 文件数 | 目录字节 |
| --- | ---: | ---: |
| 当前四卷 `assets/new-scrolls/` | 330 | 533.089MB |
| 保留的早期 `assets/chapter-*`、blank-design、reconstruction | 327 | 172.588MB |
| 其他历史 `ui/study*` 及共用 UI | 64 | 80.722MB |
| 当前首页 atlas，含 provenance | 5 | 1.486MB |
| audio，含保留的用户旧 MP3 | 9 | 5.930MB |
| 当前编译 JS/CSS | 4 | 1.114MB |
| 本地字体与许可 | 3 | 0.248MB |

旧 UI 中 study / faithful / layered / projection / volume 分别约 16.140 / 22.921 / 14.753 / 7.081 / 19.815MB。表中“其他 UI”还含 10,996B 共用纹饰/根文件，不能整组误判为历史废物。历史 assets 加整个其他 UI 共约 253.31MB，但这不是可直接删除清单。目录体积也不能当成首屏下载量：本次 HOME 仅约 6.226MB。

## 可采用的后续方向

1. 保持作者图像、cover、源几何/材质/相机轨与程序场原字节；243 张纹理已与冻结输入核对。不要以降低分辨率、重编码或替换源图来换性能。
2. 部署采用经完整四卷/节点验收的文件清单，将旧版对照资产留在仓库/创作归档，避免 Vite 默认复制所有历史 public 内容。必须保留当前全卷后段资源、共用纹饰、字体许可、来源元数据与失败恢复所需文件；只做构建输出选择，不删除作者旧素材。本轮未实施清理。
3. 对已有 hash 的 JS/CSS 配置正确长期缓存；固定名首页图、cover 和 scene 更新时先建立明确版本 URL 或验证策略。不能对固定 URL 一律设永久 immutable。常规文本可保持 HTTP gzip/Brotli 原字节解码；二进制 `.f16.gz` 按现有 magic-byte 解码合同配置，不重写程序场数据。当前预览的 JS/CSS 已实测 gzip，这不证明未来托管服务也已配置。[缓存配置依据](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)
4. 保留当前四卡与完整图的艺术预算；如要进一步减首屏传输，先决定非当前卡片与所选卷的预取时机。不要未经约定把核心 cover/纹理改成低清版本。当前小额重复验证不是优先瓶颈。
5. 优先为第三卷冷启动长任务做函数级 profile，再决定是否延后可选 GL、拆分加载或异步准备。任何延迟都须保留已验证静图 fallback、连续入画接力、资源重试/取消与同一声音时钟；变更后重新绑定首屏与原画回归。此次只给建议，不修改这些机制。

本机审计驱动保存在忽略目录 `tmp/performance-budget-audit.mjs`，派生汇总为 `tmp/performance-budget-summary.mjs`；报告包含驱动哈希和原始数据。此审计不部署网站、不作跨设备速度保证，也不替代最终 83 项界面验收。
