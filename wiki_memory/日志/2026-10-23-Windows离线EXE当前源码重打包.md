---
type: log
status: archived
updated: 2026-10-23
topic: windows-offline-exe-current-source-rebuild
kind: feature
task_status: completed
sources: ["scripts/package-desktop.mjs", "scripts/package-exhibition.mjs", "reports/art-renewal/exhibition-package.json", "reports/desktop/package.json", "reports/desktop/validation.json", "reports/desktop/portable-validation.json", "用户指令：2026-10-23 要求把网页工程及浏览器内核依赖打包为EXE，并交付ZIP与实际解压文件"]
---

# 当前源码重打 Windows 离线 EXE

用户要求网页工程及浏览器内核、运行依赖打包为EXE，并把压缩包与真实解压文件同时放在桌面“数字牡丹赋”。开始时 main 指向 c10b68c，工作树干净；桌面目标目录存在但为空。旧构建库存的 NarrativeCalligraphy.tsx SHA 与当前源码不一致，交付脚本拒绝将旧构建作为当前版本。按当前源码完整重建，未改写原画或网页行为。

## 交付与构建

执行 npm run export:desktop -- --output "C:\Users\Administrator\Desktop\数字牡丹赋"。Vite转换1649个模块，展览库存363个文件、540.71MB，Electron Builder构建Windows x64便携单文件。应用包含Electron 45.0.0、Chromium 156.0.8078.48、Node 24.22.0、全部选用网页/原画/字体/声音资源，可离线运行。

目标目录现含 数字牡丹赋-Windows-x64.zip（623143921B，SHA-256 a32e795138f8de893cebad0cc5ee6e28eba5a1976c66e0aa99ce2a413ed6b956）和实际解压目录 数字牡丹赋-Windows-x64/。解压目录含 数字牡丹赋.exe（623141074B，SHA-256 878eec1fd16e958bf0bbb4e81206babb8c64347d0d175e9d844a9afcc8c447c7）、运行说明与交付清单。7-Zip CRC测试通过，解压三个文件SHA与清单一致。

## 验证

在Windows本机以 main 源revision c10b68c 执行 npm run test:desktop -- --executable "dist-desktop/win-unpacked/数字牡丹赋.exe"：11/11通过，覆盖Electron/Chromium/Node、360项资源SHA、mdgs协议安全边界、断网首页/字体/四层花景/声音、四卷真实画面与文字、PNG原生保存、F11/ESC以及无外部依赖请求。

执行 node scripts/validate-portable-desktop.mjs --executable "C:\Users\Administrator\Desktop\数字牡丹赋\数字牡丹赋-Windows-x64\数字牡丹赋.exe"：7/7通过；便携释放资源与验收主机SHA一致，断网首帧与声音正常，父进程退出码0且临时释放目录自动清理。验证运行时为 Electron45/Chromium156/Node24；不是跨设备完整像素认证。EXE未签名。

为运行项目QA脚本，Playwright 1.55.0只装在被Git忽略的 tmp/desktop-qa/，没有加入网页或EXE的运行依赖。构建只更新展览、桌面交付和验证报告；未将二进制交付文件提交Git。