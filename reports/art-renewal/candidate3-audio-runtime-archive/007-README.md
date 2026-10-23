# 当前桌面运行验收

入口为 `scripts/validate-peony2-runtime.mjs`；设置/子路径兼容入口为 `scripts/validate-peony2-regressions.mjs`。四份 `validate-peony2-*-driver.mjs` 是已落盘、可审查的直接浏览器驱动，运行时不再改写历史源码或生成字符串 adapter。旧报告、失败与 partial 均未覆盖。

## 范围迁移

| 历史检查 | 当前检查 | 保留边界 |
|---|---|---|
| 旧作品身份、隐藏图层、替换画面 | `peony-2.0-2026-10-23`、原生材质就绪、零替换/新增画中文字/错误显隐 | 实际 GPU 像素保真由独立 fidelity 验收负责 |
| 两种布局的全部节点/25段正文 | 1672×941 与电脑 compact1280×720，显式 `settings.narrativeMode='original'` | 与已验收 `narrative-source.json` 转录逐字比对；未重新读取工作区不存在的原 DOCX |
| 手机与画面上方工具栏 | 桌面 compact；header→painting→controls 不重叠 | 本轮用户明确只验电脑；手机范围退休 |
| 附加环境运动/旧轻动开关 | 零附加图层、无该开关、真实源 FPS 与暂停后精确停帧 | 不移除原作时间线动画 |
| 旧3D书房 `__MDGS_STUDY__` | `__MDGS_ATLAS__` 四画层解码、pointer 视差空闲停帧、可选湿色 surface、off/reduced/hidden/返回生命周期 | 没有重造旧 room renderer 指标；可选 GL 故障与画材失败重试由 UI 驱动另验 |
| 首尾题跋、印章、楷体、输入 | 终帧/renderCount 停止、印章边界、本地楷体与真实滚轮/拖拽/键盘/进度/自动展卷 | 默认诗意模式有独立新验收，不能与原作模式混计 |
| 原声音控件 | 一条共享三轨原创数字声景，真实解码/输出增益/后台暂停/淡出释放/单轨失败重试/返回连续时钟 | 不把合成声音称真人演奏；不重复623.8秒同步测量 |
| 四入口与加载异常 | 四个真实新首页入口、物理卷面、最低展示时间、迟到纹理、cover 失败重试、取消旧 manifest | 当前启卷画面使用原生世界快照；不再强断言其纹理一定是 `cover.webp`，cover 的实际资源检查仍保留 |
| 设置与子路径 | 真实默认诗意→UI选原作、四卷独立参数、底板/持久化/错误存储/GL恢复/焦点；全部实际嵌套资源与全屏 | 完整模式保留原有有意义断言；预跑明确列出未跑项 |

## 复现

先设置已有浏览器依赖 `MDGS_PLAYWRIGHT_MODULE`、`MDGS_TEST_BROWSER`，不安装新库。按需独立构建，避免改动其他任务的 dist：

```text
npm exec vite -- build --outDir tmp/runtime-preflight-dist
node --check scripts/validate-peony2-runtime.mjs
node --check scripts/validate-peony2-regressions.mjs
node --check scripts/validate-peony2-original-driver.mjs
node --check scripts/validate-peony2-journey-driver.mjs
node --check scripts/validate-peony2-settings-driver.mjs
node --check scripts/validate-peony2-subpath-driver.mjs
node scripts/validate-peony2-runtime.mjs --preflight --build-dir tmp/runtime-preflight-dist
node scripts/validate-peony2-runtime.mjs --journey --preflight --build-dir tmp/runtime-preflight-dist
node scripts/validate-peony2-regressions.mjs --settings --preflight --build-dir tmp/runtime-preflight-dist
node scripts/validate-peony2-regressions.mjs --subpath --preflight --build-dir tmp/runtime-preflight-dist
```

完整验收在最终冻结的生产构建上串行运行上述最后四条并移除 `--preflight`。`--check-adapter` 兼容参数只展示语法/迁移计划，不启动浏览器，不代表通过浏览器验收。

