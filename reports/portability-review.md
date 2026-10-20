# 启动冲突、可移植性与自适应验收

核实日期：2026-10-19。环境：Windows、Node 24.16.0、Vite 6.4.4、Chromium headless。Git 基准 `main@9f632a0`，验证对象为其上的本地整改；开始时已有未跟踪的 `runStart.cmd`。本轮未提交或推送。

## 修复结果

- 原 Vite 固定 5173 且 `strictPort:true`，该端口被另一工程使用时启动失败。开发默认由系统分配空闲端口；预览使用端口0。Vite 6开发模式会把0视为默认端口，因此配置先向系统获取候选，随后交给Vite，极小竞争窗口由占用回退处理。显式 `--port` 仍可用。
- 工程根按配置/启动器自身位置解析。启动器检查Node/npm/依赖，自动打开实际地址，无固定浏览器尺寸。JS公共资源跟随BASE_URL，生产构建使用相对base，CSS资源由Vite重写。
- 移除整页960px宽、850px高及画卷550px高的固定下限。画卷按动态视口分配，窄窗重排原有导航/控制，短屏滚动兜底；卷末卡片、文化抽屉适应容器。
- Blender工具共用 `asset_config.py`，工具从参数、环境变量或PATH发现，源工程/素材位置通过参数、环境变量或本机JSON配置。配置与帮助检查可在不安装Blender时执行，默认参考渲染采用源尺寸。原场景、相机路径与公开资产未修改。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| `npm run build` | TypeScript与生产构建通过 |
| `npm test` | 四卷连续路径、分镜顺序、结束帧与原几何不变通过 |
| `npm run validate:assets` | 263张纹理、四卷0错误0警告 |
| `npm run test:startup` | 外部cwd、两个dev实例、占用端口回退、两个preview实例与实际HTTP标题/纹样通过；测试实例已清理 |
| Windows启动器 | 从临时工作目录真实cmd/npm/Vite启动，参数透传与实际URL正确，测试禁用自动弹浏览器；其他工程5173服务持续运行 |
| 生产子目录 | 多层子目录访问四卷、SVG图片、CSS纹样和文化抽屉通过，页面错误/资源404均0；见[报告](validation-portable-subpath.json) |
| 自适应 | 1920×1080、1440×900、1280×720、960×600、800×500、620×360、375×667、320×568、1200×240均无横向溢出或控件裁切，画布匹配容器；见[报告](validation-responsive-ui.json) |
| 短屏交互 | 卷末内部滚动后切下一卷、文化抽屉Escape关闭与焦点还原、文档滚到控制区均通过 |
| 资产工具配置 | Python静态编译、PowerShell5.1语法/帮助、跨cwd和中文空格目录、CLI/环境/JSON路径、缺源/缺工具提示、章节选择、重名素材匹配、检查前后源字节不变均通过 |
| `git diff --check` | 通过 |

截图见[常见桌面窗口](screenshots/responsive-1440x900-start.png)、[窄窗](screenshots/responsive-375x667-start.png)、[短屏卷末](screenshots/responsive-620x360-card-actions.png)及[子目录构建](screenshots/portable-subpath-1280x720.png)。

本报告的启动整改阶段当时尚未配置原Blender文件与工具；配置检查使用临时占位源文件，不证明Blender导出成功。浏览器自动化隔离可选外链字体，未覆盖其他浏览器、实体移动设备、跨显卡性能或正式部署。历史manifest/报告里的来源磁盘路径保留作溯源信息，不参与运行定位。

2026-10-20四卷重构收尾重新通过 `npm run build`、`npm test`、`npm run validate:assets`、`npm run test:startup`。`npm run test:subpath` 对最终生产构建验证四卷新增58/26/34/34世界层和1/1/4/2文字层从多层子目录加载，并实际检查滚轮、拖拽、键盘、分镜、自动展卷/暂停、轻动开关、全屏、进度Home、抽屉Escape与焦点恢复，0页面错误/0本地404。后续原源审查与四份派生Blender保存/重开另见[本轮重构交付](reconstruction/README.md)。
