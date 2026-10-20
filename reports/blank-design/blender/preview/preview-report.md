# 第四卷派生 Blender 实景预览验证

**通过：三个选定gap的新增水岸、空亭、低水石汀与诗案，在真实Blender渲染中均可见，透明边正常。** 3张PNG直接来自 `bpy.ops.render.render(write_still=True)`，无后处理、无伪造网页截图。

输入派生文件：`artwork/blender-blank-design/chapter-4_reconstructed.blend`；SHA256 `55c9894d97285f784c2bd5742217d30d9993aca665ad1c90385ec532425b880b`。冻结manifest `reports/blank-design/pilot-v4/manifest.json`；SHA256 `c7b593102bd8f43fd7438413b34782b64d00788f4e6d87dd3f69682ba6b81a54`。两者渲染前后哈希完全一致；未保存任何.blend。

Blender 5.0.0，CPU Cycles、8samples、128透明反弹、6线程，画心1388×476；临时相机取原主相机真实evaluated pose，按导出的verticalFOV配置并验证投影矩阵，原相机不编辑。AnchorFrame来自冻结manifest新层记录，并用真实保存报告对应stableID/物件名校验。

只在内存中把旧Principled叶节点改源色Emission，原Alpha继续通过新透明Mix；外层alphaEdge/opacity/已有Mix链保留，已为Emission的新层不重写。动画默认值逐帧刷新，所有旧非Principled输出链接保留校验通过。

| gap | 真实anchorFrame | 进度 | 渲染秒数 | 逐帧目视 |
|---|---:|---:|---:|---|
| 2 | 1035.652516839 | 0.186941795 | 2.922 | 新增浅水、左右曲岸/花石均实际显示，连接原栏角与石桥花园。水面边缘自然，透明图没有变成实色矩形；上方纸底仍可见。原Blender FONT在画面右上可见，属于保留原可编辑文字，与网页隐藏原FONT后显示HTML题签的策略不同。 |
| 5 | 2811.645582197 | 0.562768304 | 2.781 | 完整无人空亭、石基、连续短岸与局部水纹真实可见，未被纸幕吞没；淡色alpha/opacity保持，左右原兵马与回忆湖苑仍在，不新增盛宴。 |
| 7 | 3843.743058439 | 0.811929038 | 2.64 | 新低浅水、石汀和独立空卷诗案均显示，案足落在可见石面；原两游离小花团未回现，原牡丹与盛衰画组保持，透纸和自然外缘成立。 |

## 直接输出

- [gap02 PNG](chapter-4-gap-02.png)：SHA256 `aac91dfd7b28bd38ccc2fd288b92feffa80b04b2df0f7cec1467603ce022f14c`。
- [gap05 PNG](chapter-4-gap-05.png)：SHA256 `9532e0ff84fcefff133c0c487ed72a0c69cf2fb667ece425319e8f1f1c5e35d2`。
- [gap07 PNG](chapter-4-gap-07.png)：SHA256 `fc74fe4d34cd6113fb8d05425d3acb535ff49c6f46ff68eadc384323dc5adf67`。

## 复现

```text
blender --background --factory-startup --disable-autoexec --python scripts/render-blank-blender.py -- --blend artwork/blender-blank-design/chapter-4_reconstructed.blend --manifest reports/blank-design/pilot-v4/manifest.json --reconstruction-report reports/blank-design/blender/blender-reconstruction-chapter-4.json --chapter 4 --gaps 2 5 7 --output-dir reports/blank-design/blender/preview --width 1388 --height 476 --samples 8 --transparent-bounces 128 --threads 6
```

命令通过PATH或本机调用方定位Blender，脚本不固定机器路径、端口或窗口。宽高为此次验证参数，不是网站运行尺寸。

## 适用边界

Blender保留的程序绢纹和原可编辑FONT可能比网页明显；网页用HTML题签且跳过原FONT。真实相机求值与网页导出采样插值、物理透明与网页depth处理也有差别，因此没有声称像素一致。本验证只证明这三个选定gap在已保存派生文件中的实际显示、透明与接地；所有路径、移动端和动效仍由各自报告证明。
