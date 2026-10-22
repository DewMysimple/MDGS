"""Compose and render original pentatonic plucked-string accompaniment.

No recordings or borrowed melodies are used. This is a synthetic guzheng-inspired
timbre, not a claim of a human performance or an acoustic-instrument recording.
Requires NumPy for authoring only; the shipped browser consumes local MP3.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import shutil
import subprocess
import tempfile
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RATE = 44100
TEMPO = 50
BEAT = 60 / TEMPO
BEATS = 64
DURATION = BEAT * BEATS
SEED = 20261021


def midi_frequency(note):
    return 440 * 2 ** ((note - 69) / 12)


def compose():
    """Four quiet, independently written call-and-response phrases in D gong."""
    phrases = [
        ([0, 1.5, 3, 4, 6, 7.5, 9, 10.5, 12, 14], [62, 64, 66, 69, 66, 64, 62, 59, 57, 62]),
        ([0, 1, 2.5, 4, 6, 7.5, 9.5, 12, 14], [66, 69, 71, 74, 71, 69, 66, 64, 62]),
        ([0, 1.5, 3, 4.5, 6, 8, 10, 11.5, 13, 14.5], [69, 66, 64, 62, 59, 57, 59, 62, 64, 66]),
        ([0, 1.5, 3, 5, 6.5, 8, 10, 12, 14], [64, 66, 69, 66, 64, 62, 59, 57, 62]),
    ]
    rng = np.random.default_rng(SEED)
    notes = []
    for phrase, (offsets, pitches) in enumerate(phrases):
        for index, (offset, pitch) in enumerate(zip(offsets, pitches)):
            notes.append(dict(beat=phrase * 16 + offset, midi=pitch, velocity=round(float(.56 + rng.uniform(-.09, .07)), 4),
                              pan=round(float(rng.uniform(-.28, .28)), 4), kind='melody', bend=index % 3 == 1))
    for bar in range(16):
        root = [50, 57, 54, 57][bar % 4]
        notes.append(dict(beat=bar * 4 + .035, midi=root, velocity=.31, pan=-.33, kind='bass', bend=False))
        # Sparse answering strings leave space around the main melody.
        if bar % 4 != 3:
            notes.append(dict(beat=bar * 4 + 2.6, midi=[62, 59, 64, 57][bar % 4], velocity=.17, pan=.36, kind='answer', bend=False))
    # Two brief, soft pentatonic brushes rather than a constant ornamental loop.
    for beat, pitches in [(19.60, [64, 66, 69]), (51.55, [62, 64, 66])]:
        for index, pitch in enumerate(pitches):
            notes.append(dict(beat=beat + index * .105, midi=pitch, velocity=.18 + index * .035, pan=.24, kind='brush', bend=False))
    return sorted(notes, key=lambda note: note['beat'])


def plucked_note(note, rng):
    frequency = midi_frequency(note['midi'])
    duration = 6.8 if note['kind'] == 'bass' else 5.7
    t = np.arange(round(duration * RATE), dtype=np.float64) / RATE
    signal = np.zeros(t.shape, dtype=np.float64)
    pluck = .165 + rng.uniform(-.025, .025)
    # Mildly stiff, rapidly decaying upper partials give a silk/metal string
    # attack with a warmer fundamental. This is additive physical inspiration.
    for harmonic in range(1, 17):
        if frequency * harmonic >= RATE * .44:
            break
        ratio = harmonic * math.sqrt(1 + .000018 * harmonic * harmonic)
        amplitude = math.sin(math.pi * pluck * harmonic) / harmonic ** 1.16
        decay = (2.9 if note['kind'] == 'bass' else 2.15) / harmonic ** .43
        phase = 2 * math.pi * frequency * ratio * t
        if note['bend']:
            phase += .022 * (1 - np.exp(-t / .42)) * np.sin(2 * math.pi * 5.4 * t)
        signal += amplitude * np.sin(phase + harmonic * .031) * np.exp(-t / decay)
    # Quiet wood/body resonance and finger contact; no external sample assets.
    body = sum(np.sin(2 * math.pi * f * t) * np.exp(-t / d) for f, d in [(179, .105), (313, .083), (581, .061)])
    contact = rng.standard_normal(t.size) * np.exp(-t / .006)
    signal += body * .012 + contact * .025
    signal *= 1 - np.exp(-t / .0028)
    signal[-round(RATE * .22):] *= np.linspace(1, 0, round(RATE * .22)) ** 2
    return signal * note['velocity'] * .29


def render(notes):
    rng = np.random.default_rng(SEED + 1)
    count = round(DURATION * RATE)
    dry = np.zeros((count, 2), dtype=np.float64)
    for note in notes:
        signal = plucked_note(note, rng)
        start = round((note['beat'] * BEAT + float(rng.uniform(-.010, .010))) * RATE)
        indices = (np.arange(signal.size) + start) % count
        angle = (note['pan'] + 1) * math.pi / 4
        dry[indices, 0] += signal * math.cos(angle)
        dry[indices, 1] += signal * math.sin(angle)
    # Circular early reflections preserve the seam rather than truncating tails.
    wet = np.zeros_like(dry)
    for delay, gain in [(.079, .105), (.127, .078), (.211, .058), (.337, .042), (.563, .030), (.887, .019), (1.207, .011)]:
        shift = round(delay * RATE)
        wet[:, 0] += np.roll(dry[:, 1], shift) * gain
        wet[:, 1] += np.roll(dry[:, 0], shift + round(.011 * RATE)) * gain
    mix = dry + wet
    # Remove DC and leave ample headroom. No hard clipping or loudness pumping.
    mix -= mix.mean(axis=0)
    mix *= .67 / np.max(np.abs(mix))
    return mix


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ffmpeg', default=shutil.which('ffmpeg'))
    args = parser.parse_args()
    if not args.ffmpeg:
        raise SystemExit('Authoring requires ffmpeg to encode the compact local MP3.')
    output = ROOT / 'public/audio'
    output.mkdir(parents=True, exist_ok=True)
    notes = compose()
    mix = render(notes)
    mp3 = output / 'peony-guzheng-original.mp3'
    with tempfile.TemporaryDirectory(prefix='mdgs-peony-music-') as temp:
        wav = Path(temp) / 'peony.wav'
        with wave.open(str(wav), 'wb') as file:
            file.setnchannels(2)
            file.setsampwidth(2)
            file.setframerate(RATE)
            file.writeframes((mix * 32767).astype('<i2').tobytes())
        subprocess.run([args.ffmpeg, '-y', '-hide_banner', '-loglevel', 'error', '-i', str(wav), '-codec:a', 'libmp3lame', '-b:a', '128k',
                        '-metadata', 'title=Peony Study - Original Pentatonic Plucked Strings', '-metadata', 'artist=MDGS original procedural score',
                        '-metadata', 'comment=Original synthesized guzheng-inspired accompaniment. No human performance or borrowed recording.', str(mp3)], check=True)
    score = dict(title='牡丹书房 原创五声拨弦', authorship='Original algorithmic score and synthesized instrument, written for this project; no external recordings or melodies.',
                 durationSeconds=DURATION, tempoBpm=TEMPO, beats=BEATS, sampleRate=RATE, channels=2, seed=SEED,
                 scale='D gong pentatonic: D E F# A B', notes=notes)
    (output / 'peony-guzheng-score.json').write_text(json.dumps(score, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    provenance = dict(created='2026-10-21', file=mp3.name, bytes=mp3.stat().st_size, sha256=hashlib.sha256(mp3.read_bytes()).hexdigest(),
                      durationSeconds=DURATION, sampleRate=RATE, channels=2, codec='MP3 128 kbps', authoringScript='scripts/create-peony-music.py',
                      source='Locally synthesized additive plucked strings with circular stereo reflections; deterministic original pentatonic composition.',
                      attribution='Synthetic guzheng-inspired timbre, not a recording of a human or a real guzheng.', externalAudioSources=[],
                      sourcePeak=float(np.max(np.abs(mix))), sourceRms=float(np.sqrt(np.mean(mix * mix))),
                      sourceSeamStep=float(np.max(np.abs(mix[0] - mix[-1]))), noteCount=len(notes), reproducibleSeed=SEED)
    (output / 'provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps(provenance, ensure_ascii=False))


if __name__ == '__main__':
    main()
