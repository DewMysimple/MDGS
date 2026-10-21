import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ChapterContent } from '../data/chapters';
import { studyGarden, studyPainting } from '../data/study';
import '../styles/scroll-loading.css';

export interface ScrollPreparation {
  stage: string;
  loaded: number;
  total: number;
  message: string;
}

export interface ScrollLoadingSceneProps {
  chapter: ChapterContent;
  phase: string;
  preparation: ScrollPreparation;
  error?: string | null;
  onRetry: () => void;
  onReturn: () => void;
  motionEnabled: boolean;
}

const garden = studyGarden;
const chapterLines: Record<number, string> = {
  1: '一枝春色，初入神都。',
  2: '宫墙之外，春色入人间。',
  3: '绣一朵花，寄岁岁圆满。',
  4: '人花相映，留盛世余韵。',
};

/** The painted reveal is ceremonial; its progress line is driven only by real preparation. */
export default function ScrollLoadingScene({ chapter, phase, preparation, error, onRetry, onReturn, motionEnabled }: ScrollLoadingSceneProps) {
  const root = useRef<HTMLElement>(null);
  const [imageReady, setImageReady] = useState(false);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const completed = preparation.stage === 'ready';
  const painting = studyPainting(chapter.id);
  const ratio = preparation.total > 0 ? Math.min(1, Math.max(0, preparation.loaded / preparation.total)) : 0;
  const phaseName = phase.toLowerCase().replaceAll('_', '-');
  const status = error ? '画材暂未齐备' : completed ? '长卷已备，邀君共赏。' : preparation.message || '正在铺陈千年风华……';
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (error) root.current?.querySelector<HTMLButtonElement>('.art-loading__retry')?.focus({ preventScroll: true });
  }, [error]);

  return <section ref={root}
    className={`art-loading art-loading--${phaseName}${completed ? ' is-prepared' : ''}${error ? ' has-error' : ''}${imageReady ? ' has-art' : ''}${!motionEnabled || !pageVisible ? ' is-still' : ''}`}
    style={{ '--art-progress': `${ratio * 100}%`, '--chapter-view': `${[48, 33, 79, 66][chapter.id - 1]}%` } as CSSProperties}
    aria-label={phase === 'RETURNING_HOME' ? '正在返回书房' : `正在展开${chapter.title}`}
    aria-busy={!completed && !error}
    data-preparation-stage={preparation.stage}
  >
    <div className="art-loading__ground" aria-hidden="true" />
    <img className="art-loading__garden" src={garden} alt="" onLoad={() => setImageReady(true)} />
    <div className="art-loading__patina" aria-hidden="true" />
    <div className="art-loading__mist art-loading__mist--back" aria-hidden="true" />
    <div className="art-loading__mist art-loading__mist--front" aria-hidden="true" />
    <div className="art-loading__motes" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i, left: `${8 + (i * 37 % 87)}%`, top: `${13 + (i * 29 % 70)}%` } as CSSProperties} />)}
    </div>
    <div className="art-loading__petals" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => <svg key={i} viewBox="0 0 46 52" style={{ '--i': i, left: `${9 + i * 14}%` } as CSSProperties}>
        <defs><linearGradient id={`loading-petal-${i}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f2c7ad" /><stop offset=".5" stopColor="#c7796b" /><stop offset="1" stopColor="#9c453e" /></linearGradient></defs>
        <path d="M24 47C22 35 5 35 7 20C8 12 17 7 24 10C32 0 43 12 38 24C36 34 29 39 24 47Z" fill={`url(#loading-petal-${i})`} stroke="#d7a182" strokeWidth=".6" />
        <path d="M24 45C24 30 27 25 26 13M24 36C20 27 16 24 13 20M26 30L33 20" fill="none" stroke="#f5d0ac" strokeWidth=".55" opacity=".58" />
      </svg>)}
    </div>
    {phase !== 'ENTERING_VIEWER' && phase !== 'RETURNING_HOME' && <button className="art-loading__return" type="button" onClick={onReturn}>归 · 返回书房</button>}

    <div className="art-loading__composition">
      <p className="art-loading__overline"><span />国 色 长 卷<span /></p>
      <p className="art-loading__invitation">{phase === 'RETURNING_HOME' ? '收卷归来 · 书房候君' : '一卷锦绣 · 万象渐生'}</p>

      <div className="art-loading__scroll" aria-hidden="true">
        <div className="art-loading__mount">
          <div className="art-loading__silk">
            <div className="art-loading__painting">
              <img className="art-loading__underpainting" src={painting} alt="" />
              <img className="art-loading__ink" src={painting} alt="" />
              <img className="art-loading__colour" src={painting} alt="" />
              <div className="art-loading__silk-grain" />
              <div className="art-loading__gold-detail" />
            </div>
            <div className="art-loading__inscription">
              <p className="art-loading__volume">第 {chapter.numeral} 卷</p>
              <h2>{chapter.title}</h2>
              <p className="art-loading__subtitle">{chapter.subtitle}</p>
              <span className="art-loading__seal">国色<br />长卷</span>
              <p className="art-loading__poem">{chapterLines[chapter.id]}</p>
            </div>
          </div>
        </div>
        {['left', 'right'].map(side => <div key={side} className={`art-loading__rod art-loading__rod--${side}`}>
          <i className="art-loading__finial art-loading__finial--top" /><i className="art-loading__collar art-loading__collar--top" />
          <span className="art-loading__rod-paper" /><i className="art-loading__collar art-loading__collar--bottom" /><i className="art-loading__finial art-loading__finial--bottom" />
        </div>)}
      </div>

      <div className="art-loading__caption">
        <h1 className="art-loading__accessible-title">{chapter.numeral} · {chapter.title}</h1>
        <div className="art-loading__progress" role="progressbar" aria-label="画卷资源准备" aria-valuemin={preparation.total ? 0 : undefined} aria-valuemax={preparation.total || undefined} aria-valuenow={preparation.total ? preparation.loaded : undefined} aria-valuetext={status}>
          <span className="art-loading__progress-ornament">❧</span><div className="art-loading__progress-rule"><span /><i>印</i></div><span className="art-loading__progress-ornament">☙</span>
        </div>
        <p className="art-loading__status" role="status" aria-live="polite" aria-atomic="true">{status}</p>
        {!error && !completed && preparation.total > 0 && <p className="art-loading__resource-count">{preparation.loaded} / {preparation.total} 幅画材已备{preparation.stage === 'first-frame' ? ' · 正在点亮画境' : ''}</p>}
        {!error && !completed && preparation.total === 0 && <p className="art-loading__resource-count">校阅卷目 · 准备画材 · 点亮画境</p>}
        {error && <div className="art-loading__error" role="alert">
          <p>{error}</p>
          <div><button className="art-loading__retry" type="button" onClick={onRetry}>重新展卷</button><button type="button" onClick={onReturn}>返回书房</button></div>
        </div>}
      </div>
    </div>
  </section>;
}
