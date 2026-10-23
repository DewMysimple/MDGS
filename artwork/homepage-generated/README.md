# 首页分层画材

四幅画材由内置 `image_gen` 辅助生成，作为本作新增的原创首页构图。PNG 为工具返回文件的原字节副本，沿用仓库 Git LFS；运行时只加载 `public/ui/peony-atlas/` 下的同尺寸 WebP。WebP 仅作格式与质量编码，没有裁切、缩放或拼入参考网站图片。

| 画材 | 构图职责 | 运行文件 |
| --- | --- | --- |
| landscape.png | 青绿远山、江水、纸白与右侧园亭 | landscape.webp |
| cinnabar-peonies.png | 朱红主花、粉白侧花、花苞与枝叶；独立透明画层 | cinnabar-peonies.webp |
| title.png | 朱色「国色长卷」主标题；独立透明画层 | title.webp |
| ivory-branch.png | 左下角粉白牡丹小枝；独立透明画层 | ivory-branch.webp |

完整提示词、角色与来源声明见 [provenance.json](../../public/ui/peony-atlas/provenance.json)。调研与取舍见 [设计调研](../../reports/art-renewal/design-research.md)。参考网站用于分析节奏、材料与观看方式，没有将其图片、代码、角色或音乐嵌入本作。

网页将四层与可访问 HTML 字体分开排版；主花可选用实时着色器作湿色、显影和微风，WebGL 不可用时回退同一原图。作者原有四卷图片、几何、镜头和材质不由这些首页画材替换。

画材属于生成式工具辅助创作，不标为手绘原稿、古画扫描或文物复原。观者花笺由网页在本机重新排版上述画层与当代新题，不会上传个人信息或调用外部图像接口。
