import { soundRegion, type SoundRegion, type SoundscapeInput } from './cueMap';

export type SoundscapePlayback = 'off' | 'loading' | 'playing' | 'paused' | 'error';
export interface SoundscapeState { enabled: boolean; playback: SoundscapePlayback; volume: number }
export const soundscapeFiles = ['peony-v3-strings.mp3', 'peony-v3-breath.mp3', 'peony-v3-atmosphere.mp3'] as const;
const volumeKey = 'guose-fanghua:music-volume';
const clamp = (value: number) => Math.min(100, Math.max(0, value));
// The authored files retain conservative peaks. Calibration makes the normal
// regional mix audible at a comfortable user volume; even maximum region
// coefficients leave >3 dB headroom, including the quiet incidental cues.
const layerCalibration = [2, 2, 1] as const;
type Cue = 'unfurl' | 'note' | 'seal';
interface Graph {
  context: AudioContext; sources: AudioBufferSourceNode[]; layers: GainNode[];
  filter: BiquadFilterNode; music: GainNode; master: GainNode; epoch: number;
  effects: Set<AudioBufferSourceNode>; effectBuffers: Map<Cue, AudioBuffer>;
}
function storedVolume() {
  try { const value = localStorage.getItem(volumeKey); return value !== null && Number.isFinite(Number(value)) ? clamp(Number(value)) : 52; }
  catch { return 52; }
}
function approach(parameter: AudioParam, target: number, time: number, constant: number) {
  if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(time);
  else { const value = parameter.value; parameter.cancelScheduledValues(time); parameter.setValueAtTime(value, time); }
  parameter.setTargetAtTime(target, time, constant);
}

/** One gesture-enabled, site-wide audio clock. Routes change a mix, never a song
 * position. All instruments, atmosphere and short cues are original synthesis.
 * No graph or network request exists before the visitor explicitly enables it. */
