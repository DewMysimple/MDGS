/** Recorder-only observer. PCM order is native process order, not a mutable
 * worklet-global frame label. Every native label remains independently checked.
 * No PCM insertion, removal, sorting, de-duplication or resampling occurs. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';

const processor = `
class ExhibitionTourTap extends AudioWorkletProcessor {
  constructor() {
    super(); this.samples = new Float32Array(8192); this.count = 0;
    this.start = 0; this.tail = false; this.processSeq = 0; this.processedFrames = 0;
    this.clockObservations = [];
    this.packetSeq = 0; this.portMessageSeq = 0; this.anomalySeq = 0;
    this.bitsBuffer = new ArrayBuffer(4); this.float = new Float32Array(this.bitsBuffer);
    this.bits = new Uint32Array(this.bitsBuffer); this.previousQuantum = null;
    this.pendingNeighbor = null;
    this.port.onmessage = event => {
      if (event.data === 'tail') { this.flush(); this.tail = true; this.send({ tailReady: true }); }
    };
  }
  send(data, transfer = []) {
    this.port.postMessage({ ...data, portMessageSeq: ++this.portMessageSeq }, transfer);
  }
  fingerprint(channels, frames) {
    let hash = 2166136261;
    for (let i = 0; i < frames; i++) {
      this.float[0] = channels[0]?.[i] ?? 0; hash = Math.imul(hash ^ this.bits[0], 16777619);
      this.float[0] = channels[1]?.[i] ?? channels[0]?.[i] ?? 0; hash = Math.imul(hash ^ this.bits[0], 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
  flush() {
    if (!this.count) return;
    const samples = this.count === 4096 ? this.samples : this.samples.slice(0, this.count * 2);
    this.send({ packetSeq: ++this.packetSeq, startFrame: this.start, frames: this.count,
      firstProcessSeq: this.firstProcessSeq, lastProcessSeq: this.lastProcessSeq,
      firstQuantumOffset: this.firstQuantumOffset, lastQuantumOffset: this.lastQuantumOffset,
      nativeStartFrame: this.nativeStartFrame, clockObservations: this.clockObservations,
      rate: sampleRate, bytes: samples.buffer }, [samples.buffer]);
    this.samples = new Float32Array(8192); this.count = 0; this.clockObservations = [];
  }
  process(inputs, outputs) {
    const channels = inputs[0], frames = outputs[0][0].length;
    const quantum = { processSeq: ++this.processSeq, counterFrame: this.processedFrames,
      currentFrame, currentTime, frames,
      fingerprint: this.fingerprint(channels, frames) };
    this.clockObservations.push(quantum);
    if (this.pendingNeighbor !== null) {
      this.send({ discontinuityNeighbor: { id: this.pendingNeighbor, next: quantum } });
      this.pendingNeighbor = null;
    }
    if (this.expected !== undefined && currentFrame !== this.expected) {
      const id = ++this.anomalySeq;
      this.send({ discontinuity: { id, expected: this.expected, actual: currentFrame,
        deltaFrames: currentFrame - this.expected, quantum: frames,
        previous: this.previousQuantum, current: quantum, next: null } });
      this.pendingNeighbor = id;
    }
    this.expected = currentFrame + frames;
    for (let i = 0; i < frames; i++) {
      if (!this.count) {
        this.start = this.processedFrames + i; this.nativeStartFrame = currentFrame + i;
        this.firstProcessSeq = this.processSeq; this.firstQuantumOffset = i;
        if (!this.clockObservations.length) this.clockObservations.push(quantum);
      }
      this.lastProcessSeq = this.processSeq; this.lastQuantumOffset = i;
      this.samples[this.count * 2] = channels[0]?.[i] ?? 0;
      this.samples[this.count * 2 + 1] = channels[1]?.[i] ?? channels[0]?.[i] ?? 0;
      this.count++; if (this.count === 4096) this.flush();
    }
    this.processedFrames += frames; this.previousQuantum = quantum;
    if (this.tail) this.flush();
    return true;
  }
}
registerProcessor('mdgs-exhibition-tour-tap', ExhibitionTourTap);
`;

/** Inspect every native label against actual process-count progression.
 * A completed frozen-tag run must hold one identical native label while
 * actual process frames advance, then recover to the same stable anchor.
 * This is a structural check, not a frame-error tolerance. */
