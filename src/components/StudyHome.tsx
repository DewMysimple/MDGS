import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { chapters } from '../data/chapters';
import { studyImage, studyScrolls } from '../data/study';
import StudyAtmosphere from './StudyAtmosphere';
import '../styles/study-home.css';

export interface StudyHomeProps {
  phase: string;
  chapterId: number;
  onSelect: (id: number) => void;
  motionEnabled: boolean;
  onToggleMotion: () => void;
}

export default function StudyHome({ phase, chapterId, onSelect, motionEnabled, onToggleMotion }: StudyHomeProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [dialog, setDialog] = useState<'directory' | 'about' | 'language' | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const homeRef = useRef<HTMLElement>(null);
  const previousHome = useRef(phase === 'HOME');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trigger = useRef<Element | null>(null);
  const home = phase === 'HOME';
  const selected = studyScrolls.find(item => item.id === chapterId) ?? studyScrolls[0];
  const focused = hover ? chapters.find(item => item.id === hover) : undefined;
  useEffect(() => {
    const node = dialogRef.current;
    if (dialog && node && !node.open) { trigger.current = document.activeElement; node.showModal(); }
    else if (!dialog && node?.open) node.close();
  }, [dialog]);
  useEffect(() => { if (!home) { setDialog(null); setHover(null); } }, [home]);
  useEffect(() => {
    const returning = home && !previousHome.current;
    previousHome.current = home;
    if (!returning) return;
    const frame = requestAnimationFrame(() => {
      homeRef.current?.querySelector<SVGGElement>(`[data-chapter-id="${chapterId}"]`)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [home, chapterId]);
  function choose(id: number) { if (!home) return; setDialog(null); onSelect(id); }
  function closeDialog() {
    setDialog(null);
    if (trigger.current instanceof HTMLElement || trigger.current instanceof SVGElement) trigger.current.focus({ preventScroll: true });
  }
  function activateKey(event: KeyboardEvent<SVGGElement>, action: () => void) {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); }
  }
  const nav = [
    { name: '书房首页', x: 580, width: 65, action: () => setDialog(null) },
    { name: '牡丹之美 · 神都花事', x: 667, width: 92, action: () => choose(1) },
    { name: '长卷寻迹 · 展卷目录', x: 777, width: 102, action: () => setDialog('directory') },
    { name: '数字展陈 · 锦绣花意', x: 902, width: 104, action: () => choose(3) },
    { name: '文化传承 · 花入万家', x: 1018, width: 97, action: () => choose(2) },
    { name: '关于作品', x: 1133, width: 105, action: () => setDialog('about') },
    { name: '查阅四卷目录', x: 1372, width: 49, action: () => setDialog('directory') },
    { name: '语言说明', x: 1435, width: 111, action: () => setDialog('language') },
  ];

  return <section ref={homeRef} className={`study-home${!home ? ' is-travelling' : ''}`} data-phase={phase} data-environment={motionEnabled ? 'on' : 'off'}
    aria-label="国色长卷·数字牡丹赋，古典书房" aria-busy={!home}>
    <div className="study-picture-frame">
      <div className="study-camera" style={{ '--focus-x': `${selected.x / 1672 * 100}%`, '--focus-y': `${selected.y / 941 * 100}%` } as CSSProperties}>
        <img key={imageAttempt} className="study-original" src={imageAttempt ? `${studyImage}?retry=${imageAttempt}` : studyImage} width="1672" height="941" alt="暖阳照入古典书房，雕花长桌陈列四幅牡丹长卷。顶部为国色长卷与数字牡丹赋题字。" fetchPriority="high" draggable={false} onError={() => setImageFailed(true)} onLoad={() => setImageFailed(false)} />
        <StudyAtmosphere enabled={motionEnabled && ['HOME', 'SCROLL_AWAKENING', 'CAMERA_ENTERING', 'RETURNING_HOME'].includes(phase)} />
        <svg className="study-hotspots" viewBox="0 0 1672 941" aria-label="书房画卷与导航">
          <defs>
            <linearGradient id="study-edge-gold" x1="0" x2="1"><stop stopColor="#bc8a42" stopOpacity=".12" /><stop offset=".45" stopColor="#f0c989" stopOpacity=".75" /><stop offset="1" stopColor="#bb8f4e" stopOpacity=".2" /></linearGradient>
            <radialGradient id="study-scroll-light"><stop stopColor="#f4cf99" stopOpacity=".18" /><stop offset="1" stopColor="#f4cf99" stopOpacity="0" /></radialGradient>
            <linearGradient id="study-hover-petal-color" x2="1" y2="1"><stop stopColor="#f2c7a8" /><stop offset=".7" stopColor="#cd7d6e" /><stop offset="1" stopColor="#984b3c" /></linearGradient>
          </defs>
          {nav.map(item => <g key={item.name} className="study-nav-hotspot" role="button" tabIndex={home ? 0 : -1} aria-label={item.name}
            onClick={() => home && item.action()} onKeyDown={event => activateKey(event, () => home && item.action())}>
            <title>{item.name}</title><rect x={item.x} y="18" width={item.width} height="48" />
          </g>)}
          {studyScrolls.map(item => {
            const chapter = chapters.find(entry => entry.id === item.id)!;
            return <g key={item.id} className={`study-scroll-hotspot${hover === item.id ? ' is-hovered' : ''}${!home && chapterId === item.id ? ' is-selected' : ''}`}
              data-chapter-id={item.id} role="button" tabIndex={home ? 0 : -1} aria-label={`展开第${chapter.numeral}卷：${chapter.title}，${chapter.subtitle}`}
              onPointerEnter={() => home && setHover(item.id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(item.id)} onBlur={() => setHover(null)}
              onClick={() => choose(item.id)} onKeyDown={event => activateKey(event, () => choose(item.id))}>
              <title>{chapter.title} · 轻触展卷</title>
              <polygon className="study-scroll-hit" points={item.points} />
              <ellipse className="study-scroll-warmth" cx={item.x} cy={item.y + 45} rx="145" ry="95" />
              <polygon className="study-scroll-outline" points={item.points} />
              <path className="study-scroll-glint" d={`M${item.x - 125} 687 Q${item.x - 119} 665 ${item.x - 118} 686 M${item.x + 118} 680 Q${item.x + 125} 659 ${item.x + 128} 689`} />
              {[0, 1].map(index => <g key={index} transform={`translate(${item.x + (index ? 78 : -85)} ${index ? 580 : 630}) scale(.45)`} aria-hidden="true" pointerEvents="none"><path className={`study-hover-petal study-hover-petal--${index}`} d="M-17 -5 C-22 -15 -15 -24 -8 -21 C-3 -28 6 -24 7 -20 C19 -24 26 -13 20 -4 C18 7 7 15 -1 19 C-5 10 -15 8 -17 -5Z" fill="url(#study-hover-petal-color)" stroke="#c69870" strokeWidth=".6" /></g>)}
            </g>;
          })}
        </svg>
        <div className="study-focus-shade" aria-hidden="true" />
        {focused && home && <div className="study-hover-label" role="tooltip" style={{ left: `${studyScrolls[focused.id - 1].x / 1672 * 100}%` }}>
          <span className="study-label-ordinal">{focused.numeral}</span><strong>{focused.title}</strong><span className="study-label-instruction">轻触展卷</span><i aria-hidden="true">赏</i>
        </div>}
      </div>
    </div>
    {imageFailed && <div className="study-image-recovery" role="alert"><strong>书房画境暂未呈现</strong><p>请重新陈设画境，或从下方题签选择长卷。</p><button type="button" onClick={() => { setImageFailed(false); setImageAttempt(value => value + 1); }}>重新载入书房</button></div>}
    <div className="study-footnote">
      <p><span aria-hidden="true">◆</span> 移步案前，择一卷而入 <span aria-hidden="true">◆</span></p>
      <button type="button" className="study-motion-toggle" onClick={onToggleMotion} disabled={!home} aria-pressed={motionEnabled} aria-label="书房环境动画">
        <span aria-hidden="true">{motionEnabled ? '风' : '静'}</span>{motionEnabled ? '清风徐来' : '静赏书房'}<small>{motionEnabled ? '关闭动态' : '开启动感'}</small>
      </button>
    </div>
    <div className="study-mobile-directory" aria-label="四卷目录">
      <div className="study-directory-intro"><span>案 上 四 卷</span><p>轻触题签，走入千年牡丹画境</p></div>
      {chapters.map(chapter => <button key={chapter.id} type="button" disabled={!home} onClick={() => choose(chapter.id)} aria-label={`展卷：${chapter.title}`}>
        <span className="study-mobile-numeral">{chapter.numeral}</span><span><strong>{chapter.title}</strong><small>{chapter.subtitle}</small></span><i aria-hidden="true">展<br />卷</i><b aria-hidden="true">›</b>
      </button>)}
    </div>
    <dialog className="study-dialog" ref={dialogRef} aria-labelledby="study-dialog-title" onCancel={event => { event.preventDefault(); closeDialog(); }} onClick={event => { if (event.target === event.currentTarget) closeDialog(); }}>
      <div className="study-dialog-inner">
        <button type="button" className="study-dialog-close" onClick={closeDialog} aria-label="关闭题签">×</button>
        <span className="study-dialog-kicker">国 色 长 卷</span>
        <h2 id="study-dialog-title">{dialog === 'directory' ? '案上四卷' : dialog === 'language' ? '汉字入画，文脉相承' : '一卷国色，数见千年'}</h2>
        {dialog === 'directory' ? <div className="study-dialog-chapters">{chapters.map(chapter => <button type="button" key={chapter.id} onClick={() => choose(chapter.id)}><span>{chapter.numeral}</span><strong>{chapter.title}</strong><small>{chapter.subtitle}</small><i aria-hidden="true">展卷 ›</i></button>)}</div>
          : <><p>{dialog === 'language' ? '此作以中文题跋、章节与文化解读呈现牡丹长卷。四卷中的画面与游观均可直接开启。' : '从神都御苑到百姓人家，从锦绣纹样到盛世风华。四幅真实数字长卷，循原有分镜徐徐展开；入卷后可滚轮、拖拽或键盘游观，亦可聆听雅音、阅览画外拾遗。'}</p><button type="button" className="study-dialog-explore" onClick={() => setDialog('directory')}>翻阅四卷目录 <span aria-hidden="true">›</span></button></>}
        <span className="study-dialog-seal" aria-hidden="true">国色</span>
      </div>
    </dialog>
  </section>;
}
