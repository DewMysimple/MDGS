# C8 最小焦点修复：构建、导出与冻结接续

这是root暂时不可用时准备的可执行恢复步骤，依据其已给出的“证实后最小C8修复”条件计划。C7第三卷逐纹理到达时，锦面先出现并取得初始焦点、花锚点随后出现却未纠正，三次冷启动均复现，故C7整体不接受。C7已经通过的保真/渲染/音频/UI子集保留其原范围，不能覆盖焦点失败。**准备此页时未build或更改产品；已实际执行的动作只有只读核对及C7输出复制。** 后续实际执行见本目录各独立报告与消息，不据本页命令假称已执行。

## 已完成的基线保护

- 11:13:55只读核对：831份源码/公共资产/配置、744份独立包、当前三包五代码均与[C7冻结](../art-candidate-7-build.json)匹配。
- `tmp/art-candidate-7-dist`仍原地保留。原活动`dist`与`dist-exhibition`已经原字节复制到唯一`tmp/candidate7-active-output-snapshot/dist`和`/dist-exhibition`，复制前/副本/复制后原目录的全量SHA相同。清单为[c7-active-output-snapshot.json](c7-active-output-snapshot.json)。没有移动、删除或覆盖C7目录。
- 既有packer只支持固定`dist`/`dist-exhibition`，不支持自定义outDir参数。未来真实export会更新这两个活动生成目录；先保留上述完整C7快照与C7原始清单，才能将活动别名切换到C8。若连活动原路径也必须始终不变，则应在完整独立workspace执行同工具，不能假称既有packer支持新参数。

## 产品范围与接线

仅采用[poetic的原字节候选](../encounter-focus-fix-candidate/enabled-anchor-only.patch)：`src/components/ArtEncounters.tsx`内两处`.art-anchor`选择器改为`.art-anchor:not([aria-disabled="true"])`。原C7 SHA `265fdafa82d6433e3957f74ae268ca8720991aed322acf6fa525fcb1cb95aa1e`；完整候选SHA `f55cf6c782664968b3c67d8b5c745ab2c42cd4cf0faa59e20da08064acffaced`。其余源码字节、纹理解码/GPU上传队列、源图、程序场、光照、时钟、音频均不改。root以外实际写入者须先协调独占该文件，按完整候选字节落盘并核SHA，不引入换行改写。

## 字体语料元数据

两处ASCII选择器不引入新字形，但拼接源码的corpus SHA改变。仅在font cmap检查零缺字后更新`public/fonts/provenance.json`的`corpusSha256/corpusFiles/requiredCodepoints/missingHan`。**不重新生成或渲染字体**，WOFF2仍279764B、1402码点、SHA `c619ddc07c72b9afca0ab20b1e33ed1a67c974ae3a7d1ec44de611895a79f59d`，OFL原字节不变。工具复制于ignored tmp，当前没有执行写入：

```powershell
$env:PYTHONPATH = Join-Path (Get-Location) 'tmp/font-tools'
python tmp/candidate8-recipe/refresh-font-corpus.py
python scripts/validate-kai-font.py --source tmp/font-upstream/LXGWWenKai-Regular.ttf --previous tmp/art-candidate-7-dist/fonts/wenkai-web.woff2 --report-dir reports/art-renewal/font/candidate-8
npx tsc -b
```

字体校验必须实际pass；若出现新缺字或字体二进制变化则停止此最小范围流程，不悄悄重子集化。`prepare-kai-font.py`本次无需运行。

## 构建与冻结顺序

代码、字体provenance与配置固定后，先确保没有其它构建/导出或依赖冻结源码的C7测试在跑。以下命令尚未因本recipe执行：

```powershell
npx vite build --outDir tmp/art-candidate-8-dist
npm run export:exhibition
node tmp/candidate8-recipe/prepare-candidate8.mjs freeze
```