export function inspectNativeFrameLabels(trace) {
  const issues = [], counts = new Map();
  let expectedCounter = 0;
  trace.forEach((q, index) => {
    if (q.processSeq !== index + 1 || q.counterFrame !== expectedCounter || !Number.isInteger(q.frames) || q.frames <= 0 || !Number.isInteger(q.currentFrame) || q.currentFrame < 0)
      issues.push({ kind: 'invalid-process-clock-trace', index, expectedCounter, quantum: q });
    expectedCounter = q.counterFrame + q.frames;
    const offset = q.currentFrame - q.counterFrame;
    counts.set(offset, (counts.get(offset) ?? 0) + 1);
  });
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const anchorOffset = ranked[0]?.[0];
  if (ranked.length === 0 || ranked.length > 1 && ranked[0][1] === ranked[1][1])
    issues.push({ kind: 'ambiguous-native-anchor', offsets: ranked });
  let stableRun = 0, longestStableRun = 0;
  const frozenTagRuns = [], stales = [];
  for (let index = 0; index < trace.length;) {
    const q = trace[index];
    const offset = q.currentFrame - q.counterFrame;
    if (offset === anchorOffset) { stableRun++; longestStableRun = Math.max(longestStableRun, stableRun); index++; continue; }
    stableRun = 0;
    const firstIndex = index, previous = trace[index - 1], heldFrame = q.currentFrame;
    const frozen = [];
    while (index < trace.length && trace[index].currentFrame === heldFrame
      && trace[index].currentFrame - trace[index].counterFrame !== anchorOffset) frozen.push(trace[index++]);
    if (!frozen.length) { issues.push({ kind: 'invalid-native-label', index, quantum: q }); index++; continue; }
    const recovery = trace[index];
    const startsAtKnownLabel = previous
      ? previous.currentFrame - previous.counterFrame === anchorOffset && previous.frames === 128 && heldFrame === previous.currentFrame
      : q.counterFrame === 0 && offset === anchorOffset - 128;
    const validFrozenProgress = frozen.every((item, step) => item.frames === 128
      && item.currentFrame - item.counterFrame === anchorOffset - (step + 1) * 128);
    const recovered = recovery && recovery.frames === 128 && recovery.currentFrame - recovery.counterFrame === anchorOffset;
    if (startsAtKnownLabel && validFrozenProgress && recovered) {
      const run = { firstProcessSeq: q.processSeq, lastProcessSeq: frozen.at(-1).processSeq,
        processCount: frozen.length, processedFrames: frozen.length * 128,
        heldNativeFrame: heldFrame, initialQuantum: firstIndex === 0,
        nativeLabelLagFrames: frozen.map(item => item.currentFrame - (anchorOffset + item.counterFrame)),
        previous: previous ?? null, frozen, recovery };
      frozenTagRuns.push(run);
      for (const item of frozen) stales.push({ processSeq: item.processSeq, counterFrame: item.counterFrame,
        nativeGlobalFrame: item.currentFrame, absoluteFrame: anchorOffset + item.counterFrame,
        differenceFrames: item.currentFrame - (anchorOffset + item.counterFrame),
        initialQuantum: item.processSeq === 1, frozenRunFirstProcessSeq: q.processSeq });
    } else issues.push({ kind: 'unsupported-native-clock-offset', firstIndex, anchorOffset,
      startsAtKnownLabel, validFrozenProgress, recovered: Boolean(recovered), previous, frozen, recovery });
  }
  if (longestStableRun < 3) issues.push({ kind: 'insufficient-stable-anchor', longestStableRun });
  const nativeTransitions = trace.flatMap((q, index) => index > 0 && q.currentFrame !== trace[index - 1].currentFrame + trace[index - 1].frames
    ? [{ processSeq: q.processSeq, expected: trace[index - 1].currentFrame + trace[index - 1].frames, actual: q.currentFrame }] : []);
  const nativeMinimumFrame = trace.length ? trace.reduce((value, q) => Math.min(value, q.currentFrame), Infinity) : null;
  const nativeMaximumEndFrame = trace.length ? trace.reduce((value, q) => Math.max(value, q.currentFrame + q.frames), -Infinity) : null;
  return { valid: issues.length === 0, anchorOffset, stableObservations: ranked[0]?.[1] ?? 0,
    longestStableRun, observedProcesses: trace.length, processedFrames: expectedCounter,
    nativeMinimumFrame, nativeMaximumEndFrame,
    nativeLabelSpanFrames: trace.length ? nativeMaximumEndFrame - nativeMinimumFrame : 0,
    acceptedFrozenTagRuns: frozenTagRuns, acceptedMetadataStales: stales, nativeTransitions, issues,
    rule: 'PCM timing uses actual processed frames. Every native label is independently inspected. Only a completed run holding one identical native label, with 128 actual frames per process and exact recovery to the same stable absolute anchor, is metadata. This is not a general +/-N tolerance. Unrecovered tails, changed offsets, process/packet gaps and unclassified labels remain failures.' };
}

