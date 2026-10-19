import type { CameraSample, SceneManifest } from '../types';
import { sceneOptions } from '../data/sceneOptions';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Turns timed film holds into a continuous route, retaining the source viewpoints. */
export function prepareScene(source: SceneManifest, chapterId: number): SceneManifest {
  const settings = sceneOptions[chapterId];
  const firstStop = source.stops[0]?.progress ?? 0;
  const endProgress = settings?.readingEndFrame
    ? (settings.readingEndFrame - source.frameRange[0]) / (source.frameRange[1] - source.frameRange[0])
    : Math.min(1, (source.stops.at(-1)?.progress ?? 1) + 0.03);
  const interpolate = (progress: number): CameraSample => {
    const i = source.cameras.findIndex(sample => sample.progress >= progress);
    if (i <= 0) return { ...source.cameras[0], progress };
    const a = source.cameras[i - 1], b = source.cameras[i];
    const t = (progress - a.progress) / Math.max(0.000001, b.progress - a.progress);
    return {
      ...a, progress, frame: lerp(a.frame, b.frame, t),
      position: a.position.map((v, j) => lerp(v, b.position[j], t)) as [number, number, number],
      quaternion: a.quaternion.map((v, j) => lerp(v, b.quaternion[j], t)) as [number, number, number, number],
      fov: lerp(a.fov, b.fov, t),
    };
  };
  const samples = [interpolate(firstStop), ...source.cameras.filter(sample => sample.progress > firstStop && sample.progress < endProgress), interpolate(endProgress)];
  const axis = source.travel.axis === 'X' ? 0 : 1;
  const distances = [0];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1].position, b = samples[i].position;
    // Spatial distance replaces film time, so rolling the wheel never sits on a static hold.
    const delta = Math.abs(b[axis] - a[axis]) + 0.08 * Math.hypot(...a.map((v, j) => b[j] - v));
    distances.push(distances[i - 1] + Math.max(0.00001, delta));
  }
  const total = distances.at(-1) || 1;
  const cameras = samples.map((sample, i) => ({ ...sample, sourceProgress: sample.progress, progress: distances[i] / total }));
  const mapProgress = (sourceProgress: number) => {
    if (sourceProgress <= firstStop) return 0;
    if (sourceProgress >= endProgress) return 1;
    const index = samples.findIndex(sample => sample.progress >= sourceProgress);
    const a = samples[index - 1], b = samples[index];
    const t = (sourceProgress - a.progress) / Math.max(0.00001, b.progress - a.progress);
    return clamp(lerp(cameras[index - 1].progress, cameras[index].progress, t));
  };
  const readableName = (name: string) => {
    const clean = name.replace(/^\d+\s*稳定阅读[·・]?/, '').replace(/\s*[·・]\s*阅读停留$/, '').replace(/^\d+-\d+\s*/, '');
    if (/^\d+-\d+\s*阅读$/.test(name)) {
      const prefix = name.split(' ')[0];
      const enter = source.markers.find(marker => marker.name.startsWith(`${prefix} `) && /进入/.test(marker.name));
      if (enter) return enter.name.replace(/^\d+-\d+\s*/, '').replace(/\s*进入$/, '');
    }
    if (/^SC\d+_阅读$/.test(name)) return `第${['一','二','三','四','五','六','七','八','九'][Number(name.slice(2,4)) - 1] ?? name.slice(2,4)}景`;
    return clean;
  };
  return { ...source, cameras, stops: source.stops.map(stop => ({ ...stop, name: readableName(stop.name), progress: mapProgress(stop.progress) })) };
}
