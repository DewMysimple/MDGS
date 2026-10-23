# 启卷与入画接力 · 实作验收

后续统一候选3已完整重跑通过；有效入口和部分卷取消旧版反例见 [统一候选验收](art-candidate-notes.md)。本页下文仍保留04:18–04:25历史基线，不把旧报告冒充新源码通过。

后续续看快照、四秒可见门控及 API 变更另见 [续看修复专项](unfurl-resume-notes.md)。下文保留原37组阶段基线，不代表后续源码通过。

当前记录为 04:18–04:25 **阶段基线**。主任务随后继续产品精修，因此本页通过结果只适用于明确的冻结输入，不代表后续修改已验收。完整原始证据已保存至 `fidelity-baseline-2026-10-23/`，路径与 SHA256 由 `archive-map.json` 对照；等待下一次产品冻结后重跑。

主验收完成：2026-10-23 03:58（Asia/Shanghai），其后补充慢封面实测。本轮仅制作启卷舞台、薄纸几何、原画同位接力及其验证材料；没有修改作者的画卷图片、场景清单、画中镜头、字幕或 `useStudyJourney` 的资源/首帧/四秒前台门控。

最终生产补验在 2026-10-23 04:24 完成：`unfurl-acceptance.json` 的 runId 为 `2026-10-22T20-21-16-846Z`，状态 `passed`，37 组齐全、102 项源码/驱动/相关资产输入前后相同。同一冻结生产包还完成 59/59 原生参考帧；`fidelity-final-freeze.json` 记录整轮 828 项 src/public/配置输入前后不变并绑定两套报告。实际 Chrome 156.0.8078.47，四秒阶段观测 4001.5–4008ms，同位交接最大误差 0 CSS px。后续产品修改会使“当前源码”绑定失效，应保留此轮历史并重新验收。

证据审查补充：上面时间指第一轮局部验收。最初五文件指纹为事后记录，不能单凭它证明更早的几何/像素测试使用了哪个字节版本；早期单项驱动也没有统一失败归档。现新增 `unfurl-acceptance.cjs`：从当前源码独立重建核对生产包，核验同一预览服务器的实际 HTTP 字节，记录运行前后源码/驱动哈希、每个子进程退出码与报告新鲜度、最终截图/录像哈希。只有 `unfurl-acceptance.json` 状态为 `passed`、37 组齐全且输入前后相同，才是最后有效入口。旧记录先复制进 `unfurl-history/<runId>/previous-*` 并明确为历史局部证据；失败运行的当时截图/录像及日志另外完整保留。不得给历史报告补造运行时来源。

## 交付行为

- 三卷原画以 16:9、第四卷以原生 1.4 画幅进入舞台；画心与绢边分开建模，不把原画拉伸进统一 16:9 外框。
- 纸厚为纸高的 0.0012，芯半径为纸高的 0.022，层间距为厚度的 1.2 倍。卷曲采用具有层间距离的阿基米德螺旋；正面、纸背和原画均沿同一曲面更新，轴杆随已卷长度真实转动。去掉装饰山体、粒状花瓣、旧书房底图与粗厚卷环。
- 舞台只呈现暖绢、细纤维纸面、木芯、少量哑金与玉色轴端。背景引用本轮首页 `atlasArt.landscape`，并降低对比度；原画使用不受灯光染色的材质保留颜色。
- 正常入画在既有 250ms + 400ms 阶段内完成：前 100ms 收正视角，100–440ms 将原画矩形移至真实画中画幅，440–650ms 在同位淡去。目标从 `.painting .scene-viewport canvas[data-source-viewport]` 的实际 CSS 像素相机门读取，每帧重算，包含窗口 resize。画卷原场景没有被缩放或 seek。
- 返回时反向将原生画心接到实体卷，再真实收卷；中途取消从当前展开度闭合，不先跳到全开。原生画幅背后增加暖纸遮罩，避免缩回时出现双重画面。
- 报错保留“重新展卷”和“返回序厅”，失败按钮自动获得焦点。慢纹理阶段保持全开纸面等待实际资源。全开等待限 12fps，其余启卷阶段限 60fps；页面隐藏不累计动画时间。

`ScrollLoadingScene` 的公开 props 无变化。新增 `scrollHandoff.ts` 仅提供画幅读取/插值与阶段编排；`ScrollUnfurlScene` 的可选 `onFrame` 仅用于接力和诊断，不改变资源准备门控。

## 实际验证