export class PeonySoundscape {
  private state: SoundscapeState = { enabled: false, playback: 'off', volume: storedVolume() };
  private listeners = new Set<() => void>();
  private graph: Graph | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private retired = new Map<Graph, number>();
  private request: AbortController | null = null;
  private generation = 0;
  private activity = 0;
  private alive = false;
  private offset = 0;
  private input: SoundscapeInput = { phase: 'HOME', chapterId: 1, progress: 0, reading: false };
  private applied: SoundRegion | null = null;
  private pendingRegion = '';
  private mixTimer = 0;
  private cueTimes = new Map<Cue, number>();
  private lastCue = -Infinity;
  private visit = 0;
  private sealedVisit = -1;
  private suppressSealUntil = 0;
  private cueCount = 0;
  private visibility = () => { void this.synchronize(); };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getState = () => this.state;
  private publish(next: Partial<SoundscapeState>) {
    const state = { ...this.state, ...next };
    if (state.enabled === this.state.enabled && state.playback === this.state.playback && state.volume === this.state.volume) return;
    this.state = state; this.listeners.forEach(listener => listener());
  }
  mount() { this.alive = true; document.addEventListener('visibilitychange', this.visibility); }
  dispose() {
    this.alive = false; document.removeEventListener('visibilitychange', this.visibility);
    this.release(false); this.buffers.clear();
    for (const [graph, timer] of this.retired) { window.clearTimeout(timer); this.close(graph); }
    this.retired.clear(); this.publish({ enabled: false, playback: 'off' });
  }
  private clock(graph = this.graph) { return graph?.sources.length ? Math.max(0, graph.context.currentTime - graph.epoch) : this.offset; }
  private close(graph: Graph) {
    this.retired.delete(graph);
    for (const source of [...graph.sources, ...graph.effects]) { try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); }
    graph.layers.forEach(layer => layer.disconnect()); graph.filter.disconnect(); graph.music.disconnect(); graph.master.disconnect();
    graph.effects.clear(); graph.effectBuffers.clear();
    if (graph.context.state !== 'closed') void graph.context.close().catch(() => {});
  }
  private release(fade: boolean) {
    this.generation++; this.activity++; this.request?.abort(); this.request = null;
    window.clearTimeout(this.mixTimer); this.mixTimer = 0; this.pendingRegion = '';
    const graph = this.graph; this.graph = null; this.applied = null;
    if (!graph) return;
    this.offset = this.clock(graph);
    if (fade && graph.sources.length && graph.context.state === 'running') {
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
    if (this.state.enabled) { this.release(true); this.publish({ enabled: false, playback: 'off' }); }
    else void this.enable();
  };
  private async enable() {
    if (!this.alive) return;
    const generation = ++this.generation;
    this.publish({ enabled: true, playback: 'loading' });
    const request = new AbortController(); this.request = request;
    let context: AudioContext | null = null;
    try {
      // This synchronous construction/resume remains inside the click gesture.
      context = new AudioContext();
      const graph: Graph = { context, sources: [], layers: [], filter: context.createBiquadFilter(), music: context.createGain(), master: context.createGain(), epoch: context.currentTime - this.offset, effects: new Set(), effectBuffers: new Map() };
      this.graph = graph; graph.master.gain.value = 0;
      graph.filter.type = 'lowpass'; graph.filter.Q.value = .5;
      graph.filter.connect(graph.music); graph.music.connect(graph.master); graph.master.connect(context.destination);
      await context.resume();
      if (!this.current(generation, graph)) return;
      const buffers = await Promise.all(soundscapeFiles.map(async file => {
        const cached = this.buffers.get(file); if (cached) return cached;
        const response = await fetch(`${import.meta.env.BASE_URL}audio/${file}`, { signal: request.signal });
        if (!response.ok) throw new Error('The original soundscape could not be loaded.');
        const buffer = await context!.decodeAudioData(await response.arrayBuffer());
        if (this.current(generation, graph)) this.buffers.set(file, buffer);
        return buffer;
      }));
      if (!this.current(generation, graph)) return;
      if (buffers.some((buffer, i) => Math.abs(buffer.duration - (i === 2 ? 24 : 160)) > .01)) throw new Error('Soundscape stems have inconsistent durations.');
      this.request = null;
      const when = context.currentTime + .055; graph.epoch = when - this.offset;
      buffers.forEach((buffer, index) => {
        const source = context!.createBufferSource(), gain = context!.createGain();
        source.buffer = buffer; source.loop = true; source.loopEnd = buffer.duration; gain.gain.value = 0;
        source.connect(gain); gain.connect(index === 2 ? graph.master : graph.filter);
        graph.sources.push(source); graph.layers.push(gain);
        source.start(when, this.offset % buffer.duration);
      });
      this.applyMix(soundRegion(this.input), true);
      await this.synchronize();
    } catch {
      if (generation !== this.generation || !this.alive) return;
      this.release(false); this.publish({ enabled: false, playback: 'error' });
    }
  }
  private current(generation: number, graph: Graph) { return this.alive && generation === this.generation && this.graph === graph; }
  private async synchronize() {
    const graph = this.graph;
    if (!graph || !this.state.enabled || graph.context.state === 'closed') return;
    const activity = ++this.activity, generation = this.generation;
    const visible = !document.hidden;
    try {
      if (visible) await graph.context.resume();
      else { graph.master.gain.cancelScheduledValues(graph.context.currentTime); graph.master.gain.setValueAtTime(0, graph.context.currentTime); await graph.context.suspend(); }
      if (!this.current(generation, graph) || activity !== this.activity) return;
      if (!graph.sources.length) return;
      if (visible) approach(graph.master.gain, this.state.volume / 100, graph.context.currentTime, .18);
      this.publish({ playback: visible ? 'playing' : 'paused' });
    } catch { if (this.current(generation, graph) && activity === this.activity) this.publish({ playback: 'paused' }); }
  }
  update(input: SoundscapeInput) {
    const previous = this.input; this.input = { ...input, progress: Number.isFinite(input.progress) ? Math.min(1, Math.max(0, input.progress)) : 0 };
    if (previous.chapterId !== input.chapterId || previous.phase === 'HOME' && input.phase !== 'HOME') this.visit++;
    if (previous.phase !== 'SCROLL_LOADING' && input.phase === 'SCROLL_LOADING') this.cue('unfurl');
    if (!previous.reading && input.reading) this.cue('note');
    const smallAdvance = this.input.progress - previous.progress;
    // The visual controller smooths large seeks into small later increments.
    // Remember a detected jump through that settling interval, so its final
    // tiny increment cannot masquerade as continuously arriving at the end.
    if (Math.abs(smallAdvance) > .035 || previous.chapterId !== input.chapterId) this.suppressSealUntil = this.clock() + 3;
    if (input.phase === 'SCROLL_VIEWER' && previous.phase === 'SCROLL_VIEWER' && previous.chapterId === input.chapterId && this.input.progress >= .9999 && previous.progress < .9999 && smallAdvance > 0 && smallAdvance < .045 && this.clock() >= this.suppressSealUntil && this.sealedVisit !== this.visit) {
      this.sealedVisit = this.visit; this.cue('seal');
    }
    const graph = this.graph;
    if (!graph || !graph.sources.length) return;
    if (previous.reading !== input.reading) approach(graph.music.gain, input.reading ? .501187 : 1, graph.context.currentTime, input.reading ? .07 : .23);
    const region = soundRegion(this.input);
    if (region.name === this.applied?.name) { window.clearTimeout(this.mixTimer); this.pendingRegion = ''; return; }
    if (region.name === this.pendingRegion) return;
    window.clearTimeout(this.mixTimer); this.pendingRegion = region.name;
    // Coalesce rapid/reverse seeks. This sets only the final current mix; it
    // never walks skipped nodes or queues a sequence of incidental sounds.
    this.mixTimer = window.setTimeout(() => {
      this.mixTimer = 0; this.pendingRegion = '';
      if (this.graph === graph) this.applyMix(soundRegion(this.input));
    }, input.phase === 'SCROLL_VIEWER' ? 350 : 0);
  }
  private applyMix(region: SoundRegion, initial = false) {
    const graph = this.graph; if (!graph || graph.context.state === 'closed') return;
    this.applied = region;
    const time = graph.context.currentTime;
    const constant = region.name === '盛景渐远' ? .55 : .38;
    graph.layers.forEach((layer, index) => approach(layer.gain, region.levels[index] * layerCalibration[index], time, constant));
    approach(graph.filter.frequency, region.cutoff, time, .65);
    if (initial) graph.music.gain.value = this.input.reading ? .501187 : 1;
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
    return { ...this.state, clock: this.clock(), contextState: graph?.context.state ?? 'closed', sourceCount: graph?.sources.length ?? 0,
      loopDurations: graph?.sources.map(source => source.buffer?.duration) ?? [], zone: this.applied?.name ?? '',
      targetLevels: this.applied?.levels.map((level, index) => level * layerCalibration[index]) ?? [], levels: graph?.layers.map(layer => layer.gain.value) ?? [],
      musicGain: graph?.music.gain.value ?? 1, reading: this.input.reading, sourceEpoch: graph?.epoch ?? null,
      effects: graph?.effects.size ?? 0, cuesPlayed: this.cueCount, decodedBuffers: this.buffers.size, retiredGraphs: this.retired.size,
      decodedBytes: [...this.buffers.values()].reduce((sum, buffer) => sum + buffer.length * buffer.numberOfChannels * 4, 0) };
  };
}
