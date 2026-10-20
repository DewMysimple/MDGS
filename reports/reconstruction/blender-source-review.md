# Blender 源工程审查与非破坏重构流程

源审查阶段核实日期：2026-10-19，只读原工程、现有导出与管线，审查产物位于 `reports/reconstruction/`。2026-10-20 后续已依照样板计划生成第一卷派生副本，原工程和原图仍未覆盖；副本结果见本页末尾及两份重开验证报告。

## 已确认事实

- `F:\Blender\blender.exe` 已实际执行 `--version` 和后台 Python，版本 5.0.0；同目录 launcher 不是此次后台审查调用入口。后台调用使用 `--factory-startup --disable-autoexec`，无嵌入脚本自动执行。
- 用户确认后的当前源目录为 `source/牡丹/场景blender搭建/{一,二,三,四}/`，四个原工程均已实际读取。最初缺源状态已解除，旧 `F:\牡丹` 只保留为历史来源。
- 本轮 Blender 实际运行 `reports/reconstruction/source-audit.py`，状态为 `verified`；完整 Collection 树、父子对象关系、Empty、网格/UV、相机、分镜、图像与材质绑定记录在 `source-audit.json`。四个原文件 SHA-256 读取前后完全相同，没有保存操作。
- `reports/assets-audit.json` 仅作为历史对照；本轮现态以 `source-audit.json` 为准。当前源对象数、相机和分镜结构与历史记录相符。
- 素材位于 `source/牡丹/素材/`，包含 `参考图片/场景图层素材/概念图/脚本`。本轮只读索引 463 张图像，为全部 27 个未打包且旧路径失效的图像引用找到确定重链候选，其中 23 张属于当前网页使用纹理。没有实际重链或重导出 public。
- 原场景版本为 Blender 502.45，本机 5.0.0 读取提示较新格式警告；本轮读取和哈希验证通过不证明降版本保存绝对无损。后续只能另存副本，随后逐项重新打开核验。后台进程退出码为 0，退出时有约 0.45 MB 的内存释放诊断，不影响已写报告或源哈希。

| 卷 | 已读原文件 | 本轮对象数 / Empty / 摄像机 | 当前网页网格 / 纹理 / 阅读节点 | 当前网页原动画 |
|---|---|---:|---:|---|
| 神都花事 | 牡丹与女帝_叙事复合运镜.blend | 276 / 16 / 17 | 216 / 105 / 15 | 5 个飘带/花瓣矩阵动画 |
| 花入万家 | 画卷二_长卷叙事.blend | 60 / 9 / 9 | 42 / 34 / 7 | 0 |
| 锦绣花意 | 画卷三_中国长卷_复合运镜_v07.blend | 441 / 44 / 1 | 393 / 72 / 9 | 0 |
| 国色倾城 | Fourth_Scroll.blend | 163 / 19 / 10 | 128 / 52 / 9 | 0 |

源对象数包含辅助对象，当前网页网格数包含求值后的曲线/文字转网格，两种数量不能直接相减视为丢失。上述纹理数字来自当前 `scene.json`，包括程序透明恢复纹理。报告同时保留了当前四卷 manifest SHA-256，作为接下来重构前基线。

## 四卷源结构与重链结论

- 第一卷已具有 15 个分镜单元及每镜前/中/后景 Collection、15 个 `空间单元_*` Empty，171 个对象有父级。独立的 `20_山水过渡` Collection 有 37 个对象；主镜头与焦点、各分镜独立路径分组完整。105 个图像 datablock 中 104 个打包，另一个是 Render Result；无必需重链。应保留这些结构，以逐层审校决定修边和补充气口，不能因为要改进拼贴感就重建全部单元。
- 第二卷已有七段原画及对应空间原点，30 个对象有父级；存在远景连接 Collection，但 `2-5 至下段 原画远景连接` 当前为空。部分段落的前/主体/远景 Collection 也为空，需结合逐层视觉审查判断缺层或人为合并，不能只凭空 Collection 自动生成。9 个未打包图像要重链，其中 7 个参与网页。
- 第三卷已有 `SC_01..SC_09` 场景单元，以及含 309 个对象的连续环境 Collection、35 个路径控制 Empty；75 个对象有父级。8 个未打包图像均能唯一命中素材。
- 第四卷已有九段中心 Empty、九段边界导览与八段留白过渡廊（39 对象）；76 个对象有父级。10 个未打包图像要重链，其中 8 个参与网页。前/中/后景现有分组可保留，按第 4、5 段交界组织盛衰动态强度变化。

