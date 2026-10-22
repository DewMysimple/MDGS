# 新版四卷局部环境动效

需求来源：2026-10-21用户提供“牡丹”四份新版Blender，要求主体静态、少量合理的环境动效。旧版R1/R4等动效绑定不适用于新源，现行模块用独立新profile。

## 已实施

`src/data/newMotionProfiles.ts`仅列明经实际纹理像素审阅的精确对象名：首卷17个独立花瓣图层；第三卷6个纯飘带对象与1个独立红灯笼。人物、建筑、花石组合、宫灯市集、含纸面题字的“两盏花灯”和牡丹双鸟飘带整饰保持原源矩阵与原动画，不加入局部摆动。候选文件的safeIndependentName只是初筛，不能当作美术批准；逐图裁决在motion-source-review.json。

`src/scene/NewScrollAtmosphere.ts`在四卷每个真实阅读节点的相机空间确定两个世界坐标单瓣，共80个小曲面。落位后不追随相机，观察时有真实视差；其中一瓣位于内侧，保持手机裁景可见，另一瓣在宽卷外侧。单瓣只取新版首卷s15_07.png中间独立花瓣的UV，不编辑、重新生成或替换原画。精确来源WebP SHA保存在代码和审阅报告。

同一视野最多2枚追加单瓣与1个原生独立轻动物体，30Hz环境重绘，周期15–29秒。第三卷飘带角度0.24度，红灯笼0.65度，原花瓣少量漂转。第四卷从第5源节点到末节点逐渐降速、减少花瓣；关闭动效时恢复原姿态，追加单瓣隐藏。结尾、reduce和后台的停止仍由SceneRenderer已有开关调度，不另增RAF或纹理loader。

## 已接入现有场景

SceneRenderer建完新源objects后，只针对`manifest.sourceRevision === activeSourceEdition`调用：

```ts
const atmosphere = createNewScrollAtmosphere(manifest, chapterId);
for (const object of atmosphere.objects) {
  scene.add(object.mesh);
  objects.push(object);
}
const motion = new MotionDirector(chapterId, objects, manifest.stops, atmosphere.profile);
```

原有updateCamera继续把源动画当前矩阵传给setBaseMatrix，维持相机/源动画与独立环境时钟分离；追加对象没有源动画，保留初始世界矩阵。材质和url加入原队列，不使用额外图片加载器；纹理未到时mesh.visible=false。getMotionState/ambientFps已优先使用motion.profile。对象userData.editionAtmosphere区分追加动效和旧canonical补画。sourceVisible=false会被纹理完成回调及MotionDirector共同尊重，不能由ambient重新显示。

环境开关、减少动态和隐藏页面时同步恢复基矩阵、清空追加单瓣opacity与activeNames，后台不依赖下一次RAF才停止。卷末由外层setMotionEnabled(false)沿同一路径停止，恢复场景时不重置独立时钟。

`MotionDirector`只新增可选第四参数，旧profile默认行为不改。父任务不需要修改旧motionProfiles的历史编辑资料。

## 验证及边界

实际通过`npx tsc -b`和`node scripts/validate-new-motion.mjs`。后者共9组、120个节点×比例检查，覆盖四卷15/7/9/9节点与1440/650、375/550、620/250取景，验证可见单瓣、最多3个绑定、静态主体矩阵不变、禁用恢复原基矩阵/隐藏追加瓣、不可见对象不进入动效预算；另核对同源纹理SHA与独立单瓣UV。另四组直接运行SceneRenderer的真实load/开关/reduce/hidden/end生命周期方法，以GPU/DOM stub代替浏览器，检查新版profile、共用objects、追加数量及停动诊断。

运行时从画卷canvas.dataset检查：activeMotionNames为JSON列表，正常可见N{卷}_WindPetal_{节点两位序号}_{1或2}，首卷可另有原生独立花瓣、第三卷可另有已审飘带/单灯；editionAtmosphereLayers按卷为30/14/18/18，editionAtmosphereActive至多2，sourceHiddenVisibleLayers始终0。关闭/reduce/后台/结尾时activeMotionNames应为空、editionAtmosphereActive为0、editionAtmosphereOpacityMax为0.000000，motionTime停止。motionSupported应为true、motionAmbientFps为30。

这是CPU几何和状态测试，不能宣称已完成实际画面、媒体偏好或持续FPS验收。父任务仍需浏览器检查实际渲染、文字避让、off/reduce/后台和卷末定格。追加单瓣只占小范围，不以整幅场景形变冒充环境动效；本轮未添加独立云气，因为新源的云纹是双燕等组合，不能挪动原主体图。
