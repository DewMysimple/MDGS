import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Maximize, Minimize, Mouse, MoveHorizontal, Pause, Play, Settings, Wind } from 'lucide-react';
import ScrollViewport from './components/ScrollViewport';
import ScrollTimeline from './components/ScrollTimeline';
import type { ScrollPresentationHandle, ViewportMotionState } from './components/ScrollViewport';
import CulturePanel from './components/CulturePanel';
import ScrollColophon from './components/ScrollColophon';
import FlowerLetterDialog from './components/FlowerLetterDialog';
import AudioController from './components/AudioController';
import ArtEncounters from './components/ArtEncounters';
import { artEncounters, type ArtworkAnchorSpec, type ProjectedArtAnchor } from './data/artEncounters';
import { SoundscapeProvider } from './hooks/usePeonySoundscape';
import { BrocadeBorder, ScrollRoller } from './components/ScrollOrnaments';
import { useScrollController } from './hooks/useScrollController';
import { chapters } from './data/chapters';
import StudyHome from './components/PeonyAtlasHome';
import ScrollLoadingScene from './components/ScrollLoadingScene';
import { useStudyJourney } from './hooks/useStudyJourney';
import type { SceneManifest } from './types';
import NarrativeCalligraphy from './components/NarrativeCalligraphy';
import type { NarrativeSpace } from './scene/NarrativeSpace';
import ViewerSettingsPanel from './components/ViewerSettingsPanel';
import { readViewerSettings, textPlateVariables, viewerSettingsKey } from './data/viewerSettings';
import { activeSourceEdition } from './data/sourceEdition';
import { matchesArtworkSnapshot, releaseArtworkSnapshot, type ArtworkSnapshot } from './scene/artworkSnapshot';
import './styles.css';

const ordinal = ['一', '二', '三', '四'];
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const motionPreferenceKey = 'guose-fanghua:painting-motion';
type ViewerManifest = Pick<SceneManifest, 'id' | 'stops' | 'sourceRevision' | 'frameRange' | 'fps' | 'fpsBase' | 'sourceDurationSeconds'>;

declare global {
  interface Window {
    mdgsDesktop?: {
      getFullscreenState: () => Promise<boolean>;
      toggleFullscreen: () => Promise<boolean>;
      onFullscreenChange: (listener: (fullscreen: boolean) => void) => () => void;
    };
  }
}

function readMotionPreference() {
  try { return localStorage.getItem(motionPreferenceKey) !== 'off'; }
  catch { return true; }
}

