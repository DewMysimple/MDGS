import { useCallback, useEffect, useRef, useState } from 'react';
import { sceneOptions } from '../data/sceneOptions';

const savedProgress = new Map<number, number>();
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const progressKey = (id: number) => `guose-fanghua:chapter-${id}:position`;
function restoreProgress(id: number) {
  if (savedProgress.has(id)) return savedProgress.get(id)!;
  try {
    const value = Number(sessionStorage.getItem(progressKey(id)));
    return Number.isFinite(value) ? clamp(value) : 0;
  } catch { return 0; }
}
function persistProgress(id: number, value: number) {
  savedProgress.set(id, value);
  try { sessionStorage.setItem(progressKey(id), String(value)); } catch { /* Private storage can be disabled. */ }
}

/** One restrained, shared motion controller for all four independent scrolls. */
export function useScrollController(chapterId: number) {
  const [progress, setProgress] = useState(() => restoreProgress(chapterId));
  const [target, setTarget] = useState(progress);
  const [playing, setPlaying] = useState(false);
  const position = useRef(progress);
  const destination = useRef(progress);
  const playingRef = useRef(false);
  const chapterRef = useRef(chapterId);
  const reducedMotion = useRef(false);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reducedMotion.current = media.matches; };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const stop = useCallback(() => { playingRef.current = false; setPlaying(false); }, []);
  const seek = useCallback((p: number, immediate = false) => {
    destination.current = clamp(p);
    setTarget(destination.current);
    if (immediate || reducedMotion.current) {
      position.current = destination.current;
      setProgress(position.current);
    }
  }, []);
  const nudge = useCallback((delta: number) => {
    destination.current = clamp(destination.current + delta);
    setTarget(destination.current);
  }, []);
  const togglePlaying = useCallback(() => {
    if (position.current > 0.999) seek(0);
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
  }, [seek]);

  useEffect(() => {
    persistProgress(chapterRef.current, position.current);
    chapterRef.current = chapterId;
    const restored = restoreProgress(chapterId);
    position.current = destination.current = restored;
    setProgress(restored);
    setTarget(restored);
    stop();
  }, [chapterId, stop]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let lastSaved = previous;
    const animate = (now: number) => {
      frame = 0;
      if (document.hidden) return;
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (playingRef.current) {
        destination.current = clamp(destination.current + dt / (sceneOptions[chapterRef.current]?.autoplayDuration ?? 154));
        setTarget(destination.current);
      }
      const distance = destination.current - position.current;
      if (Math.abs(distance) > 0.000005) {
        position.current = reducedMotion.current ? destination.current : position.current + distance * (1 - Math.exp(-dt * 9));
        setProgress(position.current);
        savedProgress.set(chapterRef.current, position.current);
      } else if (position.current !== destination.current) {
        position.current = destination.current;
        setProgress(position.current);
      }
      if (playingRef.current && destination.current >= 1 && position.current > 0.999) stop();
      if (now - lastSaved > 1000) { persistProgress(chapterRef.current, position.current); lastSaved = now; }
      frame = requestAnimationFrame(animate);
    };
    if (!document.hidden) frame = requestAnimationFrame(animate);
    const onVisibility = () => {
      if (document.hidden) {
        persistProgress(chapterRef.current, position.current);
        stop();
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame) {
        previous = performance.now();
        frame = requestAnimationFrame(animate);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const save = () => persistProgress(chapterRef.current, position.current);
    window.addEventListener('pagehide', save);
    return () => { save(); cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', save); };
  }, [stop]);

  return { progress, target, seek, nudge, playing, togglePlaying, stop };
}
