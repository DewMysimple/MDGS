# 续看画心接力与真实准备门控

后续候选3已在同一冻结生产包完整重跑15+24及原59/37/展示包22；908项输入前后相同，见 [统一候选验收](art-candidate-notes.md)。以下具体开发轮数据继续保留为历史专项记录。

2026-10-23 专项开发记录，**不是全产品最后冻结验收**。原 04:18–04:25 的 59 帧与 37 组保留为历史基线；本轮修改以后须在统一冻结生产包上重新运行，不能换指纹沿用旧通过。

## 已修复行为

每卷 session 进度照常保存。返回前先停止跟随并请求一次真实 GPU 完成帧，复制实际 `sourceViewport` 画心，再冻结到该快照的实际进度。入卷、返卷都使用同章节、同版本、同进度的图像；冷深链没有缓存时，等待真实原画首帧产生快照。非零位置不会用卷首封面替代。

`SceneRenderer.captureArtworkSnapshot()` 只排队请求，不在空闲 WebGL drawing buffer 上截图。实际复制在原生最终合成绘制成功的同一任务内、留白缩图渲染之前执行。原 WebGL `preserveDrawingBuffer=false` 保留；PNG 只含实际相机门，没有 DOM 题字，宽度至多1920，16:9 与7:5 用整数尺寸保持原比例，不放大现有 GPU 画心。没有改变作者素材、相机、材质、时间轴或源像素。

首次修复接线后发现 `.03` 冷重载提前拒绝：纹理 loaded 会使组件 `ready=true`，但这不等于 GPU 首帧完成。现另有 `firstFramePresented`，仅在 preparation 的真实 `ready` 回调后自动请求快照。`.03`、`.65`、`1` 已包含在回归中。

旧 hook 对 cover0 的无条件 decode 也已移除。旧包 `index-BnLCodBQ` 单独注入 cover0 503 时，真实非零 blob 及 `presentationReady=true` 已有，仍在5.5秒后被旧 `artError` 锁住；原始证据为 `unfurl-resume-cover-dependency-before.json/png`。现在相机仍执行450ms，未使用的 cover0 不再参与非零冷入；卷首所需的 cover 则由实际启卷 `Image.decode` 和成功 GPU 绘制门控。进入下一阶段仍同时要求原生资源/首帧就绪、正确可见画心就绪，以及至少4000ms前台展示。页面隐藏不消费这段时间，几何在图片 decode 前也不推进。

GPU 失效、编码失败或 handle 缺失时，返回可以改为暖纸淡出；不会错误展示 cover0，也不会困在 RETURNING_HOME。Blob URL 由缓存所有者和可见启卷消费者分别持有，替换和卸载释放；最后一个引用退出才撤销。重复返回/再入的测试断言同卷最终至多保留1个URL。

## API 与职责

- `ScrollViewport` 提供 `onPresentationHandle({capture})`、`onPresentationSnapshot(snapshot)`、`onPresentationError(message)`；快照成功交给调用者后，调用者拥有初始引用，替换或卸载时调用 `releaseArtworkSnapshot`。
- `ScrollLoadingScene` 接收 `progress/snapshot/returnFallback`，通过 `onPresentationPending/onPresentationReady` 告知真实纸面状态，展示期间自行 retain/release。
- `useStudyJourney` 保留 native ready、四秒前台计时及错误重试；新增 presentation 门控和返回超时降级，没有 App 新增接线要求。
- `NarrativeSpace` 新增可选 `sampledProgress/sampledWidth/sampledHeight`，均在异步读请求发起时捕获。宽高是整个 canvas/scene-viewport 的 CSS 尺寸。
- `ScrollViewport.playbackActive` 默认为 false；Renderer 在自动播放时跳过手动180ms静止等待，保留24进度分桶、单一进行中的异步缩图与既有尺寸上限。它只影响文字留白观察，不改变源画面。

App 接线由主代理负责；本任务没有编辑 App，也没有提交或推送。

## 专项实测

`unfurl-snapshot-validation.json` 的 runId `2026-10-22T21-27-16-597Z`：15组通过、0页面错误。独立生产入口 `index-2GKGu9XT.js`，实际 Chrome156.0.8078.47；GL 为 ANGLE / NVIDIA GeForce RTX5070Ti / D3D11，drawing buffer 不保留。源码独立重建与所测生产字节匹配；运行期间 `NarrativeCalligraphy.tsx` 被另一项正文工作修改，所以 `inputsUnchanged=false`，这是清楚绑定过的专项包证据，不能宣称整站最后冻结已通过。

覆盖四卷非零冷 session、第四卷 `.65/1` 返回再入、`.03` 冷深链、减少动态效果、真实 source 纹理慢4.5秒、未使用 cover0 完全不请求、编码失败后重试、失败返回暖纸降级、资源失败取消、真实 `WEBGL_lose_context` 后返回、Browser Back 后保存并重入。正确画心就绪后的展示观测为4001.2–4009ms。每次记录实际快照进度及帧号、5005顶点真实纸面、最终同位接力与截图；`.65/1` 完整录像位于该 run 目录的 `warm-return-reentry.webm`。

`unfurl-snapshot-pixel-validation.json`：24组通过，对照实际复制的原生 PNG 与同次实体纸面/干净原生画面截图；统一256px、四舍五入裁剪，沿用原启卷 MAE<5、p95<15，最差约2.53/255与10/255。这能发现明显构图、颜色和深度异常，不是逐像素原生保真证明；原生保真仍以59帧严格阈值为准。

`unfurl-cover-timing-validation.json`：cover唯一真实请求延迟6500ms，camera采样500ms、loading内图像准备5281.6ms，首次真实卷面绘出后再展示4007.2ms；闭卷、曲面半展、全开均出现。新驱动将 rAF 名义帧时间与 MutationObserver 实际时间统一为 `performance.now()`，避免把同帧样本误归入就绪前；此前失败 JSON 保留在 `unfurl-cover-timing-history/`。四秒断言仍为>=3998ms，没有降低。

每次快照驱动开始先写 running，失败写 failed；旧结果归入独立 run，截图/录像及生产文件逐项 SHA256 绑定。像素驱动也保留前次 JSON，并绑定浏览器报告、输入截图和自身 SHA256。TypeScript检查已通过。

```text
npx tsc -b
npx vite build --outDir tmp/snapshot-audit-dist
node reports/art-renewal/unfurl-snapshot-validate.cjs
python -X utf8 reports/art-renewal/unfurl-snapshot-pixels.py
node reports/art-renewal/unfurl-cover-timing-validate.cjs
```

`MDGS_SNAPSHOT_DIST` 可指定生产目录；最后冻结验收设 `MDGS_SNAPSHOT_REQUIRE_FREEZE=1`，源码或驱动运行中变化即失败。浏览器和 Playwright 路径继续使用既有环境变量，慢封面单项用 `MDGS_PREVIEW_URL` 指向同一个生产服务器。最终应在同一冻结包重新跑原59帧、原37组及本轮15+24专项，而不是把此次局部结果标成修改后全站通过。