重链方法为“源路径最长相同尾部优先”，不是随便选同名第一项。第二卷 `01_左侧案桌与人物.png.001` 在 `二/2-6` 与 `第二部分2.0(2)/2-6` 各有一份，且字节哈希不同；原路径含 `第二部分2.0(2)`，因此确定后者，候选 SHA-256 已记录。另两个同名候选内容相同，但仍按完整路径后缀选择。全部 27 项候选已消歧，`applied:false`，后续仅在内存或重构副本内设置相对路径。

## 原文件哈希证据

| 卷 | 读取前后相同的 SHA-256 |
|---|---|
| 第一卷 | `aa0a74c9693a208b382cac12ea66c5c31bf80dc50f65ee539b9739abd71e7d3d` |
| 第二卷 | `d7b4430ca25d3562ee06d81946feb911760ae572bf01633f732c81c495cca0e4` |
| 第三卷 | `4902ef5d7a70f4e7f54a8f8b307943f22437a1ed64a12aa6bc798742daf5421d` |
| 第四卷 | `dcf4a6e96bf8606348563a985dc2bc935817ed5be08ae96066176670f0d84026` |

源审查阶段未修改场景或 public 资产。第一卷作为样板的依据是源完整打包、既有层级清晰且已有五个局部动画；随后已在派生副本验证修边、连接层和元数据整理，详见本页末尾。其余三卷待样板展示后沿用同一规范。

## 可复跑的只读采集

已在 `reports/reconstruction/source-paths.local.json` 中记录相对路径，移动整个项目仍可解析：

```json
{
  "chapter-1": "../../source/牡丹/场景blender搭建/一/牡丹与女帝_叙事复合运镜.blend",
  "chapter-2": "../../source/牡丹/场景blender搭建/二/画卷二_长卷叙事.blend",
  "chapter-3": "../../source/牡丹/场景blender搭建/三/画卷三_中国长卷_复合运镜_v07.blend",
  "chapter-4": "../../source/牡丹/场景blender搭建/四/Fourth_Scroll.blend"
}
```

命令中的 `$taskBlender` 通过本机会话变量或显式配置提供，脚本本身不包含工具盘符：

```powershell
& $taskBlender --background --factory-startup --disable-autoexec --python-exit-code 1 --python reports/reconstruction/source-audit.py -- --sources-json reports/reconstruction/source-paths.local.json --materials-root source/牡丹/素材
```

脚本按卷在读取前后计算 SHA-256；只执行 `open_mainfile` 和内存中的 `frame_set`，没有任何 `save_*` 操作。采集 Collection 树、对象父子关系、Empty、网格、UV、材质/图像绑定、隐藏状态、约束、修改器、动画元信息、每个分镜的相机矩阵以及图像打包/路径状态。`source-read-verified` 与前后哈希相同才是成功证据；任何缺源继续明确标记。

## 后续非破坏重构顺序

