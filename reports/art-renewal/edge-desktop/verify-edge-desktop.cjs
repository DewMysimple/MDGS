/* Observe the existing production acceptance drivers; never alter their code or page behavior. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),child=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');process.chdir(root);
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const build=path.resolve(root,option('--build-dir','tmp/art-candidate-3-dist'));
const run=path.resolve(root,option('--run-dir',path.join('reports/art-renewal/edge-desktop',new Date().toISOString().replace(/[:.]/g,'-'))));
assert(run.startsWith(path.join(root,'reports/art-renewal/edge-desktop')+path.sep));
assert(process.env.MDGS_PLAYWRIGHT_MODULE,'Supply the installed Playwright module through MDGS_PLAYWRIGHT_MODULE.');
assert(/(?:^|[\\/])msedge\.exe$/i.test(process.env.MDGS_TEST_BROWSER||''),'MDGS_TEST_BROWSER must identify the Edge executable.');
fs.mkdirSync(run,{recursive:false});
const relative=file=>path.relative(root,file).replaceAll('\\','/'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const drivers=['scripts/validate-art-renewal-ui.mjs','scripts/validate-peony-soundscape.mjs'];
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):entry.isFile()?[path.join(directory,entry.name)]:[]);}
function inventory(paths){const rows=paths.sort().map(file=>({file:relative(file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}));return{files:rows.length,bytes:rows.reduce((sum,row)=>sum+row.bytes,0),sha256:sha(JSON.stringify(rows)),entries:rows};}
const configFiles=fs.readdirSync(root).filter(name=>/^(?:package(?:-lock)?\.json|index\.html|vite\.config\.[cm]?[jt]s|tsconfig.*\.json)$/.test(name)).map(name=>path.join(root,name));
const productFiles=()=>[...files(path.join(root,'src')),...files(path.join(root,'public')),...configFiles,...drivers.map(file=>path.join(root,file))];
const report={status:'running',startedAt:new Date().toISOString(),buildDirectory:relative(build),runDirectory:relative(run),scope:'Additional Microsoft Edge desktop acceptance using the unchanged UI83 then Sound15 drivers. Not a full-browser, mobile, long-duration audio, or 270-caption Edge certification.',driver:relative(__filename),driverSha256:sha(fs.readFileSync(__filename)),browserExecutable:process.env.MDGS_TEST_BROWSER,browserExecutableSha256:sha(fs.readFileSync(process.env.MDGS_TEST_BROWSER)),baseCommit:child.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),driverSha256Before:Object.fromEntries(drivers.map(file=>[file,sha(fs.readFileSync(file))])),commands:[],http:[],errors:[]};
const reportFile=path.join(run,'edge-validation.json');
function save(){const temporary=path.join(run,'edge-validation.partial');fs.writeFileSync(temporary,JSON.stringify(report,null,2)+'\n');fs.renameSync(temporary,reportFile);}
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function runDriver(label,script,scriptArgs,observe){
 const command=[script,...scriptArgs];report.commands.push({label,executable:process.execPath,args:command,browserEnvironment:'MDGS_TEST_BROWSER='+process.env.MDGS_TEST_BROWSER});save();
 const log=fs.createWriteStream(path.join(run,label+'.log'),{flags:'wx'});
 const processHandle=child.spawn(process.execPath,command,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
 for(const stream of [processHandle.stdout,processHandle.stderr])stream.on('data',data=>{log.write(data);process.stdout.write(data);});
 const observation=observe?observe(processHandle).then(()=>null,error=>error):Promise.resolve(null);
 const exitCode=await new Promise((resolve,reject)=>{processHandle.once('error',reject);processHandle.once('close',resolve);});
 const observationError=await observation;await new Promise(resolve=>log.end(resolve));if(observationError)throw observationError;assert.equal(exitCode,0,label+' driver failed; inspect its unmodified report and log.');
}
async function observeHttp(processHandle){
 const uiReport=path.join(run,'ui','ui-all-validation.json');let url;
 while(processHandle.exitCode===null){try{url=JSON.parse(fs.readFileSync(uiReport)).url;}catch{}if(url)break;await delay(200);}
 assert(url,'The UI runner did not publish its live HTTP URL.');
 const origin=new URL(url);assert.equal(origin.hostname,'127.0.0.1');assert.equal(origin.pathname,'/exhibition/ui-qa/');
 for(const file of report.buildBefore.entries.filter(row=>row.file===relative(path.join(build,'index.html'))||row.file.startsWith(relative(path.join(build,'assets'))+'/')&&/\.(js|css)$/.test(row.file))){
  const resource=path.relative(build,path.resolve(root,file.file)).replaceAll('\\','/');
  const address=new URL(resource==='index.html'?'':resource,url).href,response=await fetch(address),bytes=Buffer.from(await response.arrayBuffer());
  const row={resource,url:address,status:response.status,bytes:bytes.length,sha256:sha(bytes),expectedSha256:file.sha256};row.passed=row.status===200&&row.sha256===row.expectedSha256;report.http.push(row);assert(row.passed,'HTTP body differs from the frozen build: '+resource);
 }
 save();
}
(async()=>{
 try{
  report.productBefore=inventory(productFiles());report.buildBefore=inventory(files(build));save();
  await runDriver('ui83',drivers[0],['--build-dir',relative(build),'--suite','all','--report-dir',relative(path.join(run,'ui')),'--shots-dir',relative(path.join(run,'ui-shots'))],observeHttp);
  const ui=JSON.parse(fs.readFileSync(path.join(run,'ui/ui-all-validation.json')));
  assert.equal(ui.status,'passed');assert.equal(ui.checks.length,83);assert(ui.checks.every(check=>check.passed));assert.equal(ui.errors.length,0);
  report.browserVersion=ui.browser;report.webglRenderer=ui.webglRenderer;report.uiLaunchFlags=ui.launchFlags;
  report.ui={report:relative(path.join(run,'ui/ui-all-validation.json')),sha256:sha(fs.readFileSync(path.join(run,'ui/ui-all-validation.json'))),checks:83,status:ui.status};save();
  await runDriver('sound15',drivers[1],['--build-dir',relative(build),'--report-file',relative(path.join(run,'sound15-validation.json'))]);
  const sound=JSON.parse(fs.readFileSync(path.join(run,'sound15-validation.json')));
  assert.equal(sound.status,'passed');assert.equal(sound.checks.length,15);assert(sound.checks.every(check=>check.passed));assert.equal(sound.errors.length,0);
  report.sound={report:relative(path.join(run,'sound15-validation.json')),sha256:sha(fs.readFileSync(path.join(run,'sound15-validation.json'))),checks:15,status:sound.status,browserScope:'The unchanged sound driver launches the same MDGS_TEST_BROWSER executable. It does not itself publish browser.version or WebGL renderer; those values above were measured by the preceding UI run. Its native WebAudio assertions ran in Edge with no added launch flags.'};
  report.productAfter=inventory(productFiles());report.buildAfter=inventory(files(build));
  report.driverSha256After=Object.fromEntries(drivers.map(file=>[file,sha(fs.readFileSync(file))]));
  report.productStable=report.productBefore.sha256===report.productAfter.sha256;
  report.buildStable=report.buildBefore.sha256===report.buildAfter.sha256;
  report.driversStable=drivers.every(file=>report.driverSha256Before[file]===report.driverSha256After[file]);
  report.browserExecutableSha256After=sha(fs.readFileSync(process.env.MDGS_TEST_BROWSER));report.browserBinaryStable=report.browserExecutableSha256===report.browserExecutableSha256After;
  const htmlHash=sha(fs.readFileSync(path.join(build,'index.html')));
  report.localReportsMatchHttpBuild=ui.buildHtmlSha256===htmlHash&&sound.buildHtmlSha256===htmlHash&&Object.entries(ui.buildJavascript).every(([name,hash])=>sha(fs.readFileSync(path.join(build,'assets',name)))===hash)&&Object.entries(sound.buildJavascript).every(([name,hash])=>sha(fs.readFileSync(path.join(build,'assets',name)))===hash);
  assert(report.productStable&&report.buildStable&&report.driversStable&&report.browserBinaryStable&&report.localReportsMatchHttpBuild);
  report.status='passed';
 }catch(error){report.status='failed';report.errors.push({message:error.message,stack:error.stack});process.exitCode=1;}
 finally{
  if(report.productBefore&&!report.productAfter){try{report.productAfter=inventory(productFiles());report.productStable=report.productBefore.sha256===report.productAfter.sha256;report.buildAfter=inventory(files(build));report.buildStable=report.buildBefore.sha256===report.buildAfter.sha256;report.driverSha256After=Object.fromEntries(drivers.map(file=>[file,sha(fs.readFileSync(file))]));report.driversStable=drivers.every(file=>report.driverSha256Before[file]===report.driverSha256After[file]);}catch(error){report.errors.push({message:'Final stability audit: '+error.message});}}
  report.completedAt=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,run:relative(run),browserVersion:report.browserVersion,webglRenderer:report.webglRenderer,httpBodies:report.http.length,productStable:report.productStable,buildStable:report.buildStable,driversStable:report.driversStable,errors:report.errors},null,2));
 }
})();
