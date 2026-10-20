# 四卷牡丹数字手卷重构交付

2026-10-20，Windows / Blender 5.0 / Chromium；基于 `main@9f632a0` 的本地工作树。第一卷先完成完整样板并向用户展示，再扩展其余三卷。启动冲突、相对资源路径及窗口自适应整改继续保留。本轮未提交、推送或部署。

## 运行成果

在工程根目录双击 `runStart.cmd`，或运行：

```powershell
npm ci
npm run dev
```

打开终端显示的实际地址；开发/预览默认自动选空闲端口，多个工程可并行。启动器按自身位置定位，工程可迁移目录，窗口和画心随可用空间调整。运行网页只需Node/npm及仓库资源，Blender和Python用于资产维护。

```powershell
npm run build
npm run preview
```

构建使用相对base，支持站点子目录。不要直接双击 `dist/index.html`；使用HTTP服务。

## 实际交付

| 项目 | 结果与入口 |
| --- | --- |
| 全量审查 | 779个原网格、263张纹理、40个原阅读节点；216保留 / 35修复 / 12重生成，0待视觉裁决。[审查报告](audit-report.md)、[完整库存](layers-inventory.json)、各卷CSV见下方 |
| 实际新图 | 12项重生成、20项像素修复、2项共享云气/远山，共34项选定生产图。透明安全外扩每侧约原内容12%，最大边2048px，WebP合计14.75MiB。[逐项用途与叙事](asset-delivery.md)、[原图/生产图/哈希](prepared-assets.json) |
| 空间与文字 | 新增152个世界图层：58/26/34/34；8个真实HTML题签/中性装饰印：1/1/4/2。来源PNG、未选迭代原图和派生文件保留在 `artwork/` |
| Blender整理 | 四份可独立重开的派生工程；完整图片与字体打包、八类角色Collection/稳定ID/动态标记，源相机、世界变换、动画、标记和原层级保持。[四卷副本与严格验证](blender-delivery.md) |
| 网页动态 | 71/21/51/45，共188个显式绑定；每次最多6个可见动作、第四卷尾最多3个动作含1瓣。花枝、独立灯彩/绢带、薄雾与落瓣克制轻动，固定人物/建筑/器物不整组漂动。[实际实现与证据](after-motion/implementation.md) |
| 实际逐实例处理 | [931个世界实例实施JSON](layer-implementation.json)、[CSV](layer-implementation.csv)、[188项实际绑定](runtime-bindings.json)。原779实例与新增152实例分开；8个HTML另列，不混入网格计数 |
| 修改、新增与弃用 | [完整文件列表CSV](delivery-files.csv)、[含状态与退役对象的JSON](delivery-files.json)。没有删除原文件；退役的是15个运行实例：7重复辅助片、8低清题签。12原FONT保留导出、网页跳过 |

审校的“修复”是图像问题裁决，具体实施还包括完整UV、边缘过渡、文字替代和退役重复片；不把35张修复纹理都说成35张新生成图。逐实例表同时记录原像素是否保留与几何/动态处理，避免将审校建议等同已实施动作。

原四卷 `public/assets/chapter-N/scene.json` 和原源工程保持；网页从 [修订清单](../../public/assets/reconstruction/manifest.json) 应用独立修订。最终清单SHA-256：`290e865749ec5a27c48c1c6b7f3dda55bcd809e0d9610ab98d791fd5042ef115`。

## 每卷改动

| 卷 | 叙事与关键修复 | 实施 |
| --- | --- | --- |
| 一·神都花事 | 武周神都、寺院入苑、皇家秩序；正文区分历史脉络与后世抗旨传说。补全宫阙/亭柱/阶台、官员袍足和学士案脚，去掉旧题字挖空后的阶梯硬口 | 7换图、9局部墨边、4退役实例、58新世界层、1题签；完整样板证据见[样板验收](pilot-review.md) |
| 二·花入万家 | 保持宫苑、私园、踏青的温润递进；补书案、群像、园路和岸景。将三张重复亭台/人物河片改成一条连续水岸，保留原相机路线 | 13换图、3退役实例、26新世界层、1题签；[连续水岸载体依据](chapter-2-river-layout.json) |
| 三·锦绣花意 | 保留凤穿牡丹、婚嫁与器物纹样；补全宫亭帷幔/桌案、街景右端和镜台衣摆桌腿。两张原PNG完整、旧UV裁坏的层仅修几何；独立单灯与锦带轻动 | 7换图、2几何修复、4题文退役、34新世界层、4文字/印层；[9节点/8过渡视觉验收](visual-acceptance-chapter-3.json) |
| 四·国色倾城 | 补沉香亭、石坪、军马和花地；去掉重复宫城/阶梯辅助片。第5景“繁华落幕”后连续减速、减瓣、疏云，第8/9景转向故国追忆 | 5换图、2局部墨边、4退役实例、34新世界层、2题签；[最终逐景复核](chapter-4-independent-visual-review.md) |

## 截图与动态预览

![四卷前后对照](four-scroll-comparison.jpg)

左右分别为重构前后，使用相同窗口和原阅读节点。完整截图覆盖40节点和36段中间过渡；减少动态以便检查边界，动态效果另由真实间隔帧和录像验证。