1. 固定审校基线。读取源 SHA-256、导出 manifest SHA-256、逐层审校表，给每个已有对象保留稳定 ID。所有原工程与原图保持只读。首卷先做完整样板，其余三卷按相同证据和规则扩展。
2. 先做结构映射，后做视觉修改。以现有单元 Empty、分镜 marker 与世界矩阵作为锚点，按 `CH01/{叙事,前景,中景,后景,留白,过渡,动效,装饰}` 建重构 Collection；原对象名称保留在 `source_name` 自定义属性。不能只靠文件名把人物或建筑当作动效层。
3. 在受控输出目录另存 `<原名>_reconstruction.blend`，拒绝目的路径与任一原路径相同。整理 Collection 时不改对象世界矩阵、原相机轴向或原阅读 marker；保留原相机动作以便回比。原文件保存前后哈希仍相同。
4. 按逐层结论选择保留、修复、重生成。保留现有高质量主体；修边/补底/外扩或新增连接层只能作用在衍生图像和副本材质。新图层记录卷、主线节点、叙事功能、安全外扩边、原对象映射和动态用途。
5. 连接层放在相邻单元交叠区，按相机读取结果检查实际遮挡。云气/远山贯通后景，低对比纸面气口维持留白，局部花枝或栏杆只处理合理前景遮挡；不能用一层浓雾掩盖所有问题。
6. 将可动的云雾、柳枝、流苏、花瓣等独立命名与分组；网页只对这些标记对象施加轻微动态。主体人物、器物、宫殿和字幕保持稳定；第四卷动态强度由前半盛美向后半低频疏淡递减。
7. 重构副本导出到临时独立目录后检查，禁止先覆盖现有公开资产。逐项核对纹理、透明边缘、UV、世界矩阵、相机投影/路径、各阅读节点；首卷通过画面验收后才接入网页。合并时保留旧资产与来源映射直至对照审查完成。
8. 最终交付包含重构副本、独立可搬迁源图、导出配置示例、审校表、原文件前后哈希、每卷若干关键画面与验证结果。必须实际在 Blender 打开副本、在网页逐节点查看，不能只靠 JSON 结构校验证明拼贴感消除。

不变量：四卷读取轴 `+X / +X / +Y / −Y` 保留；第一卷网页阅读止于 frame 13474、第二卷止于 frame 5521，避免原片结尾离卷动作被当成连续阅读。原长横排 FONT/图内文字需单独审校，修复文字不能造成主体画面缺损。

## 本轮新增产物

- `source-audit.py`：可复用只读 Blender 采集脚本。
- `source-audit.json`：本轮实际源层级、工具检查、重链候选、原文件前后哈希及当前 manifest 指纹。
- `source-paths.local.json`：四卷原路径的相对映射，不修改已有运行或导出配置。
- `blender-source-review.md`：本说明。

## 第一卷派生副本实测结果（2026-10-20）

已实际生成 final7 版 `artwork/blender-reconstructed/chapter-1_reconstructed.blend`，252,226,020 字节（240.54 MiB），SHA-256 `40a9a4317a94b091b88b6f53b23de85ee89649a8cf1a980e9dca84f7f3143c8d`。完成临时副本重开、最终路径重开及另一个 Blender 进程独立重开验证；命令均退出 0。原文件保持只读，四个原文件哈希仍与上表一致。早期副本虽然重开一致，但旧UV仍裁断新图；这一视觉问题已按独立审查修正，详见 `pilot-independent-visual-review.md`。

- 实际接入 4 个选择性补全图和 3 个局部修复替换图、9 个局部 UV 透明边缘修复、58 个新增平面（14 云气、14 淡墨远景、30 单瓣），以及 2 个可编辑中文 FONT（另有 1 个父 Empty）。共 337 个对象。
- 原 276 对象世界矩阵、原相机在所有 marker 帧的求值矩阵、原动画对象求值矩阵、31 个 marker、父子关系及原 Collection 嵌套树均保持。7个替换图使用完整0..1四角UV载体，局部坐标由原导出样本仿射拟合并按透明 gutter/宽高比适配；允许这一派生几何改变，不改原对象矩阵。
- 原低清题签与三个有硬口的辅助裁片在副本中隐藏；连续绢本地形另作 render 隐藏，避免剪断完整画片，原纸底对象/矩阵/材质/几何仍保留，后方天幕继续渲染且World不改。这5项可见性变化由 validator 显式列出，其余原可见性保持。
- 新建八类角色 Collection，链接相同对象并保留原层级。所有对象具有稳定 ID、原名、叙事归属、处理方式与动态角色。新增动态图层只记 `motion_role`，不改原动画；网页负责持续轻动。
- 105 个实际使用图像 datablock 已打包；共享云气、远景、花瓣按 production PNG 复用。由 `WINDIR/Fonts` 动态发现并打包 SimSun 中文字体，标题和正文保持可编辑，无机器字体路径运行依赖。
- `scripts/reconstruct-blender.py` 执行资源预检、原源输出防覆盖、相对路径解析、临时保存和重开校验；`scripts/validate-reconstructed-blender.py` 独立校验原哈希、副本哈希、shader/geometry/元数据指纹、打包图像与中文字体。

