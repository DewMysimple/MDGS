# 独立展示包 · 工具与运行验收

这份记录对应 `art-candidate-2`，不是用户十小时艺术迭代的最终结束。正式包由主任务生成；验收脚本只读取/启动它，没有替换或写入展示目录，没有处理用户原素材。

有效入口为 `exhibition-validation.json`，runId `2026-10-22T21-56-29-220Z`，22组全部通过。所测包为 `dist-exhibition`，库存 SHA256 为 `56bc9beea43c41e3fdc9029254c2549daaeee5f98c0f2167fdc137659fb228de`，测试前后完全相同；361个库存文件共540655727字节，不含库存文件本身。当前主 `dist` 与独立候选 `tmp/art-candidate-2-dist` 的入口均为 `index-BmVq5_Bq.js` / `index-Bc7VfaY-.css`。

## 实际覆盖

11组工具安全测试全部在新建 `tmp/exhibition-tool-smoke/<runId>/` 夹具内执行：正常原字节复制；无marker的输出/暂存目录拒绝覆盖；两个真实并发导出进程的第二个被独占锁拒绝；dist根、public根、public父目录、public单文件、dist单文件、目标目录和暂存目录的链接均拒绝。所有外部sentinel保持原字节。正常夹具明确使用 `--skip-build`，并断言 `buildSourceVerified=false`；并发夹具使用明确命名的构建屏障stub，不把这些夹具当成生产构建证明。夹具全部保留，没有递归删除清理。

实际展示包先核对闭合库存、当前选用public原字节及生产文件，再启动包内 `serve.cjs`，工作目录在包外。361个HTTP响应分别与库存 SHA256 相同。另测普通JSON、普通HTTP gzip、`gzip;q=0`、HEAD、ETag304、越界路径和畸形路径；原 `.f16.gz` 保留gzip magic及原字节，不重复标注HTTP `Content-Encoding:gzip`，可正常解出原程序场。

真实 Chrome156.0.8078.47、1920×1080 完成首页四个图层、本地文楷、三层原创数字声景、四卷卷首/中段/卷末、四种画中参与、原作全文阅读，以及花笺懒加载、钤印和实际1200×1600 PNG下载。浏览器0页面异常、0失败请求、0 HTTP404、0外部运行资源请求；文化资料链接保留为观者主动查看的出处，不是离线运行依赖。此轮实际 GL 为 ANGLE / NVIDIA GeForce RTX5070Ti / D3D11，记录来自本次上下文，不用启动flag推断后端。

截图、实际录屏、下载PNG、子进程日志及逐文件SHA保存在 `exhibition-validation-runs/2026-10-22T21-56-29-220Z/`。测试结束再次核对所有361文件和库存，均未变化。

## 失败历史与边界

最初独立包尚未集中冻结。第一次完整交互通过，但主 `dist` 已被后续构建替换，旧chunk不在当前目录；该版本关联失败保留。第二次测试期间实际展示目录被重新导出，库存从 `b9db5408…` 变为 `56bc9bee…`，旧页面请求旧花笺chunk得到真实404。验收如实失败并保留截图、网络记录和旧JSON；不能把它记作无缺失。主任务确认了重导时间，固定新包后才重跑本轮22组。

驱动默认将可变主 `dist` 关联列为独立诊断，便于查验历史独立包；集中冻结时设置 `MDGS_EXHIBITION_REQUIRE_CURRENT_DIST=1`，开始和结束均严格要求主dist匹配。**本轮已开启此严格设置，差异为0。** 后续改变产品、主dist或展示包时，这轮仍是已测候选的历史证据，不是修改后版本的通过。

只验收当前桌面Chrome及上述交互范围；没有声称跨Safari/Firefox/移动设备、未安装Node的电脑、任意静态主机或原生像素全部通过。原画59帧、源RGBA与启卷接力另由统一候选回归记录绑定。

```text
node scripts/validate-exhibition-package.mjs
node scripts/validate-exhibition-package.mjs --suite safety
node scripts/validate-exhibition-package.mjs --suite runtime --package-dir dist-exhibition
```

使用既有 `MDGS_PLAYWRIGHT_MODULE` / `MDGS_TEST_BROWSER` 指定测试依赖；包本身的运行只需要Node内置模块及现代桌面浏览器。统一候选总入口为 `art-candidate-2-freeze.json`，总驱动不执行会覆盖冻结dist的构建。
