import type { StoryStop } from '../types';
import type { NarrativeCue } from './narrativeTrack';

export interface PoeticScene {
  heading: string;
  passages: readonly string[];
  /** Observed subject in the supplied 2.0 scene, not a historical attribution. */
  looking: string;
  register?: 'opening' | 'aftermath';
}

/** Contemporary exhibition writing. These lines never replace the source prose. */
export const poeticNarrativeScenes: Readonly<Record<number, readonly PoeticScene[]>> = {
  1: [
    { heading: '花与山河', passages: ['女帝武则天身旁，一朵牡丹连起山河与神都的记忆。'], looking: '女帝、层叠牡丹与山河宫阙' },
    { heading: '山野入城', passages: ['山野的花走进宫苑，也走进一座城的记忆。'], looking: '女帝、宫苑与近景牡丹' },
    { heading: '风露养花', passages: ['山间风露养花，寻常草木自有自己的春天。'], looking: '深山、寺院与乡野花木' },
    { heading: '各有风姿', passages: ['梅兰菊各有风姿，牡丹静候自己的花期。'], looking: '梅兰菊与牡丹的并置' },
    { heading: '一枝入苑', passages: ['一枝移入苑中，山野春色渐渐走近宫墙。'], looking: '苑囿与栽植花木的情节' },
    { heading: '花与洛阳', passages: ['花与洛阳相逢，城的记忆从此多了一重春色。'], looking: '神都城阙与牡丹' },
    { heading: '花冠映殿', passages: ['殿宇与花冠相映，盛大的审美写在春光里。'], looking: '金碧殿宇、仪仗与大朵牡丹' },
    { heading: '远处的风', passages: ['花从山野来到庭前，也带来了远处的风。'], looking: '寺院引种与花入御苑的叙事' },
    { heading: '旧籍花事', passages: ['旧籍记下花事，洛阳的春天有了牡丹的名字。'], looking: '洛阳与花事兴盛的画面', },
    { heading: '花诏传说', passages: ['一纸花诏落下，寒冬与春色在传说里相望。'], looking: '持诏人物与花，按传说进入下一景' },
    { heading: '烈火寄志', passages: ['烈火是传说的笔墨，不屈是人们寄给花的心意。'], looking: '火焰牡丹、诏书与伏案人物' },
    { heading: '借花写心', passages: ['文人借花写自己，把不肯低头的心寄在枝间。'], looking: '文人书画与牡丹' },
    { heading: '两种记忆', passages: ['记载与传说各有来处，合成牡丹的两种记忆。'], looking: '史实与传说并置；两种叙事性质分开理解' },
    { heading: '千年相逢', passages: ['女帝已远，花事仍新；千年回望，也是一场相逢。'], looking: '女帝、花与洛阳城的回望' },
    { heading: '春色未尽', passages: ['画卷渐收，春色未尽；愿这一枝花，也开进今天。'], looking: '洛阳花开与牡丹主题收束' },
  ],
  2: [
    { heading: '春色有路', passages: ['一枝花从宫墙内走来，春色便有了更远的去处。'], looking: '御花、朝野与宫苑的过渡' },
    { heading: '共此春水', passages: ['近处一丛牡丹，水上几叶舟，目光把彼此相连。', '桥上人相望，一城春色，也在寻常日子里流动。'], looking: '近景花石、中景游船、远景桥上人群' },
    { heading: '宫门内外', passages: ['门内有花，门外有人；春风慢慢越过高墙。', '停步的人，也在花前认出彼此的春天。'], looking: '宫门、花木与门内外的人' },
    { heading: '私园闲情', passages: ['一枝移向庭前，远山与春水也有了花的倒影。', '园中人把酒相对，花影替他们留住片刻闲情。'], looking: '私家园林、春水、亭阁与游赏人物' },
    { heading: '花前相知', passages: ['杯盏间有花，诗句里有春；游赏也成了相知。', '花前的一次相逢，把人与人的距离轻轻缩短。'], looking: '宫苑宴游与赏花赋诗' },
    { heading: '寻常春日', passages: ['看花不必争奇，寻常的一朵，也能照见好心情。', '有人携手而来，有人独自停留；春光一同收下。'], looking: '普通人物临花静赏，观看与停留' },
    { heading: '春入人间', passages: ['宫墙之外，花被更多目光认领，也开向今日人间。'], looking: '朝野共赏的全卷意境；非唐代风俗断代结论' },
  ],
  3: [
    { heading: '花入日常', passages: ['花在瓶上，也在掌心，把吉祥的心意送进日常。'], looking: '绘瓷人物、团扇与牡丹器物' },
    { heading: '一花牵意', passages: ['一朵花牵起衣裳与器物，把祝愿送进寻常人家。'], looking: '衣裳、器物与牡丹装饰' },
    { heading: '花入嫁衣', passages: ['凤与牡丹相依，红衣托起对美好姻缘的祝愿。'], looking: '凤穿牡丹嫁衣与婚俗人物' },
    { heading: '相逢相守', passages: ['愿花开圆满，也愿相逢的人相守长久。'], looking: '祥瑞良缘、红衣与人物相依' },
    { heading: '灯照花枝', passages: ['灯照花枝，孩子奔向热闹，也奔向被祝福的日子。'], looking: '岁时灯彩与儿童活动' },
    { heading: '把圆满展开', passages: ['花被织进锦面，团聚的人把圆满轻轻展开。'], looking: '家人展开细密牡丹织物，近景牡丹与锦面相映' },
    { heading: '安宁有形', passages: ['一笔一刻，花留在器物上，人把安宁放在日常里。'], looking: '制器、雕刻、绘瓷及牡丹器物' },
    { heading: '笔端从容', passages: ['笔端花影从容，细看的人也慢慢放缓了呼吸。'], looking: '画师与书案上的花画' },
    { heading: '岁岁安宁', passages: ['花入寻常日子，愿你岁岁安宁。'], looking: '近景巨幅牡丹，简短收束；该源尾段只有4.9秒' },
  ],
  4: [
    { heading: '人花相映', passages: ['花映人，人怜花；一段相逢留在春日的长卷。'], looking: '人物与牡丹相映', register: 'opening' },
    { heading: '花容知音', passages: ['花容与衣香相映，贵妃杨玉环也成了花的知音。'], looking: '人物衣饰、花冠与牡丹', register: 'opening' },
    { heading: '诗中相逢', passages: ['沉香亭的典故里，花入李白的诗，也入人间记忆。'], looking: '沉香亭赏花题诗的文学典故', register: 'opening' },
    { heading: '一笺花容', passages: ['这一笺花容，把人与花的风华留在纸上。'], looking: '镜头起始见书案人物与原画清平调诗笺，随后右推至人物与牡丹屏风', register: 'opening' },
    { heading: '马嵬花落', passages: ['花仍开着，画中人的命运却已转向离散。'], looking: '马嵬与盛世落幕：倚伏的人物、流散的衣带与花', register: 'aftermath' },
    { heading: '花宴渐冷', passages: ['马蹄远去，昨日的花宴在尘烟里渐渐冷却。'], looking: '行进的军马、远去的宴游与牡丹陈设', register: 'aftermath' },
    { heading: '繁花回望', passages: ['花枝依旧，人已回身；盛景从此成为回望。'], looking: '栏前背影、仰望的人物与远处宫苑', register: 'aftermath' },
    { heading: '花前无言', passages: ['烟尘遮住旧城，花前的沉默比欢歌更长。'], looking: '烟火旧城、垂首人物、残旗与牡丹', register: 'aftermath' },
    { heading: '文脉余响', passages: ['画卷终会合拢，花与人的诗意却向今天延伸。'], looking: '旧城与往昔繁华并置，文明记忆回响，不作庆典', register: 'aftermath' },
  ],
};

