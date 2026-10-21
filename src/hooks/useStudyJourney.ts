import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScenePreparationState } from '../components/ScrollViewport';
import { studyGarden, studyPainting } from '../data/study';

export type JourneyPhase = 'HOME' | 'SCROLL_AWAKENING' | 'CAMERA_ENTERING' | 'ARTISTIC_TRANSITION' | 'SCROLL_LOADING' | 'PAINTING_REVEAL' | 'ENTERING_VIEWER' | 'SCROLL_VIEWER' | 'RETURNING_HOME';
export function chapterFromHash(hash = window.location.hash) {
  const match = /^#chapter-([1-4])$/.exec(hash);
  return match ? Number(match[1]) : null;
}
const initialPreparation: ScenePreparationState = { stage: 'manifest', loaded: 0, total: 0, message: '正在铺陈千年风华……' };

/** Animation time never masquerades as download progress. The renderer owns readiness. */
export function useStudyJourney(onLeave: () => void) {
  const [chapterId, setChapterId] = useState(() => chapterFromHash() ?? 1);
  const [phase, setPhase] = useState<JourneyPhase>(() => chapterFromHash() ? 'SCROLL_LOADING' : 'HOME');
  const [attempt, setAttempt] = useState(0);
  const [preparation, setPreparation] = useState(initialPreparation);
  const [ready, setReady] = useState(false);
  const [minimumShown, setMinimumShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artReady, setArtReady] = useState(false);
  const [artError, setArtError] = useState<string | null>(null);
  const phaseRef = useRef(phase);
  const routedUrl = useRef(window.location.href);
  phaseRef.current = phase;
  const leaveRef = useRef(onLeave);
  leaveRef.current = onLeave;
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    let alive = true;
    setArtReady(false); setArtError(null);
    const sources = [...new Set([studyGarden, studyPainting(chapterId)])];
    Promise.all(sources.map(src => { const image = new Image(); image.src = src; return image.decode(); }))
      .then(() => { if (alive) { setArtReady(true); setArtError(null); } })
      .catch(() => { if (alive) setArtError('画境底图暂未载入，请重试展卷。'); });
    return () => { alive = false; };
  }, [attempt, chapterId]);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const resetPreparation = useCallback(() => {
    setReady(false); setError(null); setPreparation(initialPreparation); setMinimumShown(false);
    setAttempt(value => value + 1);
  }, []);

  const enter = useCallback((id: number, fromHistory = false) => {
    if (id < 1 || id > 4 || !Number.isInteger(id)) return;
    leaveRef.current();
    resetPreparation();
    setChapterId(id);
    const nextPhase = fromHistory ? 'SCROLL_LOADING' : 'SCROLL_AWAKENING';
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
    if (!fromHistory) history.pushState(null, '', `#chapter-${id}`);
    routedUrl.current = window.location.href;
  }, [resetPreparation]);

  const select = useCallback((id: number) => {
    if (!['HOME', 'SCROLL_VIEWER'].includes(phaseRef.current)) return;
    enter(id);
  }, [enter]);

  const returnHome = useCallback((fromHistory = false) => {
    if (phaseRef.current === 'HOME' || phaseRef.current === 'RETURNING_HOME') return;
    leaveRef.current();
    phaseRef.current = 'RETURNING_HOME';
    setPhase('RETURNING_HOME');
    setError(null); setReady(false);
    if (!fromHistory) history.pushState(null, '', window.location.pathname + window.location.search);
    routedUrl.current = window.location.href;
  }, []);

  useEffect(() => {
    // popstate handles history traversal; hashchange additionally supports pasted anchors.
    const navigate = () => {
      if (routedUrl.current === window.location.href) return;
      routedUrl.current = window.location.href;
      const id = chapterFromHash();
      if (id) enter(id, true);
      else returnHome(true);
    };
    window.addEventListener('popstate', navigate);
    // Browser traversal fires both events; the recorded URL deduplicates them.
    window.addEventListener('hashchange', navigate);
    return () => {
      window.removeEventListener('popstate', navigate);
      window.removeEventListener('hashchange', navigate);
    };
  }, [enter, returnHome]);

  useEffect(() => {
    const sequence: Partial<Record<JourneyPhase, [number, JourneyPhase]>> = {
      SCROLL_AWAKENING: [460, 'CAMERA_ENTERING'],
      CAMERA_ENTERING: [820, 'ARTISTIC_TRANSITION'],
      ARTISTIC_TRANSITION: [620, 'SCROLL_LOADING'],
      PAINTING_REVEAL: [480, 'ENTERING_VIEWER'],
      ENTERING_VIEWER: [900, 'SCROLL_VIEWER'],
      RETURNING_HOME: [950, 'HOME'],
    };
    const next = sequence[phase];
    if (!next || phase === 'CAMERA_ENTERING' && !artReady && !artError) return;
    const timer = window.setTimeout(() => setPhase(next[1]), reduced ? Math.min(next[0], 140) : next[0]);
    return () => window.clearTimeout(timer);
  }, [phase, reduced, attempt, artReady, artError]);

  useEffect(() => {
    if (phase !== 'SCROLL_LOADING') return;
    const timer = window.setTimeout(() => setMinimumShown(true), reduced ? 220 : 1200);
    return () => window.clearTimeout(timer);
  }, [phase, attempt, reduced]);

  useEffect(() => {
    if (phase === 'SCROLL_LOADING' && minimumShown && ready && artReady && !error && !artError) setPhase('PAINTING_REVEAL');
  }, [phase, minimumShown, ready, error, artReady, artError]);

  useEffect(() => {
    if (phase === 'HOME' || phase === 'SCROLL_VIEWER' || phase === 'RETURNING_HOME' || ready && artReady) return;
    const timer = window.setTimeout(() => {
      setError('画境准备较久，可重试展卷或先返回书房。');
      setPhase('SCROLL_LOADING');
    }, 45000);
    return () => window.clearTimeout(timer);
  }, [phase, attempt, ready, artReady]);

  const onPreparation = useCallback((state: ScenePreparationState) => {
    setPreparation(state);
    if (state.stage === 'manifest' || state.stage === 'textures' || state.stage === 'first-frame') setReady(false);
    if (state.stage === 'error') { setError(state.message); setReady(false); }
    // A context loss during the final approach must cover the viewer again.
    if (state.stage !== 'ready' && state.stage !== 'first-frame' && ['PAINTING_REVEAL', 'ENTERING_VIEWER'].includes(phaseRef.current)) {
      setReady(false); setMinimumShown(false); setPhase('SCROLL_LOADING');
    }
  }, []);
  const onReady = useCallback(() => { setReady(true); setError(null); }, []);
  const retry = useCallback(() => {
    leaveRef.current(); resetPreparation(); setPhase('SCROLL_LOADING');
  }, [resetPreparation]);

  const observablePreparation = ready && !artReady
    ? { ...initialPreparation, stage: 'manifest' as const, message: '正在铺设牡丹画境……' } : preparation;
  return { chapterId, phase, attempt, preparation: observablePreparation, error: error ?? artError, select, returnHome, retry, onPreparation, onReady,
    viewerMounted: phase !== 'HOME', interactive: phase === 'SCROLL_VIEWER' };
}