export default function App() {
  const stopRef = useRef<() => void>(() => {});
  const journey = useStudyJourney(() => stopRef.current());
  const { chapterId } = journey;
  // A deep link already names its scroll. Build the study when it is visited,
  // rather than competing with the requested world during refresh startup.
  const [studyVisited, setStudyVisited] = useState(() => journey.phase === 'HOME');
  useEffect(() => { if (journey.phase === 'HOME' || journey.phase === 'RETURNING_HOME') setStudyVisited(true); }, [journey.phase]);
  const [cultureOpen, setCultureOpen] = useState(false);
  const [encounterOpen, setEncounterOpen] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);
  const [artworkAnchors, setArtworkAnchors] = useState<ArtworkAnchorSpec[]>([]);
  const [projectedAnchors, setProjectedAnchors] = useState<ProjectedArtAnchor[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(readViewerSettings);
  useEffect(() => { setSettingsOpen(false); setLetterOpen(false); }, [journey.phase, journey.attempt]);
  const [browserFullscreen, setBrowserFullscreen] = useState(Boolean(document.fullscreenElement));
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const fullscreen = browserFullscreen || nativeFullscreen;
  const [notice, setNotice] = useState('');
  const [narrativePlacement,setNarrativePlacement]=useState<NarrativeSpace>();
  const [motionEnabled, setMotionEnabled] = useState(readMotionPreference);
  const [motionState, setMotionState] = useState<ViewportMotionState>({ enabled: false, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, supported: false });
  const [manifests, setManifests] = useState<Record<number, ViewerManifest>>({});
  const manifest = manifests[chapterId];
  const nativeEdition = manifest?.sourceRevision === activeSourceEdition;
  const chapterSettings = settings.chapters[chapterId];
  const { progress, target, seek, nudge, playing, togglePlaying, stop, setPlaybackBlocked } = useScrollController(chapterId, {
    smoothingMs: chapterSettings.smoothingMs, active: journey.interactive, timing: manifest,
  });
  const presentationHandle = useRef<ScrollPresentationHandle | null>(null);
  const snapshotCache = useRef<Record<number, ArtworkSnapshot>>({});
  const [snapshots, setSnapshots] = useState<Record<number, ArtworkSnapshot>>({});
  const [presentationFallback, setPresentationFallback] = useState(false);
  // History leaves the viewer before its snapshot request. Keep the native
  // owner alive for that one completed frame; loading cancellation stays immediate.
  const cancelNativePreparation = journey.phase === 'RETURNING_HOME' && (
    !journey.returningFromViewer || matchesArtworkSnapshot(snapshots[chapterId], chapterId, progress)
    || presentationFallback || journey.returnFallback
  );
  const returnCapture = useRef<object | null>(null);
  const currentJourney = useRef({ chapterId, attempt: journey.attempt, phase: journey.phase, progress });
  currentJourney.current = { chapterId, attempt: journey.attempt, phase: journey.phase, progress };
  const receivePresentationHandle = useCallback((handle: ScrollPresentationHandle | null) => { presentationHandle.current = handle; }, []);
  const receivePresentationSnapshot = useCallback((snapshot: ArtworkSnapshot) => {
    if (snapshot.chapterId !== currentJourney.current.chapterId || snapshot.sourceRevision !== activeSourceEdition) {
      releaseArtworkSnapshot(snapshot); return;
    }
    const previous = snapshotCache.current[snapshot.chapterId];
    snapshotCache.current = { ...snapshotCache.current, [snapshot.chapterId]: snapshot };
    setSnapshots(snapshotCache.current);
    if (previous !== snapshot) releaseArtworkSnapshot(previous);
  }, []);
  useEffect(() => () => {
    Object.values(snapshotCache.current).forEach(releaseArtworkSnapshot);
    snapshotCache.current = {}; returnCapture.current = null;
  }, []);
  useEffect(() => {
    setPresentationFallback(false); returnCapture.current = null;
  }, [chapterId, journey.attempt]);
  const receivePresentationError = useCallback((message: string) => {
    if (currentJourney.current.phase === 'RETURNING_HOME') setPresentationFallback(true);
    else if (currentJourney.current.progress > 1e-7) journey.onPresentationFailure(message);
  }, [journey.onPresentationFailure]);
  stopRef.current = stop;
  const chapterIndex = chapters.findIndex(item => item.id === chapterId);
  const chapter = chapters[chapterIndex];
  const stops = manifest?.stops?.length ? manifest.stops : [{ name: '卷首', progress: 0 }, { name: '卷末', progress: 1 }];
  const currentIndex = stops.reduce((latest, item, index) => progress + 0.012 >= item.progress ? index : latest, 0);
  const currentStop = stops[currentIndex];
  const finished = progress === 1;
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollExhibitionRef = useRef<HTMLElement>(null);
  const closeCulture = useCallback(() => setCultureOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettings = useCallback(() => { stopRef.current(); setCultureOpen(false); setSettingsOpen(true); }, []);
  const receiveMotionState = useCallback((state: ViewportMotionState) => setMotionState(state), []);
  const receiveManifest = useCallback((data: SceneManifest) => {
    const { id, stops, sourceRevision, frameRange, fps, fpsBase, sourceDurationSeconds } = data;
    setManifests(previous => ({ ...previous, [chapterId]: { id, stops, sourceRevision, frameRange, fps, fpsBase, sourceDurationSeconds } }));
  }, [chapterId]);

  const changeChapter = useCallback((id: number) => {
    stop();
    if (id !== chapterId || !journey.interactive) journey.select(id);
    setCultureOpen(false);
  }, [stop, chapterId, journey.interactive, journey.select]);

  const returnToStudy = useCallback(() => {
    stop(); setCultureOpen(false);
    const current = currentJourney.current;
    if (returnCapture.current || current.phase === 'RETURNING_HOME') return;
    if (current.phase !== 'SCROLL_VIEWER' || !presentationHandle.current) {
      // A prepared scroll already owns its picture and current curvature.
      // Let that same paper close; only an unprepared stage needs a plain exit.
      setPresentationFallback(!journey.presentationReady); journey.returnHome(); return;
    }
    // Stop the manual follower too: the paper must close on the exact image
    // that is copied from the authored renderer, rather than its target.
    seek(current.progress, true);
    const request = {}; returnCapture.current = request;
    presentationHandle.current.capture().then(snapshot => {
      const live = currentJourney.current;
      if (returnCapture.current !== request || live.chapterId !== current.chapterId || live.attempt !== current.attempt
        || live.phase !== 'SCROLL_VIEWER' && live.phase !== 'RETURNING_HOME') {
        releaseArtworkSnapshot(snapshot); return;
      }
      seek(snapshot.progress, true); receivePresentationSnapshot(snapshot);
      if (live.phase === 'SCROLL_VIEWER') { setPresentationFallback(false); journey.returnHome(); }
    }).catch(() => {
      const live = currentJourney.current;
      if (returnCapture.current === request && live.chapterId === current.chapterId && live.attempt === current.attempt
        && (live.phase === 'SCROLL_VIEWER' || live.phase === 'RETURNING_HOME')) {
        if (live.phase === 'SCROLL_VIEWER' || !matchesArtworkSnapshot(snapshotCache.current[live.chapterId], live.chapterId, live.progress)) setPresentationFallback(true);
        if (live.phase === 'SCROLL_VIEWER') journey.returnHome();
      }
    }).finally(() => { if (returnCapture.current === request) returnCapture.current = null; });
  }, [stop, seek, journey.presentationReady, journey.returnHome, receivePresentationSnapshot]);

  useEffect(() => {
    // Browser Back bypasses the return button. Its still-mounted native
    // canvas remains the source until a matching image has been captured.
    if (journey.phase !== 'RETURNING_HOME' || !journey.returningFromViewer || presentationFallback || journey.returnFallback
      || matchesArtworkSnapshot(snapshotCache.current[chapterId], chapterId, progress) || returnCapture.current) return;
    const handle = presentationHandle.current;
    if (!handle) { setPresentationFallback(true); return; }
    const attempt = journey.attempt, request = {}; returnCapture.current = request;
    handle.capture().then(snapshot => {
      const live = currentJourney.current;
      if (returnCapture.current !== request || live.chapterId !== chapterId || live.attempt !== attempt || live.phase !== 'RETURNING_HOME') {
        releaseArtworkSnapshot(snapshot); return;
      }
      seek(snapshot.progress, true); receivePresentationSnapshot(snapshot);
    }).catch(() => {
      const live = currentJourney.current;
      if (returnCapture.current === request && live.chapterId === chapterId && live.attempt === attempt && live.phase === 'RETURNING_HOME'
        && !matchesArtworkSnapshot(snapshotCache.current[chapterId], chapterId, live.progress)) setPresentationFallback(true);
    })
      .finally(() => { if (returnCapture.current === request) returnCapture.current = null; });
  }, [chapterId, journey.attempt, journey.phase, journey.returningFromViewer, journey.returnFallback, progress, presentationFallback, receivePresentationSnapshot, seek]);

  useEffect(() => {
    document.title = journey.phase === 'HOME' ? '国色长卷 · 数字牡丹赋' : `${chapter.title} · 国色长卷`;
    if (journey.interactive) stageRef.current?.focus({ preventScroll: true });
    else if (journey.phase !== 'HOME') setCultureOpen(false);
  }, [journey.phase, journey.interactive, chapter.title]);

  const goTo = useCallback((value: number) => {
    stop();
    seek(clamp(value));
  }, [seek, stop]);

  const seekEncounter = useCallback((value: number) => {
    stop();
    seek(clamp(value), true);
  }, [seek, stop]);
  const receiveEncounterOpen = useCallback((open: boolean) => {
    if (open) stopRef.current();
    setEncounterOpen(open);
  }, []);

  function previousScene() {
    const previous = [...stops].reverse().find(item => item.progress < progress - 0.002);
    goTo(previous?.progress ?? 0);
  }

  function nextScene() {
    const next = stops.find(item => item.progress > progress + 0.002);
    goTo(next?.progress ?? 1);
  }

  function reportFullscreenFailure() {
    setNotice('当前浏览器暂不支持全屏显示。');
    window.setTimeout(() => setNotice(''), 4000);
  }

  function toggleFullscreen() {
    if (window.mdgsDesktop) {
      void window.mdgsDesktop.toggleFullscreen().catch(reportFullscreenFailure);
      return;
    }
    const target = scrollExhibitionRef.current;
    if (!target) return;
    const change = document.fullscreenElement === target ? document.exitFullscreen() : target.requestFullscreen();
    void change.catch(reportFullscreenFailure);
  }

  useEffect(() => {
    const updateBrowserFullscreen = () => setBrowserFullscreen(document.fullscreenElement === scrollExhibitionRef.current);
    document.addEventListener('fullscreenchange', updateBrowserFullscreen);
    let receivedNativeChange = false;
    const removeNativeListener = window.mdgsDesktop?.onFullscreenChange(value => {
      receivedNativeChange = true;
      setNativeFullscreen(value);
    });
    void window.mdgsDesktop?.getFullscreenState().then(value => {
      if (!receivedNativeChange) setNativeFullscreen(value);
    }).catch(reportFullscreenFailure);
    return () => {
      document.removeEventListener('fullscreenchange', updateBrowserFullscreen);
      removeNativeListener?.();
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(motionPreferenceKey, motionEnabled ? 'on' : 'off'); }
    catch { /* Viewing and the current preference still work when storage is unavailable. */ }
  }, [motionEnabled]);

  useEffect(() => {
    try { localStorage.setItem(viewerSettingsKey, JSON.stringify(settings)); }
    catch { /* Live settings remain usable when browser storage is unavailable. */ }
  }, [settings]);

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
    <SoundscapeProvider phase={journey.phase} chapterId={chapterId} progress={progress} reading={cultureOpen || encounterOpen || letterOpen}>
    <div className={`peony-experience phase-${journey.phase.toLowerCase().replaceAll('_', '-')} ${motionEnabled ? '' : 'environment-off'}`} data-journey-phase={journey.phase} style={textPlateVariables(settings) as CSSProperties}>
    {studyVisited && <div className="journey-study" inert={journey.phase !== 'HOME'} aria-hidden={journey.phase !== 'HOME'}>
      <StudyHome phase={journey.phase} chapterId={chapterId} onSelect={journey.select} motionEnabled={motionEnabled} onToggleMotion={() => setMotionEnabled(value => !value)} onOpenSettings={openSettings} />
    </div>}
    {journey.viewerMounted && <div className={`app-shell poetic-viewer journey-viewer${journey.interactive ? ' is-interactive' : ''}${nativeFullscreen ? ' is-native-fullscreen' : ''}`} inert={!journey.interactive} aria-hidden={!journey.interactive}>
      <a className="skip-link" href="#scroll-artwork" onClick={event => { event.preventDefault(); stageRef.current?.focus(); }}>跳至画卷</a>
      <header className="site-header">
        <button className="brand" type="button" onClick={returnToStudy} aria-label="返回序厅">
          <span className="brand-seal" aria-hidden="true">牡<br />丹</span>
          <span className="brand-wordmark">国色长卷<span>返回序厅 · 数字牡丹赋</span></span>
        </button>
        <h1 className="viewer-work-title visually-hidden"><small>第{ordinal[chapterIndex]}卷</small>{chapter.title}</h1>
        <nav className="chapter-nav" aria-label="四卷导航">
          {chapters.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={`chapter-link${chapterId === item.id ? ' is-current' : ''}`}
              onClick={() => changeChapter(item.id)}
              aria-current={chapterId === item.id ? 'page' : undefined}
              aria-label={`第${ordinal[index]}卷，${item.title}`}
              title={item.subtitle}
            ><span className="chapter-numeral">{item.numeral}</span><span className="chapter-nav-name">{item.title}</span></button>
          ))}
        </nav>
        <button className="settings-button" type="button" onClick={openSettings} aria-label="打开设置" aria-haspopup="dialog"><Settings size={17} strokeWidth={1.4} /><span>设置</span></button>
        <span className="header-divider" />
        <button className="fullscreen-button icon-button" type="button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? '退出全屏' : '进入全屏'} title={fullscreen ? '退出全屏' : '全屏观画'}>
          {fullscreen ? <Minimize size={18} strokeWidth={1.4} /> : <Maximize size={18} strokeWidth={1.4} />}<span>{fullscreen ? '退出' : '全屏'}</span>
        </button>
      </header>

      <main className="exhibition">
        <h1 className="visually-hidden" id="chapter-title">第{ordinal[chapterIndex]}卷 · {chapter.title}</h1>

        <section ref={scrollExhibitionRef} className={`scroll-exhibition${fullscreen ? ' is-fullscreen' : ''}`} aria-label={`第${ordinal[chapterIndex]}卷：${chapter.title}`}>
          {fullscreen && <button className="scroll-fullscreen-exit" type="button" onClick={() => void toggleFullscreen()} aria-label="退出画卷全屏" title="退出全屏">
            <Minimize size={17} strokeWidth={1.4} /><span>退出全屏</span>
          </button>}
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
                preparationCancelled={cancelNativePreparation}
                onPreparation={journey.onPreparation}
                onReady={journey.onReady}
                progress={progress}
                playbackActive={playing}
                onPlaybackBlocked={setPlaybackBlocked}
                motionEnabled={motionEnabled && journey.interactive && !finished}
                onMotionState={receiveMotionState}
                onNarrativePlacement={setNarrativePlacement}
                onNudge={nudge}
                onSeek={seek}
                onManualInput={stop}
                onManifest={receiveManifest}
                wheelSpeed={chapterSettings.wheelSpeed}
                sideMarginPercent={settings.sideMarginPercent}
                artworkAnchors={artworkAnchors}
                onArtworkAnchors={setProjectedAnchors}
                onPresentationHandle={receivePresentationHandle}
                onPresentationSnapshot={receivePresentationSnapshot}
                onPresentationError={receivePresentationError}
              />
              {manifest && <NarrativeCalligraphy chapterId={chapterId} progress={progress} stops={manifest.stops} placement={narrativePlacement}
                active={journey.interactive && !finished && !encounterOpen && !letterOpen} mode={settings.narrativeMode} playing={playing}
                platePadding={settings.textPlate.padding} durationSeconds={manifest.sourceDurationSeconds} />}
              {finished && <ScrollColophon chapter={chapter} ordinal={ordinal[chapterIndex]} placement={narrativePlacement}
                last={chapterIndex === chapters.length - 1} onReplay={() => goTo(0)}
                onNext={() => changeChapter(chapters[(chapterIndex + 1) % chapters.length].id)}
                onKeep={() => { stop(); setLetterOpen(true); }} />}
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
          <ScrollTimeline stops={stops} progress={progress} target={target} currentIndex={currentIndex}
            active={journey.interactive} chapterId={chapterId} onSeek={goTo} />
          <div className="control-bottomline">
            <p className="interaction-hint"><Mouse size={14} strokeWidth={1.25} /><span>滚轮游观</span><i /><MoveHorizontal size={16} strokeWidth={1.25} /><span>左右拖拽</span></p>
            <div className="playback-controls">
              <button className="step-button" type="button" onClick={previousScene} disabled={progress < 0.005} aria-label="上一分镜" title="上一分镜"><ChevronLeft size={18} strokeWidth={1.35} /><span>上一景</span></button>
              <button className={`play-button${playing ? ' is-playing' : ''}`} type="button" onClick={togglePlaying} aria-pressed={playing}>{playing ? <Pause size={13} strokeWidth={1.5} fill="currentColor" /> : <Play size={13} strokeWidth={1.5} fill="currentColor" />}<span>{playing ? '暂停展卷' : '自动展卷'}</span></button>
              <button className="step-button" type="button" onClick={nextScene} disabled={finished} aria-label="下一分镜" title="下一分镜"><span>下一景</span><ChevronRight size={18} strokeWidth={1.35} /></button>
            </div>
            <div className="secondary-controls">
              <ArtEncounters chapterId={chapterId} progress={progress}
                active={journey.interactive && !cultureOpen && !settingsOpen && !letterOpen}
                projections={projectedAnchors} onSeek={seekEncounter}
                onAnchorRequest={setArtworkAnchors} onOpenChange={receiveEncounterOpen} />
              <span className="secondary-divider" />
              {!nativeEdition && <><button type="button" className={`utility-button motion-button${motionState.enabled ? ' is-active' : ''}`}
                onClick={() => setMotionEnabled(value => !value)}
                aria-label="画中轻动" aria-pressed={motionState.enabled}
                disabled={motionState.reducedMotion || !motionState.supported}
                aria-describedby="painting-motion-state"
                title={motionState.reducedMotion ? '遵循系统减少动态效果设置' : !motionState.supported ? '本卷保持静态' : '切换花枝与云气轻动，不影响自动展卷'}>
                <Wind size={16} strokeWidth={1.4} /><span>画中轻动</span>
                <small id="painting-motion-state" role="status">{motionState.reducedMotion ? '随系统静止' : !motionState.supported ? '本卷静态' : motionState.enabled ? '已开' : '已关'}</small>
              </button><span className="secondary-divider" /></>}
              <AudioController active={journey.interactive} /><span className="secondary-divider" />
              <button type="button" className="utility-button" onClick={() => { stop(); setCultureOpen(true); }} aria-label="打开文化解读"><BookOpen size={16} strokeWidth={1.4} /><span>画外拾遗</span></button>
            </div>
          </div>
        </section>
      </main>

      {notice && <div className="status-notice" role="status">{notice}</div>}
      <CulturePanel chapter={chapter} open={cultureOpen} onClose={closeCulture} onExplore={() => {
        const encounter = artEncounters.find(item => item.chapterId === chapterId);
        if (encounter) seekEncounter(encounter.progress);
        setCultureOpen(false);
        requestAnimationFrame(() => stageRef.current?.focus({ preventScroll: true }));
      }} />
    </div>}
    {journey.phase !== 'HOME' && journey.phase !== 'SCROLL_VIEWER' && (!studyVisited || journey.phase !== 'SCROLL_AWAKENING' && journey.phase !== 'CAMERA_ENTERING') && <ScrollLoadingScene key={`${chapterId}-${journey.attempt}`}
      chapter={chapter} phase={journey.phase} preparation={journey.preparation} error={journey.error}
      progress={progress} snapshot={snapshots[chapterId]} returnFallback={presentationFallback || journey.returnFallback}
      onPresentationPending={journey.onPresentationPending} onPresentationReady={journey.onPresentationReady}
      onRetry={journey.retry} onReturn={returnToStudy} motionEnabled={motionEnabled}
      onFailure={journey.onPresentationFailure} />}
    <ViewerSettingsPanel open={settingsOpen} chapterId={chapterId} settings={settings} onChange={setSettings} onClose={closeSettings} />
    <FlowerLetterDialog open={letterOpen} chapterId={chapterId} onClose={() => setLetterOpen(false)} />
    </div>
    </SoundscapeProvider>
  );
}
