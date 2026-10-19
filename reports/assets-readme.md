# Blender 资产接入与复现

四个 `.blend` 工程均已实际读取、提取并接入浏览器资产。未保存、覆盖或修改源工程。

| 网页章节 | 源工程 | 阅读轴 | 导出网格 | 原图纹理 / 程序纹理 | 原作者阅读节点 |
|---|---|---|---:|---:|---:|
| 第一卷·神都花事 | `F:\牡丹\场景blender搭建\一\牡丹与女帝_叙事复合运镜.blend` | +X | 216 | 103 / 2 | 15 |
| 第二卷·花入万家 | `F:\牡丹\场景blender搭建\二\画卷二_长卷叙事.blend` | +X | 42 | 34 / 0 | 7 |
| 第三卷·锦绣花意 | `F:\牡丹\场景blender搭建\三\画卷三_中国长卷_复合运镜_v07.blend` | +Y | 393 | 72 / 0 | 9 |
| 第四卷·国色倾城 | `F:\牡丹\场景blender搭建\四\Fourth_Scroll.blend` | −Y | 128 | 48 / 4 | 9 |

## 转换方式

采用真实分层纹理与 Three.js 网格，没有把四卷转成视频或四张大长图。保留原对象世界变换、透明 PNG 图层、裁切网格、地形、山脊线、原相机和 timeline markers。相机与几何均保持 Blender 原世界坐标；矩阵按 Three.js 列主序输出，四元数为 xyzw。相机垂直 FOV 从 `calc_matrix_camera` 的投影矩阵计算，避免不同轴向和 sensor fit 引发视野错误。

23 张原先指向旧目录的已用纹理已从 `F:\牡丹\素材` 恢复，按文件名并优先匹配原分镜文件夹，仅在导出内存中重链。最终已用资产缺失纹理 0，转换失败对象 0。审查中的 Render Result 和未使用重复图像不会当作缺失网页素材。

原程序云气、接地影、远山淡墨与题字背衬采用径向 UV 渐隐并混合透明 BSDF。直接取底色会变成实心矩形，因此全部六种透明程序材质已按原渐变曲线转为 256px RGBA WebP。第四卷噪声调制以平均值替代，暖青/冷青远山中心最大 alpha 约为 .06/.075。转换脚本会核对原材质记录，若仍有未经转换的透明程序材质则报错。纸纹材质保留原 ColorRamp 平均暖色，细密噪声由网页纸纹补充。原画 RGB 使用无光照材质展示，避免浏览器灯光改变绘画颜色。

## 文件与数据

- `public/assets/chapter-{1,2,3,4}/scene.json`：各卷网格、材质、纹理清单、原摄像机采样、阅读分镜、原文字和五个动画图层的矩阵采样。
- `public/assets/chapter-*/textures/*.webp`：263 张透明浏览器纹理，总 104,653,306 字节（约 99.8 MiB）。最大边 2048px；原绘画纹理质量参数 88。
- `.asset-cache/chapter-*/*.source`：257 份转码前原始图像字节，共约 526 MiB。已移出 public，不会发布；源 blend 已打包或源素材目录仍可恢复。此目录应忽略版本管理。
- `reports/assets-audit.json`：原场景对象、图像、动画、分镜和摄像机审查。
- `reports/assets-export.json`：导出数量、恢复纹理及缺失检查。
- `reports/assets-procedural.json`：原程序材质节点与渐变证据。
- `reports/assets-stats.json`：实际几何、下载体积和纹理内存估算。
- `reports/validation-assets.json`、`reports/validation-assets.md`：完整资产数据核验结果。
- `reports/assets-reference-chapter-*.png`：四卷第一个原阅读节点的 960×540 Blender 参考图。使用原几何、相机和原程序透明，图像颜色转为无光照，以便与网页核对。

`scene.json` 的 `meshes` 每项包含 `positions`、`uvs`、`indices`、`matrix`、`material`、`bounds`。索引化无损去除了重复的顶点与 UV，四卷 JSON 从约 120.6 MB 降至约 44.9 MB。`materials[].texture` 和 `images[].src` 都相对于所在 `scene.json`。`stops` 直接来自原时间轴含“阅读”的 markers，不增编分镜。`isText` 标记原 FONT 网格；第三卷横排长文也保存在 `textObjects` 中，网页可在文化抽屉显示。

## 相机与内容注意事项

- 第二卷最终收卷动作从 frame 5521（原进度 0.9055118）开始，摄像机从约 z=3.4 拉高到 z=24。阅读主轴是 X，不能把这一结尾升高误判为 Z 轴长卷。
- 第一卷 frame 13736 起为“离卷抬升”；网页可在最后阅读节点 frame 13474 之后用卷末题跋收束。
- 第三、四卷没有同类大幅离卷运动，保留原阅读路径即可。
- 第四卷卷首的较大横排叙述文字本身包含在原 `01_text_palace.png` 绘画图层内，并非独立 FONT。为保留原宫苑构图，未擅自擦除或改画。网页新增题字与文化说明仍可独立调整。
- 原场景由 Blender 5.2.45 格式保存，本机 Blender 5.0.0 能成功读取并导出，读取时会提示版本较新。全部已用图像、矩阵、几何和相机数据经过独立校验。源工程保持原样。

## 重新导出

在项目根目录的 PowerShell 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-export.ps1
```

需要同步重新渲染四张 Blender 参考图时：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-export.ps1 -RenderReferences
```

脚本默认使用 `F:\Blender\blender.exe` 和本机 Codex Python（含 Pillow）；可通过 `-Blender`、`-Python` 参数替换。需 Node.js 运行最终资产校验。完整流程：审查→程序材质记录→提取→几何索引化→WebP 编码→透明程序纹理恢复→统计→校验。原图重编码需要数分钟，缓存存在时可跳过已成功生成的相同 WebP。

单独执行步骤可使用 `scripts/export_blender.py`、`optimize_geometry.py`、`optimize_textures.py`、`restore_procedural.py`。若修改了源图片但字节发生变化，会自动生成新的内容哈希文件名。

## 性能依据

RGBA8 加完整 mipmap 的整卷纹理最坏驻留量约为 788 / 251 / 503 / 366 MiB。按原阅读点、16:9 视野与 1.45 倍预加载范围保守估算，在视纹理约为 57–150 / 53–109 / 44–89 / 29–65 MiB。网页应按在视图层加载并在章节切换时释放，不应同时预加载四卷全部纹理。WebP 下载压缩不等于 GPU 纹理压缩，以上估算已按解码后像素计算。

当前保留了真实细分网格和原字体轮廓，第三、四卷 JSON 相对较大。如未来正式部署需进一步减小首包，可把 position/UV/index 数组转成分镜级二进制块，或加入纹理 KTX2；现有数据结构支持继续细分导出。
