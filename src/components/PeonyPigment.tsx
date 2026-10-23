import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { PeonyBloomSurface } from '../scene/PeonyBloomSurface';
import { atlasArt } from '../data/peonyAtlas';

export interface PeonyPigmentHandle { flourish: () => void }
interface Props { active: boolean; motionEnabled: boolean; onBrush: () => void }

const PeonyPigment = forwardRef<PeonyPigmentHandle, Props>(function PeonyPigment({ active, motionEnabled, onBrush }, ref) {
  const host = useRef<HTMLDivElement>(null), surface = useRef<PeonyBloomSurface | null>(null);
  const latest = useRef({ active, motionEnabled, onBrush }); latest.current = { active, motionEnabled, onBrush };
  const [state, setState] = useState<'pending' | 'live' | 'image'>('pending');
  useImperativeHandle(ref, () => ({ flourish: () => surface.current?.flourish() }), []);
  useEffect(() => {
    if (!host.current) return;
    let alive = true;
    try {
      const painting = new PeonyBloomSurface(host.current, atlasArt.peonies, ready => { if (alive) setState(ready ? 'live' : 'image'); }, () => latest.current.onBrush());
      surface.current = painting; painting.setState(latest.current.active, latest.current.motionEnabled);
      return () => { alive = false; surface.current = null; painting.dispose(); };
    } catch { setState('image'); }
  }, []);
  useEffect(() => { surface.current?.setState(active, motionEnabled); }, [active, motionEnabled]);
  return <div className={`atlas-pigment${state === 'live' ? ' is-painted' : ''}`} data-pigment-state={state}>
    <img className="atlas-peonies" src={atlasArt.peonies} alt="" />
    <div className="atlas-pigment-host" ref={host} />
  </div>;
});
export default PeonyPigment;
