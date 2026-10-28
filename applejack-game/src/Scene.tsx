import {useEffect,useRef} from 'react';
import Phaser from 'phaser';
export function Scene({reducedMotion,celebrate,paused}:{reducedMotion:boolean;celebrate:number;paused:boolean}){
 const host=useRef<HTMLDivElement>(null); const game=useRef<Phaser.Game|null>(null);
 useEffect(()=>{if(!host.current)return;let pony:Phaser.GameObjects.Image;let bg:Phaser.GameObjects.Image;
 class Orchard extends Phaser.Scene{
  preload(){this.load.image('orchard','assets/orchard.webp');this.load.image('pony','assets/applejack.png');this.load.image('apple','assets/apple.png');}
  create(){bg=this.add.image(0,0,'orchard').setOrigin(.5);pony=this.add.image(0,0,'pony').setOrigin(.5,1);const layout=()=>{const {width:w,height:h}=this.scale;const mobile=w<700;const ratio=Math.max(w/bg.width,h/bg.height);bg.setPosition(w/2,h/2).setScale(ratio);const height=Math.min(h*(mobile?.35:.51),w*(mobile?.52:.51));pony.setDisplaySize(height*pony.width/pony.height,height).setPosition(w*(mobile?.15:.15),h*(mobile?.69:.735));};layout();this.scale.on('resize',layout);this.events.once('shutdown',()=>this.scale.off('resize',layout));
   this.game.events.on('celebrate',()=>{if(reducedMotion)return;this.tweens.add({targets:pony,y:pony.y-20,duration:180,yoyo:true,repeat:2,ease:'Sine.easeOut'});});
   if(!reducedMotion)this.tweens.add({targets:pony,angle:1,duration:2300,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
  }
 }
 const g=new Phaser.Game({type:Phaser.CANVAS,parent:host.current,transparent:true,fps:{target:30},scene:Orchard,scale:{mode:Phaser.Scale.RESIZE,width:host.current.clientWidth,height:host.current.clientHeight},render:{antialias:true},audio:{noAudio:true}});game.current=g;
 const observer=new ResizeObserver(()=>{if(host.current)g.scale.resize(host.current.clientWidth,host.current.clientHeight);});observer.observe(host.current);
 return()=>{observer.disconnect();g.events.removeAllListeners();g.destroy(true);game.current=null;};
 },[reducedMotion]);
 useEffect(()=>{game.current?.scene.getScenes(false).forEach(s=>{if(paused)s.scene.pause();else if(s.sys.isPaused())s.scene.resume();});},[paused]);
 useEffect(()=>{if(celebrate)game.current?.events.emit('celebrate');},[celebrate]);
 return <div ref={host} className="scene" aria-hidden="true"/>;
}
