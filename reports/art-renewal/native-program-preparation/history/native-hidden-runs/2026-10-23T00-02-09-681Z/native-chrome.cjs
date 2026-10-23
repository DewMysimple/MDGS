const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');
exports.openNativeChrome=async function(profile){
 await fs.mkdir(profile,{recursive:true});
 const child=spawn(process.env.MDGS_TEST_BROWSER,['--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-features=CalculateNativeWinOcclusion','--window-position=-32000,-32000','--start-minimized','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let browser,stderr='';child.stderr.on('data',b=>{stderr+=b.toString();});
 try{let port;for(let i=0;i<150;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}await new Promise(r=>setTimeout(r,100));}if(!port)throw new Error('Owned Chrome debug port unavailable: '+stderr.slice(-2000));
  // The installed Playwright connector schema supports noDefaults; on the
  // default context this skips its automatic focus+visibility emulation.
  browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{noDefaults:true});
  const context=browser.contexts()[0],page=context.pages()[0]||await context.newPage();
  return{browser,context,page,pid:child.pid,stderr:()=>stderr,close:async()=>{try{const cdp=await browser.newBrowserCDPSession();await cdp.send('Browser.close').catch(()=>{});}catch{}await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,1000))]);await browser.close().catch(()=>{});if(child.exitCode===null)child.kill();}};
 }catch(error){await browser?.close().catch(()=>{});if(child.exitCode===null)child.kill();throw error;}
};
