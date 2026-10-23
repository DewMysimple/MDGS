# 首次C8导览的独立失败核验

本次真实录制位于`tmp/exhibition-tour-candidate8/2026-10-23T04-14-51-310Z`。固定检查器`e6a9a58bffba9e09768bb679b9edbc30003aed067c662d8e0f101e496a04e481`完整35 required实际34通过、1失败；另1项端点观测required:false。`validation.json`的failed保持原字节，影片、原始PCM、帧文件与清单未修补或回填。这不是可接受的最终影片。

唯一失败为`all-source-frame-files-present-and-timestamps-strict`。独立拆分结果：`frames.json`4172条，首末时间严格递增，所有列出的JPG均存在，首epoch与report一致；但目录实际4173份JPG，`recording.json.video.frames`4173且末epoch为004172的1792729061.028711，JSON实际最后004171为1792729060.900816。ffconcat包含4172份唯一源帧和重复末帧004171，未包括004172。

原录制器在`Page.stopScreencast`后依次await写盘，仍接收inflight CDP事件。实际多出的004172在JSON/concat快照之后追加，而report随后读取同一可变frames数组，因此末帧与计数漂移。没有据此篡改原始JSON、删除JPG、补帧、改PCM或放宽35项。root正在仅修新录制器的结束边界和一致快照，新版本必须重新录制；产品C8及已通过的soak/六套/保真不因此改变。

其余34项required含显式C8包身份、归档录制器SHA、实际PCM所有包SHA与逐量子指纹、样本/字节/原生时钟计数、完整关闭、有限/无削波、字幕对应及容器元数据均通过。独立编码解码属于另一份报告，解码成功不能覆盖本项失败。数值完整性也不代表人类审美或原画显示FPS认证。
