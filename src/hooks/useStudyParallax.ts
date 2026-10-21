import { useEffect, useRef, useState } from 'react';

/** One compositor clock; pointer and slow breathing affect each depth plane differently. */
export function useStudyParallax(enabled: boolean) {
  const stage = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, previous = 0, elapsed = 0, x = 0, y = 0;
    const reset = () => {
      const node = stage.current;
      node?.style.setProperty('--look-x', '0'); node?.style.setProperty('--look-y', '0');
      node?.style.setProperty('--breath', '0');
    };
    const draw = (now: number) => {
      frame = 0;
      const dt = previous ? Math.min(50, now - previous) : 16; previous = now; elapsed += dt;
      x += (pointer.current.x - x) * (1 - Math.exp(-dt / 110));
      y += (pointer.current.y - y) * (1 - Math.exp(-dt / 110));
      stage.current?.style.setProperty('--look-x', x.toFixed(4));
      stage.current?.style.setProperty('--look-y', y.toFixed(4));
      stage.current?.style.setProperty('--breath', (Math.sin(elapsed / 7400) * .17).toFixed(4));
      frame = requestAnimationFrame(draw);
    };
    const update = () => {
      cancelAnimationFrame(frame); frame = 0; previous = 0;
      const run = enabled && !media.matches && !document.hidden;
      setActive(run);
      if (run) frame = requestAnimationFrame(draw);
      else { pointer.current = { x: 0, y: 0 }; reset(); }
    };
    update();
    document.addEventListener('visibilitychange', update); media.addEventListener('change', update);
    return () => { cancelAnimationFrame(frame); reset(); document.removeEventListener('visibilitychange', update); media.removeEventListener('change', update); };
  }, [enabled]);
  return { stage, active, onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active || event.pointerType === 'touch') return;
    const box = event.currentTarget.getBoundingClientRect();
    pointer.current = { x: Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1)), y: Math.max(-1, Math.min(1, (event.clientY - box.top) / box.height * 2 - 1)) };
  }, onPointerLeave: () => { pointer.current = { x: 0, y: 0 }; } };
}
