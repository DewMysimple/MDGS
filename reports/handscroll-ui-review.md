# 国色芳华：传统手卷 UI 重构验收

本次依据用户最新概念图（1672×941）重构外部形制，沿用先前桌面端范围。未重新导出、制作或替换任何 Blender 场景，四卷真实相机路线、空间层次与交互控制链继续复用。

## 修改文件

- `src/App.tsx`：接入共用卷轴、织锦、氛围组件，原导航/游观/控制事件保留。
- `src/styles.css`：模块化样式入口。
- `src/styles/exhibition-theme.css`：统一颜色、字体、装裱高度、卷轴宽度和桌面尺寸变量。
- `src/styles/handscroll.css`：宣纸、完整装裱、卷轴光影、同排细进度线、轻量控制与木案边缘。
- `src/styles/reading-panel.css`：从原样式提取文化抽屉和卷末题跋。
- `src/components/ScrollOrnaments.tsx`：四卷共用的 ScrollRoller、BrocadeBorder、ExhibitionAtmosphere。
- `public/ui/brocade.svg`、`roller-band.svg`、`peony-line.svg`、`cloud-line.svg`、`distant-mountains.svg`：代码绘制的重复纹样与低对比背景装饰。
- `src/data/annotations.ts`：四卷题字/短句/介绍、字体字号、世界位置、印章、所属分镜和显示区间配置。
- `src/scene/CalligraphyLayer.ts`、`.css`：真实 HTML 竖排题字，同一相机投影，不拦截指针。
- `src/scene/SceneRenderer.ts`：以独立 HTML 题字层替代旧 Canvas 题字，增加同尺寸 resize/render/dispose 接入。相机更新、网格/纹理加载、原有路径不变。
- `README.md`：运行和配置位置更新。

`ScrollViewport.tsx`、`useScrollController.ts`、`prepareScene.ts`、章节正文以及 `public/assets/chapter-*` 保持原实现与内容。

## 视觉对照

| 项目 | 1440×900 | 1680×945 |
|---|---:|---:|
| 装裱顶部 | 166.5px | 174.81px |
| 装裱整体 | 1386.75×550px | 1617.84×553.77px |
| 画心 | 1386.75×482.34px | 1617.84×474.83px |
| 单条织锦 | 33.83px | 39.47px |
| 卷轴宽 | 38.16px | 44.52px |
| 卷轴含端头范围 | y124.5–758.5 | y132.81–770.58 |
| 控制区高 | 118.8px | 124.73px |

参考图的上装裱约 y175，下装裱至 y725。1680 版本实测为 y174.81–728.58，主体位置与比例接近。导航、朱砂选中状态、圆柱卷轴、青金缠枝织锦、宣纸与木案边缘均用真实前端元素实现。画心按真实尺寸更新 Three.js 宽高比，没有 CSS 拉伸或固定视频比例；画心裁切只来自原相机可视窗口，不重排原作。

保留的视觉差异：画卷内容使用用户现有 Blender 原作，因此人物/建筑与概念图不同；案台采用简化木纹与投影，没有复刻概念图前景器物照片；织锦采用可替换 SVG 重复纹样。第二、三卷在原留白区显示竖排题字，一、四卷保留原画与图内文字，不另叠大面板遮挡人物。中性“牡丹”印章为数字展陈装饰，素材替换入口在 annotations.ts，未冒充历史印文。

## 浏览器与工程验证

| 操作 | 结果 |
|---|---|
| 鼠标滚轮 | 第二卷进度由0推进至约14.4%，画面和节点联动 |
| 自动展卷 | 进度继续推进、按钮显示暂停展卷 |
| 拖拽接管 | 进度推进至约23.6%，自动展卷状态立即关闭 |
| 分镜节点 | 点击宫苑雅宴到第五景约65% |
| 上一景/下一景 | 第五景与第六景约79.4%之间可往返 |
| 进度键盘 End | 到达100%，显示真实卷末与再观/下一卷入口 |
| 卷末切换 | 展开下一卷进入第三卷，无整页刷新 |
| 四卷导航 | 四卷分别加载真实场景和15/7/9/9个分镜 |
| 章节进度恢复 | 从第三卷返回第二卷仍为100% |
| 题字层 | 二、三卷首屏真实 HTML；72px配置投影后标题约40px；竖排、自右向左列序；推进后随世界位置移出并淡出 |
| 音效 | 用户点击开/关，显示听音中/听音，无报错 |
| 画外拾遗 | 对应章节正文正常，Escape关闭 |
| 全屏 | 点击进入后显示退出全屏，点击退出后恢复进入全屏 |
| 图层命中 | 织锦、卷轴、背景与题字均不拦截画心滚轮和拖拽 |
| 控制台 | 最终检查无error/warn |
| 资源校验 | 四卷263张纹理均有效，0错误0警告 |
| 路径测试 | `npm test` 四卷连续路线通过，原几何未修改 |
| 生产构建 | `npm run build` TypeScript与Vite通过 |

尺寸及交互原始记录：`validation-handscroll-ui.json`。此前 `viewport-layout.md` 记录的是上一版近满屏窗口布局，本次装裱式概念图为当前视觉基准。

## 运行和截图

开发服务器：http://localhost:5173/ 。命令 `npm run dev`；生产构建 `npm run build`。

- `screenshots/handscroll-1440x900.png`（已读取PNG实际像素1440×900）
- `screenshots/handscroll-1680x945.png`（实际像素1680×945）
- `screenshots/handscroll-chapter-2.png`
- `screenshots/handscroll-chapter-3.png`
- `screenshots/handscroll-chapter-4.png`

此阶段完成两种桌面尺寸验收，沿用用户先前不开发移动端的约束。