export const poeticSourceNotes = {
  authorship: '全部heading与text为当代展览新题，非古诗录文，不替改25段原作正文。',
  edition: 'peony-2.0-2026-10-23',
  timing: '使用传入的真实stop.progress与sourceDurationSeconds；每段题跋覆盖对应停点，长镜的多句连续交替并交叉淡入淡出，短镜按同一语境并入邻景，第四卷情绪转折不跨界合并。',
  chapters: {
    1: '火焰贬花明确标作传说。欧阳修北宋《洛阳牡丹记》仅作花事记忆的文献参读，不把传说写成史实，也不新增首次栽培等绝对断代。',
    2: '宫墙、花舟桥、宴游与静赏按本作画面展开；唐代春游为艺术化叙事。北宋风俗只跨时代参读，不作唐代具体风俗的同时代证明。',
    3: '花与衣裳、锦面、器物的联系为艺术化联想，不模拟或宣称特定织造技法；吉祥寓意可参读国博辽代牡丹纹尊，不将该藏品误作唐代器物。',
    4: '沉香亭题诗按文学典故理解。第五停点即source progress 0.4252362423568649起转向离散、渐冷、追忆，末景表达诗意与文明记忆的延续。',
  },
  references: [
    { title: '欧阳修《洛阳牡丹记》', url: 'https://zh.wikisource.org/wiki/洛陽牡丹記_(歐陽修)' },
    { title: '北京市园林绿化局：牡丹文化、传说与李白诗文', url: 'https://yllhj.beijing.gov.cn/ztxx/bjhx/hhzs/201804/t20180425_118611.shtml' },
    { title: '中国国家博物馆：赤峰窑白釉黑彩剔划牡丹纹尊', url: 'https://www.chnmuseum.cn/zp/zpml/csp/202203/t20220309_254242.shtml' },
    { title: '大都会艺术博物馆：Chinese Handscrolls', url: 'https://www.metmuseum.org/essays/chinese-handscrolls' },
  ],
} as const;

