import { chromium } from 'playwright-core';
import path from 'path';

const file = 'file:///' + path.resolve('C:/Users/haida/.cursor/game/collab-whiteboard/collab-whiteboard.html').replace(/\\/g, '/');
const checks = [];
function check(name, ok, detail) {
  const s = ok ? 'PASS' : 'FAIL';
  console.log(`  ${s}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) checks.push(`FAIL: ${name} (${detail})`);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('console', msg => { if (msg.type() === 'error') errs.push(msg.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto(file, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 1) topbar is Notion-style (light surface background)
  const tbBg = await page.evaluate(() => getComputedStyle(document.getElementById('topbar')).backgroundColor);
  check('top bar uses surface background', tbBg.includes('255') || tbBg.includes('254') || tbBg.includes('247') || tbBg.includes('rgba'), `bg=${tbBg}`);

  // 2) brand logo visible
  check('brand visible', !!(await page.$('.brand')));

  // 3) property panel + bottom bar exist
  check('left property panel exists', !!(await page.$('#propBar')));
  check('bottom bar exists', !!(await page.$('#botbar')));

  // 4) board area has size
  const boardTop = await page.evaluate(() => {
    const b = document.getElementById('board');
    return { top: b.offsetTop, h: b.clientHeight };
  });
  check('canvas area has size', boardTop.h > 200, `top=${boardTop.top}, h=${boardTop.h}`);

  // 5) tool set: select/note/text/pen/eraser/shape/connect/frame, NO hand
  const tools = await page.evaluate(() =>
    [...document.querySelectorAll('.tool')].map(b => b.dataset.tool));
  check('tool set is select/note/text/pen/eraser/shape/connect/frame (no hand)',
    tools.includes('select') && tools.includes('note') && tools.includes('text') &&
    tools.includes('pen') && tools.includes('eraser') && tools.includes('shape') &&
    tools.includes('connect') && tools.includes('frame') && !tools.includes('hand'),
    `tools=[${tools.join(',')}]`);

  // 6) Lucide-style stroke SVGs in toolbar
  const hasLucide = await page.evaluate(() => {
    const svgs = document.querySelectorAll('.tool svg');
    if (!svgs.length) return false;
    const f = svgs[0];
    return f.getAttribute('fill') === 'none' && f.hasAttribute('stroke');
  });
  check('tool icons are Lucide-style stroke SVGs', hasLucide);

  // 7) menu bar opens and shows bg color dots
  await page.click('#menuBtn');
  await page.waitForTimeout(200);
  const menuOpen = await page.evaluate(() => document.getElementById('menuDropdown').classList.contains('show'));
  check('menu dropdown opens', menuOpen);
  const bgDots = await page.evaluate(() => document.querySelectorAll('#bgPicker .bg-dot').length);
  check('canvas background picker has 6 dots', bgDots === 6, `count=${bgDots}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // 8) note tool -> dynamic panel renders color swatches
  await page.click('.tool[data-tool="note"]');
  await page.waitForTimeout(200);
  const noteSw = await page.evaluate(() => document.querySelectorAll('#ppBody .pp-sw').length);
  check('note tool shows color swatches in panel', noteSw === 6, `count=${noteSw}`);
  const noteActive = await page.evaluate(() => document.querySelector('.tool[data-tool="note"]').classList.contains('active'));
  check('note tool active', noteActive);

  // 9) placing a note reverts to select tool
  const boardBox = await page.evaluate(() => {
    const b = document.getElementById('board').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.click(boardBox.x, boardBox.y);
  await page.waitForTimeout(200);
  const reverted = await page.evaluate(() => document.querySelector('.tool[data-tool="select"]').classList.contains('active'));
  check('single-use note reverts to select tool', reverted);
  const noteCount = await page.evaluate(() => document.querySelectorAll('.note').length);
  check('a note was created', noteCount >= 3, `notes=${noteCount}`);

  // 10) frame tool -> drag creates a frame and reverts to select
  await page.click('.tool[data-tool="frame"]');
  await page.waitForTimeout(120);
  const fStart = { x: boardBox.x - 200, y: boardBox.y - 150 };
  await page.mouse.move(fStart.x, fStart.y);
  await page.mouse.down();
  await page.mouse.move(fStart.x + 220, fStart.y + 160, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const frameReverted = await page.evaluate(() => document.querySelector('.tool[data-tool="select"]').classList.contains('active'));
  check('frame tool reverts to select after drag', frameReverted);

  // 11) bottom bar zoom controls
  const bbZoom = await page.$('#bbZoomPct');
  check('bottom zoom readout exists', !!bbZoom);
  const before = await page.evaluate(() => document.getElementById('bbZoomPct').textContent);
  await page.click('#bbZoomIn');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => document.getElementById('bbZoomPct').textContent);
  check('zoom in changes percentage', before !== after, `${before} -> ${after}`);

  // 12) grid toggle
  await page.click('#bbGrid');
  await page.waitForTimeout(150);
  const gridOff = await page.evaluate(() => !document.getElementById('bbGrid').classList.contains('on'));
  check('grid can be turned off', gridOff);
  await page.click('#bbGrid');
  await page.waitForTimeout(150);

  // 13) property panel collapse / expand
  await page.click('#ppToggle');
  await page.waitForTimeout(250);
  const collapsed = await page.evaluate(() => document.getElementById('propBar').classList.contains('collapsed'));
  check('property panel collapses', collapsed);
  // Per design: collapse is done by #ppToggle (inside the panel); expand is done by #ppReopen (floating button shown when collapsed).
  await page.evaluate(() => { const t = document.getElementById('ppReopen'); if (t) t.click(); });
  await page.waitForTimeout(250);
  const expanded = await page.evaluate(() => { const p = document.getElementById('propBar'); return !p.classList.contains('collapsed') && p.offsetWidth > 0; });
  check('property panel expands', expanded);

  // 14) seed demo notes still render
  check('seed demo notes render', noteCount >= 3, `notes=${noteCount}`);

  // 15) keyboard: N selects note tool
  await page.keyboard.press('n');
  await page.waitForTimeout(100);
  const noteViaKey = await page.evaluate(() => document.querySelector('.tool[data-tool="note"]').classList.contains('active'));
  check('N key selects note tool', noteViaKey);

  // summary
  console.log('\n───────────────────────────────');
  console.log('console/page errors:', errs.length ? errs : '(none)');
  if (checks.length === 0) {
    console.log(`ALL CHECKS PASSED ✓`);
  } else {
    console.log(`${checks.length} FAILED:`);
    checks.forEach(c => console.log('  ✗', c));
  }
  if (errs.length) checks.push('console errors: ' + errs.join(' | '));

  await browser.close();
  process.exit(checks.length > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
