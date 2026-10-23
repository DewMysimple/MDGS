import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';

interface TimelineStop { name: string; progress: number }
interface Props {
  stops: TimelineStop[];
  progress: number;
  target: number;
  currentIndex: number;
  active: boolean;
  chapterId: number;
  onSeek: (progress: number) => void;
}

// The marks and the range share one gesture surface. Starting a drag on a
// chapter mark must not leave the pointer trapped on an ordinary button.
export default function ScrollTimeline({ stops, progress, target, currentIndex, active, chapterId, onSeek }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; startX: number; stop: number | null; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fraction = (x: number) => {
    const bounds = host.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - bounds.left) / bounds.width));
  };
  const release = () => {
    const previous = gesture.current;
    gesture.current = null;
    if (previous && host.current?.hasPointerCapture(previous.id)) host.current.releasePointerCapture(previous.id);
    setDragging(false);
  };
  useEffect(() => { if (!active) release(); }, [active]);
  useEffect(() => () => {
    const previous = gesture.current;
    gesture.current = null;
    if (previous && host.current?.hasPointerCapture(previous.id)) host.current.releasePointerCapture(previous.id);
  }, [chapterId]);

  function begin(event: PointerEvent<HTMLDivElement>) {
    if (!active || event.button !== 0 || gesture.current) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.timeline-stop');
    const stop = button ? Number(button.dataset.progress) : null;
    event.preventDefault();
    (button ?? host.current?.querySelector('input'))?.focus({ preventScroll: true });
    gesture.current = { id: event.pointerId, startX: event.clientX, stop, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    if (stop === null) onSeek(fraction(event.clientX));
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    if (Math.abs(event.clientX - current.startX) >= 4) current.moved = true;
    if (current.moved) onSeek(fraction(event.clientX));
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    onSeek(current.moved || current.stop === null ? fraction(event.clientX) : current.stop);
    release();
  }
  return <div ref={host} className={`chapter-timeline${dragging ? ' is-dragging' : ''}`}
    style={{ '--progress': `${progress * 100}%` } as CSSProperties}
    onPointerDown={begin} onPointerMove={move} onPointerUp={end}
    onPointerCancel={release} onLostPointerCapture={release}
    onClickCapture={event => {
      // Pointer gestures above already commit their position. Keyboard and
      // assistive-technology clicks (detail=0) retain normal button behavior.
      if (event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
    }}>
    <div className="timeline-rule" aria-hidden="true"><span /></div>
    <input type="range" min="0" max="1" step="0.001" value={progress}
      onInput={event => onSeek(Number(event.currentTarget.value))}
      onKeyDown={event => {
        const keys: Record<string, number> = { Home: 0, End: 1, ArrowRight: target + 0.01, ArrowUp: target + 0.01, ArrowLeft: target - 0.01, ArrowDown: target - 0.01, PageUp: target + 0.1, PageDown: target - 0.1 };
        if (event.key in keys) { event.preventDefault(); onSeek(keys[event.key]); }
      }}
      aria-label="画卷游观进度" aria-valuetext={`已观赏 ${Math.round(progress * 100)}%，${stops[currentIndex].name}`} />
    <div className="timeline-stops">
      {stops.map((item, index) => <button type="button" key={`${index}-${item.name}`}
        data-progress={item.progress} className={`timeline-stop${index <= currentIndex ? ' is-passed' : ''}`}
        style={{ left: `${item.progress * 100}%` }} onClick={() => onSeek(item.progress)}
        aria-label={`游观至${item.name}`} title={item.name}><i /></button>)}
    </div>
    <span className="timeline-cursor" aria-hidden="true" />
  </div>;
}
