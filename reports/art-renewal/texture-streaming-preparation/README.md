# C7 原图纹理准备 · 同布局隔离 A/B

用户反馈首卷约85%拖动卡顿后，本次在真实受信任 canvas 鼠标拖动中定位 WebP 首次 GPU 使用的成批同步解码/上传。原始定位见 [前置诊断](../manual-drag-diagnosis/README.md)。本目录保留同 C7 布局的 A/B 小证据与一次无效原型，权威入口为 [summary.json](summary.json)，原字节清单见 [manifest.json](manifest.json)。这是采用前预检；最终 C7 的59帧、实际硬件及返回验收另报。

| 1920×1080 / DPR1 · 同1ms CPU采样与trace | 正拖最长rAF间隔 | 暖回拖最长rAF间隔 | 两窗长任务数 |
| --- | ---: | ---: | ---: |
| A：SHA精确匹配C6的 Renderer / SourceMaterial，其余采用同C7 UI | 111.8ms | 171.6ms | 2 / 2 |
| V1：仅预备共享base纹理，未覆盖字段sampler | 144.3ms | 82.0ms | 2 / 4 |
| V2：解码、实际sampler逐张GPU预备、有界近期保留 | 31.5ms | 36.1ms | 0 / 0 |

每次为真实90步画面鼠标正拖/回拖，实际覆盖约 `.78–.90`，未加速作者时钟。V1首拖未改善，按真实结果保留；它揭示 source image 的 CLIP/REPEAT/MIRROR 节点拥有各自 clone sampler，仅初始化共享base不足以避免首次阴影绘制批量上传。V2没有移除或统一这些原生sampler，而是逐次预备它们后才让资源进入ready状态。两次实验的 A 包744份文件逐字节一致，排除了布局、画心尺寸等差异；除两个实验文件外，其余源码/资源SHA一致。

这几个短窗只能证明本设备此路径改善，不保证其它硬件、全片或物理显示FPS。CPU/trace增加采样开销；表中是页面rAF间隔，不是CDP截图率、GPU完成时间或屏幕呈现FPS。真正的CPUprofile与当次驱动原字节已保存；大trace与完整事件原始JSON保留在ignored tmp，路径、大小、SHA在summary声明。

四卷六个精确同进度的原生画幅A/B比较全部逐像素相同（MAE、p99、最大差、alpha均0），见 [比较](representative-pixel-comparison.json) 与 [捕获元数据](representative-pixel-captures.json)。涵盖首卷 `.785974/.85/.871` 以及其余三卷 `.65`。这不代替完整59帧原作验收。首次像素驱动将六位进度诊断误设1e-7，超时失败原报告和原驱动保留；随后用实际sourceFrame在1e-7内对齐，并未改变像素阈值。

采用逻辑保持原图字节、源字段binary16精度、原颜色空间、flipY、mipmap、相机、光照、后期和时钟。普通图及原材质image字段先等待浏览器decode，随后每rAF最多初始化一个实际GPU sampler；等待上传仍占四个在途槽位，不能提前放行原画ready。临近已离开画面的URL缓存另限96MiB普通资源与24MiB Glare、5秒，当前必需资源不按软预算淘汰。`textureBytes` 是URL纹理负载估算，**不是总GPU显存**，也不包含全部sampler与render target分配。

最终采用源码比V2正常路径包另补一处真实生命周期修复：context恢复后，pending资源在旧GPU已上传的base/sampler前缀也必须重新入队，不能只初始化剩余后缀。生产方法CPU回归实际覆盖该情况。CPU驱动采用显式模块边界、转译真实helper与记录GPU stub调用，旧5项保持并新增解码错误/取消、多sampler就绪、context恢复、owner取消、缓存上限与过期，合计 [10/10通过](cpu-validation-at-adoption.json)。这仍不是原生GPU恢复证明；最终C7硬件增加第17项实际partial-upload context-loss专项。

本目录 adopted-* 为正式采用时三份源码的原字节快照；它们与C7冻结指纹的SHA对应。源/包未因本报告修改，旧C6包始终保留。
