import type { FrameRateLimit, RenderQuality } from '../scene/renderQuality';

export interface ChapterViewingSettings {
  /** Percent of the whole scroll travelled by 100 CSS pixels of wheel input. */
  wheelSpeed: number;
  smoothingMs: number;
}

export type NarrativeMode = 'poetic' | 'original' | 'quiet';

export interface ViewerSettings {
  version: 2;
  renderQuality: RenderQuality;
  /** Rendering cadence ceiling; device performance can yield fewer frames. */
  frameRateLimit: FrameRateLimit;
  narrativeMode: NarrativeMode;
  /** Equal left/right paper gutter as a percent of the painting width. */
  sideMarginPercent: number;
  chapters: Record<number, ChapterViewingSettings>;
  textPlate: { color: string; opacity: number; padding: number; radius: number; borderOpacity: number };
}

export const viewerSettingsKey = 'guose-fanghua:viewer-settings:v2';
export const textPlateColors = [
  { value: '#f7efdf', label: '米白' }, { value: '#fffaf0', label: '素纸' },
  { value: '#efe1c3', label: '暖绢' }, { value: '#e7ede4', label: '浅玉' }, { value: '#eae8e2', label: '素灰' },
] as const;
export const settingLimits = {
  wheelSpeed: { min: 0.1, max: 2, step: 0.05 },
  smoothingMs: { min: 60, max: 500, step: 10 },
  sideMarginPercent: { min: 0, max: 18, step: 0.5 },
  opacity: { min: 0.2, max: 1, step: 0.01 },
  padding: { min: 4, max: 24, step: 1 },
  radius: { min: 0, max: 20, step: 1 },
  borderOpacity: { min: 0, max: 0.6, step: 0.01 },
} as const;

export function defaultViewerSettings(): ViewerSettings {
  return {
    version: 2,
    renderQuality: '720p',
    frameRateLimit: 30,
    narrativeMode: 'poetic',
    sideMarginPercent: 8,
    chapters: Object.fromEntries([1, 2, 3, 4].map(id => [id, { wheelSpeed: 0.5, smoothingMs: 180 }])),
    textPlate: { color: '#f7efdf', opacity: 0.8, padding: 12, radius: 0, borderOpacity: 0 },
  };
}

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function bounded(value: unknown, fallback: number, limits: { min: number; max: number }) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(limits.min, Math.min(limits.max, value)) : fallback;
}

/** Storage is untrusted: old or malformed settings must never break viewing. */
export function sanitizeViewerSettings(value: unknown): ViewerSettings {
  const result = defaultViewerSettings(), source = record(value);
  if (source.version !== 2) return result;
  if (source.renderQuality === '720p' || source.renderQuality === '1080p' || source.renderQuality === '2k') result.renderQuality = source.renderQuality;
  if (source.frameRateLimit === 30 || source.frameRateLimit === 60) result.frameRateLimit = source.frameRateLimit;
  if (source.narrativeMode === 'poetic' || source.narrativeMode === 'original' || source.narrativeMode === 'quiet') result.narrativeMode = source.narrativeMode;
  result.sideMarginPercent = bounded(source.sideMarginPercent, result.sideMarginPercent, settingLimits.sideMarginPercent);
  const chapters = record(source.chapters), plate = record(source.textPlate);
  for (const id of [1, 2, 3, 4]) {
    const chapter = record(chapters[id]);
    result.chapters[id].wheelSpeed = bounded(chapter.wheelSpeed, result.chapters[id].wheelSpeed, settingLimits.wheelSpeed);
    result.chapters[id].smoothingMs = bounded(chapter.smoothingMs, result.chapters[id].smoothingMs, settingLimits.smoothingMs);
  }
  if (textPlateColors.some(color => color.value === plate.color)) result.textPlate.color = plate.color as string;
  for (const key of ['opacity', 'padding', 'radius', 'borderOpacity'] as const) {
    result.textPlate[key] = bounded(plate[key], result.textPlate[key], settingLimits[key]);
  }
  return result;
}

export function readViewerSettings(): ViewerSettings {
  try { return sanitizeViewerSettings(JSON.parse(localStorage.getItem(viewerSettingsKey) ?? 'null')); }
  catch { return defaultViewerSettings(); }
}

export function textPlateVariables(settings: ViewerSettings): Record<string, string> {
  const { color, opacity, padding, radius, borderOpacity } = settings.textPlate;
  return {
    '--text-plate-rgb': [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16)).join(' '),
    '--text-plate-opacity': String(opacity),
    '--text-plate-padding': `${padding}px`,
    '--text-plate-radius': `${radius}px`,
    '--text-plate-border-opacity': String(borderOpacity),
  };
}
