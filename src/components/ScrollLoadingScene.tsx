import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ChapterContent } from '../data/chapters';
import { studyPainting } from '../data/study';
import { atlasArt } from '../data/peonyAtlas';
import { ScrollUnfurlScene } from '../scene/ScrollUnfurlScene';
import type { UnfurlFrame } from '../scene/ScrollUnfurlScene';
import { interpolateArtworkRect, readViewerArtworkRect, scrollHandoffFrame, smoothFraction } from '../scene/scrollHandoff';
import { matchesArtworkSnapshot, retainArtworkSnapshot, type ArtworkSnapshot } from '../scene/artworkSnapshot';
import '../styles/scroll-loading.css';

export interface ScrollPreparation { stage: string; loaded: number; total: number; message: string }
export interface ScrollLoadingSceneProps {
  chapter: ChapterContent; phase: string; preparation: ScrollPreparation;
  error?: string | null; onRetry: () => void; onReturn: () => void; motionEnabled: boolean;
  onFailure?: (message: string) => void;
  progress: number;
  snapshot?: ArtworkSnapshot | null;
  returnFallback?: boolean;
  onPresentationReady?: () => void;
  onPresentationPending?: () => void;
}
const chapterLines: Record<number, string> = {
  1: '一枝春色，初入神都。', 2: '宫墙之外，春色入人间。',
  3: '绣一朵花，寄岁岁圆满。', 4: '人花相映，留盛世余韵。',
};

/** Geometry time and real resource progress remain separate. This overlay only
 * meets the ready authored canvas; it never seeks or transforms that canvas. */
