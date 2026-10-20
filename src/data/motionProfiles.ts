/** Explicitly reviewed independent layers. Composite people/buildings never match by name rules. */
export interface LayerMotionBinding {
  meshName: string;
  narrative: string;
  kind: 'sway' | 'drift' | 'fall' | 'opacityPulse';
  periodSeconds: number;
  phase: number;
  /** Declared from each bound geometry/UV, never inferred from its world orientation. */
  plane: 'XZ' | 'XY' | 'YZ' | 'UV' | 'CURVE';
  uvDomain?: 'image' | 'current';
  atmosphere?: 'cloud' | 'water';
  group?: 'petal' | 'bridge' | 'legacy';
  priority?: number;
  pivot?: [number, number];
  angleDegrees?: number;
  xRatio?: number;
  yRatio?: number;
  zRatio?: number;
  opacityAmplitude?: number;
}

export interface NarrativeMotionPoint { stop: number; clockSpeed: number; petalDensity: number; cloudDensity: number }

export interface ChapterMotionProfile {
  chapterId: number;
  enabled: boolean;
  ambientFps: number;
  maxVisibleBindings: number;
  maxVisiblePerGroup?: Partial<Record<'petal' | 'bridge' | 'legacy', number>>;
  narrativeEnvelope?: { startStop: number; tailStop: number; points: NarrativeMotionPoint[] };
  bindings: LayerMotionBinding[];
}

const cloudNames = [
  '过渡_01_淡墨云气_19',
  '过渡_02_淡墨云气_12', '过渡_02_淡墨云气_19',
  '过渡_03_淡墨云气_12', '过渡_03_淡墨云气_19',
  '过渡_04_淡墨云气_12', '过渡_04_淡墨云气_19',
  '过渡_05_淡墨云气_12', '过渡_05_淡墨云气_19',
  '过渡_06_淡墨云气_12', '过渡_06_淡墨云气_19',
  '过渡_07_淡墨云气_12', '过渡_07_淡墨云气_19',
  '过渡_08_淡墨云气_19', '过渡_09_淡墨云气_19',
  '过渡_10_淡墨云气_12', '过渡_10_淡墨云气_19',
  '过渡_11_淡墨云气_12', '过渡_12_淡墨云气_12',
  '过渡_13_淡墨云气_12', '过渡_13_淡墨云气_19',
  '过渡_14_淡墨云气_19', '过渡_12_淡墨云气_19.001',
];

const firstScroll: ChapterMotionProfile = {
  chapterId: 1,
  enabled: true,
  ambientFps: 30,
  maxVisibleBindings: 6,
  maxVisiblePerGroup: { petal: 2, bridge: 1 },
  bindings: [
    ...Array.from({ length: 15 }, (_, index) => [1, 2].map((petal): LayerMotionBinding => ({
      meshName: `R1_Petal_${String(index + 1).padStart(2, '0')}_${petal}`,
      narrative: '每个阅读节点仅少数独立单瓣缓落，在无操作停留时维持画气',
      kind: 'fall', plane: 'XY', group: 'petal', priority: 0,
      uvDomain: 'current',
      periodSeconds: 23 + index % 4 * 2 + petal,
      phase: index * 0.79 + petal * 2.18,
      xRatio: 1.25, yRatio: 10, angleDegrees: 7,
    }))).flat(),
    ...Array.from({ length: 14 }, (_, index): LayerMotionBinding => ({
      meshName: `R1_Mist_Bridge_${String(index + 1).padStart(2, '0')}`,
      narrative: '世界锚定的相邻分镜薄雾连接，不盖住人物与建筑主体',
      kind: 'drift', plane: 'XY', group: 'bridge', priority: 1,
      atmosphere: 'cloud',
      periodSeconds: 34 + index % 4 * 3, phase: index * 1.31,
      xRatio: 0.005, yRatio: 0.003, opacityAmplitude: 0.03,
    })),
    ...cloudNames.map((meshName, index): LayerMotionBinding => ({
      meshName, narrative: '神都园林之间的淡墨云气与留白承接', kind: 'drift',
      plane: 'XZ', group: 'legacy', priority: 3,
      atmosphere: 'cloud',
      periodSeconds: 31 + index % 5 * 2.5, phase: index * 1.37,
      xRatio: 0.003, zRatio: 0.0015, opacityAmplitude: 0.025,
    })),
    {
      meshName: '02_右下金色飘带', narrative: '国色初成的金色锦带，叠加保留源动画',
      kind: 'sway', periodSeconds: 24, phase: 0.7,
      plane: 'XZ', group: 'legacy', priority: 2,
      pivot: [0.15, 0.8], angleDegrees: 0.12,
    },
    {
      meshName: '02_中央金色飘带', narrative: '初兴气象的独立锦带，叠加保留源动画',
      kind: 'sway', periodSeconds: 27, phase: 2.2,
      plane: 'XZ', group: 'legacy', priority: 2,
      pivot: [0.1, 0.7], angleDegrees: 0.1,
    },
    {
      meshName: '14_批注04_下方花枝_补全', narrative: '人与花相成段的独立完整花枝',
      kind: 'sway', periodSeconds: 21, phase: 1.1,
      plane: 'XZ', group: 'legacy', priority: 2,
      pivot: [0.5, 0], angleDegrees: 0.18,
    },
    {
      meshName: '15_08_飘落花瓣', narrative: '洛阳牡丹卷尾的稀疏花瓣，保留源动画基底',
      kind: 'drift', periodSeconds: 26, phase: 0.4,
      plane: 'UV', group: 'legacy', priority: 2,
      xRatio: 0.004, zRatio: 0.002,
    },
  ],
};

