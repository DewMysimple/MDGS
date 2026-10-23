import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowDown, ArrowRight, MoveUpRight, Settings2, Wind, X } from 'lucide-react';
import { chapters } from '../data/chapters';
import { atlasArt, atlasChapters } from '../data/peonyAtlas';
import { studyPainting } from '../data/study';
import type { StudyHomeProps } from './StudyHome';
import AudioController from './AudioController';
import PeonyPigment from './PeonyPigment';
import type { PeonyPigmentHandle } from './PeonyPigment';
import '../styles/peony-atlas.css';

type Note = 'preface' | 'guide' | null;

/** Painted planes form the foyer. Its text and controls remain accessible
 * HTML, independent from the four authored paintings and their timeline. */
export default function PeonyAtlasHome({ phase, chapterId, onSelect, motionEnabled, onToggleMotion, onOpenSettings }: StudyHomeProps) {
  const root = useRef<HTMLElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const pigment = useRef<PeonyPigmentHandle>(null);
  const noteTrigger = useRef<HTMLElement | null>(null), previousHome = useRef(phase === 'HOME');
  const [ready, setReady] = useState(false), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const [hover, setHover] = useState<number | null>(null), [note, setNote] = useState<Note>(null);
  const [flowerTouched, setFlowerTouched] = useState(false), [visible, setVisible] = useState(!document.hidden);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const home = phase === 'HOME', animated = motionEnabled && !reduced && visible && home;
  const latest = useRef({ phase, ready, animated, hover }); latest.current = { phase, ready, animated, hover };

  useEffect(() => {
    let alive = true; setReady(false); setError(false);
    const images = Object.values(atlasArt).map(src => { const image = new Image(); image.decoding = 'async'; image.src = src; return image; });
    Promise.all(images.map(image => image.decode())).then(() => { if (alive) setReady(true); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [attempt]);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches), visibility = () => setVisible(!document.hidden);
    media.addEventListener('change', update); document.addEventListener('visibilitychange', visibility);
    return () => { media.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  useEffect(() => {
    const element = root.current; if (!element) return;
    let frame = 0, x = 0, y = 0, targetX = 0, targetY = 0, then = 0, frames = 0;
    const paint = (now: number) => {
      if (!latest.current.animated) { x = y = targetX = targetY = 0; frame = 0; }
      else {
        const dt = then ? Math.min(64, now - then) : 16; then = now;
        const blend = 1 - Math.exp(-dt / 320);
        x += (targetX - x) * blend; y += (targetY - y) * blend;
        frame = Math.abs(targetX - x) + Math.abs(targetY - y) > .0008 ? requestAnimationFrame(paint) : 0;
      }
      element.style.setProperty('--atlas-x', x.toFixed(4)); element.style.setProperty('--atlas-y', y.toFixed(4)); frames++;
    };
    const move = (event: PointerEvent) => {
      if (!latest.current.animated || event.pointerType === 'touch') return;
      const rect = element.getBoundingClientRect();
      targetX = (event.clientX - rect.left) / rect.width - .5; targetY = (event.clientY - rect.top) / rect.height - .5;
      if (!frame) { then = 0; frame = requestAnimationFrame(paint); }
    };
    const reset = () => { targetX = targetY = 0; if (!frame) { then = 0; frame = requestAnimationFrame(paint); } };
    element.addEventListener('pointermove', move); element.addEventListener('pointerleave', reset);
    const diagnostics = { snapshot: () => ({ ...latest.current, renderCount: frames, layers: 4, kind: 'original-painted-atlas' }) };
    const diagnosticWindow = window as unknown as { __MDGS_ATLAS__?: typeof diagnostics };
    diagnosticWindow.__MDGS_ATLAS__ = diagnostics;
    return () => { cancelAnimationFrame(frame); element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', reset); if (diagnosticWindow.__MDGS_ATLAS__ === diagnostics) delete diagnosticWindow.__MDGS_ATLAS__; };
  }, []);

  useEffect(() => {
    if (!animated) { root.current?.style.setProperty('--atlas-x', '0'); root.current?.style.setProperty('--atlas-y', '0'); }
  }, [animated]);
  useEffect(() => {
    if (!home) { setNote(null); setHover(null); }
    if (home && !previousHome.current) requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`.study-entry-button[data-chapter-id="${chapterId}"]`)?.focus({ preventScroll: true }));
    previousHome.current = home;
  }, [home, chapterId]);
  useEffect(() => { if (note && !dialog.current?.open) dialog.current?.showModal(); if (!note && dialog.current?.open) dialog.current.close(); }, [note]);
  function openNote(value: Note, trigger: HTMLElement) { noteTrigger.current = trigger; setNote(value); }
  function closeNote() { setNote(null); noteTrigger.current?.focus({ preventScroll: true }); }
  function choose(id: number) { if (home && ready && !error) onSelect(id); }

  return <section ref={root} className={`study-home peony-atlas${ready ? ' is-ready' : ''}${!home ? ' is-travelling' : ''}${flowerTouched ? ' is-flower-touched' : ''}`}
    data-phase={phase} data-environment={motionEnabled ? 'on' : 'off'} data-paused={!animated} aria-label="国色长卷·数字牡丹赋，牡丹画境" aria-busy={!ready || !home}>
    <div className="atlas-art" aria-hidden="true">
      <img key={`landscape-${attempt}`} className="atlas-landscape" src={atlasArt.landscape} alt="" fetchPriority="high" />
      <div className="atlas-light" /><div className="atlas-haze atlas-haze-one" /><div className="atlas-haze atlas-haze-two" />
      <div className="atlas-peony-plane"><PeonyPigment key={`peonies-${attempt}`} ref={pigment} active={home} motionEnabled={motionEnabled && !reduced} onBrush={() => setFlowerTouched(true)} /><div className="atlas-flower-glow" /></div>
      <img key={`branch-${attempt}`} className="atlas-ivory-branch" src={atlasArt.branch} alt="" />
      <div className="atlas-petals">{Array.from({ length: 5 }, (_, i) => <i key={i} style={{ '--petal': i } as CSSProperties} />)}</div>
      <div className="atlas-paper-grain" />
    </div>
    <header className="atlas-header">
      <div className="atlas-identity"><span className="atlas-brand-seal" aria-hidden="true">国<br />色</span><span>国色长卷<small>一场关于牡丹的数字游观</small></span></div>
      <nav className="atlas-header-nav" aria-label="观展信息">
        <AudioController variant="foyer" active={home} /><span />
        <button type="button" onClick={event => openNote('preface', event.currentTarget)} disabled={!home}>作品序言</button><span />
        <button type="button" onClick={event => openNote('guide', event.currentTarget)} disabled={!home}>观展指南</button><span />
        <button type="button" onClick={onToggleMotion} disabled={!home} aria-label="风物轻动" aria-pressed={motionEnabled}><Wind size={16} strokeWidth={1.2} />风物<small>{motionEnabled ? '开' : '静'}</small></button>
        <button className="atlas-settings" type="button" onClick={onOpenSettings} disabled={!home} aria-label="打开设置" aria-haspopup="dialog"><Settings2 size={18} strokeWidth={1.2} /></button>
      </nav>
    </header>
    <main className="atlas-intro">
      <p className="atlas-overline"><span />以花为引 · 与千年相逢</p>
      <h1 className="atlas-title"><span className="visually-hidden">国色长卷</span><img key={`title-${attempt}`} src={atlasArt.title} alt="" /></h1>
      <div className="atlas-title-caption"><span>数 字 牡 丹 赋</span><i /><small>PEONY · A CHINESE STORY</small></div>
      <p className="atlas-prologue">一朵花，如何进入中国人的生活与想象？<br /><span>循着山野、御苑、烟火与诗意，<br />展开一卷生生不息的中国故事。</span></p>
      <button type="button" className="atlas-begin" onClick={() => choose(1)} disabled={!home || !ready || error}><span>启卷 · 入画</span><ArrowRight size={19} strokeWidth={1.1} /><i /></button>
      <p className="atlas-begin-note">四卷相续 · 移步成景 · 以心观花</p>
    </main>
    <button type="button" className="atlas-flower-invitation" disabled={!home || !ready} onClick={() => { pigment.current?.flourish(); setFlowerTouched(true); }} aria-label="轻拂花影，唤醒牡丹花色"><span className="atlas-flower-dot"><i /></span><span>{flowerTouched ? '花开于纸，也开在人间' : '轻拂花影 · 唤醒花色'}</span></button>
    <section className="atlas-chapters" aria-label="案上四卷">
      <div className="atlas-chapters-heading"><span><i />择卷而入</span><small>四段花事，一脉国色</small><ArrowDown size={14} strokeWidth={1} /></div>
      <div className="atlas-chapter-grid">{chapters.map((chapter, i) => <button key={chapter.id} type="button"
        className={`study-entry-button atlas-chapter${hover === chapter.id ? ' is-hovered' : ''}${chapterId === chapter.id && !home ? ' is-selected' : ''}`}
        style={{ '--chapter-ink': atlasChapters[i].colour } as CSSProperties} data-chapter-id={chapter.id}
        disabled={!home || !ready || error} aria-label={`展开第${chapter.numeral}卷：${chapter.title}，${chapter.subtitle}`}
        onClick={() => choose(chapter.id)} onPointerEnter={() => setHover(chapter.id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(chapter.id)} onBlur={() => setHover(null)}>
        <span className="atlas-chapter-image"><img src={studyPainting(chapter.id)} alt="" loading="lazy" /><i /><span>{atlasChapters[i].motif}</span></span>
        <span className="atlas-chapter-copy"><small>第{chapter.numeral}卷 <i /><span>{atlasChapters[i].route}</span></small><strong>{chapter.title}</strong><span>{chapter.subtitle}</span><em>{atlasChapters[i].line}</em></span>
        <MoveUpRight className="atlas-chapter-arrow" size={18} strokeWidth={1} />
      </button>)}</div>
    </section>
    <footer className="atlas-footer"><span>以东方笔意，写数字新章</span><span>国画 × 空间叙事 × 交互艺术</span><span>国色长卷 / 数字艺术作品</span></footer>
    {!ready && <div className={`atlas-material-state${error ? ' has-error' : ''}`} role={error ? 'alert' : 'status'}><span className="atlas-material-seal">花</span><strong>{error ? '画材暂未齐备' : '一纸春色，正在铺陈'}</strong><p>{error ? '请重新载入首页画材。' : '远山入墨 · 花色将醒'}</p>{error && <button type="button" onClick={() => setAttempt(value => value + 1)}>重新铺陈</button>}</div>}
    <dialog className="atlas-note" ref={dialog} aria-labelledby="atlas-note-title" onCancel={event => { event.preventDefault(); closeNote(); }} onClick={event => { if (event.target === event.currentTarget) closeNote(); }}>
      <button className="atlas-note-close" type="button" onClick={closeNote} aria-label="关闭观展说明"><X size={21} strokeWidth={1.1} /></button>
      <div className="atlas-note-art" aria-hidden="true"><img src={atlasArt.branch} alt="" /><span>花有信<br />国有色</span></div>
      <div className="atlas-note-body"><p className="atlas-overline">国色长卷 · {note === 'guide' ? '观展指南' : '作品序言'}</p><h2 id="atlas-note-title">{note === 'guide' ? '慢一点，与花相逢' : '以一朵花，读一卷中国'}</h2>
        {note === 'guide' ? <><p>四卷可以依次游观，也可以随心选择。进入画境后，滚动鼠标或左右拖拽，在画中移步；按方向键亦可徐行。</p><div className="atlas-guide-list"><p><b>游观</b><span>滚轮 / 拖拽 / 方向键<br />让画卷随你的节奏展开</span></p><p><b>静赏</b><span>自动展卷，跟随原作镜头<br />轻触“启声”，让原创声景相伴</span></p><p><b>有遇</b><span>“画中有遇”可辨花、循景、入锦、展诗<br />“画外拾遗”可参读花事与馆藏</span></p><p><b>留芳</b><span>在卷末择一份心意，钤印成笺<br />保存属于自己的春色</span></p></div><p className="atlas-note-footnote">设置中可切换诗意短章、原作叙事或静观画卷。建议使用电脑与耳机，在一段不被打扰的时光里观赏。</p></> : <><p>从山野的初绽，到御苑的华贵；从万家的心愿，到诗中的风华。牡丹的故事，也是中国人把日子过成锦绣的故事。</p><p>《国色长卷》以国画为骨、数字空间为境，让四段花事在游观中徐徐展开。你可以行于画中，也可以停下来，拾起一枚纹样、一句诗、一份寄托。</p><blockquote>让传统之美，在今天继续生长。</blockquote><p className="atlas-note-footnote">本作以原画与实时三维展开叙事，首页分层美术由生成式图像辅助创作。新增文化线索另附馆藏与文献来源。</p></>}
        <button type="button" className="atlas-note-return" onClick={closeNote}>归于画境<ArrowRight size={17} strokeWidth={1.2} /></button>
      </div>
    </dialog>
  </section>;
}
