import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, BookOpen, ChevronDown, MoveUpRight, X } from 'lucide-react';
import { contentSourceNote, workPreface } from '../data/chapters';
import { curatorialNotes } from '../data/curatorialNotes';
import '../styles/curatorial-reading.css';

interface CultureChapter {
  id: number;
  numeral: string;
  title: string;
  subtitle: string;
  era: string;
  intro: string;
  paragraphs: string[];
  source: string;
  colophon: string;
}

interface Props {
  chapter: CultureChapter;
  open: boolean;
  onClose: () => void;
  onExplore?: () => void;
}

export default function CulturePanel({ chapter, open, onClose, onExplore }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [reading, setReading] = useState<'notes' | 'original'>('notes');
  const id = useId();
  const note = curatorialNotes[chapter.id];

  useEffect(() => { if (open) { setReading('notes'); panelRef.current?.scrollTo({ top: 0 }); } }, [open, chapter.id]);

  function chooseReading(value: 'notes' | 'original') {
    setReading(value);
    panelRef.current?.scrollTo({ top: 0 });
  }

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]',
      ) ?? []).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0
        && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[inert]'));
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!panelRef.current?.contains(document.activeElement)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="culture-backdrop" onClick={onClose}>
      <aside
        className="culture-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="culture-title"
        onClick={event => event.stopPropagation()}
      >
        <header className="culture-topline">
          <span><BookOpen size={15} strokeWidth={1.4} /> 画外拾遗</span>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label="关闭文化解读" type="button">
            <X size={21} strokeWidth={1.3} />
          </button>
        </header>
        <div className="culture-content">
          <p className="eyebrow">第{chapter.numeral}卷 · {chapter.era}</p>
          <h2 id="culture-title">{chapter.title}</h2>
          <p className="culture-subtitle">{chapter.subtitle}</p>
          <div className="culture-reading-tabs" role="tablist" aria-label="选择阅读内容">
            <button type="button" role="tab" id={`${id}-notes-tab`} aria-selected={reading === 'notes'} aria-controls={`${id}-notes`} tabIndex={reading === 'notes' ? 0 : -1} onClick={() => chooseReading('notes')} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); chooseReading('original'); document.getElementById(`${id}-original-tab`)?.focus(); } }}>花事札记</button>
            <button type="button" role="tab" id={`${id}-original-tab`} aria-selected={reading === 'original'} aria-controls={`${id}-original`} tabIndex={reading === 'original' ? 0 : -1} onClick={() => chooseReading('original')} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); chooseReading('notes'); document.getElementById(`${id}-notes-tab`)?.focus(); } }}>原作全文</button>
          </div>
          <section id={`${id}-notes`} role="tabpanel" aria-labelledby={`${id}-notes-tab`} hidden={reading !== 'notes'} className="culture-annotations">
            <h3>{note.question}</h3>
            <p className="culture-editorial-lead">{note.lead}</p>
            {note.sections.map((section, index) => <section className="culture-observation" key={section.title}><span aria-hidden="true">0{index + 1}</span><div><h4>{section.title}</h4><p>{section.text}</p></div></section>)}
            <div className="culture-looking"><span>画中细看</span><p>{note.looking}</p>{onExplore && <button type="button" onClick={onExplore}>循此入画<ArrowRight size={15} strokeWidth={1.2} /></button>}</div>
            <div className="culture-reference-list" aria-label="文献与馆藏参读"><h4>纸上有据 · 画外参读</h4>{note.sources.map(source => <a key={source.label} href={source.url} target="_blank" rel="noopener noreferrer"><span>{source.label}</span><div><strong>{source.title}</strong><small>{source.detail}</small></div><MoveUpRight size={16} strokeWidth={1.2} /></a>)}</div>
            <p className="culture-context-note">{note.setting}</p>
          </section>
          <section id={`${id}-original`} role="tabpanel" aria-labelledby={`${id}-original-tab`} hidden={reading !== 'original'} className="culture-original">
          <p className="culture-original-caption">原作策划文字 · 保留完整叙事</p>
          {note.transcriptNote && <div className="culture-transcript-note" role="note" aria-label={note.transcriptNote.title}>
            <strong>{note.transcriptNote.title}</strong>
            <p>{note.transcriptNote.text}</p>
            <a href={note.transcriptNote.source.url} target="_blank" rel="noopener noreferrer">{note.transcriptNote.source.title}<MoveUpRight size={13} strokeWidth={1.2} /></a>
          </div>}
          {chapter.id === 1 && (
            <details className="preface-note">
              <summary><span>展卷序</span><ChevronDown size={14} strokeWidth={1.4} /></summary>
              <p>{workPreface}</p>
            </details>
          )}
          <div className="culture-rule"><span>牡丹入画，亦入人间</span></div>
          <p className="culture-lead">{chapter.intro}</p>
          <div className="culture-prose">
            {chapter.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
          <blockquote>{chapter.colophon}</blockquote>
          <div className="culture-source"><span>内容依据</span><p>{chapter.source}。{contentSourceNote}</p></div>
          </section>
          <div className="culture-bottom-mark" aria-hidden="true"><span>花</span><span>事</span></div>
        </div>
      </aside>
    </div>
  );
}
