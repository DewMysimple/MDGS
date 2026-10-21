import { useEffect, useId, useState } from 'react';
import type { CSSProperties } from 'react';

interface Props { enabled: boolean; variant?: 'study' | 'painting' }

/** A small, composited environment; nothing moves the original architecture. */
export default function StudyAtmosphere({ enabled, variant = 'study' }: Props) {
  const prefix = useId().replace(/:/g, '');
  const [visible, setVisible] = useState(!document.hidden);
  const [reduced, setReduced] = useState(matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMedia = () => setReduced(media.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    media.addEventListener('change', updateMedia);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      media.removeEventListener('change', updateMedia);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);
  const active = enabled && !reduced && visible;
  return <svg className={`study-atmosphere study-atmosphere--${variant}${active ? ' is-running' : ''}${enabled && !reduced ? '' : ' is-still'}`}
    viewBox="0 0 1672 941" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${prefix}-petal`} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#f6d3bb" /><stop offset=".32" stopColor="#e8a28b" /><stop offset=".76" stopColor="#b44d48" /><stop offset="1" stopColor="#7b3530" />
      </linearGradient>
      <radialGradient id={`${prefix}-light`}><stop stopColor="#f5c37e" stopOpacity=".12" /><stop offset="1" stopColor="#f5c37e" stopOpacity="0" /></radialGradient>
      <filter id={`${prefix}-smoke`} x="-80%" y="-20%" width="260%" height="160%"><feGaussianBlur stdDeviation="3.1" /></filter>
      <filter id={`${prefix}-near`}><feGaussianBlur stdDeviation=".55" /></filter>
    </defs>
    <ellipse className="study-window-glow" cx="1060" cy="330" rx="380" ry="310" fill={`url(#${prefix}-light)`} />
    <g className="study-incense" fill="none" stroke="#e2ddd0" strokeLinecap="round" filter={`url(#${prefix}-smoke)`}>
      <path className="study-smoke study-smoke--one" d="M260 442 C270 422 245 417 252 398 S282 374 263 355 S231 322 257 300" strokeWidth="5" opacity=".32" />
      <path className="study-smoke study-smoke--two" d="M260 442 C242 428 271 411 262 393 S232 371 248 348 S283 323 272 297" strokeWidth="8" opacity=".15" />
      <path className="study-smoke study-smoke--three" d="M260 441 C275 425 265 412 267 398 S293 380 276 362 S251 346 270 329" strokeWidth="3" opacity=".21" />
    </g>
    {Array.from({ length: 22 }, (_, index) => <circle key={`dust-${index}`} className="study-dust"
      cx={430 + (index * 157) % 790} cy={180 + (index * 83) % 510} r={index % 3 === 0 ? 1.25 : .72} fill="#f7d8a0"
      style={{ '--delay': `${-index * 1.7}s`, '--duration': `${9 + index % 5}s`, '--drift': `${index % 2 ? 13 : -16}px` } as CSSProperties} />)}
    {Array.from({ length: 9 }, (_, index) => <g key={`petal-${index}`} className={`study-petal study-petal--${index}`}
      style={{ '--start-x': `${320 + index * 155}px`, '--end-x': `${160 + index * 155}px`, '--delay': `${-index * 4.1}s`, '--duration': `${24 + (index * 7) % 16}s`, '--turn': `${index % 2 ? 145 : -135}deg` } as CSSProperties}>
      <g transform={`scale(${index % 3 === 0 ? 1.04 : .48 + (index % 3) * .16})`} filter={index % 3 === 0 ? `url(#${prefix}-near)` : undefined}>
        <path d="M-17 -5 C-22 -15 -15 -24 -8 -21 C-3 -28 6 -24 7 -20 C19 -24 26 -13 20 -4 C18 7 7 15 -1 19 C-5 10 -15 8 -17 -5Z" fill={`url(#${prefix}-petal)`} stroke="#ae6454" strokeWidth=".5" />
        <path d="M-1 18 C3 3 0 -6 -8 -20 M-1 10 C-7 2 -12 -5 -15 -12 M1 6 C10 -2 13 -11 14 -17 M2 -1 C7 -8 7 -14 7 -20" fill="none" stroke="#f3c7aa" strokeWidth=".55" opacity=".48" />
        <path d="M-14 -18 C-7 -12 -5 -1 -1 12" fill="none" stroke="#9c4c42" strokeWidth=".6" opacity=".28" />
      </g>
    </g>)}
  </svg>;
}
