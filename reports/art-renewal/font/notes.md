# 文楷补字与字形保持

候选3使用的旧网页子集为242380字节、1230个映射码点，SHA1f74e7b3639ae956b92f0c3eed77bf3ce505025bf28a66bd8c330722001dc8ed。当前src的TS/TSX/CSS（包含注释，是可见文字的保守超集）有1130种汉字，其中168种不在旧cmap中。before/validation.json对旧文件真实退出1，不能把早期8058字格排版通过当作字体覆盖证明。

font-fallback/editorial-old-font.json另用CDP实际读取旧生产包字体：舟桥正文为自定义字体23个glyph、系统KaiTi3个；年代注为54+2；‘留一笺春色’为4+1。这是节点级混用证明，不凭FontFace.check，也不将计数直接冒称逐字归属。

## 采用的制作

从[霞鹜文楷固定commit](https://github.com/lxgw/LxgwWenKai/tree/7ebd0771fda4285299670f83c398f32f32c7bef8)取回同一份Regular TTF，25928940字节，SHA2d73eea94ad808999d90c0000c239a84a33b09d4bc6ab6c5b8bbf1eda8a7fc8b，与原provenance完全一致。原字体许可有仅网页子集转换的明确附加许可，当前OFL全文字节未改。未将完整桌面TTF作为运行素材或Git交付。

prepare-kai-font.py增加独立输出路径、保留既有子集全部码点和固定源时间戳；补当前语料，而不换字体、不改轮廓。两次独立生成得到同一SHA c619ddc07c72b9afca0ab20b1e33ed1a67c974ae3a7d1ec44de611895a79f59d。选用文件279764字节、1402码点，比旧文件增加37384字节；旧1230码点全部保留，当前1130源码汉字零缺。

## 实际核验与边界

validate-kai-font.py直接解码实际WOFF2 cmap，并用DecomposingRecordingPen展开复合字形后比较轮廓及水平/垂直度量。选用1402码点逐一与固定原TTF一致；旧1230码点逐一与旧WOFF2一致；unitsPerEm、hhea与OS/2全局行度量一致。adopted/validation.json实际通过，候选输出先验也保留在candidate/。这不代表浏览器没有任何系统字体调用：图标/其他字体族和不采用文楷的区域需分别看CSS。

脚本依赖FontTools与Brotli（制作/检查依赖，不是网页运行依赖）；本机Brotli仅安装在忽略的tmp/font-tools。可在具备fonttools[woff]的环境以源TTF/许可和旧子集运行prepare-kai-font.py --source ... --license ... --revision 7ebd0771fda4285299670f83c398f32f32c7bef8 --retain-web ...；随后运行validate-kai-font.py --source ... --previous ...。生成工具用法依据[FontTools官方文档](https://fonttools.readthedocs.io/en/latest/subset/index.html)。

补字随后进入候选4。该包的270组排版、45句完整实播、阅读纸面及花笺已按新字体实际复验；CDP在24个真实DOM节点均读到自定义字体，原来混用的三个节点现在分别为文楷26/56/5个glyph，没有KaiTi。浏览器HTTP得到的字体为279764字节、SHA c619dd…9f59d。字体/主按钮/年代注专项78项通过，完整冻结证据在`../candidate-4-poetic-runs/2026-10-23T00-30-09-481Z/`。这些结果只证明其范围；候选4整体另因浏览器Back快照时序缺陷未验收。

候选5修复返回时序后重新制作provenance：85文件完整源码语料SHA变为901fc9cfc9f5bdd11de98d1c6b18f1f10da010185f213df54f7271649441f61c，1130源码汉字和1402码点字体均不变，WOFF2仍为c619dd…9f59d。`candidate-5/validation.json`已实际比较全部轮廓与度量通过。新的同包浏览器复验独立进行，不把候选4的源绑定冒称候选5结果。
