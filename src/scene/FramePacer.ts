export type FrameRateLimit = 30 | 60;

/** A display-rate gate whose deadlines stay on one clock grid. */
export class FramePacer {
  private limit: FrameRateLimit = 30;
  private nextFrameTime?: number;
  private previousFrameTime?: number;
  private previousObservedTime?: number;
  private acceptedElapsed = 0;

  constructor(limit: FrameRateLimit = 30) { this.setLimit(limit); }

  get intervalMs() { return 1000 / this.limit; }

  /** Elapsed grid time for the accepted frame, including any missed slots. */
  get elapsedMs() { return this.acceptedElapsed; }

  /** A caller can sleep until shortly before this delay, then request RAF. */
  timeUntilDue(now: number): number {
    if (!Number.isFinite(now) || now < 0 || this.nextFrameTime === undefined
      || (this.previousObservedTime !== undefined && now < this.previousObservedTime)) return 0;
    return Math.max(0, this.nextFrameTime - now - .5);
  }

  setLimit(limit: FrameRateLimit) {
    const next = limit === 60 ? 60 : 30;
    if (this.limit === next) return;
    this.limit = next;
    this.reset();
  }

  reset() {
    this.nextFrameTime = undefined;
    this.previousFrameTime = undefined;
    this.previousObservedTime = undefined;
    this.acceptedElapsed = 0;
  }

  shouldRender(now: number, force = false): boolean {
    if (!Number.isFinite(now) || now < 0) { this.reset(); return false; }
    if (this.previousObservedTime !== undefined && now < this.previousObservedTime) this.reset();
    this.previousObservedTime = now;
    const interval = this.intervalMs;
    if (force || this.nextFrameTime === undefined) {
      this.acceptedElapsed = this.previousFrameTime === undefined ? 0 : Math.max(0, now - this.previousFrameTime);
      this.previousFrameTime = now;
      this.nextFrameTime = now + interval;
      return true;
    }
    // RAF timestamps can land just before 1000/30 on a 60 Hz display. Using
    // now+interval on every draw accumulates that rounding into a 20 Hz gate.
    if (now + .5 < this.nextFrameTime) return false;
    const missedSlots = Math.max(0, Math.floor((now - this.nextFrameTime + .5) / interval));
    const frameTime = this.nextFrameTime + missedSlots * interval;
    this.acceptedElapsed = Math.max(0, frameTime - (this.previousFrameTime ?? frameTime));
    this.previousFrameTime = frameTime;
    this.nextFrameTime = frameTime + interval;
    return true;
  }
}
