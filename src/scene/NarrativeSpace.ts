export interface NarrativeSpace {
  x: number; y: number; width: number; height: number;
  dense: boolean; orientation: 'vertical' | 'horizontal'; quietFraction: number;
}

export const isCompactNarrativeViewport = (width: number, height: number) => width < 900 || height < 400;

/** Bound placement work independently of the display's size and pixel ratio. */
export function narrativeSampleSize(width: number, height: number) {
  const scale = Math.min(1, 256 / Math.max(1, width), 192 / Math.max(1, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Inspect a small, asynchronously read painting thumbnail. The pixel buffer
 * belongs to SceneRenderer and is reused, never a full-screen GPU readback. */
export function findNarrativeSpace(pixels: Uint8Array, w: number, h: number, previous?: NarrativeSpace, compact = false): NarrativeSpace {
  // Thumbnail dimensions alone cannot reveal whether full-size characters fit
  // in a short landscape viewport. The renderer supplies its real CSS size.
  const portrait=compact || w/h<1.15;
  const regions=portrait
    ? [ {x:.045,y:.035,width:.91,height:.22}, {x:.045,y:.745,width:.91,height:.22} ]
    : [.035,.73].flatMap(x=>[.055,.35,.5].map(y=>({x,y,width:.235,height:.44})));
  const ranked=regions.map(region=>{
    let quiet=0,count=0,edge=0;
    const dx=Math.max(3,Math.floor(w/160)),dy=Math.max(3,Math.floor(h/100));
    for(let y=Math.floor(region.y*h);y<(region.y+region.height)*h;y+=dy) for(let x=Math.floor(region.x*w);x<(region.x+region.width)*w;x+=dx){
      const i=((h-1-y)*w+x)*4, r=pixels[i],g=pixels[i+1],b=pixels[i+2],a=pixels[i+3];
      const j=i+4<w*h*4?i+4:i;
      const delta=Math.abs(r-pixels[j])+Math.abs(g-pixels[j+1])+Math.abs(b-pixels[j+2]);
      if(a<20 || (Math.min(r,g,b)>175 && Math.max(r,g,b)-Math.min(r,g,b)<62 && delta<32))quiet++;
      edge+=Math.min(1,delta/100);count++;
    }
    const fraction=quiet/Math.max(1,count);
    const movement=previous?Math.hypot(region.x-previous.x,region.y-previous.y)*.07:0;
    return {...region,dense:fraction<.7,orientation:portrait?'horizontal' as const:'vertical' as const,quietFraction:fraction,score:fraction-edge/Math.max(1,count)*.16-movement};
  }).sort((a,b)=>b.score-a.score);
  const {score:_,...placement}=ranked[0];
  return placement;
}
