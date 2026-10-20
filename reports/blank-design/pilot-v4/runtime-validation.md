# 第四卷样板运行验收

最终canonical：`c7b593102bd8f43fd7438413b34782b64d00788f4e6d87dd3f69682ba6b81a54`。2026-10-20，本机Windows/Chromium；验证期间清单未变。

## 实际可见性

[逐层像素证据](c7b59310-depth-diagnostic.json) 验证12个新增世界层均已加载、提交真实绘制，并在原生产材质状态产生非零画面像素；未以实例数代替可见性。新层数读取canonical，无固定13层假设。正式运行中，三个窗宽各自的连续扫动也全部提交过这12层。

## 自适应、连续游观与交互

[完整运行报告](validation-runtime.json) 为 `status: passed`：

| 窗口 | 静态截图 | 正向绘制帧 | 反向绘制帧 |
| --- | ---: | ---: | ---: |
| 1920×1080 | 26 | 341 | 413 |
| 960×700 | 10 | 351 | 402 |
| 360×800 | 26 | 397 | 403 |

每窗宽包含全部8个转场中点及首尾；1920与360另包含各段25%和75%点，共62张。每个窗宽均通过真实滚轮、拖拽、键盘、进度Home/End、分镜与下一景、自动展卷/暂停、文化抽屉/Escape/焦点返回、轻动开关与时钟冻结。连续正反各64次原生滚轮输入，沿原路线实际绘制共2307帧；不以跳分镜代替连续游观。0横向溢出、0页面错误、0失败资源。

尾声在三个窗宽均维持速度`.32`、花瓣密度`.08`、云气密度`.22`，预算不超过3个动作、1个花瓣。两份原题字内容和数量逐项与canonical匹配；原C4开场annotation本就关闭，没有为了测试增加题签。实体移动设备及其他浏览器未覆盖。

## 验证中发现并修复的卷尾输入遮挡

360窄窗的卷尾题跋覆盖了画心中央，卡片与`.scene-viewport`是兄弟节点。原卡片命中滚轮后，事件无法进入画心监听器，反向游观停在100%。[修前失败报告](validation-runtime-before-wheel-fix.json) 与 [修前截图](runtime-before-wheel-fix.png) 保留此证据。

`src/styles/reading-panel.css`仅新增题跋文字覆盖层`pointer-events:none`，末尾按钮`pointer-events:auto`；尺寸、位置、内容及渲染均不变。修后明确从题跋标题中央执行拖拽与反向滚轮，返回卷首成功；两按钮可Tab访问并实际点击，重游四卷/再观此卷正常，全屏进入退出及两份题字内容也通过。CSS SHA256：`93165db9f3ce8a35f3d574be75c9062576740376ed5dd2bdd043687b9e6f8772`。

修复只影响命中区域，因此保留已经通过的62张构图截图与1920/960的交互结果，补测360失败路径及按钮/键盘/抽屉/全屏/题字；报告用`resumedFrom`明确分段来源，没有把旧失败当成通过。

## 复测

- `node scripts/diagnose-blank-pilot.mjs --expected-hash=<canonical完整hash> --output=reports/blank-design/pilot-v4`
- `node scripts/validate-blank-pilot-runtime.mjs --expected-hash=<canonical完整hash> --output=reports/blank-design/pilot-v4`

测试工具通过环境提供Playwright与Chromium，专用服务使用空闲端口和`watch:null`，不会因离线产图写入而重启。运行网页不依赖测试工具。本次CSS修复后，`npm run build`、`npm test`及相关`git diff --check`均通过。美术构图验收与Blender保存/重开由相应报告另行证明。
