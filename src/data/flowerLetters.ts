/** Contemporary lines written for the visitor's colophon, not attributed verse. */
export const flowerLetters = [
  { id: 'resolve', word: '风骨', lines: ['不负春光', '不改初心'], chapter: 1 },
  { id: 'together', word: '共赏', lines: ['春色无边', '愿与君同'], chapter: 2 },
  { id: 'reunion', word: '圆满', lines: ['花开圆满', '岁岁安宁'], chapter: 3 },
  { id: 'echo', word: '余韵', lines: ['繁花有信', '诗意长存'], chapter: 4 },
] as const;
export type FlowerLetter = typeof flowerLetters[number];
