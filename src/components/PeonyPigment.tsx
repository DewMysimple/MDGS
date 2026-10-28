import { useEffect, useRef, useState } from 'react';
import { PeonyBloomSurface } from '../scene/PeonyBloomSurface';
import { atlasArt } from '../data/peonyAtlas';
import type { FrameRateLimit, RenderQuality } from '../scene/renderQuality';

interface Props { active: boolean; motionEnabled: boolean; renderQuality?: RenderQuality; frameRateLimit?: FrameRateLimit }

export default function PeonyPigment({ active, motionEnabled, renderQuality = '720p', frameRateLimit = 30 }: Props) {
  const host = useRef<HTMLDivElement>(null), surface = useRef<PeonyBloomSurface | null>(null);
  const latest = useRef({ active, motionEnabled, renderQuality, frameRateLimit }); latest.current = { active, motionEnabled, renderQuality, frameRateLimit };
  const [state, setState] = useState<'pending' | 'live' | 'image'>('pending');
  useEffect(() => {
    if (!host.current) return;
    let alive = true;
    try {
      const painting = new PeonyBloomSurface(host.current, atlasArt.peonies, ready => { if (alive) setState(ready ? 'live' : 'image'); });
      surface.current = painting;
      painting.setRenderQuality(latest.current.renderQuality); painting.setFrameRateLimit(latest.current.frameRateLimit);
      painting.setState(latest.current.active, latest.current.motionEnabled);
      return () => { alive = false; surface.current = null; painting.dispose(); };
    } catch { setState('image'); }
  }, []);
  useEffect(() => { surface.current?.setState(active, motionEnabled); }, [active, motionEnabled]);
  useEffect(() => { surface.current?.setRenderQuality(renderQuality); }, [renderQuality]);
  useEffect(() => { surface.current?.setFrameRateLimit(frameRateLimit); }, [frameRateLimit]);
  return <div className={`atlas-pigment${state === 'live' ? ' is-painted' : ''}`} data-pigment-state={state}>
    <img className="atlas-peonies" src={atlasArt.peonies} alt="" />
    <div className="atlas-pigment-host" ref={host} />
  </div>;
}
