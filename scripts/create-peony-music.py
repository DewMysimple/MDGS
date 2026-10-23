"""Render the original v3 soundscape, 一庭春深 / A Courtyard in Spring.

Original composition and modal synthesis; no sampled performances, borrowed
melodies or third-party audio. This is a poetic digital timbre, not a claim to
reproduce an acoustic guzheng or xiao exactly. NumPy/FFmpeg are authoring-only.
The v1/v2 candidates are retained. Default output is three newly rendered v3
stems, never separation of an existing recording. --edition v2 reproduces v2.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import tempfile
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RATE = 44100
TEMPO = 48
BEAT = 60 / TEMPO
BEATS = 128
DURATION = BEAT * BEATS
SEED = 20261023
STEM = 'peony-courtyard-v2'
SECTIONS = [
    dict(name='山野初醒', startBeat=0, endBeat=32, intention='疏落拨弦，像晨光初入一庭花木。'),
    dict(name='花入人间', startBeat=32, endBeat=64, intention='旋律稍向上生长，箫意长音在远处应答。'),
    dict(name='锦绣寄意', startBeat=64, endBeat=96, intention='回到温暖中低音区，把留白交还给画面。'),
    dict(name='国色余韵', startBeat=96, endBeat=128, intention='动机舒展后缓缓归根，余音接回新的一轮。'),
]


def frequency(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def compose():
    """Non-quantized breaths around a D-gong motif; no regular ostinato."""
    phrases = [
        [(4.2,62,.56),(7.6,69,.36),(11.1,64,.45),(13.6,66,.52),
         (17.5,69,.48),(20.2,66,.35),(23.8,64,.42),(27.0,62,.51)],
        [(1.0,66,.52),(4.8,69,.56),(7.1,71,.44),(10.7,74,.56),
         (15.0,71,.37),(18.4,69,.44),(22.2,66,.42),(26.4,64,.32)],
        [(2.3,62,.49),(6.1,59,.37),(10.4,62,.44),(13.2,64,.38),
         (16.1,66,.48),(20.5,64,.39),(24.4,59,.31),(28.1,62,.42)],
        [(1.2,62,.47),(4.0,66,.49),(7.7,69,.48),(11.0,74,.54),
         (15.4,71,.36),(18.9,69,.42),(22.1,66,.38),(25.0,64,.34),
         (28.0,62,.42)],
    ]
    rng = np.random.default_rng(SEED)
    notes = []
    for section, phrase in enumerate(phrases):
        for index, (beat, pitch, strength) in enumerate(phrase):
            notes.append(dict(beat=round(section*32+beat+float(rng.uniform(-.055,.055)),5),
                              midi=pitch, velocity=round(strength,4), kind='silk',
                              pan=round(float(rng.uniform(-.19,.13)),4),
                              bend=index in (2,5), duration=9.5))
    for beat,pitch,strength in [(1.5,50,.17),(18.3,57,.11),(32.2,50,.14),
                               (52.5,57,.10),(65.1,50,.16),(83.0,54,.10),
                               (96.0,50,.14),(115.6,57,.09),(123.8,50,.08)]:
        notes.append(dict(beat=beat,midi=pitch,velocity=strength,kind='low',pan=-.22,bend=False,duration=12))
    for beat,pitch,strength in [(9.9,81,.11),(25.3,78,.095),(39.7,81,.09),
                               (57.2,78,.10),(73.3,76,.085),(89.2,81,.08),
                               (105.1,86,.075),(119.4,81,.075)]:
        notes.append(dict(beat=beat,midi=pitch,velocity=strength,kind='harmonic',pan=.32,bend=False,duration=8))
    for beat,pitch,strength,duration in [(36.4,69,.095,8.8),(47.0,66,.085,9.5),
                                        (78.1,62,.075,10.4),(99.5,69,.08,9.8),
                                        (111.9,66,.075,10.0)]:
        notes.append(dict(beat=beat,midi=pitch,velocity=strength,kind='breath',pan=.13,bend=True,duration=duration))
    return sorted(notes,key=lambda note:note['beat'])


def colored_noise(count, rng, cutoff):
    """A band-limited contact/breath component, authored without samples."""
    noise = rng.standard_normal(count)
    spectrum = np.fft.rfft(noise)
    frequencies = np.fft.rfftfreq(count,1/RATE)
    spectrum *= (frequencies/240)**.45 / (1+(frequencies/cutoff)**4)
    signal = np.fft.irfft(spectrum,n=count)
    return signal/(np.sqrt(np.mean(signal*signal))+1e-12)


def plucked_note(note,rng):
    """Damped inharmonic string modes, two polarizations and a soft contact."""
    f = frequency(note['midi'])
    t = np.arange(round(note['duration']*RATE),dtype=np.float64)/RATE
    signal = np.zeros(t.size,dtype=np.float64)
    position = float(rng.uniform(.19,.25))
    stiffness = .000009 if note['kind']=='low' else .000018
    decay = note.get('decay', {'low':4.8,'silk':3.7,'harmonic':4.2}[note['kind']])
    detune = float(rng.uniform(.00013,.00038))
    drift = .0009*np.exp(-t/.09)
    if note['bend']:
        drift += .0012*(1-np.exp(-t/.7))*np.sin(2*np.pi*4.5*t)*np.exp(-t/5)
    phase_clock = np.cumsum(1+drift)/RATE
    modes = 20 if note['kind']!='harmonic' else 5
    for k in range(1,modes+1):
        fk = f*k*math.sqrt(1+stiffness*k*k)
        if fk>RATE*.43:
            break
        partial = math.sin(np.pi*position*k)/(k**1.32)
        tau = decay/(k**.64)
        env = (1-np.exp(-t/(.0035+.00035*k)))*np.exp(-t/tau)
        phase = 2*np.pi*fk*phase_clock+.018*k
        signal += partial*env*(.83*np.sin(phase)+.17*np.sin(phase*(1+detune)))
    contact = colored_noise(t.size,rng,2600)*np.exp(-t/.009)*(1-np.exp(-t/.001))
    signal += contact*.008
    for body_f,amp,tau in [(164,.008,.095),(291,.006,.11),(521,.003,.08)]:
        signal += amp*np.sin(2*np.pi*body_f*t)*(1-np.exp(-t/.002))*np.exp(-t/tau)
    tail = min(round(.45*RATE),t.size)
    signal[-tail:] *= .5+.5*np.cos(np.linspace(0,np.pi,tail))
    return signal*note['velocity']*.35


def breath_note(note,rng):
    t = np.arange(round(note['duration']*RATE),dtype=np.float64)/RATE
    f = frequency(note['midi'])
    cents = 2.4*np.sin(2*np.pi*.19*t)+2.2*np.sin(2*np.pi*4.65*t)*(1-np.exp(-t/1.5))
    phase = 2*np.pi*np.cumsum(f*2**(cents/1200))/RATE
    attack = np.minimum(1,t/1.5)
    release = np.minimum(1,(note['duration']-t)/2.1)
    envelope = np.sin(attack*np.pi/2)**2*np.sin(release*np.pi/2)**2
    envelope *= .9+.1*np.sin(2*np.pi*.12*t)
    tone = np.sin(phase)+.17*np.sin(2*phase+.14)+.032*np.sin(3*phase)
    air = colored_noise(t.size,rng,1900)
    return (tone+air*.035)*envelope*note['velocity']*.21


def room_impulse(rng,side):
    """Diffuse synthetic room, not evenly repeated echo taps."""
    count = round(4.6*RATE)
    t = np.arange(count)/RATE
    cloud = colored_noise(count,rng,2600)
    cloud *= (1-np.exp(-t/.11))*np.exp(-t/1.12)
    cloud[:round(.033*RATE)] = 0
    cloud *= .28/(np.sqrt(np.sum(cloud*cloud))+1e-12)
    for delay,gain in [(.047,.14),(.082,.09),(.131,.07),(.197,.04)]:
        at=round((delay+side*.006)*RATE)
        cloud[at] += gain
    cloud[-round(.3*RATE):] *= np.linspace(1,0,round(.3*RATE))**2
    return cloud


def circular_convolution(signal,impulse):
    count = signal.size
    padded = np.zeros(count,dtype=np.float64)
    padded[:impulse.size] = impulse
    return np.fft.irfft(np.fft.rfft(signal)*np.fft.rfft(padded),n=count)


def render(notes):
    rng = np.random.default_rng(SEED+1)
    count = round(DURATION*RATE)
    dry = np.zeros((count,2),dtype=np.float64)
    for note in notes:
        signal = breath_note(note,rng) if note['kind']=='breath' else plucked_note(note,rng)
        start = round(note['beat']*BEAT*RATE)
        indices = (np.arange(signal.size)+start)%count
        angle = (note['pan']+1)*np.pi/4
        dry[indices,0] += signal*math.cos(angle)
        dry[indices,1] += signal*math.sin(angle)
    mix = dry.copy()
    for side in (0,1):
        room = room_impulse(rng,side)
        excitation = .73*dry[:,side]+.27*dry[:,1-side]
        mix[:,side] += circular_convolution(excitation,room)*.47
    hz = np.fft.rfftfreq(count,1/RATE)
    for side in (0,1):
        spectrum = np.fft.rfft(mix[:,side])
        spectrum *= (1-np.exp(-(hz/36)**4))/np.sqrt(1+(hz/6500)**6)
        mix[:,side] = np.fft.irfft(spectrum,n=count)
    mix *= .54/max(float(np.max(np.abs(mix))),1e-12)
    return mix


def metrics(signal):
    mono=signal.mean(axis=1)
    derivative=np.diff(signal,axis=0)
    rms=float(np.sqrt(np.mean(signal*signal)))
    peak=float(np.max(np.abs(signal)))
    seam=float(np.max(np.abs(signal[0]-signal[-1])))
    windows=[float(np.sqrt(np.mean(window*window))) for window in np.array_split(signal,round(DURATION))]
    return dict(peak=peak,peakDbfs=round(20*math.log10(max(peak,1e-12)),3),rms=rms,
                rmsDbfs=round(20*math.log10(max(rms,1e-12)),3),
                crestFactorDb=round(20*math.log10(peak/max(rms,1e-12)),3),
                seamStep=seam,seamDbfs=round(20*math.log10(max(seam,1e-12)),3),
                ordinaryStepRms=float(np.sqrt(np.mean(derivative*derivative))),
                stereoCorrelation=float(np.corrcoef(signal[:,0],signal[:,1])[0,1]),
                secondsBelowMinus42Dbfs=sum(value<10**(-42/20) for value in windows),
                dcOffset=list(map(float,signal.mean(axis=0))),
                monoRms=float(np.sqrt(np.mean(mono*mono))))


def render_v2(ffmpeg):
    args=argparse.Namespace(ffmpeg=ffmpeg)
    if not args.ffmpeg:
        raise SystemExit('FFmpeg is required to encode the authored local MP3.')
    output=ROOT/'artwork/audio/candidates/v2'
    report_dir=ROOT/'reports/art-renewal'
    output.mkdir(parents=True,exist_ok=True)
    report_dir.mkdir(parents=True,exist_ok=True)
    notes=compose()
    mix=render(notes)
    mp3=output/f'{STEM}.mp3'
    with tempfile.TemporaryDirectory(prefix='mdgs-spring-score-') as temp:
        wav=Path(temp)/'spring.wav'
        with wave.open(str(wav),'wb') as file:
            file.setnchannels(2)
            file.setsampwidth(2)
            file.setframerate(RATE)
            file.writeframes((mix*32767).astype('<i2').tobytes())
        subprocess.run([args.ffmpeg,'-y','-hide_banner','-loglevel','error','-i',str(wav),
                        '-codec:a','libmp3lame','-b:a','160k','-write_xing','1',
                        '-metadata','title=A Courtyard in Spring - Original Peony Score v2',
                        '-metadata','artist=MDGS original procedural score',
                        '-metadata','comment=Original composition, digitally synthesized plucked strings and flute-like breath. No samples or borrowed melody.',
                        str(mp3)],check=True)
        decoded_path=Path(temp)/'decoded.f32'
        subprocess.run([args.ffmpeg,'-y','-hide_banner','-loglevel','error','-i',str(mp3),
                        '-f','f32le','-acodec','pcm_f32le','-ac','2','-ar',str(RATE),str(decoded_path)],check=True)
        decoded=np.fromfile(decoded_path,dtype='<f4').reshape(-1,2)
        analysis=dict(status='passed',source=metrics(mix),decodedMp3=metrics(decoded),
                      decodedFrames=decoded.shape[0],expectedFrames=mix.shape[0],
                      durationSeconds=decoded.shape[0]/RATE)
        if analysis['decodedMp3']['peak']>=.9 or analysis['decodedMp3']['seamStep']>.003:
            raise RuntimeError('The decoded score failed headroom or loop continuity checks.')
    score=dict(title='一庭春深',englishTitle='A Courtyard in Spring',version=2,
               authorship='Original composition and modal synthesis written for MDGS. No external melody, performance or audio sample.',
               durationSeconds=DURATION,tempoBpm=TEMPO,beats=BEATS,sampleRate=RATE,channels=2,seed=SEED,
               scale='D gong pentatonic: D E F# A B',sections=SECTIONS,notes=notes)
    (output/f'{STEM}-score.json').write_text(json.dumps(score,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    provenance=dict(created='2026-10-23',file=mp3.name,bytes=mp3.stat().st_size,
                    sha256=hashlib.sha256(mp3.read_bytes()).hexdigest(),durationSeconds=DURATION,
                    sampleRate=RATE,channels=2,codec='MP3 160 kbps',authoringScript='scripts/create-peony-music.py',
                    attribution='Original digital score with guzheng-inspired modal plucks and flute-like breath; not a human/acoustic performance.',
                    externalAudioSources=[],technicalReferences=[
                        'https://www.dsprelated.com/freebooks/pasp/Ideal_Plucked_String.html',
                        'https://www.w3.org/TR/webaudio-1.0/'],
                    noteCount=len(notes),reproducibleSeed=SEED,
                    validation='reports/art-renewal/audio-validation.json')
    (output/f'{STEM}-provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    analysis['file']=provenance
    analysis['limitations']='Signal analysis verifies headroom and continuity; it does not establish subjective musical quality or physical speaker performance.'
    (report_dir/'audio-validation.json').write_text(json.dumps(analysis,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    print(json.dumps(dict(file=mp3.name,bytes=mp3.stat().st_size,durationSeconds=DURATION,
                         notes=len(notes),source=analysis['source'],decoded=analysis['decodedMp3']),ensure_ascii=False))


def compose_v3():
    """A contemporary five-note palette; not historical Tang music."""
    phrases = [
        [(4.8,62,.46),(10.6,64,.34),(15.9,66,.42),(21.7,69,.37),(25.0,66,.29)],
        [(36.0,69,.40),(41.7,71,.34),(47.4,74,.43),(52.9,69,.32),(57.0,66,.28)],
        [(69.0,62,.39),(74.8,59,.30),(80.1,64,.35),(85.3,66,.32),(89.8,62,.27)],
        [(104.0,62,.36),(110.2,66,.40),(116.0,69,.39),(122.0,66,.29),
         (134.0,64,.32),(140.8,62,.34),(148.1,57,.22)],
    ]
    notes=[]
    rng=np.random.default_rng(SEED+30)
    for phrase in phrases:
        for i,(time,pitch,velocity) in enumerate(phrase):
            notes.append(dict(time=time,beat=time/BEAT,midi=pitch,velocity=velocity,
                              kind='silk',stem='strings',pan=round(float(rng.uniform(-.16,.12)),4),
                              bend=i==2,duration=6,decay=1.45))
    for time,pitch in [(3.8,50),(35.0,57),(68.0,50),(103.0,54),(133.0,50)]:
        notes.append(dict(time=time,beat=time/BEAT,midi=pitch,velocity=.10,kind='low',
                          stem='strings',pan=-.12,bend=False,duration=7,decay=1.9))
    for time,pitch in [(19.0,81),(44.0,78),(76.0,76),(112.0,81),(137.0,78),(150.0,74)]:
        notes.append(dict(time=time,beat=time/BEAT,midi=pitch,velocity=.065,kind='harmonic',
                          stem='breath',pan=0,bend=False,duration=4.5,decay=1.25))
    for time,pitch,duration in [(48.0,66,7),(82.0,62,6),(141.0,69,6.8)]:
        notes.append(dict(time=time,beat=time/BEAT,midi=pitch,velocity=.075,kind='breath',
                          stem='breath',pan=0,bend=True,duration=duration))
    return sorted(notes,key=lambda note:note['time'])


SILENT_WINDOWS = [(0,3),(29,34),(61,67),(94,102),(127,132),(155,160)]


def silence_envelope(count):
    t=np.arange(count)/RATE
    envelope=np.ones(count)
    for begin,end in SILENT_WINDOWS:
        envelope[(t>=begin)&(t<end)]=0
        before=(t>=begin-.8)&(t<begin)
        after=(t>=end)&(t<end+.9)
        envelope[before]*=.5+.5*np.cos(np.pi*(t[before]-(begin-.8))/.8)
        envelope[after]*=.5-.5*np.cos(np.pi*(t[after]-end)/.9)
    return envelope


def render_v3_stem(notes,stem):
    rng=np.random.default_rng(SEED+(31 if stem=='strings' else 32))
    count=round(DURATION*RATE)
    channels=2 if stem=='strings' else 1
    dry=np.zeros((count,channels))
    for note in (n for n in notes if n['stem']==stem):
        signal=breath_note(note,rng) if note['kind']=='breath' else plucked_note(note,rng)
        start=round(note['time']*RATE)
        length=min(signal.size,count-start)
        if channels==2:
            angle=(note['pan']+1)*np.pi/4
            dry[start:start+length,0]+=signal[:length]*math.cos(angle)
            dry[start:start+length,1]+=signal[:length]*math.sin(angle)
        else: dry[start:start+length,0]+=signal[:length]
    # Short diffuse reflections belong to their own instruments. There is no
    # hidden pitched tail inside the atmosphere track after A/B are withdrawn.
    for side in range(channels):
        impulse=room_impulse(rng,side)
        dry[:,side]+=circular_convolution(dry[:,side].copy(),impulse)*.21
    hz=np.fft.rfftfreq(count,1/RATE)
    for side in range(channels):
        spectrum=np.fft.rfft(dry[:,side])
        spectrum*=(1-np.exp(-(hz/35)**4))/np.sqrt(1+(hz/5900)**6)
        dry[:,side]=np.fft.irfft(spectrum,n=count)
    dry*=silence_envelope(count)[:,None]
    # Combined full-scale peak bounds leave room for independent mixing/cues.
    dry*= (.42 if stem=='strings' else .16)/max(float(np.max(np.abs(dry))),1e-12)
    return dry


def render_atmosphere():
    rng=np.random.default_rng(SEED+33)
    count=24*RATE;t=np.arange(count)/RATE
    # A quiet unpitched, circular texture. No sampled wind/foley, no implied
    # historical ambience, and no melody buried in this independently held bed.
    frequencies=np.fft.rfftfreq(count,1/RATE)
    spectrum=np.fft.rfft(rng.standard_normal(count))
    spectrum*=(frequencies/180)**.8/(1+(frequencies/1250)**4)
    signal=np.fft.irfft(spectrum,n=count)
    signal*=.47+.23*np.sin(2*np.pi*t/24)+.13*np.cos(2*np.pi*t/8)
    signal-=signal.mean();signal*=.018/max(float(np.max(np.abs(signal))),1e-12)
    # Crossfade a small circular boundary so compressed playback has no click.
    edge=round(.3*RATE);bridge=(signal[:edge]+signal[-edge:])*.5
    blend=np.linspace(0,1,edge)
    signal[:edge]=bridge*(1-blend)+signal[:edge]*blend
    signal[-edge:]=signal[-edge:]*(1-blend)+bridge*blend
    signal[0]=signal[-1]=(signal[0]+signal[-1])*.5
    return signal[:,None]


def encode_v3(ffmpeg,signal,path,temp):
    wav=temp/(path.stem+'.wav')
    with wave.open(str(wav),'wb') as file:
        file.setnchannels(signal.shape[1]);file.setsampwidth(2);file.setframerate(RATE)
        file.writeframes(np.round(signal*32767).astype('<i2').tobytes())
    bitrate='128k' if signal.shape[1]==2 else ('64k' if 'atmosphere' in path.stem else '96k')
    subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-i',str(wav),'-codec:a','libmp3lame',
                    '-b:a',bitrate,'-write_xing','1','-metadata','title=A Courtyard in Spring - Original Digital Soundscape v3',
                    '-metadata','artist=MDGS original procedural composition',
                    '-metadata','comment=Independent original synthesis, not an acoustic performance or historical reconstruction.',str(path)],check=True)
    raw=subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-i',str(path),'-f','f32le','-acodec','pcm_f32le','-'],stdout=subprocess.PIPE,check=True).stdout
    return np.frombuffer(raw,dtype='<f4').reshape(-1,signal.shape[1]).astype(np.float64)


def music_silence_seconds(signal,rate):
    mono_power=np.mean(signal*signal,axis=1)
    size=round(rate*.1)
    blocks=mono_power[:len(mono_power)//size*size].reshape(-1,size).mean(axis=1)
    return round(float(np.sum(blocks<10**(-45/10))*.1),2)


def main_v3(ffmpeg):
    global RATE
    RATE=32000
    output=ROOT/'public/audio';reports=ROOT/'reports/art-renewal'
    output.mkdir(parents=True,exist_ok=True);reports.mkdir(parents=True,exist_ok=True)
    notes=compose_v3();decoded=[];stems=[]
    with tempfile.TemporaryDirectory(prefix='mdgs-soundscape-v3-') as directory:
        temp=Path(directory)
        for name in ['strings','breath','atmosphere']:
            signal=render_atmosphere() if name=='atmosphere' else render_v3_stem(notes,name)
            path=output/f'peony-v3-{name}.mp3'
            pcm=encode_v3(ffmpeg,signal,path,temp);decoded.append(pcm)
            peak=float(np.max(np.abs(pcm)));seam=float(np.max(np.abs(pcm[0]-pcm[-1])))
            item=dict(name=name,file=path.name,durationSeconds=pcm.shape[0]/RATE,channels=pcm.shape[1],
                      sampleRate=RATE,frames=pcm.shape[0],bytes=path.stat().st_size,
                      sha256=hashlib.sha256(path.read_bytes()).hexdigest(),decodedPeak=peak,
                      decodedPeakDbfs=round(20*math.log10(max(peak,1e-12)),3),
                      loopSeamStep=seam,loopSeamDbfs=round(20*math.log10(max(seam,1e-12)),3))
            if seam>.002 or peak>.6:raise RuntimeError(f'{name}: headroom/seam failed')
            stems.append(item)
        music=decoded[0]+decoded[1]
        quiet=music_silence_seconds(music,RATE)
        atmosphere=np.tile(decoded[2],(math.ceil(len(music)/len(decoded[2])),1))[:len(music)]
        mix=music+atmosphere
        # Archive the audition outside public/ so builds cannot deploy it.
        # It uses the same full stem levels, with no runtime mix or ducking.
        audition=ROOT/'artwork/audio/peony-v3-audition.mp3'
        audition.parent.mkdir(parents=True,exist_ok=True)
        decoded_mix=encode_v3(ffmpeg,mix,audition,temp)
        peak=float(np.max(np.abs(decoded_mix)))
        if quiet<12 or peak>=10**(-3/20):raise RuntimeError('Music silence/headroom target failed')
    manifest=dict(version=3,title='一庭春深',musicCycleSeconds=DURATION,stems=stems,
                  interpretation='Contemporary original digital soundscape, not a real guqin/guzheng/xiao performance or a reconstruction of Tang music.')
    (output/'peony-v3-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    score=dict(title='一庭春深',version=3,scale='D gong five-note palette: D E F# A B; contemporary composition only',
               durationSeconds=DURATION,sampleRate=RATE,seed=SEED+30,silentWindowsSeconds=SILENT_WINDOWS,notes=notes)
    (output/'peony-v3-score.json').write_text(json.dumps(score,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    provenance=dict(created='2026-10-23',authorship='Original independent composition and synthesis for MDGS. No samples, borrowed tunes or separated recordings.',
                    authoringScript='scripts/create-peony-music.py',command='python scripts/create-peony-music.py --edition v3',
                    externalAudioSources=[],technicalReferences=['https://www.dsprelated.com/freebooks/pasp/Ideal_Plucked_String.html','https://www.w3.org/TR/webaudio-1.0/'],stems=stems)
    (output/'peony-v3-provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    report=dict(status='passed',method='Actual independent synthesis, MP3 encode/decode, 100ms RMS windows below -45 dBFS for music stems only.',
                musicalSilenceSeconds=quiet,requiredSilenceSeconds=12,silentWindowsSeconds=SILENT_WINDOWS,
                fullMixDecodedPeak=peak,fullMixDecodedPeakDbfs=round(20*math.log10(peak),3),
                fullMixAnalyticPeakUpperBound=sum(s['decodedPeak'] for s in stems),
                maximumRegionalPeakUpperBoundIncludingCues=stems[0]['decodedPeak']*1.2+stems[1]['decodedPeak']*.7+stems[2]['decodedPeak']*.45+.02,
                maximumRegionalPeakUpperBoundDbfs=round(20*math.log10(stems[0]['decodedPeak']*1.2+stems[1]['decodedPeak']*.7+stems[2]['decodedPeak']*.45+.02),3),
                stemCount=3,stems=stems,auditionFile=audition.relative_to(ROOT).as_posix(),
                limitations='Numerical checks do not establish subjective musical quality or physical instrument realism. Browser sync and lifecycle are separately verified.')
    loudness=subprocess.run([ffmpeg,'-hide_banner','-i',str(audition),'-af','ebur128=peak=true','-f','null','-'],
                            stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True).stderr.decode('utf8',errors='replace')
    summary=loudness.rsplit('Summary:',1)[-1]
    report['auditionEbur128']={}
    for key,pattern in [('integratedLufs',r'I:\s*([-\d.]+)\s*LUFS'),('loudnessRangeLu',r'LRA:\s*([-\d.]+)\s*LU'),('truePeakDbfs',r'Peak:\s*([-\d.]+)\s*dBFS')]:
        match=re.search(pattern,summary)
        if match:report['auditionEbur128'][key]=float(match.group(1))
    if report['auditionEbur128'].get('truePeakDbfs',0)>=-3:raise RuntimeError('Audition true-peak verification failed')
    (reports/'audio-v3-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    print(json.dumps(report,ensure_ascii=False))


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--ffmpeg',default=shutil.which('ffmpeg'))
    parser.add_argument('--edition',choices=['v2','v3'],default='v3');args=parser.parse_args()
    if not args.ffmpeg:raise SystemExit('FFmpeg is required for audio authoring.')
    if args.edition=='v2':render_v2(args.ffmpeg)
    else:main_v3(args.ffmpeg)


if __name__=='__main__':main()
