/** Local, transparent artwork layers from the corresponding scrolls. */
export interface FlowerLetterDesign {
  id: string;
  name: string;
  image: string;
}

const root = `${import.meta.env.BASE_URL}ui/peony-atlas/flower-letters/`;

const designs: readonly (readonly FlowerLetterDesign[])[] = [
  [
    { id: 'mountain-memory', name: '山河入画', image: `${root}mountain-memory.webp` },
    { id: 'imperial-spring', name: '宫阙春深', image: `${root}imperial-spring.webp` },
  ],
  [
    { id: 'flower-market', name: '市井花开', image: `${root}flower-market.webp` },
    { id: 'garden-water', name: '春满庭园', image: `${root}garden-water.webp` },
  ],
  [
    { id: 'brocade-desk', name: '锦案流芳', image: `${root}brocade-desk.webp` },
    { id: 'phoenix-screen', name: '凤屏花影', image: `${root}phoenix-screen.webp` },
  ],
  [
    { id: 'sunset-mountains', name: '山河余韵', image: `${root}sunset-mountains.webp` },
    { id: 'peony-screen', name: '花屏留香', image: `${root}peony-screen.webp` },
  ],
];

export function getFlowerLetterDesigns(chapterId: number): readonly FlowerLetterDesign[] {
  return designs[chapterId - 1] ?? designs[0];
}
