import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { usePeonySoundscape } from '../hooks/usePeonySoundscape';
import '../styles/audio-controller.css';

interface AudioControllerProps { active?: boolean; chapterId?: number; variant?: 'foyer' | 'viewer' }

/** A view of the shared original digital soundscape; unmounting a control never
 * ends playback. The provider follows the complete home/scroll journey.
 * Visible and accessible wording both describe original digital sound. */
export default function AudioController({ active = true, variant = 'viewer' }: AudioControllerProps) {
  const { enabled, playback, volume, chapterId, toggle, setVolume } = usePeonySoundscape();
  const [open, setOpen] = useState(false);
  const [popup, setPopup] = useState({ below: variant === 'foyer', right: 0 });
  const root = useRef<HTMLSpanElement>(null), volumeButton = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!root.current || !popupRef.current) return;
      const anchor = root.current.getBoundingClientRect(), box = popupRef.current.getBoundingClientRect();
      const below = variant === 'foyer' || anchor.top < box.height + 16;
      const right = anchor.right - box.width < 12 ? anchor.right - box.width - 12 : Math.max(0, anchor.right - window.innerWidth + 12);
      setPopup(previous => previous.below === below && previous.right === right ? previous : { below, right });
    };
    place(); window.addEventListener('resize', place);
    const observer = new ResizeObserver(place); if (popupRef.current) observer.observe(popupRef.current);
    return () => { window.removeEventListener('resize', place); observer.disconnect(); };
  }, [open, variant]);
  useEffect(() => { if (!enabled || !active) setOpen(false); }, [enabled, active]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); volumeButton.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const label = enabled ? '关闭原创数字声景' : playback === 'error' ? '重试原创数字声景' : '开启原创数字声景';
  return <span ref={root} className={`audio-control audio-control--${variant}`} data-audio-state={playback} data-audio-enabled={enabled} data-score="peony-v3" data-audio-chapter={chapterId}>
    <button className={`utility-button audio-button${enabled ? ' is-active' : ''}`} type="button" onClick={toggle}
      disabled={!active} aria-pressed={enabled} aria-label={label} title={playback === 'error' ? '声景暂未载入，轻触重试' : '《一庭春深》· 原创数字声景'}>
      {enabled ? <Volume2 size={17} strokeWidth={1.35} /> : <VolumeX size={17} strokeWidth={1.35} />}
      <span>{playback === 'loading' ? '声景初醒' : playback === 'error' ? '重试声景' : enabled ? '听春' : '启声'}</span>
      <span className="sound-indicator" data-sounding={playback === 'playing'} aria-hidden="true"><i /><i /><i /><i /><i /></span>
    </button>
    {enabled && <button className="audio-volume-trigger" ref={volumeButton} type="button" onClick={() => setOpen(value => !value)} aria-label="调整声景音量" aria-expanded={open} disabled={!active} title="声景音量"><SlidersHorizontal size={14} strokeWidth={1.3} /></button>}
    {enabled && open && <span ref={popupRef} className={`audio-volume-popover${popup.below ? ' is-below' : ''}`} style={{ right: popup.right }} role="group" aria-label="原创声景音量设置">
      <span className="audio-score-title">一庭春深 <small>原创数字声景</small></span>
      <label className="audio-volume"><span>音量</span><input type="range" min="0" max="100" step="1" value={volume} onChange={event => setVolume(Number(event.target.value))} aria-label="原创数字声景音量" /><output>{volume}</output></label>
      <span className="audio-score-note">声随画境，留白亦有回响</span>
    </span>}
    <span className="visually-hidden" role="status">{playback === 'loading' ? '正在准备三层原创数字声景' : playback === 'error' ? '声景未能载入，可轻触重试' : playback === 'paused' ? '页面暂歇，声景已暂停' : playback === 'playing' ? '原创数字声景《一庭春深》正在播放' : '声景已关闭'}</span>
  </span>;
}
