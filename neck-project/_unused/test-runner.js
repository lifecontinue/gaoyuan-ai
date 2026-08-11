const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/forster children/neck-project';
const SRC = 'neck-soccer.html';
const TEST = 'neck-soccer.test.html';
const PORT = 8731;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPORT = path.join(ROOT, 'test-report.txt');

// 1) make a test copy with a window export hook (keeps deliverable clean)
let html = fs.readFileSync(path.join(ROOT, SRC), 'utf8');
if (!html.includes('window.__ns')) {
  html = html.replace('  boot();',
    '  window.__ns = () => ({ score, combo, bx:ball.x, by:ball.y, bvy:ball.vy, br:ball.r, hr:header.r, hx:header.x, hy:header.y, state, camActive, demo, headerHas:header.has });\n  boot();');
}
fs.writeFileSync(path.join(ROOT, TEST), html);

const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.md':'text/markdown' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/' + TEST;
  const fp = path.join(ROOT, p);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = [];
function log(...a) { const s = a.join(' '); report.push(s); console.log(s); }

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const results = [];
  const errors = [];

  async function newPage(fakeCam) {
    const browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        fakeCam ? '--use-fake-ui-for-media-stream' : '',
        fakeCam ? '--use-fake-device-for-media-stream' : ''].filter(Boolean)
    });
    const page = await browser.newPage({ viewport: { width: 1024, height: 720 } });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon\.ico/i.test(m.text())) errors.push('CONSOLE.ERR: ' + m.text()); });
    return { browser, page };
  }

  const ns = page => page.evaluate(() => window.__ns ? window.__ns() : null);
  const dispatch = (page, x, y) => page.evaluate(([x, y]) => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y })), [x, y]);

  // ===== TEST A: Demo mode full game loop =====
  {
    const { browser, page } = await newPage(false);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await sleep(1800); // boot + camera fallback to demo

    let afterBoot = await ns(page);
    log('A0 afterBoot:', JSON.stringify(afterBoot && { state: afterBoot.state, demo: afterBoot.demo, by: Math.round(afterBoot.by) }));
    // if the ball already fell (no input yet), restart into PLAY first
    if (!afterBoot || afterBoot.state !== 'PLAY') {
      await page.click('#btnAgain');
      await sleep(700);
      afterBoot = await ns(page);
      log('A0 afterRestart:', JSON.stringify(afterBoot && { state: afterBoot.state, by: Math.round(afterBoot.by) }));
    }
    results.push(['A1 boot state', afterBoot && afterBoot.state === 'PLAY', JSON.stringify({ state: afterBoot && afterBoot.state, demo: afterBoot && afterBoot.demo })]);
    results.push(['A2 demo fallback', afterBoot && afterBoot.demo === true, 'demo=' + (afterBoot && afterBoot.demo)]);
    results.push(['A3 mode label', (await page.textContent('#modeLabel')).trim() === 'DEMO', await page.textContent('#modeLabel')]);

    // drive head onto the ball, Node-side loop (head kept ~40px BELOW ball = realistic heading)
    let maxScore = 0, maxCombo = 0, hitSeen = false, samples = [], breakReason = '';
    for (let i = 0; i < 160; i++) {
      const s = await ns(page);
      if (!s) { breakReason = 'no-state@' + i; break; }
      if (s.state !== 'PLAY') { breakReason = 'state=' + s.state + '@' + i; break; }
      if (s.score > maxScore) maxScore = s.score;
      if (s.combo > maxCombo) maxCombo = s.combo;
      if (s.headerHas) hitSeen = true;
      await dispatch(page, s.bx, s.by + 40);
      samples.push({ i, by: Math.round(s.by), hy: Math.round(s.hy), sc: s.score, st: s.state });
      await sleep(40);
    }
    results.push(['A4 collision scored', maxScore >= 3, 'maxScore=' + maxScore + ' maxCombo=' + maxCombo + ' break=' + breakReason]);
    results.push(['A5 header active', hitSeen, 'headerHasSeen=' + hitSeen]);
    log('A4 samples:', JSON.stringify(samples.slice(0, 12)));
    log('A4 break:', breakReason);

    // stop moving -> let ball fall -> game over
    await dispatch(page, 5, 5);
    let over = false;
    for (let i = 0; i < 100; i++) {
      const s = await ns(page);
      if (s && s.state === 'OVER') { over = true; break; }
      await sleep(80);
    }
    const overlayShown = await page.evaluate(() => !document.getElementById('overlay').classList.contains('hidden'));
    results.push(['A6 game over triggers', over, 'state=' + (over ? 'OVER' : 'still PLAY')]);
    results.push(['A7 overlay visible', overlayShown, 'overlayShown=' + overlayShown]);

    // click Play Again
    await page.click('#btnAgain');
    await sleep(800);
    const again = await ns(page);
    results.push(['A8 restart works', again && again.state === 'PLAY', 'state=' + (again && again.state)]);

    await browser.close();
  }

  // ===== TEST B: camera path with fake device (no crash, no face) =====
  {
    const { browser, page } = await newPage(true);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await sleep(12000); // allow getUserMedia + FaceMesh model download from CDN
    const s = await ns(page);
    const mode = (await page.textContent('#modeLabel')).trim();
    results.push(['B1 camera path no-crash', s !== null, 'state=' + (s && s.state)]);
    results.push(['B2 mode CAMERA/DEMO', mode === 'CAMERA' || mode === 'DEMO', 'mode=' + mode]);
    await browser.close();
  }

  await new Promise(r => server.close(r));

  log('\n===== TEST RESULTS =====');
  let pass = 0;
  for (const [name, ok, info] of results) {
    log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${info})`);
    if (ok) pass++;
  }
  log(`\n${pass}/${results.length} checks passed`);
  log('\n===== ERRORS (' + errors.length + ') =====');
  errors.forEach(e => log(e));

  try { fs.unlinkSync(path.join(ROOT, TEST)); } catch (e) {}
  fs.writeFileSync(REPORT, report.join('\n'));

  process.exitCode = (pass === results.length && errors.length === 0) ? 0 : 1;
})().catch(e => { log('TEST HARNESS ERROR: ' + e); fs.writeFileSync(REPORT, report.join('\n')); process.exitCode = 2; });
