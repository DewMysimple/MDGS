import { useEffect, useRef, useState } from 'react';
import { SceneRenderer } from '../scene/SceneRenderer';
import type { ScenePreparationState } from '../scene/SceneRenderer';
import type { SceneManifest } from '../types';
import type { NarrativeSpace } from '../scene/NarrativeSpace';

export type { ScenePreparationState } from '../scene/SceneRenderer';

export interface ViewportMotionState { enabled: boolean; reducedMotion: boolean; supported: boolean }

export interface ScrollViewportProps {
  chapterId: number; progress: number; onNudge: (delta: number) => void;
  onSeek: (progress: number) => void; onManualInput: () => void;
  onManifest?: (manifest: SceneManifest) => void;
  motionEnabled: boolean; onMotionState?: (state: ViewportMotionState) => void;
  interactive?: boolean; retryKey?: number;
  onPreparation?: (state: ScenePreparationState) => void;
  onReady?: () => void;
  onNarrativePlacement?: (placement: NarrativeSpace) => void;
}

export default function ScrollViewport({ chapterId, progress, motionEnabled, onMotionState, onNudge, onSeek, onManualInput, onManifest,
  interactive = true, retryKey = 0, onPreparation, onReady, onNarrativePlacement }: ScrollViewportProps) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<SceneRenderer | null>(null);
  const actions = useRef({ onNudge, onSeek, onManualInput, onManifest, onMotionState, onPreparation, onReady, onNarrativePlacement });
  actions.current = { onNudge, onSeek, onManualInput, onManifest, onMotionState, onPreparation, onReady, onNarrativePlacement };
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
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

  useEffect(() => { setRetryCount(0); retryFocus.current = false; }, [chapterId]);

  useEffect(() => {
    const element = host.current!;
    let renderer: SceneRenderer;
    let alive = true;
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
        if (state.stage === 'ready') { setReady(true); actions.current.onReady?.(); }
      }, placement=> { if(alive) actions.current.onNarrativePlacement?.(placement); });
      engine.current = renderer;
      renderer.setPreparationActive(!interactiveRef.current);
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
      event.preventDefault();
      if (!interactiveRef.current) return;
      cancelAnimationFrame(inertia.current);
      actions.current.onManualInput();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const pixels = delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      actions.current.onNudge(pixels * 0.00016);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      alive = false; observer.disconnect();
      unsubscribeMotion?.();
      element.removeEventListener('wheel', wheel);
      cancelAnimationFrame(inertia.current);
      renderer.dispose(); engine.current = null;
    };
  }, [chapterId, reloadKey, retryKey]);

  useEffect(() => { engine.current?.setProgress(progress); }, [progress]);
  useEffect(() => { engine.current?.setMotionEnabled(motionEnabled); }, [motionEnabled]);
  useEffect(() => {
    engine.current?.setPreparationActive(!interactive);
    if (interactive) return;
    cancelAnimationFrame(inertia.current);
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
      cancelAnimationFrame(inertia.current);
      actions.current.onManualInput();
      drag.current = { id: event.pointerId, x: event.clientX, time: performance.now(), velocity: 0 };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.style.cursor = 'grabbing';
    }}
    onPointerMove={event => {
      if (!interactiveRef.current) return;
      if (drag.current?.id === event.pointerId) {
        const time = performance.now();
        const delta = (drag.current.x - event.clientX) / event.currentTarget.clientWidth * 0.2;
        drag.current.velocity = delta / Math.max(12, time - drag.current.time);
        drag.current.x = event.clientX; drag.current.time = time;
        actions.current.onNudge(delta);
      } else {
        const rect = event.currentTarget.getBoundingClientRect();
        engine.current?.setPointer((event.clientX - rect.left) / rect.width - 0.5, 0.5 - (event.clientY - rect.top) / rect.height);
      }
    }}
    onPointerUp={event => {
      if (drag.current?.id !== event.pointerId) return;
      let velocity = Math.abs(performance.now() - drag.current.time) < 100 ? Math.max(-0.002, Math.min(0.002, drag.current.velocity * 16)) : 0;
      drag.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      event.currentTarget.style.cursor = 'grab';
      if (!interactiveRef.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const glide = () => {
        if (!interactiveRef.current) return;
        velocity *= 0.88;
        if (Math.abs(velocity) < 0.00001) return;
        actions.current.onNudge(velocity);
        inertia.current = requestAnimationFrame(glide);
      };
      inertia.current = requestAnimationFrame(glide);
    }}
    onPointerCancel={event => { drag.current = null; event.currentTarget.style.cursor = 'grab'; }}
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
