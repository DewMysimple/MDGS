# 桌面艺术界面验收

2026-10-23。范围为本轮首页、画外拾遗、卷末题跋与观者花笺；声音、作者原画保真及启卷薄纸各有独立证据。本页在最终回归结束时更新结果，不以早期基线代替最终验收。

## 可复现入口

设置 `MDGS_PLAYWRIGHT_MODULE` 为本机 Playwright 模块、`MDGS_TEST_BROWSER` 为 Chromium 可执行文件；依赖也可由普通 `playwright` 安装提供。不向仓库写入本机配置。

```text
npm exec vite -- build --outDir tmp/ui-qa-dist
node scripts/validate-art-renewal-ui.mjs --build-dir tmp/ui-qa-dist
```

正式构建也可直接执行 `node scripts/validate-art-renewal-ui.mjs`，默认检验 `dist/`。`--suite home|reading|keepsake` 支持分批复现。驱动自行启动带 `/exhibition/ui-qa/` 前缀的只读静态 HTTP 服务，加载真正的生产 App，不替换产品组件。完整报告为 `ui-all-validation.json`；分批报告分别为 `ui-home-validation.json`、`ui-reading-validation.json`、`ui-keepsake-validation.json`。每次记录构建 JS、受测源码、四张实际部署首页图片、本地楷体和驱动 SHA256，测试失败也写报告。当前完整口径为 83 组：首页 23、文化阅读 28、题跋/花笺 32；驱动断言所选批次执行完整数量。

## 检查口径

六种 CSS 像素视口为 1280×720、1600×1000、1920×1080、2560×1440、3440×1440、1100×650。当前运行于本机 Windows Chromium 156，驱动实际查询到 ANGLE / NVIDIA GeForce RTX 5070 Ti / Direct3D11，并记录在报告中；不代表其他显卡、其他浏览器或实体显示器体验通过。启动参数 `--enable-unsafe-swiftshader` 仅允许软件 fallback，不能据此声称实际使用 SwiftShader。

- 首页检查四幅实际 HTML 图像的 naturalWidth/Height，标题与牡丹原图分别真实返回 503 后重试；检查六尺寸文字/按钮布局、两类信息弹窗与 Escape 焦点；实际渲染计数核查风物关闭、reduced motion、visibility 信号的静止/恢复；通过真实 `WEBGL_lose_context` 使可选颜料表面失败，确认图像 fallback 可继续入画；返回首页继续绘制并聚焦所选卷。
- 四卷文化面板逐字比较当前 `chapters.ts` 的段落、导语、落款与首卷序言，核对策展来源链接的 href/target/rel，真实方向键切换 tab、Tab 循环、Escape 焦点和“循此入画”的实际原画进度。该比较不冒称重新核对用户原 DOCX。
- 四卷六尺寸检查题跋、花笺对话框和预览边界、默认心意、可滚动内容与退出焦点。实际选择其他心意、钤印、下载，再题恢复编辑；读取下载 PNG 文件头验证 1200×1600，并核查 SHA256、印章红色像素、本地 Kai FontFace 载入、绘字调用及字形栅格不同于缺字框。钤印后的主按钮焦点、再题后的当前心意焦点独立成组。

截图及真实下载文件保存到忽略目录 `tmp/art-renewal-ui/`，可用驱动重现。字形检查能发现空字/缺字框及字体未加载，不能自动给出书法审美评分。视口边界等待有限入场动画结束；native `<dialog>` 的浏览器 chrome 焦点会暂时令 activeElement 为 body，测试允许这一浏览器状态，但不允许焦点落到页面底层交互。

## 诊断历史

- `ui-home-diagnostic-01.json` 保留早期真实标题重试不恢复、1280×720 底栏越界，以及 native dialog 焦点误判造成的级联失败。后者明确不是独立产品问题。
- `ui-reading-diagnostic-01.json` 是早期未等待入场动画与下一帧焦点的驱动时序误判；`ui-reading-diagnostic-02.json` 另注明错误的内层焦点选择器。最终驱动依据 App 的外层 `#scroll-artwork` 舞台 ref 检查。
- `ui-reading-diagnostic-03.json` 是已确认的文化面板焦点逃逸：实际落到外部“跳至画卷”链接。主任务随后修复可见焦点项过滤；冻结构建基线已通过全部四卷六尺寸。
- `ui-all-baseline-01.json` 的 76 项通过和 2 项失败属于冻结基线；两项失败是将 intro 的空白 padding 边界当成实际文字边界，已校准。此基线没有新增的钤印/再题焦点与 12px 元数据断言，不作为最终通过证据。
- `ui-keepsake-diagnostic-01.json` 保留修复前四卷的钤印/再题焦点及 10–11px 小字失败。`ui-all-baseline-02.json` 在字号/首次焦点修复后得到 82/83，通过首页、全部文化阅读、花笺布局/字形/下载与三卷焦点；首卷一次下载焦点竞态仍失败。后续焦点组每卷连续五轮，并等待实际 preview blob 换新，另记录每轮 busy/disabled/active 状态。

## 先前针对回归

花笺最新针对回归 `ui-keepsake-validation.json` 为 32/32 通过、0 页面错误，生产主包 `index-Bji_9a19.js`。包含六尺寸的 24 组布局/12px/退出焦点、4 组真实 PNG 下载/字形、4 组焦点压力检查；后者每卷五轮，共 20 轮 seal/again，全部成功。检查结束时逐一复核所记录源码哈希，无输入变化。TypeScript、独立生产构建、驱动语法及所改脚本差异检查通过。

首页分批 23 项已经通过；全量前次基线 82/83 中唯一钤印焦点失败已由最新针对回归验证修复。主任务正在迭代主叙事呈现；最终 App 冻结后仍应运行完整 83 组，将 `ui-all-validation.json` 绑定最终生产构建。当前不声称全量 83 项已在最终构建通过。本子任务未修改产品源码、共享记忆或 README。

## 统一候选3全量结果

上节描述先前恢复点，不再是最新验收结论。冻结`tmp/art-candidate-3-dist`（`index-C6ZfivTN.js` / `index-Bc7VfaY-.css`）已实际通过完整83/83组、页面错误0。正式文件为[`final-regressions/2026-10-22T22-32-44-628Z/ui/ui-all-validation.json`](final-regressions/2026-10-22T22-32-44-628Z/ui/ui-all-validation.json)，没有覆盖上述旧默认报告或失败历史；报告所列全部UI源码SHA在完成后实际复核一致。

包含首页23、四卷文化阅读28、题跋/花笺32，六尺寸与20次seal/again焦点循环均实际执行，4张1200×1600 PNG真实下载、字形和红印检查通过。另实际打开本次1280×720首页截图及第四卷下载PNG，未发现文字越界、缺字或层级遮挡；此人工图像查看不替代其他浏览器与实体显示器验收。新截图/下载位于`tmp/art-renewal-final/2026-10-22T22-32-44-628Z/ui/`，总索引将记录其SHA。其他五套回归的状态以同目录总JSON为准，不因UI通过提前判定整站全过。
