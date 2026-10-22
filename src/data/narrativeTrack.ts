import type { StoryStop } from '../types';
import { narrativeChapters, type NarrativeParagraph } from './newNarrative';

export interface NarrativeCue {
  id: string;
  paragraphId: string;
  heading: string;
  text: string;
  start: number;
  end: number;
  paragraphIndex: number;
  partIndex: number;
  partCount: number;
  sourceNode: string;
}

/** Paragraph ranges follow the actual new Blender storyboard order.
 * Fractions divide one dense scene into consecutive reading passages. */
export const narrativeSceneRanges: Record<number, { sceneCount: number; ranges: [number, number][] }> = {
  1: { sceneCount: 15, ranges: [[0,2],[2,6],[6,9],[9,11],[11,13],[13,15]] },
  2: { sceneCount: 7, ranges: [[0,2],[2,4],[4,5],[5,5.58],[5.58,6],[6,7]] },
  3: { sceneCount: 9, ranges: [[0,2],[2,4],[4,6],[6,7],[7,8],[8,9]] },
  4: { sceneCount: 9, ranges: [[0,1],[1,2],[2,3],[3,4],[4,6],[6,8],[8,9]] },
};

/** Preserve every character of the supplied prose, including punctuation/spaces.
 * Short passages keep the lettering readable without covering a whole scene. */
export function splitNarrativeText(text: string, maximum = 68): string[] {
  const units = text.match(/[^，。！？；、]+[，。！？；、]?|[，。！？；、]/gu) ?? [text];
  const result: string[] = [];
  let current = '';
  for (const unit of units) {
    const chars = [...unit];
    if (current && [...current].length + chars.length > maximum) { result.push(current); current = ''; }
    while (chars.length > maximum) { result.push(chars.splice(0, maximum).join('')); }
    current += chars.join('');
  }
  if (current) result.push(current);
  return result.length ? result : [text];
}

export function buildNarrativeTrack(chapterId: number, stops: StoryStop[], maximum = 68): NarrativeCue[] {
  const chapter = narrativeChapters[chapterId], mapping = narrativeSceneRanges[chapterId];
  if (!chapter || !mapping) return [];
  const canonical = stops.filter(stop => !/参考全景/.test(stop.name)).slice(0, mapping.sceneCount);
  // In the new files, the last named scene precedes the final camera hold.
  // Retain that hold for the large concluding theme and seal.
  const end = .982;
  const sourceProgress = (index: number) => {
    if (index >= mapping.sceneCount) return end;
    const floor = Math.floor(index), fraction = index - floor;
    const progressAt = (i: number) => canonical[i]?.progress ?? (i / mapping.sceneCount * end);
    const a = Math.min(end, Math.max(0, progressAt(floor)));
    const b = floor + 1 >= mapping.sceneCount ? end : Math.min(end, Math.max(a, progressAt(floor + 1)));
    return a + (b - a) * fraction;
  };
  // Spatial camera normalization can compress an authored stationary scene to
  // almost one point (the revised third scroll's last two reading nodes do
  // this). Keep those node identities/order, but reserve a real reading window
  // across their approach and final hold. Earlier spacious intervals lend the
  // required room; no camera, Blender key or prose is changed.
  const characters = chapter.paragraphs.map(paragraph => Math.max(1, [...paragraph.text].length));
  const characterTotal = characters.reduce((total, count) => total + count, 0);
  const minimumSpans = characters.map(count => end * .7 * count / characterTotal);
  const boundaries = [...mapping.ranges.map(range => sourceProgress(range[0])), end];
  boundaries[0] = 0;
  for (let i = chapter.paragraphs.length - 1; i > 0; i--)
    boundaries[i] = Math.min(boundaries[i], boundaries[i + 1] - minimumSpans[i]);
  for (let i = 1; i < chapter.paragraphs.length; i++)
    boundaries[i] = Math.max(boundaries[i], boundaries[i - 1] + minimumSpans[i - 1]);
  return chapter.paragraphs.flatMap((paragraph: NarrativeParagraph, index) => {
    const range = mapping.ranges[index], passages = splitNarrativeText(paragraph.text, maximum);
    const start = boundaries[index], finish = boundaries[index + 1];
    // A short closing clause still needs time to finish its ink fade. Weighting
    // it as at least twelve characters preserves every original character and
    // the paragraph's boundaries at every responsive passage size.
    const weights = passages.map(text => Math.max(12, [...text].length));
    const total = weights.reduce((sum, count) => sum + count, 0);
    let consumed = 0;
    return passages.map((text, partIndex) => {
      const begin = consumed / Math.max(1, total); consumed += weights[partIndex];
      return { id: `${paragraph.id}-${partIndex + 1}`, paragraphId: paragraph.id, heading: paragraph.heading, text,
        start: start + (finish - start) * begin, end: start + (finish - start) * (consumed / Math.max(1, total)),
        paragraphIndex: index, partIndex, partCount: passages.length,
        sourceNode: canonical[Math.min(canonical.length - 1, Math.floor(range[0]))]?.name ?? paragraph.heading };
    });
  });
}

export function activeNarrativeCue(cues: NarrativeCue[], progress: number): NarrativeCue | null {
  if (!Number.isFinite(progress)) return null;
  return cues.find(cue => progress >= cue.start && progress < cue.end) ?? null;
}
