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
page.on('dialog', d => d.accept());   // auto-accept delete confirm()

const pass = [], fail = [];
const check = (n, ok, x = '') => (ok ? pass : fail).push(n + (x ? ' — ' + x : ''));
const ls = async () => page.evaluate(() => {
  const raw = localStorage.getItem('sbw.boards');
  return raw ? JSON.parse(raw) : [];
});

await page.goto(file);
await page.waitForTimeout(600);

// 1) first-run seeding
const seeded = await ls();
check('首次启动自动种入 1 个画布', seeded.length === 1, 'count=' + seeded.length);
const dot0 = await page.textContent('#saveDot span');
check('保存状态为「已保存」', dot0.trim() === '已保存', dot0.trim());
const title0 = await page.inputValue('#boardTitle');
check('标题已填充', !!title0, title0);

// 2) drawer reflects the seeded board
await page.keyboard.press('Control+k');
await page.waitForTimeout(200);
const rowCount1 = await page.locator('#dwList .bd').count();
check('抽屉列出 1 个画布', rowCount1 === 1, 'rows=' + rowCount1);
await page.keyboard.press('Control+k'); // close drawer
await page.waitForTimeout(150);

// 3) edit a note -> dirty -> auto-save persists
const nb = await page.locator('.note').first().boundingBox();
await page.mouse.dblclick(nb.x + nb.width / 2, nb.y + nb.height / 2);
await page.waitForTimeout(120);
await page.keyboard.type('加一句需求');
await page.evaluate(() => document.activeElement.blur());
await page.waitForTimeout(150);
const dirtyDot = await page.textContent('#saveDot span');
check('编辑后出现未保存/保存中状态', dirtyDot.trim() !== '已保存', dirtyDot.trim());
await page.waitForTimeout(1400); // wait for 1100ms auto-save
const savedDot = await page.textContent('#saveDot span');
check('自动保存后回到「已保存」', savedDot.trim() === '已保存', savedDot.trim());
const afterEdit = await ls();
check('编辑内容已持久化', afterEdit.length === 1 && /加一句需求/.test(afterEdit[0].data),
  afterEdit.length ? 'match=' + /加一句需求/.test(afterEdit[0].data) : 'no board');

// 4) create a new board
await page.keyboard.press('Control+k');
await page.waitForTimeout(200);
await page.click('#dwNew');
await page.waitForTimeout(300);
const afterNew = await ls();
check('新建后共 2 个画布', afterNew.length === 2, 'count=' + afterNew.length);

// 5) rename current board via title field
await page.fill('#boardTitle', '我的方案B');
await page.dispatchEvent('#boardTitle', 'change');
await page.waitForTimeout(200);
await page.keyboard.press('Control+k');
await page.waitForTimeout(150);
const renameShown = await page.locator('#dwList .bd .n', { hasText: '我的方案B' }).count();
check('抽屉显示重命名后的标题', renameShown >= 1, 'shown=' + renameShown);
await page.keyboard.press('Control+k');
await page.waitForTimeout(150);

// 6) switch boards (open a different one)
await page.keyboard.press('Control+k');
await page.waitForTimeout(200);
const rows = page.locator('#dwList .bd:not(.cur)');
const beforeTitle = await page.inputValue('#boardTitle');
await rows.first().click();
await page.waitForTimeout(300);
const afterTitle = await page.inputValue('#boardTitle');
check('点击可切换画布（标题变化）', beforeTitle !== afterTitle, beforeTitle + ' -> ' + afterTitle);

// 7) manual save Ctrl+S does not error and keeps saved state
await page.keyboard.press('Control+s');
await page.waitForTimeout(200);
const sDot = await page.textContent('#saveDot span');
check('Ctrl+S 后状态正常', sDot.trim() === '已保存' || sDot.trim() === '保存中…', sDot.trim());

// 8) delete a board
await page.keyboard.press('Control+k');
await page.waitForTimeout(200);
const delBefore = await page.locator('#dwList .bd').count();
await page.locator('#dwList .bd .more').first().click();
await page.waitForTimeout(150);
await page.locator('#ctx .ci', { hasText: '删除' }).click();
await page.waitForTimeout(300);
const delAfter = await page.locator('#dwList .bd').count();
check('删除后画布数 -1', delAfter === delBefore - 1, delBefore + ' -> ' + delAfter);
const afterDel = await ls();
check('删除已持久化', afterDel.length === delAfter, 'ls=' + afterDel.length);
await page.keyboard.press('Control+k');
await page.waitForTimeout(150);

// 8b) connection route switch still works (select all, press 2 -> elbow)
await page.keyboard.press('Control+a');
await page.waitForTimeout(120);
await page.keyboard.press('2');
await page.waitForTimeout(1500); // allow auto-save
const routeData = (await ls())[0] ? (await ls())[0].data : '';
check('连线走线切换生效（route=elbow）', /"route":"elbow"/.test(routeData), 'match=' + /"route":"elbow"/.test(routeData));

// 9) reload restores persisted boards (no manipulation)
await page.reload();
await page.waitForTimeout(600);
const reloadCount = (await ls()).length;
check('刷新后画布仍在（持久化恢复）', reloadCount === delAfter, 'afterReload=' + reloadCount);

console.log('\n✅', pass.join('\n  '));
console.log('\n❌', fail.length ? fail.join('\n  ') : '(none)');
console.log('\nerrors:', errs.length ? errs : '(none)');
await browser.close();
process.exit(fail.length || errs.length ? 1 : 0);
