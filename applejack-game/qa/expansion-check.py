from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from playwright.sync_api import sync_playwright
import json,os
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',4180),partial(Quiet,directory=str(ROOT/'dist')))
Thread(target=server.serve_forever,daemon=True).start()
url=os.environ.get('GAME_BASE_URL','http://127.0.0.1:4180')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1024});page.set_default_timeout(15000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(url);page.get_by_role('button',name='点击开启轻音乐',exact=True).click()
 page.wait_for_function("document.querySelector('main').dataset.musicState==='playing'")
 def save():return page.evaluate("JSON.parse(localStorage.getItem('applejack-harvest-v2'))")
 for level,counts in enumerate([[4,4,4],[4,4],[5,5,5],[6,6],[3,3,3],[6,6,6],[5,4,3],[6,5,4],[9,6,3]]):
  index=0
  for basket,n in enumerate(counts):
   for _ in range(n):
    page.get_by_role('button',name=f'树上的苹果 {index+1}',exact=True).click();page.locator('.basket-wrap').nth(basket).click();index+=1
  if level==6:page.screenshot(path=str(ROOT/'qa/orders-v2.png'))
  page.get_by_role('button',name='装好啦',exact=True).click();page.get_by_role('dialog').wait_for()
  page.get_by_role('button',name='下一关' if level<8 else '去布置丰收节',exact=False).click()
 assert len(save()['completed'])==9
 for kind,answers in [('友谊邮局',[0,1,2,0,1,2]),('小小种植家',[0,0,1,1,1,0])]:
  for level,answer in enumerate(answers):
   page.get_by_role('button',name=f'{kind}第{level+1}关',exact=False).click()
   if kind=='小小种植家':
    page.locator('.plant-choice').nth(answer).click();page.get_by_role('button',name='观察几天后',exact=False).click()
   else:page.locator('.choice').nth(answer).click()
   page.get_by_role('button',name='选好啦').click();page.get_by_role('dialog').wait_for();page.get_by_role('button',name='回农场看看').click()
 assert len(save()['completed'])==21 and save()['apples']==63
 page.get_by_role('tab',name='布置农场',exact=False).click()
 for area,name,cost in [('花园角','庆典花圃',3),('花园角','向日葵花坛',6),('庆典入口','彩色旗帜',6),('庆典入口','苹果欢迎牌',9),('分享区','分享餐桌',9),('分享区','苹果点心摊',12)]:
  page.get_by_role('button',name='布置'+area,exact=True).click();page.get_by_role('button',name=name,exact=False).click();page.get_by_role('button',name=f'用 {cost} 个苹果购买并摆放',exact=True).click()
 assert save()['apples']==18 and len(save()['decorations'])==6
 page.screenshot(path=str(ROOT/'qa/farm-v2.png'))
 page.get_by_role('button',name='布置花园角',exact=True).click();page.get_by_role('button',name='庆典花圃',exact=False).click();page.get_by_role('button',name='取消预览').click();assert save()['placed']['flowerbed']=='sunflowers'
 page.get_by_role('button',name='布置花园角',exact=True).click();page.get_by_role('button',name='庆典花圃',exact=False).click();page.get_by_role('button',name='摆在这里',exact=True).click();assert save()['apples']==18
 page.reload();page.get_by_role('button',name='返回农场',exact=True).click();assert save()['placed']['flowerbed']=='flowers' and len(save()['completed'])==21
 mobile=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 legacy={'version':1,'apples':54,'completed':['harvest-0'],'decorations':['flowers','bunting','table'],'muted':True,'reducedMotion':False}
 mobile.add_init_script('localStorage.setItem("applejack-harvest-v1",'+json.dumps(json.dumps(legacy))+')')
 mobile.goto(url);mobile.get_by_role('button',name='点击开启轻音乐',exact=True).tap();mobile.wait_for_function("document.querySelector('main').dataset.musicState==='playing'")
 assert mobile.evaluate("JSON.parse(localStorage.getItem('applejack-harvest-v2')).apples")==54
 mobile.get_by_role('button',name='返回农场',exact=True).tap();mobile.get_by_role('tab',name='布置农场',exact=False).tap();mobile.get_by_role('button',name='布置花园角',exact=True).tap();mobile.get_by_role('button',name='向日葵花坛',exact=False).tap();mobile.get_by_role('button',name='用 6 个苹果购买并摆放',exact=True).tap()
 assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
 mobile.screenshot(path=str(ROOT/'qa/farm-v2-mobile.png'),full_page=True)
 assert not errors,errors
 b.close()
server.shutdown()
print('PASS: 21 levels, 6 decorations, purchase/cancel/switch/reload, v1 migration, explicit sound unlock, mobile touch; no runtime errors')
