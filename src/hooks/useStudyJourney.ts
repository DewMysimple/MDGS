import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScenePreparationState } from '../components/ScrollViewport';

export type JourneyPhase = 'HOME' | 'SCROLL_AWAKENING' | 'CAMERA_ENTERING' | 'ARTISTIC_TRANSITION' | 'SCROLL_LOADING' | 'PAINTING_REVEAL' | 'ENTERING_VIEWER' | 'SCROLL_VIEWER' | 'RETURNING_HOME';
export function chapterFromHash(hash = window.location.hash) {
  const match = /^#chapter-([1-4])$/.exec(hash);
  return match ? Number(match[1]) : null;
}
const initialPreparation: ScenePreparationState = { stage: 'manifest', loaded: 0, total: 0, message: '正在铺陈千年风华……' };
export const studyJourneyTiming = {
  SCROLL_AWAKENING: 200,
  CAMERA_ENTERING: 450,
  ARTISTIC_TRANSITION: 250,
  SCROLL_LOADING: 4000,
  PAINTING_REVEAL: 250,
  ENTERING_VIEWER: 400,
  RETURNING_HOME: 950,
} as const;

/** Animation time never masquerades as download progress. The renderer owns readiness. */
export function useStudyJourney(onLeave: () => void) {
  const [chapterId, setChapterId] = useState(() => chapterFromHash() ?? 1);
  const [phase, setPhase] = useState<JourneyPhase>(() => chapterFromHash() ? 'SCROLL_AWAKENING' : 'HOME');
  const [attempt, setAttempt] = useState(0);
  const [preparation, setPreparation] = useState(initialPreparation);
  const [ready, setReady] = useState(false);
  const [minimumShown, setMinimumShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const [presentationReady, setPresentationReady] = useState(false);
  const [returnFallback, setReturnFallback] = useState(false);
  const [returningFromViewer, setReturningFromViewer] = useState(false);
  const phaseRef = useRef(phase);
  const phaseClock = useRef({ phase, attempt: -1, startedAt: 0 });
  const routedUrl = useRef(window.location.href);
  phaseRef.current = phase;
  const leaveRef = useRef(onLeave);
  leaveRef.current = onLeave;
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const resetPreparation = useCallback(() => {
    setReady(false); setError(null); setPresentationError(null); setPreparation(initialPreparation); setMinimumShown(false);
    setPresentationReady(false); setReturnFallback(false); setReturningFromViewer(false);
    setAttempt(value => value + 1);
  }, []);

  const enter = useCallback((id: number, fromHistory = false) => {
    if (id < 1 || id > 4 || !Number.isInteger(id)) return;
    leaveRef.current();
    resetPreparation();
    setChapterId(id);
    const nextPhase = 'SCROLL_AWAKENING';
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
    setReturningFromViewer(phaseRef.current === 'SCROLL_VIEWER');
    leaveRef.current();
    setPresentationReady(false); setReturnFallback(false);
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
      SCROLL_AWAKENING: [studyJourneyTiming.SCROLL_AWAKENING, 'CAMERA_ENTERING'],
      CAMERA_ENTERING: [studyJourneyTiming.CAMERA_ENTERING, 'ARTISTIC_TRANSITION'],
      ARTISTIC_TRANSITION: [studyJourneyTiming.ARTISTIC_TRANSITION, 'SCROLL_LOADING'],
      PAINTING_REVEAL: [studyJourneyTiming.PAINTING_REVEAL, 'ENTERING_VIEWER'],
      ENTERING_VIEWER: [studyJourneyTiming.ENTERING_VIEWER, 'SCROLL_VIEWER'],
      RETURNING_HOME: [studyJourneyTiming.RETURNING_HOME, 'HOME'],
    };
    const next = sequence[phase];
    if (!next) return;
    if (phase === 'RETURNING_HOME' && !presentationReady) {
      phaseClock.current = { phase, attempt, startedAt: 0 };
      return;
    }
    if (phaseClock.current.phase !== phase || phaseClock.current.attempt !== attempt || !phaseClock.current.startedAt) {
      phaseClock.current = { phase, attempt, startedAt: performance.now() };
    }
    const duration = reduced ? Math.min(next[0], 140) : next[0];
    const remaining = Math.max(0, duration - (performance.now() - phaseClock.current.startedAt));
    const timer = window.setTimeout(() => {
      if (phaseRef.current !== phase) return;
      phaseRef.current = next[1];
      setPhase(next[1]);
    }, Math.ceil(remaining));
    return () => window.clearTimeout(timer);
  }, [phase, reduced, attempt, presentationReady]);

  useEffect(() => {
    if (phase !== 'SCROLL_LOADING') return;
    // The art exhibition has a real minimum viewing time, independent of both
    // download progress and reduced-motion preference. A background tab does
    // not use up that time before the visitor has actually seen the scroll.
    setMinimumShown(false);
    if (!presentationReady) return;
    let visibleElapsed = 0;
    let visibleSince: number | null = null;
    let timer = 0;
    const pause = () => {
      window.clearTimeout(timer);
      if (visibleSince !== null) visibleElapsed += performance.now() - visibleSince;
      visibleSince = null;
    };
    const resume = () => {
      if (document.hidden) return;
      visibleSince = performance.now();
      timer = window.setTimeout(finish, Math.max(1, Math.ceil(studyJourneyTiming.SCROLL_LOADING - visibleElapsed)));
    };
    const finish = () => {
      pause();
      if (document.hidden) return;
      if (visibleElapsed >= studyJourneyTiming.SCROLL_LOADING) setMinimumShown(true);
      else resume();
    };
    const visibility = () => { pause(); resume(); };
    document.addEventListener('visibilitychange', visibility);
    resume();
    return () => { pause(); document.removeEventListener('visibilitychange', visibility); };
  }, [phase, attempt, presentationReady]);

  useEffect(() => {
    if (phase === 'SCROLL_LOADING' && minimumShown && ready && presentationReady && !error && !presentationError) {
      phaseRef.current = 'PAINTING_REVEAL';
      setPhase('PAINTING_REVEAL');
    }
  }, [phase, minimumShown, ready, error, presentationReady, presentationError]);

  useEffect(() => {
    if (phase !== 'RETURNING_HOME' || presentationReady) return;
    // Back/history and a lost GPU can bypass the normal capture button path.
    // Always offer a warm-paper exit rather than trapping the visitor here.
    const timer = window.setTimeout(() => { setReturnFallback(true); setPresentationReady(true); }, 1700);
    return () => window.clearTimeout(timer);
  }, [phase, presentationReady]);

  useEffect(() => {
    if (phase === 'HOME' || phase === 'SCROLL_VIEWER' || phase === 'RETURNING_HOME' || ready && presentationReady) return;
    const timer = window.setTimeout(() => {
      setError('画境准备较久，可重试展卷或先返回序厅。');
      phaseRef.current = 'SCROLL_LOADING';
      setPhase('SCROLL_LOADING');
    }, 45000);
    return () => window.clearTimeout(timer);
  }, [phase, attempt, ready, presentationReady]);

  const onPreparation = useCallback((state: ScenePreparationState) => {
    setPreparation(state);
    if (state.stage === 'manifest' || state.stage === 'textures' || state.stage === 'first-frame') setReady(false);
    if (state.stage === 'error') { setError(state.message); setReady(false); }
    // A context loss during the final approach must cover the viewer again.
    if (state.stage !== 'ready' && state.stage !== 'first-frame' && ['PAINTING_REVEAL', 'ENTERING_VIEWER'].includes(phaseRef.current)) {
      phaseRef.current = 'SCROLL_LOADING';
      setReady(false); setMinimumShown(false); setPhase('SCROLL_LOADING');
    }
  }, []);
  const onReady = useCallback(() => { setReady(true); setError(null); }, []);
  const onPresentationFailure = useCallback((message: string) => {
    if (phaseRef.current === 'RETURNING_HOME') {
      setReturnFallback(true); setPresentationReady(true); return;
    }
    setPresentationError(message);
    if (['PAINTING_REVEAL', 'ENTERING_VIEWER'].includes(phaseRef.current)) {
      phaseRef.current = 'SCROLL_LOADING'; setMinimumShown(false); setPhase('SCROLL_LOADING');
    }
  }, []);
  const onPresentationPending = useCallback(() => { setPresentationReady(false); setMinimumShown(false); }, []);
  const onPresentationReady = useCallback(() => { setPresentationReady(true); }, []);
  const retry = useCallback(() => {
    leaveRef.current(); resetPreparation(); phaseRef.current = 'SCROLL_AWAKENING'; setPhase('SCROLL_AWAKENING');
  }, [resetPreparation]);

  return { chapterId, phase, attempt, preparation, error: presentationError ?? error, select, returnHome, retry, onPreparation, onReady, onPresentationFailure,
    onPresentationPending, onPresentationReady, presentationReady, returnFallback, returningFromViewer,
    viewerMounted: phase !== 'HOME', interactive: phase === 'SCROLL_VIEWER' };
}