export default function ScrollLoadingScene({ chapter, phase, preparation, error, onRetry, onReturn, motionEnabled, onFailure,
  progress, snapshot, returnFallback = false, onPresentationReady, onPresentationPending }: ScrollLoadingSceneProps) {
  const root = useRef<HTMLElement>(null), host = useRef<HTMLDivElement>(null);
  const handoffImage = useRef<HTMLImageElement>(null), engine = useRef<ScrollUnfurlScene | null>(null);
  const sourceCover = useRef<HTMLDivElement>(null);
  const initialReturn = useRef(phase === 'RETURNING_HOME');
  const selectedSnapshot = useRef<ArtworkSnapshot | null>(null);
  // One matching picture per mounted ceremony. A later cache refresh must not
  // restart a half-open scroll or revoke the picture it is currently using.
  if (!matchesArtworkSnapshot(selectedSnapshot.current, chapter.id, progress))
    selectedSnapshot.current = matchesArtworkSnapshot(snapshot, chapter.id, progress) ? snapshot : null;
  const chosenSnapshot = selectedSnapshot.current;
  const latest = useRef({ phase, motionEnabled, onFailure, error, onPresentationReady, onPresentationPending });
  latest.current = { phase, motionEnabled, onFailure, error, onPresentationReady, onPresentationPending };
  const [visualError, setVisualError] = useState<string | null>(null);
  const [presentationShown, setPresentationShown] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  // Only the original first frame may use its authored cover. Resumed frames
  // wait for an actual native snapshot instead of disguising progress as zero.
  const painting = !initialReturn.current && Math.abs(progress) <= 1e-7 ? studyPainting(chapter.id) : chosenSnapshot?.src ?? null;
  const failure = error || visualError;
  const fallbackStarted = useRef(false);
  if (phase === 'RETURNING_HOME' && (returnFallback || failure || !initialReturn.current && !painting)) fallbackStarted.current = true;
  const fallbackActive = phase === 'RETURNING_HOME' && fallbackStarted.current;
  const completed = preparation.stage === 'ready';
  const ratio = preparation.total > 0 ? Math.min(1, Math.max(0, preparation.loaded / preparation.total)) : 0;
  const status = failure ? '画材暂未齐备' : !painting && completed ? '正在复现上次画境' : completed ? presentationShown ? '画境已备' : '正在铺陈画心' : preparation.stage === 'first-frame' ? '正在点亮画境' : preparation.total > 0 ? '正在设色' : '正在铺纸';
  useEffect(() => chosenSnapshot ? retainArtworkSnapshot(chosenSnapshot) : undefined, [chosenSnapshot]);
  useEffect(() => {
    if (!host.current || !painting || fallbackActive) return;
    let alive = true, failed = false, readyIdentity = ''; setVisualError(null); setPresentationShown(false);
    latest.current.onPresentationPending?.();
    if (root.current) root.current.dataset.presentationReady = 'false';
    const fail = (message: string) => {
      if (!alive || failed) return;
      failed = true; setVisualError(message); latest.current.onFailure?.(message);
    };
    const frame = (state: UnfurlFrame) => {
      const element = root.current, image = handoffImage.current;
      if (!alive || !element || !image) return;
      const identity = (state.phase === 'RETURNING_HOME' ? 'return:' : 'entry:') + painting;
      if (state.presentationReady && image.complete && image.naturalWidth > 0 && identity !== readyIdentity) {
        readyIdentity = identity;
        element.dataset.presentationReady = 'true'; setPresentationShown(true); latest.current.onPresentationReady?.();
      }
      if (state.phase === 'RETURNING_HOME' && state.returningFromViewer) {
        const target = readViewerArtworkRect();
        const returning = smoothFraction(state.elapsed / .29);
        element.style.setProperty('--art-ground-opacity', String(smoothFraction(state.elapsed / .22)));
        element.style.setProperty('--art-stage-opacity', String(smoothFraction((state.elapsed - .18) / .12)));
        if (target && state.projectedArtRect && state.elapsed < .31) {
          const rect = state.reduced ? target : interpolateArtworkRect(target, state.projectedArtRect, returning);
          const bounds = element.getBoundingClientRect();
          Object.assign(image.style, { left: (rect.left - bounds.left) + 'px', top: (rect.top - bounds.top) + 'px',
            width: rect.width + 'px', height: rect.height + 'px', opacity: String(1 - smoothFraction((state.elapsed - .23) / .07)) });
          if (sourceCover.current) Object.assign(sourceCover.current.style, { left: (target.left - bounds.left) + 'px', top: (target.top - bounds.top) + 'px',
            width: target.width + 'px', height: target.height + 'px', opacity: '1' });
        } else image.style.opacity = '0';
        element.dataset.handoffState = 'returning';
        return;
      }
      const choreography = scrollHandoffFrame(state.phase, state.elapsed, state.reduced);
      if (!choreography.active || failed || latest.current.error) {
        element.style.setProperty('--art-stage-opacity', '1');
        element.style.setProperty('--art-ground-opacity', '1');
        image.style.opacity = '0'; element.dataset.handoffState = 'waiting';
        return;
      }
      const target = readViewerArtworkRect();
      if (!target || !state.projectedArtRect) {
        if (choreography.clock > (state.reduced ? 45 : 130)) fail('画境交接暂未齐备，请重新展卷。');
        return;
      }
      const rect = interpolateArtworkRect(state.projectedArtRect, target, choreography.travel);
      const bounds = element.getBoundingClientRect();
      Object.assign(image.style, {
        left: (rect.left - bounds.left) + 'px', top: (rect.top - bounds.top) + 'px',
        width: rect.width + 'px', height: rect.height + 'px', opacity: String(choreography.imageOpacity),
      });
      element.style.setProperty('--art-stage-opacity', String(choreography.stageOpacity));
      element.style.setProperty('--art-ground-opacity', String(choreography.groundOpacity));
      element.dataset.handoffState = choreography.travel === 1 ? 'aligned' : 'travelling';
      element.dataset.handoffTarget = JSON.stringify(target);
      element.dataset.handoffRect = JSON.stringify(rect);
      element.dataset.handoffTravel = choreography.travel.toFixed(6);
      element.dataset.handoffOpacity = choreography.imageOpacity.toFixed(6);
      element.dataset.handoffClock = choreography.clock.toFixed(2);
      element.dataset.handoffError = Math.max(Math.abs(rect.left - target.left), Math.abs(rect.top - target.top), Math.abs(rect.width - target.width), Math.abs(rect.height - target.height)).toFixed(4);
    };
    try {
      const renderer = new ScrollUnfurlScene(host.current, { painting, motionEnabled: latest.current.motionEnabled, onError: fail, onFrame: frame });
      engine.current = renderer; renderer.setPhase(latest.current.phase);
      return () => { alive = false; engine.current = null; renderer.dispose(); };
    } catch { fail('当前浏览器暂不能展开立体画境，请重试或启用 WebGL。'); }
    return () => { alive = false; };
  }, [painting, fallbackActive]);
  useEffect(() => {
    if (phase !== 'RETURNING_HOME' || !fallbackActive || !root.current) return;
    root.current.style.setProperty('--art-ground-opacity', '1');
    root.current.style.setProperty('--art-stage-opacity', '0');
    root.current.dataset.presentationReady = 'true';
    root.current.dataset.handoffState = 'return-fallback';
    if (handoffImage.current) handoffImage.current.style.opacity = '0';
    latest.current.onPresentationReady?.();
  }, [phase, fallbackActive]);
  useEffect(() => { engine.current?.setPhase(phase); }, [phase]);
  useEffect(() => { engine.current?.setMotionEnabled(motionEnabled); }, [motionEnabled]);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (failure) root.current?.querySelector<HTMLButtonElement>('.art-loading__retry')?.focus({ preventScroll: true });
  }, [failure]);
  const phaseName = phase.toLowerCase().replaceAll('_', '-');
  return <section ref={root}
    className={'art-loading art-loading--' + phaseName + (completed ? ' is-prepared' : '') + (failure ? ' has-error' : '') + (!motionEnabled || !visible ? ' is-still' : '')}
    style={{ '--art-progress': ratio * 100 + '%', '--art-ground-opacity': initialReturn.current ? 0 : 1, '--art-stage-opacity': initialReturn.current ? 0 : 1 } as CSSProperties}
    data-preparation-stage={preparation.stage} data-painting-src={painting ?? ''} data-unfurl="0" data-handoff-state="waiting" data-presentation-ready="false"
    data-preview-progress={chosenSnapshot?.progress ?? (Math.abs(progress) <= 1e-7 ? 0 : '')}
    data-preview-frame={chosenSnapshot?.sourceFrame ?? ''}
    aria-label={phase === 'RETURNING_HOME' ? '正在返回序厅' : '正在展开' + chapter.title}
    aria-busy={!completed && !failure}>
    <div className="art-loading__ground" aria-hidden="true"><img src={atlasArt.landscape} alt="" /><span /></div>
    <div className="art-loading__source-cover" ref={sourceCover} aria-hidden="true" />
    <div className="art-loading__scroll" ref={host} aria-hidden="true" />
    <img className="art-loading__handoff" ref={handoffImage} src={painting ?? undefined} alt="" aria-hidden="true" />
    {phase !== 'ENTERING_VIEWER' && phase !== 'RETURNING_HOME' && <button className="art-loading__return" type="button" onClick={onReturn}><span aria-hidden="true">←</span> 返回序厅</button>}
    <div className="art-loading__composition">
      <header className="art-loading__heading">
        <p className="art-loading__overline"><span>国色长卷</span><i /><span>第{chapter.numeral}卷</span></p>
        <h1 className="art-loading__accessible-title">{chapter.title}</h1>
        <p className="art-loading__subtitle">{chapter.subtitle}</p>
      </header>
      <div className="art-loading__caption">
        <p className="art-loading__poem">{phase === 'RETURNING_HOME' ? '一卷春色，暂收心间。' : chapterLines[chapter.id]}</p>
        <div className="art-loading__progress" role="progressbar" aria-label="画卷资源准备"
          aria-valuemin={preparation.total ? 0 : undefined} aria-valuemax={preparation.total || undefined}
          aria-valuenow={preparation.total ? preparation.loaded : undefined} aria-valuetext={status}>
          <div className="art-loading__progress-rule"><span /><i aria-hidden="true">花</i></div>
        </div>
        <div className="art-loading__preparation">
          <p className="art-loading__status" role="status" aria-live="polite" aria-atomic="true">{status}</p>
          {!failure && !completed && preparation.total > 0 && <p className="art-loading__resource-count">{preparation.loaded}<span>/</span>{preparation.total}</p>}
          {!failure && completed && presentationShown && <span className="art-loading__ready-mark" aria-hidden="true">印</span>}
        </div>
        {failure && <div className="art-loading__error" role="alert"><p>{failure}</p><div><button className="art-loading__retry" type="button" onClick={onRetry}>重新展卷</button><button type="button" onClick={onReturn}>返回序厅</button></div></div>}
      </div>
    </div>
  </section>;
}
