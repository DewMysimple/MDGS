# C8 播放器兼容副本：最终结果

原始录制master与35项审计保持独立。最终latched master为 `tmp/exhibition-tour-candidate8/2026-10-23T04-25-57-135Z/国色长卷-导览录像.mp4`，SHA `9f4d50dc9d9e183ec4641baa629d8a4a52ff245b5db0e9267c3debe18bfc0306`；播放器兼容副本为 `tmp/candidate8-player-compatible/2026-10-23T04-32-21Z/国色长卷-播放器兼容副本.mp4`，SHA `dac7d924ce7d6f7e18fb9141a1e57a6b312b60425e94029c0c9593e5643e050d`，154511713字节。Root交付别名为 `reports/art-renewal/国色长卷-导览节选.mp4`；原始master另交“原始导览录像”，不把转码副本冒充原录制器原字节产物。

第一次实际Chrome视频解码与普通FFmpeg frame90色差MAE14.5387、p99=28，保留于上级 `2026-10-23T04-22-13Z/`。原图像像素及SPS表明原MP4为full-range BT601，primaries/transfer未指定，Chrome显示比原录制JPEG及FFmpeg更亮。该观察支持处理色彩信号与元数据兼容性；不泛称所有Chrome或所有full-range影片都有缺陷，也不修改失败阈值。

另存副本采用 `scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p`，H264 veryfast/crf15，显式limited-range BT709原色/传递/矩阵，AAC packet copy。完整实际命令与首末SHA见 `compatibility-provenance.json`。视频并非无损转码；它是播放器展示兼容副本，原master仍完整保留。

实际Chrome156、本地HTTP206 range、暂停video.currentTime=3.0001且seeked后drawImage原1920×1080 canvas，对同副本FFmpeg明确select=eq(n,90) RGB参考。原MAE≤3/p99≤12不改：**11项通过，MAE1.2125477431，逐像素最大通道差p99=8，RGB池p99=5**。两张PNG均实际打开审视，纸色、花瓣和字墨相近，画幅完整；root也独立看图接受。没有试听或称作音乐审美验收。

严格全片音视频解码 `-xerror -err_detect explode -map 0:v:0 -map 0:a:0 -f null -` 实际exit0、stderr空；进度到4982帧且progress=end。副本与最终master帧数4982、1920×1080、30/1、视频时长166.066667秒全部相同；AAC packet SHA `dd6042e75f553eeaaeb9206b465ad441985b15909c65ad3b3fdbb505524da6c0` 完全一致，master字节SHA不变。未裁切、加帧、补声、改变游观/作者时钟。

颜色driver只针对同一视频解码及全幅，不代替原生59帧；兼容driver仅增加显式 `--video-file` 输入，全部色差/尺寸/seek/媒体错误断言与首次driver相同。原产品、冻结包、原录制脚本及原视频未改。Chrome与HTTP server均已关闭，GPU/source均释放；本目录封存后停止写入。
