import { useEffect, useRef } from 'react';
import { BookOpen, ChevronDown, X } from 'lucide-react';
import { contentSourceNote, workPreface } from '../data/chapters';

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
}

export default function CulturePanel({ chapter, open, onClose }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex="0"]',
      ) ?? []);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
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
      previousFocus?.focus();
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
          <div className="culture-bottom-mark" aria-hidden="true"><span>花</span><span>事</span></div>
        </div>
      </aside>
    </div>
  );
}