export async function installLiveAudioCapture(page, filename, { waitForLoops = 3 } = {}) {
  const handle = await open(filename, 'wx');
  let writes = Promise.resolve(), closed = false;
  const packets = [], received = [], violations = [], observations = new Map();
  let rate = 0, firstFrame = null, nextFrame = null, lastPacketSeq = 0;
  let previousLastProcessSeq = null, previousLastQuantumOffset = null;
  let minimumStartFrame = null, maximumEndFrame = null, writtenBytes = 0, declaredFrames = 0;
  let lastBrowserState = null, finishInitialState = null;
  const violate = (kind, details) => violations.push({ kind, ...details });
  const closeHandle = async () => { if (!closed) { await handle.close(); closed = true; } };
  const browserState = () => page.evaluate(() => {
    const s = window.__MDGS_TOUR_PCM__;
    if (!s) return null;
    return { ready: s.ready, error: s.error, disposed: s.disposed, contextState: s.context?.state,
      contextCurrentTime: s.context?.currentTime, sampleRate: s.context?.sampleRate,
      tailReady: s.tailReady, clocks: s.clocks, clockErrors: s.clockErrors,
      contextStates: s.contextStates, discontinuities: s.discontinuities,
      portSequenceViolations: s.portSequenceViolations, portMessages: s.portMessages,
      loopStarts: s.loopStarts, bindingCalls: s.bindingCalls, pendingCount: s.pending.length,
      settledBindings: s.settledBindings, moduleError: s.moduleError };
  });
  const stopObserver = () => page.evaluate(() => {
    const s = window.__MDGS_TOUR_PCM__;
    if (!s || s.disposed) return;
    s.disposed = true; clearInterval(s.clockTimer); s.attach = null;
    s.context?.removeEventListener('statechange', s.stateListener);
    // Remove only this observer edge, retaining master->destination.
    try { if (s.master && s.tap) s.master.disconnect(s.tap); } catch {}
    if (s.tap) { s.tap.port.onmessage = null; s.tap.port.close(); s.tap.disconnect(); }
    s.silent?.disconnect();
    if (AudioNode.prototype.connect === s.connectWrapper) AudioNode.prototype.connect = s.originalConnect;
    if (AudioBufferSourceNode.prototype.start === s.startWrapper) AudioBufferSourceNode.prototype.start = s.originalStart;
  });
  try {
    await page.exposeBinding('__MDGS_WRITE_TOUR_PCM__', (_source, packet, base64) => {
      const entry = { ...packet, receivedIndex: received.length + 1, nodeArrivalEpochMs: Date.now() };
      received.push(entry);
      if (closed) { violate('packet-after-file-close', entry); return; }
      // Continuity errors are accumulated without poisoning the write chain.
      writes = writes.then(async () => {
        let bytes;
        try { bytes = Buffer.from(base64, 'base64'); }
        catch (error) { violate('invalid-packet-bytes', { receivedIndex: entry.receivedIndex, error: String(error) }); return; }
        entry.bytesReceived = bytes.length;
        entry.sha256 = createHash('sha256').update(bytes).digest('hex');
        if (!Array.isArray(packet.clockObservations) || !packet.clockObservations.length)
          violate('missing-process-clock-observations', entry);
        else for (const q of packet.clockObservations) {
          const existing = observations.get(q.processSeq);
          if (existing && JSON.stringify(existing) !== JSON.stringify(q))
            violate('conflicting-process-clock-observation', { existing, current: q });
          else if (!existing) observations.set(q.processSeq, q);
        }
        const validFrames = Number.isInteger(packet.frames) && packet.frames > 0 && packet.frames <= 4096;
        const validStart = Number.isInteger(packet.startFrame);
        if (!validFrames || !validStart || !Number.isInteger(packet.rate) || packet.rate <= 0)
          violate('invalid-packet-metadata', entry);
        if (!Number.isInteger(packet.packetSeq) || packet.packetSeq !== lastPacketSeq + 1)
          violate('packet-sequence', { expected: lastPacketSeq + 1, actual: packet.packetSeq, receivedIndex: entry.receivedIndex });
        if (packet.bindingCallSeq !== entry.receivedIndex)
          violate('binding-sequence', { expected: entry.receivedIndex, actual: packet.bindingCallSeq });
        if (Number.isInteger(packet.packetSeq)) lastPacketSeq = packet.packetSeq;
        if (!Number.isInteger(packet.firstProcessSeq) || !Number.isInteger(packet.lastProcessSeq) || packet.firstProcessSeq > packet.lastProcessSeq)
          violate('invalid-process-boundaries', entry);
        else if (previousLastProcessSeq !== null) {
          const delta = packet.firstProcessSeq - previousLastProcessSeq;
          if (delta < 0 || delta > 1 || delta === 0 && packet.firstQuantumOffset !== previousLastQuantumOffset + 1 || delta === 1 && packet.firstQuantumOffset !== 0)
            violate('process-sequence', { previousLastProcessSeq, previousLastQuantumOffset, ...entry });
        }
        previousLastProcessSeq = packet.lastProcessSeq;
        previousLastQuantumOffset = packet.lastQuantumOffset;
        const firstQuantum = packet.clockObservations?.find(q => q.processSeq === packet.firstProcessSeq);
        const lastQuantum = packet.clockObservations?.find(q => q.processSeq === packet.lastProcessSeq);
        if (!firstQuantum || !lastQuantum || !Number.isInteger(packet.firstQuantumOffset) || !Number.isInteger(packet.lastQuantumOffset)
          || packet.firstQuantumOffset < 0 || packet.firstQuantumOffset >= firstQuantum.frames
          || packet.lastQuantumOffset < 0 || packet.lastQuantumOffset >= lastQuantum.frames
          || firstQuantum.counterFrame + packet.firstQuantumOffset !== packet.startFrame
          || lastQuantum.counterFrame + packet.lastQuantumOffset + 1 !== packet.startFrame + packet.frames)
          violate('packet-process-clock-boundaries', entry);
        if (validFrames && bytes.length !== packet.frames * 8)
          violate('packet-byte-count', { ...entry, expectedBytes: packet.frames * 8 });
        if (bytes.length % 8 !== 0) violate('partial-stereo-frame', entry);
        if (firstFrame === null && validStart) { firstFrame = packet.startFrame; rate = packet.rate; }
        if (rate && packet.rate !== rate) violate('sample-rate-changed', { expected: rate, ...entry });
        if (validFrames && validStart) {
          if (nextFrame !== null && packet.startFrame !== nextFrame)
            violate('sample-gap-or-overlap', { expected: nextFrame, actual: packet.startFrame, deltaFrames: packet.startFrame - nextFrame, ...entry });
          nextFrame = packet.startFrame + packet.frames;
          minimumStartFrame = Math.min(minimumStartFrame ?? packet.startFrame, packet.startFrame);
          maximumEndFrame = Math.max(maximumEndFrame ?? nextFrame, nextFrame);
          declaredFrames += packet.frames;
        }
        let offset = 0;
        try {
          while (offset < bytes.length) {
            const result = await handle.write(bytes, offset, bytes.length - offset);
            if (result.bytesWritten <= 0) throw new Error('The PCM write made no progress.');
            offset += result.bytesWritten; writtenBytes += result.bytesWritten;
          }
        } catch (error) { violate('raw-write-error', { receivedIndex: entry.receivedIndex, bytesWritten: offset, error: String(error) }); }
        packets.push({ ...entry, bytesWritten: offset });
      }).catch(error => { violate('unexpected-packet-handler-error', { receivedIndex: entry.receivedIndex, error: String(error) }); });
      return writes;
    });
    await page.addInitScript(({ processor, waitForLoops }) => {
      const state = { ready: false, error: null, disposed: false, moduleError: null,
        clocks: [], clockErrors: [], contextStates: [], discontinuities: [],
        portSequenceViolations: [], portMessages: [], lastPortMessageSeq: 0,
        pending: [], bindingCalls: 0, settledBindings: 0,
        context: null, master: null, tap: null, silent: null,
        clockTimer: 0, tailReady: false, loopStarts: [], attach: null };
      window.__MDGS_TOUR_PCM__ = state;
      const start = AudioBufferSourceNode.prototype.start, connect = AudioNode.prototype.connect;
      state.originalStart = start; state.originalConnect = connect;
      state.startWrapper = function (...parameters) {
        const result = start.apply(this, parameters);
        if (!state.disposed && this.context === state.context && this.loop) {
          state.loopStarts.push({ when: parameters[0] ?? 0, offset: parameters[1] ?? 0,
            duration: this.buffer?.duration, channels: this.buffer?.numberOfChannels, rate: this.playbackRate.value });
          state.attach?.();
        }
        return result;
      };
      state.connectWrapper = function (...parameters) {
        const result = connect.apply(this, parameters);
        if (parameters[0] === this.context.destination && !state.context && !state.disposed) {
          const context = this.context, master = this; state.context = context; state.master = master;
          state.stateListener = () => state.contextStates.push({ state: context.state, currentTime: context.currentTime, performanceNow: performance.now() });
          context.addEventListener('statechange', state.stateListener); state.stateListener();
          const url = URL.createObjectURL(new Blob([processor], { type: 'text/javascript' }));
          context.audioWorklet.addModule(url).then(() => {
            if (state.disposed) return;
            state.attach = () => {
              if (state.disposed || state.tap || state.loopStarts.length < waitForLoops) return;
              const tap = new AudioWorkletNode(context, 'mdgs-exhibition-tour-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
              const silent = context.createGain(); silent.gain.value = 0; state.tap = tap; state.silent = silent;
              tap.onprocessorerror = () => { state.error = 'The native PCM tap processor failed.'; };
              tap.port.onmessage = event => {
                const message = event.data;
                if (message.portMessageSeq !== state.lastPortMessageSeq + 1)
                  state.portSequenceViolations.push({ expected: state.lastPortMessageSeq + 1, actual: message.portMessageSeq });
                state.lastPortMessageSeq = message.portMessageSeq;
                state.portMessages.push({ portMessageSeq: message.portMessageSeq, packetSeq: message.packetSeq,
                  kind: message.tailReady ? 'tailReady' : message.discontinuity ? 'discontinuity' : message.discontinuityNeighbor ? 'neighbor' : 'pcm', performanceNow: performance.now() });
                if (message.tailReady) { state.tailReady = true; return; }
                if (message.discontinuity) { state.discontinuities.push(message.discontinuity); return; }
                if (message.discontinuityNeighbor) {
                  const anomaly = state.discontinuities.find(item => item.id === message.discontinuityNeighbor.id);
                  if (anomaly) anomaly.next = message.discontinuityNeighbor.next;
                  return;
                }
                const bytes = new Uint8Array(message.bytes); let binary = '';
                for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
                const { bytes: omitted, ...packet } = message;
                const pending = window.__MDGS_WRITE_TOUR_PCM__({ ...packet,
                  bindingCallSeq: ++state.bindingCalls, browserReceivedAt: performance.now() }, btoa(binary));
                state.pending.push(pending);
                pending.then(() => state.settledBindings++, error => { state.settledBindings++; state.error = String(error); });
              };
              connect.call(master, tap); connect.call(tap, silent); connect.call(silent, context.destination);
              const clock = () => {
                if (context.state !== 'running') return;
                try {
                  const timestamp = context.getOutputTimestamp();
                  if (timestamp.performanceTime > 0 && timestamp.contextTime > .1)
                    state.clocks.push({ ...timestamp, timeOrigin: performance.timeOrigin, currentTime: context.currentTime });
                } catch (error) { state.clockErrors.push(String(error)); }
              };
              state.clockTimer = setInterval(clock, 1000); clock(); state.ready = true;
            };
            state.attach();
          }).catch(error => { state.moduleError = String(error); if (!state.disposed) state.error = String(error); }).finally(() => URL.revokeObjectURL(url));
        }
        return result;
      };
      AudioBufferSourceNode.prototype.start = state.startWrapper;
      AudioNode.prototype.connect = state.connectWrapper;
    }, { processor, waitForLoops });
  } catch (error) { await closeHandle(); throw error; }

  const totals = () => ({ writtenBytes, writtenFrames: writtenBytes / 8, declaredFrames,
    receivedPackets: received.length, writtenPackets: packets.length, minimumStartFrame, maximumEndFrame,
    globalSpanFrames: minimumStartFrame === null ? 0 : maximumEndFrame - minimumStartFrame,
    firstReceivedCounterFrame: firstFrame, lastReceivedCounterEndFrame: nextFrame,
    timeline: 'Packet startFrame is the actual process-cumulative frame index; nativeStartFrame and clockObservations preserve original native labels.' });
  return {
    async ready() {
      await page.waitForFunction(() => window.__MDGS_TOUR_PCM__?.ready || window.__MDGS_TOUR_PCM__?.error, null, { timeout: 15000 });
      lastBrowserState = await browserState(); assert.equal(lastBrowserState.error, null);
    },
    async armTail() {
      await page.evaluate(() => { window.__MDGS_TOUR_PCM__.tap.port.postMessage('tail'); });
      await page.waitForFunction(() => window.__MDGS_TOUR_PCM__.tailReady, null, { timeout: 3000 });
    },
    async finish() {
      let finishError;
      try {
        // Snapshot before awaiting bindings, preserving state on failure.
        finishInitialState = lastBrowserState = await browserState();
        await page.evaluate(async () => { const s = window.__MDGS_TOUR_PCM__; clearInterval(s.clockTimer); await Promise.allSettled(s.pending); });
        lastBrowserState = await browserState();
      } catch (error) { finishError = error; }
      finally {
        await stopObserver().catch(error => { violate('observer-cleanup-error', { error: String(error) }); });
        await writes; await closeHandle();
      }
      if (finishError) throw finishError;
      const state = lastBrowserState;
      assert.equal(state.error, null); assert(state.ready && packets.length && state.clocks.length);
      assert(state.tailReady, 'Capture tail must be armed before ending the native graph.');
      assert.equal(violations.length, 0, 'PCM packet continuity/sequence/write violations: ' + JSON.stringify(violations.slice(0, 8)));
      assert.equal(state.portSequenceViolations.length, 0, 'The worklet MessagePort sequence changed.');
      const trace = [...observations.values()], clockAudit = inspectNativeFrameLabels(trace);
      assert(clockAudit.valid, 'Unsupported native/process clock evidence: ' + JSON.stringify(clockAudit.issues.slice(0, 8)));
      assert.equal(clockAudit.processedFrames, writtenBytes / 8, 'Process-counted frames differ from actual written frames.');
      assert.equal(firstFrame, 0, 'The first packet must begin at process-cumulative sample zero.');
      assert.deepEqual(state.discontinuities.map(item => ({ processSeq: item.current.processSeq, expected: item.expected, actual: item.actual })), clockAudit.nativeTransitions, 'Native transition events and per-process clock observations must agree.');
      assert.equal(writtenBytes / 8, maximumEndFrame - minimumStartFrame, 'Written samples differ from the global frame span.');
      const absoluteStartFrame = clockAudit.anchorOffset + firstFrame;
      const absoluteEndFrame = clockAudit.anchorOffset + nextFrame;
      if (waitForLoops > 0) {
        assert.equal(state.loopStarts.length, waitForLoops);
        assert(absoluteStartFrame / rate <= Math.min(...state.loopStarts.map(source => source.when)), 'The recording tap attached after the actual music began.');
      }
      const offsets = state.clocks.map(clock => (clock.timeOrigin + clock.performanceTime) / 1000 - clock.contextTime).sort((a, b) => a - b);
      assert(offsets.every(Number.isFinite), 'The native output clock must provide finite epoch mappings.');
      const clockSpreadSeconds = offsets.at(-1) - offsets[0];
      assert(clockSpreadSeconds <= 1 / 30, 'Native output-clock epoch spread exceeds one 30fps video frame: ' + clockSpreadSeconds);
      const origin = offsets[Math.floor(offsets.length / 2)];
      return { kind: 'Float32 little-endian stereo, passive native AudioWorklet master tap', sampleRate: rate, channels: 2,
        startFrame: absoluteStartFrame, endFrame: absoluteEndFrame,
        counterStartFrame: firstFrame, counterEndFrame: nextFrame,
        frames: writtenBytes / 8, bytes: writtenBytes,
        durationSeconds: writtenBytes / 8 / rate, ...totals(), packetCount: packets.length, packets,
        audioContextEpoch: origin, start: origin + absoluteStartFrame / rate,
        clockSpreadSeconds, maximumClockSpreadSeconds: 1 / 30, clocks: state.clocks, loopStarts: state.loopStarts,
        contextStates: state.contextStates, violations,
        nativeClockAudit: clockAudit, nativeClockObservations: trace,
        nativeDiscontinuities: state.discontinuities,
        timingExplanation: 'The old recorder equated each mutable worklet-global currentFrame label with PCM order. Independent native a-rate ramp/sine evidence demonstrated both isolated labels and a four-quantum frozen label while actual samples progressed. Native labels are preserved and strictly cross-checked; only completed constant-label runs that recover the same absolute anchor are metadata. No PCM is inserted, removed, re-ordered or repaired. Output-clock epoch spread is separately limited to one 30fps video frame. This is not proof of a particular Chromium build-symbol root cause.' };
    },
    async diagnostics() {
      let currentState, snapshotError;
      try { currentState = await browserState(); } catch (error) { snapshotError = String(error); }
      await writes;
      const nativeClockObservations = [...observations.values()];
      const nativeClockAudit = inspectNativeFrameLabels(nativeClockObservations);
      return { received, packets, rate,
        firstFrame: nativeClockAudit.anchorOffset + (firstFrame ?? 0),
        nextFrame: nativeClockAudit.anchorOffset + (nextFrame ?? 0),
        counterStartFrame: firstFrame, counterEndFrame: nextFrame, ...totals(), closed,
        nativeClockAudit, nativeClockObservations,
        violations, finishInitialState, state: lastBrowserState, currentState, snapshotError,
        note: 'Raw PCM remains in received order. No silence insertion, de-duplication, reordering or span substitution. Quantum fingerprints are diagnostic, not an auditory-equivalence proof.' };
    },
    async dispose() {
      await stopObserver().catch(error => { violate('observer-cleanup-error', { error: String(error) }); });
      await writes; await closeHandle();
    },
  };
}
