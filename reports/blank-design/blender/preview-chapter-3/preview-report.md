# 第三卷 Blender 实际预览复核

结论：**verified-visible-new-layers**。第 2、3、6 段三帧全部逐张全尺寸目视通过，新增地坪、锦架与器物案在保存后的 Blender 副本中实际显示，透明边缘与脚底承托正常。

副本：`artwork/blender-blank-design/chapter-3_reconstructed.blend`。保存、独立新进程重开均为 verified；重开验证同时确认四份原始 .blend 哈希不变。预览只在内存中建立临时相机与材质预览，不另保存文件。

冻结 manifest：`reports/blank-design/expanded-v3/chapter-3-manifest.json`，SHA256 `4287a0160c07e90881320fdc6568c8bc382540e22378936627adfcd98313daee`。

副本预览前后 SHA256 均为 `7efa9b055c3d352fd0a9b46464311a408c3f58a1780c99ecc11d9d0b9f7f39fd`，`inputsUnchanged=true`。

实际使用 Blender 5.0.0、CPU Cycles、8 samples、128 transparent bounces、6 threads，输出 1388×476；三帧总渲染用时 7.344 秒，进程正常退出。临时相机采用原主相机各锚帧 evaluated pose 与导出 verticalFOV，仅预览宽高适配。旧 Principled 叶节点在内存中改为源色 Emission，同时保留原 Alpha 与外层边缘/透明度链；新增 Emission 链不重写。

| Gap | 源锚帧 / 阅读进度 | 结论与目视观察 | PNG SHA256 |
|---|---|---|---|
| 2 | 1197.183062 / 0.185277 | 通过。新增屋顶留空的低矮庭院地坪与完整锦架、两片垂锦实际可见，木足落在石砖承托面上；布面凤穿牡丹纹没有被旧水横带截断，TR树冠图标未出现。两侧源节庆/婚嫁场景保持，透纸边缘与上方留白正常；保留的细金线仍淡淡穿行，是原连接装饰。 | `41aa645b6049ec9d8783a32b329732cb0098f2571201efd9536b662a21cef124` |
| 3 | 1893.334743 / 0.308915 | 通过。新增器物低案、四足、花器、漆盒、折锦、陶器与屋顶留空的地坪均真实显示，案足贴合台面前缘；原婚礼前后景与文字可见。原横向水块及漂浮TR树冠已消失，透明图没有矩形底，中央上方纸天空保持。 | `295e54685433272e504934cbe74eaaf5519b3f1c5fd7f6815b5226850b6543ea` |
| 6 | 3981.376926 / 0.681171 | 通过。低地坪和器物案实际显示并承接左右岁时/器物主体，案足落在可见砖石面，器皿及台脚完整；旧水横带和TR树冠未重新出现。原岁岁圆满题字与右侧镜台清楚，上半纸底留白保留，未发现新增物体穿纸或黑边。 | `913a5d4eb3f7c05f79bb4986aa08d38215a887dd7e0772a7ca881a9e409fcd32` |

PNG 为实际渲染直出，未后处理；文件名分别为 `chapter-3-gap-02.png`、`chapter-3-gap-03.png`、`chapter-3-gap-06.png`。此证明限定于真实 Blender 可见性、透明度、接地与退役辅助层状态，不宣称与 Web 像素一致：原 Blender FONT、纸底程序纹理及实际相机求值与网页有差异。

关联证据：`blender-reconstruction-chapter-3.json`、`blender-reopen-validation-chapter-3.json`、`expanded-v3/visual-review-chapter-3.json`。完整摄像机参数、渲染设置、每帧新增图层、输入前后哈希与边缘链接保留断言见本目录 `preview-report.json`。
