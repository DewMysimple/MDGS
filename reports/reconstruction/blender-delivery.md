# Blender 重构副本交付

四卷副本均已实际保存，并在独立 Blender 进程中重新打开验证。原四个 `.blend` 从未覆盖，前后 SHA-256 保持一致。以下路径均相对工程根目录，可随工程整体搬迁。

## 副本与固定输入清单

| 卷 | 副本 | 字节 | SHA-256 |
| --- | --- | ---: | --- |
| 1 | `artwork/blender-reconstructed/chapter-1_reconstructed.blend` | 252226020 | `40a9a4317a94b091b88b6f53b23de85ee89649a8cf1a980e9dca84f7f3143c8d` |
| 2 | `artwork/blender-reconstructed/chapter-2_reconstructed.blend` | 121975489 | `4e916bb35aac9f618f1caceb77cd166be71b099f458967949013d3155dda1651` |
| 3 | `artwork/blender-reconstructed/chapter-3_reconstructed.blend` | 167053219 | `f9cdca20b8458edf8cc5fcab9c88e337e6444e2a095b82a93658094c943da221` |
| 4 | `artwork/blender-reconstructed/chapter-4_reconstructed.blend` | 122956443 | `a75acb715206ae58e4aa20215a2d6d066e2b3f91317d64a6fddf052cae35af19` |

| 卷 | 归档清单 | 清单 SHA-256 |
| --- | --- | --- |
| 1 | `reports/reconstruction/pilot/manifest.json` | `ab931d7dc1eaa0e9d8a6f6c60971db729ed50589d80f51dffc845dc1c48a4bd6` |
| 2 | `reports/reconstruction/after/chapter-2-manifest.json` | `c8f4080f88e5a8e7b54d8e57803a54cfd92a0271b1da7b10038b3799910c0920` |
| 3 | `reports/reconstruction/after/chapter-3-manifest.json` | `e0272103e1e5931ac8aa5a6abf537cf9c275999acb7b69b1cee9cf518a352887` |
| 4 | `reports/reconstruction/after/chapter-4-manifest.json` | `aa659d1777a65431c022c1054509b3ef460621ed0adf8d5ad4627eba3109fcc5` |

首卷沿用已展示样板的固定清单；第二至四卷分别归档仅含本卷的快照，并保留 `parentCanonicalSha` 与阶段。独立验证按各卷快照及资源哈希进行，后续其他卷改动不会使已保存证据失效。

## 保留的原结构

四卷保留全部原对象、原父子关系、原 Collection 嵌套树及成员链接；另建八类角色 Collection，链接相同对象。角色为主体叙事、前景遮挡、中景承接、后景连续、留白、连接过渡、动效、装饰。所有对象记录 `stable_id`、`original_name`、`narrative`、`treatment`、`motion_role`。

所有原对象世界矩阵保持；原相机投影参数和 marker/首尾采样帧求值矩阵、原动画对象求值矩阵、动作归属、时间轴范围、fps、相机 marker 均校验一致。没有修改原相机节点或新增主体动画。新增微动层在 Blender 记录动态角色，网页按角色执行持续轻动；这些网页运动没有额外烘焙为 Blender 关键帧。

| 卷 | 原/现对象 | 原网格 | 原相机 | marker | 原 Collection | 打包图像/字体 | FONT总数（含原） |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | 276/337 | 216 | 17 | 31 | 66 | 105/1 | 2 |
| 2 | 60/89 | 40 | 9 | 23 | 48 | 36/1 | 2 |
| 3 | 441/486 | 184 | 1 | 35 | 12 | 71/1 | 13 |
| 4 | 163/203 | 112 | 10 | 35 | 49 | 49/1 | 10 |

图像及中文字体均打包进副本。原外部图像按完整原路径最长后缀和章节分镜语义重链；不同内容同分候选会直接报错，禁止静默选第一张。副本可直接打开，继续编辑 Collection、图像材质和 FONT；资源清单中的 production PNG 另存于 artwork，网页使用单独 WebP。

## 明确允许的派生几何例外

除下表外，所有原网格的逐顶点位置、拓扑与每一 UV 层严格保持。首卷由 `blender-original-geometry-chapter-1.json` 额外只读对照证明，另三卷将原始指纹直接记入构建证据并在重开时核验。

