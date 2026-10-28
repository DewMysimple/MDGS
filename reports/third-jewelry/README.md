# 第三卷首饰与罐盒组合恢复

## 原因与实现

原网页已有 `06_右侧首饰瓷器_06_首饰与罐盒组合`，但其源材质的透明混合系数为常量零，实际不可见。用户更新的 Blender（SHA-256 `b8ca4c4e704f592f336aa46d2902cfaa229b5f06b2c983cd799474b7c248719a`）以 `06_首饰与罐盒组合` 替换了旧对象。新对象使用相同图片，位置、大小、UV和材质不同；它在连续场景全部2068个整数帧均可渲染且世界矩阵不变。只读提取新版四顶点网格、完整UV/法线、世界矩阵和节点材质；重用原网页无损贴图（源SHA `c4ddbcf69e13e1e41e802f72c3c0e10355dbcbd305eb99caafd8fbbaae9cce54`），不额外引入贴图或入场动画。新材质来自原有节点编译器。原整体清单源SHA继续指向旧源，单对象替换的新源SHA独立写入audit，避免误称整个场景来自新源。两份源blend均未保存修改。

## 核对与性能采样

`scripts/extract-third-jewelry.py` 用Blender 5.2.3只读提取；`scripts/merge-third-jewelry.py` 合并；`scripts/validate-third-jewelry.py --input tmp/third-jewelry/extracted.json --baseline c507390` 将三角面展开与提取逐值比较，并将替换位置归一化后比对旧Git基线的全部其他场景和材质数据，结果通过。`npm run test:scene-stability` 通过。Blender第1879帧有/无对象渲染与2K Electron同帧截图人工对照，罐、首饰盒及镜面均出现；本地截图在 `tmp/third-jewelry/` 和 `tmp/stutter-measure/chapter3-jewelry-visual-20261028/`。

隔离Electron、720p、第三卷从头至尾的有效采样：30帧档最大间隔76.2ms、60帧档59.7ms，各一次超过50ms，无超过80ms，均无资源等待；最初一次30帧采样以每秒一次固定节拍只行至8.1%，重测已到卷末，原异常采样不作为有效全程结论。720p、第三卷进度0.80起各12秒：补入前30帧档最大绘制提交间隔42.7ms、60帧档22.6ms；补入后分别38.3ms、21.8ms，均无超过50ms间隔。2K同位置各12秒分别最大41.5ms、33.9ms；60帧档出现一次跨源帧步进，不能称为始终满60帧。四卷各从0.53起在720p/30和60抽样6秒，均未出现超过80ms的提交间隔；复测第一、二卷各12秒，第一卷30帧档有7次50ms以上（最大65ms），第二卷30帧档3次（最大55.4ms），第二卷60帧档2次（最大54.5ms），伴随临近贴图加载，未见资源等待。异步缩放、减少预加载并发、720p中等缩放质量试验没有稳定改善，已全部撤回，不冒称波动已解决。采样指标是页面提交时间而非屏幕实际呈现，不能证明其他画卷全程、其他分辨率或低配设备无掉帧。摘要见 `performance-summary.json`，逐次原始数据留在 `tmp/stutter-measure/`。

## 本地交付

`npm run export:desktop -- --output E:/动效网页/提交材料/数字牡丹赋-10-28第三卷首饰补全版` 成功，原图复制、ZIP CRC和解压哈希校验通过。新EXE已放入原交付目录，SHA `bf69488fbb63b9788e649fbc514bfa5b03e42910ef810fa7e04e2a216372a8f0`；旧三文件备份于 `tmp/third-jewelry-old-package-20261028`。ZIP SHA `66061846be3e932fae73fbb0e38b86548681a9befe5e77c3676d50742339411f`。用户要求仅本地，不推送GitHub。
