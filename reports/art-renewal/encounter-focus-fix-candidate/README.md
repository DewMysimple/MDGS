# 遇景初始焦点：最小修复候选

本页保留候选的原理与复验方案。生成时的“未应用”身份留在 `candidate-manifest.json`；C7全部source/GPU释放、旧包备份后，已按既定C8最小计划于11:16应用，见 `application.json`。实际新包结果独立保存在 [C8唯一运行目录](../candidate-8-poetic-runs/2026-10-23T03-20-46-613Z/)，不回写为候选生成时已经通过。

真实 C7 反例：[三轮完整时间轴与截图](../candidate-7-poetic-runs/2026-10-23T02-39-01-689Z/encounter-focus-diagnosis/focus-diagnosis.json)。三轮均先出现 `aria-disabled=true` 的锦面锚点，现代码按 DOM 第一个 `.art-anchor` 自动移焦并清掉 pending；花点后到时已无 pending，两次 Enter 都落在仍 waiting 的锦面。无需增加等待时间即可解释失败。

候选只更改 `ArtEncounters.tsx` 两处查询：

```diff
- querySelector<HTMLButtonElement>('.art-anchor')
+ querySelector<HTMLButtonElement>('.art-anchor:not([aria-disabled="true"])')
```

保留全部原有流程与 active/seek/projection API。只有 waiting 锦面时，没有可交互锚点，继续保留 fallback close 与 pending；花点出现后才获得初始意图焦点。现有 projections effect 的焦点所有权判断不变：用户已经 Tab 到来源或其它控件，晚到花点不抢焦。没有固定 sleep、扩性能预算、改 UV 或为测试强行 focus。

原源码 SHA256 `265fdafa82d6433e3957f74ae268ca8720991aed322acf6fa525fcb1cb95aa1e`；候选完整源码 `f55cf6c782664968b3c67d8b5c745ab2c42cd4cf0faa59e20da08064acffaced`。二者除了两处选择器，其它字节含原换行完全相同；差异检查与 patch SHA 见 `candidate-manifest.json`。实际应用字节严格等于这份候选，旧C7文件未被改写。

应用并统一重新冻结后，用新的显式包/manifest/唯一目录执行，不能拿 C7 旧标签脚本冒新包：

```text
node reports/art-renewal/encounter-focus-fix-candidate/verify-initial-focus.cjs --build-dir <新冻结包> --freeze-file <新构建manifest> --url <该包preview URL> --report-dir <新唯一run>/initial-focus
```

该新 driver 准备时仅做 syntax 检查；实际执行状态见上述新包目录。验证要求：三轮 reduce 冷 context 与一轮普通动效冷 context 均由 fallback 等到 enabled flower，第一次 Enter picked 并移焦 cloth，第二次 Enter woven 且出现重拾；另一次冷 context 在 flower 尚未出现时真实 Tab 到来源链接，花点到齐后仍保留用户所选来源焦点；全部 Esc 后回入口。记录首次锚点、焦点、纹理队列与 phase 的真实 MutationObserver/focusin/keydown/click 时间轴，不注入 CSS、伪状态或人为资源延迟。

随后仍执行原封不动的 `encounters/verify-integrated.cjs`，同新包重跑四卷12布局及开合、键盘入锦/重拾、原诗焦点、滚轮恢复。新 compact90/末12/用户遇景4及 reading28/font78在 C7尚未执行，必须在最终新包实际补齐。C7的270/45/12锁位已有真实局部通过，是否受限继承由root按源/样式字节差决定，明确原结果属于C7，不能改名作新包实测。
