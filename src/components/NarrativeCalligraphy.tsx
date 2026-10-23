import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { StoryStop } from '../types';
import { activeNarrativeCue, buildNarrativeTrack } from '../data/narrativeTrack';
import { narrativeChapters } from '../data/newNarrative';
import { buildPoeticTrack } from '../data/poeticNarrative';
import type { NarrativeMode } from '../data/viewerSettings';
import { isCompactNarrativeViewport } from '../scene/NarrativeSpace';
import '../styles/narrative-calligraphy.css';

/** Normalized coordinates within the actual painting viewport. The renderer or
 * an editorial layout can supply an observed quiet area instead of a fixed box. */
export interface NarrativePlacement { x: number; y: number; width: number; height: number; dense?: boolean; orientation?: 'vertical' | 'horizontal'; quietFraction?: number; sampledProgress?: number; sampledWidth?: number; sampledHeight?: number }
export interface NarrativeCalligraphyProps {
  chapterId: number;
  progress: number;
  stops: StoryStop[];
  active?: boolean;
  placement?: NarrativePlacement;
  platePadding?: number;
  durationSeconds?: number;
  mode?: NarrativeMode;
  playing?: boolean;
}

/** HTML ink remains separate from artwork pixels. A short passage crossfades at
 * narrative boundaries, in both directions and on arbitrary timeline seeks. */
export default function NarrativeCalligraphy({ chapterId, progress, stops, active = true, placement, platePadding = 12, durationSeconds, mode = 'poetic', playing = false }: NarrativeCalligraphyProps) {
  const [size, setSize] = useState({ width: 1200, height: 600 });
  const capacityHorizontal = placement?.orientation === 'horizontal' || (!placement?.orientation && isCompactNarrativeViewport(size.width, size.height));
  const regionWidth = size.width * (placement?.width ?? (capacityHorizontal ? .92 : .24));
  const regionHeight = size.height * (placement?.height ?? (capacityHorizontal ? .46 : .68));
  const padding = Math.max(0, Math.min(32, platePadding));
  const fontSize = Math.max(17, Math.min(21, size.width * .0137));
  const headingWidth = Math.max(23, Math.min(32, size.width * .0205)) * 1.25;
  // A wider paper margin must shorten passages as well. Keep enough room for
  // the title, in-plate ordinal, actual line spacing and the small seal.
  const capacity = capacityHorizontal
    ? Math.floor(Math.max(18, regionWidth - padding * 2 - 12) / 18)
      * Math.max(1, Math.min(3, Math.floor((regionHeight - padding * 2 - 34) / 27.2)))
    : Math.max(1, Math.floor((regionWidth - padding * 2 - headingWidth - 17) / (fontSize * 1.7)))
      * Math.max(1, Math.floor((regionHeight - padding * 2 - 18) / (fontSize * 1.055)));
  const maximum = Math.max(14, Math.min(68, Math.floor(capacity)));
  const track = useMemo(() => mode === 'quiet' ? [] : mode === 'poetic'
    ? buildPoeticTrack(chapterId, stops, durationSeconds ?? 0)
    : buildNarrativeTrack(chapterId, stops, maximum, durationSeconds), [chapterId, stops, maximum, durationSeconds, mode]);
  const cue = activeNarrativeCue(track, progress);
  const [poeticLock, setPoeticLock] = useState<{ key: string; chapterId: number; cueId: string; placement: NarrativePlacement } | null>(null);
  const manualOrigin = useRef(progress);
  // Hold one readable place for each caption cue.
  const layoutKey = `${chapterId}:${cue?.id ?? poeticLock?.cueId ?? ''}:${size.width}:${size.height}`;
  const manualTravel = !playing && !!poeticLock && Math.abs(progress - manualOrigin.current) >= .05;
  const sameCueLock = active && !!cue && poeticLock?.chapterId === chapterId && poeticLock.cueId === cue.id;
  const lockReady = sameCueLock && poeticLock?.key === layoutKey && !manualTravel;
  const sampleReady = !!placement
    && (placement.sampledProgress === undefined || Math.abs(progress - placement.sampledProgress) < .05)
    && (placement.sampledWidth === undefined || Math.abs(placement.sampledWidth - size.width) < 1)
    && (placement.sampledHeight === undefined || Math.abs(placement.sampledHeight - size.height) < 1);
  // Keep ink visible while the new thumbnail is being sampled. A same-cue lock
  // is the best resize fallback; otherwise the previous normalized sample or
  // the CSS's safe default position is used until a current sample arrives.
  const effectivePlacement = mode === 'poetic'
    ? lockReady ? poeticLock!.placement : sampleReady ? placement : sameCueLock && !manualTravel ? poeticLock!.placement : placement
    : placement;
  const textReady = mode !== 'poetic' || active && !!cue;
  // A reading line must not chase the next thumbnail's quieter side. Only a
  // current sample locks its position; resize/manual movement keeps ink visible
  // at the previous normalized position while that sample is pending.
  useLayoutEffect(() => {
    // Pausing automatic playback is not a manual jump. Keep its last position
    // as the origin for subsequent wheel/drag movement without moving the ink.
    if (playing) manualOrigin.current = progress;
    if (mode !== 'poetic' || !active) { manualOrigin.current = progress; if (poeticLock) setPoeticLock(null); return; }
    if (cue && sampleReady && !lockReady && effectivePlacement) {
      manualOrigin.current = progress;
      setPoeticLock({ key: layoutKey, chapterId, cueId: cue.id, placement: effectivePlacement });
    }
  }, [mode, active, cue, poeticLock, lockReady, sampleReady, effectivePlacement, layoutKey, chapterId, progress, playing]);
  const horizontal = effectivePlacement?.orientation === 'horizontal' || (!effectivePlacement?.orientation && isCompactNarrativeViewport(size.width, size.height));
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
  }, [active, chapterId, mode]);
  const custom = effectivePlacement ? {
    '--narrative-x': `${Math.max(0, Math.min(1 - effectivePlacement.width, effectivePlacement.x)) * 100}%`,
    '--narrative-y': horizontal && effectivePlacement.y > .5 ? 'auto' : `${Math.max(0, effectivePlacement.y) * 100}%`,
    '--narrative-bottom': horizontal && effectivePlacement.y > .5 ? `${Math.max(0, 1 - effectivePlacement.y - effectivePlacement.height) * 100}%` : 'auto',
    '--narrative-width': `${Math.min(1, effectivePlacement.width) * 100}%`, '--narrative-height': `${Math.min(1, effectivePlacement.height) * 100}%`,
  } as CSSProperties : undefined;
  return <div ref={root} className={`narrative-calligraphy${effectivePlacement ? ' has-observed-placement' : ''}${effectivePlacement?.dense ? ' has-paper-veil' : ''}`}
    style={custom} aria-label={`${narrativeChapters[chapterId]?.title ?? ''}卷内题跋`} aria-live="off" hidden={mode === 'quiet'}
    data-chapter={chapterId} data-mode={mode} data-placement-ready={!!effectivePlacement} data-placement-locked={mode === 'poetic' && lockReady} data-side={(effectivePlacement?.x ?? 1) < .5 ? 'left' : 'right'} data-layout={horizontal ? 'horizontal' : 'vertical'} data-quiet-fraction={effectivePlacement?.quietFraction?.toFixed(3)} data-cue-id={cue?.id ?? ''} data-paragraph={cue ? cue.paragraphIndex + 1 : ''} data-source-node={cue?.sourceNode ?? ''}>
    {track.map(passage => {
      const visible = entered && textReady && passage.id === cue?.id;
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
