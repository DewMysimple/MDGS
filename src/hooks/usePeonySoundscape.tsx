import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { PeonySoundscape, type SoundscapeState } from '../audio/PeonySoundscape';
import type { SoundscapeInput } from '../audio/cueMap';

interface SoundscapeContextValue extends SoundscapeState {
  chapterId: number;
  toggle: () => void;
  setVolume: (value: number) => void;
  cue: PeonySoundscape['cue'];
}
const SoundscapeContext = createContext<SoundscapeContextValue | null>(null);
export interface SoundscapeProviderProps extends SoundscapeInput { children: ReactNode }

/** Wrap the complete application once, outside conditional home/viewer layers.
 * Multiple AudioController views share this one graph and one opt-in state.
 * `reading` means an opened flower-note/cultural reading panel, not every
 * ordinary paragraph already printed alongside the painting. */
export function SoundscapeProvider({ phase, chapterId, progress, reading, children }: SoundscapeProviderProps) {
  const [engine] = useState(() => new PeonySoundscape());
  const state = useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
  useEffect(() => {
    engine.mount();
    const target = window as Window & { __MDGS_AUDIO__?: { snapshot: PeonySoundscape['snapshot'] } };
    const debug = { snapshot: engine.snapshot }; target.__MDGS_AUDIO__ = debug;
    return () => { if (target.__MDGS_AUDIO__ === debug) delete target.__MDGS_AUDIO__; engine.dispose(); };
  }, [engine]);
  useEffect(() => { engine.update({ phase, chapterId, progress, reading }); }, [engine, phase, chapterId, progress, reading]);
  const value = useMemo(() => ({ ...state, chapterId, toggle: engine.toggle, setVolume: engine.setVolume, cue: engine.cue }), [state, chapterId, engine]);
  return <SoundscapeContext.Provider value={value}>{children}</SoundscapeContext.Provider>;
}

export function usePeonySoundscape() {
  const context = useContext(SoundscapeContext);
  if (!context) throw new Error('AudioController must be inside the site-wide SoundscapeProvider.');
  return context;
}
