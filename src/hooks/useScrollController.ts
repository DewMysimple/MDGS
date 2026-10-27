import { useCallback, useEffect, useRef, useState } from 'react';
import { sceneOptions } from '../data/sceneOptions';
import { nudgedTarget, smoothProgress } from './scrollMotion';
import { activeSourceEdition } from '../data/sourceEdition';
import { advanceSourceProgress, sourceDuration, type SourceTiming } from '../scene/sourceClock';

const savedProgress = new Map<number, number>();
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const progressKey = (id: number) => `guose-fanghua:${activeSourceEdition}:chapter-${id}:position`;
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

interface ScrollControllerOptions { smoothingMs?: number; active?: boolean; timing?: SourceTiming }

/** All input shares one time-based follower; idle and covered scrolls have no RAF loop. */
export function useScrollController(chapterId: number, { smoothingMs = 180, active = true, timing }: ScrollControllerOptions = {}) {
  const [progress, setProgress] = useState(() => restoreProgress(chapterId));
  const [target, setTarget] = useState(progress);
  const [playing, setPlaying] = useState(false);
  const position = useRef(progress);
  const destination = useRef(progress);
  const playingRef = useRef(false);
  const playbackBlocked = useRef(true);
  const playbackEpoch = useRef(0);
  const frameClock = useRef<{ previous?: number; epoch: number; lastSaved: number }>({ epoch: 0, lastSaved: 0 });
  const chapterRef = useRef(chapterId);
  const reducedMotion = useRef(false);
  const options = useRef({ smoothingMs, active });
  options.current = { smoothingMs, active };
  const wake = useRef<() => void>(() => {});
  const suspend = useRef<() => void>(() => {});
  const timingRef = useRef(timing);
  timingRef.current = timing;

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reducedMotion.current = media.matches; wake.current(); };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const stop = useCallback(() => { playingRef.current = false; setPlaying(false); }, []);
  const setFrameDriverWake = useCallback((request: (() => void) | null) => {
    wake.current = request ?? (() => {});
    frameClock.current.previous = undefined;
    if (request && options.current.active && (playingRef.current || position.current !== destination.current)) request();
  }, []);
  const setPlaybackBlocked = useCallback((blocked: boolean) => {
    if (playbackBlocked.current === blocked) return;
    playbackBlocked.current = blocked;
    // A resource wait is not elapsed film time. Invalidate the previous RAF
    // timestamp even when a manual seek keeps that RAF loop running.
    playbackEpoch.current++;
    wake.current();
  }, []);
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
    const starting = !playingRef.current;
    if (starting) {
      // A manual follower can still have an outstanding target and RAF. Start
      // the film from the displayed position and discard that input's clock.
      destination.current = position.current;
      setTarget(destination.current);
      playbackEpoch.current++;
    }
    playingRef.current = starting;
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
    setPlaybackBlocked(true);
    stop();
  }, [chapterId, stop, setPlaybackBlocked]);

  // The renderer owns the only display-rate gate. Advancing immediately before
  // its draw prevents separately phased RAF loops from presenting stale or
  // skipping intermediate controller positions.
  const driveFrame = useCallback((now: number, elapsedMs: number): { progress: number; active: boolean } => {
      const clock = frameClock.current;
      if (document.hidden || !options.current.active) {
        clock.previous = undefined;
        return { progress: position.current, active: false };
      }
      const elapsed = clock.previous === undefined || now < clock.previous ? 0 : (now - clock.previous) / 1000;
      // Carry fractional refresh intervals on the display grid; clipping each
      // 32/36 ms interval individually would make 30 fps playback run slow.
      const playbackElapsed = clock.previous !== undefined && clock.epoch === playbackEpoch.current ? Math.max(0, elapsedMs) / 1000 : 0;
      clock.epoch = playbackEpoch.current;
      clock.previous = now;
      const dt = Math.min(elapsed, 0.25);
      if (playingRef.current && !playbackBlocked.current) {
        const duration = sourceDuration(timingRef.current, sceneOptions[chapterRef.current]?.autoplayDuration ?? 154);
        const nativeClock = !!timingRef.current?.sourceRevision;
        const maximumStep = nativeClock ? (timingRef.current!.fpsBase ?? 1) / timingRef.current!.fps : .25;
        destination.current = advanceSourceProgress(destination.current, Math.min(playbackElapsed, maximumStep), duration);
        // Smoothing remains for manual navigation. Playback follows source
        // time with waits excluded. Under load it intentionally slows instead
        // of skipping authored entrance frames to catch up with wall time.
        if (nativeClock) {
          position.current = destination.current;
          setProgress(position.current);
          savedProgress.set(chapterRef.current, position.current);
        }
        setTarget(destination.current);
      }
      const next = reducedMotion.current ? destination.current : smoothProgress(position.current, destination.current, dt, options.current.smoothingMs);
      if (next !== position.current) {
        position.current = next;
        setProgress(next);
        savedProgress.set(chapterRef.current, next);
      }
      if (playingRef.current && destination.current >= 1 && position.current === 1) stop();
      const moving = (playingRef.current && !playbackBlocked.current) || position.current !== destination.current;
      if (!moving || now - clock.lastSaved > 1000) {
        persistProgress(chapterRef.current, position.current);
        clock.lastSaved = now;
      }
      if (!moving) clock.previous = undefined;
      return { progress: position.current, active: moving };
  }, [stop]);

  useEffect(() => {
    const save = () => { persistProgress(chapterRef.current, position.current); };
    suspend.current = () => {
      frameClock.current.previous = undefined;
      stop();
      destination.current = position.current;
      setTarget(position.current);
      save();
    };
    const onVisibility = () => { if (document.hidden) suspend.current(); else wake.current(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', save);
    return () => {
      save(); suspend.current = () => {};
      document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', save);
    };
  }, [stop]);

  useEffect(() => { if (active) wake.current(); else suspend.current(); }, [active]);

  return { progress, target, seek, nudge, playing, togglePlaying, stop, setPlaybackBlocked, driveFrame, setFrameDriverWake };
}