function sharedAtmosphere(chapter: number, stops: number, period: number): LayerMotionBinding[] {
  return [
    ...Array.from({ length: stops }, (_, index) => [1, 2].map((petal): LayerMotionBinding => ({
      meshName: `R${chapter}_Petal_${String(index + 1).padStart(2, '0')}_${petal}`,
      narrative: chapter === 2 ? '春日静赏中稀疏单瓣，不制造斗花狂热' : chapter === 3 ? '锦绣与民俗段的少数单瓣，不带动器物纹样' : '盛美到故国追忆的单瓣，按真实阅读节点逐渐减少',
      kind: 'fall', plane: 'XY', uvDomain: 'current', group: 'petal', priority: 0,
      periodSeconds: period + index % 4 * 2 + petal, phase: index * .79 + petal * 2.18,
      xRatio: chapter === 3 ? .9 : 1.25, yRatio: chapter === 3 ? 8 : 10, angleDegrees: 6,
    }))).flat(),
    ...Array.from({ length: stops - 1 }, (_, index): LayerMotionBinding => ({
      meshName: `R${chapter}_Mist_Bridge_${String(index + 1).padStart(2, '0')}`,
      narrative: '相邻真实分镜间的世界薄雾连接，留白气口不盖住叙事主体',
      kind: 'drift', plane: 'XY', atmosphere: 'cloud', group: 'bridge', priority: 1,
      periodSeconds: 34 + index % 4 * 3, phase: index * 1.31,
      xRatio: .004, yRatio: .002, opacityAmplitude: .025,
    })),
  ];
}

