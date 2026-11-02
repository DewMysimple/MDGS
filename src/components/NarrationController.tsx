import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';
import '../styles/narration-controller.css';

interface NarrationControllerProps {
  chapterId: number;
  active: boolean;
  onPlaybackChange: (playing: boolean) => void;
}

export default function NarrationController({ chapterId, active, onPlaybackChange }: NarrationControllerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
    setMessage('');
    onPlaybackChange(false);
    return () => { audio.pause(); };
  }, [chapterId, onPlaybackChange]);

  useEffect(() => {
    if (!active) audioRef.current?.pause();
  }, [active]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    setMessage('');
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setMessage('旁白暂未载入，请稍后重试。');
      setPlaying(false);
      onPlaybackChange(false);
    }
  }

  function handlePlay() {
    setPlaying(true);
    setMessage('');
    onPlaybackChange(true);
  }

  function handlePause() {
    setPlaying(false);
    onPlaybackChange(false);
  }

  return <span className="narration-control" data-narration-playing={playing}>
    <button className={`utility-button narration-button${playing ? ' is-active' : ''}`} type="button"
      onClick={() => void toggle()} disabled={!active} aria-pressed={playing}
      aria-label={playing ? '暂停旁白诵读' : '诵读本卷旁白'} title="使用指定音色诵读本卷旁白">
      {playing ? <Pause size={15} strokeWidth={1.4} /> : <Volume2 size={16} strokeWidth={1.4} />}
      <span>{playing ? '暂停旁白' : '诵读旁白'}</span>
      <i aria-hidden="true">{playing ? '正在读' : '本卷'}</i>
      <Play className="narration-play-mark" size={10} strokeWidth={1.5} fill="currentColor" aria-hidden="true" />
    </button>
    <audio ref={audioRef} src={`${import.meta.env.BASE_URL}audio/narration/chapter-${chapterId}.mp3`}
      preload="none" onPlay={handlePlay} onPause={handlePause} onEnded={handlePause}
      onError={() => { setMessage('旁白音频未能载入。'); setPlaying(false); onPlaybackChange(false); }}
      aria-hidden="true" tabIndex={-1} />
    <span className="visually-hidden" role="status">{message || (playing ? '本卷旁白正在诵读' : '本卷旁白已暂停')}</span>
  </span>;
}
