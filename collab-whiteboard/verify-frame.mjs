import { createRequire } from 'node:module';
import url from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/haida/.workbuddy/binaries/node/workspace/node_modules/playwright-core');

const file = url.pathToFileURL('C:/Users/haida/.cursor/game/collab-whiteboard/collab-whiteboard.html').href;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

const pass = [], fail = [];
const check = (n, ok, x = '') => (ok ? pass : fail).push(n + (x ? ' — ' + x : ''));

await page.goto(file);
await page.waitForTimeout(500);

// helper: count non-transparent pixels on the selection overlay canvas
async function selPixels() {
  return await page.evaluate(() => {
    const c = document.getElementById('selCanvas'); const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
}
async function selBBox() {
  return await page.evaluate(() => {
    const c = document.getElementById('selCanvas'); const ctx = c.getContext('2d');
    const w = c.width, h = c.height; const d = ctx.getImageData(0, 0, w, h).data;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 0) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    return { minX, minY, maxX, maxY };
  });
}

// --- 1) create a frame by dragging the frame tool ---
await page.click('.tool[data-tool="frame"]');
await page.mouse.move(360, 300);
await page.mouse.down();
await page.mouse.move(1020, 660, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(200);

// frame tool reverts to select after the drag completes
const reverted = await page.evaluate(() => document.querySelector('.tool[data-tool="select"]').classList.contains('active'));
check('frame tool reverts to select after drag', reverted);

// frame is auto-selected -> selection handles are drawn on the overlay
const selPx = await selPixels();
check('selected frame draws selection handles', selPx > 50, 'px=' + selPx);

// --- 2) frame name is editable from the property panel (frame auto-selected now) ---
const nameOk = await page.evaluate(() => {
  const inp = document.querySelector('#propBar input.pp-input[data-k="frameName"]');
  if (!inp) return false;
  inp.value = 'My Frame';
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  const after = document.querySelector('#propBar input.pp-input[data-k="frameName"]');
  return after ? after.value === 'My Frame' : false;
});
check('frame name input exists and accepts input', nameOk);

// --- 3) minimap repositioned to top-right ---
const mm = await page.evaluate(() => {
  const m = document.getElementById('minimap').getBoundingClientRect();
  const b = document.getElementById('board').getBoundingClientRect();
  return { top: m.top - b.top, rightGap: b.right - m.right };
});
check('minimap moved to top area', mm.top < 200, 'top=' + Math.round(mm.top));
check('minimap anchored to right edge', mm.rightGap < 40, 'rightGap=' + Math.round(mm.rightGap));

// --- 4) clipping: a note dropped inside the frame gets a clip-path ---
await page.click('.tool[data-tool="note"]');
await page.mouse.click(690, 480);
await page.waitForTimeout(150);
const clip = await page.evaluate(() => {
  const n = document.querySelector('.note');
  return n ? (n.style.clipPath || '') : 'no-note';
});
check('note inside frame is clipped', /inset\(/.test(clip), clip.slice(0, 40));

// reset to the select tool so the next click selects rather than draws
await page.click('.tool[data-tool="select"]');
await page.waitForTimeout(60);

// --- 5) re-select the frame (click empty frame area, away from the note) and resize via its SE handle ---
await page.mouse.click(420, 340);
await page.waitForTimeout(150);
const reselectPanel = await page.evaluate(() => (document.getElementById('propBar').innerText || '').slice(0, 20));
check('re-clicking the frame selects it', /Frame/.test(reselectPanel), reselectPanel.replace(/\n/g, ' '));

const b1 = await selBBox();
await page.mouse.move(b1.maxX, b1.maxY);
await page.mouse.down();
await page.mouse.move(b1.maxX - 140, b1.maxY - 100, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(150);
const b2 = await selBBox();
const a1 = (b1.maxX - b1.minX) * (b1.maxY - b1.minY);
const a2 = (b2.maxX - b2.minX) * (b2.maxY - b2.minY);
check('dragging SE handle resizes the frame', a2 < a1 * 0.95, `area ${Math.round(a1)} -> ${Math.round(a2)}`);

console.log('\n✅', pass.join('\n  '));
console.log('\n❌', fail.length ? fail.join('\n  ') : '(none)');
console.log('\nerrors:', errs.length ? errs : '(none)');
await browser.close();
process.exit(fail.length || errs.length ? 1 : 0);
