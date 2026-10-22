const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Wheel speed is the percentage of a complete scroll travelled per 100 CSS pixels. */
export function wheelProgress(deltaX: number, deltaY: number, deltaMode: number, height: number, speed = 0.5) {
  const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  if (!Number.isFinite(delta) || !Number.isFinite(speed)) return 0;
  const pixels = delta * (deltaMode === 1 ? 16 : deltaMode === 2 ? Math.max(1, height) : 1);
  // Wheel drivers can deliver a whole page (or a large momentum tail) in one event.
  // Preserve fine trackpad input, but do not turn a single event into a scene skip.
  return clamp(pixels, -160, 160) * clamp(speed, 0.1, 2) / 10000;
}

export function nudgedTarget(position: number, target: number, delta: number) {
  if (!Number.isFinite(delta)) return target;
  // Reversing a gesture should immediately reverse the camera instead of first
  // consuming motion queued in the other direction. Bound how much can queue up.
  const origin = (target - position) * delta < 0 ? position : target;
  return clamp(origin + delta, Math.max(0, position - 0.06), Math.min(1, position + 0.06));
}

export function smoothProgress(position: number, target: number, elapsedSeconds: number, smoothingMs: number) {
  const duration = clamp(Number.isFinite(smoothingMs) ? smoothingMs : 180, 60, 500) / 1000;
  const value = position + (target - position) * -Math.expm1(-Math.max(0, elapsedSeconds) / duration);
  return Math.abs(target - value) < 0.000005 ? target : value;
}

/** Integrate an exponentially decaying drag velocity, independent of display refresh rate. */
export function dragGlide(velocity: number, elapsedSeconds: number) {
  const decay = Math.exp(-8 * Math.max(0, elapsedSeconds));
  return { distance: velocity * (1 - decay) / 8, velocity: velocity * decay };
}