每次运行创建时间独立目录，`acceptance.json` 记录执行 driver/生产 JS/CSS/HTML、全部 src、四卷 scene/material/render/cover 的前后 SHA256；driver 复本、报告与截图另绑定 SHA256。实际 HTTP HTML 必须与指定 build 相同，32份 source/production 资源也必须字节匹配。完整运行期间输入变化会标为 `invalidated-source-changed`。这些绑定不替代完整核心图像哈希与原生像素回归，也不能从单次本机数据推断通用性能。

最新入口分别为 `runtime-preflight.json`、`journey-preflight.json`、`settings-preflight.json`、`subpath-preflight.json`。只有完整运行才写 `*-latest.json`；没有这些完整通过记录时不得宣称四卷全部通过。

## 早期预跑与诊断记录

2026-10-23本机 Chromium156.0.8078.4，独立构建 `index-D3GjHpG-.js`：runtime 10组、journey 2组、settings 7组、subpath 1个综合检查先后通过。runtime 预跑只有第1卷每尺寸3/15节点与3/14实际正文段，另保留完整第1卷字符比对；不代表其余段或其他三卷通过。settings 预跑为4个桌面尺寸，子路径预跑只验第1卷资源。

前后源码稳定的早期通过记录分别为 `2026-10-22T21-05-17-723Z-runtime-preflight`、`2026-10-22T21-06-20-983Z-journey-preflight`、`2026-10-22T21-07-52-452Z-settings-preflight`、`2026-10-22T21-08-27-450Z-subpath-preflight`。后续 driver 添加了来源/截图记录和更完整的可见 viewer 字体范围，仍需最终冻结后的完整运行。`2026-10-22T21-09-35-981Z-runtime-preflight` 同样10组检查通过，但检测到其他并行任务修改 `src/styles/peony-atlas.css`，因此 `sourceStable=false`，仅是预跑，不是最终绑定证据。

保留两份最初失败：`2026-10-22T21-02-34-899Z-runtime-preflight` 在 Home 键后仅等500ms即要求精确归零，平滑跟随尚余0.00007588；已改为等待实际归零再检查。`2026-10-22T21-05-01-562Z-journey-preflight` 在 pointer 视差900ms时即要求空闲，未等320ms跟随衰减结束；已改在实际收敛后观察停帧。这两次是新增 harness 等待不足，未据此修改产品。

四类完整模式与首页/文化/花笺83组统一 UI 仍须按主任务最终冻结通知运行；这里只记录适配与预跑。核心原图、源保真资产和作者素材均未修改，不可为性能预算而缩放或压缩。

## 统一候选3完整通过

上述为当时准备状态。冻结`tmp/art-candidate-3-dist`（`index-C6ZfivTN.js`）现已真实完成四类完整模式：runtime34组/80节点/118排版段，journey9组，settings18组/191帧，subpath1个综合用例遍历全部四卷。每个wrapper的`preflight=false`、`sourceStable=true`、退出码0；全部源码/包/驱动在串行总链前后稳定。原作回归显式使用original，设置另实际确认默认poetic；没有把两种模式混计。

正式结果保存在[`../final-regressions/2026-10-22T22-32-44-628Z/legacy/`](../final-regressions/2026-10-22T22-32-44-628Z/legacy/)，各模式有自己的独立latest指针、时间目录、`acceptance.json`、实际driver快照和图片SHA。旧`runtime/*-latest.json`及预跑/失败原档未被覆盖；最终当前入口统一为[`../final-regression-latest.json`](../final-regression-latest.json)及[完整说明](../final-regression-notes.md)。同包83UI和15声音也通过，177份实际报告/日志/归档/图片在结束后字节复核无差异。

旅程的封面异常路径仍在同一文档四卷都已访问之后执行：0进度明确采用作者cover，记录到真实cover503才断言重试；非零native快照续卷由独立专项负责。late-manifest等待有30秒真实请求上界，防止未观察到请求时无限挂起。没有在此次运行中修改产品或放宽原画、正文、输入、声音与异常断言。
