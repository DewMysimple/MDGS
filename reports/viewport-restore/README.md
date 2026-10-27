# 首卷第八景：用户确认的视图素材恢复

## 依据与边界

用户提供的 Blender 画面（源帧 1451）包含“主体 · 03_中央花车巡游与曲水”，网页同帧缺失该主体。只读检查指定源文件 SHA-256 `e459fad5ca48e209fa63555c5253c7650547036c6be247dd13cd48c1287f1402`：该对象在全部 3024 源帧 `hide_render=true`，但 `hide_viewport=false`、视图可见；常规导出只包括至少一帧 render 可见的对象，故该图层被遗漏。这是用户指定的、依据 Blender 视图恢复的单对象例外，不将其他 render 隐藏对象一律显示；`audit.neverVisibleGeometry` 保留原始 render 可见性事实。

补全对象复用源网格、逐点 UV/法线、世界矩阵、源材质节点编译结果和图片 `s08_02.png`。图片源 SHA-256 `8b4f178ca8a9504b40c83b2642350ca2a893e30da9391cf65c2f092ec0a171d0`，输出 WebP 完整无损；不追加入场动画。源文件只读、不另存。

## 复建

适用于当前精确源 SHA 的常规首卷导出完成之后；已应用过补丁的清单禁止重复追加。`<blender>` 替换为 Blender 5.2 程序，`<source>` 替换为用户指定的第一卷 `.blend`。输出目录只保存中间结果，不覆盖源文件：

```powershell
& <blender> --background --disable-autoexec --python-exit-code 1 --python scripts/export-viewport-restore.py -- <source> tmp/viewport-restore
python scripts/merge-viewport-restore.py --input tmp/viewport-restore
node scripts/validate-viewport-restore.mjs --recovery tmp/viewport-restore
```

提取脚本扫描所有源整数帧，若对象属性、材质、变换、可见性或源 SHA 发生变化便报错并要求重新审查；合并脚本拒绝重复，保留源像素无损。验证脚本有 `--recovery` 时会将运行清单中索引网格还原为三角面，逐值核对源坐标、UV、法线、世界矩阵、包围盒与原生材质程序；无参数时核验场景身份、单对象例外、素材完整性和不含入场参数。

## 本次验证

Windows，Blender 5.2.3 LTS，只读原文件提取；`node scripts/validate-viewport-restore.mjs --recovery tmp/viewport-restore` 通过，364 个索引顶点、256 个三角面及材质逐值一致；`node scripts/validate-source-visibility.mjs` 通过。实际 Edge WebGL、1920×1020 视口、2K 档在源帧 1451 及约 1400.649、1500.408 附近捕获；花车、马、人物、旗幡、亭桥和曲水在同构图中出现，三个抓图均没有纹理失败或着色器错误，页面无错误。抓图为本地临时证据 `tmp/viewport-restore/shots/`；这不是四卷每帧完整视觉验收。
