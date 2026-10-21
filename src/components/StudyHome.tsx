import { useEffect, useRef, useState } from 'react';
import { chapters } from '../data/chapters';
import { StudyRoomRenderer } from '../scene/StudyRoomRenderer';
import '../styles/volume-study.css';

export interface StudyHomeProps { phase: string; chapterId: number; onSelect: (id: number) => void; motionEnabled: boolean; onToggleMotion: () => void }

export default function StudyHome({ phase, chapterId, onSelect, motionEnabled, onToggleMotion }: StudyHomeProps) {
  const root = useRef<HTMLElement>(null), host = useRef<HTMLDivElement>(null), engine = useRef<StudyRoomRenderer | null>(null);
  const current = useRef({ phase, chapterId, onSelect, motionEnabled }); current.current = { phase, chapterId, onSelect, motionEnabled };
  const [hover, setHover] = useState<number | null>(null), [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null), [attempt, setAttempt] = useState(0), [about, setAbout] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const dialog = useRef<HTMLDialogElement>(null), aboutTrigger = useRef<HTMLButtonElement>(null), previousHome = useRef(phase === 'HOME');
  const home = phase === 'HOME';
  const choose = (id: number) => { if (current.current.phase === 'HOME' && ready && !error) current.current.onSelect(id); };
  const chooseRef = useRef(choose); chooseRef.current = choose;
  useEffect(() => {
    if (!host.current) return;
    let alive = true; setReady(false); setError(null);
    try {
      const room = new StudyRoomRenderer(host.current, {
        ready: () => { if (alive) setReady(true); }, error: message => { if (alive) { setError(message); setReady(false); } },
        select: id => chooseRef.current(id), hover: id => { if (alive) setHover(id); },
      });
      engine.current = room; room.setMotion(current.current.motionEnabled); room.setPhase(current.current.phase, current.current.chapterId);
      return () => { alive = false; engine.current = null; room.dispose(); };
    } catch { setError('当前浏览器暂不能陈设立体书房，请启用 WebGL 后重试。'); }
  }, [attempt]);
  useEffect(() => { engine.current?.setPhase(phase, chapterId); }, [phase, chapterId]);
  useEffect(() => { engine.current?.setMotion(motionEnabled); }, [motionEnabled]);
  useEffect(() => { engine.current?.setHover(hover); }, [hover]);
  useEffect(() => { const update = () => setVisible(!document.hidden); document.addEventListener('visibilitychange', update); return () => document.removeEventListener('visibilitychange', update); }, []);
  useEffect(() => {
    if (!home) { setAbout(false); setHover(null); }
    if (home && !previousHome.current) requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`.study-entry-button[data-chapter-id="${chapterId}"]`)?.focus({ preventScroll: true }));
    previousHome.current = home;
  }, [home, chapterId]);
  useEffect(() => { if (about && !dialog.current?.open) dialog.current?.showModal(); if (!about && dialog.current?.open) dialog.current.close(); }, [about]);
  function closeAbout() { setAbout(false); aboutTrigger.current?.focus({ preventScroll: true }); }
  return <section ref={root} className={`study-home volume-study${!home ? ' is-travelling' : ''}`} data-phase={phase} data-environment={motionEnabled ? 'on' : 'off'} data-paused={!visible || !['HOME','SCROLL_AWAKENING','CAMERA_ENTERING','RETURNING_HOME'].includes(phase)} aria-label="国色长卷·数字牡丹赋，立体纸绢书房" aria-busy={!ready || !home}>
    <div className="study-volume-host" ref={host} data-scene-state="preparing" />
    <div className="study-volume-vignette" aria-hidden="true" />
    <h1 className="study-title"><span className="visually-hidden">国色长卷 · 数字牡丹赋</span><img src={`${import.meta.env.BASE_URL}ui/study-volume/title.webp`} alt="" aria-hidden="true" /><span>一卷国色 · 数见千年 · 牡丹风华</span></h1>
    <div className="study-native-entries" aria-label="案上四卷">{chapters.map((chapter, i) => <div key={chapter.id} className={`study-scroll-entry study-scroll-object${hover === chapter.id && home ? ' is-hovered' : ''}${chapterId === chapter.id && !home ? ' is-selected' : ''}${chapterId !== chapter.id && !home ? ' is-unselected' : ''}`} data-entry-id={chapter.id} data-scroll-id={chapter.id}>
      <button type="button" className="study-entry-button" data-chapter-id={chapter.id} aria-label={`展开第${chapter.numeral}卷：${chapter.title}，${chapter.subtitle}`} disabled={!home || !ready || !!error} onClick={() => choose(chapter.id)} onPointerEnter={() => setHover(chapter.id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(chapter.id)} onBlur={() => setHover(null)}>
        <span className="study-plaque-jade" aria-hidden="true">❀</span><span className="study-plaque-face"><small>第{chapter.numeral}卷</small><strong>{chapter.title}</strong><span className="study-plaque-invitation">轻触展卷</span><span className="study-plaque-arrow" aria-hidden="true">›</span></span>
        <span className={`study-plaque-tassel tassel-${i}`} aria-hidden="true"><i /><b /><em /></span>
      </button>
    </div>)}</div>
    <header className="study-small-controls"><span>国色长卷 <i>·</i> 入境</span><button type="button" ref={aboutTrigger} onClick={() => setAbout(true)} disabled={!home}>观卷小记</button><button type="button" className="study-motion-toggle" onClick={onToggleMotion} disabled={!home} aria-label="书房环境动画" aria-pressed={motionEnabled}>环境动效 <b>{motionEnabled ? '开' : '关'}</b></button></header>
    <p className="study-visit-hint">择一卷而入，赏千年国色</p>
    {!ready && <div className={`study-material-state${error ? ' has-error' : ''}`} role={error ? 'alert' : 'status'}><strong>{error ? '书房画材暂未齐备' : '正在陈设书房'}</strong><p>{error || '铺开纸绢 · 安置案几 · 点亮天光'}</p>{error && <button type="button" onClick={() => setAttempt(value => value + 1)}>重新陈设</button>}</div>}
    <dialog className="study-note-dialog" ref={dialog} aria-labelledby="study-note-title" onCancel={event => { event.preventDefault(); closeAbout(); }} onClick={event => { if (event.target === event.currentTarget) closeAbout(); }}><button className="study-note-close" type="button" onClick={closeAbout} aria-label="关闭观卷小记">×</button><span>国 色 长 卷</span><h2 id="study-note-title">一卷锦绣，万象渐生</h2><p>移步书案，轻触绢纸题签，亲启神都花事、花入万家、锦绣花意、国色倾城四卷。入卷后可滚轮、拖拽、键盘游观，也可自动展卷，阅览画外拾遗。</p><p>清风、花影与青烟可随心开启或静赏。每次入卷，皆留一段舒卷赏画的时光。</p><button type="button" onClick={closeAbout}>归于书案</button></dialog>
  </section>;
}