interface Window {
  start: number;
  startProgress: number;
  end: number;
  sceneIndex: number;
  spec: PoeticScene;
  sourceNames: string[];
}

const MIN_VISIBLE = 3.5;
const MAX_VISIBLE = 12;

/** Pure exhibition data; never changes source time, progress, pixels, or prose.
 * Each cue covers its scene/subscene so the supplied interpretive writing is
 * present throughout the corresponding painting. Adjacent cues crossfade in
 * the calligraphy layer instead of leaving an uncaptioned interval. */
export function buildPoeticTrack(chapterId: number, stops: readonly StoryStop[], durationSeconds: number): NarrativeCue[] {
  const scenes = poeticNarrativeScenes[chapterId];
  if (!scenes || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  const canonical = stops.filter(stop => !/参考全景/.test(stop.name)).slice(0, scenes.length);
  if (canonical.length !== scenes.length || canonical.some((stop, index) => !Number.isFinite(stop.progress)
    || stop.progress < 0 || stop.progress >= 1 || index > 0 && stop.progress <= canonical[index - 1].progress)) return [];
  const windows: Window[] = scenes.map((spec, sceneIndex) => ({ start: canonical[sceneIndex].progress * durationSeconds,
    startProgress: canonical[sceneIndex].progress,
    end: (canonical[sceneIndex + 1]?.progress ?? 1) * durationSeconds, spec, sceneIndex, sourceNames: [canonical[sceneIndex].name] }));

  // Do not compress a poem into an unreadable beat. Join a short beat to a
  // compatible neighbouring scene instead, keeping the neighbour's wording.
  // The fourth scroll's loss at stop five is an explicit editorial boundary.
  for (let index = 0; index < windows.length; index++) {
    const current = windows[index];
    if (current.end - current.start >= MIN_VISIBLE) continue;
    const next = windows[index + 1], previous = windows[index - 1];
    if (next && next.spec.register === current.spec.register) {
      next.start = current.start; next.startProgress = current.startProgress; next.sourceNames.unshift(...current.sourceNames); windows.splice(index, 1); index--;
    } else if (previous && previous.spec.register === current.spec.register) {
      previous.end = current.end; previous.sourceNames.push(...current.sourceNames); windows.splice(index, 1); index--;
    } else { windows.splice(index, 1); index--; }
  }

  return windows.flatMap(window => {
    const span = window.end - window.start;
    const count = Math.min(window.spec.passages.length, Math.floor(span / MIN_VISIBLE));
    if (count < 1) return [];
    const slot = span / count;
    return window.spec.passages.slice(0, count).map((text, partIndex) => {
      const start = window.start + partIndex * slot;
      const visible = Math.min(MAX_VISIBLE, slot);
      return {
        id: `poetic-c${chapterId}-s${window.sceneIndex + 1}-${partIndex + 1}`,
        paragraphId: `poetic-c${chapterId}-s${window.sceneIndex + 1}`,
        // Keep the authored normalized boundary exactly. A seconds round-trip
        // can otherwise move the first cue a ULP after a paused source stop.
        heading: window.spec.heading, text, start: partIndex === 0 ? window.startProgress : start / durationSeconds, end: (start + visible) / durationSeconds,
        paragraphIndex: window.sceneIndex, partIndex, partCount: count, sourceNode: window.sourceNames.join(' ／ '),
      };
    });
  });
}