`full-uv-affine` 根据原局部位置/UV拟合完整0..1四角，恢复原裁片漏掉的内容，替换图再按真实透明gutter和内容比例适配；改变派生网格，不改变对象matrix。`explicit-corners` 只用于第二卷连续水岸，原三片world union拟合raw比例后逆变换成主载体local四角，仅外扩gutter。`preserve-region` 保留原位置和拓扑，只将原摘取UV映射进生产PNG的精确内容区域，避免恢复出整栏架。

| 卷 | ID | 原对象 | 允许策略 |
| --- | --- | --- | --- |
| 1 | `c1-t021` | `02_右侧宫阙巡游` | `full-uv-affine` |
| 1 | `c1-t038` | `05_06_亭` | `full-uv-affine` |
| 1 | `c1-t047` | `07_1-宫殿建筑` | `full-uv-affine` |
| 1 | `c1-t085` | `13_11_女帝身后宫殿建筑` | `full-uv-affine` |
| 1 | `c1-t052` | `08_01_上方山水城景` | `full-uv-affine` |
| 1 | `c1-t059` | `10_03_前景百官群像_补全` | `full-uv-affine` |
| 1 | `c1-t067` | `11_05_学者书案` | `full-uv-affine` |
| 2 | `c2-t002` | `右下河流与岸景` | `explicit-corners` |
| 2 | `c2-t004` | `01_左侧案桌与人物` | `full-uv-affine` |
| 2 | `c2-t005` | `03_中间远景` | `full-uv-affine` |
| 2 | `c2-t006` | `06_左上人物背景组合` | `full-uv-affine` |
| 2 | `c2-t010` | `2-1 中景 03_右侧花市街景` | `full-uv-affine` |
| 2 | `c2-t011` | `2-1 中景 05_左上宫殿与朝臣` | `full-uv-affine` |
| 2 | `c2-t012` | `2-1 前景 01_左侧牡丹与山石` | `full-uv-affine` |
| 2 | `c2-t018` | `2-3 中景 左侧人物后方建筑` | `full-uv-affine` |
| 2 | `c2-t019` | `2-3 主体 人物群` | `full-uv-affine` |
| 2 | `c2-t020` | `2-3 主体 右侧人群` | `full-uv-affine` |
| 2 | `c2-t028` | `2-5 前景 04_前景牡丹花石` | `full-uv-affine` |
| 2 | `c2-t029` | `2-6 中景 04_右侧街景` | `full-uv-affine` |
| 2 | `c2-t034` | `2-7 前景 03_下方牡丹水岸` | `full-uv-affine` |
| 3 | `c3-t001` | `微信图片_20261016180912_185_1685` | `full-uv-affine` |
| 3 | `c3-t004` | `09_红圈桌子与桌面陈设_组合` | `full-uv-affine` |
| 3 | `c3-t027` | `SC04_06_左上背景` | `full-uv-affine` |
| 3 | `c3-t028` | `SC04_07_右下背景` | `full-uv-affine` |
| 3 | `c3-t041` | `SC06_02_左上建筑` | `full-uv-affine` |
| 3 | `c3-t054` | `SC07_02_上方宫苑场景` | `full-uv-affine` |
| 3 | `c3-t056` | `SC07_01_左侧镜台陈设` | `full-uv-affine` |
| 3 | `c3-m-de3408ad8a8f-full-uv` | `SC02_03_右上仕女群` | `full-uv-affine` |
| 3 | `c3-m-f449c3cfe037-full-uv` | `SC02_06_上方人物背景` | `full-uv-affine` |
| 4 | `c4-t007` | `微信图片_20261018213717_423_1685` | `preserve-region` |
| 4 | `c4-t008` | `微信图片_20261018221025_441_1685` | `full-uv-affine` |
| 4 | `c4-t020` | `4-3 · 02 · 沉香亭` | `full-uv-affine` |
| 4 | `c4-t027` | `4-5 · 01 · 兵马山峦红日` | `full-uv-affine` |
| 4 | `c4-t029` | `4-6 · 06 · 桌案花木` | `full-uv-affine` |

