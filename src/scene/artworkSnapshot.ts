import { activeSourceEdition } from '../data/sourceEdition';

/** A runtime copy of an actually drawn source camera gate, without DOM ink. */
export interface ArtworkSnapshot {
  readonly src: string;
  readonly chapterId: number;
  readonly sourceRevision: string;
  readonly progress: number;
  readonly sourceFrame: number;
  readonly width: number;
  readonly height: number;
}
interface Lifetime { references: number; ownerReleased: boolean; revoked: boolean }
const lifetimes = new WeakMap<ArtworkSnapshot, Lifetime>();

export function createArtworkSnapshot(blob: Blob, metadata: Omit<ArtworkSnapshot, 'src'>): ArtworkSnapshot {
  const snapshot: ArtworkSnapshot = Object.freeze({ ...metadata, src: URL.createObjectURL(blob) });
  lifetimes.set(snapshot, { references: 1, ownerReleased: false, revoked: false });
  return snapshot;
}
function decrement(snapshot: ArtworkSnapshot, lifetime: Lifetime) {
  lifetime.references--;
  if (lifetime.references === 0 && !lifetime.revoked) {
    lifetime.revoked = true;
    URL.revokeObjectURL(snapshot.src);
  }
}
/** Cache owns the initial reference. Call once on replacement/unmount. */
export function releaseArtworkSnapshot(snapshot: ArtworkSnapshot | null | undefined) {
  if (!snapshot) return;
  const lifetime = lifetimes.get(snapshot);
  if (!lifetime || lifetime.ownerReleased) return;
  lifetime.ownerReleased = true;
  decrement(snapshot, lifetime);
}
/** Visible loading/image consumers keep a URL alive after cache replacement. */
export function retainArtworkSnapshot(snapshot: ArtworkSnapshot): () => void {
  const lifetime = lifetimes.get(snapshot);
  if (!lifetime || lifetime.revoked) return () => {};
  lifetime.references++;
  let released = false;
  return () => { if (!released) { released = true; decrement(snapshot, lifetime); } };
}
export function matchesArtworkSnapshot(snapshot: ArtworkSnapshot | null | undefined, chapterId: number, progress: number): snapshot is ArtworkSnapshot {
  return !!snapshot && !!snapshot.src && snapshot.chapterId === chapterId && snapshot.sourceRevision === activeSourceEdition
    && Number.isFinite(progress) && Math.abs(snapshot.progress - progress) <= 1e-6
    && snapshot.width > 0 && snapshot.height > 0 && !lifetimes.get(snapshot)?.revoked;
}
