import { useCallback, useEffect, useRef, useState } from 'react';
import { sceneOptions } from '../data/sceneOptions';
import { nudgedTarget, smoothProgress } from './scrollMotion';
import { activeSourceEdition } from '../data/sourceEdition';
import { advanceSourceProgress, sourceDuration, type SourceTiming } from '../scene/sourceClock';
import { FramePacer, type FrameRateLimit } from '../scene/FramePacer';

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

interface ScrollControllerOptions { smoothingMs?: number; active?: boolean; timing?: SourceTiming; frameRateLimit?: FrameRateLimit }

/** All input shares one time-based follower; idle and covered scrolls have no RAF loop. */
export function useScrollController(chapterId: number, { smoothingMs = 180, active = true, timing, frameRateLimit = 30 }: ScrollControllerOptions = {}) {
  const [progress, setProgress] = useState(() => restoreProgress(chapterId));
  const [target, setTarget] = useState(progress);
  const [playing, setPlaying] = useState(false);
  const position = useRef(progress);
  const destination = useRef(progress);
  const playingRef = useRef(false);
  const playbackBlocked = useRef(true);
  const playbackEpoch = useRef(0);
  const chapterRef = useRef(chapterId);
  const reducedMotion = useRef(false);
  const options = useRef({ smoothingMs, active, frameRateLimit });
  options.current = { smoothingMs, active, frameRateLimit };
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

  useEffect(() => {
    let frame = 0;
    let timer = 0;
    let previous = 0;
    let clockEpoch = playbackEpoch.current;
    let appliedFrameRateLimit = options.current.frameRateLimit;
    const pacer = new FramePacer(appliedFrameRateLimit);
    let lastSaved = performance.now();
    const save = () => { persistProgress(chapterRef.current, position.current); lastSaved = performance.now(); };
    const schedule = (): void => {
      if (frame || timer) return;
      // Sleep through most of the capped interval on high-refresh screens;
      // RAF still chooses the actual display opportunity near the deadline.
      const delay = pacer.timeUntilDue(performance.now()) - 8;
      if (delay > 0) timer = window.setTimeout(() => {
        timer = 0;
        frame = requestAnimationFrame(animate);
      }, delay);
      else frame = requestAnimationFrame(animate);
    };
    const animate = (now: number): void => {
      frame = 0;
      if (document.hidden || !options.current.active) return;
      if (appliedFrameRateLimit !== options.current.frameRateLimit) {
        appliedFrameRateLimit = options.current.frameRateLimit;
        pacer.setLimit(appliedFrameRateLimit);
        previous = now;
        clockEpoch = playbackEpoch.current;
      }
      if (!pacer.shouldRender(now)) {
        schedule();
        return;
      }
      const elapsed = Math.max(0, (now - previous) / 1000);
      // Accepted clock slots retain their time when intermediate RAFs were
      // skipped. Ideal grid deltas also avoid losing time to 144/250 Hz RAF
      // jitter before the one-source-frame slow-tick cap is applied below.
      const playbackElapsed = clockEpoch === playbackEpoch.current ? pacer.elapsedMs / 1000 : 0;
      clockEpoch = playbackEpoch.current;
      const dt = Math.min(elapsed, 0.25);
      previous = now;
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
      if (!moving || now - lastSaved > 1000) save();
      if (moving) schedule();
    };
    wake.current = () => {
      if (frame || timer || document.hidden || !options.current.active || ((!playingRef.current || playbackBlocked.current) && position.current === destination.current)) return;
      previous = performance.now();
      clockEpoch = playbackEpoch.current;
      appliedFrameRateLimit = options.current.frameRateLimit;
      pacer.setLimit(appliedFrameRateLimit);
      pacer.reset();
      schedule();
    };
    suspend.current = () => {
      cancelAnimationFrame(frame); frame = 0;
      window.clearTimeout(timer); timer = 0;
      pacer.reset();
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
      window.clearTimeout(timer);
      wake.current = () => {}; suspend.current = () => {};
      document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', save);
    };
  }, [stop]);

  useEffect(() => { if (active) wake.current(); else suspend.current(); }, [active]);

  return { progress, target, seek, nudge, playing, togglePlaying, stop, setPlaybackBlocked };
}
