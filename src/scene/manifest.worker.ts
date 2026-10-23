// Parse the authored scene and its material tracks away from the animation
// thread. A disposed loader terminates this worker and its pending request.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ url:string }>)=>void)|null;
  postMessage: (message:unknown)=>void;
};
scope.onmessage=async event=>{
  try{
    const response=await fetch(event.data.url);
    if(!response.ok)throw new Error(`画卷资源读取失败（${response.status}）`);
    scope.postMessage({ok:true,manifest:await response.json()});
  }catch(error){scope.postMessage({ok:false,message:error instanceof Error?error.message:'画卷数据解析失败'});}
};
export {};
