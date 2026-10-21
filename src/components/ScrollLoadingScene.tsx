import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ChapterContent } from '../data/chapters';
import { studyPainting } from '../data/study';
import { ScrollUnfurlScene } from '../scene/ScrollUnfurlScene';
import '../styles/scroll-loading.css';

export interface ScrollPreparation { stage: string; loaded: number; total: number; message: string }
export interface ScrollLoadingSceneProps {
  chapter: ChapterContent; phase: string; preparation: ScrollPreparation;
  error?: string | null; onRetry: () => void; onReturn: () => void; motionEnabled: boolean;
  onFailure?: (message: string) => void;
}
const chapterLines: Record<number, string> = {
  1: '一枝春色，初入神都。', 2: '宫墙之外，春色入人间。',
  3: '绣一朵花，寄岁岁圆满。', 4: '人花相映，留盛世余韵。',
};

/** Minimum exhibition time belongs to the journey state machine. The resource
 * rule below reports only real preparation, independently of the paper motion. */
export default function ScrollLoadingScene({ chapter, phase, preparation, error, onRetry, onReturn, motionEnabled, onFailure }: ScrollLoadingSceneProps) {
  const root = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<ScrollUnfurlScene | null>(null);
  const latest = useRef({ phase, motionEnabled, onFailure }); latest.current = { phase, motionEnabled, onFailure };
  const [visualError, setVisualError] = useState<string | null>(null);
  const [visible, setVisible] = useState(!document.hidden);
  const painting = studyPainting(chapter.id);
  const failure = error || visualError;
  const completed = preparation.stage === 'ready';
  const ratio = preparation.total > 0 ? Math.min(1, Math.max(0, preparation.loaded / preparation.total)) : 0;
  const status = failure ? '画材暂未齐备' : completed ? '长卷已备，邀君共赏。' : preparation.message || '画境徐开 · 正在展卷';
  useEffect(() => {
    if (!host.current) return;
    setVisualError(null);
    const fail = (message: string) => { setVisualError(message); latest.current.onFailure?.(message); };
    try {
      const renderer = new ScrollUnfurlScene(host.current, { painting, motionEnabled: latest.current.motionEnabled, onError: fail });
      engine.current = renderer; renderer.setPhase(latest.current.phase);
      return () => { engine.current = null; renderer.dispose(); };
    } catch {
      fail('当前浏览器暂不能展开立体画境，请重试或启用 WebGL。');
    }
  }, [painting]);
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
    className={`art-loading art-loading--${phaseName}${completed ? ' is-prepared' : ''}${failure ? ' has-error' : ''}${!motionEnabled || !visible ? ' is-still' : ''}`}
    style={{ '--art-progress': `${ratio * 100}%` } as CSSProperties}
    data-preparation-stage={preparation.stage} data-painting-src={painting} data-unfurl="0"
    aria-label={phase === 'RETURNING_HOME' ? '正在返回书房' : `正在展开${chapter.title}`}
    aria-busy={!completed && !failure}>
    <div className="art-loading__ground" aria-hidden="true" />
    <div className="art-loading__scroll" ref={host} aria-hidden="true" />
    <img className="art-loading__colour" src={painting} alt="" hidden />
    {phase !== 'ENTERING_VIEWER' && phase !== 'RETURNING_HOME' && <button className="art-loading__return" type="button" onClick={onReturn}>归 · 返回书房</button>}
    <div className="art-loading__composition">
      <header className="art-loading__heading">
        <p className="art-loading__overline"><span />国 色 长 卷<span /></p>
        <p className="art-loading__volume">第 {chapter.numeral} 卷</p>
        <h1 className="art-loading__accessible-title">{chapter.title}</h1>
        <p className="art-loading__subtitle">{chapter.subtitle}</p>
        <span className="art-loading__seal" aria-hidden="true">国色</span>
      </header>
      <div className="art-loading__caption">
        <p className="art-loading__invitation">{phase === 'RETURNING_HOME' ? '收卷归来 · 书房候君' : '画境徐开 · 静赏绢上春色'}</p>
        <div className="art-loading__progress" role="progressbar" aria-label="画卷资源准备"
          aria-valuemin={preparation.total ? 0 : undefined} aria-valuemax={preparation.total || undefined}
          aria-valuenow={preparation.total ? preparation.loaded : undefined} aria-valuetext={status}>
          <span className="art-loading__progress-ornament">❧</span><div className="art-loading__progress-rule"><span /><i>印</i></div><span className="art-loading__progress-ornament">☙</span>
        </div>
        <p className="art-loading__status" role="status" aria-live="polite" aria-atomic="true">{status}</p>
        {!failure && !completed && preparation.total > 0 && <p className="art-loading__resource-count">{preparation.loaded} / {preparation.total} 幅画材已备{preparation.stage === 'first-frame' ? ' · 正在点亮画境' : ''}</p>}
        {!failure && !completed && preparation.total === 0 && <p className="art-loading__resource-count">校阅卷目 · 准备画材 · 点亮画境</p>}
        {!failure && <p className="art-loading__poem">{chapterLines[chapter.id]}</p>}
        {failure && <div className="art-loading__error" role="alert"><p>{failure}</p><div><button className="art-loading__retry" type="button" onClick={onRetry}>重新展卷</button><button type="button" onClick={onReturn}>返回书房</button></div></div>}
      </div>
    </div>
  </section>;
}
