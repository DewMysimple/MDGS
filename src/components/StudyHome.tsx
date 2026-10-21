import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { chapters } from '../data/chapters';
import { layeredScrolls, studyLayers } from '../data/studyLayers';
import { useStudyParallax } from '../hooks/useStudyParallax';
import StudyAtmosphere from './StudyAtmosphere';
import '../styles/layered-study.css';

export interface StudyHomeProps {
  phase: string; chapterId: number; onSelect: (id: number) => void;
  motionEnabled: boolean; onToggleMotion: () => void;
}
const depth = (value: number) => ({ '--depth': `${value}px` } as CSSProperties);

export default function StudyHome({ phase, chapterId, onSelect, motionEnabled, onToggleMotion }: StudyHomeProps) {
  const home = phase === 'HOME';
  const environmental = motionEnabled && ['HOME', 'SCROLL_AWAKENING', 'CAMERA_ENTERING', 'RETURNING_HOME'].includes(phase);
  const { stage, active, onPointerMove, onPointerLeave } = useStudyParallax(environmental);
  const [hover, setHover] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [assetError, setAssetError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [about, setAbout] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const aboutTrigger = useRef<HTMLButtonElement>(null);
  const previousHome = useRef(home);
  const selected = layeredScrolls[chapterId - 1] ?? layeredScrolls[0];
  const sources = Object.values(studyLayers);
  useEffect(() => {
    let alive = true;
    setLoaded(0); setAssetError(false);
    for (const source of Object.values(studyLayers)) {
      const image = new Image(); image.src = source;
      image.decode().then(() => { if (alive) setLoaded(value => value + 1); })
        .catch(() => { if (alive) setAssetError(true); });
    }
    return () => { alive = false; };
  }, [attempt]);
  useEffect(() => {
    if (!home) { setAbout(false); setHover(null); }
    if (home && !previousHome.current) {
      requestAnimationFrame(() => stage.current?.querySelector<HTMLButtonElement>(`.study-entry-button[data-chapter-id="${chapterId}"]`)?.focus({ preventScroll: true }));
    }
    previousHome.current = home;
  }, [home, chapterId, stage]);
  useEffect(() => {
    if (about && !dialog.current?.open) dialog.current?.showModal();
    if (!about && dialog.current?.open) dialog.current.close();
  }, [about]);
  function closeAbout() { setAbout(false); aboutTrigger.current?.focus({ preventScroll: true }); }
  function choose(id: number) { if (home && loaded === sources.length && !assetError) onSelect(id); }
  const sceneStyle = { '--focus-x': `${selected.left + selected.width / 2}%`, '--focus-y': '63%' } as CSSProperties;
  return <section className={`study-home layered-study${active ? ' environment-running' : ' environment-still'}`} data-phase={phase} data-environment={motionEnabled ? 'on' : 'off'} aria-label="国色长卷·数字牡丹赋，分层古典书房" aria-busy={loaded < sources.length || !home}>
    <div className="study-outer-light" aria-hidden="true" />
    <div className="study-stage" ref={stage} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} style={sceneStyle}>
      <div className="study-camera-rig" key={attempt}>
        <div className="study-scene-layer study-garden-plane" data-depth="1.5" style={depth(1.5)} aria-hidden="true"><img src={studyLayers.garden} alt="" fetchPriority="high" draggable={false} /><div className="study-garden-mist" /></div>
        <div className="study-scene-layer study-room-plane" data-depth="4" style={depth(4)} aria-hidden="true"><img src={studyLayers.room} alt="" draggable={false} /></div>
        <div className="study-lantern-light" aria-hidden="true" />
        <div className="study-scene-layer study-desk-plane" data-depth="7" style={depth(7)} aria-hidden="true"><img src={studyLayers.desk} alt="" draggable={false} /></div>
        <h1 className="study-title"><span className="visually-hidden">国色长卷 · 数字牡丹赋</span><span className="study-title-art" aria-hidden="true"><img src={studyLayers.title} alt="" /></span><span className="study-title-poem">一卷国色 · 数见千年 · 牡丹风华</span></h1>
        <div className="study-scrolls-plane" aria-label="案上四卷">
          {layeredScrolls.map((item, index) => {
            const chapter = chapters[index];
            const [sx, sy, sw, sh] = item.source;
            const focused = home && hover === item.id;
            const picked = !home && chapterId === item.id;
            return <div key={item.id} className={`study-scroll-entry${focused ? ' is-hovered' : ''}${picked ? ' is-selected' : ''}${!home && !picked ? ' is-unselected' : ''}`} style={{ '--entry-left': `${item.left}%`, '--entry-width': `${item.width}%`, '--plaque-x': `${item.plaque}%`, '--entry-color': ['#a14e36','#5e796e','#a07c40','#7e4d32'][index], '--entry-order': index } as CSSProperties} onPointerEnter={() => home && setHover(item.id)} onPointerLeave={() => setHover(null)}>
              <div className="study-scene-layer study-scroll-object" data-depth="8" data-scroll-id={item.id} style={{ ...depth(8), clipPath: `polygon(${item.clip})` }} onClick={() => choose(item.id)} aria-hidden="true">
                <div className="study-scroll-art" style={{ clipPath: `polygon(${item.clip})` }}><img src={studyLayers.scrolls} alt="" draggable={false} style={{ left: `${-sx / sw * 100}%`, top: `${-sy / sh * 100}%`, width: `${1672 / sw * 100}%`, height: `${941 / sh * 100}%` }} /></div><span className="study-scroll-gilding" />
              </div>
              <button type="button" className="study-entry-button" data-chapter-id={item.id} aria-label={`展开第${chapter.numeral}卷：${chapter.title}，${chapter.subtitle}`} disabled={!home || loaded !== sources.length || assetError} onClick={() => choose(item.id)} onFocus={() => setHover(item.id)} onBlur={() => setHover(null)}>
                <span className="study-plaque-face"><span className="study-plaque-volume">第{chapter.numeral}卷</span><strong>{chapter.title}</strong><span className="study-plaque-invitation">轻触展卷</span><span className="study-plaque-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg></span></span>
                <svg className="study-plaque-tassel" viewBox="0 0 54 85" aria-hidden="true"><path d="M27 0v17M22 12q5-8 10 0l-1 8-8 1Z" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="27" cy="24" r="5" fill="currentColor" /><path d="M23 30 12 78q16 6 30-1L31 30Z" fill="currentColor" opacity=".8" />{[16,20,24,28,32,36,40].map((x,i)=><path key={x} d={`M${25+i*.7} 32Q${x-2} 54 ${x} 79`} stroke="#e1b576" strokeWidth=".6" opacity=".6" />)}</svg>
              </button>
            </div>;
          })}
        </div>
        <div className="study-scene-layer study-foreground-plane study-foreground-plane--left" data-depth="13" style={depth(13)} aria-hidden="true"><img src={studyLayers.foreground} alt="" draggable={false} /></div>
        <div className="study-scene-layer study-foreground-plane study-foreground-plane--right" data-depth="11" style={depth(11)} aria-hidden="true"><img src={studyLayers.foreground} alt="" draggable={false} /></div>
        <div className="study-environment-plane"><StudyAtmosphere enabled={active} /><div className="study-warm-beam" /></div>
        <div className="study-selection-shade" aria-hidden="true" />
      </div>
    </div>
    <header className="study-small-controls"><span>国色长卷 <i>·</i> 入境</span><button type="button" ref={aboutTrigger} onClick={() => setAbout(true)} disabled={!home}>观卷小记</button><button type="button" className="study-motion-toggle" onClick={onToggleMotion} disabled={!home} aria-label="书房环境动画" aria-pressed={motionEnabled}>环境动效 <b>{motionEnabled ? '开' : '关'}</b></button></header>
    <p className="study-visit-hint">移步书案 · 轻触题签 · 择卷入画</p>
    {loaded < sources.length && <div className="study-material-state" role="status">{assetError ? '书房画材暂未齐备' : `正在陈设书房 · ${loaded} / ${sources.length}`}{assetError && <button type="button" onClick={() => setAttempt(value => value + 1)}>重新陈设</button>}</div>}
    <dialog className="study-note-dialog" ref={dialog} aria-labelledby="study-note-title" onCancel={event => { event.preventDefault(); closeAbout(); }} onClick={event => { if (event.target === event.currentTarget) closeAbout(); }}><button className="study-note-close" type="button" onClick={closeAbout} aria-label="关闭观卷小记">×</button><span>国 色 长 卷</span><h2 id="study-note-title">一卷锦绣，万象渐生</h2><p>循着神都花事、花入万家、锦绣花意、国色倾城四卷，亲启案上画境。轻触绢纸题签进入；入卷后可滚轮、拖拽、键盘游观，也可自动展卷，阅览画外拾遗。</p><p>清风、花影与青烟可随心开启或静赏；每次入卷皆留一段展卷时光。</p><button type="button" onClick={closeAbout}>归于书案</button></dialog>
  </section>;
}