证据：`reports/reconstruction/blender-reconstruction-chapter-1.json`、`reports/reconstruction/blender-reopen-validation-chapter-1.json`，输入清单归档为 `reports/reconstruction/pilot/manifest.json` 并校验哈希。补充 `blender-original-geometry-chapter-1.json` 通过只读打开原源和副本证明：216个原mesh仅7个明确替换载体允许变化，另209个原位置、拓扑与全部UV层完全一致。未运行 public 原资产重导出；场景结构与独立重开通过不替代网页画面的视觉验收。

## 第二、三卷最终副本

首卷样板展示后扩展其余卷。第二卷由主代理逐景检查，第三卷由图层审查代理检查新9停点/8转场；本源审查代理不将未亲自看的第二、三卷画面宣称为独立视觉通过。

| 卷 | 实际副本 | 字节 | SHA-256 |
| --- | --- | ---: | --- |
| 二 | `artwork/blender-reconstructed/chapter-2_reconstructed.blend` | 121975489 | `4e916bb35aac9f618f1caceb77cd166be71b099f458967949013d3155dda1651` |
| 三 | `artwork/blender-reconstructed/chapter-3_reconstructed.blend` | 167053219 | `f9cdca20b8458edf8cc5fcab9c88e337e6444e2a095b82a93658094c943da221` |

两卷均完成实际原子另存、临时重开、最终路径重开及独立新进程重开，退出0。所有四个原源哈希、原对象世界矩阵、相机/动画求值、分镜标记、父子/Collection树保持；新证据另逐一记录原mesh位置、拓扑、各UV层SHA，严格禁止清单外的几何改动。第二卷40原mesh仅13个明确目标可变，第三卷184原mesh仅9个明确目标可变。

- 第二卷原三份水岸改为一张连续水岸：仅主载体显式local四角覆盖原三片world union，并按raw比例cover、不拉伸。原matrix不动；两重复aux仅在副本hide_render，原位置/拓扑/UV仍在。单一亭台与一组静赏人物不再重复三次。布局证据 `chapter-2-river-layout.json`。
- 第三卷保留有意摘取的单盏花灯，未批量fullUV所有裁片；只实施清单内7个替换与2个几何补全。装饰印记保持可编辑FONT与当代展陈语义。
- 第二卷89对象、36打包图像、1打包字体、2可编辑FONT；第三卷486对象、71打包图像、1打包字体、13FONT（含原6与新增7）。八类角色Collection仍链接同一对象，不移动原层级。

分别归档只含该卷数据的 `after/chapter-2-manifest.json` 与 `after/chapter-3-manifest.json`，带 `parentCanonicalSha` 与阶段。构建与独立验证只引用各自快照，第四卷后续调整不使第二、三卷证据失效。对应 `blender-reconstruction-chapter-2/3.json` 与 `blender-reopen-validation-chapter-2/3.json` 已实际通过。

## 第四卷最终副本与完整交付

第四卷在最终新9停点/8转场逐张原尺寸独立复验通过后生成 `artwork/blender-reconstructed/chapter-4_reconstructed.blend`，122956443字节，SHA-256 `a75acb715206ae58e4aa20215a2d6d066e2b3f91317d64a6fddf052cae35af19`。实际保存、临时/最终重开、独立新进程重开均退出0。使用 `after/chapter-4-manifest.json` 固定单卷快照。

最终203对象（原163），49打包图像、1打包中文字体、10FONT（含原6和新增4）。112原mesh仅5个明确目标允许派生几何或UV变化，其中地坪只映射UV、原点位与拓扑不动；其余原mesh位置/拓扑/全部UV层指纹完全一致。35markers、原相机、原对象矩阵、原动画与原层级保持，纸底不变。退休低清题签及两个重复/阶梯辅助山景仅hide_render，完整主景保留。四个原源哈希与前三个派生文件哈希未变。

最终可搬迁文件、四卷精确SHA、固定清单、全部可见性/几何允许清单和验证入口统一见 `blender-delivery.md`、`blender-delivery-index.json`。第四卷实景证据 `visual-acceptance-chapter-4.json`；中间候选失败及修正经过在 `chapter-4-independent-visual-review.md`，已明确更新最终通过状态。