墨边在复制后的材质里对真实UV域做窄smoothstep alpha混合，原RGB/原着色表面保留。几何修复与像素补绘分开记录；不会用shader羽化冒充缺失衣摆、桌脚或建筑补全。第四卷原地坪仅UV重映射，原点位/拓扑完全不动。

## 明确允许的可见性例外

以下仅在副本 `hide_render=true`，原对象、原矩阵、父子和原 Collection 成员关系仍保留，原源完全不动。

### 第1卷

- `14_批注06_右侧题字_原字`
- `07_2-山水人群.001`
- `14_背景01_女帝身后背景_补全.001`
- `14_背景02_右上与右下书页后背景_组合.001`
- `长卷_连续绢本地形`

### 第2卷

- `2-6 题字 02_中央题字`
- `右下河流与岸景.001`
- `右下河流与岸景.002`

### 第3卷

- `SC03_03-text-panel`
- `SC04_05_右侧文字面板`
- `SC06_25_题词文字`
- `SC06_26_朱红印章`

### 第4卷

- `4-8 · 01 · 故国山水城景.001`
- `05_字幕替换意境山水.001`
- `4-1 · 01 · 题字与远宫`
- `4-9 · 04 · 千古题字`

首卷连续绢本地形隐藏render以免剪断完整裙摆和画片；后方原天幕继续渲染，World未修改。第二至四卷纸底均保持。第二卷两份重复水岸退休，由一张连续岸线承接；第四卷两块重复/阶梯辅助山景退休，完整主景保留。低清题签/印记以新可编辑FONT承担，原图文件不删除。

## 原源哈希

| 卷 | 原源（相对工程根） | SHA-256 |
| --- | --- | --- |
| 1 | `source/牡丹/场景blender搭建/一/牡丹与女帝_叙事复合运镜.blend` | `aa0a74c9693a208b382cac12ea66c5c31bf80dc50f65ee539b9739abd71e7d3d` |
| 2 | `source/牡丹/场景blender搭建/二/画卷二_长卷叙事.blend` | `d7b4430ca25d3562ee06d81946feb911760ae572bf01633f732c81c495cca0e4` |
| 3 | `source/牡丹/场景blender搭建/三/画卷三_中国长卷_复合运镜_v07.blend` | `4902ef5d7a70f4e7f54a8f8b307943f22437a1ed64a12aa6bc798742daf5421d` |
| 4 | `source/牡丹/场景blender搭建/四/Fourth_Scroll.blend` | `dcf4a6e96bf8606348563a985dc2bc935817ed5be08ae96066176670f0d84026` |

## 验证与复现

实际工具为本机 Blender 5.0.0。所有四卷经过原子另存、临时副本重开、最终路径重开和独立新进程验证，退出0。验证包含固定输入清单/资源、副本文件、原文件哈希、打包图像字节、打包字体、shader/几何/元数据指纹及上述原场景不变量。17项前置测试覆盖路径防覆盖、完整UV拟合、保留区域映射、显式四角不重复做aspect缩放、几何改动白名单和可编辑印记。

下例 `$blenderExecutable` 由调用者提供，可来自 PATH、环境变量或本机配置，不将机器位置写入工程代码：

```powershell
& $blenderExecutable --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/validate-reconstructed-blender.py -- --report reports/reconstruction/blender-reconstruction-chapter-4.json
```

对其他卷替换 report 中章号。构建入口为 `scripts/reconstruct-blender.py`，以 `--source-config`、`--manifest`、`--chapter`、`--output-dir` 决定路径；`--check-only` 只检查资源，`--dry-run` 完整修改内存并验证但不另存。禁止将output放回任何原源目录。

精确证据为 `blender-reconstruction-chapter-1/2/3/4.json`、`blender-reopen-validation-chapter-1/2/3/4.json` 和 `blender-delivery-index.json`。首卷样板展示后才扩展其余三卷；网页画面由各章节实际新截图审查，第四卷本代理独立看全9停点8转场，问题与修正见 `visual-acceptance-chapter-4.json`；第二、三卷视觉由相应审查方验收，本说明不冒称代看。原source没有上传，也没有执行Git操作。
