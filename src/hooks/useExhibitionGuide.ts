import { useCallback, useEffect, useState } from 'react';
import type { GuideOverlayStep } from '../components/GuideOverlay';
import type { JourneyPhase } from './useStudyJourney';

type GuideStage = 'home' | 'viewer' | 'ending';
type GuideProgress = Record<GuideStage, boolean>;
const guideKey = 'guose-fanghua:exhibition-guide:v1';
const emptyProgress = (): GuideProgress => ({ home: false, viewer: false, ending: false });

const steps: Record<GuideStage, GuideOverlayStep[]> = {
  home: [
    { selector: '.audio-control--foyer .audio-button', title: '听春 · 声景', description: '开启或关闭原创声景；开启后还可以调节音量。' },
    { selector: '[data-guide="home-preface"]', title: '作品序言', description: '在这里读一读作品的缘起和创作思路。' },
    { selector: '[data-guide="home-guide"]', title: '观展指南', description: '这里收录了游观画卷、画中互动和留笺的方法。' },
    { selector: '[data-guide="home-motion"]', title: '风物轻动', description: '随心开启或关闭首页花影与环境中的轻动。' },
    { selector: '.atlas-settings', title: '设置', description: '可调整画质、帧率、文字和游观方式。' },
    { selector: '.atlas-begin', title: '启卷 · 入画', description: '从第一卷出发，让画卷徐徐展开。' },
    { selector: '.atlas-chapter-grid', title: '择卷而入', description: '四卷可以自由选择。进入画卷后，还有更多游观指引。' },
  ],
  viewer: [
    { selector: '.poetic-viewer .brand', title: '返回序厅', description: '点击这里可以回到首页，重新选择画卷。' },
    { selector: '.poetic-viewer .chapter-nav', title: '四卷导航', description: '随时在四卷之间切换，寻访不同的牡丹故事。' },
    { selector: '.poetic-viewer .settings-button', title: '游观设置', description: '调整画质、帧率、文字和滚动手感，让画卷更适合你。' },
    { selector: '.poetic-viewer .fullscreen-button', title: '全屏观画', description: '展开画卷全屏欣赏；按 Esc 或点击退出可返回。' },
    { selector: '.poetic-viewer .chapter-timeline', title: '画卷进度', description: '拖动进度线或点击分镜，可以前往想看的画面。' },
    { selector: '.poetic-viewer .playback-controls', title: '游观画卷', description: '点击自动展卷跟随画面前行，也可切换上一景或下一景。' },
    { selector: '.poetic-viewer .art-encounter-entrance', title: '画中有遇', description: '点击后前往画中的互动，亲手发现花事与故事。' },
    { selector: '.audio-control--viewer .audio-button', title: '听春 · 声景', description: '随时开启或关闭声景，开启后可调整音量。' },
    { selector: '[data-guide="viewer-culture"]', title: '画外拾遗', description: '打开文化解读，探访画卷背后的花事与文献。卷末还有留笺等你发现。' },
  ],
  ending: [
    { selector: '.end-colophon .colophon-keepsake', title: '留一笺春色', description: '在卷末择一份心意，钤印并保存属于你的花笺。' },
    { selector: '[data-guide="ending-replay"]', title: '再观此卷', description: '回到这一卷的开头，再次漫游画中风景。' },
    { selector: '[data-guide="ending-next"]', title: '继续游观', description: '展开下一卷；全部指引结束后，可在顶部重新查看。' },
  ],
};

function readProgress(): GuideProgress {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(guideKey) ?? 'null');
    if (saved && typeof saved === 'object') {
      const value = saved as Partial<GuideProgress>;
      return { home: value.home === true, viewer: value.viewer === true, ending: value.ending === true };
    }
  } catch { /* A blocked or malformed store should not prevent viewing. */ }
  return emptyProgress();
}

interface Options {
  phase: JourneyPhase;
  homeReady: boolean;
  finished: boolean;
  fullscreen: boolean;
  dialogOpen: boolean;
}

/** Each part is introduced once, when the viewer actually arrives there. */
export function useExhibitionGuide({ phase, homeReady, finished, fullscreen, dialogOpen }: Options) {
  const [completed, setCompleted] = useState(readProgress);
  // A replay is scoped to this visit. The original completion record remains
  // intact if the viewer leaves before revisiting every scene.
  const [replayPending, setReplayPending] = useState<GuideProgress | null>(null);
  const [stage, setStage] = useState<GuideStage | null>(null);
  const [index, setIndex] = useState(0);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(guideKey, JSON.stringify(completed)); }
    catch { /* The current visit still keeps progress in memory. */ }
  }, [completed]);

  const seen = replayPending ?? completed;
  const location: GuideStage | null = phase === 'HOME' && homeReady ? 'home'
    : phase === 'SCROLL_VIEWER' && !fullscreen ? (finished && seen.viewer ? 'ending' : 'viewer') : null;

  useEffect(() => {
    if (stage && (dialogOpen || fullscreen || (stage === 'home' ? phase !== 'HOME' : phase !== 'SCROLL_VIEWER')
      || stage === 'ending' && !finished)) {
      setStage(null); setIndex(0);
    }
  }, [dialogOpen, finished, fullscreen, phase, stage]);

  useEffect(() => {
    if (stage || !location || seen[location] || dialogOpen || !pageVisible) return;
    let timer: number;
    let cancelled = false;
    const begin = () => {
      if (cancelled) return;
      // An open native note dialog is in the browser top layer, above portals.
      // Wait until it is closed rather than trapping the reader beneath it.
      if (document.hidden || document.querySelector('dialog[open]')) { timer = window.setTimeout(begin, 400); return; }
      setIndex(0); setStage(location);
    };
    timer = window.setTimeout(begin, 100);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [dialogOpen, location, pageVisible, seen, stage]);

  const advance = useCallback(() => {
    if (!stage) return;
    if (index + 1 < steps[stage].length) { setIndex(index + 1); return; }
    setCompleted(previous => ({ ...previous, [stage]: true }));
    setReplayPending(previous => {
      if (!previous) return null;
      const next = { ...previous, [stage]: true };
      return next.home && next.viewer && next.ending ? null : next;
    });
    setStage(null); setIndex(0);
  }, [index, stage]);

  const replay = useCallback(() => {
    setReplayPending(emptyProgress());
    setIndex(0);
    // Reintroduce the current scene now; later scenes are introduced on arrival.
    setStage(phase === 'HOME' ? 'home' : 'viewer');
  }, [phase]);

  return {
    active: stage !== null,
    step: stage ? steps[stage][index] : null,
    index, count: stage ? steps[stage].length : 0,
    showReplay: completed.home || completed.viewer || completed.ending,
    advance, replay,
  };
}
