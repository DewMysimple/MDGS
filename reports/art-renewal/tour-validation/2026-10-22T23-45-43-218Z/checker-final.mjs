/** Independent offline audit; never rewrites recordings or repairs PCM. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2), option = key => args[args.indexOf(key) + 1];
assert(args.includes('--run-dir') && args.includes('--report-dir'), 'Pass explicit --run-dir and --report-dir.');
const root = process.cwd(), run = path.resolve(option('--run-dir')), out = path.resolve(option('--report-dir'));
const full = args.includes('--with-pcm'), checks = [], digest = value => createHash('sha256').update(value).digest('hex');
const read = filename => readFile(path.join(run, filename));
const json = async filename => JSON.parse(await read(filename));
const check = (name, passed, details) => checks.push({ name, required: true, passed: Boolean(passed), ...(details === undefined ? {} : { details }) });
const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;
const r = await json('recording.json'), audio = await json('audio-clock.json'), frames = await json('frames.json');
const report = { status: 'running', checkedAt: new Date().toISOString(), mode: full ? 'full-PCM-and-metadata' : 'lightweight-metadata',
  criteriaVersion: '2-endpoints-are-observations', observations: [],
  run: path.relative(root, run).replaceAll('\\', '/'), runId: r.runId,
  scope: 'Actual guided excerpt. This is an independent offline audit of one recorded package, not candidate4 final acceptance or an original-rendering FPS benchmark.',
  buildDirectory: r.buildDirectory, recorderSha256: {}, checks,
  driverSha256: digest(await readFile(new URL(import.meta.url))) };
check('recording-success-and-zero-reported-errors', r.status === 'recorded' && r.errors.length === 0);
check('recording-bundle-before-after-identical', JSON.stringify(r.bundleBefore) === JSON.stringify(r.bundleAfter));
check('recorder-before-after-identical', JSON.stringify(r.recorderSha256) === JSON.stringify(r.recorderAfter));
for (const [source, expected] of Object.entries(r.recorderSha256)) {
  const actual = digest(await read(path.join('recorder', path.basename(source)))); report.recorderSha256[source] = actual;
  check('archived-recorder-exact-SHA:' + source, actual === expected);
}
for (const [relative, expected] of Object.entries(r.bundleBefore))
  check('recorded-build-file-SHA:' + relative, digest(await readFile(path.resolve(root, r.buildDirectory, relative))) === expected);

// Match the known original-renderer base package, while retaining the entire
// build binding as a separately hashed local source. Do not infer C4 identity.
const bindingFile = path.join(root, 'tmp/shader-warmup/build-binding.json');
if (r.buildDirectory === 'tmp/shader-warmup/base-dist') {
  const bindingBytes = await readFile(bindingFile), binding = JSON.parse(bindingBytes);
  const fontRelative = 'fonts/wenkai-web.woff2', fontSha = digest(await readFile(path.resolve(root, r.buildDirectory, fontRelative)));
  const entry = Object.keys(r.bundleBefore).find(name => /^assets\/index-.+\.js$/.test(name));
  const script = await readFile(path.resolve(root, r.buildDirectory, entry), 'utf8');
  check('base-build-bundle-matches-recorded-build-binding', Object.entries(r.bundleBefore).every(([name, sha]) => binding.packages.base[r.buildDirectory + '/' + name] === sha));
  check('new-font-matches-build-binding', fontSha === binding.sourceInputs['public/fonts/wenkai-web.woff2']);
  check('new-date-note-present-in-actual-JS', script.includes('705年中宗复位，710年睿宗再度即位，712年传位玄宗。'));
  check('base-JS-has-no-warmup-prototype-marker', !script.includes('shaderWarmup') && !script.includes('virtual:mdgs-shader-warmup'));
  report.packageIdentity = { role: 'Original-renderer base build with new Wenkai subset and chapter2 curatorial date note; not candidate3-identical and not C4 final movie.',
    buildBinding: path.relative(root, bindingFile).replaceAll('\\', '/'), buildBindingSha256: digest(bindingBytes),
    originalRendererSha256: binding.originalRendererSha256,
    fontSha256: fontSha, dateNoteSourceSha256: binding.sourceInputs['src/data/curatorialNotes.ts'] };
}

const expectedBytes = audio.frames * audio.channels * 4;
check('actual-PCM-file-bytes-equal-all-reported-counts', (await stat(path.join(run, 'live-sound.f32'))).size === expectedBytes
  && expectedBytes === audio.bytes && audio.bytes === audio.writtenBytes && audio.frames === audio.writtenFrames
  && audio.frames === audio.declaredFrames && audio.frames === audio.globalSpanFrames);
check('actual-process-count-and-absolute-range', audio.nativeClockObservations.length * 128 === audio.frames
  && audio.nativeClockAudit.processedFrames === audio.frames && audio.counterStartFrame === 0
  && audio.counterEndFrame === audio.frames && audio.endFrame - audio.startFrame === audio.frames);
check('zero-reported-packet-and-native-audit-issues', audio.violations.length === 0 && audio.nativeClockAudit.valid && audio.nativeClockAudit.issues.length === 0);
check('all-packets-written-and-counted', audio.packetCount === audio.packets.length && audio.packetCount === audio.receivedPackets && audio.packetCount === audio.writtenPackets);
let expectedCounter = 0, previousProcess = null, previousOffset = null;
check('independent-packet-process-and-binding-sequences', audio.packets.every((packet, index) => {
  const delta = previousProcess === null ? null : packet.firstProcessSeq - previousProcess;
  const pass = packet.packetSeq === index + 1 && packet.receivedIndex === index + 1 && packet.bindingCallSeq === index + 1
    && packet.startFrame === expectedCounter && packet.bytesWritten === packet.frames * 8 && packet.bytesReceived === packet.bytesWritten
    && (delta === null || delta === 0 && packet.firstQuantumOffset === previousOffset + 1 || delta === 1 && packet.firstQuantumOffset === 0);
  expectedCounter += packet.frames; previousProcess = packet.lastProcessSeq; previousOffset = packet.lastQuantumOffset; return pass;
}) && expectedCounter === audio.frames);
const anchor = audio.nativeClockAudit.anchorOffset;
check('independent-every-process-clock-and-original-labels', audio.nativeClockObservations.every((quantum, index) => quantum.processSeq === index + 1
  && quantum.counterFrame === index * 128 && quantum.frames === 128
  && (quantum.currentFrame - quantum.counterFrame === anchor
    || audio.nativeClockAudit.acceptedMetadataStales.some(stale => stale.processSeq === quantum.processSeq)))
  && audio.startFrame === anchor && audio.endFrame === anchor + audio.frames);
check('actual-three-loop-starts-share-time-offset-and-rate', audio.loopStarts.length === 3 && audio.loopStarts.every(source => source.when === audio.loopStarts[0].when && source.offset === 0 && source.rate === 1)
  && JSON.stringify(audio.loopStarts.map(source => [source.duration, source.channels])) === JSON.stringify([[160, 2], [160, 1], [24, 1]]));
check('tap-started-before-all-music-loops', audio.startFrame / audio.sampleRate <= audio.loopStarts[0].when);
const finalContext = audio.contextStates.at(-1);
check('context-closed-and-tail-PCM-reaches-actual-final-context-frame', finalContext.state === 'closed' && near(finalContext.currentTime * audio.sampleRate, audio.endFrame));
const epochs = audio.clocks.map(clock => (clock.timeOrigin + clock.performanceTime) / 1000 - clock.contextTime).sort((a, b) => a - b);
const spread = epochs.at(-1) - epochs[0], epoch = epochs[Math.floor(epochs.length / 2)];
check('independent-output-epoch-median-spread-and-start-map', epochs.length >= 3 && near(spread, audio.clockSpreadSeconds, 1e-9)
  && spread <= 1 / 30 && near(epoch, audio.audioContextEpoch, 1e-9) && near(audio.start, epoch + audio.startFrame / audio.sampleRate, 1e-9));
check('video-audio-start-offset-is-same-clock-mapping', near(audio.start - frames[0].timestamp, r.video.soundOffsetSeconds, 1e-9));

const gaps = frames.slice(1).map((frame, index) => ({ seconds: frame.timestamp - frames[index].timestamp,
  from: frames[index].timestamp - frames[0].timestamp, to: frame.timestamp - frames[0].timestamp,
  previous: frames[index].file, next: frame.file,
  action: r.actions.filter(action => action.epoch <= frames[index].timestamp).at(-1) ?? null }));
const files = new Set((await readdir(path.join(run, 'frames'))).map(name => 'frames/' + name));
check('all-source-frame-files-present-and-timestamps-strict', frames.length === r.video.frames && frames.every(frame => files.has(frame.file)) && gaps.every(gap => gap.seconds > 0)
  && frames[0].timestamp === r.video.firstFrameEpoch && frames.at(-1).timestamp === r.video.lastFrameEpoch);
const concat = (await read('frames.ffconcat')).toString('utf8').trim().split(/\r?\n/);
const durations = concat.filter(line => line.startsWith('duration ')).map(line => Number(line.slice(9)));
const concatFiles = concat.filter(line => line.startsWith('file ')).map(line => line.slice(6, -1));
check('ffconcat-preserves-recorded-time-intervals', durations.length === frames.length && concatFiles.length === frames.length + 1
  && frames.every((frame, index) => concatFiles[index] === frame.file && near(durations[index],
    (frames[index + 1]?.timestamp ?? frames[0].timestamp + r.video.durationSeconds) - frame.timestamp, 5.1e-7))
  && concatFiles.at(-1) === frames.at(-1).file);
const ms = timecode => { const [hh, mm, ss, milli] = timecode.split(/[:,]/).map(Number); return ((hh * 60 + mm) * 60 + ss) * 1000 + milli; };
const subtitles = (await read('导览字幕.srt')).toString('utf8').trim().split(/\r?\n\s*\r?\n/).map(block => {
  const [number, range, ...lines] = block.split(/\r?\n/), [start, end] = range.split(' --> ');
  return { number: Number(number), startMs: ms(start), endMs: ms(end), label: lines.join('\n') };
});
check('all-18-action-subtitles-exact-text-timecodes-bounds', subtitles.length === r.actions.length && subtitles.length === 18 && subtitles.every((subtitle, index) => {
  const action = r.actions[index], expectedStart = Math.round(Math.max(0, action.epoch - frames[0].timestamp) * 1000);
  const expectedEnd = Math.round(Math.min(r.video.durationSeconds, (r.actions[index + 1]?.epoch ?? frames[0].timestamp + r.video.durationSeconds) - frames[0].timestamp, action.epoch - frames[0].timestamp + 4.5) * 1000);
  return subtitle.number === index + 1 && subtitle.label === action.label && subtitle.startMs === expectedStart && subtitle.endMs === expectedEnd
    && subtitle.startMs >= 0 && subtitle.endMs > subtitle.startMs && subtitle.endMs <= Math.ceil(r.video.durationSeconds * 1000)
    && (index === 0 || subtitle.startMs >= subtitles[index - 1].endMs);
}));
for (const gap of gaps) {
  const transition = gap.action?.label.match(/展开第(\d)卷/);
  gap.chapterContext = transition ? Number(transition[1]) : gap.action?.label === '启卷 · 入画' ? 1 : Number(gap.action?.chapter ?? 0);
  gap.subtitleSegments = subtitles.filter(subtitle => subtitle.startMs / 1000 <= gap.to && subtitle.endMs / 1000 >= gap.from)
    .map(subtitle => ({ number: subtitle.number, label: subtitle.label, startMs: subtitle.startMs, endMs: subtitle.endMs }));
}
const ffprobe = process.env.MDGS_FFPROBE || 'ffprobe';
const result = spawnSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(run, '国色长卷-导览录像.mp4')], { encoding: 'utf8' });
check('independent-ffprobe-exit-zero', result.status === 0, result.stderr || undefined);
const probe = JSON.parse(result.stdout), video = probe.streams.find(stream => stream.codec_type === 'video'), sound = probe.streams.find(stream => stream.codec_type === 'audio');
check('actual-H264-full-HD-30fps-and-stereo-48k-AAC', video.codec_name === 'h264' && video.width === 1920 && video.height === 1080 && video.avg_frame_rate === '30/1'
  && sound.codec_name === 'aac' && Number(sound.sample_rate) === 48000 && sound.channels === 2);
check('actual-container-and-stream-durations-within-one-video-frame', Math.abs(Number(probe.format.duration) - r.video.durationSeconds) <= 1 / 30
  && Math.abs(Number(video.duration) - r.video.durationSeconds) <= 1 / 30 && Math.abs(Number(sound.duration) - r.video.durationSeconds) <= 1 / 30);
report.audio = { actualFrames: audio.frames, actualBytes: audio.bytes, sampleRate: audio.sampleRate, durationSeconds: audio.durationSeconds,
  processCount: audio.nativeClockObservations.length, packetCount: audio.packetCount, nativeFrozenTagRuns: audio.nativeClockAudit.acceptedFrozenTagRuns.length,
  absoluteStartFrame: audio.startFrame, absoluteEndFrame: audio.endFrame, outputClockEpochSpreadSeconds: spread,
  loopStarts: audio.loopStarts, sourceLoopCyclesReached: audio.loopStarts.map(source => Math.floor((audio.endFrame / audio.sampleRate - source.when) / source.duration)),
  nativeContextFinalState: finalContext, videoOffsetSeconds: r.video.soundOffsetSeconds,
  millisecondAdelayQuantizationErrorSeconds: Math.round(r.video.soundOffsetSeconds * 1000) / 1000 - r.video.soundOffsetSeconds,
  videoTailAfterRawSoundSeconds: frames[0].timestamp + r.video.durationSeconds - (audio.start + audio.durationSeconds) };
report.video = { wallDurationSeconds: r.video.durationSeconds, sourceCompositedFrameCount: frames.length, encodedFrameCount: Number(video.nb_frames),
  encodedVideoSeconds: Number(video.duration), encodedAudioSeconds: Number(sound.duration), containerSeconds: Number(probe.format.duration),
  frameRate: video.avg_frame_rate, sourceFrameGapMaxSeconds: Math.max(...gaps.map(gap => gap.seconds)), largestSourceFrameIntervals: gaps.sort((a, b) => b.seconds - a.seconds).slice(0, 6),
  chapterMaximumSourceFrameIntervals: [1, 2, 3, 4].map(chapter => ({ chapter,
    largestInterval: gaps.filter(gap => gap.chapterContext === chapter).sort((a, b) => b.seconds - a.seconds)[0] ?? null })),
  groupingMethod: 'Nearest preceding action marker. 展开第N卷 belongs to target chapter N; this is not scene/pixel recognition.',
  caution: 'Screencast timestamps describe captured composited frames; long holds are retained by concat/fps duplication. They do not measure original painting presentation FPS or prove the cause of a hold.' };
report.subtitles = { count: subtitles.length, encoding: 'UTF-8', burnedIntoVideo: false, first: subtitles[0], last: subtitles.at(-1) };
report.actualFfprobe = probe;

if (full) {
  const manifest = JSON.parse(await readFile(path.resolve(root, r.buildDirectory, 'audio/peony-v3-manifest.json')));
  report.runtimeAudioAssets = await Promise.all(manifest.stems.map(async stem => {
    const bytes = await readFile(path.resolve(root, r.buildDirectory, 'audio', stem.file));
    return { file: stem.file, bytes: bytes.length, sha256: digest(bytes), expectedSha256: stem.sha256,
      originalFileSampleRate: stem.sampleRate, channels: stem.channels, durationSeconds: stem.durationSeconds };
  }));
  check('actual-runtime-original-digital-stems-match-authoring-manifest', report.runtimeAudioAssets.length === 3
    && report.runtimeAudioAssets.every(stem => stem.sha256 === stem.expectedSha256));
  const raw = await read('live-sound.f32'); let packetByte = 0, badPacketHashes = 0, badQuantumFingerprints = 0;
  for (const packet of audio.packets) {
    const bytes = raw.subarray(packetByte, packetByte + packet.bytesWritten);
    if (digest(bytes) !== packet.sha256) badPacketHashes++;
    packetByte += packet.bytesWritten;
  }
  let sumSquares = 0, peak = 0, nonFinite = 0, clipped = 0, firstNonzeroFrame = null, lastNonzeroFrame = null;
  for (const quantum of audio.nativeClockObservations) {
    let fingerprint = 2166136261;
    for (let frame = quantum.counterFrame; frame < quantum.counterFrame + quantum.frames; frame++)
      for (let channel = 0; channel < 2; channel++) {
        const at = frame * 8 + channel * 4, sample = raw.readFloatLE(at), amplitude = Math.abs(sample);
        fingerprint = Math.imul(fingerprint ^ raw.readUInt32LE(at), 16777619);
        if (!Number.isFinite(sample)) nonFinite++;
        sumSquares += sample * sample; peak = Math.max(peak, amplitude); if (amplitude >= 1) clipped++;
        if (amplitude > 1e-9) { firstNonzeroFrame ??= frame; lastNonzeroFrame = frame; }
      }
    if ((fingerprint >>> 0).toString(16).padStart(8, '0') !== quantum.fingerprint) badQuantumFingerprints++;
  }
  check('all-actual-PCM-packet-SHAs-match-recorded-order', badPacketHashes === 0 && packetByte === raw.length);
  check('all-actual-quantum-Float32-bit-fingerprints-match', badQuantumFingerprints === 0);
  check('all-PCM-samples-finite-unclipped-and-nonempty', nonFinite === 0 && clipped === 0 && peak > 0);
  const endpointWindows = [1, .5, .1, .01, 128 / audio.sampleRate].map(seconds => {
    const samples = Math.round(seconds * audio.sampleRate) * 2; let tailPeak = 0, tailSquares = 0;
    for (let at = raw.length - samples * 4; at < raw.length; at += 4) {
      const value = raw.readFloatLE(at); tailPeak = Math.max(tailPeak, Math.abs(value)); tailSquares += value * value;
    }
    return { seconds, samplePeak: tailPeak, allSamplesExactlyZero: tailPeak === 0,
      samplePeakDbFS: tailPeak > 0 ? 20 * Math.log10(tailPeak) : null,
      sampleRmsDbFS: tailSquares > 0 ? 20 * Math.log10(Math.sqrt(tailSquares / samples)) : null };
  });
  report.observations.push({ name: 'actual-PCM-endpoints', required: false,
    reason: 'The product uses setTargetAtTime(0) with a 45ms time constant, then closes after 260ms. A finite exponential fade does not guarantee bitwise zero. No replacement audibility or dB threshold is introduced; continuity, exact written/process counts, final-context coverage and finite/unclipped samples remain required.',
    priorFailedAudit: 'reports/art-renewal/tour-validation/2026-10-22T23-45-43-218Z/validation.json',
    firstNonzeroFrame, lastNonzeroFrame, nonzeroThreshold: 1e-9,
    lastFrameBitwiseZero: raw.readUInt32LE(raw.length - 8) === 0 && raw.readUInt32LE(raw.length - 4) === 0,
    lastStereoSamples: [raw.readFloatLE(raw.length - 8), raw.readFloatLE(raw.length - 4)], endpointWindows,
    zeroWindowDbNotation: 'An exactly zero window has allSamplesExactlyZero=true and dBFS=null, representing negative infinity.',
    limit: 'Observed endpoint values belong to this actual recording, not a universal hearing threshold or a guarantee for all future shutdowns.' });
  report.pcm = { sha256: digest(raw), bytes: raw.length, badPacketHashes, badQuantumFingerprints, nonFiniteSamples: nonFinite,
    clippedSamples: clipped, samplePeak: peak, samplePeakDbFS: 20 * Math.log10(peak),
    sampleRmsDbFS: 20 * Math.log10(Math.sqrt(sumSquares / (audio.frames * 2))),
    firstNonzeroFrame, lastNonzeroFrame, nonzeroThreshold: 1e-9,
    leadingSilenceSeconds: firstNonzeroFrame / audio.sampleRate,
    trailingSilenceSeconds: (audio.frames - 1 - lastNonzeroFrame) / audio.sampleRate,
    note: 'Full raw Float32 audit only. Sample peak is not oversampled true peak; no encoded audio/video full decode or waveform reconstruction was performed.' };
  report.movieSha256 = digest(await read('国色长卷-导览录像.mp4'));
}
report.evidenceFiles = {};
for (const file of ['recording.json', 'audio-clock.json', 'frames.json', 'frames.ffconcat', '导览字幕.srt', '国色长卷·余韵花笺.png']) {
  const bytes = await read(file); report.evidenceFiles[file] = { bytes: bytes.length, sha256: digest(bytes) };
}
report.limits = ['One actual browser/recording run only; not candidate4 final film.', 'Actual WebAudio PCM was retained; final JPEG/H264/AAC movie is lossy.',
  'No browser, FFmpeg re-encode, full encoded media decode, perceptual listening or original-artwork pixel acceptance in this audit.',
  'SRT is a separate sidecar, not a subtitle track or burned-in text.', 'Clock mapping is independently checked, not a sample-accurate video synchronization claim.',
  'Original failed App/reference runs remain failed and unchanged.'];
report.status = checks.every(item => item.passed) ? 'passed' : 'failed';
report.summary = { passed: checks.filter(item => item.passed).length, total: checks.length,
  requiredPassed: checks.filter(item => item.passed).length, requiredTotal: checks.length, nonRequiredObservations: report.observations.length };
await mkdir(out, { recursive: true });
const reportFilename = args.includes('--report-file') ? option('--report-file') : full ? 'validation.json' : 'metadata-validation.json';
assert(reportFilename === path.basename(reportFilename) && reportFilename.endsWith('.json'), '--report-file must be a JSON basename.');
await writeFile(path.join(out, reportFilename), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, checks: report.summary, run: report.run, reportDirectory: out, failed: checks.filter(item => !item.passed) }));
process.exitCode = report.status === 'passed' ? 0 : 1;
