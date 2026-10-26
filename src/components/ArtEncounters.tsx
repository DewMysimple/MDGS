import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, BookOpen, RotateCcw, X } from 'lucide-react';
import { artDetails, artEncounters, artSources } from '../data/artEncounters';
import type { ArtDetail, ArtworkAnchorSpec, ProjectedArtAnchor } from '../data/artEncounters';
import { chapterAssetBase } from '../data/sourceEdition';
import '../styles/art-encounters.css';

export interface ArtEncountersProps {
  chapterId: number;
  progress: number;
  active: boolean;
  projections: ProjectedArtAnchor[];
  onSeek: (progress: number) => void;
  onAnchorRequest: (specs: ArtworkAnchorSpec[]) => void;
  onOpenChange?: (open: boolean) => void;
}

function Detail({ detail, chapterId, className = '' }: { detail: ArtDetail; chapterId: number; className?: string }) {
  return <div className={`art-detail ${className}`} role="img" aria-label={detail.label}>
    <img src={`${chapterAssetBase(chapterId)}textures/${detail.texture}`} alt="" draggable={false}
      style={{ width: `${detail.zoom * 100}%`, transform: `translate(${-detail.center[0] * 100}%, ${-(1 - detail.center[1]) * 100}%)` }} />
  </div>;
}

function Source({ source }: { source: { title: string; url: string } }) {
  return <a className="art-source" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<span aria-hidden="true"> ↗</span></a>;
}

