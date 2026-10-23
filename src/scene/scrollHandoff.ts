export interface ArtworkRect { left: number; top: number; width: number; height: number }

export const smoothFraction = (value: number) => {
  const p = Math.max(0, Math.min(1, value)); return p * p * (3 - 2 * p);
};

/** Recorded camera gate is in canvas CSS pixels, never GPU pixels. */
export function readViewerArtworkRect(): ArtworkRect | null {
  const canvas = document.querySelector<HTMLCanvasElement>('.painting .scene-viewport canvas[data-source-viewport]');
  if (!canvas || !canvas.clientWidth || !canvas.clientHeight) return null;
  try {
    const view = JSON.parse(canvas.dataset.sourceViewport ?? '') as { x: number; y: number; width: number; height: number };
    if (![view.x, view.y, view.width, view.height].every(Number.isFinite) || view.width <= 0 || view.height <= 0) return null;
    const bounds = canvas.getBoundingClientRect(), sx = bounds.width / canvas.clientWidth, sy = bounds.height / canvas.clientHeight;
    return { left: bounds.left + view.x * sx, top: bounds.top + view.y * sy, width: view.width * sx, height: view.height * sy };
  } catch { return null; }
}
export function interpolateArtworkRect(from: ArtworkRect, to: ArtworkRect, fraction: number): ArtworkRect {
  const lerp = (a: number, b: number) => a + (b - a) * fraction;
  return { left: lerp(from.left, to.left), top: lerp(from.top, to.top), width: lerp(from.width, to.width), height: lerp(from.height, to.height) };
}

/** Choreography only; download/first-frame/minimum-time gates remain in useStudyJourney. */
export function scrollHandoffFrame(phase: string, elapsed: number, reduced: boolean) {
  const revealMs = reduced ? 140 : 250, enteringMs = reduced ? 140 : 400, total = revealMs + enteringMs;
  const clock = phase === 'PAINTING_REVEAL' ? elapsed * 1000 : phase === 'ENTERING_VIEWER' ? revealMs + elapsed * 1000 : 0;
  const start = reduced ? 20 : 100, end = reduced ? 150 : 440;
  return { active: ['PAINTING_REVEAL', 'ENTERING_VIEWER'].includes(phase), clock,
    straighten: smoothFraction(clock / start),
    travel: reduced ? 1 : smoothFraction((clock - start) / (end - start)),
    imageOpacity: clock >= start ? (reduced ? smoothFraction((clock - start) / 70) : 1) * (1 - smoothFraction((clock - end) / (total - end))) : 0,
    stageOpacity: 1 - smoothFraction((clock - start) / (reduced ? 70 : 100)),
    groundOpacity: 1 - smoothFraction((clock - end) / (total - end)), durationMs: total };
}
