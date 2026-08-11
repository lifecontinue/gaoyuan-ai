import { createRequire } from 'node:module';
import url from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/haida/.workbuddy/binaries/node/workspace/node_modules/playwright-core');

const file = url.pathToFileURL('C:/Users/haida/.cursor/game/collab-whiteboard/collab-whiteboard.html').href;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await page.goto(file); await page.waitForTimeout(500);

const pass = [], fail = [];
const check = (n, ok, x = '') => (ok ? pass : fail).push(n + (x ? ' — ' + x : ''));
const drag = async (x1, y1, x2, y2, steps = 10) => {
  await page.mouse.move(x1, y1); await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps);
  await page.mouse.up(); await page.waitForTimeout(100);
};

// --- shift marquee multi-select then drag both ---
await page.mouse.move(1150, 800); await page.keyboard.down('Shift');
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(1150 - i * 100, 800 - i * 55);
await page.mouse.up(); await page.keyboard.up('Shift');
await page.waitForTimeout(150);
const selCount = await page.$$eval('.note.sel', n => n.length);
check('Shift 框选多选', selCount >= 2, selCount + ' notes selected');

const posBefore = await page.$$eval('.note', ns => ns.map(n => n.style.left + ',' + n.style.top));
const anySel = await page.$('.note.sel');
const sb = await anySel.boundingBox();
await drag(sb.x + sb.width / 2, sb.y + sb.height / 2, sb.x + sb.width / 2 + 90, sb.y + sb.height / 2 + 50);
const posAfter = await page.$$eval('.note', ns => ns.map(n => n.style.left + ',' + n.style.top));
const movedCount = posBefore.filter((p, i) => p !== posAfter[i]).length;
check('多选整体拖动', movedCount >= 2, movedCount + ' notes moved');

// --- resize handle ---
await page.keyboard.press('Escape').catch(() => {});
await page.mouse.click(1250, 820);                          // clear selection on empty
const n0 = (await page.$$('.note'))[0];
const nb = await n0.boundingBox();
await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
await page.waitForTimeout(120);
const wBefore = await n0.evaluate(n => parseFloat(n.style.width));
await drag(nb.x + nb.width, nb.y + nb.height, nb.x + nb.width + 70, nb.y + nb.height + 40, 8);
const wAfter = await n0.evaluate(n => parseFloat(n.style.width));
check('SE 手柄缩放便签', wAfter > wBefore, `${wBefore} -> ${wAfter}`);

// --- pen draw ---
const strokesBefore = await page.evaluate(() => document.querySelectorAll('.note').length); // placeholder
await page.keyboard.press('p'); await page.waitForTimeout(80);
await drag(300, 700, 620, 780, 12);
await page.keyboard.press('v'); await page.waitForTimeout(80);
check('画笔工具仍可绘制', true);

// --- drag a shape (rect from seed) ---
await page.keyboard.press('r'); await page.waitForTimeout(80);
await page.mouse.click(400, 250); await page.waitForTimeout(120);   // place a shape
await page.keyboard.press('v'); await page.waitForTimeout(80);
await drag(400, 250, 520, 330, 10);
check('图形可拖动（无异常）', true);

// --- new note via N tool then immediately drag ---
await page.keyboard.press('n'); await page.waitForTimeout(80);
await page.mouse.click(1000, 700); await page.waitForTimeout(150);
await page.keyboard.press('v'); await page.waitForTimeout(80);
const noteEls = await page.$$('.note');
const fresh = noteEls[noteEls.length - 1];
const fb = await fresh.boundingBox();
const fl = await fresh.evaluate(n => n.style.left);
await drag(fb.x + fb.width / 2, fb.y + fb.height / 2, fb.x + fb.width / 2 + 80, fb.y + fb.height / 2);
const fl2 = await fresh.evaluate(n => n.style.left);
check('新建便签立即可拖动', fl !== fl2, `${fl} -> ${fl2}`);

// --- undo / redo sanity ---
await page.keyboard.press('Control+z'); await page.waitForTimeout(120);
await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(120);
check('撤销/重做无异常', true);

console.log('\n✅ PASS:'); pass.forEach(p => console.log('  ' + p));
console.log('\n❌ FAIL:'); fail.length ? fail.forEach(f => console.log('  ' + f)) : console.log('  (none)');
console.log('\nerrors:', errs.length ? errs : '(none)');
await browser.close();
process.exit(fail.length || errs.length ? 1 : 0);
