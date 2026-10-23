/** Original foyer artwork; independent from the four authored worlds. */
const root = `${import.meta.env.BASE_URL}ui/peony-atlas/`;
export const atlasArt = {
  landscape: `${root}landscape.webp`,
  peonies: `${root}cinnabar-peonies.webp`,
  branch: `${root}ivory-branch.webp`,
  title: `${root}title.webp`,
} as const;

export const atlasChapters = [
  { id: 1, motif: '一枝傲骨', route: '山野 · 御苑', line: '花的身世，写在神都春色与民间传说之间。', colour: '#80513e' },
  { id: 2, motif: '满城春色', route: '宫墙 · 人间', line: '越过宫墙，让一城春色与人共赏。', colour: '#586e61' },
  { id: 3, motif: '花开圆满', route: '花朵 · 锦绣', line: '花入器物，也入寻常人家的心愿。', colour: '#8f655b' },
  { id: 4, motif: '千年余韵', route: '诗意 · 国色', line: '人花相映，繁华与追忆都留在一卷之中。', colour: '#947c4c' },
] as const;
