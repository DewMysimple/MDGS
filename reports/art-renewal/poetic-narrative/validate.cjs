const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),child=require('node:child_process'),ts=require('typescript');
const root=path.resolve(__dirname,'../../..');process.chdir(root);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function evaluate(source){const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});return exports;}
const file='src/data/poeticNarrative.ts',bytes=fs.readFileSync(file),{buildPoeticTrack,poeticNarrativeScenes,poeticSourceNotes}=evaluate(bytes.toString('utf8'));
const originalFile='src/data/newNarrative.ts',originalBytes=fs.readFileSync(originalFile),original=evaluate(originalBytes.toString('utf8'));
const originalAtHead=evaluate(child.execFileSync('git',['show',`HEAD:${originalFile}`],{encoding:'utf8'}));
const checks=[],chapters=[];const check=(name,pass,detail)=>checks.push({name,pass:!!pass,...(detail?{detail}: {})});
const hanCount=text=>[...text].filter(character=>/[\u3400-\u9fff]/u.test(character)).length;
check('25 original paragraphs unchanged from HEAD',JSON.stringify(original.narrativeChapters)===JSON.stringify(originalAtHead.narrativeChapters));
check('original paragraph count is 25',Object.values(original.narrativeChapters).reduce((n,c)=>n+c.paragraphs.length,0)===25);
for(let id=1;id<=4;id++){
 const asset=`public/assets/new-scrolls/chapter-${id}/scene.json`,assetBytes=fs.readFileSync(asset),scene=JSON.parse(assetBytes),duration=(scene.frameRange[1]-scene.frameRange[0])*(scene.fpsBase||1)/scene.fps;
 const stopsBefore=JSON.stringify(scene.stops),track=buildPoeticTrack(id,scene.stops,duration),gaps=[];
 check(`chapter ${id}: source duration matches endpoints`,Math.abs(duration-scene.sourceDurationSeconds)<1e-9);
 check(`chapter ${id}: input stops untouched`,stopsBefore===JSON.stringify(scene.stops));
 const rows=track.map((cue,index)=>{const previous=track[index-1],visible=(cue.end-cue.start)*duration,gapBefore=previous?(cue.start-previous.end)*duration:cue.start*duration;gaps.push(gapBefore);return{id:cue.id,sourceNode:cue.sourceNode,sourceStop:cue.paragraphIndex+1,heading:cue.heading,text:cue.text,hanzi:hanCount(cue.text),characters:[...cue.text].length,startSeconds:cue.start*duration,endSeconds:cue.end*duration,visibleSeconds:visible,purePictureBeforeSeconds:gapBefore,hanziPerVisibleSecond:hanCount(cue.text)/visible};});
 const tail=track.length?(1-track.at(-1).end)*duration:duration;gaps.push(tail);
 check(`chapter ${id}: every source stop represented`,scene.stops.every(stop=>track.some(cue=>cue.sourceNode.split(' ／ ').includes(stop.name))));
 check(`chapter ${id}: 12–26 Han characters`,rows.every(row=>row.hanzi>=12&&row.hanzi<=26));
 check(`chapter ${id}: 3.5–8 visible seconds`,rows.every(row=>row.visibleSeconds>=3.5-1e-9&&row.visibleSeconds<=8+1e-9));
 check(`chapter ${id}: ordered and within source film`,track.every((cue,index)=>cue.start>=0&&cue.end<=1&&cue.start<cue.end&&(!index||cue.start>=track[index-1].end)));
 check(`chapter ${id}: 0.5–2 seconds of picture between cues and at ending`,gaps.slice(1).every(gap=>gap>=.5-1e-9&&gap<=2+1e-9));
 check(`chapter ${id}: exact manual source-stop seeks immediately readable`,scene.stops.every(stop=>track.some(cue=>stop.progress>=cue.start&&stop.progress<cue.end)));
 if(id===4){const turn=scene.stops[4].progress;check('chapter 4: no opening caption crosses Mawei transition',track.filter(c=>c.paragraphIndex<4).every(c=>c.end<turn)&&track.filter(c=>c.paragraphIndex>=4).every(c=>c.start>=turn));}
 chapters.push({chapterId:id,sourceEdition:scene.sourceRevision,sourceManifestSha256:hash(assetBytes),sourceDurationSeconds:duration,sourceStops:scene.stops.length,cueCount:rows.length,totalHanzi:rows.reduce((n,r)=>n+r.hanzi,0),minimumVisibleSeconds:Math.min(...rows.map(r=>r.visibleSeconds)),maximumVisibleSeconds:Math.max(...rows.map(r=>r.visibleSeconds)),pictureOnlySeconds:gaps.reduce((a,b)=>a+b,0),pictureOnlyAtEndingSeconds:tail,rows});
}
check('invalid or unknown input fails closed',buildPoeticTrack(99,[],60).length===0&&buildPoeticTrack(1,[],0).length===0&&buildPoeticTrack(1,[],Infinity).length===0);
const first=JSON.parse(fs.readFileSync('public/assets/new-scrolls/chapter-1/scene.json')),short=first.stops.map(s=>({...s}));short[4].progress=short[3].progress+.8/first.sourceDurationSeconds;const merged=buildPoeticTrack(1,short,first.sourceDurationSeconds);
check('a 0.8-second beat is merged rather than flashed',merged.some(c=>c.sourceNode.includes(short[3].name)&&c.sourceNode.includes(short[4].name))&&merged.every(c=>(c.end-c.start)*first.sourceDurationSeconds>=3.5-1e-9));
const report={at:new Date().toISOString(),baseCommit:child.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),driver:'reports/art-renewal/poetic-narrative/validate.cjs',driverSha256:hash(fs.readFileSync(__filename)),sourceFile:file,sourceSha256:hash(bytes),originalFile,originalSha256:hash(originalBytes),sourceNotes:poeticSourceNotes,checks,chapters,passed:checks.every(c=>c.pass)};
fs.writeFileSync(path.join(__dirname,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks,chapters:chapters.map(({rows,...summary})=>summary)},null,2));if(!report.passed)process.exitCode=1;
const csv=[['chapter','source_stop','source_node','heading','text','hanzi','start_s','end_s','visible_s','picture_before_s'],...chapters.flatMap(chapter=>chapter.rows.map(row=>[chapter.chapterId,row.sourceStop,row.sourceNode,row.heading,row.text,row.hanzi,row.startSeconds.toFixed(3),row.endSeconds.toFixed(3),row.visibleSeconds.toFixed(3),row.purePictureBeforeSeconds.toFixed(3)]))];
fs.writeFileSync(path.join(__dirname,'cue-sheet.csv'),'\ufeff'+csv.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\n'));
