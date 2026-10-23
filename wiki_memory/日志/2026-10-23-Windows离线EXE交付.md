---
type: log
status: archived
updated: 2026-10-23
topic: windows-offline-desktop-delivery
kind: feature
task_status: completed
sources: ["desktop/main.cjs", "electron-builder.config.cjs", "scripts/package-desktop.mjs", "scripts/validate-desktop.mjs", "scripts/validate-portable-desktop.mjs", "reports/desktop/package.json", "reports/desktop/validation.json", "reports/desktop/portable-validation.json"]
---

# Windows 离线 EXE 交付

用户要求：网页工程连同浏览器内核及全部运行依赖打成 EXE，在桌面“数字牡丹赋”交付 ZIP 和实际解压文件。基线 main `1e9ba8b`，开始时工作区干净。

Agent 选择 Electron 45.0.0 / electron-builder 26.15.3 的 Windows x64 单文件便携目标。内置 Chromium/Node、四卷全部资源、三轨 MP3、本地字体及许可，不需要系统安装 Node/浏览器或启动外部服务。`mdgs://app/` 固定来源读取 resources/web，保留设置；沙箱、隔离与外链主动点击限制在桌面壳实现。F11/ESC、PNG 原生保存对话框已实现。EXE 首次启动释放运行文件到临时目录，无管理员安装步骤。

审计补齐原展示包 CSS 引用的两项本地 SVG：peony-line/roller-band。未改写原画、模型、声音、源时钟或网页交互。新增开发期依赖与构建脚本；源素材/缓存/安装工具/生成 EXE 均不提交 Git。

## 已完成验证

- `node scripts/validate-exhibition-package.mjs --suite safety`：11/11 通过；锁、未标记目录、链接与复制校验均过。
- TS/Vite 构建与展览原字节复制校验通过，363 文件，约540.71MB。
- 实际 `win-unpacked/数字牡丹赋.exe` 完整验证11/11：360内置资源SHA、Electron/Chromium/Node版本与隔离、协议MIME/原生gzip/路径边界、禁HTTP外网下首页4层/字体/3轨音频、F11/ESC、四卷中点/遇景/全文/卷尾及1200×1600花笺真实原生下载。零页面错误、404和外部依赖请求。报告 `reports/desktop/validation.json`；只覆盖本机 Windows/RTX5070Ti。
- 最终桌面便携EXE实际启动7/7、驱动exit0：真实释放的app.asar/网页库存SHA匹配上述构建，禁HTTP外网下首页/字体/声音/首卷正常；NSIS父进程exit0、遗留owned进程0，释放目录自动删除。报告 `reports/desktop/portable-validation.json`。初次验证驱动的Electron环境变量/F11焦点/CDP关闭等待问题已修复，最终两份报告均为完整重跑结果，不以中途局部成功充当通过。
- ZIP经7zip完整性检查及Python独立CRC检查，三个解压文件逐SHA匹配，中文成员名正确。EXE未签名；未提供签名证书，未声称已签名。

## 交付与恢复

桌面“数字牡丹赋”目录下已生成 `数字牡丹赋-Windows-x64.zip` 与实际从它解压的同名文件夹（含EXE、运行说明、交付清单）。EXE 623137732B、SHA `3d344dfe613f4a0e073b20137e61f78ece5f6beaa9988354ebc53ece7be60ca9`；ZIP 623140579B、SHA `63cf6eea7202d7b58d5e2fd5cf9a73829e1ed528ac0daf2ab08e5d7c6beb2d6c`。完整路径/校验见 `reports/desktop/package.json`，本机交付不等于把二进制上传Git。

首次制作工具下载遇缓存rename EXDEV，脚本改用已安装7zip路径与工程tmp工具缓存，并显式准备Electron发行目录。本次从同一已验收win-unpacked继续生成portable，再用`--deliver-only`校验源快照与asar后交付；最终便携运行验收又将EXE绑定到真实释放资源。

后续全量制作：`npm run export:desktop -- --output <空交付目录>`；断点续交可加`--deliver-only`，但必须重跑最终portable验证，不能单凭旁边win-unpacked推断便携EXE身份。脚本拒绝覆盖同名现有交付，保留用户文件。桌面版本为Windows10/11 x64，默认设置保存在用户应用数据目录；不需Node/Python/Blender或外部服务器。文献外链仍需联网，仅用户主动点击才由系统浏览器打开。

源码、配置与报告随本次Git交付，构建产物、QA截图/profile与工具缓存留本机。测试不扩展为其他Windows/GPU或Chromium156完整原生像素保真认证；原C8艺术验收范围沿用原报告，后续修改先核实当前Git状态。
