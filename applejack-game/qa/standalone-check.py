from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from playwright.sync_api import sync_playwright
from pathlib import Path
root=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
s=ThreadingHTTPServer(('127.0.0.1',4176),partial(Quiet,directory=str(root)))
Thread(target=s.serve_forever,daemon=True).start()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1024});page.emulate_media(reduced_motion='reduce')
 errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:requests.append(r.url) if r.url.startswith('http') else None)
 page.goto('http://127.0.0.1:4176/applejack-play.html')
 page.get_by_role('button',name='树上的苹果 1',exact=True).wait_for()
 for i in range(12):
  page.get_by_role('button',name=f'树上的苹果 {i+1}',exact=True).click()
  page.locator('.basket-wrap').nth(i%3).click()
 page.get_by_role('button',name='装好啦').click();page.get_by_role('dialog').wait_for()
 assert not errors,'Runtime errors: '+str(len(errors))
 assert requests==['http://127.0.0.1:4176/applejack-play.html'],'Unexpected external requests: '+str(len(requests)-1)
 page.screenshot(path=str(root/'qa/standalone-success.png'))
 b.close()
s.shutdown()
message='PASS: single HTML served over HTTP; complete harvest; no external asset requests; no runtime errors. Direct file:// navigation blocked by managed Chromium policy; local double-click launch is not verified here.'
(root/'qa/standalone-results.txt').write_text(message)
print(message)
