/** Texture UV coordinates: u points right, v points up, as in the source mesh. */
export interface ArtworkAnchorSpec {
  id: string;
  meshName: string;
  uv: [number, number];
}

/** Normalized coordinates in the actual painting canvas, after source framing. */
export interface ProjectedArtAnchor {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface ArtDetail {
  texture: string;
  center: [number, number];
  zoom: number;
  label: string;
}

export interface ArtEncounter {
  chapterId: number;
  id: string;
  title: string;
  invitation: string;
  progress: number;
  anchors: ArtworkAnchorSpec[];
}

/** These stops and UVs refer to the supplied peony 2.0 sheets, never page coordinates. */
export const artEncounters: ArtEncounter[] = [
  {
    chapterId: 1, id: 'legend', title: '一花，两种记忆', invitation: '辨读传说与史料',
    progress: 0.6510089315249752,
    anchors: [
      { id: 'legend-flower', meshName: '前景 · 04_火焰牡丹', uv: [0.54, 0.51] },
      { id: 'legend-record', meshName: '主体 · 01_宫廷女官与诏书', uv: [0.77, 0.665] },
    ],
  },
  {
    chapterId: 2, id: 'gaze', title: '共此一城春', invitation: '循花、舟、桥共赏春色',
    progress: 0.11250581125058112,
    anchors: [
      { id: 'gaze-flower', meshName: '02 · 05_右下角花丛与石头.png · 前景.002', uv: [0.605, 0.432] },
      { id: 'gaze-boat', meshName: '02 · 01_山水城镇.png · 远景', uv: [0.398, 0.185] },
      { id: 'gaze-bridge', meshName: '02 · 01_山水城镇.png · 远景', uv: [0.63, 0.38] },
    ],
  },
  {
    chapterId: 3, id: 'brocade', title: '选花入锦', invitation: '从一朵花，看见一幅锦绣',
    progress: 0.5805515239477503,
    anchors: [
      { id: 'brocade-flower', meshName: '06_中下花卉_03_中下花卉花瓶', uv: [0.413, 0.542] },
      { id: 'brocade-cloth', meshName: '05_左侧家人桌案_01_左下人物桌案组合', uv: [0.6765, 0.3704] },
    ],
  },
  {
    chapterId: 4, id: 'poem', title: '花容入诗', invitation: '展读画中《清平调》',
    progress: 0.3246247915508616,
    anchors: [
      { id: 'poem-paper', meshName: '03 · 04_右侧人物书案组.png · 中景', uv: [0.79, 0.31] },
    ],
  },
];

export const artDetails = {
  flower: { texture: '4f406a818d5f4a0a.webp', center: [0.413, 0.542], zoom: 2.7, label: '原画中的牡丹花心' },
  cloth: { texture: 'e2c01f7b1c66a607.webp', center: [0.6765, 0.3704], zoom: 3.35, label: '原画锦面上的牡丹纹样' },
  poem: { texture: '0bf031154de85f93.webp', center: [0.705, 0.2785], zoom: 3.8, label: '原画书案前悬挂的诗笺' },
} satisfies Record<string, ArtDetail>;

export const artSources = {
  legend: {
    title: '传说资料 · 北京市园林绿化局',
    url: 'https://yllhj.beijing.gov.cn/ztxx/bjhx/hhzs/201804/t20180425_118611.shtml',
  },
  record: {
    title: '北宋 · 欧阳修《洛阳牡丹记》',
    url: 'https://zh.wikisource.org/wiki/洛陽牡丹記_(歐陽修)',
  },
  museum: {
    title: '故宫 · 万紫千红',
    url: 'https://www.dpm.org.cn/subject_wanzi/',
  },
  poem: {
    title: '诗文 · 北京园林',
    url: 'https://yllhj.beijing.gov.cn/ztxx/bjhx/hhzs/201804/t20180425_118611.shtml',
  },
};
