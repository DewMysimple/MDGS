---
type: moc
status: active
updated: 2026-10-21
topic: memory-entry
sources: []
---

# 工程记忆导航

模式：`lite`，由 Agent 于 2026-10-19 按用户指定的 wiki-memory 3.2.0 技能选择。依据：当前是一个 React/Vite 前端交付物，Blender 导出属于同工程资产管线，没有独立服务或部署边界。一页状态可以承担日常恢复，稳定细节按需读知识页。

开始任务先读本页、维护协议和当前状态；涉及装裱或场景时，再按下方索引定位知识和有效决策。需要来由时才检索日志。事实与验证范围以来源为准，接续时重新检查 Git 工作区。

- [记忆维护协议](AGENTS.md)
- [工作日志 MOC](日志/MOC_工作日志.md)

在工程根运行维护工具：

```powershell
python wiki_memory/工具/memory.py index --project . --apply
python wiki_memory/工具/memory.py check --project . --require-ready
```

本工具与协议已复制进仓库，后续不依赖原技能安装路径。README 仅作导航，当前事实统一在状态页和专题页维护。

<!-- wiki-memory:auto:start -->

## 当前状态

- [[当前状态/当前状态.md|当前状态]] — active

- [[决策/MOC_决策.md|工程决策目录]] — 3 页，按主题或模块检索。
- [[知识/MOC_知识.md|稳定知识目录]] — 2 页，按主题或模块检索。

<!-- wiki-memory:auto:end -->
