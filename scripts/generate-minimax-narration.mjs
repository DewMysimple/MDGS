import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'reports/四卷旁白内容稿.md');
const outputDir = resolve(root, 'public/audio/narration');
const manifestPath = resolve(outputDir, 'manifest.json');
const voiceId = 'Chinese_gravelly_storyteller_nv1';
const apiUrl = 'https://api.minimax.cn/v1/t2a_v2';
const chapterOrder = ['壹', '贰', '叁', '肆'];
const minimumRequestIntervalMs = 21_000;

function parseNarration(markdown) {
  const chapters = [];
  let current = null;
  let scene = '';
  for (const line of markdown.split(/\r?\n/u)) {
    const heading = line.match(/^##\s+([壹贰叁肆])《([^》]+)》/u);
    if (heading) {
      current = { ordinal: heading[1], title: heading[2], sentences: [] };
      chapters.push(current);
      scene = '';
      continue;
    }
    if (/^##\s+/u.test(line)) { current = null; continue; }
    if (!current) continue;
    const sceneMatch = line.match(/^\d+\.\s+\*\*画面：([^*]+)\*\*/u);
    if (sceneMatch) scene = sceneMatch[1].trim();
    const passage = line.match(/^\s+-\s+(.+?)\s*$/u);
    if (passage) current.sentences.push({ text: passage[1].trim(), scene });
  }
  if (chapters.length !== 4 || chapters.some((chapter, i) => chapter.ordinal !== chapterOrder[i]))
    throw new Error(`Expected four ordered chapters, found ${chapters.map(item => item.ordinal).join(',')}`);
  const counts = chapters.map(chapter => chapter.sentences.length);
  if (counts.join(',') !== '15,12,9,9' || counts.reduce((sum, count) => sum + count, 0) !== 45)
    throw new Error(`Narration source changed unexpectedly: counts=${counts.join(',')}`);
  if (chapters.some(chapter => chapter.sentences.some(item => !item.text || !item.scene)))
    throw new Error('Narration source contains a passage without scene context.');
  return chapters;
}

function requestText(sentences) {
  return sentences.map((item, index) => {
    const next = sentences[index + 1];
    const pause = next && next.scene === item.scene ? '0.32' : '0.55';
    return index === sentences.length - 1 ? item.text : `${item.text}<#${pause}#>`;
  }).join('\n');
}

function formatSrtTime(milliseconds) {
  const total = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor(total / 60_000) % 60;
  const seconds = Math.floor(total / 1_000) % 60;
  const millis = total % 1_000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function toSrt(payload, sentences) {
  let parsed;
  try { parsed = JSON.parse(payload); }
  catch { return null; }
  const cues = Array.isArray(parsed) ? parsed : parsed?.data?.subtitle ?? parsed?.subtitle;
  if (!Array.isArray(cues) || cues.length !== sentences.length) return null;
  if (!cues.every((cue, index) => cue?.text?.trim() === sentences[index].text
    && Number.isFinite(cue.time_begin) && Number.isFinite(cue.time_end) && cue.time_end > cue.time_begin)) return null;
  return `${cues.map((cue, index) => `${index + 1}\r\n${formatSrtTime(cue.time_begin)} --> ${formatSrtTime(cue.time_end)}\r\n${cue.text.trim()}`).join('\r\n\r\n')}\r\n`;
}

function responseMessage(body, status) {
  const code = body?.base_resp?.status_code ?? body?.status_code ?? status;
  const message = body?.base_resp?.status_msg ?? body?.message ?? `HTTP ${status}`;
  return `MiniMax synthesis failed (status=${code}): ${String(message).slice(0, 240)}`;
}

async function synthesize(chapter, apiKey) {
  const text = requestText(chapter.sentences);
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'speech-2.8-hd',
      text,
      stream: false,
      language_boost: 'Chinese',
      text_normalization_mode: 'quality',
      output_format: 'hex',
      subtitle_enable: true,
      subtitle_type: 'sentence',
      voice_setting: { voice_id: voiceId, speed: 1, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
    }),
  });
  let body;
  try { body = await response.json(); }
  catch { throw new Error(`MiniMax returned a non-JSON response (HTTP ${response.status}).`); }
  if (!response.ok || body?.base_resp?.status_code !== 0 || !body?.data?.audio)
    throw new Error(responseMessage(body, response.status));
  const audio = Buffer.from(body.data.audio, 'hex');
  if (audio.length < 1024 || audio.subarray(0, 3).toString('ascii') !== 'ID3'
    && !(audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0))
    throw new Error(`MiniMax returned invalid MP3 data for chapter ${chapter.ordinal}.`);
  return { audio, body };
}

const chapters = parseNarration(await readFile(sourcePath, 'utf8'));
await mkdir(outputDir, { recursive: true });
let apiKey = process.env.MINIMAX_API_KEY?.trim() ?? '';
if (!apiKey) throw new Error('No API key was received.');

const manifest = {
  schemaVersion: 1,
  source: 'reports/四卷旁白内容稿.md',
  provider: 'MiniMax',
  model: 'speech-2.8-hd',
  voiceId,
  language: 'zh-CN',
  settings: { speed: 1, pitch: 0, sampleRate: 32000, bitrate: 128000, channels: 1, pauseWithinSceneSeconds: 0.32, pauseBetweenScenesSeconds: 0.55 },
  generatedAt: new Date().toISOString(),
  chapters: [],
};

try {
  let previousRequestAt = 0;
  for (let index = 0; index < chapters.length; index++) {
    const chapter = chapters[index];
    const outputPath = resolve(outputDir, `chapter-${index + 1}.mp3`);
    const waitMs = minimumRequestIntervalMs - (Date.now() - previousRequestAt);
    if (waitMs > 0) await new Promise(resolveWait => setTimeout(resolveWait, waitMs));
    previousRequestAt = Date.now();
    const { audio, body } = await synthesize(chapter, apiKey);
    await writeFile(outputPath, audio, { flag: 'w' });
    let subtitle = null;
    const subtitleUrl = body.subtitle_file ?? body.data?.subtitle_file;
    if (typeof subtitleUrl === 'string' && /^https:\/\//u.test(subtitleUrl)) {
      const subtitleResponse = await fetch(subtitleUrl);
      if (subtitleResponse.ok) {
        const subtitlePayload = await subtitleResponse.text();
        const subtitleText = toSrt(subtitlePayload, chapter.sentences);
        const subtitlePath = resolve(outputDir, `chapter-${index + 1}.srt`);
        if (subtitleText) {
          await writeFile(subtitlePath, subtitleText, 'utf8');
          subtitle = `chapter-${index + 1}.srt`;
        }
      }
    }
    manifest.chapters.push({
      id: index + 1,
      title: chapter.title,
      file: `chapter-${index + 1}.mp3`,
      subtitle,
      sentenceCount: chapter.sentences.length,
      scenes: chapter.sentences.map((item, sentenceIndex) => ({ index: sentenceIndex + 1, scene: item.scene, text: item.text })),
      audioBytes: audio.length,
      sampleRate: body.extra_info?.audio_sample_rate ?? 32000,
      traceId: body.trace_id,
    });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    process.stdout.write(`Generated chapter ${index + 1}/4: ${chapter.title} (${chapter.sentences.length} passages, ${audio.length} bytes)\n`);
  }
} finally {
  apiKey = '';
}

process.stdout.write(`Manifest: ${manifestPath}\n`);
