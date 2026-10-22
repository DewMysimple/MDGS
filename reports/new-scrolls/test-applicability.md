# 当前四卷的验证入口与历史测试边界

本轮只运行静态/CPU检查及已有独立原生验证证据的复核，未启动浏览器。浏览器脚本的适用性审计来自实际代码断言，不表示已执行其运行验收。

## 本轮实际运行

| 命令 | 结果与范围 |
| --- | --- |
| `npm test` | 通过；保留旧四卷13474/5521等裁切语义，同时由`sourceEdition.ts`确定当前新四卷路径，校验共8条连续路径、原几何/动画/标记不变、新卷全部首尾帧与552个可见性边界映射。 |
| `npm run validate:assets` | 通过；先校验旧四卷263张纹理，再校验新四卷244张纹理、339个几何对象，全部引用/编码尺寸/矩阵/UV/材质/相机/轨道检查零错误零提醒。 |
| `npm run validate:new-assets` | 通过；复核四个新源与交付文件SHA、独立Blender核验报告SHA、逐一完整解码244张WebP，含源时序和原生可见性证据。运行时`MDGS_PYTHON`指向带Pillow的Python。 |
| `npm run test:new-narrative` | 通过；7组，DOCX25段逐字覆盖、59个题跋片段、前后游观及卷末空隙。 |
| `npm run test:new-motion` | 通过；9组与120个节点/屏幕比例检查；包括真实SceneRenderer方法的CPU生命周期检查，GPU/DOM使用stub。 |
| `npm run test:projection-home:static` | 通过；当前首页参考图与背衬文件字节/SHA来源检查，不含shader执行或画面验收。 |
| `npx tsc -b` | 通过。 |

首次原`npm test`在启动Vite/esbuild时因Windows父目录访问被拒而失败，未触发断言；现已改为直接加载纯TypeScript函数的CPU测试，不启动Vite或端口，历史断言没有删除。首次通用资产器检查新第二卷时发现原档案marker(frame1)位于render range[33,2184]之外；保留原marker，只允许同名stop明确`authoredFrame=1`且实际frame恰为裁定后的33的严格档案例外。相机、执行stop和物体动画仍必须位于0..1实际范围。

## 默认子路径浏览器验收的新期望

`npm run test:subpath`已改为默认读取`sourceEdition.ts`当前版本，仍实际建立`/portable/nested/`HTTP站点，并保留四卷切换、单一canvas、brocade CSS及装饰路径、无横向溢出、wheel/drag/keyboard/下一景/自动展卷/动效/全屏/进度/文化抽屉与焦点恢复。

新增默认期望：

- 首页实际请求`ui/study-projection/reference.png`与`plaque-backing.webp`，投影实体场景已编译且就绪，全部路径保持前缀。
- 四卷实际请求`assets/new-scrolls/chapter-N/scene.json`、本卷`cover.webp`及本卷真实textures；manifest的sourceRevision等于当前active edition。
- 追加独立环境层按实际stop数量乘2，即30/14/18/18；旧重建文字层为0，实际DOCX题跋组件存在并显现；原生隐藏层没有被复活。
- `MDGS Kai`本地font-face状态为loaded，真实题跋computed font使用它，`fonts/wenkai-web.woff2`从前缀内加载。
- 真实点击开启古筝意境配乐，等待WebAudio解码与playing状态，检查本地mp3来自前缀内，键盘调整音量并关闭。
- 所有原有控制语义保留。进度滑块以无歧义的aria-label定位，避免新增音量滑块干扰。

历史`reconstruction/manifest.json`补层/题字计数仅在明确设置`MDGS_LEGACY_RECONSTRUCTION=1`时读取。该模式要求另行构建旧版应用fixture，不会偷偷改变当前运行源码；它的报告写入`validation-portable-subpath-legacy.json`，不能当作新四卷通过。默认当前报告为`validation-portable-subpath.json`，启动/失败均先覆盖状态，避免保留旧通过记录。

本轮只执行`node --check scripts/validate-subpath.mjs`，没有执行该浏览器命令；根任务需构建最新dist后独占GPU运行。

## 其他浏览器脚本适用性

| 脚本 | 当前适用性 |
| --- | --- |
| `validate-projection-home.mjs` | 当前首页专用入口；默认浏览器检查真实投影几何、shader错误门控、按钮及移动适配。已增package入口`test:projection-home`，根任务运行。 |
| `validate-study-timing.mjs` | 仍适用：完整阶段链、4秒可见加载、缓存/刷新/历史/retry/hidden与真实慢纹理。网络glob可命中新目录；需根实际跑。 |
| `validate-study-renderer.mjs` | 准备门控、取消、纹理重试、context恢复、原输入验证仍有意义；宽屏resize“必然请求未缓存纹理”的场景假设需在新卷重新实测。 |
| `validate-study-journey.mjs` | 基础旅程多数仍有意义；末尾旧`ui/study-volume/paintings-atlas.webp`故障注入应换为当前本卷cover，旧data-painting-src以`#chapter-N`结尾的断言不再适用。 |
| `validate-faithful-home.mjs` | 属于旧分离材质建模首页；强制旧`gongbi-volumetric-peony-corolla`、`study-faithful/garden.webp`等资产和对象，不作为当前首页通过条件。保留历史脚本。 |
| `validate-volume-home.mjs`及`test:layered-home`旧alias | 曲面展卷/门控理念仍适用，但书房brush-holder射线阻挡、旧garden故障注入和旧物件身份已变；需独立适配后再用，不能把旧物件缺失称为新版本运行失败。 |
| `validate-all-motion.mjs`、`validate-motion-*.mjs`、`validate-pilot-motion.mjs` | 读取旧canonical/R1/R4、旧花枝和云密度要求；仅作历史版本回归，当前以新显式profile/单瓣绑定和卷末全部停动验收。原艺术规范保留。 |
| `validate-blank-*.mjs`、`validate-third-*.mjs`及旧layer-sorting整图快照 | 绑定旧重建SHA、45个补绘层或旧题字布局，保留历史证据。当前新源应使用独立资产/native审阅与新画面截图，不以这些旧计数覆盖原生源。 |
| `validate-startup.mjs` | HTTP端口/项目路径校验仍适用，无浏览器；运行需要允许Vite配置读取和监听本地端口。本轮未重复启动五台服务。 |
