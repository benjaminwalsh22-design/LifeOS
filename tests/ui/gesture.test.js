// The parts of navigation that need a real browser: the slide between screens,
// the swipe from the left edge, scroll positions surviving a round trip, and the
// large title folding into the bar. Runs in headless Chromium with touch.
//   node gesture.test.js
const path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(process.env.LIFEOS_FILE || path.join(__dirname, '..', '..', 'next.html'));
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await page.goto('file://' + FILE);
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const swipe = async (x0, x1, y, ms) => { await touch('touchStart', x0, y); const n = 8; for (let i = 1; i <= n; i++) { await touch('touchMove', x0 + (x1 - x0) * i / n, y); await page.waitForTimeout(ms / n); } await touch('touchEnd', x1, y); };
  const st = () => page.evaluate(() => ({ v: currentView, active: [...document.querySelectorAll('.view.active')].map(e => e.id).join(','), stack: NAV.stacks[NAV.tab].map(e => e.v).join('>'),
    y: document.getElementById('view-' + currentView).scrollTop, scrolled: document.querySelector('.app').classList.contains('scrolled'), back: !document.getElementById('tbBack').hidden,
    stray: [...document.querySelectorAll('.view')].filter(e => /nav-|under|over|dragging|settling/.test(e.className) || e.style.transform).length }));

  // seed enough to scroll
  await page.evaluate(() => { for (let i = 0; i < 40; i++) DB.friends.push({ id: 'f' + i, name: 'Person ' + i, cadence: 30, lastContact: '2026-01-01', events: [], log: [], docs: [] }); renderAll(); });
  await page.tap('.tab[data-view="friends"]'); await page.waitForTimeout(80);
  await page.evaluate(() => { document.getElementById('view-friends').scrollTop = 600; }); await page.waitForTimeout(80);
  let s = await st();
  ok(s.v === 'friends' && s.y === 600 && s.scrolled, 'People scrolls and the large title folds into the bar');
  await page.waitForTimeout(280);
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('topTitle')).opacity === '1'), 'the bar title is showing once scrolled');

  // push: both screens on stage mid-slide, one afterwards
  await page.evaluate(() => openPerson('f3')); await page.waitForTimeout(90);
  const mid = await page.evaluate(() => { const p = document.getElementById('view-person').getBoundingClientRect(), f = document.getElementById('view-friends').getBoundingClientRect(); return { px: p.left, fx: f.left, n: document.querySelectorAll('.view.active').length }; });
  ok(mid.n === 2 && mid.px > 0 && mid.px < 393 && mid.fx < 0, 'mid-push the new screen is sliding in over the old one (new at ' + Math.round(mid.px) + 'px, old at ' + Math.round(mid.fx) + 'px)');
  await page.waitForTimeout(450); s = await st();
  ok(s.v === 'person' && s.active === 'view-person' && s.back && !s.stray && s.y === 0, 'push settles: one screen, Back showing, starts at the top');

  // a short swipe springs back; a full one goes back
  await swipe(6, 70, 400, 260); await page.waitForTimeout(320); s = await st();
  ok(s.v === 'person' && !s.stray, 'a short edge swipe springs back');
  await touch('touchStart', 6, 400); for (const x of [40, 90, 150]) { await touch('touchMove', x, 400); await page.waitForTimeout(30); }
  const drag = await page.evaluate(() => ({ cur: Math.round(document.getElementById('view-person').getBoundingClientRect().left), under: getComputedStyle(document.getElementById('view-friends')).display, uy: document.getElementById('view-friends').scrollTop }));
  ok(drag.cur > 100 && drag.under === 'block' && drag.uy === 600, 'during the swipe the screen follows the finger and People shows underneath where it was left (' + drag.cur + 'px, y ' + drag.uy + ')');
  for (const x of [220, 300]) { await touch('touchMove', x, 400); await page.waitForTimeout(30); } await touch('touchEnd', 300, 400);
  await page.waitForTimeout(320); s = await st();
  ok(s.v === 'friends' && s.active === 'view-friends' && s.y === 600 && !s.back && !s.stray && s.scrolled, 'a full edge swipe goes back to People at the same place');

  // a swipe that starts away from the edge is ordinary scrolling
  await page.evaluate(() => openPerson('f3')); await page.waitForTimeout(450);
  await swipe(120, 330, 400, 200); await page.waitForTimeout(300); s = await st();
  ok(s.v === 'person', 'a swipe that starts away from the edge does not go back');

  // tabs remember their stack and their place
  await page.tap('.tab[data-view="today"]'); await page.waitForTimeout(60);
  await page.tap('.tab[data-view="friends"]'); await page.waitForTimeout(60); s = await st();
  ok(s.v === 'person' && s.stack === 'friends>person', 'leaving the tab and coming back finds the person still open');
  await page.tap('#tbBack'); await page.waitForTimeout(450); s = await st();
  ok(s.v === 'friends' && s.y === 600 && !s.stray, 'the Back button returns to the list at the same place');
  await page.tap('.tab[data-view="friends"]'); await page.waitForTimeout(700); s = await st();
  ok(s.y === 0 && !s.scrolled, 'tapping the active tab scrolls to the top and the large title returns');

  // a tap during a slide is never lost
  await page.evaluate(() => { showView('settings'); showView('set-about'); navBack(); navBack(); }); await page.waitForTimeout(450); s = await st();
  ok(s.v === 'friends' && s.active === 'view-friends' && !s.stray, 'four navigations in one breath end in the right place with nothing left over');

  // sheets: open, swipe down to dismiss
  await page.evaluate(() => openSheet('<h3>Sheet</h3><p>Body</p>')); await page.waitForTimeout(400);
  const box = await page.evaluate(() => { const r = document.getElementById('sheet').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 10 }; });
  await touch('touchStart', box.x, box.y); for (const dy of [30, 80, 150, 220]) { await touch('touchMove', box.x, box.y + dy); await page.waitForTimeout(25); } await touch('touchEnd', box.x, box.y + 220);
  await page.waitForTimeout(450);
  ok(!(await page.evaluate(() => document.getElementById('overlay').classList.contains('open'))), 'a sheet swipes down to dismiss');

  ok(!errs.length, 'no script errors (' + errs.join(' | ') + ')');
  await browser.close();
  console.log(fail ? fail + ' FAILED' : 'all passed'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
