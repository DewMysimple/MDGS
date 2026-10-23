# 候选 7 诗意与紧凑观卷复验准备

状态：等待 root 统一冻结及 GPU 窗口；**本文件不是通过报告**。不自行 build，不修改 src/public。C6+临时CSS原型独立保存在 `../compact-layout-prototype/`，不替代正式 C7。

收到实际冻结目录及 `art-candidate-7-build.json` 后，新建唯一运行目录；先校验全部 sourceInputs 与完整 code/font/provenance，再执行。运行结束逐一复核同一输入与驱动 SHA，关闭浏览器/临时字体HTTP/预览后明确释放。保留 C3/C4/C5/C6 历史原身份，不沿用旧包结果。

既有7个驱动保持字节不变，沿用 `font-fallback/candidate-4-qa-plan.txt` 的显式 build/URL/report 参数：

1. `poetic-narrative/validate.cjs`：37纯数据、45句与25原文、40源停点。
2. `poetic-narrative/verify-browser.cjs`：270排版、原文/静观/诗意模式及保存、标点接触原样保留；必要时同包执行既有标点专项。
3. `poetic-narrative/verify-playback.cjs`：四卷原速全长45句，出现与阅读锁位；不能以 seek 代替。
4. `poetic-narrative/verify-placement-lock.cjs`：12个暂停/同桶/跨幅/反向/resize路径。
5. `encounters/verify-integrated.cjs`：12桌面布局、键盘入锦/重拾、展诗焦点、Esc与滚轮恢复；固定输出立即复制至本唯一run，保留旧归档。
6. `scripts/validate-art-renewal-ui.mjs --suite reading`：reading28，显式独立report/shots目录。
7. `font-fallback/verify-final-font.cjs`：字体真实HTTP/CDP与主按钮20态/年代注4布局/封印选择状态78项，显式build/report/shots/expected-font。

新增独立 `verify-compact-desktop.cjs`，不改以上冻结驱动。准备时syntax已过，尚未执行。命令：

```text
node reports/art-renewal/poetic-narrative/verify-compact-desktop.cjs --build-dir <root给定冻结目录> --freeze-file <root给定构建身份JSON> --report-dir <本次唯一run>/compact-user-viewport --url <同包preview URL>
```

覆盖：2042×1083 CSS、DPR1.25，45句×padding12/24=90字格/控制边界；三尺寸1280×720/1920×1080/2042×1083、同DPR的四卷末=12处，记录标题实际分行与留笺焦点；用户视口四遇景=4处，记录真实投影标记、纸面边界、正文收起和原诗展开。截图记录PNG实际物理尺寸，不能把近似CSS视口冒称与用户2552×1354逐像素相同。

新增driver只判断机械边界，不自动宣称不挡人物/原诗；另逐一看实际四卷末、四遇景及关键短章PNG，写具体艺术遮挡审视。C4@1280预计源侧纸边约214.6px，在210阈值下题跋纸宽约182.6px，重点查四字标题是否3+1断行、动作换行与正文是否可读；在正式freeze前另做短dev probe，任何CSS临时试验单列而不混正式通过。

冻结前不填写运行数值、pass或最终包SHA。任何失败保存现场，先报root，不改阈值或把截图静态推导当运行证据。
