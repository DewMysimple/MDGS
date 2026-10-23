import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SceneRenderer } from '../scene/SceneRenderer';
import type { ScenePreparationState } from '../scene/SceneRenderer';
import type { SceneManifest } from '../types';
import type { NarrativeSpace } from '../scene/NarrativeSpace';
import { dragGlide, wheelProgress } from '../hooks/scrollMotion';
import type { ArtworkAnchorSpec, ProjectedArtAnchor } from '../data/artEncounters';
import { releaseArtworkSnapshot, type ArtworkSnapshot } from '../scene/artworkSnapshot';

export type { ScenePreparationState } from '../scene/SceneRenderer';

export interface ViewportMotionState { enabled: boolean; reducedMotion: boolean; supported: boolean }
export interface ScrollPresentationHandle { capture: () => Promise<ArtworkSnapshot> }
const noArtworkAnchors: readonly ArtworkAnchorSpec[] = [];

export interface ScrollViewportProps {
  chapterId: number; progress: number; onNudge: (delta: number) => void;
  onSeek: (progress: number) => void; onManualInput: () => void;
  onManifest?: (manifest: SceneManifest) => void;
  motionEnabled: boolean; onMotionState?: (state: ViewportMotionState) => void;
  interactive?: boolean; retryKey?: number;
  preparationCancelled?: boolean;
  onPreparation?: (state: ScenePreparationState) => void;
  onReady?: () => void;
  onNarrativePlacement?: (placement: NarrativeSpace) => void;
  wheelSpeed?: number;
  artworkAnchors?: readonly ArtworkAnchorSpec[];
  onArtworkAnchors?: (anchors: ProjectedArtAnchor[]) => void;
  onPresentationHandle?: (handle: ScrollPresentationHandle | null) => void;
  onPresentationSnapshot?: (snapshot: ArtworkSnapshot) => void;
  onPresentationError?: (message: string) => void;
  playbackActive?: boolean;
}

