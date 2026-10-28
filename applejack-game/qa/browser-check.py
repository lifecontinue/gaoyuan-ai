from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from pathlib import Path
import json, re, os
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
BASE_URL=os.environ.get('GAME_BASE_URL', 'http://127.0.0.1:4175')
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',4175),partial(Quiet,directory=str(ROOT/'dist')))
Thread(target=server.serve_forever,daemon=True).start()
results=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=b.new_page(viewport={'width':1440,'height':1024},device_scale_factor=1)
    page.set_default_timeout(7000)
    page.emulate_media(reduced_motion='reduce')
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE_URL);page.get_by_role('button',name='树上的苹果 1',exact=True).wait_for();page.wait_for_timeout(600)
    def save():return page.evaluate("JSON.parse(localStorage.getItem('applejack-harvest-v1'))")
    def go_farm():page.get_by_role('button',name='返回农场',exact=True).click()
    def enter(kind,n):page.get_by_role('button',name=f'{kind}第{n}关',exact=False).click()
    page.get_by_role('button',name='装好啦').click();assert '还有 12' in page.get_by_role('status').inner_text()
    page.get_by_role('button',name='帮帮我').click();assert '轮流' in page.get_by_role('status').inner_text()
    for i in range(8):
        page.get_by_role('button',name=f'树上的苹果 {i+1}',exact=True).click()
        page.locator('.basket-wrap').nth(i//4).click()
    page.screenshot(path=str(ROOT/'qa/desktop-partial.png'))
    for i in range(8,12):
        page.get_by_role('button',name=f'树上的苹果 {i+1}',exact=True).click();page.locator('.basket-wrap').nth(2).click()
    page.get_by_role('button',name='装好啦').click();page.get_by_role('dialog').wait_for();assert save()['apples']==3
    page.get_by_role('button',name='下一关',exact=False).click()
    # Remaining five math levels exercise distinct numerical configurations.
    for level,(total,baskets) in enumerate([(8,2),(15,3),(12,2),(9,3),(18,3)],start=1):
        for i in range(total):
            page.get_by_role('button',name=f'树上的苹果 {i+1}',exact=True).click();page.locator('.basket-wrap').nth(i%baskets).click()
        page.get_by_role('button',name='装好啦').click();page.get_by_role('dialog').wait_for()
        print('Math level',level+1,'passed',flush=True)
        if level<5:page.get_by_role('button',name='下一关',exact=False).click()
        else:page.get_by_role('button',name='去布置丰收节',exact=False).click()
    assert len(save()['completed'])==6;results.append('6 math levels: passed')
    for level,answer in enumerate([0,1,2,0,1,2],start=1):
        enter('友谊邮局',level)
        if level==1:
            page.locator('.choice').nth(1).click();page.get_by_role('button',name='选好啦').click();assert '再读读' in page.get_by_role('status').inner_text()
        page.locator('.choice').nth(answer).click();page.get_by_role('button',name='选好啦').click();page.get_by_role('dialog').wait_for();page.get_by_role('button',name='回农场看看').click()
    results.append('6 reading levels and incorrect choice: passed')
    for level,answer in enumerate([0,0,1,1,1,0],start=1):
        enter('小小种植家',level);page.locator('.plant-choice').nth(answer).click()
        if level==1:
            page.get_by_role('button',name='选好啦').click();assert '先点击' in page.get_by_role('status').inner_text()
        page.get_by_role('button',name='观察几天后',exact=False).click();page.get_by_role('button',name='选好啦').click();page.get_by_role('dialog').wait_for();page.get_by_role('button',name='回农场看看').click()
    assert len(save()['completed'])==18;assert save()['apples']==54;results.append('6 science levels and observation requirement: passed')
    for name in ['庆典花圃','彩色旗帜','分享餐桌']:page.get_by_role('button',name=re.compile(name)).click()
    assert save()['apples']==36;assert len(save()['decorations'])==3
    page.reload();page.get_by_role('button',name='树上的苹果 1',exact=True).wait_for();assert len(save()['completed'])==18;results.append('decoration purchase and persistence: passed')
    # Replay same reward, undo an apple, actual pointer drag and keyboard pause.
    for i in range(12):
        page.get_by_role('button',name=f'树上的苹果 {i+1}',exact=True).click();page.locator('.basket-wrap').nth(i%3).click()
    page.get_by_role('button',name='篮子里的苹果 1',exact=True).click();assert page.get_by_role('button',name='树上的苹果 1',exact=True).count()==1
    source=page.get_by_role('button',name='树上的苹果 1',exact=True).bounding_box();target=page.get_by_role('button',name=re.compile('^篮子 1，')).bounding_box()
    page.mouse.move(source['x']+source['width']/2,source['y']+source['height']/2);page.mouse.down();page.mouse.move(target['x']+target['width']/2,target['y']+target['height']/2,steps=10);page.mouse.up()
    assert page.get_by_role('button',name='树上的苹果 1',exact=True).count()==0
    page.get_by_role('button',name='装好啦').click();page.get_by_role('dialog').wait_for();assert save()['apples']==36
    page.get_by_role('button',name='关闭',exact=True).click();page.get_by_role('button',name='暂停',exact=True).click();page.get_by_role('dialog').wait_for();page.keyboard.press('Escape');assert page.get_by_role('dialog').count()==0
    results.append('undo, pointer drag, idempotent replay reward, pause/Escape: passed')
    go_farm();page.screenshot(path=str(ROOT/'qa/farm-desktop.png'))
    mobile=b.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
    mobile.on('pageerror',lambda e:errors.append(str(e)));mobile.goto(BASE_URL);mobile.get_by_role('button',name='树上的苹果 1',exact=True).wait_for();mobile.wait_for_timeout(300)
    mobile.get_by_role('button',name='树上的苹果 1',exact=True).tap();mobile.locator('.basket-wrap').nth(0).tap()
    assert mobile.get_by_role('button',name='篮子里的苹果 1',exact=True).count()==1
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile.screenshot(path=str(ROOT/'qa/mobile.png'),full_page=True)
    mobile.get_by_role('button',name='返回农场',exact=True).tap();mobile.screenshot(path=str(ROOT/'qa/farm-mobile.png'),full_page=True)
    results.append('390px touch operation and no horizontal overflow: passed')
    assert not errors,errors;results.append('browser runtime errors: none')
    b.close()
server.shutdown()
(ROOT/'qa/browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