| 卷 | 关键节点 | 中间过渡 |
| --- | --- | --- |
| 一 | [15景总览](after/chapter-1-overview.jpg) | [14段过渡](after/chapter-1-transitions-overview.jpg) |
| 二 | [7景总览](after/chapter-2-overview.jpg) | [6段过渡](after/chapter-2-transitions-overview.jpg) |
| 三 | [9景总览](after/chapter-3-overview.jpg) | [8段过渡](after/chapter-3-transitions-overview.jpg) |
| 四 | [最终9景总览](after/chapter-4-overview.jpg) | [最终8段过渡](after/chapter-4-transitions-overview.jpg) |

[第一卷已展示样板录像](pilot-motion/first-scroll-motion.webm)、[第四卷最终盛衰短片](after-motion/final-fourth-motion.webm)、[最终生产页面截图](../screenshots/portable-subpath-1280x720.png)。早期 `fourth-sheng-shuai.webm` 是修改第四卷辅助片前的过程证据，最终预览使用 `final-fourth-motion.webm`。

## 验证

| 检查 | 实际结果 |
| --- | --- |
| `npm run build` | TypeScript与生产构建通过 |
| `npm test` / `npm run validate:assets` | 原四卷路径/几何不变通过；263原纹理0错误0警告 |
| `npm run test:startup` | 外部工作目录、双开发/双预览实例、占用端口回退通过，未终止其他工程服务；[启动整改](../portability-review.md) |
| `npm run test:subpath` | 最终生产资源从多层子目录加载四卷及全部新增层，滚轮/拖拽/键盘/分镜/自动展卷/轻动/全屏/进度/抽屉与焦点通过，0页面错误/0本地404；[报告](../validation-portable-subpath.json) |
| `node scripts/validate-motion.mjs` | 最终29项：实际UV平面/支点、无累积漂移、原动画基底、完整载体/显式四角、异常拒绝和第四卷连续包络；[结果](validation-motion-unit.json) |
| 四卷浏览器与像素验证 | 真实停留有局部变化，关闭/减少动效冻结，8个固定结构ROI无可见变化；4并发，约30次绘制/秒。[全卷实测](after-motion/validation-all-motion-browser.json)、[帧差](after-motion/frame-differences.json) |
| 自适应/生命周期 | 9种启动整改尺寸、6种新控制尺寸、四卷360×800首尾与窄窗resize、后台暂停、偏好保存、失败有限重试、切章释放；[定向复测](after-motion/validation-motion-refresh.json)、[UI](validation-motion-ui.json)、[真实故障](validation-recovery-ui.json) |
| 最终四景与GPU恢复 | 连续水岸两景、第四卷gap5/stop8通过；真实 `WEBGL_lose_context` 恢复保留canvas/进度/时钟/矩阵/材质。修复自适应小数尺寸恢复时视口差1像素的问题。[最终状态](after-motion/validation-motion-corners.json)、[像素容差](after-motion/motion-corners-pixels.json)：15像素仅差1个RGB码值、无像素差>1；不宣称逐位相同 |
| 四卷Blender保存与重开 | 派生工程重新打开后核查原SHA、矩阵、相机采样、marker、动画、层级、图片/字体打包和允许修改几何表，详见[Blender交付](blender-delivery.md) |

浏览器脚本需要测试环境提供Playwright和Chromium，可用 `MDGS_PLAYWRIGHT_MODULE` / `MDGS_TEST_BROWSER` 指定工具；不影响正常 `npm ci` / 启动。测试中的固定参考截图尺寸不限制产品窗口。

## 维护与边界

- [完整源图层库存](layers-inventory.json)与[一卷CSV](chapter-1-layers.csv)、[二卷CSV](chapter-2-layers.csv)、[三卷CSV](chapter-3-layers.csv)、[四卷CSV](chapter-4-layers.csv)保留原名、类型、叙事、问题和裁决。
- `scripts/build-reconstruction.mjs` 从已冻结首卷样板、扩展计划及连续水岸布局生成四卷清单，缺生产资源时先报错。`build-pilot-reconstruction.mjs` 用于样板阶段，不用于覆盖当前四卷。
- `scripts/prepare-reconstruction-assets.py` 仅透明留边/缩放/WebP，原始生成图不改；提示词和迭代选择保留在本目录 `image-prompts*`、`*repair-prompts*`、`prepared-assets.json`。具体路径见资产说明。
- `scripts/reconstruct-blender.py` 和 `validate-reconstructed-blender.py` 负责派生副本/独立重开；命令行与本机配置提供源目录/Blender位置，原文件不保存。
- `scripts/report-reconstruction-status.mjs` 执行实际 `applyArtDirection` 的只读CPU路径对照原资产并输出实施表；`scripts/report-delivery-files.py` 更新本地文件清单，不上传用户 `source/`。

纹理LRU的160MiB是目标，可见图层不会强制卸载；首卷首景估算193.74MiB。DPR上限1.65、按需视锥加载和共享素材仍保留。本机Chromium验证不等于跨显卡、其他浏览器或实体移动设备认证。书法超出原世界锚点视野时隐藏、正文可从抽屉阅读；不会为窄屏移动原相机/原锚点。策划叙事按用户内容实现，未将生成绘画当作历史考据。
