# 2026-10-23 冻结生产回归

后续候选3已在统一冻结包完整重跑59/243RGBA/结构、37启卷、15+24续看、22展示包；有效入口见 [统一候选验收](art-candidate-notes.md)。本页保留04:18–04:25历史基线，顶层当前报告已更新为后续真实运行，旧字节在本页所列归档内。

**阶段基线，非后续产品当前验收。** 主任务在本轮之后继续修订花笺焦点/字体、清理未采用原型并评估短章模式。这轮59帧与37组仍证明当时的冻结字节；不能沿用于后续版本。原始 JSON 与会被下一轮覆盖的启卷截图/录像已复制到 `fidelity-baseline-2026-10-23/`，`archive-map.json` 记录原路径、归档路径与逐文件 SHA256。下一次集中修订结束后再完整冻结重跑。

本轮实际冻结区间约北京时间 04:18–04:25；入口为 `fidelity-final-freeze.json`。828 项 `src`、`public` 和构建配置的运行前后 SHA256 完全一致。只修改验收驱动与报告，没有调整产品、原画、原生参考或阈值。

| 范围 | 实际结果 | 有效入口 |
|---|---|---|
| TypeScript 与独立生产构建 | 通过，入口 `index-Bor-xIou.js` | `tmp/fidelity-art-dist`，正式生产模式，非 dev |
| 四卷结构与原图 | 四卷/243 原图，全分辨率无损 RGBA 逐字节一致 | `reports/peony2-fidelity/validation-fidelity.json` |
| 原生画面 | 59/59 帧、0 错误 | 同上，`visualPassed=true` |
| 实际浏览器输入绑定 | 268 个 HTTP 响应及源码/生产文件/原画输入哈希核验通过 | `reports/peony2-fidelity/browser-captures.json` |
| 启卷生产总验收 | 37 检查组、0 错误，102 项源码/驱动/相关资产前后一致 | `unfurl-acceptance.json` |

当前包包含入口 JS、Three.js 独立 chunk、懒加载花笺导出 chunk 和 CSS。花笺导出在画心像素测试中没有执行，因此只将其明确记录为 HTTP 完整性探针；交互执行范围由单独 UI 验收覆盖。实际浏览器为 Chrome 156.0.8078.47；启动参数仅允许 SwiftShader fallback，历史 run 未采集 GL renderer，故不能将其写成实际软件后端，也不能推导 Firefox、Safari、移动设备或跨显卡性能。

原严格像素阈值没有降低：MAE ≤2/255，p99 最大通道差 ≤12/255，通道差>20 的像素比例 ≤0.005，alpha 最大差0。各卷最差 RGB MAE 为 1.487709 / 0.776465 / 1.161172 / 0.775821；p99 最大值为 10 / 7 / 8 / 8。59 张原生参考没有重渲染或改写。

新截图/contact 位于 `reports/peony2-fidelity/runs/2026-10-22T20-18-07-131Z/`。上一轮有效 JSON 已保留于 `reports/peony2-fidelity/history/2026-10-22T20-18-07-131Z/`，其旧 `browser/` 和顶层 contact 未被覆盖。真实 GBK 路径失败原字节另存 `fidelity-adapter-preflight/validation-structural-gbk-failure.json`，修复后的成功预检独立保留；不是通过删掉失败来获得通过。

启卷第一轮报告存在事后指纹和失败后可能残留旧 passed 的证据链缺口。最终总验收重新运行所有37组、严格检查子进程退出与新报告时间、独立复现生产构建并核验同服务器 HTTP 字节，绑定全部截图/录像与子报告哈希；旧局部 JSON 标为 `unfurl-history/<runId>/previous-*`，不冒称历史运行已有完整输入绑定。

驱动修复将 Python 子进程显式设为 UTF-8，解决 Windows GBK 读取 Node UTF-8 JSON 后中文路径损坏的问题。新增 `--dist-dir`、`--report-dir` 和每轮独立截图目录，保持完整帧集和阈值。复现命令：

```text
npx tsc -b
npx vite build --outDir tmp/fidelity-art-dist
node scripts/validate-peony2-fidelity.mjs --capture-browser --dist-dir tmp/fidelity-art-dist --raw-cache <已验证原图缓存目录>
node reports/art-renewal/unfurl-acceptance.cjs
```

浏览器/Python 配置通过既有 `MDGS_PLAYWRIGHT_MODULE`、`MDGS_TEST_BROWSER`、`MDGS_PYTHON` 提供；启卷总验收用 `MDGS_UNFURL_DIST` 指定生产包。产品在本轮之后发生修改时，这一冻结版本仍是有效历史，但不能继续标作修改后“当前源码”的通过证明。需要重新运行，而不是只替换报告指纹。
