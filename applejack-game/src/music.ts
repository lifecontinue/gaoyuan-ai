import {useEffect,useRef,useState} from 'react';

export type MusicScene='harvest'|'mail'|'garden'|'farm';
const MUSIC_FILES:Record<MusicScene,string>={harvest:'assets/music/harvest.mp3',mail:'assets/music/mail.mp3',garden:'assets/music/garden.mp3',farm:'assets/music/farm.mp3'};
export const MUSIC_TRACKS:Record<MusicScene,{title:string;label:string;isrc:string}>={
 harvest:{title:'Carefree',label:'果园轻音乐',isrc:'USUAN1400037'},
 mail:{title:'Easy Lemon',label:'邮局轻音乐',isrc:'USUAN1200076'},
 garden:{title:'Dream Culture',label:'观察轻音乐',isrc:'USUAN1300046'},
 farm:{title:'Fretless',label:'农场轻音乐',isrc:'USUAN1500074'},
};
export type MusicOptions={scene:MusicScene;muted:boolean;enabled:boolean;volume:number;paused:boolean;ducked:boolean};
type Voice={scene:MusicScene;source:AudioBufferSourceNode;gain:GainNode;started:number;offset:number;length:number};
type Status='waiting'|'loading'|'playing'|'paused'|'off'|'error';
export const MUSIC_STORAGE='applejack-music-v1';
export function readMusicSettings(){
 try{const x=JSON.parse(localStorage.getItem(MUSIC_STORAGE)||'null');if(x&&typeof x.enabled==='boolean'&&Number.isFinite(x.volume)&&x.volume>=0&&x.volume<=1)return {enabled:x.enabled,volume:x.volume};}catch{/* Older progress does not depend on music settings. */}
 return {enabled:true,volume:0.4};
}

/** One audio clock owns all loops. State updates never depend on audio loading. */
export class MusicPlayer{
 private ctx:AudioContext|null=null;
 private master:GainNode|null=null;
 private active:Voice|null=null;
 private voices=new Set<Voice>();
 private buffers=new Map<MusicScene,Promise<AudioBuffer>>();
 private offsets=new Map<MusicScene,number>();
 private abort=new AbortController();
 private epoch=0;
 private unlocked=false;
 private disposed=false;
 private options:MusicOptions={scene:'harvest',muted:false,enabled:true,volume:.4,paused:false,ducked:false};
 constructor(private report:(status:Status)=>void){}
 update(options:MusicOptions){this.options=options;void this.sync();}
 unlock=()=>{
  if(this.disposed)return;
  try{
   if(!this.ctx){this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=0;this.master.connect(this.ctx.destination);}
   this.unlocked=true;
   void this.ctx.resume().then(()=>this.sync()).catch(()=>this.report('waiting'));
  }catch{this.report('error');}
 };
 private stop(immediate:boolean){
  const ctx=this.ctx;if(!ctx)return;
  if(this.active){this.offsets.set(this.active.scene,(this.active.offset+ctx.currentTime-this.active.started)%this.active.length);this.active=null;}
  for(const voice of this.voices){
   voice.gain.gain.cancelScheduledValues(ctx.currentTime);
   if(immediate){voice.gain.gain.setValueAtTime(0,ctx.currentTime);try{voice.source.stop();}catch{};}
   else{voice.gain.gain.setValueAtTime(voice.gain.gain.value,ctx.currentTime);voice.gain.gain.linearRampToValueAtTime(0,ctx.currentTime+.8);try{voice.source.stop(ctx.currentTime+.82);}catch{}}
  }
 }
 private async sync(){
  const token=++this.epoch;
  const opts=this.options;
  if(this.disposed)return;
  const disabled=opts.muted||!opts.enabled||opts.volume===0;
  if(disabled||opts.paused){this.stop(true);if(this.master&&this.ctx){this.master.gain.cancelScheduledValues(this.ctx.currentTime);this.master.gain.setValueAtTime(0,this.ctx.currentTime);}this.report(disabled?'off':'paused');return;}
  if(!this.unlocked||!this.ctx||!this.master){this.report('waiting');return;}
  const ctx=this.ctx;
  const master=this.master;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(opts.volume*(opts.ducked?.18:1),ctx.currentTime,.12);
  if(this.active?.scene===opts.scene){this.report('playing');return;}
  this.report('loading');
  try{
   let pending=this.buffers.get(opts.scene);
   if(!pending){
    pending=fetch(MUSIC_FILES[opts.scene],{signal:this.abort.signal}).then(r=>{if(!r.ok)throw new Error('Music unavailable');return r.arrayBuffer();}).then(bytes=>ctx.decodeAudioData(bytes));
    this.buffers.set(opts.scene,pending);
    void pending.catch(()=>this.buffers.delete(opts.scene));
   }
   const buffer=await pending;
   if(this.disposed||token!==this.epoch)return;
   if(ctx.state!=='running'){this.report('waiting');return;}
   this.stop(false);
   const source=ctx.createBufferSource(),gain=ctx.createGain();
   source.buffer=buffer;source.loop=true;source.loopStart=0;source.loopEnd=buffer.duration;
   source.connect(gain);gain.connect(master);
   const offset=(this.offsets.get(opts.scene)||0)%buffer.duration;
   const voice:Voice={scene:opts.scene,source,gain,started:ctx.currentTime,offset,length:buffer.duration};
   this.active=voice;this.voices.add(voice);
   source.onended=()=>{source.disconnect();gain.disconnect();this.voices.delete(voice);};
   gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(1,ctx.currentTime+.8);
   source.start(0,offset);this.report('playing');
  }catch{if(!this.disposed&&token===this.epoch){this.stop(true);this.report('error');}}
 }
 dispose(){this.disposed=true;this.epoch++;this.abort.abort();this.stop(true);this.buffers.clear();void this.ctx?.close();}
}

export function useMusic(options:MusicOptions){
 const player=useRef<MusicPlayer|null>(null);
 const [status,setStatus]=useState<Status>('waiting');
 useEffect(()=>{
  const music=new MusicPlayer(setStatus);player.current=music;
  const key=(event:KeyboardEvent)=>{if(event.key==='Enter'||event.key===' ')music.unlock();};
  window.addEventListener('pointerdown',music.unlock,{capture:true});window.addEventListener('keydown',key,{capture:true});
  window.addEventListener('click',music.unlock,{capture:true});window.addEventListener('touchend',music.unlock,{capture:true,passive:true});
  return()=>{window.removeEventListener('pointerdown',music.unlock,{capture:true});window.removeEventListener('click',music.unlock,{capture:true});window.removeEventListener('touchend',music.unlock,{capture:true});window.removeEventListener('keydown',key,{capture:true});music.dispose();player.current=null;};
 },[]);
 useEffect(()=>player.current?.update(options),[options.scene,options.enabled,options.muted,options.volume,options.paused,options.ducked]);
 return status;
}
