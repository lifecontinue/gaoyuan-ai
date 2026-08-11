/* Final e2e verification v2 — uses __dbg state hook (temp) for exact assertions */
const { chromium } = require('playwright-core');
const path = require('path');

const FILE = 'file:///' + path.resolve('collab-whiteboard.html').replace(/\\/g, '/');
const CHROME = 'C:/Users/haida/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  // reset canvas
  await page.evaluate(() => { document.getElementById('menuBtn').click(); });
  await page.evaluate(() => { [...document.querySelectorAll('#menuDropdown .mi')].find(m => m.dataset.act === 'reset').click(); });
  await page.waitForTimeout(400);

  // toBlob stub -> window.__lastBlob
  await page.evaluate(() => {
    const orig = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
      orig.call(this, b => { window.__lastBlob = b; cb(b); }, type, q);
    };
  });

  // world<->screen via the app's own camera (exposed through the temp __dbg hook)
  async function cam() { return await page.evaluate(() => { const c = window.__dbg.camera; return { x: c.x, y: c.y, s: c.scale }; }); }
  let camV = await cam();
  const toScreen = (wx, wy) => ({ x: wx * camV.s + camV.x, y: wy * camV.s + camV.y });
  const state = () => page.evaluate(() => ({ frames: window.__dbg.state.frames.map(f => ({ id: f.id, x: f.x, y: f.y, w: f.w, h: f.h, locked: !!f.locked, bg: f.bg })),
    notes: window.__dbg.state.notes.map(n => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, locked: !!n.locked })),
    shapes: window.__dbg.state.shapes.map(s => ({ id: s.id, x: s.x, y: s.y, locked: !!s.locked })) }));
  const selSize = () => page.evaluate(() => window.__dbg.sel.size);

  async function drawFrameTool(p1, p2) {
    await page.evaluate(() => [...document.querySelectorAll('.tool')].find(b => b.dataset.tool === 'frame').click());
    await page.mouse.move(p1.x, p1.y); await page.mouse.down();
    await page.mouse.move(p2.x, p2.y, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(200);
  }

  async function captureExport() {
    return await page.evaluate(async () => {
      window.__lastBlob = null;
      document.getElementById('menuBtn').click();
      [...document.querySelectorAll('#menuDropdown .mi')].find(m => m.dataset.act === 'png').click();
      const t0 = Date.now();
      while (!window.__lastBlob && Date.now() - t0 < 5000) await new Promise(r => setTimeout(r, 40));
      if (!window.__lastBlob) return { error: 'no blob' };
      const buf = await window.__lastBlob.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))]
        .map(b => b.toString(16).padStart(2, '0')).join('');
      const bmp = await createImageBitmap(window.__lastBlob);
      const tc = document.createElement('canvas'); tc.width = bmp.width; tc.height = bmp.height;
      const tx = tc.getContext('2d'); tx.drawImage(bmp, 0, 0);
      const img = tx.getImageData(0, 0, tc.width, tc.height).data;
      window.__exp = { w: tc.width, h: tc.height, img,
        px: (wx, wy, bx, by) => { const X = Math.round((wx - bx) * 2), Y = Math.round((wy - by) * 2); const i = (Y * tc.width + X) * 4; return [img[i], img[i + 1], img[i + 2], img[i + 3]]; } };
      return { w: tc.width, h: tc.height, hash };
    });
  }

  // ================= TEST 1: export includes frames (strong color) =================
  const refreshCam = async () => { camV = await cam(); };
  await refreshCam();
  const FR = { x: 400, y: 300 };
  const a = toScreen(FR.x, FR.y), b = toScreen(FR.x + 180, FR.y + 130);
  await drawFrameTool(a, b);
  const st1 = await state();
  const f0 = st1.frames[0];
  console.log('TEST1 frame created:', JSON.stringify(f0));
  if (!f0) { console.log('TEST1 FAIL — no frame'); }

  // force a strong bg color directly via state (UI swatches are pastels)
  await page.evaluate(() => { const f = window.__dbg.state.frames[0]; f.bg = '#CBD8B6'; window.__dbg.render(); });
  await page.waitForTimeout(150);

  // add a note and a shape to verify ALL element types present
  await refreshCam();
  const nw = toScreen(700, 500);
  await page.evaluate(() => [...document.querySelectorAll('.tool')].find(b => b.dataset.tool === 'note').click());
  await page.mouse.click(nw.x, nw.y);
  await page.waitForTimeout(150);
  const swp = toScreen(900, 550);
  await page.evaluate(() => [...document.querySelectorAll('.tool')].find(b => b.dataset.tool === 'shape').click());
  await page.mouse.click(swp.x, swp.y);
  await page.waitForTimeout(150);

  const st2 = await state();
  const n0 = st2.notes[0], s0 = st2.shapes[0];
  console.log('TEST1 note:', JSON.stringify(n0), ' shape:', JSON.stringify(s0));

  // contentBounds straight from the app (matches exportPNG exactly)
  const bb = await page.evaluate(() => window.__dbg.bounds());
  const bx = bb.x, by = bb.y;

  const exp = await captureExport();
  const pF = await page.evaluate(({ fx, fy, bx, by }) => window.__exp.px(fx, fy, bx, by),
    { fx: f0.x + f0.w / 2, fy: f0.y + f0.h / 2, bx, by });
  const pN = await page.evaluate(({ nx, ny, bx, by }) => window.__exp.px(nx, ny, bx, by),
    { nx: n0.x + n0.w / 2, ny: n0.y + n0.h / 2, bx, by });
  // expected: frame bg blend 45% over white; note full color #FEF3E6
  const expF = [Math.round(203 * .45 + 255 * .55), Math.round(216 * .45 + 255 * .55), Math.round(182 * .45 + 255 * .55)];
  const expN = [254, 243, 230];
  const near = (p, e, tol) => p && Math.abs(p[0] - e[0]) < tol && Math.abs(p[1] - e[1]) < tol && Math.abs(p[2] - e[2]) < tol;
  console.log('  frame interior px =', pF.join(','), ' expected blend =', expF.join(','), '->', near(pF, expF, 14) ? 'PASS' : 'FAIL');
  console.log('  note interior px  =', pN.join(','), ' expected =', expN.join(','), '->', near(pN, expN, 14) ? 'PASS' : 'FAIL');
  console.log('  export size =', exp.w + 'x' + exp.h, 'hash', exp.hash.slice(0, 12));

  // ================= TEST 2: lock frame -> cannot select / drag =================
  await refreshCam();
  const fc = toScreen(f0.x + f0.w / 2, f0.y + f0.h / 2);
  await page.mouse.click(fc.x, fc.y);                       // (re-)select the frame first
  await page.waitForTimeout(150);
  const selBeforeLock = await selSize();
  const lockClicked = await page.evaluate(() => {
    const b = document.querySelector('#ppBody [data-k="locked"] .pp-btn[data-v="1"]');
    if (!b) return false; b.click(); return true;
  });
  await page.waitForTimeout(200);
  const afterLock = await state();
  console.log('TEST2 lock frame: selBefore=', selBeforeLock, ' clicked=', lockClicked,
    ' locked flag=', afterLock.frames[0] && afterLock.frames[0].locked, ' selSize=', await selSize());

  const x0 = afterLock.frames[0].x, y0 = afterLock.frames[0].y;
  await page.mouse.click(fc.x, fc.y);                       // click to select -> must NOT select
  await page.waitForTimeout(150);
  const selAfterClick = await selSize();
  await page.mouse.move(fc.x, fc.y); await page.mouse.down();
  await page.mouse.move(fc.x + 130, fc.y + 95, { steps: 8 }); await page.mouse.up();  // drag -> must NOT move
  await page.waitForTimeout(200);
  const afterDrag = await state();
  const fLocked = afterDrag.frames[0];
  console.log('  after click selSize =', selAfterClick, '(expect 0) ->', selAfterClick === 0 ? 'PASS' : 'FAIL');
  console.log('  frame pos before/after drag =', x0 + ',' + y0, '->', fLocked.x + ',' + fLocked.y,
    (fLocked.x === x0 && fLocked.y === y0) ? 'PASS (immovable)' : 'FAIL (moved)');

  // ================= TEST 3: Ctrl+Shift+L unlock -> selectable again =================
  await page.keyboard.press('Control+Shift+L');
  await page.waitForTimeout(200);
  const afterUnlock = await state();
  await page.mouse.click(fc.x, fc.y);
  await page.waitForTimeout(150);
  const selAfterUnlockClick = await selSize();
  console.log('TEST3 unlock: locked flag=', afterUnlock.frames[0] && afterUnlock.frames[0].locked,
    ' selSize after click=', selAfterUnlockClick, '->', afterUnlock.frames[0] && !afterUnlock.frames[0].locked && selAfterUnlockClick === 1 ? 'PASS' : 'FAIL');

  // drag again -> should move now
  const ux = afterUnlock.frames[0].x, uy = afterUnlock.frames[0].y;
  await page.mouse.move(fc.x, fc.y); await page.mouse.down();
  await page.mouse.move(fc.x + 60, fc.y + 40, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(200);
  const afterUnlockDrag = await state();
  console.log('  frame pos after unlock drag =', ux + ',' + uy, '->', afterUnlockDrag.frames[0].x + ',' + afterUnlockDrag.frames[0].y,
    (afterUnlockDrag.frames[0].x !== ux || afterUnlockDrag.frames[0].y !== uy) ? 'PASS (movable again)' : 'FAIL (still stuck)');

  // ================= TEST 4: lock note -> cannot drag =================
  const nf = await state();
  const note = nf.notes[0]; if (!note) console.log('TEST4 skipped — no note');
  await refreshCam();
  const nc = toScreen(note.x + note.w / 2, note.y + note.h / 2);
  await page.mouse.click(nc.x, nc.y);                        // select the note
  await page.waitForTimeout(150);
  const noteLocked = await page.evaluate(() => {
    const b = document.querySelector('#ppBody [data-k="locked"] .pp-btn[data-v="1"]');
    if (!b) return false; b.click(); return true;
  });
  await page.waitForTimeout(200);
  const nl1 = await state();
  const noteSelAfter = await selSize();
  const nx0 = nl1.notes[0].x, ny0 = nl1.notes[0].y;
  await page.mouse.move(nc.x, nc.y); await page.mouse.down();
  await page.mouse.move(nc.x + 80, nc.y + 50, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(200);
  const nl2 = await state();
  console.log('TEST4 lock note: locked=', nl1.notes[0] && nl1.notes[0].locked,
    ' selSize=', noteSelAfter, ' pos', nx0 + ',' + ny0, '->', nl2.notes[0].x + ',' + nl2.notes[0].y,
    (nl1.notes[0] && nl1.notes[0].locked && nl2.notes[0].x === nx0 && nl2.notes[0].y === ny0) ? 'PASS' : 'FAIL');

  // ================= TEST 5: supabase default config =================
  const sb = await page.evaluate(() => {
    document.getElementById('acctBtn').click();
    return { login: !!document.getElementById('apSend'), stored: localStorage.getItem('sbw.config') };
  });
  console.log('TEST5 supabase-default: magic-link form (cloudReady)=', sb.login ? 'PASS' : 'FAIL', ' stored cfg=', sb.stored);

  console.log('ERRORS:', errors.length ? JSON.stringify(errors) : 'none');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
