import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Download, RotateCcw, X } from 'lucide-react';
import { flowerLetters } from '../data/flowerLetters';
import { getFlowerLetterDesigns } from '../data/flowerLetterDesigns';
import '../styles/flower-letter.css';

interface Props { open: boolean; chapterId: number; onClose: () => void }

export default function FlowerLetterDialog({ open, chapterId, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const primaryButton = useRef<HTMLButtonElement>(null), choices = useRef<HTMLDivElement>(null);
  const pendingDownloadFocus = useRef(false);
  const pendingChoiceFocus = useRef(false);
  const [selected, setSelected] = useState(chapterId - 1);
  const [designIndex, setDesignIndex] = useState(0);
  const [sealed, setSealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [renderedFor, setRenderedFor] = useState('');
  const blob = useRef<Blob | null>(null);
  const letter = flowerLetters[selected];
  const designs = getFlowerLetterDesigns(chapterId);
  const design = designs[designIndex];
  const renderKey = `${letter.id}:${design.id}:${sealed}`;
  const preparing = busy || renderedFor !== renderKey;

  useLayoutEffect(() => {
    if (open && !sealed && pendingChoiceFocus.current) {
      choices.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
      pendingChoiceFocus.current = false;
    }
  }, [open, sealed]);

  useLayoutEffect(() => {
    if (open && sealed && !busy && !error && renderedFor === renderKey && pendingDownloadFocus.current) {
      primaryButton.current?.focus({ preventScroll: true }); pendingDownloadFocus.current = false;
    }
  }, [open, sealed, busy, error, renderedFor, renderKey]);

  useEffect(() => {
    if (!open) { dialog.current?.close(); pendingDownloadFocus.current = false; return; }
    previousFocus.current = document.activeElement as HTMLElement | null;
    setSelected(Math.max(0, Math.min(3, chapterId - 1))); setDesignIndex(0); setSealed(false);
    dialog.current?.showModal();
    return () => { dialog.current?.close(); if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true }); };
  }, [open, chapterId]);

  useEffect(() => {
    if (!open) return;
    let alive = true, url: string | undefined;
    setBusy(true); setError(false); setPreview(null); blob.current = null;
    import('../art/flowerLetter').then(({ createFlowerLetter }) => createFlowerLetter(letter, design, sealed)).then(result => {
      if (!alive) return;
      blob.current = result; url = URL.createObjectURL(result); setPreview(url); setRenderedFor(renderKey); setBusy(false);
    }).catch(() => { if (alive) { setError(true); setBusy(false); } });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [open, letter, design, sealed, attempt, renderKey]);

  function download() {
    if (!blob.current || !sealed || preparing || error) return;
    const url = URL.createObjectURL(blob.current), link = document.createElement('a');
    link.href = url; link.download = `国色长卷·${letter.word}花笺.png`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <dialog ref={dialog} className={`flower-letter-dialog${sealed ? ' is-sealed' : ''}`} aria-labelledby="flower-letter-title"
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <button type="button" className="flower-letter-close" onClick={onClose} aria-label="收起观者花笺"><X size={21} strokeWidth={1.2} /></button>
    <div className="flower-letter-preview" aria-busy={preparing}>
      {preview && <img src={preview} width={1200} height={1600} alt={`${design.name}花笺，心意${letter.word}，${letter.lines.join('，')}。`} />}
      {!preview && !error && <span className="flower-letter-preparing" role="status">一笺春色，正在铺陈</span>}
      {error && <div className="flower-letter-export-error" role="alert"><p>花笺暂未铺好</p><button type="button" onClick={() => setAttempt(value => value + 1)}>重新铺纸</button></div>}
    </div>
    <div className="flower-letter-compose">
      <p className="flower-letter-kicker">卷外一笺 · 由你择意</p>
      <h2 id="flower-letter-title">把一份花意<br />留给今天</h2>
      <p className="flower-letter-intro">花的故事还在继续。<br />择一份心意，钤一枚印，<br />让这段游观，成为自己的春日记忆。</p>
      <div ref={choices} className="flower-letter-choices" role="group" aria-label="选择花笺心意">{flowerLetters.map((item, index) => <button type="button" key={item.id} aria-pressed={index === selected} disabled={sealed} onClick={() => setSelected(index)}><span>{item.word}</span><small>{['一枝傲骨', '一城春色', '岁岁安宁', '千年诗意'][index]}</small></button>)}</div>
      <div className="flower-letter-designs" role="group" aria-label="选择本卷花笺画面">{designs.map((item, index) => <button type="button" className="flower-letter-design" key={item.id} aria-pressed={index === designIndex} disabled={sealed} onClick={() => setDesignIndex(index)}><span>{item.name}</span><small>{index === 0 ? '笺式一' : '笺式二'}</small></button>)}</div>
      <p className="flower-letter-selected" aria-live="polite">{letter.lines.join('，')}。</p>
      <div className="flower-letter-actions">{sealed ? <><p className="flower-letter-sealed-note" role="status">此刻花意，已落成笺。</p><button ref={primaryButton} className="flower-letter-primary" type="button" onClick={download} disabled={preparing || error}><span>存为花笺</span><Download size={17} strokeWidth={1.3} /></button><button type="button" className="flower-letter-again" onClick={() => {
        pendingChoiceFocus.current = true; pendingDownloadFocus.current = false; setSealed(false);
      }}><RotateCcw size={13} />再题一笺</button></> : <button ref={primaryButton} className="flower-letter-primary" type="button" onClick={() => { pendingDownloadFocus.current = true; setSealed(true); }} disabled={preparing || error}><span>钤印 · 留芳</span><ArrowRight size={18} strokeWidth={1.2} /></button>}</div>
      <p className="flower-letter-footnote">观者新题 · 1200 × 1600 PNG<br />花笺在本机生成，可保存留念。</p>
    </div>
  </dialog>;
}
