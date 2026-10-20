# 第一卷画层跳动修复

## 复现与原因

用户两张截图对应第一卷第六景。原 `06_01_中央主位女子` 与 `06_05_京城全景` 的基础矩阵始终静止，Three.js 默认透明排序却按当前相机空间内的包围球中心决定整张图片的先后。两层横向中心相差约12.47世界单位，纵深只差约0.44；原路线的轻微横向转向足以让二者中心深度交叉，宫城整片突然遮住女帝。

`depth-six-baseline.json` 保存101个连续进度的原相机、矩阵和投影中心。原默认排序在 `.349` 至 `.350` 附近翻转；正式回归以 `.348`、`.352` 两侧真实绘制回调证明翻转，修前截图 `sorting-before-0.348.png` / `sorting-before-0.352.png`。

## 实现边界

`src/scene/StableLayerSorting.ts` 从原阅读路线全部相机视向移除横向游观分量，求得稳定排序轴 `[0, 0.9925386866, -0.1219301257]`。保留源相机纵向俯仰，以准备好的每个图片载体局部中心及基础世界矩阵决定画层深度。`SceneRenderer.ts` 只给第一卷安装该透明排序器，保留 Three.js 的 groupOrder、显式 renderOrder 优先级与确定性对象次序。

源动画重算基础矩阵时更新相应深度键；花瓣、云气等独立轻动和指针视差不改基础画层关系。因此同时保留原动画真正移深的能力与2.5D纸片构图的稳定性。第二至四卷的排序器不变。

修复未改相机路线、主体世界矩阵、几何、材质透明度、纹理、修订 manifest 或 Blender。正式浏览器回归在完全相同进度逐值比较修前/修后相机、全场基础矩阵和几何；修后宫城先绘制，完整女帝后绘制。截图 `sorting-after-0.348.png` / `sorting-after-0.352.png`。

## 可复测命令与证据

- `node scripts/test-stable-layer-sorting.mjs`：七项源数据回归，216个原画层；轴、真实人物/宫城、独立动作冻结基础顺序、源动画移深、排序传递性、显式优先级、矩阵和几何保全。证据 `test-stable-layer-sorting.json`。
- `node scripts/validate-layer-sorting.mjs`：真实 Chromium 复现原翻转，再测试八次双向密集扫动（关闭与开启动态各四次），1920/960/360窗宽，真实GPU丢失恢复，以及四卷全路正向/反向。通过实际 `onBeforeRender` 记录绘制先后；无产品测试按钮或可见诊断层。完整结果以 `validation-layer-sorting.json` 为准；分阶段结果 `validation-layer-sorting-focused.json` / `validation-layer-sorting-routes.json` 分开标注覆盖范围。
- `node scripts/validate-sorting-motion-dwell.mjs`：实际可见动态层矩阵发生变化，指针视差左右四次；303个绘制帧、动态时钟前进约2.38秒，女帝/宫城无翻层。证据 `validation-sorting-motion-dwell.json`。
- `npm run build`、`npm test`：类型/生产打包及原四卷连续路径检查已通过。

浏览器脚本由 `MDGS_PLAYWRIGHT_MODULE`（或测试环境模块查找路径）和 `MDGS_TEST_BROWSER` 提供本机测试工具，不嵌入固定机器路径。专门测试服务器使用系统空闲端口，不监视离线生产目录；正常运行不依赖这些测试工具。

2026-10-20最终执行：完整报告 `validation-layer-sorting.json` 为 `passed:true`。关闭动态217帧、开启动效4820帧，两主体每帧均被真实绘制且无翻层；四卷各62个全路双向采样，逆程绘制顺序全部一致，第二至四卷保持原排序器。1920/960/360窗宽、真实GPU恢复通过，0页面错误、0纹理失败。执行结束后重算源码、四卷原场景和修订manifest的指纹，全部与报告相同；此阶段canonical为 `290e865749ec5a27c48c1c6b7f3dda55bcd809e0d9610ab98d791fd5042ef115`。

范围：当前Windows/Chromium；本页的图像与hash明确对应首卷排序修复阶段。后续空白补设计增加内容后，应以最终组合版本补验受影响视图。
