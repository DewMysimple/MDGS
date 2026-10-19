import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

/** A quiet, locally synthesised pentatonic soundscape. No network audio is used. */
export default function AudioController() {
  const [enabled, setEnabled] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const generationRef = useRef(0);
  const startingRef = useRef(false);
  const [unavailable, setUnavailable] = useState(false);

  const dispose = () => {
    generationRef.current += 1;
    window.clearInterval(timerRef.current);
    timerRef.current = undefined;
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== 'closed') void context.close();
  };

  useEffect(() => () => dispose(), []);

  async function toggle() {
    if (startingRef.current) return;
    if (enabled) {
      dispose();
      setEnabled(false);
      return;
    }
    startingRef.current = true;
    try {
      const generation = ++generationRef.current;
      const context = new AudioContext();
      contextRef.current = context;
      await context.resume();
      if (generation !== generationRef.current || context.state === 'closed') {
        if (context.state !== 'closed') void context.close();
        return;
      }
      const master = context.createGain();
      master.gain.value = 0.18;
      master.connect(context.destination);
      const convolver = context.createConvolver();
      const impulse = context.createBuffer(2, context.sampleRate * 2.8, context.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let index = 0; index < data.length; index++) {
          data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / data.length, 3.5);
        }
      }
      convolver.buffer = impulse;
      const wet = context.createGain();
      wet.gain.value = 0.28;
      convolver.connect(wet);
      wet.connect(master);
      const notes = [293.665, 329.628, 369.994, 440, 493.883];
      let noteIndex = 0;
      const playTone = () => {
        if (context.state === 'closed') return;
        const time = context.currentTime;
        const frequency = notes[[0, 3, 1, 4, 2, 3, 0, 2][noteIndex++ % 8]];
        const envelope = context.createGain();
        envelope.gain.setValueAtTime(0, time);
        envelope.gain.linearRampToValueAtTime(0.18, time + 0.08);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + 6);
        envelope.gain.linearRampToValueAtTime(0, time + 7);
        envelope.connect(master);
        envelope.connect(convolver);
        [1, 2.001, 3.997].forEach((ratio, index) => {
          const oscillator = context.createOscillator();
          const harmonic = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.value = frequency * ratio;
          harmonic.gain.value = [1, 0.22, 0.045][index];
          oscillator.connect(harmonic);
          harmonic.connect(envelope);
          oscillator.start(time);
          oscillator.stop(time + 7.2);
          oscillator.onended = () => {
            oscillator.disconnect();
            harmonic.disconnect();
            if (index === 2) envelope.disconnect();
          };
        });
      };
      playTone();
      timerRef.current = window.setInterval(playTone, 4600);
      setEnabled(true);
      setUnavailable(false);
    } catch {
      dispose();
      setUnavailable(true);
      setEnabled(false);
    } finally {
      startingRef.current = false;
    }
  }

  return (
    <button
      className={`utility-button audio-button${enabled ? ' is-active' : ''}`}
      type="button"
      onClick={() => void toggle()}
      aria-pressed={enabled}
      aria-label={enabled ? '关闭五声音阶环境声' : '开启五声音阶环境声'}
      title={unavailable ? '当前浏览器未能启用声音，可再次尝试' : enabled ? '关闭五声音阶环境声' : '开启五声音阶环境声'}
    >
      {enabled ? <Volume2 size={17} strokeWidth={1.5} /> : <VolumeX size={17} strokeWidth={1.5} />}
      <span>{unavailable ? '重试声音' : enabled ? '听音中' : '听音'}</span>
      {enabled && <span className="sound-indicator" aria-hidden="true"><i /><i /><i /></span>}
    </button>
  );
}