| 验证材料 | 结果 | 覆盖 |
|---|---:|---|
| `unfurl-validation.json` | 23 项通过 | 四卷 × 1280×720、1920×1080、2560×1440、3440×1440；第 1/4 卷 reduced motion；展开中 resize；封面 503 重试；真实 WebGL context loss 重试；慢纹理等待及取消；几何正面/斜侧/背面检查 |
| `unfurl-lifecycle-validation.json` | 3 项通过 | p≈0.20 中途取消；实际画中返回；向实际 WebGL2 shader 注入编译错误并重试，随后进入原生画面并释放启卷 canvas |
| `unfurl-cover-timing-validation.json` | 1 项通过 | cover 唯一真实网络请求延迟 6500ms，记录实际 Image.decode / 阶段 / 几何时序；最终生产相机阶段等待约 6428ms，再进入完整四秒展卷 |
| `unfurl-geometry-validation.json` | 2 组通过 | 两种原生画幅、10 个展开度的有限顶点/法线、卷层间隔、切线连续、全开平面终点 |
| `unfurl-pixel-validation.json` | 8 组通过 | 四卷的实际启卷画心截图与原生首帧分别对照当前 cover，统一 256px 后 RGB 平均绝对差约 0.21–2.57 / 255 |

四秒前台阶段实测均满足 >= 3998ms 的容差；正常交接到达目标的样本矩形误差为 0 CSS px。每张纸有 5005 个真实顶点；两种画幅的相邻卷层最小印面/背面距离分别为 0.000922 与 0.001132 场景单位，未出现内层交叉。CPU 连续性测量是数值证据；另有 15 张真实 Three.js 正面、斜侧与背面截图检查可见性，不能把数值检查当成光栅渲染证明。

慢封面的实际路由记录表明：封面只有一次网络请求，现有预加载、启卷场景与 DOM 图像共享该图像请求/解码；`cameraBlocked` 在进入实体启卷阶段前等待完成。故意延迟 6500ms 后，最终生产 `SCROLL_LOADING` 仍单独显示约 4005.5ms，并保留闭卷、中间曲率、全开三个真实几何阶段。没有增加第二轮四秒等待。此处以实测更正“慢封面可能越过展卷”的初步静态推测。

手工审图发现第四卷曾因 0.1–120 的过宽深度范围，出现画心与薄纸的环状深度竞争。最终将相机 near/far 限为实际距离的 1/8 与 3 倍；重跑四卷并检查截图后，原画干净、纸背不透印、斜侧卷层没有深度花纹。像素对照用于发现构图/颜色/深度异常，不能证明逐像素相同。

四卷实际录屏为 `unfurl-c1-1920.webm` 至 `unfurl-c4-1920.webm`（1920×1080 浏览器视口，录像缩录为 1280×720）。`unfurl-c4-handoff-contact.png` 以 4fps 排出第四卷完整启卷到首帧，末尾黑格是录像长度不足整张 contact sheet 的空位。各卷另保留闭卷、半展、全开与原生首帧截图。

## 复现

最初局部运行的应用地址为 `http://127.0.0.1:5276/`；最终生产 wrapper 自行启动独立 Vite preview。验证使用真实桌面 Chrome，启动参数允许 SwiftShader fallback，但历史 run 未记录实际 GL renderer，不能据此声称使用了软件渲染。测试不需要把浏览器或 Playwright 安装进本仓库；通过环境变量 `MDGS_PLAYWRIGHT_MODULE` 指向现有 Playwright 模块、`MDGS_TEST_BROWSER` 指向可执行浏览器，`MDGS_PREVIEW_URL` 可覆盖单项站点地址；未设置模块路径时使用普通 `require('playwright')`。不把开发机器绝对路径写进驱动。

```text
npx tsc -b
node reports/art-renewal/unfurl-acceptance.cjs
node reports/art-renewal/unfurl-validate.cjs
node reports/art-renewal/unfurl-lifecycle-validate.cjs
node reports/art-renewal/unfurl-cover-timing-validate.cjs
node reports/art-renewal/unfurl-geometry-validate.cjs
node reports/art-renewal/unfurl-pixel-capture.cjs
python reports/art-renewal/unfurl-pixel-validate.py
```

总验收默认读取 `dist`；本轮通过 `MDGS_UNFURL_DIST=tmp/fidelity-art-dist` 指定冻结生产包，并自行启动绑定过的 Vite preview，避免连错开发服务器。其余单项命令适合诊断；最终有效入口是总验收报告。总验收还使用 FFmpeg 从新录屏生成 contact，可用 `MDGS_FFMPEG` 指定工具路径。

初轮 `tsc`、23 项浏览器检查与 3 项生命周期检查在当时舞台代码上重跑；几何和像素测量早于主验收，其后仅帧率/返回遮罩变化的说法属于当时开发记录，不能代替逐次输入哈希。完整 wrapper 会重跑全部37组，并把 `unfurl-source-fingerprints.json` 绑定到明确的 `bindingRunId`。最终以该运行记录核对五个实现文件，不把事后指纹当历史运行证明。

## 实际边界

- 仅验收当时桌面 Chrome 上下文；没有记录历史 GL backend，也没有跨 Firefox、Safari、移动端或其他显卡验收。
- 慢封面保持在相机准备阶段等待，慢纹理则先显示完整卷面并继续等待；两者均保留既有真实资源和至少四秒前台门控。
- 生产构建及整站跨模块回归由主任务合并验证；本交付没有创建提交或推送。
