/** Exhibition annotations are distinct from the supplied narrative transcript.
 * Museum descriptions are paraphrased; historical verse retains its attribution.
 * Referenced objects are reading links, not images included in this work. */
export interface CuratorialSource {
  label: string;
  title: string;
  detail: string;
  url: string;
}

export interface CuratorialNote {
  question: string;
  lead: string;
  sections: { title: string; text: string }[];
  looking: string;
  setting: string;
  sources: CuratorialSource[];
  transcriptNote?: { title: string; text: string; source: CuratorialSource };
}

const peonyRecord = 'https://zh.wikisource.org/wiki/洛陽牡丹記_(歐陽修)';
const peonyCulture = 'https://yllhj.beijing.gov.cn/ztxx/bjhx/hhzs/201804/t20180425_118611.shtml';
const tangChronology: CuratorialSource = {
  label: '史书', title: '《旧唐书》卷七·中宗睿宗本纪',
  detail: '中宗复位与睿宗再度即位、传位纪年',
  url: 'https://zh.wikisource.org/wiki/舊唐書/卷7',
};

export const curatorialNotes: Record<number, CuratorialNote> = {
  1: {
    question: '花有傲骨，故事有来处',
    lead: '同一朵牡丹，一面开在史书中，一面开在人们的想象里。',
    sections: [
      { title: '烈火中的花，是人的寄托', text: '拒不应诏、被贬洛阳、经火而生，组成了流传至今的牡丹传说。人们借一朵花写不屈，也把自己的精神安放在花中。原作以火与花呈现这份寄托。' },
      { title: '记载中的花，有另一条线索', text: '北宋欧阳修《洛阳牡丹记》写道：“自唐则天已后，洛阳牡丹始盛。”这句话留下了牡丹兴盛的历史线索；它与烈火传说，属于不同性质的记忆。' },
    ],
    looking: '留意火焰牡丹与女官诏书之间的照应，再辨读“传说”与“史料”。',
    setting: '画中人物与情节为艺术化叙事；烈火贬花按民间传说理解。',
    sources: [
      { label: '文献', title: '欧阳修《洛阳牡丹记》', detail: '北宋文献 · 花释名第二', url: peonyRecord },
      { label: '传说', title: '简说牡丹的文化历史内涵', detail: '北京市园林绿化局 · 2018', url: peonyCulture },
    ],
  },
  2: {
    question: '从一朵花，到一城春',
    lead: '当目光越过宫墙，春色便有了更多人的身影。',
    sections: [
      { title: '共赏，是花事里的相逢', text: '近处一簇花，中间一叶舟，远处一座桥。画面用不同远近的生活片段，让赏花从一个人的凝望，变成一城人的春日。' },
      { title: '循着视线，慢慢游观', text: '传统手卷的观看由观者自己掌握节奏。停一停，再向前，细节就在展开之间相遇。本卷把这种游观转化为屏幕上的行进，也把停留交还给你。' },
    ],
    looking: '依次循花、舟、桥移目，看一场春色怎样把人们联系起来。',
    setting: '本卷是唐代春游的艺术化想象。所附北宋风俗记为跨时代参读，不作唐代具体风俗的同时代证明。',
    transcriptNote: {
      title: '年代参读',
      text: '705年中宗复位，710年睿宗再度即位，712年传位玄宗。本卷以文学笔意串联花事，赏花风尚的流转跨越更长的时光。',
      source: tangChronology,
    },
    sources: [
      { label: '花事', title: '欧阳修《洛阳牡丹记》', detail: '北宋文献 · 风土记第三', url: peonyRecord },
      { label: '游观', title: 'Chinese Handscrolls', detail: '大都会艺术博物馆 · 手卷的观看方式', url: 'https://www.metmuseum.org/essays/chinese-handscrolls' },
      tangChronology,
    ],
  },
  3: {
    question: '花开圆满，愿入寻常',
    lead: '花不仅被看见，也被画进器物、织进衣裳，陪伴日常。',
    sections: [
      { title: '从花形，到纹样', text: '圆满的花冠、舒展的枝叶，进入锦面与器物之后，成为可以长久相伴的花。原画中的瓷器、织物与团聚的人，连起了美与生活。' },
      { title: '富贵，是对好日子的盼望', text: '中国国家博物馆所藏辽代牡丹纹尊，以剔划花纹装饰器身。馆藏释文将牡丹联系于富贵与吉祥。跨越材质与时代，人们都愿借繁花寄托生活的丰足。' },
    ],
    looking: '选取原画的一朵花，再送入锦面；在花与纹样之间，想一想自己的圆满。',
    setting: '“选花入锦”为花与织物的艺术化联想，不模拟特定织造技法；参读器物为辽代藏品。',
    sources: [
      { label: '器物', title: '赤峰窑白釉黑彩剔划牡丹纹尊', detail: '中国国家博物馆 · 辽代', url: 'https://www.chnmuseum.cn/zp/zpml/csp/202203/t20220309_254242.shtml' },
      { label: '设色', title: '恽寿平《牡丹》', detail: '台北故宫博物院 · 清代册页', url: 'https://theme.npm.edu.tw/selection/Article.aspx?lang=2&sNo=04000985' },
    ],
  },
  4: {
    question: '以花映人，以诗留春',
    lead: '花与人的相映，让一时的春光，留成千年的诗意。',
    sections: [
      { title: '一笺花容', text: '李白《清平调》以花比人，让牡丹与人的风华相互映照。原作书案前的诗笺，是画中可以停下来展读的一处。' },
      { title: '繁花依旧，人事流转', text: '画卷由华美转向沉静，花也从盛景的点缀，成为回望人间的线索。我们借数字空间重访这些意象，让诗中的春天与今日的目光相遇。' },
    ],
    looking: '展读书案前的诗笺，再随画卷经过盛景与落幕，听声景如何渐渐收束。',
    setting: '本卷循沉香亭题诗等文学典故展开，画中场景为艺术化想象。',
    sources: [
      { label: '诗文', title: '李白《清平调》三首', detail: '北京市园林绿化局 · 诗文与牡丹文化', url: peonyCulture },
      { label: '意象', title: '简说牡丹的文化历史内涵', detail: '北京市园林绿化局 · 花与人的寄托', url: peonyCulture },
    ],
  },
};
