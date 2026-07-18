/**
 * The engagement beacon. Injected ONLY by the portal renderers (never into a standalone
 * file, which must stay offline and phone nothing home), it reports per-slide dwell, deck
 * completion, and the protection tripwires back to the portal's ingest endpoint. Attribution
 * (who, which workspace) is the server's job from the session; the beacon only carries the
 * artifact and version the server stamped into its config, plus what the viewer did.
 */

export interface BeaconConfig {
  /** The portal ingest path, for example "/e". */
  endpoint: string;
  /**
   * The share this deck was served from. The beacon reports this and nothing else about what
   * it is looking at: the portal resolves the artifact and version from it server-side.
   *
   * The viewer already holds this id, it is in their address bar, so telling them nothing new.
   * What it does is stop them naming a different artifact: an earlier version had the beacon
   * post artifactId and versionId, and the portal filed whatever it was handed. A viewer could
   * attribute a slide_view, a completion, or a copy_attempt to any artifact id, against their
   * own name, and the owner's audit trail would record it as fact.
   */
  shareId: string;
}

/** The embedded config the beacon reads. Escaped so it cannot break out of the script tag. */
export function beaconConfigTag(cfg: BeaconConfig): string {
  return `<script type="application/json" id="dtbeacon">${JSON.stringify(cfg).replace(/</g, "\\u003c")}</script>`;
}

/**
 * The beacon script. Written without template literals so it nests safely inside a module
 * template string. Slide tracking is a no-op on a page with no slides (a document or tool),
 * where only the tripwires apply.
 */
export const beaconJs = `
(function(){
 var el=document.getElementById('dtbeacon'); if(!el) return;
 var cfg; try{cfg=JSON.parse(el.textContent);}catch(e){return;}
 function send(type,meta){
  var payload=JSON.stringify({type:type,shareId:cfg.shareId,meta:meta||{}});
  try{
   if(navigator.sendBeacon){navigator.sendBeacon(cfg.endpoint,new Blob([payload],{type:'application/json'}));}
   else{fetch(cfg.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:payload,keepalive:true});}
  }catch(e){}
 }
 function now(){return Date.now();}
 var slides=[].slice.call(document.querySelectorAll('.slide'));
 var current=null,enteredAt=now(),maxIndex=-1,viewed={},completedSent=false;
 function activeSlide(){for(var i=0;i<slides.length;i++){if(slides[i].classList.contains('active'))return {id:slides[i].getAttribute('data-slide-id'),index:i};}return null;}
 function flush(){if(current){send('slide_view',{slideId:current.id,dwellMs:now()-enteredAt});}}
 function onChange(){
  var a=activeSlide(); if(!a) return;
  if(!current||a.id!==current.id){flush();current=a;enteredAt=now();viewed[a.id]=1;if(a.index>maxIndex)maxIndex=a.index;}
 }
 if(slides.length){
  var obs=new MutationObserver(onChange);
  slides.forEach(function(s){obs.observe(s,{attributes:true,attributeFilter:['class']});});
  onChange();
 }
 function complete(){
  if(completedSent) return;
  flush();
  if(slides.length){send('deck_complete',{slidesViewed:Object.keys(viewed).length,totalSlides:slides.length,completion:Math.round((maxIndex+1)/slides.length*100)});}
  completedSent=true; current=null;
 }
 document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden'){complete();}
  else{completedSent=false;enteredAt=now();onChange();}
 });
 window.addEventListener('pagehide',complete);
 // Protection tripwires. The anti-copy layer still blocks the action; this records the attempt.
 document.addEventListener('copy',function(){send('copy_attempt',{slideId:current&&current.id});});
 document.addEventListener('cut',function(){send('copy_attempt',{slideId:current&&current.id});});
 document.addEventListener('contextmenu',function(){send('tripwire',{reason:'contextmenu',slideId:current&&current.id});});
 window.addEventListener('beforeprint',function(){send('print_attempt',{});});
 document.addEventListener('keydown',function(e){
  var k=(e.key||'').toLowerCase();
  if((e.ctrlKey||e.metaKey)&&k==='s'){send('download_attempt',{});}
  if((e.ctrlKey||e.metaKey)&&k==='p'){send('print_attempt',{});}
 });
})();
`;
