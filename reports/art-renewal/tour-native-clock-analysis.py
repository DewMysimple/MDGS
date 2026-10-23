import argparse, hashlib, json
from pathlib import Path
import numpy as np

parser=argparse.ArgumentParser(description='Check unedited stereo Float32 PCM against an independent native a-rate ramp and native sine.')
parser.add_argument('run',type=Path)
parser.add_argument('--output',type=Path,required=True)
a=parser.parse_args()
r=json.loads((a.run/'reference.json').read_text(encoding='utf-8'))
d=json.loads((a.run/'diagnostics.json').read_text(encoding='utf-8'))
raw=a.run/'reference.f32'
x=np.memmap(raw,dtype='<f4',mode='r').reshape(-1,2)
reference=r['reference']; rate=reference['rate']
first=d['firstFrame']; absolute=np.arange(len(x),dtype=np.float64)+first
phase=absolute-reference['whenFrame']
active=(phase>=128)&(phase<reference['duration']*rate-128)
expected=phase[active]
frame_error=x[active,0].astype(np.float64)*reference['rampScale']-expected
sine_expected=reference['sineAmplitude']*np.sin(2*np.pi*reference['frequency']*expected/rate)
sine_actual=x[active,1].astype(np.float64)
sine_error=sine_actual-sine_expected
clock=d.get('nativeClockAudit',{})
checks={
 'strict_capture_passed':r.get('strictCaptureStatus')=='passed',
 'zero_transport_or_write_violations':not d['violations'],
 'zero_port_sequence_violations':not (d.get('state') or d.get('currentState') or {}) .get('portSequenceViolations',[]),
 'valid_independent_native_label_audit':clock.get('valid') is True,
 'native_output_epoch_spread_within_one_video_frame':r.get('audio',{}).get('clockSpreadSeconds',float('inf'))<=1/30,
 'raw_bytes_equal_actual_written_bytes':raw.stat().st_size==d['writtenBytes'],
 'actual_written_frames_equal_process_count':len(x)==d['writtenFrames']==clock.get('processedFrames'),
 'at_least_59_seconds_of_reference':int(active.sum())>59*rate,
 'ramp_max_error_below_half_sample':float(np.max(np.abs(frame_error)))<.5,
 'sine_correlation_above_0_99998':float(np.corrcoef(sine_actual,sine_expected)[0,1])>.99998,
 'sine_max_absolute_error_below_5e_6':float(np.max(np.abs(sine_error)))<5e-6,
}
report={
 'status':'passed' if all(checks.values()) else 'failed','checks':checks,
 'run':a.run.as_posix(),'helperSha256':r['helperSha256'],
 'scope':'Independent native ConstantSource AudioParam a-rate ramp and separate 997Hz Oscillator. Reference does not use worklet currentFrame. Raw PCM is read without alteration; this does not backfill any prior failed recording.',
 'strictCaptureStatus':r.get('strictCaptureStatus'),'reference':reference,
 'rawFrames':len(x),'rawBytes':raw.stat().st_size,'rawSha256':hashlib.sha256(raw.read_bytes()).hexdigest(),
 'sampleRate':rate,'absoluteFirstFrame':first,'processes':clock.get('observedProcesses'),
 'acceptedSingleQuantumStales':sum(run['processCount']==1 for run in clock.get('acceptedFrozenTagRuns',[])),
 'acceptedFrozenTagRuns':len(clock.get('acceptedFrozenTagRuns',[])),
 'frozenTagRunLengths':[run['processCount'] for run in clock.get('acceptedFrozenTagRuns',[])],
 'acceptedFrozenTagProcesses':len(clock.get('acceptedMetadataStales',[])),
 'outputEpochSpreadSeconds':r.get('audio',{}).get('clockSpreadSeconds'),
 'nativeLabelIssues':clock.get('issues',[]),
 'packetCount':len(d['packets']),'packetViolations':len(d['violations']),
 'rampActiveSamples':int(active.sum()),'rampFrameErrorMaxAbs':float(np.max(np.abs(frame_error))),
 'rampFrameErrorRMS':float(np.sqrt(np.mean(frame_error**2))),
 'rampErrorsAtLeastHalfSample':int(np.count_nonzero(np.abs(frame_error)>=.5)),
 'sineCorrelation':float(np.corrcoef(sine_actual,sine_expected)[0,1]),
 'sineErrorMaxAbs':float(np.max(np.abs(sine_error))),
 'sineErrorRMS':float(np.sqrt(np.mean(sine_error**2))),
 'writtenFrames':d['writtenFrames'],'counterSpanFrames':d['globalSpanFrames'],
 'nativeLabelSpanFrames':clock.get('nativeLabelSpanFrames'),
 'recordingFailure':r.get('finishFailure'),
 'limits':'Native-reference PCM continuity is established only for this actual run and its frozen helper. Final video alignment additionally has clock-estimate and video-frame granularity. No specific Chromium build-symbol root cause is claimed.'
}
a.output.parent.mkdir(parents=True,exist_ok=True)
a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({k:report[k] for k in ['status','run','strictCaptureStatus','acceptedSingleQuantumStales','packetViolations','rampFrameErrorMaxAbs','sineCorrelation','sineErrorMaxAbs']},ensure_ascii=False))
raise SystemExit(0 if report['status']=='passed' else 1)
