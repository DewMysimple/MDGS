import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { StoryStop } from '../types';
import { activeNarrativeCue, buildNarrativeTrack } from '../data/narrativeTrack';
import { narrativeChapters } from '../data/newNarrative';
import { isCompactNarrativeViewport } from '../scene/NarrativeSpace';
import '../styles/narrative-calligraphy.css';

/** Normalized coordinates within the actual painting viewport. The renderer or
 * an editorial layout can supply an observed quiet area instead of a fixed box. */
export interface NarrativePlacement { x: number; y: number; width: number; height: number; dense?: boolean; orientation?: 'vertical' | 'horizontal'; quietFraction?: number }
export interface NarrativeCalligraphyProps {
  chapterId: number;
  progress: number;
  stops: StoryStop[];
  active?: boolean;
  placement?: NarrativePlacement;
  platePadding?: number;
}

/** HTML ink remains separate from artwork pixels. A short passage crossfades at
 * narrative boundaries, in both directions and on arbitrary timeline seeks. */
export default function NarrativeCalligraphy({ chapterId, progress, stops, active = true, placement, platePadding = 12 }: NarrativeCalligraphyProps) {
  const [size, setSize] = useState({ width: 1200, height: 600 });
  const horizontal = placement?.orientation === 'horizontal' || (!placement?.orientation && isCompactNarrativeViewport(size.width, size.height));
  const regionWidth = size.width * (placement?.width ?? (horizontal ? .92 : .24));
  const regionHeight = size.height * (placement?.height ?? (horizontal ? .46 : .68));
  const padding = Math.max(0, Math.min(32, platePadding));
  const fontSize = Math.max(17, Math.min(21, size.width * .0137));
  const headingWidth = Math.max(23, Math.min(32, size.width * .0205)) * 1.25;
  // A wider paper margin must shorten passages as well. Keep enough room for
  // the title, in-plate ordinal, actual line spacing and the small seal.
  const capacity = horizontal
    ? Math.floor(Math.max(18, regionWidth - padding * 2 - 12) / 18)
      * Math.max(1, Math.min(3, Math.floor((regionHeight - padding * 2 - 34) / 27.2)))
    : Math.max(1, Math.floor((regionWidth - padding * 2 - headingWidth - 17) / (fontSize * 1.7)))
      * Math.max(1, Math.floor((regionHeight - padding * 2 - 18) / (fontSize * 1.055)));
  const maximum = Math.max(14, Math.min(68, Math.floor(capacity)));
  const track = useMemo(() => buildNarrativeTrack(chapterId, stops, maximum), [chapterId, stops, maximum]);
  const cue = activeNarrativeCue(track, progress);
  const [entered, setEntered] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect;
      if (box?.width && box?.height) setSize(previous => previous.width === box.width && previous.height === box.height ? previous : { width: box.width, height: box.height });
    });
    observer.observe(root.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setEntered(false);
    if (!active) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [active, chapterId]);
  const custom = placement ? {
    '--narrative-x': `${Math.max(0, Math.min(1 - placement.width, placement.x)) * 100}%`,
    '--narrative-y': horizontal && placement.y > .5 ? 'auto' : `${Math.max(0, placement.y) * 100}%`,
    '--narrative-bottom': horizontal && placement.y > .5 ? `${Math.max(0, 1 - placement.y - placement.height) * 100}%` : 'auto',
    '--narrative-width': `${Math.min(1, placement.width) * 100}%`, '--narrative-height': `${Math.min(1, placement.height) * 100}%`,
  } as CSSProperties : undefined;
  return <div ref={root} className={`narrative-calligraphy${placement ? ' has-observed-placement' : ''}${placement?.dense ? ' has-paper-veil' : ''}`}
    style={custom} aria-label={`${narrativeChapters[chapterId]?.title ?? ''}卷内题跋`} aria-live="off"
    data-chapter={chapterId} data-layout={horizontal ? 'horizontal' : 'vertical'} data-quiet-fraction={placement?.quietFraction?.toFixed(3)} data-cue-id={cue?.id ?? ''} data-paragraph={cue ? cue.paragraphIndex + 1 : ''} data-source-node={cue?.sourceNode ?? ''}>
    {track.map(passage => {
      const visible = entered && active && passage.id === cue?.id;
      return <article key={passage.id} className={`narrative-passage${visible ? ' is-visible' : ''}`}
        data-narrative-id={passage.id} data-range-start={passage.start} data-range-end={passage.end} aria-hidden={!visible}>
        <div className="narrative-ink">
          <span className="narrative-ordinal" aria-hidden="true">{['壹','贰','叁','肆'][chapterId - 1]} · {String(passage.paragraphIndex + 1).padStart(2, '0')}</span>
          <h2>{passage.heading}</h2>
          <p>{passage.text}</p>
          <span className="narrative-small-seal" aria-hidden="true">国色</span>
        </div>
      </article>;
    })}
  </div>;
}
