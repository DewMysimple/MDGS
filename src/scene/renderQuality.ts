export type RenderQuality = '720p' | '1080p' | '2k';
export type { FrameRateLimit } from './FramePacer';

export interface RenderQualityProfile {
  readonly maxPixels: number;
  readonly maxEdge: number;
  readonly sourceSupersampling: number;
  readonly filmSamplesPerAxis: number;
  readonly dofSamples: number;
  readonly shadowMapSize: number;
  readonly shadowSamples: number;
  readonly sunSamples: number;
  readonly areaSamples: number;
  /** Zero keeps the original decoded image. Numeric DataTextures always bypass this. */
  readonly imageMaxEdge: number;
}

const profiles: Record<RenderQuality, RenderQualityProfile> = {
  '720p': { maxPixels: 1280 * 720, maxEdge: 1280, sourceSupersampling: 1,
    filmSamplesPerAxis: 2, dofSamples: 8, shadowMapSize: 1024, shadowSamples: 4, sunSamples: 4, areaSamples: 8, imageMaxEdge: 1024 },
  '1080p': { maxPixels: 1920 * 1080, maxEdge: 1920, sourceSupersampling: 1.5,
    filmSamplesPerAxis: 4, dofSamples: 16, shadowMapSize: 1536, shadowSamples: 8, sunSamples: 8, areaSamples: 16, imageMaxEdge: 2048 },
  '2k': { maxPixels: 2560 * 1440, maxEdge: 2560, sourceSupersampling: 2,
    filmSamplesPerAxis: 6, dofSamples: 32, shadowMapSize: 2048, shadowSamples: 16, sunSamples: 16, areaSamples: 32, imageMaxEdge: 0 },
};

export function renderQualityProfile(quality: RenderQuality): RenderQualityProfile {
  return profiles[quality];
}

/** Keep responsive layout coordinates while bounding the actual drawing buffer.
 * Ultrawide/portrait windows retain their aspect within both limits. */
export function renderPixelRatio(width: number, height: number, requestedRatio: number, quality: RenderQuality): number {
  if (![width, height, requestedRatio].every(Number.isFinite) || width < 0 || height < 0 || requestedRatio <= 0) {
    throw new Error('画卷绘制尺寸无效。');
  }
  const w = Math.max(1, width), h = Math.max(1, height), profile = renderQualityProfile(quality);
  return Math.min(requestedRatio, profile.maxEdge / w, profile.maxEdge / h, Math.sqrt(profile.maxPixels / (w * h)));
}
