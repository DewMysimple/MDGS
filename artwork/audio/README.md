# 原创声景制作档案

本目录保存自创声音的试听与未选用候选，不随 Vite 的 `public/` 运行目录复制部署。没有移入、改写或删除用户既有音频。

- [v3 三轨同位试听](peony-v3-audition.mp3)：三轨的完整混合预览，不等同网页随场景变化的混音。
- [v2 候选](candidates/v2/peony-courtyard-v2.mp3)：研究阶段的单轨实验，另附同目录乐谱与来源说明。
- 当前选用的三条独立轨、乐谱及来源元数据仍在 `public/audio/peony-v3-*`。

重现：`python scripts/create-peony-music.py --edition v3`。v3 试听输出到本目录；`--edition v2` 输出到 `candidates/v2/`，避免重新把候选放回运行目录。上述内容均为原创数字合成，不是真人器乐演奏或古乐复原。

制作与验证见 [v3 声景说明](../../reports/art-renewal/audio-v3-notes.md)。
