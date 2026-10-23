# 保真驱动适配预检

此目录属于驱动修复与兼容性预检，不代替最终冻结生产构建的完整 59 帧保真验收。

- `validation-structural-gbk-failure.json`：主任务首次失败报告的原字节归档。Node 的资源哈希成功，Python 在 `Image.open(web)` 因中文绝对路径损坏而 FileNotFound。它不是资产缺失或像素保真失败。
- `validation-structural.json`：给 Python 显式添加 `-X utf8` 后实际重跑，四卷、243 张原图的全分辨率 RGBA 与原始缓存完全相同；`status=structural-pass`，不声称视觉验收。
- 上级 `fidelity-path-encoding.json`：实际跨语言路径探针。默认 Python stdin 为 GBK、Unicode roundtrip/exists 均 false；显式 UTF-8 后均 true，并成功完整解码同一 WebP。
- `contact-compat/`：用旧有效 59 帧记录测试 contact 工具的新输出参数与 UTF-8 路径，仅证明工具兼容。图像并非本轮新 UI 的最终采样。

适配保留所有 59 张原生参考帧和原像素阈值：RGB MAE ≤2、p99 最大通道误差 ≤12、误差超过20的像素比例 ≤0.005、alpha 最大误差0。没有重新渲染、改写或删减原生参考。

新增 `--dist-dir` 与 `--report-dir` 可将当前构建及证据隔离到独立目录。独立内存 Vite 重建、当前全部 src 哈希、产物 JS/CSS/原画资源字节、实际浏览器 HTTP 响应绑定仍全部强制。懒加载、在画心像素测试中没有执行的导出组件 chunk，仅明确记录为 `bindingOnlyHTTPProbes`，不会声称其 UI 已执行。每轮截图与 contact 放入唯一 `runs/<runId>/`；被替换的顶层 JSON 进入 `history/<newRunId>/`，失败证据不会因下次成功而消失。

旧主路径 `reports/peony2-fidelity/validation-structural.json` 已逐字节恢复 HEAD 的历史有效版本。当前成功预检留在本目录；最终正式验收前，不以本预检覆盖旧输入证据。
