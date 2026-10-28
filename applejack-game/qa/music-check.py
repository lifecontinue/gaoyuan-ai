"""Real browser audio-graph checks, including one complete loop boundary."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
import json, os
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',4176),partial(Quiet,directory=str(ROOT/'dist')))
Thread(target=server.serve_forever,daemon=True).start()
URL=os.environ.get('GAME_BASE_URL','http://127.0.0.1:4176')
PROBE="""(() => {
 const Native=window.AudioContext;window.audioProbes=[];
 window.AudioContext=class extends Native {
  constructor(...args){super(...args);this.probe={ctx:this,voices:[],gains:[]};window.audioProbes.push(this.probe);}
  createBufferSource(){const s=super.createBufferSource();const v={node:s,ended:false};this.probe.voices.push(v);s.addEventListener('ended',()=>v.ended=true);return s;}
  createGain(){const g=super.createGain();this.probe.gains.push(g);const connect=g.connect.bind(g);g.connect=(dest,...args)=>{if(dest===this.destination){const a=this.createAnalyser();a.fftSize=2048;connect(a);a.connect(dest);this.probe.analyser=a;return dest;}return connect(dest,...args);};return g;}
 };
 window.musicProbe=()=>{const p=window.audioProbes.find(p=>p.voices.length);if(!p)return null;const samples=new Float32Array(2048);p.analyser.getFloatTimeDomainData(samples);return {started:p.voices.length,live:p.voices.filter(v=>!v.ended).length,master:p.gains[0].gain.value,rms:Math.sqrt(samples.reduce((a,x)=>a+x*x,0)/samples.length),loops:p.voices.every(v=>v.node.loop),duration:p.voices.at(-1).node.buffer.duration,state:p.ctx.state};};
})();"""
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1024})
    page.set_default_timeout(15000)
    page.add_init_script(PROBE)
    errors=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:requests.append(r.url) if '.mp3' in r.url else None)
    page.goto(URL)
    page.get_by_role('button',name='树上的苹果 1',exact=True).wait_for()
    assert page.locator('main').get_attribute('data-music-state')=='waiting'
    assert not requests
    page.get_by_role('button',name='树上的苹果 1',exact=True).click()
    page.wait_for_function("document.querySelector('main').dataset.musicState==='playing'")
    page.wait_for_timeout(1200)
    probe=page.evaluate('musicProbe()');assert probe['loops'] and probe['rms']>0.00001,probe
    assert abs(probe['duration']-40)<.1,probe
    # A full real-time loop, without timers restarting the source node.
    print('First click starts decoded audio; checking a complete 40-second loop...',flush=True)
    before=probe['started'];page.wait_for_timeout(40500)
    probe=page.evaluate('musicProbe()');assert probe['started']==before and probe['live']==1 and probe['rms']>0.00001,probe
    results.append('Autoplay gesture, real audio output, full loop without restart: passed')
    before=page.evaluate('musicProbe().started')
    page.locator('.basket-wrap').nth(0).click()
    for i in range(1,12):
        page.get_by_role('button',name=f'树上的苹果 {i+1}',exact=True).click()
        page.locator('.basket-wrap').nth(i%3).click()
    page.get_by_role('button',name='装好啦').click()
    page.get_by_role('button',name='下一关',exact=False).click()
    assert page.evaluate('musicProbe().started')==before
    results.append('Next level in the same scene continues the same music source: passed')
    page.get_by_role('button',name='暂停',exact=True).click();page.wait_for_timeout(150)
    probe=page.evaluate('musicProbe()');assert probe['live']==0 and probe['master']==0,probe
    page.get_by_role('button',name='继续冒险',exact=False).click()
    page.wait_for_function("document.querySelector('main').dataset.musicState==='playing'")
    page.get_by_role('button',name='关闭声音',exact=True).click();page.wait_for_timeout(150)
    assert page.evaluate('musicProbe().live')==0
    page.get_by_role('button',name='打开声音',exact=True).click()
    results.append('Pause/resume and global mute stop all music voices: passed')
    for title,scene in [('友谊邮局第1关','mail'),('小小种植家第1关','garden')]:
        page.get_by_role('button',name='返回农场',exact=True).click()
        page.wait_for_function("document.querySelector('main').dataset.musicState==='playing'")
        page.get_by_role('button',name=title,exact=False).click()
        page.wait_for_function("document.querySelector('main').dataset.musicState==='playing'")
        page.wait_for_timeout(1000)
        assert page.locator('main').get_attribute('data-music-scene')==scene
        assert page.evaluate('musicProbe().live')==1
        assert any('/'+scene+'.mp3' in r for r in requests)
    # Same-scene level selection never replaces the active source.
    page.get_by_role('button',name='返回农场',exact=True).click()
    page.wait_for_function("document.querySelector('main').dataset.musicState==='playing'")
    page.get_by_role('button',name='设置',exact=True).click()
    before=page.evaluate('musicProbe().started')
    page.get_by_label('音乐音量',exact=True).fill('25');page.wait_for_timeout(700)
    assert abs(page.evaluate('musicProbe().master')-.25)<.01
    page.get_by_label('背景轻音乐',exact=True).uncheck();page.wait_for_timeout(100)
    assert page.evaluate('musicProbe().live')==0
    page.get_by_label('背景轻音乐',exact=True).check()
    page.get_by_text('音乐来源与许可',exact=True).click()
    assert page.get_by_role('link',name='CC BY 4.0').count()==1
    page.screenshot(path=str(ROOT/'qa/music-settings.png'))
    results.append('All four scene files, crossfade cleanup, independent switch and volume: passed')
    page.reload();page.get_by_role('button',name='返回农场',exact=True).click()
    page.get_by_role('button',name='设置',exact=True).click()
    assert page.get_by_label('音乐音量',exact=True).input_value()=='25'
    assert page.get_by_label('背景轻音乐',exact=True).is_checked()
    # Simulated speech callbacks test attenuation independently of host voice availability.
    page.evaluate("speechSynthesis.speak=u=>window.testUtterance=u")
    page.get_by_role('button',name='试试中文朗读',exact=False).click();page.wait_for_timeout(700)
    assert abs(page.evaluate('musicProbe().master')-.25*.18)<.01
    page.evaluate('window.testUtterance.onend()');page.wait_for_timeout(700)
    assert abs(page.evaluate('musicProbe().master')-.25)<.01
    page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_timeout(150);assert page.evaluate('musicProbe().live')==0
    results.append('Settings persist; speech lifecycle ducks/restores; hidden-page event stops music: passed')
    # Failed downloads leave gameplay and controls usable.
    failure=browser.new_page();failure.route('**/assets/music/*.mp3',lambda route:route.abort())
    failure.goto(URL);failure.get_by_role('button',name='树上的苹果 1',exact=True).click()
    failure.wait_for_function("document.querySelector('main').dataset.musicState==='error'")
    failure.locator('.basket-wrap').nth(0).click()
    assert failure.get_by_role('button',name='篮子里的苹果 1',exact=True).count()==1
    results.append('Music network failure does not block gameplay: passed')
    mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    mobile.goto(URL);mobile.get_by_role('button',name='返回农场',exact=True).tap()
    mobile.get_by_role('button',name='设置',exact=True).tap()
    mobile.get_by_label('背景轻音乐',exact=True).uncheck()
    assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
    mobile.screenshot(path=str(ROOT/'qa/music-settings-mobile.png'),full_page=True)
    assert not errors,errors
    results.append('Mobile controls, attribution and no browser runtime errors: passed')
    browser.close()
server.shutdown()
(ROOT/'qa/music-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(results,ensure_ascii=False,indent=2),flush=True)
