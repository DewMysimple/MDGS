# 本轮 Blender 副本管线就绪检查

当前为“工具与路径预检就绪，样板布局未冻结”。没有加载源场景，没有保存任何新 `.blend`。现有 17 项预检先通过；补充 6 项跨交付防误写回归后为 23 项通过。`py_compile` 通过。真实旧交付第4卷 blend/证据 SHA 前后一致；指定新目录被接受，误用旧交付目录在导入 `bpy` 之前即被拒绝。逐项输出与脚本 SHA 见 [readiness.json](readiness.json)。

## 交付隔离与可重复运行

从原 `source` 工程与本轮冻结 snapshot 生成；禁止从旧派生副本再加工。新副本固定使用 `artwork/blender-blank-design/`，新证据使用 `reports/blank-design/blender/`；先前 `artwork/blender-reconstructed/` 与 `reports/reconstruction/` 保留。

`--report-dir` 已覆盖 dry-run 与正式报告；独立重开结果写回输入报告所在目录。新增防误写检查拒绝：写入源工程目录、证据覆盖输入文件、已有 blend 没有匹配证据、已有证据属于另一 manifest 路径或另一输出路径。相同 snapshot 路径与相同输出/证据目录允许重新构建，适合本轮迭代；final snapshot 内容仍须冻结并由 hash 证明。

## 新图层与独立重开证据

新增层使用完整单位平面、给定 `uvRect` 和网页列主序矩阵，PNG 以原始字节打包，透明/发射材质乘以显式 opacity。新增层记录和对象属性包含稳定 ID、原名、角色、叙事、PNG/WebP 路径、opacity、UV范围；可选网页 `renderOrder/depthTest/depthWrite` 作为描述性属性记录。它们不是 Blender 的实际排序覆盖，不能以存了这些字段宣称 Blender 与网页排序像素完全相同。

重开时对比原相机/动画/marker/矩阵/集合层级、允许目标之外的原几何与UV、所有派生层矩阵/几何/材质图与元数据、打包图像/字体字节。独立结果还记录输入重构报告 SHA、冻结 snapshot SHA、已核对源哈希与资源数量，避免只有一句“verified”。这些代码路径已审查；新增属性的实际保存/重开证明须在布局通过后由下面命令产生。

## 布局通过后执行的命令

在工程根目录运行；`MDGS_BLENDER` 指向本机 Blender 可执行文件，工具脚本不含机器盘符路径。主线程先把实际通过的本轮 canonical 冻结到 `reports/blank-design/pilot/manifest.json`，不要把此次 `before/manifest.json` 预检当成新布局通过。

```powershell
python -X utf8 scripts/reconstruct-blender.py --source-config reports/reconstruction/source-paths.local.json --manifest reports/blank-design/pilot/manifest.json --chapter 4 --output-dir artwork/blender-blank-design --report-dir reports/blank-design/blender --check-only

& $env:MDGS_BLENDER --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/reconstruct-blender.py -- --source-config reports/reconstruction/source-paths.local.json --manifest reports/blank-design/pilot/manifest.json --chapter 4 --output-dir artwork/blender-blank-design --report-dir reports/blank-design/blender --dry-run

& $env:MDGS_BLENDER --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/reconstruct-blender.py -- --source-config reports/reconstruction/source-paths.local.json --manifest reports/blank-design/pilot/manifest.json --chapter 4 --output-dir artwork/blender-blank-design --report-dir reports/blank-design/blender

& $env:MDGS_BLENDER --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/validate-reconstructed-blender.py -- --source-config reports/reconstruction/source-paths.local.json --report reports/blank-design/blender/blender-reconstruction-chapter-4.json
```

预期输出为新目录中的 `chapter-4_reconstructed.blend`、`blender-reconstruction-chapter-4.json`、`blender-reopen-validation-chapter-4.json`。网页新布局、实际 Blender 保存、独立重开与视觉检查均需另有实证，当前 readiness 不宣告这些已完成。
