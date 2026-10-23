import type {SceneManifest} from '../types';

/** Large material/keyframe JSON must not stop the visible scroll ceremony. */
export async function readSceneManifest(url:string, signal:AbortSignal):Promise<SceneManifest>{
  if(typeof Worker==='undefined'){
    const response=await fetch(url,{signal});
    if(!response.ok)throw new Error(`画卷资源读取失败（${response.status}）`);
    return response.json();
  }
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./manifest.worker.ts',import.meta.url),{type:'module'});
    const cleanup=()=>{signal.removeEventListener('abort',abort);worker.terminate();};
    const abort=()=>{cleanup();reject(new DOMException('Aborted','AbortError'));};
    signal.addEventListener('abort',abort,{once:true});
    worker.onmessage=event=>{
      cleanup();
      if(event.data.ok)resolve(event.data.manifest);
      else reject(new Error(event.data.message));
    };
    worker.onerror=()=>{cleanup();reject(new Error('画卷数据暂未齐备，请重试展卷。'));};
    worker.postMessage({url:new URL(url,document.baseURI).href});
  });
}
