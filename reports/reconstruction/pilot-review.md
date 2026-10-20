# 第一卷完整样板验收

2026-10-20，Windows / Blender 5.0 / Chromium，main@9f632a0之上未提交工作树。其他三卷尚未启用本轮重构。该样板通过后再复制方法，不将局部通过等同四卷完成。

## 实际完成

- 原105张纹理逐图审查后90保留、11修复、4重生成。新增4处建筑补全、3处局部图像修复（去烘焙字的远景、完整官员袍足、学士衣摆/案脚）；另9处局部墨边和1处真实题签。未推翻其他完整画层。
- 7个新图载体从原positions/UV拟合完整四角，补上旧网格挖去的区域；严格检查UV平面内误差，单独记录并容许轻微法向起伏的平面化。原网页manifest与源.blend不改。
- 退役3个高alpha直角辅助裁片，保留各自完整主图；退役原低分辨率题签。纸色地形不再裁挡完整画片；网页只对2个明确纸底关闭depthWrite，派生Blender仅隐藏地形render、保留后方天幕。
- 58个新增世界锚定层：14薄雾连接、14远山、30独立稀疏花瓣；共享URL/PNG，不另起纹理加载器。保持原15节点和相机路线。
- 71个显式独立轻动绑定，可见最多6个（预留2瓣、1薄雾）；真实HTML题签按窗口保持可读字号，跟随世界锚点且安全边保护。减少动效与后台停帧、独立开关和有限重试已接入。

## 验证证据

| 门槛 | 当前结果与来源 |
| --- | --- |
| 15真实阅读节点与14中间过渡 | 全部实际浏览器截图并目视检查，见pilot/frames.json、transitions.json及两张overview；关键亭柱/台阶完整、山体阶梯硬口消除、原完整裙摆/花根不再被纸底裁断 |
| 动与静的关系 | pilot-motion/validation.json及frame-differences.json：首景/宫苑两景on/off/resume/reduced通过；on仅421/431像素RGB>5变化，off/reduced逐像素0变化；固定建筑、石栏、宫阶ROI稳定 |
| 轻动预算 | validation-motion-budget.json：29.5次绘制/秒，纹理峰值4并发，暂停后RAF停止；首景估算纹理193.74MiB。160MiB是缓存目标，当前可见图层不为强行达标卸载；不将本机数据当跨GPU认证 |
| 完整UV与增量矩阵 | validation-motion-unit.json：18项实际问题回归，包括7补全载体、裁剪UV恢复、轻法向起伏、错误UV拒绝、无变换累积、原动画基底、局部落瓣和配额 |
| 字号/窗口 | validation-art-text.json：4关键图、82区间样本，375窄屏安全；文字最小字号与离屏隐藏确定，原opening题字保留 |
| 交互/故障 | validation-motion-ui.json、validation-recovery-ui.json：6窗口、键盘/自动展卷与轻动分离、偏好保存、后台停RAF、有限清单重试、真实纹理中断与WebGL上下文恢复，进度/renderer/焦点保留 |
| Blender保存与独立重开 | blender-reconstruction-chapter-1.json、blender-reopen-validation-chapter-1.json：7完整UV载体，105图像和中文字体pack、2可编辑FONT；4原源SHA/世界矩阵/相机/动画/marker/层级保持 |
| 构建与原有数据 | npm run build、npm test、npm run validate:assets通过；原四卷779网格/263纹理0错误0警告 |

派生工程：artwork/blender-reconstructed/chapter-1_reconstructed.blend，SHA-256 `40a9a4317a94b091b88b6f53b23de85ee89649a8cf1a980e9dca84f7f3143c8d`。本卷采用的完整修订清单已归档到pilot/manifest.json，后续canonical扩卷不改这份验收证据。

## 展示与后续

样板截图pilot/chapter-1-comparison.jpg，完整15节点pilot/chapter-1-overview.jpg，短预览pilot-motion/first-scroll-motion.webm。由Agent完成实现与验收，向用户展示后继续其余三卷；这里没有把Agent选择写成用户额外确认。

下一阶段仍必须逐卷选择性修复、完整UV/纸底与辅助裁片复核、独立动效和第四卷盛衰包络、派生Blender重开、多尺寸/子路径/流式加载最终联调。跨显卡及其他浏览器实机尚未覆盖。
