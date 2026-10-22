import type { SceneManifest } from '../types';

export type SourceTiming = Pick<SceneManifest, 'sourceRevision' | 'frameRange' | 'fps' | 'fpsBase' | 'sourceDurationSeconds'>;

/** Source frame endpoints define elapsed film time; fps_base is Blender's rate denominator. */
export function sourceDuration(timing: SourceTiming | undefined, legacyDuration: number): number {
  if (!timing?.sourceRevision) return legacyDuration;
  const frames = timing.frameRange[1] - timing.frameRange[0];
  const duration = frames * (timing.fpsBase ?? 1) / timing.fps;
  if (!(duration > 0) || !Number.isFinite(duration)) throw new Error('画卷源时轴无效。');
  return duration;
}

/** Wall time is retained even when a browser cannot draw every authored frame. */
export function advanceSourceProgress(progress: number, elapsedSeconds: number, duration: number): number {
  return Math.min(1, Math.max(0, progress + Math.max(0, elapsedSeconds) / duration));
}
