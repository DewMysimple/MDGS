import { useCallback, useEffect, useRef, useState } from 'react';
import { sceneOptions } from '../data/sceneOptions';
import { nudgedTarget, smoothProgress } from './scrollMotion';

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

interface ScrollControllerOptions { smoothingMs?: number; active?: boolean }

/** All input shares one time-based follower; idle and covered scrolls have no RAF loop. */
export function useScrollController(chapterId: number, { smoothingMs = 180, active = true }: ScrollControllerOptions = {}) {
  const [progress, setProgress] = useState(() => restoreProgress(chapterId));
  const [target, setTarget] = useState(progress);
  const [playing, setPlaying] = useState(false);
  const position = useRef(progress);
  const destination = useRef(progress);
  const playingRef = useRef(false);
  const chapterRef = useRef(chapterId);
  const reducedMotion = useRef(false);
  const options = useRef({ smoothingMs, active });
  options.current = { smoothingMs, active };
  const wake = useRef<() => void>(() => {});
  const suspend = useRef<() => void>(() => {});

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reducedMotion.current = media.matches; wake.current(); };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const stop = useCallback(() => { playingRef.current = false; setPlaying(false); }, []);
  const seek = useCallback((p: number, immediate = false) => {
    if (!Number.isFinite(p)) return;
    destination.current = clamp(p);
    setTarget(destination.current);
    if (immediate || reducedMotion.current) {
      position.current = destination.current;
      setProgress(position.current);
      persistProgress(chapterRef.current, position.current);
    }
    wake.current();
  }, []);
  const nudge = useCallback((delta: number) => {
    if (!options.current.active) return;
    seek(nudgedTarget(position.current, destination.current, delta));
  }, [seek]);
  const togglePlaying = useCallback(() => {
    if (!options.current.active || document.hidden) return;
    if (position.current > 0.999) seek(0, true);
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
    wake.current();
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
    let previous = 0;
    let lastSaved = performance.now();
    const save = () => { persistProgress(chapterRef.current, position.current); lastSaved = performance.now(); };
    const animate = (now: number) => {
      frame = 0;
      if (document.hidden || !options.current.active) return;
      const dt = Math.min(Math.max(0, (now - previous) / 1000), 0.25);
      previous = now;
      if (playingRef.current) {
        destination.current = clamp(destination.current + dt / (sceneOptions[chapterRef.current]?.autoplayDuration ?? 154));
        setTarget(destination.current);
      }
      const next = reducedMotion.current ? destination.current : smoothProgress(position.current, destination.current, dt, options.current.smoothingMs);
      if (next !== position.current) {
        position.current = next;
        setProgress(next);
        savedProgress.set(chapterRef.current, next);
      }
      if (playingRef.current && destination.current >= 1 && position.current === 1) stop();
      const moving = playingRef.current || position.current !== destination.current;
      if (!moving || now - lastSaved > 1000) save();
      if (moving) frame = requestAnimationFrame(animate);
    };
    wake.current = () => {
      if (frame || document.hidden || !options.current.active || !playingRef.current && position.current === destination.current) return;
      previous = performance.now();
      frame = requestAnimationFrame(animate);
    };
    suspend.current = () => {
      cancelAnimationFrame(frame); frame = 0;
      stop();
      destination.current = position.current;
      setTarget(position.current);
      save();
    };
    const onVisibility = () => { if (document.hidden) suspend.current(); else wake.current(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', save);
    wake.current();
    return () => {
      save(); cancelAnimationFrame(frame);
      wake.current = () => {}; suspend.current = () => {};
      document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', save);
    };
  }, [stop]);

  useEffect(() => { if (active) wake.current(); else suspend.current(); }, [active]);

  return { progress, target, seek, nudge, playing, togglePlaying, stop };
}