/** The first-scroll sample has been shown and verified; subsequent scrolls now share its lifecycle. */
export const motionProfiles: Record<number, ChapterMotionProfile> = {
  1: firstScroll,
  2: {
    chapterId: 2, enabled: true, ambientFps: 30, maxVisibleBindings: 6, maxVisiblePerGroup: { petal: 2, bridge: 1 },
    bindings: [
      ...sharedAtmosphere(2, 7, 22),
      { meshName: '2-6 前景 牡丹花枝', narrative: '士族与民间静赏的春风，只摆独立花枝', kind: 'sway', plane: 'UV', group: 'legacy', priority: 2, periodSeconds: 24, phase: .8, pivot: [.5, 0], angleDegrees: .25 },
    ],
  },
  3: {
    chapterId: 3, enabled: true, ambientFps: 30, maxVisibleBindings: 6, maxVisiblePerGroup: { petal: 2, bridge: 1 },
    bindings: [
      ...sharedAtmosphere(3, 9, 27),
      ...['04_中部织锦飘带', '04_中部织锦飘带.001'].map((meshName, index): LayerMotionBinding => ({ meshName, narrative: '独立织锦连接带，器物与人物不动', kind: 'sway', plane: 'XY', group: 'legacy', priority: 2, periodSeconds: 26 + index * 3, phase: index * 1.2, pivot: [.12, .5], angleDegrees: .12 })),
      { meshName: 'SC06_16_红色灯笼', narrative: '完整单灯罩、挂钩与流苏轻摆，纹样仍为器物表面图案', kind: 'sway', plane: 'YZ', group: 'legacy', priority: 2, periodSeconds: 23, phase: .6, pivot: [.5, 1], angleDegrees: .25 },
      { meshName: 'SC06_通道右下花枝', narrative: '器物段独立花枝，桌案、铜镜、花瓶与首饰静止', kind: 'sway', plane: 'YZ', group: 'legacy', priority: 2, periodSeconds: 27, phase: 1.7, pivot: [.5, 0], angleDegrees: .12 },
      ...['左侧横向', '上左卷曲', '上右卷曲', '左下延展', '右下延展'].map((suffix, index): LayerMotionBinding => ({ meshName: `SC09_${String(index + 7).padStart(2, '0')}_飘带_${suffix}`, narrative: '卷尾浅绢连接带错相微摆，凤凰与器物纹样静止', kind: 'sway', plane: 'YZ', group: 'legacy', priority: 2, periodSeconds: 28 + index, phase: index * 1.1, pivot: [.5, .8], angleDegrees: .12 })),
      ...Array.from({ length: 8 }, (_, index): LayerMotionBinding => ({ meshName: `过渡${String(index + 1).padStart(2, '0')}_淡云水线1`, narrative: '既有淡云水脉细线，仅透明度轻呼吸，不移动几何', kind: 'opacityPulse', plane: 'CURVE', atmosphere: 'cloud', group: 'legacy', priority: 4, periodSeconds: 32 + index, phase: index * .9, opacityAmplitude: .025 })),
      ...Array.from({ length: 8 }, (_, index): LayerMotionBinding => ({ meshName: `TR${String(index + 1).padStart(2, '0')}_水波0`, narrative: '现有水线的轻浅色量变化，不摆动水面或地台', kind: 'opacityPulse', plane: 'CURVE', atmosphere: 'water', group: 'legacy', priority: 3, periodSeconds: 26 + index, phase: index * 1.1, opacityAmplitude: .025 })),
    ],
  },
  4: {
    chapterId: 4, enabled: true, ambientFps: 30, maxVisibleBindings: 6, maxVisiblePerGroup: { petal: 2, bridge: 1, legacy: 3 },
    narrativeEnvelope: {
      startStop: 4, tailStop: 7,
      points: [
        { stop: 4, clockSpeed: 1, petalDensity: 1, cloudDensity: 1 },
        { stop: 5, clockSpeed: .70, petalDensity: .62, cloudDensity: .72 },
        { stop: 6, clockSpeed: .52, petalDensity: .38, cloudDensity: .52 },
        { stop: 7, clockSpeed: .40, petalDensity: .18, cloudDensity: .34 },
        { stop: 8, clockSpeed: .32, petalDensity: .08, cloudDensity: .22 },
      ],
    },
    bindings: [
      ...sharedAtmosphere(4, 9, 23),
      { meshName: '07_红青飘带组合', narrative: '独立锦带体现前半盛美，后半随叙事节律收缓', kind: 'sway', plane: 'XY', group: 'legacy', priority: 2, periodSeconds: 26, phase: .8, pivot: [.15, .5], angleDegrees: .15 },
      { meshName: '4-3 · 06 · 近景花枝', narrative: '沉香亭花王意象的独立枝条，宫亭与人物稳定', kind: 'sway', plane: 'YZ', group: 'legacy', priority: 2, periodSeconds: 24, phase: 1.4, pivot: [.5, 0], angleDegrees: .18 },
      { meshName: '4-9 · 08 · 残花枝', narrative: '卷尾残花极缓，盛景难留而不继续丰盛飘瓣', kind: 'sway', plane: 'YZ', group: 'legacy', priority: 3, periodSeconds: 31, phase: 2.1, pivot: [.5, 0], angleDegrees: .06 },
      ...Array.from({ length: 8 }, (_, index): LayerMotionBinding => ({ meshName: `过渡${index + 1} · 云气1`, narrative: '绢白云气由盛转疏，源云层几何不改', kind: 'drift', plane: 'YZ', atmosphere: 'cloud', group: 'legacy', priority: 4, periodSeconds: 34 + index, phase: index * .9, xRatio: .003, zRatio: .001, opacityAmplitude: .02 })),
      ...Array.from({ length: 8 }, (_, index): LayerMotionBinding => ({ meshName: `过渡${index + 1} · 细金游丝`, narrative: '留白中的细金气脉线，只保留极浅呼吸，水面与故国残景稳定', kind: 'opacityPulse', plane: 'CURVE', atmosphere: 'water', group: 'legacy', priority: 1.5, periodSeconds: 35 + index, phase: index * .8, opacityAmplitude: .015 })),
    ],
  },
};

export function getMotionProfile(chapterId: number): ChapterMotionProfile {
  return motionProfiles[chapterId] ?? { chapterId, enabled: false, ambientFps: 30, maxVisibleBindings: 0, bindings: [] };
}