export default function ScrollViewport({ chapterId, progress, motionEnabled, onMotionState, onNudge, onSeek, onManualInput, onManifest,
  interactive = true, retryKey = 0, preparationCancelled = false, onPreparation, onReady, onNarrativePlacement, wheelSpeed = 0.5, artworkAnchors = noArtworkAnchors, onArtworkAnchors,
  onPresentationHandle, onPresentationSnapshot, onPresentationError, playbackActive = false }: ScrollViewportProps) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<SceneRenderer | null>(null);
  const actions = useRef({ onNudge, onSeek, onManualInput, onManifest, onMotionState, onPreparation, onReady, onNarrativePlacement, onArtworkAnchors, onPresentationHandle, onPresentationSnapshot, onPresentationError });
  actions.current = { onNudge, onSeek, onManualInput, onManifest, onMotionState, onPreparation, onReady, onNarrativePlacement, onArtworkAnchors, onPresentationHandle, onPresentationSnapshot, onPresentationError };
  const capturePrepared = useRef<(() => void) | null>(null);
  const artworkAnchorsRef = useRef(artworkAnchors); artworkAnchorsRef.current = artworkAnchors;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const preparationCancelledRef = useRef(preparationCancelled);
  preparationCancelledRef.current = preparationCancelled;
  const wheelSpeedRef = useRef(wheelSpeed);
  wheelSpeedRef.current = wheelSpeed;
  const [status, setStatus] = useState<string | null>('正在展卷');
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const retryFocus = useRef(false);
  const motionRef = useRef(motionEnabled);
  motionRef.current = motionEnabled;
  const drag = useRef<{ id: number; x: number; time: number; velocity: number } | null>(null);
  const inertia = useRef(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const playbackRef = useRef(playbackActive); playbackRef.current = playbackActive;

  useEffect(() => { setRetryCount(0); retryFocus.current = false; }, [chapterId]);

  useEffect(() => {
    const element = host.current!;
    let renderer: SceneRenderer;
    let alive = true;
    let snapshotDispatched = false;
    let firstFramePresented = false;
    const captureReadyFrame = () => {
      if (!alive || !firstFramePresented || snapshotDispatched || !actions.current.onPresentationSnapshot) return;
      snapshotDispatched = true;
      renderer.captureArtworkSnapshot().then(snapshot => {
        if (alive && actions.current.onPresentationSnapshot) {
          try { actions.current.onPresentationSnapshot(snapshot); }
          catch (reason) { releaseArtworkSnapshot(snapshot); throw reason; }
        }
        else releaseArtworkSnapshot(snapshot);
      }).catch(reason => {
        if (alive && reason.name !== 'AbortError') actions.current.onPresentationError?.(reason.message || '画心暂未齐备，请重新展卷。');
      });
    };
    capturePrepared.current = captureReadyFrame;
    let unsubscribeMotion: (() => void) | undefined;
    setStatus('正在展卷'); setError(false); setReady(false);
    try {
      renderer = new SceneRenderer(element, message => {
        if (!alive) return;
        setStatus(message);
        const recovery = engine.current?.getRecoveryState();
        const failed = !!message && (message.startsWith('部分') || message.startsWith('画面暂时中断') || !!recovery && recovery.kind !== 'none');
        setError(failed && !message?.startsWith('正在恢复'));
        if (!message || message.startsWith('部分')) setReady(true);
      }, state => {
        if (!alive) return;
        actions.current.onPreparation?.(state);
        if (state.stage === 'ready') { firstFramePresented = true; setReady(true); actions.current.onReady?.(); captureReadyFrame(); }
      }, placement=> { if(alive) actions.current.onNarrativePlacement?.(placement); }, anchors => { if (alive) actions.current.onArtworkAnchors?.(anchors); });
      engine.current = renderer;
      if (preparationCancelledRef.current) renderer.cancelPreparation();
      actions.current.onPresentationHandle?.({ capture: () => renderer.captureArtworkSnapshot() });
      renderer.setArtworkAnchors(artworkAnchorsRef.current);
      renderer.setPreparationActive(!interactiveRef.current);
      renderer.setNarrativePlaybackActive(playbackRef.current);
      if (element.clientWidth && element.clientHeight) renderer.resize(element.clientWidth, element.clientHeight);
      renderer.setMotionEnabled(motionRef.current);
      unsubscribeMotion = renderer.subscribeMotionState(state => { if (alive) actions.current.onMotionState?.(state); });
      renderer.setProgress(progressRef.current);
      renderer.load(chapterId).then(manifest => { if (alive) actions.current.onManifest?.(manifest); }).catch(reason => {
        if (alive && reason.name !== 'AbortError') {
          const message = reason.message || '画卷加载失败，请重试';
          setError(true); setStatus(message);
          actions.current.onPreparation?.({ stage: 'error', loaded: 0, total: 0, message });
        }
      });
    } catch {
      const message = '当前浏览器无法开启画卷，请重试或使用支持 WebGL 的浏览器。';
      setError(true); setStatus(message);
      actions.current.onPreparation?.({ stage: 'error', loaded: 0, total: 0, message });
      actions.current.onMotionState?.({ enabled: false, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, supported: false });
      return () => { alive = false; unsubscribeMotion?.(); engine.current?.dispose(); engine.current = null; };
    }
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width && height) renderer.resize(width, height);
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      if (!interactiveRef.current || event.ctrlKey) return;
      event.preventDefault();
      cancelAnimationFrame(inertia.current); inertia.current = 0;
      actions.current.onManualInput();
      actions.current.onNudge(wheelProgress(event.deltaX, event.deltaY, event.deltaMode, element.clientHeight, wheelSpeedRef.current));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    const onVisibility = () => {
      if (!document.hidden) return;
      cancelAnimationFrame(inertia.current); inertia.current = 0;
      if (drag.current && element.hasPointerCapture(drag.current.id)) element.releasePointerCapture(drag.current.id);
      drag.current = null;
      element.style.cursor = interactiveRef.current ? 'grab' : 'default';
      renderer.setPointer(0, 0);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false; observer.disconnect();
      if (capturePrepared.current === captureReadyFrame) capturePrepared.current = null;
      actions.current.onPresentationHandle?.(null);
      unsubscribeMotion?.();
      element.removeEventListener('wheel', wheel);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(inertia.current);
      renderer.dispose(); engine.current = null;
    };
  }, [chapterId, reloadKey, retryKey]);

  useEffect(() => { if (ready && onPresentationSnapshot) capturePrepared.current?.(); }, [ready, onPresentationSnapshot]);

  useEffect(() => { engine.current?.setProgress(progress); }, [progress]);
  useLayoutEffect(() => { if (preparationCancelled) engine.current?.cancelPreparation(); }, [preparationCancelled]);
  useEffect(() => { engine.current?.setNarrativePlaybackActive(playbackActive); }, [playbackActive]);
  useEffect(() => { engine.current?.setArtworkAnchors(artworkAnchors); }, [artworkAnchors]);
  useEffect(() => { engine.current?.setMotionEnabled(motionEnabled); }, [motionEnabled]);
  useEffect(() => {
    engine.current?.setPreparationActive(!interactive);
    if (interactive) return;
    cancelAnimationFrame(inertia.current); inertia.current = 0;
    const element = host.current;
    if (drag.current && element?.hasPointerCapture(drag.current.id)) element.releasePointerCapture(drag.current.id);
    drag.current = null;
    if (element) element.style.cursor = 'default';
    engine.current?.setPointer(0, 0);
  }, [interactive]);
  useEffect(() => {
    if (!retryFocus.current || status && !error) return;
    (error ? host.current?.querySelector<HTMLButtonElement>('.scene-retry') ?? host.current : host.current)?.focus({ preventScroll: true });
    retryFocus.current = false;
  }, [status, error]);

  function retry() {
    if (retryCount >= 2) return;
    retryFocus.current = true;
    actions.current.onManualInput();
    setRetryCount(count => count + 1);
    setError(false); setStatus('正在恢复画卷');
    if (!engine.current?.retryFailedAssets()) setReloadKey(key => key + 1);
  }

  return <div
    ref={host}
    className={`scene-viewport${drag.current ? ' is-dragging' : ''}${ready ? ' is-ready' : ''}`}
    data-wheel-speed={wheelSpeed}
    style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', touchAction: 'pan-y', cursor: interactive ? 'grab' : 'default', outlineOffset: -6 }}
    tabIndex={interactive ? 0 : -1}
    role="region"
    aria-label={`第${chapterId}卷画卷，使用滚轮、左右拖拽或方向键游观`}
    aria-busy={!!status && !error}
    aria-disabled={!interactive}
    onPointerDown={event => {
      if (!interactiveRef.current) return;
      if ((event.target as HTMLElement).closest('button, a, input')) return;
      if (event.button !== 0) return;
      cancelAnimationFrame(inertia.current); inertia.current = 0;
      actions.current.onManualInput();
      drag.current = { id: event.pointerId, x: event.clientX, time: performance.now(), velocity: 0 };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.style.cursor = 'grabbing';
    }}
    onPointerMove={event => {
      if (!interactiveRef.current) return;
      if (drag.current?.id === event.pointerId) {
        const time = performance.now();
        const delta = (drag.current.x - event.clientX) / Math.max(1, event.currentTarget.clientWidth) * 0.2;
        drag.current.velocity = Math.max(-0.12, Math.min(0.12, delta / Math.max(8, time - drag.current.time) * 1000));
        drag.current.x = event.clientX; drag.current.time = time;
        actions.current.onNudge(delta);
      } else {
        const rect = event.currentTarget.getBoundingClientRect();
        engine.current?.setPointer((event.clientX - rect.left) / rect.width - 0.5, 0.5 - (event.clientY - rect.top) / rect.height);
      }
    }}
    onPointerUp={event => {
      if (drag.current?.id !== event.pointerId) return;
      let velocity = Math.abs(performance.now() - drag.current.time) < 100 ? drag.current.velocity : 0;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      event.currentTarget.style.cursor = 'grab';
      if (!interactiveRef.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      let previous = performance.now();
      const glide = (now: number) => {
        inertia.current = 0;
        if (!interactiveRef.current || document.hidden || Math.abs(velocity) < 0.0006) return;
        const step = dragGlide(velocity, Math.min(0.25, Math.max(0, (now - previous) / 1000)));
        previous = now; velocity = step.velocity;
        actions.current.onNudge(step.distance);
        inertia.current = requestAnimationFrame(glide);
      };
      inertia.current = requestAnimationFrame(glide);
    }}
    onPointerCancel={event => {
      cancelAnimationFrame(inertia.current); inertia.current = 0;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      event.currentTarget.style.cursor = interactiveRef.current ? 'grab' : 'default';
    }}
    onLostPointerCapture={event => {
      if (drag.current?.id !== event.pointerId) return;
      drag.current = null; event.currentTarget.style.cursor = interactiveRef.current ? 'grab' : 'default';
    }}
    onPointerLeave={() => engine.current?.setPointer(0, 0)}
    onKeyDown={event => {
      if (!interactiveRef.current) return;
      if ((event.target as HTMLElement).closest('button, a, input')) return;
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End', 'PageDown', 'PageUp'].includes(event.key)) return;
      event.preventDefault(); actions.current.onManualInput();
      if (event.key === 'Home') actions.current.onSeek(0);
      else if (event.key === 'End') actions.current.onSeek(1);
      else actions.current.onNudge(['ArrowLeft', 'PageUp'].includes(event.key) ? -0.025 : 0.025);
    }}
  >
    {status && <div className={`scene-loading${error ? ' has-error' : ''}${status.startsWith('部分') ? ' is-partial' : ''}`} role="status">
      {!status.startsWith('部分') && <span className="loading-seal" aria-hidden="true">牡 丹</span>}
      <span>{status}</span>
      {error && (retryCount < 2 ? <button type="button" className="scene-retry" onClick={retry}>恢复画卷{retryCount ? '（最后一次）' : ''}</button> : <span className="scene-retry-limit">暂未恢复，可切换章节后再试。</span>)}
    </div>}
  </div>;
}
