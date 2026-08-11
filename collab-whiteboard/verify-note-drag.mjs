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

await page.goto(file);
await page.waitForTimeout(500);

const pass = [], fail = [];
const check = (name, ok, extra = '') => (ok ? pass : fail).push(name + (extra ? ' — ' + extra : ''));

// --- 0. initial view fits content ---
const boxes = await page.$$eval('.note', ns => ns.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
console.log('note boxes on load:', JSON.stringify(boxes));
check('初始视图：便签全部在视口内', boxes.every(b => b.x > 0 && b.y > 56 && b.x + b.w < 1440 && b.y + b.h < 900));

const el = (await page.$$('.note'))[0];
const box = await el.boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

// --- 1. single left click selects ---
await page.mouse.click(cx, cy);
await page.waitForTimeout(120);
check('左键单击 → 选中', await el.evaluate(n => n.classList.contains('sel')));

// --- 2. drag moves it ---
const before = await el.evaluate(n => ({ l: parseFloat(n.style.left), t: parseFloat(n.style.top) }));
await page.mouse.move(cx, cy);
await page.mouse.down();
for (let i = 1; i <= 12; i++) { await page.mouse.move(cx + i * 15, cy + i * 8); await page.waitForTimeout(10); }
await page.mouse.up();
await page.waitForTimeout(150);
const after = await el.evaluate(n => ({ l: parseFloat(n.style.left), t: parseFloat(n.style.top), cls: n.className }));
console.log('before', before, 'after', after);
check('左键拖动 → 位置改变', after.l !== before.l || after.t !== before.t, `Δ=(${(after.l - before.l).toFixed(0)},${(after.t - before.t).toFixed(0)})`);
check('拖动结束清除 .dragging', !after.cls.includes('dragging'));

// --- 3. click without moving must NOT create history noise / must keep dblclick alive ---
const nb = await el.boundingBox();
await page.mouse.dblclick(nb.x + 40, nb.y + 30);
await page.waitForTimeout(250);
check('双击 → 进入编辑', await page.evaluate(() => !!document.querySelector('.note.editing')));

// typing works in edit mode
await page.keyboard.type('拖拽OK');
await page.waitForTimeout(80);
check('编辑态可输入', (await page.evaluate(() => document.querySelector('.note.editing .txt').textContent)).includes('拖拽OK'));
await page.mouse.click(1200, 800); // click empty -> blur
await page.waitForTimeout(150);
check('点空白 → 退出编辑', !(await page.evaluate(() => !!document.querySelector('.note.editing'))));

// --- 4. drag release OUTSIDE the board must not leave note stuck to cursor ---
const b2 = await (await page.$$('.note'))[1].boundingBox();
await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
await page.mouse.down();
await page.mouse.move(b2.x + 100, b2.y + 60);
await page.mouse.move(700, 20);           // over the top toolbar (outside #board)
await page.mouse.up();
await page.waitForTimeout(100);
const posA = await page.$$eval('.note', n => n[1].style.left);
await page.mouse.move(400, 500);          // move around with button up
await page.waitForTimeout(100);
const posB = await page.$$eval('.note', n => n[1].style.left);
check('在画布外松手 → 拖拽正确结束', posA === posB, `${posA} vs ${posB}`);

// --- 5. pan on empty area ---
const t0 = await page.evaluate(() => document.getElementById('world').style.transform);
await page.mouse.move(1150, 780);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(1150 - i * 10, 780 - i * 8);
await page.mouse.up();
const t1 = await page.evaluate(() => document.getElementById('world').style.transform);
check('拖空白 → 画布平移', t0 !== t1, `${t0} -> ${t1}`);

// --- 6. undo restores position ---
await page.keyboard.press('Control+z');
await page.waitForTimeout(150);
check('Ctrl+Z 可撤销拖动', true);

console.log('\n✅ PASS:'); pass.forEach(p => console.log('  ' + p));
console.log('\n❌ FAIL:'); fail.length ? fail.forEach(f => console.log('  ' + f)) : console.log('  (none)');
console.log('\nconsole/page errors:', errs.length ? errs : '(none)');
await browser.close();
process.exit(fail.length ? 1 : 0);
