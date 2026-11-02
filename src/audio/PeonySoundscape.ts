import type { SoundscapeInput } from './cueMap';

export type SoundscapePlayback = 'off' | 'loading' | 'waiting' | 'playing' | 'paused' | 'error';
export interface SoundscapeState { enabled: boolean; playback: SoundscapePlayback; volume: number }
export const soundscapeFiles = ['home.mp3', 'chapter-1.mp3', 'chapter-2.mp3', 'chapter-3.mp3', 'chapter-4.mp3'] as const;
const volumeKey = 'guose-fanghua:music-volume';
const enabledKey = 'guose-fanghua:music-enabled';
const clamp = (value: number) => Math.min(100, Math.max(0, value));
type Cue = 'unfurl' | 'note' | 'seal';
interface Voice { source: AudioBufferSourceNode; gain: GainNode; chapter: number; started: number; offset: number }
interface Graph {
  context: AudioContext; music: GainNode; master: GainNode;
  voices: Set<Voice>; current: Voice | null;
  effects: Set<AudioBufferSourceNode>; effectBuffers: Map<Cue, AudioBuffer>;
}
function storedVolume() {
  try { const value = localStorage.getItem(volumeKey); return value !== null && Number.isFinite(Number(value)) ? clamp(Number(value)) : 52; }
  catch { return 52; }
}
function storedEnabled() {
  try { return localStorage.getItem(enabledKey) !== 'off'; }
  catch { return true; }
}
function approach(parameter: AudioParam, target: number, time: number, constant: number) {
  if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(time);
  else { const value = parameter.value; parameter.cancelScheduledValues(time); parameter.setValueAtTime(value, time); }
  parameter.setTargetAtTime(target, time, constant);
}
function hold(parameter: AudioParam, time: number) {
  if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(time);
  else { const value = parameter.value; parameter.cancelScheduledValues(time); parameter.setValueAtTime(value, time); }
}
/** Apply a short envelope only to the in-memory loop boundaries; source MP3s
 * remain unchanged. This avoids an abrupt waveform step on a repeated track. */
function softenLoop(buffer: AudioBuffer) {
  const count = Math.min(Math.floor(buffer.length / 4), Math.round(buffer.sampleRate * .04));
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < count; i++) {
      const gain = i / count;
      samples[i] *= gain;
      samples[buffer.length - 1 - i] *= gain;
    }
  }
}

/** Blend the beginning into the end in memory, then loop from the end of that
 * overlap. The original file is untouched and the join has no silent gap. */
function crossfadeHomeLoop(buffer: AudioBuffer): number {
  const count = Math.min(Math.floor(buffer.length / 4), Math.round(buffer.sampleRate * 1.2));
  if (count < 2) return 0;
  const tail = buffer.length - count;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < count; i++) {
      const mix = i / (count - 1);
      samples[tail + i] = samples[tail + i] * (1 - mix) + samples[i] * mix;
    }
  }
  return count / buffer.sampleRate;
}

/** One shared graph for the whole visit. The original file for each scroll is
 * decoded on demand; transitions crossfade, and only one decoded track is cached. */
