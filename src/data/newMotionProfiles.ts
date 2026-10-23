import type { ChapterMotionProfile, LayerMotionBinding } from './motionProfiles';

/** Exact object identities reviewed against the revised Blender texture pixels.
 * Composite palace, figure, market, flower-and-rock and bird-and-ribbon plates
 * are intentionally absent, even when their names contain environmental words. */
export const reviewedNewNativeMotion: Record<number, string[]> = {
  1: [
    '前景 · 08_飘落花瓣',
    '前景 · 08_飘落花瓣.001', '前景 · 08_飘落花瓣.002',
    '前景 · 08_飘落花瓣.003', '前景 · 08_飘落花瓣.004',
    '前景 · 08_飘落花瓣.005', '前景 · 08_飘落花瓣.006',
    '前景 · 08_飘落花瓣.007', '前景 · 08_飘落花瓣.008',
    '前景 · 08_飘落花瓣.009', '前景 · 08_飘落花瓣.010',
    '前景 · 08_飘落花瓣.011', '前景 · 08_飘落花瓣.012',
    '前景 · 08_飘落花瓣.013', '前景 · 08_飘落花瓣.014',
    '前景 · 08_飘落花瓣.015', '前景 · 08_飘落花瓣.018',
  ],
  2: [],
  3: [
    '04_中部织锦飘带',
    '08_左上花灯_16_红色灯笼',
    '07_横向飘带_07_飘带_左侧横向',
    '09_右上卷曲飘带_09_飘带_上右卷曲',
    '10_左下飘带_10_飘带_左下延展',
    '10_左下飘带_10_飘带_左下延展.001',
    '07_横向飘带_07_飘带_左侧横向.001',
  ],
  4: [],
};

/** A renamed source file is not sufficient evidence to reuse a motion binding. */
export const nativeMotionReviewRevision = 'peony-2.0-2026-10-22';

export function createNewMotionProfile(chapterId: number, petals: LayerMotionBinding[] = [], sourceRevision = nativeMotionReviewRevision): ChapterMotionProfile {
  const native = (sourceRevision === nativeMotionReviewRevision ? reviewedNewNativeMotion[chapterId] ?? [] : []).map((meshName, index): LayerMotionBinding => ({
    meshName,
    narrative: chapterId === 1 ? '原画独立花瓣轻漂；相机与源姿态轨道保持。' : '经像素审阅的独立丝带或单灯，小幅缓摆。',
    kind: chapterId === 1 ? 'drift' : 'sway', plane: 'UV', uvDomain: 'current',
    group: 'legacy', priority: 1, periodSeconds: 15 + index % 5 * 1.7,
    phase: index * 1.79, pivot: chapterId === 1 ? [.5, .5] : [.5, .95],
    // The new planes use different local axes; signed UV basis handles them.
    xRatio: chapterId === 1 ? .055 : .0007,
    zRatio: chapterId === 1 ? .08 : .001,
    angleDegrees: chapterId === 1 ? 1.7 : meshName === '08_左上花灯_16_红色灯笼' ? .65 : .24,
  }));
  return {
    chapterId, enabled: true, ambientFps: 30,
    maxVisibleBindings: 3, maxVisiblePerGroup: { petal: 2, legacy: 1, bridge: 0 },
    bindings: [...petals, ...native],
    ...(chapterId === 4 ? {
      narrativeEnvelope: {
        startStop: 4, tailStop: 8,
        points: [
          { stop: 4, clockSpeed: .85, petalDensity: .85, cloudDensity: 1 },
          { stop: 5, clockSpeed: .72, petalDensity: .66, cloudDensity: 1 },
          { stop: 6, clockSpeed: .58, petalDensity: .44, cloudDensity: 1 },
          { stop: 7, clockSpeed: .44, petalDensity: .28, cloudDensity: 1 },
          { stop: 8, clockSpeed: .32, petalDensity: .18, cloudDensity: 1 },
        ],
      },
    } : {}),
  };
}
