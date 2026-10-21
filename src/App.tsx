import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Maximize, Minimize, Mouse, MoveHorizontal, Pause, Play, RotateCcw, Wind } from 'lucide-react';
import ScrollViewport from './components/ScrollViewport';
import type { ViewportMotionState } from './components/ScrollViewport';
import CulturePanel from './components/CulturePanel';
import AudioController from './components/AudioController';
import { BrocadeBorder, ExhibitionAtmosphere, ScrollRoller } from './components/ScrollOrnaments';
import { useScrollController } from './hooks/useScrollController';
import { chapters } from './data/chapters';
import StudyHome from './components/StudyHome';
import ScrollLoadingScene from './components/ScrollLoadingScene';
import { useStudyJourney } from './hooks/useStudyJourney';
import type { SceneManifest } from './types';
import './styles.css';

const ordinal = ['一', '二', '三', '四'];
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const motionPreferenceKey = 'guose-fanghua:painting-motion';

function readMotionPreference() {
  try { return localStorage.getItem(motionPreferenceKey) !== 'off'; }
  catch { return true; }
}

export default function App() {
  const stopRef = useRef<() => void>(() => {});
  const journey = useStudyJourney(() => stopRef.current());
  const { chapterId } = journey;
  const [cultureOpen, setCultureOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [notice, setNotice] = useState('');
  const [motionEnabled, setMotionEnabled] = useState(readMotionPreference);
  const [motionState, setMotionState] = useState<ViewportMotionState>({ enabled: false, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, supported: false });
  const [manifests, setManifests] = useState<Record<number, Pick<SceneManifest, 'id' | 'stops'>>>({});
  const { progress, target, seek, nudge, playing, togglePlaying, stop } = useScrollController(chapterId);
  stopRef.current = stop;
  const chapterIndex = chapters.findIndex(item => item.id === chapterId);
  const chapter = chapters[chapterIndex];
  const manifest = manifests[chapterId];
  const stops = manifest?.stops?.length ? manifest.stops : [{ name: '卷首', progress: 0 }, { name: '卷末', progress: 1 }];
  const currentIndex = stops.reduce((latest, item, index) => progress + 0.012 >= item.progress ? index : latest, 0);
  const currentStop = stops[currentIndex];
  const finished = progress >= 0.995;
  const stageRef = useRef<HTMLDivElement>(null);
  const closeCulture = useCallback(() => setCultureOpen(false), []);
  const receiveMotionState = useCallback((state: ViewportMotionState) => setMotionState(state), []);
  const receiveManifest = useCallback((data: SceneManifest) => {
    setManifests(previous => ({ ...previous, [chapterId]: { id: data.id, stops: data.stops } }));
  }, [chapterId]);

  const changeChapter = useCallback((id: number) => {
    stop();
    if (id !== chapterId || !journey.interactive) journey.select(id);
    setCultureOpen(false);
  }, [stop, chapterId, journey.interactive, journey.select]);

  const returnToStudy = useCallback(() => {
    stop(); setCultureOpen(false); journey.returnHome();
  }, [stop, journey.returnHome]);

  useEffect(() => {
    document.title = journey.phase === 'HOME' ? '国色长卷 · 数字牡丹赋' : `${chapter.title} · 国色长卷`;
    if (journey.interactive) stageRef.current?.focus({ preventScroll: true });
    else if (journey.phase !== 'HOME') setCultureOpen(false);
  }, [journey.phase, journey.interactive, chapter.title]);

  const goTo = useCallback((value: number) => {
    stop();
    seek(clamp(value));
  }, [seek, stop]);

  function previousScene() {
    const previous = [...stops].reverse().find(item => item.progress < progress - 0.002);
    goTo(previous?.progress ?? 0);
  }

  function nextScene() {
    const next = stops.find(item => item.progress > progress + 0.002);
    goTo(next?.progress ?? 1);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setNotice('当前浏览器暂不支持全屏显示。');
      window.setTimeout(() => setNotice(''), 4000);
    }
  }

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(motionPreferenceKey, motionEnabled ? 'on' : 'off'); }
    catch { /* Viewing and the current preference still work when storage is unavailable. */ }
  }, [motionEnabled]);

  function stageKeydown(event: KeyboardEvent<HTMLDivElement>) {
    if (!journey.interactive) return;
    if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    if (event.defaultPrevented) return;
    if (event.target !== event.currentTarget && event.key !== ' ') return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      stop();
      nudge(0.035);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      stop();
      nudge(-0.035);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      goTo(event.key === 'Home' ? 0 : 1);
    } else if (event.key === ' ') {
      event.preventDefault();
      togglePlaying();
    }
  }

  return (
    <div className={`peony-experience phase-${journey.phase.toLowerCase().replaceAll('_', '-')} ${motionEnabled ? '' : 'environment-off'}`} data-journey-phase={journey.phase}>
    {journey.phase !== 'SCROLL_VIEWER' && <div className="journey-study" inert={journey.phase !== 'HOME'} aria-hidden={journey.phase !== 'HOME'}>
      <StudyHome phase={journey.phase} chapterId={chapterId} onSelect={journey.select} motionEnabled={motionEnabled} onToggleMotion={() => setMotionEnabled(value => !value)} />
    </div>}
    {journey.viewerMounted && <div className={`app-shell journey-viewer${journey.interactive ? ' is-interactive' : ''}`} inert={!journey.interactive} aria-hidden={!journey.interactive}>
      <ExhibitionAtmosphere />
      <a className="skip-link" href="#scroll-artwork" onClick={event => { event.preventDefault(); stageRef.current?.focus(); }}>跳至画卷</a>
      <header className="site-header">
        <button className="brand" type="button" onClick={returnToStudy} aria-label="返回书房">
          <span className="brand-seal" aria-hidden="true">牡<br />丹</span>
          <span className="brand-wordmark">国色长卷<span>返回书房 · 数字牡丹赋</span></span>
        </button>
        <nav className="chapter-nav" aria-label="四卷导航">
          {chapters.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={`chapter-link${chapterId === item.id ? ' is-current' : ''}`}
              onClick={() => changeChapter(item.id)}
              aria-current={chapterId === item.id ? 'page' : undefined}
              aria-label={`第${ordinal[index]}卷，${item.title}`}
            ><span className="chapter-numeral">{item.numeral}</span><span className="chapter-nav-name">{item.title}</span></button>
          ))}
        </nav>
        <span className="header-divider" />
        <button className="fullscreen-button icon-button" type="button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? '退出全屏' : '进入全屏'} title={fullscreen ? '退出全屏' : '全屏观画'}>
          {fullscreen ? <Minimize size={18} strokeWidth={1.4} /> : <Maximize size={18} strokeWidth={1.4} />}<span>{fullscreen ? '退出' : '全屏'}</span>
        </button>
      </header>

      <main className="exhibition">
        <h1 className="visually-hidden" id="chapter-title">第{ordinal[chapterIndex]}卷 · {chapter.title}</h1>

        <section className="scroll-exhibition" aria-label={`第${ordinal[chapterIndex]}卷：${chapter.title}`}>
          <div className="scroll-mount">
            <BrocadeBorder edge="top" />
            <div
              className="painting"
              id="scroll-artwork"
              ref={stageRef}
              tabIndex={0}
              onKeyDown={stageKeydown}
              role="region"
              aria-label={`${chapter.title}画卷，使用滚轮或拖拽游观，也可用方向键移动，空格键自动展卷`}
            >
              <ScrollViewport
                key={`${chapterId}-${journey.attempt}`}
                chapterId={chapterId}
                interactive={journey.interactive}
                onPreparation={journey.onPreparation}
                onReady={journey.onReady}
                progress={progress}
                motionEnabled={motionEnabled}
                onMotionState={receiveMotionState}
                onNudge={nudge}
                onSeek={seek}
                onManualInput={stop}
                onManifest={receiveManifest}
              />
              {finished && (
                <aside className="end-colophon" aria-label="卷末题跋">
                  <span className="end-seal" aria-hidden="true">阅<br />毕</span>
                  <p className="eyebrow">第{ordinal[chapterIndex]}卷 · 卷末</p>
                  <h2>花事有尽，余韵悠长</h2>
                  <p className="end-colophon-text">{chapter.colophon}</p>
                  <div className="end-actions">
                    <button className="text-button" type="button" onClick={() => goTo(0)}><RotateCcw size={14} strokeWidth={1.4} />再观此卷</button>
                    <button className="text-button" type="button" onClick={() => changeChapter(chapters[(chapterIndex + 1) % chapters.length].id)}>{chapterIndex === chapters.length - 1 ? '重游四卷' : '展开下一卷'}<ArrowRight size={15} strokeWidth={1.4} /></button>
                  </div>
                </aside>
              )}
            </div>
            <BrocadeBorder edge="bottom" />
            <ScrollRoller side="left" />
            <ScrollRoller side="right" />
          </div>
        </section>

        <section className="scroll-controls" aria-label="画卷游观控制">
          <div className="control-topline">
            <div className="current-scene" aria-live="polite" aria-atomic="true"><span className="scene-counter">{String(currentIndex + 1).padStart(2, '0')}<i>/ {String(stops.length).padStart(2, '0')}</i></span><span className="scene-name">{currentStop.name}</span>{finished && <span className="viewed-label">此卷已阅</span>}</div>
            <span className="progress-caption"><span>{finished ? '卷末' : progress < 0.005 ? '卷首' : '游观中'}</span><b>{Math.round(progress * 100).toString().padStart(2, '0')}<small>%</small></b></span>
          </div>
          <div className="chapter-timeline" style={{ '--progress': `${progress * 100}%` } as CSSProperties}>
            <div className="timeline-rule" aria-hidden="true"><span /></div>
            <input type="range" min="0" max="1" step="0.001" value={progress}
              onInput={event => goTo(Number(event.currentTarget.value))}
              onKeyDown={event => {
                const keys: Record<string, number> = { Home: 0, End: 1, ArrowRight: target + 0.01, ArrowUp: target + 0.01, ArrowLeft: target - 0.01, ArrowDown: target - 0.01, PageUp: target + 0.1, PageDown: target - 0.1 };
                if (event.key in keys) { event.preventDefault(); goTo(keys[event.key]); }
              }}
              aria-label="画卷游观进度" aria-valuetext={`已观赏 ${Math.round(progress * 100)}%，${currentStop.name}`} />
            <div className="timeline-stops">
              {stops.map((item, index) => <button type="button" key={`${index}-${item.name}`} className={`timeline-stop${index <= currentIndex ? ' is-passed' : ''}`} style={{ left: `${item.progress * 100}%` }} onClick={() => goTo(item.progress)} aria-label={`游观至${item.name}`} title={item.name}><i /></button>)}
            </div>
            <span className="timeline-cursor" aria-hidden="true" />
          </div>
          <div className="control-bottomline">
            <p className="interaction-hint"><Mouse size={14} strokeWidth={1.25} /><span>滚轮游观</span><i /><MoveHorizontal size={16} strokeWidth={1.25} /><span>左右拖拽</span></p>
            <div className="playback-controls">
              <button className="step-button" type="button" onClick={previousScene} disabled={progress < 0.005} aria-label="上一分镜" title="上一分镜"><ChevronLeft size={18} strokeWidth={1.35} /><span>上一景</span></button>
              <button className={`play-button${playing ? ' is-playing' : ''}`} type="button" onClick={togglePlaying} aria-pressed={playing}>{playing ? <Pause size={13} strokeWidth={1.5} fill="currentColor" /> : <Play size={13} strokeWidth={1.5} fill="currentColor" />}<span>{playing ? '暂停展卷' : '自动展卷'}</span></button>
              <button className="step-button" type="button" onClick={nextScene} disabled={finished} aria-label="下一分镜" title="下一分镜"><span>下一景</span><ChevronRight size={18} strokeWidth={1.35} /></button>
            </div>
            <div className="secondary-controls">
              <button type="button" className={`utility-button motion-button${motionState.enabled ? ' is-active' : ''}`}
                onClick={() => setMotionEnabled(value => !value)}
                aria-label="画中轻动" aria-pressed={motionState.enabled}
                disabled={motionState.reducedMotion || !motionState.supported}
                aria-describedby="painting-motion-state"
                title={motionState.reducedMotion ? '遵循系统减少动态效果设置' : !motionState.supported ? '本卷保持静态' : '切换花枝与云气轻动，不影响自动展卷'}>
                <Wind size={16} strokeWidth={1.4} /><span>画中轻动</span>
                <small id="painting-motion-state" role="status">{motionState.reducedMotion ? '随系统静止' : !motionState.supported ? '本卷静态' : motionState.enabled ? '已开' : '已关'}</small>
              </button>
              <span className="secondary-divider" /><AudioController /><span className="secondary-divider" />
              <button type="button" className="utility-button" onClick={() => { stop(); setCultureOpen(true); }} aria-label="打开文化解读"><BookOpen size={16} strokeWidth={1.4} /><span>画外拾遗</span></button>
            </div>
          </div>
        </section>
      </main>

      {notice && <div className="status-notice" role="status">{notice}</div>}
      <CulturePanel chapter={chapter} open={cultureOpen} onClose={closeCulture} />
    </div>}
    {journey.phase !== 'HOME' && journey.phase !== 'SCROLL_VIEWER' && journey.phase !== 'SCROLL_AWAKENING' && journey.phase !== 'CAMERA_ENTERING' && <ScrollLoadingScene
      chapter={chapter} phase={journey.phase} preparation={journey.preparation} error={journey.error}
      onRetry={journey.retry} onReturn={returnToStudy} motionEnabled={motionEnabled} />}
    </div>
  );
}
