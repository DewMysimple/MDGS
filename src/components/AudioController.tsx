import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import '../styles/audio-controller.css';

type Playback = 'off' | 'loading' | 'playing' | 'paused' | 'error';
const volumeKey = 'guose-fanghua:music-volume';
const musicUrl = `${import.meta.env.BASE_URL}audio/peony-guzheng-original.mp3`;

/** A local original score, with a synthesized guzheng-inspired plucked timbre.
 * Playback can only be enabled by the user; hiding/leaving the world suspends
 * the same clock, and disabling/unmounting releases the graph and fetch. */
export default function AudioController({ active = true }: { active?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [playback, setPlayback] = useState<Playback>('off');
  const [volume, setVolume] = useState(() => {
    try { const value = Number(localStorage.getItem(volumeKey)); return localStorage.getItem(volumeKey) !== null && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 40; }
    catch { return 40; }
  });
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const enabledRef = useRef(false), activeRef = useRef(active), mountedRef = useRef(true);
  const volumeRef = useRef(volume), generationRef = useRef(0), activityRef = useRef(0);
  const synchronizeRef = useRef<() => void>(() => {});
  activeRef.current = active;

  function dispose() {
    generationRef.current++; activityRef.current++;
    requestRef.current?.abort(); requestRef.current = null;
    const source = sourceRef.current; sourceRef.current = null;
    if (source) { try { source.stop(); } catch { /* Already stopped or not started. */ } source.disconnect(); }
    gainRef.current?.disconnect(); gainRef.current = null;
    const context = contextRef.current; contextRef.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  async function synchronize() {
    const context = contextRef.current;
    if (!enabledRef.current || !context || !sourceRef.current || context.state === 'closed') return;
    const ticket = ++activityRef.current, generation = generationRef.current;
    const shouldPlay = activeRef.current && !document.hidden;
    try {
      await (shouldPlay ? context.resume() : context.suspend());
      if (mountedRef.current && ticket === activityRef.current && generation === generationRef.current) setPlayback(shouldPlay ? 'playing' : 'paused');
    } catch {
      if (mountedRef.current && ticket === activityRef.current && generation === generationRef.current) setPlayback('paused');
    }
  }
  synchronizeRef.current = () => { void synchronize(); };

  useEffect(() => {
    mountedRef.current = true;
    const visibility = () => synchronizeRef.current();
    document.addEventListener('visibilitychange', visibility);
    return () => { mountedRef.current = false; enabledRef.current = false; document.removeEventListener('visibilitychange', visibility); dispose(); };
  }, []);
  useEffect(() => { synchronizeRef.current(); }, [active, enabled]);

  async function toggle() {
    if (enabledRef.current) {
      enabledRef.current = false; dispose(); setEnabled(false); setPlayback('off'); return;
    }
    if (!activeRef.current) return;
    const generation = ++generationRef.current;
    enabledRef.current = true; setEnabled(true); setPlayback('loading');
    const request = new AbortController(); requestRef.current = request;
    try {
      // Creating/resuming directly in this click grants the initial audio gesture.
      const context = new AudioContext(); contextRef.current = context;
      await context.resume();
      if (generation !== generationRef.current || !mountedRef.current) return;
      const response = await fetch(musicUrl, { signal: request.signal });
      if (!response.ok) throw new Error('The local accompaniment could not be loaded.');
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (generation !== generationRef.current || !mountedRef.current || context.state === 'closed') return;
      requestRef.current = null;
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; source.loop = true; source.loopStart = 0; source.loopEnd = buffer.duration;
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(volumeRef.current / 100, context.currentTime + .16);
      source.connect(gain); gain.connect(context.destination);
      sourceRef.current = source; gainRef.current = gain; source.start();
      await synchronize();
    } catch {
      if (generation !== generationRef.current || !mountedRef.current) return;
      enabledRef.current = false; dispose(); setEnabled(false); setPlayback('error');
    }
  }

  function changeVolume(value: number) {
    volumeRef.current = value; setVolume(value);
    try { localStorage.setItem(volumeKey, String(value)); } catch { /* Session volume still works. */ }
    const gain = gainRef.current, context = contextRef.current;
    if (gain && context && context.state !== 'closed') {
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setTargetAtTime(value / 100, context.currentTime, .035);
    }
  }

  const label = enabled ? '关闭古筝意境配乐' : playback === 'error' ? '重试古筝意境配乐' : '开启古筝意境配乐';
  return <span className="audio-control" data-audio-state={playback} data-audio-enabled={enabled}>
    <button className={`utility-button audio-button${enabled ? ' is-active' : ''}`} type="button" onClick={() => void toggle()}
      disabled={!active} aria-pressed={enabled} aria-label={label} title={playback === 'error' ? '配乐暂未载入，轻触重试' : '原创古筝意境配乐'}>
      {enabled ? <Volume2 size={17} strokeWidth={1.5} /> : <VolumeX size={17} strokeWidth={1.5} />}
      <span>{playback === 'loading' ? '调弦中' : playback === 'error' ? '重试配乐' : '古筝配乐'}</span>
      {playback === 'playing' && <span className="sound-indicator" aria-hidden="true"><i /><i /><i /></span>}
    </button>
    {enabled && <label className="audio-volume"><span>音量</span><input type="range" min="0" max="100" step="1" value={volume} onChange={event => changeVolume(Number(event.target.value))} aria-label="古筝配乐音量" /><output>{volume}</output></label>}
    <span className="visually-hidden" role="status">{playback === 'loading' ? '正在准备原创古筝意境配乐' : playback === 'error' ? '配乐未能载入，可轻触重试' : playback === 'paused' ? '画卷暂歇，配乐已暂停' : playback === 'playing' ? '原创古筝意境配乐正在循环播放' : '配乐已关闭'}</span>
  </span>;
}