export class PeonySoundscape {
  private state: SoundscapeState = { enabled: false, playback: 'off', volume: storedVolume() };
  private listeners = new Set<() => void>();
  private graph: Graph | null = null;
  private retired = new Map<Graph, number>();
  private cached: { chapter: number; buffer: AudioBuffer; loopStart: number } | null = null;
  private request: AbortController | null = null;
  private generation = 0;
  private trackVersion = 0;
  private requestedChapter = 0;
  private activity = 0;
  private alive = false;
  private resumeAt: { chapter: number; offset: number } | null = null;
  private input: SoundscapeInput = { phase: 'HOME', chapterId: 1, progress: 0, reading: false, narration: false };
  private cueTimes = new Map<Cue, number>();
  private lastCue = -Infinity;
  private visit = 0;
  private sealedVisit = -1;
  private suppressSealUntil = 0;
  private cueCount = 0;
  private visibility = () => { void this.synchronize(); };
  // Browsers may defer audio until a real gesture. Resume in the event handler
  // itself so the browser can associate it with the visitor's input.
  private gesture = (event: Event) => {
    const graph = this.graph;
    // The sound button handles its own waiting state on click; resuming on
    // pointerdown would otherwise make that same click turn the music off.
    if (this.state.playback === 'waiting' && event.target instanceof Element && event.target.closest('.audio-button')) return;
    if (graph && this.state.enabled && !document.hidden && graph.context.state === 'suspended') {
      void graph.context.resume().catch(() => {});
    }
  };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getState = () => this.state;
  private publish(next: Partial<SoundscapeState>) {
    const state = { ...this.state, ...next };
    if (state.enabled === this.state.enabled && state.playback === this.state.playback && state.volume === this.state.volume) return;
    this.state = state; this.listeners.forEach(listener => listener());
  }
  mount() {
    this.alive = true;
    document.addEventListener('visibilitychange', this.visibility);
    document.addEventListener('pointerdown', this.gesture, true);
    document.addEventListener('keydown', this.gesture, true);
    if (storedEnabled()) void this.enable();
  }
  dispose() {
    this.alive = false; document.removeEventListener('visibilitychange', this.visibility);
    document.removeEventListener('pointerdown', this.gesture, true);
    document.removeEventListener('keydown', this.gesture, true);
    this.release(false); this.cached = null;
    for (const [graph, timer] of this.retired) { window.clearTimeout(timer); this.close(graph); }
    this.retired.clear(); this.publish({ enabled: false, playback: 'off' });
  }
  private chapter() {
    if (this.input.phase === 'HOME' || this.input.phase === 'RETURNING_HOME') return 0;
    return Number.isInteger(this.input.chapterId) && this.input.chapterId >= 1 && this.input.chapterId <= 4 ? this.input.chapterId : 1;
  }
  private clock(graph = this.graph) { return graph?.context.currentTime ?? 0; }
  private voiceOffset(voice: Voice, graph: Graph) {
    const duration = voice.source.buffer?.duration ?? 0;
    if (!duration) return 0;
    const position = voice.offset + Math.max(0, graph.context.currentTime - voice.started);
    const loopStart = voice.source.loopStart;
    return position < duration ? position : loopStart + (position - duration) % (duration - loopStart);
  }
  private close(graph: Graph) {
    this.retired.delete(graph);
    for (const voice of graph.voices) { try { voice.source.stop(); } catch { /* Already ended. */ } voice.source.disconnect(); voice.gain.disconnect(); }
    for (const source of graph.effects) { try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); }
    graph.voices.clear(); graph.effects.clear(); graph.effectBuffers.clear(); graph.music.disconnect(); graph.master.disconnect();
    if (graph.context.state !== 'closed') void graph.context.close().catch(() => {});
  }
  private release(fade: boolean) {
    this.generation++; this.trackVersion++; this.activity++; this.request?.abort(); this.request = null; this.requestedChapter = 0;
    const graph = this.graph; this.graph = null;
    if (!graph) return;
    if (graph.current) this.resumeAt = { chapter: graph.current.chapter, offset: this.voiceOffset(graph.current, graph) };
    if (fade && graph.voices.size && graph.context.state === 'running') {
      approach(graph.master.gain, 0, graph.context.currentTime, .045);
      this.retired.set(graph, window.setTimeout(() => this.close(graph), 260));
    } else this.close(graph);
  }
  setVolume = (value: number) => {
    if (!Number.isFinite(value)) return;
    value = clamp(value); this.publish({ volume: value });
    try { localStorage.setItem(volumeKey, String(value)); } catch { /* Session control remains usable. */ }
    const graph = this.graph;
    if (graph && graph.context.state !== 'closed') approach(graph.master.gain, document.hidden ? 0 : value / 100, graph.context.currentTime, .035);
  };
  toggle = () => {
    if (this.state.playback === 'waiting' && this.graph) {
      void this.graph.context.resume().catch(() => {});
      return;
    }
    const enabled = !this.state.enabled;
    try { localStorage.setItem(enabledKey, enabled ? 'on' : 'off'); } catch { /* Session control remains usable. */ }
    if (!enabled) { this.release(true); this.publish({ enabled: false, playback: 'off' }); }
    else void this.enable();
  };
  private async enable() {
    if (!this.alive) return;
    const generation = ++this.generation;
    this.publish({ enabled: true, playback: 'loading' });
    try {
      // On the desktop this starts immediately; a browser can defer the
      // resume promise until our gesture handler receives the first input.
      const context = new AudioContext();
      const graph: Graph = { context, music: context.createGain(), master: context.createGain(), voices: new Set(), current: null, effects: new Set(), effectBuffers: new Map() };
      this.graph = graph; graph.master.gain.value = 0; graph.music.gain.value = this.input.reading || this.input.narration ? .501187 : 1;
      graph.music.connect(graph.master); graph.master.connect(context.destination);
      this.cueTimes.clear(); this.lastCue = -Infinity; this.suppressSealUntil = 0;
      const resumed = context.resume();
      if (context.state !== 'running') this.publish({ playback: 'waiting' });
      await resumed;
      if (!this.current(generation, graph)) return;
      await this.selectTrack(this.chapter(), graph, generation);
    } catch {
      if (generation !== this.generation || !this.alive) return;
      this.release(false); this.publish({ enabled: false, playback: 'error' });
    }
  }
  private current(generation: number, graph: Graph) { return this.alive && generation === this.generation && this.graph === graph; }
  private async selectTrack(chapter: number, graph: Graph, generation: number) {
    const version = ++this.trackVersion;
    this.request?.abort(); this.request = null; this.requestedChapter = chapter;
    if (graph.current?.chapter === chapter) { await this.synchronize(); return; }
    const request = new AbortController(); this.request = request;
    this.publish({ playback: 'loading' });
    try {
      let buffer = this.cached?.chapter === chapter ? this.cached.buffer : null;
      let loopStart = this.cached?.chapter === chapter ? this.cached.loopStart : 0;
      if (!buffer) {
        const response = await fetch(`${import.meta.env.BASE_URL}audio/${soundscapeFiles[chapter]}`, { signal: request.signal });
        if (!response.ok) throw new Error('Chapter music could not be loaded');
        buffer = await graph.context.decodeAudioData(await response.arrayBuffer());
        if (!(buffer.duration > 1) || !Number.isFinite(buffer.duration)) throw new Error('Invalid chapter music');
        if (!this.current(generation, graph) || version !== this.trackVersion || request.signal.aborted) return;
        if (chapter === 0) loopStart = crossfadeHomeLoop(buffer);
        else softenLoop(buffer);
      }
      if (!this.current(generation, graph) || version !== this.trackVersion || request.signal.aborted || this.chapter() !== chapter) return;
      this.request = null; this.cached = { chapter, buffer, loopStart };
      const now = graph.context.currentTime, start = now + .035, fade = .8;
      for (const previous of graph.voices) {
        hold(previous.gain.gain, now); previous.gain.gain.linearRampToValueAtTime(0, now + fade);
        try { previous.source.stop(now + fade + .02); } catch { /* Already scheduled to stop. */ }
      }
      const source = graph.context.createBufferSource(), gain = graph.context.createGain();
      const offset = this.resumeAt?.chapter === chapter ? this.resumeAt.offset % buffer.duration : 0;
      this.resumeAt = null;
      source.buffer = buffer; source.loop = true; source.loopStart = loopStart; source.loopEnd = buffer.duration;
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.8, start + fade);
      source.connect(gain); gain.connect(graph.music);
      const voice: Voice = { source, gain, chapter, started: start, offset };
      graph.voices.add(voice); graph.current = voice;
      source.onended = () => { graph.voices.delete(voice); source.disconnect(); gain.disconnect(); };
      source.start(start, offset);
      await this.synchronize();
    } catch (error) {
      if (!this.current(generation, graph) || version !== this.trackVersion || request.signal.aborted) return;
      this.release(false); this.publish({ enabled: false, playback: 'error' });
    }
  }
  private async synchronize() {
    const graph = this.graph;
    if (!graph || !this.state.enabled || graph.context.state === 'closed') return;
    const activity = ++this.activity, generation = this.generation, visible = !document.hidden;
    try {
      if (visible) await graph.context.resume();
      else { graph.master.gain.cancelScheduledValues(graph.context.currentTime); graph.master.gain.setValueAtTime(0, graph.context.currentTime); await graph.context.suspend(); }
      if (!this.current(generation, graph) || activity !== this.activity || !graph.current) return;
      if (visible) approach(graph.master.gain, this.state.volume / 100, graph.context.currentTime, .18);
      this.publish({ playback: visible ? 'playing' : 'paused' });
    } catch { if (this.current(generation, graph) && activity === this.activity) this.publish({ playback: 'paused' }); }
  }
  update(input: SoundscapeInput) {
    const previous = this.input;
    this.input = { ...input, progress: Number.isFinite(input.progress) ? Math.min(1, Math.max(0, input.progress)) : 0 };
    if (previous.chapterId !== input.chapterId || previous.phase === 'HOME' && input.phase !== 'HOME') this.visit++;
    if (previous.phase !== 'SCROLL_LOADING' && input.phase === 'SCROLL_LOADING') this.cue('unfurl');
    if (!previous.reading && input.reading) this.cue('note');
    const advance = this.input.progress - previous.progress;
    if (Math.abs(advance) > .035 || previous.chapterId !== input.chapterId) this.suppressSealUntil = this.clock() + 3;
    if (input.phase === 'SCROLL_VIEWER' && previous.phase === 'SCROLL_VIEWER' && previous.chapterId === input.chapterId && this.input.progress >= .9999 && previous.progress < .9999 && advance > 0 && advance < .045 && this.clock() >= this.suppressSealUntil && this.sealedVisit !== this.visit) {
      this.sealedVisit = this.visit; this.cue('seal');
    }
    const graph = this.graph;
    if (!graph || !this.state.enabled) return;
    const wasDucked = previous.reading || previous.narration;
    const isDucked = input.reading || input.narration;
    if (wasDucked !== isDucked) approach(graph.music.gain, isDucked ? .501187 : 1, graph.context.currentTime, isDucked ? .07 : .23);
    const chapter = this.chapter();
    if (chapter !== this.requestedChapter) {
      if (this.resumeAt?.chapter !== chapter) this.resumeAt = null;
      void this.selectTrack(chapter, graph, this.generation);
    }
  }
  cue = (kind: Cue) => {
    const graph = this.graph;
    if (!graph || !this.state.enabled || this.state.playback !== 'playing' || document.hidden || graph.context.state !== 'running') return;
    const now = this.clock(graph);
    if (now - this.lastCue < 1.5 || now - (this.cueTimes.get(kind) ?? -Infinity) < 3 || graph.effects.size >= 2) return;
    this.lastCue = now; this.cueTimes.set(kind, now); this.cueCount++;
    let buffer = graph.effectBuffers.get(kind);
    if (!buffer) {
      const length = Math.round(graph.context.sampleRate * (kind === 'unfurl' ? .85 : .28));
      buffer = graph.context.createBuffer(1, length, graph.context.sampleRate);
      const data = buffer.getChannelData(0); let seed = kind === 'unfurl' ? 71 : kind === 'note' ? 137 : 211, low = 0;
      for (let i = 0; i < length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        low += .12 * (seed / 2147483648 - 1 - low);
        const t = i / graph.context.sampleRate, u = i / (length - 1);
        data[i] = (low * (kind === 'unfurl' ? .04 : .025) + (kind === 'seal' ? Math.sin(2 * Math.PI * 126 * t) * Math.exp(-t * 32) * .021 : 0)) * Math.sin(Math.PI * u) ** 2;
      }
      graph.effectBuffers.set(kind, buffer);
    }
    const source = graph.context.createBufferSource(); source.buffer = buffer; source.connect(graph.master); graph.effects.add(source);
    source.onended = () => { graph.effects.delete(source); source.disconnect(); }; source.start();
  };
  snapshot = () => {
    const graph = this.graph;
    return { ...this.state, clock: this.clock(), contextState: graph?.context.state ?? 'closed',
      desiredChapter: this.chapter(), requestedChapter: this.requestedChapter, activeChapter: graph?.current?.chapter ?? null,
      sourceCount: graph?.voices.size ?? 0, loopDurations: [...(graph?.voices ?? [])].map(voice => voice.source.buffer?.duration),
      levels: [...(graph?.voices ?? [])].map(voice => voice.gain.gain.value), musicGain: graph?.music.gain.value ?? 1,
      reading: this.input.reading, narration: this.input.narration, effects: graph?.effects.size ?? 0, cuesPlayed: this.cueCount,
      decodedBuffers: this.cached ? 1 : 0, retiredGraphs: this.retired.size,
      decodedBytes: this.cached ? this.cached.buffer.length * this.cached.buffer.numberOfChannels * 4 : 0 };
  };
}
