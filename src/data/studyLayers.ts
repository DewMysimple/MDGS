const base = `${import.meta.env.BASE_URL}ui/study-layered/`;
export const studyLayers = {
  garden: `${base}distant-garden.webp`, room: `${base}room-frame.webp`, desk: `${base}desk.webp`,
  scrolls: `${base}scrolls.webp`, foreground: `${base}foreground.webp`, title: `${base}title-compact.webp`,
};
// Source sprite bounds and polygon cuts isolate each painted scroll from its neighbours.
export const layeredScrolls = [
  { id: 1, left: 3.8, width: 28.5, plaque: 44, source: [0, 330, 535, 380], clip: '0% 100%,0% 73%,27% 31%,38% 0%,77% 12%,100% 20%,81% 100%' },
  { id: 2, left: 28.5, width: 22, plaque: 49, source: [445, 350, 410, 355], clip: '0% 100%,0% 84%,20% 27%,36% 0%,76% 5%,100% 18%,100% 100%' },
  { id: 3, left: 51.5, width: 22.3, plaque: 50, source: [850, 375, 418, 335], clip: '0% 100%,0% 10%,56% 0%,77% 4%,100% 94%,100% 100%' },
  { id: 4, left: 68.8, width: 28.5, plaque: 58, source: [1150, 365, 522, 345], clip: '23% 100%,0% 15%,13% 0%,68% 7%,100% 70%,100% 100%' },
] as const;
