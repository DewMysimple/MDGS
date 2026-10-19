import { chapters, type ChapterId } from './chapters';

export interface ScrollCalligraphy {
  /** Stable editorial identity; these are web exhibition labels, not added Blender objects. */
  id: string;
  chapterId: ChapterId;
  content: { title: string; poem: string[]; intro: string };
  placement: {
    /** The original reading stop whose camera defines the fixed artwork-space anchor. */
    stop: number;
    localX: number;
    localY: number;
    distance: number;
    width: number;
    height: number;
    domWidth: number;
    domHeight: number;
  };
  style: {
    fontFamily: string;
    titleSize: number;
    poemSize: number;
    introSize: number;
    letterSpacing: number;
    ink: string;
    secondaryInk: string;
  };
  seal: {
    /** Neutral exhibition decoration. Replace assetUrl with a supplied seal if desired. */
    text: string;
    assetUrl?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    color: string;
  };
  display: {
    enabled: boolean;
    /** Web route progress, after the existing reading-path normalization. */
    range: [number, number];
    fade: number;
    poem: boolean;
    intro: boolean;
    rationale: string;
  };
}

const fontFamily = '"KaiTi", "STKaiti", "Kaiti SC", "SimSun", serif';

/**
 * All four titles, short verse/copy and introductions remain editable here.
 * Chapter copy comes from chapters.ts. Only verified empty artwork areas are enabled:
 * scroll II's left margin and scroll III's existing left-hand title area.
 * I and IV preserve their dense paintings and original painted text without duplicating titles.
 */
export const annotations: Record<ChapterId, ScrollCalligraphy> = Object.fromEntries(chapters.map(chapter => [chapter.id, {
  id: `chapter-${chapter.id}-opening-calligraphy`,
  chapterId: chapter.id,
  content: {
    title: chapter.title,
    poem: chapter.id === 2 ? ['宫墙之外', '春色渐入人间']
      : chapter.id === 3 ? ['花开圆满', '意寄人间']
      : chapter.id === 4 ? ['云想衣裳花想容', '春风拂槛露华浓']
      : ['唯有牡丹真国色', '花开时节动京城'],
    intro: chapter.intro,
  },
  placement: chapter.id === 2
    ? { stop: 0, localX: -1.65, localY: 0.13, distance: 3.5, width: 0.44, height: 1.04, domWidth: 260, domHeight: 615 }
    : { stop: 0, localX: -21, localY: 2, distance: 48, width: 5.2, height: 12.3, domWidth: 260, domHeight: 615 },
  style: {
    fontFamily, titleSize: 72, poemSize: 26, introSize: 22,
    letterSpacing: 10, ink: '#302820', secondaryInk: '#7c6b52',
  },
  seal: { text: '牡丹', x: 166, y: 408, width: 45, height: 63, fontSize: 23, color: '#a34b3a' },
  display: {
    enabled: chapter.id === 2 || chapter.id === 3,
    range: [0, chapter.id === 2 ? 0.055 : 0.045], fade: 0.012,
    poem: true, intro: false,
    rationale: chapter.id === 1 ? '原首景宫苑、人物与山石密集，保留原画，不叠加题字。'
      : chapter.id === 2 ? '已核对卷首左侧宣纸留白；随画卷位置游离，邻景出现前淡出。'
      : chapter.id === 3 ? '沿用经真实首景验证的左侧安全题字区，替换旧 Canvas 文字。'
      : '原首景自带横排策划文字；不重复增加标题或覆盖贵妃与牡丹。',
  },
}])) as Record<ChapterId, ScrollCalligraphy>;
