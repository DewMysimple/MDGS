import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowRight, Flower2, RotateCcw } from 'lucide-react';
import type { ChapterContent } from '../data/chapters';
import { narrativeChapters } from '../data/newNarrative';
import type { NarrativeSpace } from '../scene/NarrativeSpace';

interface Props {
  chapter: ChapterContent;
  ordinal: string;
  placement?: NarrativeSpace;
  last: boolean;
  onReplay: () => void;
  onNext: () => void;
  onKeep: () => void;
}

/** The colophon uses the actual letterbox when it can fit a readable sheet;
 * otherwise the last observed quiet side of the painting receives its silk. */
export default function ScrollColophon({ chapter, ordinal, placement, last, onReplay, onNext, onKeep }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    const painting = ref.current?.closest<HTMLElement>('.painting');
    if (!painting) return;
    const update = () => {
      const canvas = painting.querySelector<HTMLCanvasElement>('canvas[data-source-viewport]');
      if (!canvas) return;
      try {
        const view = JSON.parse(canvas.dataset.sourceViewport ?? '{}') as { x: number; width: number };
        const value = canvas.clientWidth - view.x - view.width;
        setMargin(Number.isFinite(value) ? Math.max(0, value) : 0);
      } catch { setMargin(0); }
    };
    update();
    const observer = new ResizeObserver(update); observer.observe(painting);
    const attributes = new MutationObserver(update); attributes.observe(painting, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-source-viewport'] });
    return () => { observer.disconnect(); attributes.disconnect(); };
  }, []);
  const hasMargin = margin >= 210;
  const side = hasMargin || (placement?.x ?? 1) > .5 ? 'right' : 'left';
  const style = hasMargin ? { '--colophon-width': `${Math.min(380, margin - 32)}px` } as CSSProperties : undefined;

  return <aside ref={ref} className={`end-colophon colophon-${side}${hasMargin ? ' colophon-in-margin' : ''}`} style={style} data-chapter={chapter.id} aria-label="卷末题跋">
    <span className="end-seal" aria-hidden="true">阅<br />毕</span>
    <p className="eyebrow">第{ordinal}卷 · 卷末</p>
    <h2>{chapter.title}</h2>
    <p className="end-theme-subtitle">{chapter.subtitle}</p>
    <p className="end-colophon-text">{narrativeChapters[chapter.id]?.ending ?? chapter.colophon}</p>
    <button type="button" className="colophon-keepsake" onClick={onKeep}><Flower2 size={15} strokeWidth={1.1} /><span>留一笺春色</span><ArrowRight size={15} strokeWidth={1.1} /></button>
    <div className="end-actions">
      <button className="text-button" type="button" onClick={onReplay}><RotateCcw size={13} strokeWidth={1.3} />再观此卷</button>
      <button className="text-button" type="button" onClick={onNext}>{last ? '重游四卷' : '展开下一卷'}<ArrowRight size={14} strokeWidth={1.3} /></button>
    </div>
  </aside>;
}
