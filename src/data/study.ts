/** All coordinates are measured against the unmodified 1672 × 941 reference. */
export const studyImage = `${import.meta.env.BASE_URL}ui/study/study-original.png`;
export const studyGarden = `${import.meta.env.BASE_URL}ui/study/loading-garden.png`;
export const studyPainting = (id: number) => id === 1 ? studyGarden : `${import.meta.env.BASE_URL}ui/study/painting-${id}.png`;

export const studyScrolls = [
  { id: 1, points: '323,447 544,478 449,683 447,715 301,717 300,786 265,812 230,786 229,716 76,714 76,669 194,624', x: 316, y: 575 },
  { id: 2, points: '601,448 808,478 822,676 819,715 688,716 687,785 651,812 618,785 618,715 477,715 477,672', x: 655, y: 576 },
  { id: 3, points: '862,477 1092,467 1186,666 1208,687 1194,716 1078,717 1078,785 1042,812 1008,785 1007,717 863,714', x: 1035, y: 574 },
  { id: 4, points: '1132,477 1367,477 1588,663 1612,689 1600,716 1462,716 1460,785 1428,812 1393,785 1393,716 1246,715', x: 1370, y: 577 },
] as const;
