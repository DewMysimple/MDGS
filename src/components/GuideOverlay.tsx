import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './guide-overlay.css';

export interface GuideOverlayStep {
  selector: string;
  title: string;
  description: string;
}

interface Props {
  step: GuideOverlayStep;
  stepIndex: number;
  stepCount: number;
  onAdvance: () => void;
}

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
  cardX: number;
  cardY: number;
  cardWidth: number;
}

const INSET = 14;
const GAP = 18;
const CARD_HEIGHT = 188;
const TARGET_PADDING = 8;

function clamp(value: number, low: number, high: number) {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

function measureTarget(target: HTMLElement | null, cardHeight = CARD_HEIGHT): { geometry: Geometry | null; shouldReveal: boolean } {
  const unavailable = { geometry: null, shouldReveal: false };
  if (!target || !target.isConnected || target.getClientRects().length === 0) return unavailable;
  const bounds = target.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  if (bounds.width < 1 || bounds.height < 1 || viewportWidth < 1 || viewportHeight < 1) return unavailable;
  let clipLeft = 0, clipTop = 0, clipRight = viewportWidth, clipBottom = viewportHeight;
  let canReveal = bounds.left < 0 || bounds.top < 0 || bounds.right > viewportWidth || bounds.bottom > viewportHeight;
  for (let ancestor: HTMLElement | null = target; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (ancestor.hasAttribute('inert') || ancestor.hidden || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return unavailable;
    if (ancestor === target) continue;
    const clipX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
    const clipY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
    if (!clipX && !clipY) continue;
    const rect = ancestor.getBoundingClientRect();
    const left = rect.left + ancestor.clientLeft;
    const top = rect.top + ancestor.clientTop;
    const right = left + ancestor.clientWidth;
    const bottom = top + ancestor.clientHeight;
    if (clipX) {
      clipLeft = Math.max(clipLeft, left);
      clipRight = Math.min(clipRight, right);
      if (style.overflowX !== 'clip' && (bounds.left < left || bounds.right > right)) canReveal = true;
    }
    if (clipY) {
      clipTop = Math.max(clipTop, top);
      clipBottom = Math.min(clipBottom, bottom);
      if (style.overflowY !== 'clip' && (bounds.top < top || bounds.bottom > bottom)) canReveal = true;
    }
  }
  const visibleLeft = Math.max(bounds.left, clipLeft);
  const visibleTop = Math.max(bounds.top, clipTop);
  const visibleRight = Math.min(bounds.right, clipRight);
  const visibleBottom = Math.min(bounds.bottom, clipBottom);
  if (visibleRight - visibleLeft < 1 || visibleBottom - visibleTop < 1) return { geometry: null, shouldReveal: canReveal };
  const left = Math.max(clipLeft, bounds.left - TARGET_PADDING, 4);
  const top = Math.max(clipTop, bounds.top - TARGET_PADDING, 4);
  const right = Math.min(clipRight, bounds.right + TARGET_PADDING, viewportWidth - 4);
  const bottom = Math.min(clipBottom, bounds.bottom + TARGET_PADDING, viewportHeight - 4);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  if (width < 1 || height < 1) return { geometry: null, shouldReveal: canReveal };
  const cardWidth = Math.min(344, Math.max(0, viewportWidth - INSET * 2));
  const cardXCentered = clamp(left + width / 2 - cardWidth / 2, INSET, viewportWidth - cardWidth - INSET);
  const cardYCentered = clamp(top + height / 2 - cardHeight / 2, INSET, viewportHeight - cardHeight - INSET);
  const candidates = [
    { x: cardXCentered, y: bottom + GAP, fits: viewportHeight - bottom - GAP - INSET >= cardHeight },
    { x: cardXCentered, y: top - GAP - cardHeight, fits: top - GAP - INSET >= cardHeight },
    { x: right + GAP, y: cardYCentered, fits: viewportWidth - right - GAP - INSET >= cardWidth },
    { x: left - GAP - cardWidth, y: cardYCentered, fits: left - GAP - INSET >= cardWidth },
  ];
  const placement = candidates.find(candidate => candidate.fits) ?? candidates[0];
  return { geometry: {
    x: left, y: top, width, height,
    cardX: clamp(placement.x, INSET, viewportWidth - cardWidth - INSET),
    cardY: clamp(placement.y, INSET, viewportHeight - cardHeight - INSET),
    cardWidth,
  }, shouldReveal: canReveal };
}

function sameGeometry(a: Geometry | null, b: Geometry | null) {
  return a === b || (!!a && !!b && (Object.keys(a) as (keyof Geometry)[]).every(key => a[key] === b[key]));
}

/** Draws the guide in the document's active fullscreen tree, without activating the highlighted control. */
export default function GuideOverlay({ step, stepIndex, stepCount, onAdvance }: Props) {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [portalTarget, setPortalTarget] = useState<Element>(() => document.fullscreenElement ?? document.body);
  const dialog = useRef<HTMLDivElement>(null);
  const advanceRef = useRef(onAdvance);
  const canAdvanceRef = useRef(false);
  advanceRef.current = onAdvance;
  canAdvanceRef.current = !!geometry || unavailable;

  useEffect(() => {
    const updateFullscreen = () => setPortalTarget(document.fullscreenElement ?? document.body);
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  useLayoutEffect(() => {
    let missingTimer: ReturnType<typeof setTimeout> | undefined;
    let missingReported = false;
    let observed: Element | null = null;
    let lastRevealAt = 0;
    let resize: ResizeObserver;
    const attributes = new MutationObserver(() => update());
    const update = () => {
      let target: HTMLElement | null = null;
      try { target = document.querySelector<HTMLElement>(step.selector); } catch { /* Invalid selectors are treated as missing. */ }
      if (target !== observed) {
        if (observed) resize.unobserve(observed);
        attributes.disconnect();
        observed = target;
        if (observed) {
          resize.observe(observed);
          attributes.observe(observed, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
        }
      }
      const cardHeight = dialog.current?.offsetHeight ?? CARD_HEIGHT;
      let result = measureTarget(target, cardHeight);
      if (result.shouldReveal && target && Date.now() - lastRevealAt > 3000) {
        lastRevealAt = Date.now();
        target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
        result = measureTarget(target, cardHeight);
      }
      const next = result.geometry;
      setGeometry(previous => sameGeometry(previous, next) ? previous : next);
      if (next) {
        if (missingTimer) clearTimeout(missingTimer);
        missingTimer = undefined;
        if (missingReported) { missingReported = false; setUnavailable(false); }
      } else if (!missingTimer && !missingReported) {
        missingTimer = setTimeout(() => {
          missingTimer = undefined;
          let current: HTMLElement | null = null;
          try { current = document.querySelector<HTMLElement>(step.selector); } catch { /* Invalid selectors stay unavailable. */ }
          if (!measureTarget(current).geometry) { missingReported = true; setUnavailable(true); }
        }, 3500);
      }
    };
    setUnavailable(false);
    resize = new ResizeObserver(update);
    if (dialog.current) resize.observe(dialog.current);
    update();
    const mutation = new MutationObserver(() => { if (!observed?.isConnected) update(); });
    mutation.observe(document.body, { subtree: true, childList: true });
    // ResizeObserver does not report movement caused by transforms or entrance transitions.
    const movementPoll = setInterval(update, 100);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('fullscreenchange', update);
    return () => {
      if (missingTimer) clearTimeout(missingTimer);
      clearInterval(movementPoll);
      mutation.disconnect();
      attributes.disconnect();
      resize.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('fullscreenchange', update);
    };
  }, [step.selector, portalTarget]);

  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat && !event.isComposing && canAdvanceRef.current) advanceRef.current();
    };
    const stopWheel = (event: WheelEvent) => { event.preventDefault(); event.stopImmediatePropagation(); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', stopWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wheel', stopWheel, true);
      if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(<div className="guide-overlay" onClick={event => { event.preventDefault(); event.stopPropagation(); if (canAdvanceRef.current) advanceRef.current(); }}
    onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}
    onPointerUp={event => { event.preventDefault(); event.stopPropagation(); }}>
    <svg className="guide-shade" width="100%" height="100%" aria-hidden="true">
      <defs><mask id="guide-cutout"><rect width="100%" height="100%" fill="white" />{geometry && <rect x={geometry.x} y={geometry.y} width={geometry.width} height={geometry.height} rx="10" fill="black" />}</mask></defs>
      <rect width="100%" height="100%" fill="rgba(27, 27, 22, .68)" mask="url(#guide-cutout)" />
    </svg>
    {geometry && <div className="guide-halo" aria-hidden="true" style={{ left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height }} />}
    <div ref={dialog} className="guide-card" role="dialog" aria-modal="true" aria-labelledby="guide-title" aria-describedby="guide-description" tabIndex={-1}
      style={geometry ? { left: geometry.cardX, top: geometry.cardY, width: geometry.cardWidth } : undefined}>
      <div aria-live="polite" aria-atomic="true">
        <div className="guide-card-top"><span>观卷指引</span><span className="guide-count">{String(stepIndex + 1).padStart(2, '0')} <i>/</i> {String(stepCount).padStart(2, '0')}</span></div>
        <h2 id="guide-title">{step.title}</h2>
        <p id="guide-description">{step.description}</p>
        {unavailable && <p className="guide-unavailable">当前控件暂不可见，请点击屏幕或按任意键继续。</p>}
      </div>
      <div className="guide-card-bottom"><span>点击屏幕或按任意键继续</span><span aria-hidden="true">→</span></div>
    </div>
  </div>, portalTarget);
}
