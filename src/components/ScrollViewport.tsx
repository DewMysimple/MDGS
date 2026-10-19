import { useEffect, useRef, useState } from 'react';
import { SceneRenderer } from '../scene/SceneRenderer';
import type { SceneManifest } from '../types';

export interface ScrollViewportProps {
  chapterId: number; progress: number; onNudge: (delta: number) => void;
  onSeek: (progress: number) => void; onManualInput: () => void;
  onManifest?: (manifest: SceneManifest) => void;
}

export default function ScrollViewport({ chapterId, progress, onNudge, onSeek, onManualInput, onManifest }: ScrollViewportProps) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<SceneRenderer | null>(null);
  const actions = useRef({ onNudge, onSeek, onManualInput, onManifest });
  actions.current = { onNudge, onSeek, onManualInput, onManifest };
  const [status, setStatus] = useState<string | null>('正在展卷');
  const [error, setError] = useState(false);
  const drag = useRef<{ id: number; x: number; time: number; velocity: number } | null>(null);
  const inertia = useRef(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    const element = host.current!;
    let renderer: SceneRenderer;
    let alive = true;
    setStatus('正在展卷'); setError(false);
    try {
      renderer = new SceneRenderer(element, message => { if (alive) setStatus(message); });
      engine.current = renderer;
      renderer.setProgress(progressRef.current);
      renderer.load(chapterId).then(manifest => { if (alive) actions.current.onManifest?.(manifest); }).catch(reason => {
        if (alive && reason.name !== 'AbortError') { setError(true); setStatus(reason.message || '画卷加载失败，请刷新重试'); }
      });
    } catch { setError(true); setStatus('当前浏览器无法开启 WebGL，请使用支持 WebGL 的浏览器。'); return; }
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width && height) renderer.resize(width, height);
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelAnimationFrame(inertia.current);
      actions.current.onManualInput();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const pixels = delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      actions.current.onNudge(pixels * 0.00016);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      alive = false; observer.disconnect();
      element.removeEventListener('wheel', wheel);
      cancelAnimationFrame(inertia.current);
      renderer.dispose(); engine.current = null;
    };
  }, [chapterId]);

  useEffect(() => { engine.current?.setProgress(progress); }, [progress]);

  return <div
    ref={host}
    className={`scene-viewport${drag.current ? ' is-dragging' : ''}`}
    style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', touchAction: 'pan-y', cursor: 'grab', outlineOffset: -6 }}
    tabIndex={0}
    role="region"
    aria-label={`第${chapterId}卷画卷，使用滚轮、左右拖拽或方向键游观`}
    aria-busy={!!status && !error}
    onPointerDown={event => {
      if (event.button !== 0) return;
      cancelAnimationFrame(inertia.current);
      actions.current.onManualInput();
      drag.current = { id: event.pointerId, x: event.clientX, time: performance.now(), velocity: 0 };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.style.cursor = 'grabbing';
    }}
    onPointerMove={event => {
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
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const glide = () => {
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
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End', 'PageDown', 'PageUp'].includes(event.key)) return;
      event.preventDefault(); actions.current.onManualInput();
      if (event.key === 'Home') actions.current.onSeek(0);
      else if (event.key === 'End') actions.current.onSeek(1);
      else actions.current.onNudge(['ArrowLeft', 'PageUp'].includes(event.key) ? -0.025 : 0.025);
    }}
  >
    {status && <div className={`scene-loading${error ? ' has-error' : ''}`} role="status" style={{ position: 'absolute', inset: status.startsWith('部分') ? 'auto 12px 12px auto' : 0, zIndex: 2, display: 'grid', placeContent: 'center', textAlign: 'center', padding: status.startsWith('部分') ? '10px 14px' : 0, background: error ? '#f8f5ed' : 'rgba(248,245,237,.92)', color: '#796f62', pointerEvents: 'none', fontSize: 13, letterSpacing: '0.22em' }}>{!status.startsWith('部分') && <span className="loading-seal" style={{ color: '#a64d3f', fontSize: 23, marginBottom: 18 }}>牡 丹</span>}{status}</div>}
  </div>;
}