第二条使用真实TypeScript/Vite构建，**不用`--skip-build`**，让展示库存`buildSourceVerified=true`。其既有独占lock、symlink/realpath检查、固定生成目录marker及原图逐字节复制全部保留；若lock存在先核PID，不删除活跃lock或用户目录。新C8目录若已存在，不随意清空，应先核身份并换唯一候选目录/补充人工审查。

freeze工具只写新的`reports/art-renewal/art-candidate-8-build.json`，独占创建拒绝覆盖，身份为`frozen-unvalidated`。它核对：

- C7→C8输入只允许上述精确候选SHA和font provenance变化；输入集合仍831。
- 全部公共资产逐字节等于C8包；独立C8全744文件与主dist一致。
- 从实际bundle枚举五个代码文件，C8独立包/主dist/展示包逐项一致，不硬编码旧JS名称。
- 展示包每份文件与库存匹配、库存源码输入仍与本地相同，`ready/sourceStable/buildSourceVerified`均真实。
- 字体维持原SHA，冻结读取前后源码无变化；C7独立包及快照不被写入。

工具尚未执行的`archive-c7`命令只供追溯，此步已经完成，不应重复到同一目录；它使用独占新建且不删除旧快照。`inspect`默认只读，只有它的小报告落盘。

## 新身份后验收

先由poetic跑新增“正常/主动Tab”三次冷启动焦点专项，以及第三卷完整遇景12项；必须花先成为可操作首锚点、Enter进入拾色、再到入锦，不能仅测试DOM存在。接着各代理显式指定C8包和C8输出目录，不能将C7通过报告复制成C8。

```powershell
$env:MDGS_ART_CANDIDATE = 'art-candidate-8'
$env:MDGS_ART_DIST = 'tmp/art-candidate-8-dist'
$env:MDGS_RAW_CACHE = 'tmp/peony2-original-image-cache'
node reports/art-renewal/art-candidate-validate.cjs
```

该入口真实执行22展示包、59原生帧+243原图/结构、15续看、24接力像素及37启卷，保留原像素阈值。原图cache从四份只读packed原件恢复，来源SHA和现存cache以root实际记录为准；不要再假定已消失的外部b485 cache存在。原native reference未变无需重渲染Blender。

同时按资源窗口协调C8的10返回、原16硬件+1真实partial恢复、CPU10；驱动仅在独立tmp副本适配C8身份/输出，旧C7 driver与失败报告原字节保留。sound需从头同C8进行约13分钟soak后完整六套，并做runtime seal；poetic需C8全正文/锁位/阅读/真实遇景与字形、最后复核Edge83+15。GPU功能测试可协调并行，性能基准与最终录片要独占。最终原速导览、35required验片、ZIP与Git提交/推送在真正C8验收后执行；C7终片未录制，不能使用旧stage或C6媒体冒充。

所有命令仅是恢复recipe。实际SHA、失败和通过以新C8独立报告为准。

## 后续实际执行记录

11:16:09由poetic写入已评审候选并记录application.json，sound独立复核；随后实际更新corpus元数据、1402码点与C7/固定原TTF的轮廓/度量全部一致、1130源码Han零缺，TypeScript通过。11:18:16独立C8与真实export完成，[新冻结身份](../art-candidate-8-build.json)为SHA `305dc8b9b429415093889642ae885ffe564cdd33f156edf30a637bac4a172ea9`；[冻结审计](c8-freeze-audit.json)记录恰两个输入差异，其余829不变。

11:28:12[完整根链](../art-candidate-8-freeze.json)实际完成22展示包、59原生帧/243原图、37启卷、15续看及24接力像素；[CPU八类](../candidate-8-cpu/validation.json)、[返回10+同轮硬件17](../return-order-candidate-8/README.md)也通过。其它C8全片文字/声音/最终录片由各自报告记录，本段不提前宣称整体接受。root恢复后已重新接回共享文档、记忆、Git和ZIP，本代理不并发操作。

本目录`tooling/`保留实际准备器的原字节快照，仍含当时tmp层级的路径假设；执行应在原`tmp/candidate8-recipe`位置，不直接从归档层级运行。C7原包、两份活动输出快照及所有焦点/诊断失败继续保留。
