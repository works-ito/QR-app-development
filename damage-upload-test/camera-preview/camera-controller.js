/* WORKS damage-photo camera controller (development branch).
 * Owns stream lifecycle, preview geometry, zoom and frame capture.
 * Upload, session management and photo metadata remain in the page.
 */
(function(global){
'use strict';
class CameraController {
  constructor(elements){
    this.videos=elements.videos;
    this.stream=null;
    this.kind=null;
    this.zoom=1;
    this.generation=0;
    this.previewFrame=0;
    this.previewCanvas=null;
  }
  get active(){return !!this.stream;}
  get type(){return this.kind;}
  isLive(kind){return this.kind===kind&&!!this.stream&&this.stream.getVideoTracks().some(t=>t.readyState==='live');}
  video(kind){return this.videos[kind];}
  stop(){
    this.stopPreview();
    ++this.generation;
    if(this.stream){this.stream.getTracks().forEach(t=>t.stop());this.stream=null;}
    for(const video of Object.values(this.videos)){
      video.pause();
      video.srcObject=null;
      video.style.opacity='';
    }
    this.kind=null;
  }
  async start(kind){
    if(!this.videos[kind])throw Error('不明なカメラ種別です');
    this.stop();
    const generation=this.generation;
    if(!navigator.mediaDevices?.getUserMedia)throw Error('カメラ非対応です。HTTPS接続とカメラ許可を確認してください。');
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160}}});
    if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return false;}
    this.stream=stream;this.kind=kind;this.zoom=1;
    const video=this.video(kind);
    try{
      video.srcObject=stream;
      await video.play();
      if(generation!==this.generation)return false;
      this.layout();
      return true;
    }catch(e){this.stop();throw e;}
  }
  setZoom(value){
    this.zoom=value===2?2:1;
    this.layout();
  }
  layout(){ /* Canvas preview owns visible crop; no video transforms needed. */ }
  crop(w,h,kind){
    const target=4/3;
    let sw=w,sh=h,sx=0,sy=0;
    if(w/h>target){sw=h*target;sx=(w-sw)/2;}
    else{sh=w/target;sy=(h-sh)/2;}
    if(kind==='damage'&&this.zoom===2){sw/=2;sh/=2;sx=(w-sw)/2;sy=(h-sh)/2;}
    return {sx,sy,sw,sh};
  }
  stopPreview(){
    cancelAnimationFrame(this.previewFrame);this.previewFrame=0;
    if(this.previewCanvas){
      this.previewCanvas.style.display='none';
      this.previewCanvas.width=this.previewCanvas.height=0;
      this.previewCanvas=null;
    }
    for(const video of Object.values(this.videos))video.style.opacity='';
  }
  startPreview(kind,canvas){
    this.stopPreview();
    if(!this.isLive(kind))return;
    const video=this.video(kind),ctx=canvas.getContext('2d',{alpha:false});
    this.previewCanvas=canvas;
    canvas.style.display='block';video.style.opacity='0';
    const paint=()=>{
      if(!this.isLive(kind)||this.previewCanvas!==canvas)return;
      if(video.readyState>=2&&video.videoWidth&&video.videoHeight){
        const rect=canvas.parentElement.getBoundingClientRect();
        const cw=Math.max(1,Math.round(rect.width)),ch=Math.max(1,Math.round(rect.height));
        if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
        const {sx,sy,sw,sh}=this.crop(video.videoWidth,video.videoHeight,kind);
        ctx.drawImage(video,sx,sy,sw,sh,0,0,cw,ch);
      }
      this.previewFrame=requestAnimationFrame(paint);
    };
    this.previewFrame=requestAnimationFrame(paint);
  }
  async capture(kind){
    if(!this.isLive(kind))throw Error('カメラの映像がありません');
    const video=this.video(kind),w=video.videoWidth,h=video.videoHeight;
    if(!w||!h)throw Error('カメラ映像を取得できません');
    const target=4/3;
    let sw=w,sh=h,sx=0,sy=0;
    if(w/h>target){sw=h*target;sx=(w-sw)/2;}
    else{sh=w/target;sy=(h-sh)/2;}
    if(kind==='damage'&&this.zoom===2){sw/=2;sh/=2;sx=(w-sw)/2;sy=(h-sh)/2;}
    const scale=Math.min(1,2400/Math.max(sw,sh));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(sw*scale));
    canvas.height=Math.max(1,Math.round(sh*scale));
    canvas.getContext('2d',{alpha:false}).drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
    try{
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('JPEG変換に失敗しました')),'image/jpeg',.90));
      return {blob,width:canvas.width,height:canvas.height};
    }finally{canvas.width=canvas.height=0;}
  }
}
global.WorksCameraController=CameraController;
})(window);
