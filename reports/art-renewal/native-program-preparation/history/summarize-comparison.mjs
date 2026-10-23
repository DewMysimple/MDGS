import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const directory = path.dirname(fileURLToPath(import.meta.url));
const run = process.argv[2] ?? '2026-10-22T23-39-18-467Z';
const runDirectory = path.join(directory, 'runs', run);
const bytes = await fs.readFile(path.join(runDirectory, 'validation.json'));
const report = JSON.parse(bytes);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const cases=[];
for (const item of report.cases) {
  const cpuBytes=await fs.readFile(path.join(runDirectory,item.cpu.path));
  if(sha(cpuBytes)!==item.cpu.sha256)throw new Error('CPU artifact drift');
  const cpu=JSON.parse(cpuBytes),nodes=new Map(cpu.nodes.map(n=>[n.id,n]));
  const totals={};
  for(let i=0;i<cpu.samples.length;i++){
    const name=nodes.get(cpu.samples[i]).callFrame.functionName;
    totals[name]=(totals[name]??0)+cpu.timeDeltas[i]/1000;
  }
  const loading=item.entryGates.phases.find(p=>p.phase==='SCROLL_LOADING').at;
  const visibleGateStart=Math.max(loading,item.entryGates.paperReadyAt);
  cases.push({ index:item.index,kind:item.kind,entryMilliseconds:item.entryWallMilliseconds,
    loadingPhaseAt:loading,paperReadyAt:item.entryGates.paperReadyAt,
    nativeFirstFrameDiagnosticAt:item.entryGates.nativeFirstFrameReadyAt,
    conservativeVisiblePaperGateStart:visibleGateStart,
    visiblePaperBeforeViewerMilliseconds:item.entryGates.viewerAt-visibleGateStart,
    windowMilliseconds:item.measurement.windowMilliseconds,
    rAF:item.measurement.rAFGapsMilliseconds,
    longtaskCount:item.measurement.longtasksWindow.length,
    longtaskTotalMs:item.measurement.longtasksWindow.reduce((n,e)=>n+e.duration,0),
    nativeCounterPerSecond:item.measurement.nativeCounterAveragePerSecond,
    sourceClockError:item.clock.error,
    cpuWholeAutoplaySelfMilliseconds:{getProgramInfoLog:totals.getProgramInfoLog??0,
      texSubImage2D:totals.texSubImage2D??0,opaqueNativeProgram:totals['(program)']??0,idle:totals['(idle)']??0},
    cpuTopSelf:Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,12),
    heapEndpointsMiB:{before:item.metricsBefore.JSHeapUsedSize/1048576,after:item.metricsAfter.JSHeapUsedSize/1048576},
    warmup:item.warmup,
  });
}
const summary={status:report.status,summarizedAt:new Date().toISOString(),raw:{run,path:`runs/${run}/validation.json`,sha256:sha(bytes)},
  methodology:report.scope,
  correction:'The raw driver field visiblePaperBeforeViewerMilliseconds subtracts the first paper-ready DOM observation, which can precede the SCROLL_LOADING visible ceremony. This summary corrects that derived label using viewerAt - max(paperReadyAt,SCROLL_LOADING.at). Raw bytes are retained unchanged. Neither field proves optical screen presentation; they document actual page stage and resource gates.',
  sourceAndPackagesUnchanged:report.sourceAndPackagesUnchanged,cases,
  decision:'Promising isolated c3 result; unadopted. Hardware cancellation/context/error, all-four-scroll behavior and strict59-frame/243-original fidelity remain required. Do not generalize monitor FPS, shader GPU time or memory retention from these observations.'};
await fs.writeFile(path.join(directory,'ab-comparison-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({status:summary.status,cases:cases.map(c=>({kind:c.kind,entry:c.entryMilliseconds,maxGap:c.rAF.max,queriesMs:c.cpuWholeAutoplaySelfMilliseconds.getProgramInfoLog,visiblePaper:c.visiblePaperBeforeViewerMilliseconds}))}));
