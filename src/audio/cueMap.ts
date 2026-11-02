/** Sound direction for the actual peony-2.0-2026-10-23 source stops.
 * These are contemporary digital colors, not a reconstruction of Tang music.
 * A=short string phrases, B=harmonic/breath answers, C=unpitched atmosphere.
 * Boundaries refer to authored camera time; reading and narration duck use live UI state. */
export interface SoundscapeInput { phase: string; chapterId: number; progress: number; reading: boolean; narration: boolean }
export type Levels = readonly [number, number, number];
export interface SoundRegion { end: number; name: string; levels: Levels; cutoff: number }
export const soundRegions: Record<number, readonly SoundRegion[]> = {
  1: [
    { end: .1349652663, name: '女帝与牡丹', levels: [.20, 0, .30], cutoff: 5100 },
    { end: .3810783989, name: '山野芳踪', levels: [.35, .10, .45], cutoff: 5400 },
    { end: .5795567317, name: '花入御苑', levels: [.55, .25, .20], cutoff: 6200 },
    { end: .7859741978, name: '史传之间', levels: [.15, .05, .15], cutoff: 4500 },
    { end: .982, name: '洛阳花信', levels: [.35, .30, .25], cutoff: 5600 },
  ],
  2: [
    { end: .2756857276, name: '春色出宫墙', levels: [.30, .05, .20], cutoff: 5300 },
    { end: .5871687587, name: '私园春水', levels: [.45, .18, .25], cutoff: 5900 },
    { end: .7438400744, name: '游赏赋诗', levels: [.55, .30, .20], cutoff: 6500 },
    { end: .982, name: '朝野共赏', levels: [.30, .18, .30], cutoff: 5600 },
  ],
  3: [
    { end: .2322206096, name: '吉祥入生活', levels: [.25, .08, .15], cutoff: 4900 },
    { end: .4644412192, name: '凤穿牡丹', levels: [.38, .32, .15], cutoff: 5600 },
    { end: .6966618287, name: '岁岁圆满', levels: [.42, .35, .20], cutoff: 5900 },
    { end: .8127721335, name: '器物与太平', levels: [.25, .18, .15], cutoff: 5100 },
    { end: .982, name: '端庄与自持', levels: [.20, .10, .12], cutoff: 4600 },
  ],
  4: [
    { end: .2134519177, name: '人花相映', levels: [.45, .20, .15], cutoff: 5800 },
    { end: .4252362424, name: '沉香亭畔', levels: [.60, .35, .15], cutoff: 6600 },
    { end: .6409116176, name: '盛景渐远', levels: [.08, 0, .12], cutoff: 3200 },
    { end: .8749305170, name: '繁花寄慨', levels: [.18, .12, .20], cutoff: 4300 },
    { end: .982, name: '千古余韵', levels: [.28, .20, .15], cutoff: 4900 },
  ],
};
export function soundRegion(input: SoundscapeInput): SoundRegion {
  if (input.phase === 'HOME') return { end: 1, name: '一庭春深', levels: [.12, .06, .24], cutoff: 4700 };
  if (input.phase === 'RETURNING_HOME') return { end: 1, name: '归庭', levels: [.10, .04, .20], cutoff: 4500 };
  if (input.phase !== 'SCROLL_VIEWER') return { end: 1, name: '徐徐启卷', levels: [.10, .04, .26], cutoff: 4600 };
  if (input.progress >= .982) return { end: 1, name: '留白', levels: [.025, 0, .10], cutoff: 3800 };
  const regions = soundRegions[input.chapterId] ?? soundRegions[1];
  return regions.find(region => input.progress < region.end) ?? regions[regions.length - 1];
}