/** Place the entrance in the viewer controls; the encounter itself stays inside the painting. */
export default function ArtEncounters({ chapterId, progress, active, projections, onSeek, onAnchorRequest, onOpenChange }: ArtEncountersProps) {
  const encounter = artEncounters.find(item => item.chapterId === chapterId);
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [legend, setLegend] = useState<'legend' | 'record'>('legend');
  const [gaze, setGaze] = useState(0);
  const [visited, setVisited] = useState<number[]>([0]);
  const [phase, setPhase] = useState<'waiting' | 'picked' | 'woven'>('waiting');
  const [poem, setPoem] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number; over: boolean } | null>(null);
  const titleId = useId();
  const helpId = useId();
  const entranceRef = useRef<HTMLButtonElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const clothRef = useRef<HTMLButtonElement>(null);
  const flowerRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean; element: HTMLButtonElement } | null>(null);
  const suppressClick = useRef(false);
  const settled = useRef(false);
  const wasOpen = useRef(false);
  const focusPending = useRef(false);
  const openedChapter = useRef<number | null>(null);
  const callbacks = useRef({ onSeek, onAnchorRequest, onOpenChange });
  callbacks.current = { onSeek, onAnchorRequest, onOpenChange };
  const projectionRef = useRef(projections); projectionRef.current = projections;
  const activeRef = useRef(active); activeRef.current = active;

  useLayoutEffect(() => { setHost(document.getElementById('scroll-artwork')); }, [active, chapterId]);

  const releaseDrag = useCallback(() => {
    const pointer = dragRef.current;
    dragRef.current = null;
    if (pointer?.element.hasPointerCapture(pointer.pointerId)) pointer.element.releasePointerCapture(pointer.pointerId);
    setDrag(null);
  }, []);

  const close = useCallback(() => { releaseDrag(); setOpen(false); }, [releaseDrag]);

  useEffect(() => {
    if (!open || !encounter || openedChapter.current !== chapterId) return;
    callbacks.current.onAnchorRequest(encounter.anchors);
    callbacks.current.onOpenChange?.(true);
    wasOpen.current = true;
    const frame = requestAnimationFrame(() => {
      const first = layerRef.current?.querySelector<HTMLButtonElement>('.art-anchor:not([aria-disabled="true"])');
      (first ?? closeRef.current)?.focus({ preventScroll: true });
      if (first) focusPending.current = false;
    });
    const onKey = (event: KeyboardEvent) => {
      if (!activeRef.current || event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    const onVisibility = () => { if (document.hidden) releaseDrag(); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('visibilitychange', onVisibility);
      callbacks.current.onAnchorRequest([]);
      callbacks.current.onOpenChange?.(false);
      releaseDrag();
    };
  }, [open, encounter, chapterId, close, releaseDrag]);

  useEffect(() => {
    if (!open || !focusPending.current) return;
    const first = layerRef.current?.querySelector<HTMLButtonElement>('.art-anchor:not([aria-disabled="true"])');
    if (!first) return;
    if (document.activeElement === closeRef.current || document.activeElement === entranceRef.current) first.focus({ preventScroll: true });
    focusPending.current = false;
  }, [open, projections]);

  useEffect(() => {
    if (open || !wasOpen.current) return;
    wasOpen.current = false;
    entranceRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => { close(); }, [chapterId, active, close]);

  useEffect(() => {
    if (!open || !encounter) return;
    const nearStop = Math.abs(progress - encounter.progress) < 0.002;
    if (nearStop) settled.current = true;
    else if (settled.current) close();
  }, [progress, encounter, open, close]);

  function begin() {
    if (open) { close(); return; }
    if (!encounter || !active || !host) return;
    settled.current = false;
    focusPending.current = true;
    openedChapter.current = chapterId;
    setLegend('legend'); setGaze(0); setVisited([0]); setPhase('waiting'); setPoem(false);
    callbacks.current.onSeek(encounter.progress);
    setOpen(true);
  }

  function point(id: string) { return projections.find(item => item.id === id && item.visible); }

  function pointStyle(id: string): CSSProperties | undefined {
    const anchor = point(id);
    if (!anchor) return undefined;
    return { left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` };
  }

  function moveGaze(index: number) {
    setGaze(index);
    setVisited(previous => previous.includes(index) ? previous : [...previous, index]);
  }

  function finishWeaving() { releaseDrag(); setPhase('woven'); }

  function overCloth(x: number, y: number) {
    const target = projectionRef.current.find(item => item.id === 'brocade-cloth' && item.visible);
    const bounds = host?.getBoundingClientRect();
    return !!target && !!bounds && Math.hypot(x - bounds.left - target.x * bounds.width, y - bounds.top - target.y * bounds.height) < Math.max(44, bounds.width * 0.035);
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || phase === 'woven') return;
    event.preventDefault(); event.stopPropagation();
    setPhase('picked'); suppressClick.current = false;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, element: event.currentTarget };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const pointer = dragRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId || !host) return;
    event.stopPropagation();
    if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 6) pointer.moved = true;
    if (!pointer.moved) return;
    const bounds = host.getBoundingClientRect();
    setDrag({ x: Math.min(bounds.width - 25, Math.max(25, event.clientX - bounds.left)), y: Math.min(bounds.height - 25, Math.max(25, event.clientY - bounds.top)), over: overCloth(event.clientX, event.clientY) });
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const moved = dragRef.current.moved;
    suppressClick.current = moved;
    const matched = moved && overCloth(event.clientX, event.clientY);
    releaseDrag();
    if (matched) setPhase('woven');
  }

  if (!encounter) return null;

  const gazeLabels = ['花间', '舟中', '桥上'];
  const gazeCopy = [
    '从近处的一丛牡丹，望向水上的春日。',
    '舟行春水，赏花的目光也随之流动。',
    '桥上人相望，一城春色，众人同赏。',
  ];
  const gazeIds = ['gaze-flower', 'gaze-boat', 'gaze-bridge'];
  const selectedDetail = phase === 'woven' ? artDetails.cloth : artDetails.flower;

  const overlay = open && active && host && openedChapter.current === chapterId && <div
    className={`art-encounters art-encounters--${encounter.id}${phase === 'woven' ? ' is-woven' : ''}`}
    ref={layerRef} role="region" aria-labelledby={titleId}
    onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()}
    onPointerUp={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
    onDoubleClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}
    onKeyDown={event => event.stopPropagation()}>
    {chapterId === 1 && <>
      {point('legend-flower') && <button type="button" style={pointStyle('legend-flower')}
        className={`art-anchor ${legend === 'legend' ? 'is-chosen' : ''}`} onClick={() => setLegend('legend')}
        aria-label="辨读火中牡丹的传说" aria-pressed={legend === 'legend'}><span className="art-anchor__eye" /><span className="art-anchor__label">传说</span></button>}
      {point('legend-record') && <button type="button" style={pointStyle('legend-record')}
        className={`art-anchor ${legend === 'record' ? 'is-chosen' : ''}`} onClick={() => setLegend('record')}
        aria-label="读北宋牡丹史料" aria-pressed={legend === 'record'}><span className="art-anchor__eye" /><span className="art-anchor__label">记载</span></button>}
      <section className="art-paper art-legend-paper">
        <header className="art-paper__heading"><h2 id={titleId}>{encounter.title}</h2><div className="art-reading-tabs" role="group" aria-label="选择传说或史料"><button type="button" aria-pressed={legend === 'legend'} onClick={() => setLegend('legend')}>传说</button><span aria-hidden="true">／</span><button type="button" aria-pressed={legend === 'record'} onClick={() => setLegend('record')}>史料</button></div><button ref={closeRef} className="art-close" type="button" onClick={close} aria-label="收起画中有遇"><X size={17} /></button></header>
        <div className="art-copy" aria-live="polite">{legend === 'legend'
          ? <p>传说借烈火写傲骨，读史仍须分辨。</p>
          : <p>“自唐则天已后，洛阳牡丹始盛。”</p>}</div>
        <div className="art-source-line"><span>画外补笺 · </span><Source source={legend === 'legend' ? artSources.legend : artSources.record} /></div>
      </section>
    </>}

    {chapterId === 2 && <>
      <svg className="art-gaze-lines" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        {gazeIds.slice(1).map((id, index) => {
          const from = point(gazeIds[index]), to = point(id);
          return from && to && visited.includes(index + 1) ? <path key={id} d={`M${from.x * 1000} ${from.y * 1000} Q${(from.x + to.x) * 500} ${Math.min(from.y, to.y) * 1000 - 34} ${to.x * 1000} ${to.y * 1000}`} /> : null;
        })}
      </svg>
      {gazeIds.map((id, index) => point(id) && <button type="button" key={id} style={pointStyle(id)}
        className={`art-anchor ${gaze === index ? 'is-chosen' : ''} ${visited.includes(index) ? 'is-visited' : ''}`}
        onClick={() => moveGaze(index)} aria-label={`望向${gazeLabels[index]}`} aria-pressed={gaze === index}>
        <span className="art-anchor__eye" /><span className="art-anchor__label">{gazeLabels[index]}</span></button>)}
      <section className="art-paper art-gaze-paper">
        <header className="art-paper__heading"><span className="art-kicker">画中游观</span><h2 id={titleId}>{encounter.title}</h2><button ref={closeRef} className="art-close" type="button" onClick={close} aria-label="收起画中有遇"><X size={17} /></button></header>
        <div className="art-gaze-reading"><div className="art-gaze-steps" role="group" aria-label="选择赏花视线">{gazeLabels.map((label, index) => <button key={label} type="button" aria-pressed={gaze === index} onClick={() => moveGaze(index)}><small aria-hidden="true">0{index + 1}</small>{label}</button>)}</div><p className="art-copy" aria-live="polite">{gazeCopy[gaze]}</p></div>
        <p className="art-gaze-postscript">画外补笺 · 共赏之意<span>宋人亦记“士庶竞为游遨”。<Source source={artSources.record} /></span></p>
      </section>
    </>}

    {chapterId === 3 && <>
      {point('brocade-flower') && <button ref={flowerRef} type="button" style={pointStyle('brocade-flower')}
        className={`art-anchor art-anchor--flower ${phase !== 'waiting' ? 'is-chosen' : ''}`} aria-label="选取原画牡丹的花意，可拖至锦面或按回车选取" aria-describedby={helpId}
        onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}
        onPointerCancel={releaseDrag} onLostPointerCapture={() => { if (dragRef.current) releaseDrag(); }}
        onClick={event => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          if (phase === 'woven') return;
          setPhase('picked');
          if (event.detail === 0) clothRef.current?.focus({ preventScroll: true });
        }}><span className="art-anchor__eye" /><span className="art-anchor__label">{phase === 'woven' ? '花意' : '选花'}</span></button>}
      {point('brocade-cloth') && <button ref={clothRef} type="button" style={pointStyle('brocade-cloth')}
        className={`art-anchor art-anchor--cloth ${phase === 'picked' ? 'is-ready' : ''} ${phase === 'woven' ? 'is-chosen' : ''} ${drag?.over ? 'is-over' : ''}`}
        aria-label={phase === 'waiting' ? '锦面牡丹，请先选取花意' : phase === 'picked' ? '将已选的花意入锦' : '已入锦，欣赏原作纹样'} aria-describedby={helpId}
        aria-disabled={phase === 'waiting'} onClick={() => { if (phase === 'picked') finishWeaving(); }}>
        <span className="art-anchor__eye" /><span className="art-anchor__label">{phase === 'woven' ? '锦绣' : '入锦'}</span></button>}
      {drag && <div className={`art-flower-in-hand ${drag.over ? 'is-over' : ''}`} style={{ left: drag.x, top: drag.y }} aria-hidden="true"><Detail detail={artDetails.flower} chapterId={3} /></div>}
      <section className="art-paper art-brocade-paper">
        <header className="art-paper__heading"><h2 id={titleId}>{encounter.title}</h2>{phase !== 'waiting' && <button type="button" className="art-reset" onClick={() => { releaseDrag(); setPhase('waiting'); flowerRef.current?.focus({ preventScroll: true }); }}><RotateCcw size={12} />重拾</button>}<button ref={closeRef} className="art-close" type="button" onClick={close} aria-label="收起画中有遇"><X size={17} /></button></header>
        <div className="art-brocade-detail" data-phase={phase}>
          <Detail key={selectedDetail.texture} detail={selectedDetail} chapterId={3} />
          <span className="art-detail-caption">{phase === 'woven' ? '锦上之花' : '画中之花'}</span>
        </div>
        <p id={helpId} className="art-copy" aria-live="polite">{phase === 'waiting' ? '拖花入锦，或依次点选。' : phase === 'picked' ? '再点入锦，花意化作纹样。' : '花入锦绣，岁岁圆满。'}</p>
        <div className="art-brocade-foot"><span className="art-work-note">花与织物的艺术化联想</span><Source source={artSources.museum} /></div>
      </section>
    </>}

    {chapterId === 4 && <>
      {point('poem-paper') && <button type="button" style={pointStyle('poem-paper')} className={`art-anchor ${poem ? 'is-chosen' : ''}`} aria-label="展读原画诗笺，清平调其一" aria-expanded={poem} onClick={() => setPoem(value => !value)}><span className="art-anchor__eye" /><span className="art-anchor__label">展读</span></button>}
      <section className={`art-paper art-poem-paper ${poem ? 'is-unfolded' : ''}`}>
        <header className="art-paper__heading art-poem-heading"><div className="art-poem-heading-copy"><span className="art-kicker">画中题咏</span><h2 id={titleId}>{encounter.title}</h2></div><button ref={closeRef} className="art-close" type="button" onClick={close} aria-label="收起画中有遇"><X size={17} /></button></header>
        {poem ? <>
          <div className="art-poem-lines" aria-label="云想衣裳花想容，春风拂槛露华浓。"><p>云想衣裳花想容</p><p>春风拂槛露华浓</p></div>
          <p className="art-poem-attribution">李白 · 清平调其一</p>
          <p className="art-poem-note">以花映人，<br />以诗留春。</p>
          <Source source={artSources.poem} />
        </> : <>
          <div className="art-poem-original"><Detail detail={artDetails.poem} chapterId={4} /></div>
          <p className="art-poem-intro">书案前，<br />一笺花容待展读。</p>
        </>}
        <button type="button" className="art-poem-toggle" aria-expanded={poem} onClick={() => setPoem(value => !value)}>{poem ? '合笺' : <>展读原诗 <ArrowRight size={15} /></>}</button>
        {!poem && <span className="art-work-note">原画诗笺 · 李白《清平调》</span>}
      </section>
    </>}
  </div>;

  return <>
    <button type="button" ref={entranceRef} className={`art-encounter-entrance ${open ? 'is-open' : ''}`}
      disabled={!active} onClick={event => { event.stopPropagation(); begin(); }} aria-expanded={open} aria-label={`画中有遇：${encounter.invitation}`} title={encounter.invitation}>
      <BookOpen size={15} strokeWidth={1.25} /><span>画中有遇</span><span className="art-encounter-entrance__name">{encounter.title}</span>
    </button>
    {overlay && createPortal(overlay, host)}
  </>;
}
