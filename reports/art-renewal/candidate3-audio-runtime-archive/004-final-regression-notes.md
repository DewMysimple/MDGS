# 统一候选3的桌面完整回归

实际选用`tmp/art-candidate-3-dist`，JS `index-C6ZfivTN.js` / CSS `index-Bc7VfaY-.css`；HTML SHA256为`806eb52d8a41bcc4774d1253902b58fecc4734225d77b6f889f6ec726410a769`。先在这一包重新完成两轮真实原速演播，再在同包串行执行六套回归，未在验收途中重建或替换包、修改产品或驱动。完成于2026-10-23上海06:47:20。

权威入口为[`final-regression-latest.json`](final-regression-latest.json)，指向[`final-regressions/2026-10-22T22-32-44-628Z/validation.json`](final-regressions/2026-10-22T22-32-44-628Z/validation.json)。六套全部通过、原生子进程退出码均0；824项产品、5项生产HTML/JS/CSS、9份验证入口/driver在整个六套期间前后hash一致。每套报告、日志、旧driver执行快照与图片均保留独立路径，没有覆盖早期默认UI/声音报告或失败记录。

| 检查 | 实际结果与范围 |
|---|---|
| 原速演播/生命周期 | 796.627秒、四卷两轮、21组通过；40核心/824产品/333原画与音乐资产前后稳定，详见[方法与历史](soak-method.md)和[本次原档](soak/2026-10-22T22-18-57-289Z/validation.json)。 |
| 桌面艺术界面 | 83/83：首页23、四卷文化阅读28、题跋/花笺32；六视口、真实画层失败重试/可选GL丢失、全文/来源/焦点、4张1200×1600 PNG与20轮seal/again。 |
| 原创数字声景 | 15/15：实际三轨、主动启声、资源失败重试、全站连续时钟、实际阅读降声、第四卷撤亮色、后台信号/淡出/取消生命周期。 |
| 原作模式运行 | 34/34：1672×941与1280×720，80次源节点、118次实际响应排版段；25段验收转录字符完整、源零替换、末帧停绘、实际滚轮/拖拽/键盘、本地楷体、三轨释放。 |
| 旅程 | 9/9：四卷真实展开/返回、4秒展示、首页生命周期、慢纹理等待、实际封面503/完整重试、旧manifest取消、声音失败与返回连续性。 |
| 设置 | 18/18，191帧取样：默认诗意→显式原作，四卷参数/底板/持久化、桌面布局、恢复默认、实际WebGL丢失/恢复、后台和损坏存储。 |
| 嵌套子路径 | 1个综合检查完整遍历四卷；实际源场景/材质/纹理/封面/字体/三轨、焦点/输入/全屏，0资源失败、0页面错误。 |

另实际打开当前1280×720首页截图与第四卷下载花笺，未发现文字越界、缺字或层级遮挡。图片、日志、报告、归档副本和长测8张卷末截图共177份文件在结束后逐一复核SHA，0不匹配，见[`artifact-recheck.json`](final-regressions/2026-10-22T22-32-44-628Z/artifact-recheck.json)；这一步是字节复核，不冒称另一次功能重跑或重新绑定源码。

复现时先设置`MDGS_PLAYWRIGHT_MODULE`和`MDGS_TEST_BROWSER`为本机已有依赖；在产品和该包冻结期间执行：

```text
node scripts/validate-art-renewal-soak.mjs --build-dir tmp/art-candidate-3-dist
node scripts/validate-art-renewal-final.mjs --build-dir tmp/art-candidate-3-dist
```

最终入口不提供默认包，先要求最近成功soak与当前全部产品/包hash一致；`--plan --build-dir <包路径>`只显示独立路径和命令，不执行浏览器。UI、声音、四类历史回归还可分别通过各自脚本复现，完整命令与退出码保存在总JSON，不使用脆弱的运行时字符串adapter。

边界：本机Windows/Chromium156的桌面实测；不是其他浏览器、实体音箱审美或完整WCAG认证。visibility检查注入浏览器document.hidden信号，不冒称真实操作系统切后台。JS堆和应用纹理预算均不是VRAM；原生像素保真、启卷取消严格几何与45句当代诗意排版各有独立专项，本报告不替代它们。原文比较依据已验收25段转录，未重新读取工作区不存在的原DOCX。早期候选2成功长测及其取消缺陷、两次harness失败原档均保留，未把历史hash替换成当前hash。
