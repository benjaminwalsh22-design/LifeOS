// A walk through the app by finger: every step is a real tap or keystroke, so a
// control that is covered, too small to hit, or wired to nothing fails here.
//   node smoke.test.js
const path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(process.env.LIFEOS_FILE || path.join(__dirname, '..', '..', 'next.html'));
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles' });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.clock.install({ time: new Date('2026-11-10T19:30:00-08:00') });
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await page.goto('file://' + FILE); await page.waitForTimeout(300);
  await page.evaluate(() => {
    DB.profile.name = 'Benjamin';
    DB.friends.push({ id: 'f1', name: 'Marcus Hale', relationship: 'College friend', cadence: 30, lastContact: '2026-09-20', events: [], log: [], docs: [] },
                    { id: 'f2', name: 'Dana Walsh', relationship: 'Sister', cadence: 14, lastContact: '2026-11-08', events: [], log: [], docs: [] });
    DB.journal.push({ id: 'j1', date: '2026-11-09', ts: 2, status: 'done', transcription: 'Walked the kids to school. Marcus called about the cabin.', summary: 'A walk and a call.', mood: 'steady', themes: ['family'], hap: 7, anx: 3, mt: 1 },
                    { id: 'j2', date: '2025-11-10', ts: 1, status: 'done', transcription: 'Closing week. Tired but it went well.', summary: 'A closing.', mood: 'tired', themes: ['work'], hap: 6, anx: 5, mt: 1 });
    DB.goals.push({ id: 'g1', name: 'Read 20 books', kind: 'number', current: 12, target: 20, unit: 'books', why: 'To think better', createdTs: 1, updates: [], lastProgressTs: Date.now() });
    DB.twy = { id: 'nov2026', kind: 'month', name: 'November', start: '2026-11-01', end: '2026-11-30', mt: 1, goals: [
      { k: 'gym', type: 'count', target: 8, label: 'Gym, 8 sessions', log: [], mt: 0 }, { k: 'quest', type: 'done', label: 'Beat Brett at Quest for Knowledge', due: '2026-11-28', done: null, mt: 0 }] };
    for (let i = 0; i < 20; i++) { const d = new Date(Date.UTC(2026, 10, 10 - i)).toISOString().slice(0, 10); DB.stats[d] = { sleep: 6.5 + (i % 4) * 0.3, hrv: 48 + (i % 6), steps: 7000 + i * 110 }; }
    save(); renderAll();
  });
  const view = () => page.evaluate(() => currentView);
  const text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent : ''; }, sel);
  const settle = () => page.waitForTimeout(430);

  // People: open a person, mark contacted, come back
  await page.tap('.tab[data-view="friends"]'); await page.waitForTimeout(80);
  await page.tap('#friendList .row >> nth=0'); await settle();
  ok(await view() === 'person' && /Marcus Hale/.test(await text('#personBody')), 'tapping a person opens their page');
  await page.tap('#personBody .person-acts .btn.secondary'); await page.waitForTimeout(120);
  ok(await page.evaluate(() => DB.friends.find(f => f.id === 'f1').lastContact === today()), '"Contacted today" logs the contact');
  await page.tap('#tbBack'); await settle();
  ok(await view() === 'friends', 'Back returns to People');
  await page.tap('#friendList .icon-btn >> nth=0'); await page.waitForTimeout(120);
  ok(await page.evaluate(() => DB.friends.every(f => f.lastContact === today())), 'the check mark on a row logs a contact without opening the person');

  // Journal: search narrows, an entry opens and scores can be changed
  await page.tap('.tab[data-view="journal"]'); await page.waitForTimeout(150);
  await page.fill('#jSearch', 'cabin'); await page.waitForTimeout(150);
  ok((await page.locator('#journalList .jrow').count()) === 1 && /1 of 2/.test(await text('#journalCount')), 'search narrows the list and says so');
  await page.tap('#journalList .jrow'); await settle();
  ok(await view() === 'entry' && /Marcus called about the cabin/.test(await text('#entryBody .page')), 'an entry opens as a page with his words');
  await page.tap('#entryBody .sec-h .link >> nth=0'); await page.waitForTimeout(420);
  await page.tap('#scRowhap .sc >> nth=8'); await page.tap('#scRowanx .sc >> nth=1'); await page.tap('#sheet .btn'); await page.waitForTimeout(450);
  ok(await page.evaluate(() => { const j = DB.journal.find(x => x.id === 'j1'); return j.hap === 9 && j.anx === 2 && j.hapMine === 1; }) && /9\/10/.test(await text('#entryBody')), 'rescoring the day saves and the page shows it');
  await page.tap('#tbBack'); await settle();

  // Goals: tap to count, undo, open the study hub, flip and grade a card, start and quit a test
  await page.tap('.tab[data-view="goals"]'); await page.waitForTimeout(120);
  await page.tap('#twyBody .count-row >> nth=0'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => DB.twy.goals[0].log.length === 1), 'tapping the gym row counts a session');
  await page.tap('#twyBody .count-row >> nth=0 >> .count-n'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => DB.twy.goals[0].log.length === 0), 'tapping its count takes one back');
  await page.tap('#twyBody .season-study'); await settle();
  ok(await view() === 'study' && /days to the test/.test(await text('#studyBody')), 'the Quest row opens the study hub');
  await page.tap('#studyBody .study-seg button >> nth=2'); await page.waitForTimeout(100);
  await page.tap('#studyBody .flash'); await page.waitForTimeout(100);
  await page.tap('#studyBody .study-acts .btn >> nth=1'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => Object.keys(DB.study.cards).length === 1), 'a card flips on tap and "Got it" files it');
  await page.tap('#studyBody .study-seg button >> nth=3'); await page.waitForTimeout(100);
  await page.tap('#studyBody .study-acts .btn >> nth=0'); await page.waitForTimeout(120);
  ok(await page.evaluate(() => !!STUDYV.test && STUDYV.test.qs.length === 20) && !/days to the test/.test(await text('#studyBody')), 'a test starts and takes the whole screen');
  await page.tap('#studyBody .quiz-quit .link'); await page.waitForTimeout(420);
  await page.tap('#sheet .btn.destructive'); await page.waitForTimeout(450);
  ok(await page.evaluate(() => STUDYV.test === null) && /days to the test/.test(await text('#studyBody')), 'quitting asks in a sheet, then returns to the hub');
  await page.tap('#studyBody .tonight .btn'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => !!DB.study.log[today()]) && /Studied tonight/.test(await text('#studyBody')), '"Done studying tonight" logs the night');

  // Insights: a door, a trend sheet, its ranges, closing it
  await page.tap('.tab[data-view="insights"]'); await page.waitForTimeout(120);
  await page.tap('#insightsHub .row.nav >> nth=1'); await settle();
  ok(await view() === 'body', 'the Body door opens Body');
  await page.tap('#tiles .stat-row >> nth=0'); await page.waitForTimeout(450);
  ok(await page.evaluate(() => document.getElementById('overlay').classList.contains('open') && !!document.querySelector('#sheet svg.chart')), 'a number opens its trend with the chart');
  await page.tap('#sheet .segc button >> nth=1'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => TRENDV.range === 'weeks'), 'the range control switches to weeks');
  await page.tap('#sheet .closer'); await page.waitForTimeout(450);
  ok(await page.evaluate(() => !document.getElementById('overlay').classList.contains('open')), 'the close button closes the sheet');

  // the top bar: Ask Ben and Settings from anywhere; theme switch
  await page.tap('.tb-ask'); await settle();
  ok(await view() === 'ask', 'Ask Ben opens from the top bar');
  await page.tap('#topGear'); await settle();
  await page.tap('#settingsList .row >> nth=0'); await settle();
  await page.selectOption('#setTheme', 'dark'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark' && document.getElementById('metaTheme').getAttribute('content').toLowerCase() === '#0b0c0e'), 'Appearance switches to dark, browser chrome colour included');
  await page.tap('#tbBack'); await settle(); await page.tap('#tbBack'); await settle(); await page.tap('#tbBack'); await settle();
  ok(await view() === 'body', 'three Backs unwind Settings and Ask Ben to where they were opened');

  // Today: show all, and the new-entry sheet's question when a photo is a duplicate is a sheet, not a browser dialog
  await page.tap('.tab[data-view="today"]'); await page.waitForTimeout(120);
  ok(/Good evening, Benjamin/.test(await text('#greetHi')), 'Today greets by name and time of day');
  const ans = page.evaluate(() => confirmSheet('Save it anyway?', 'This photo looks identical to another entry.', 'Save anyway'));
  await page.waitForTimeout(420); await page.tap('#sheet .btn >> nth=0');
  ok(await ans === true, 'a question sheet answers yes on its button');
  const no = page.evaluate(() => confirmSheet('Erase?', '', 'Erase', true));
  await page.waitForTimeout(420); await page.tap('#sheet .closer');
  ok(await no === false, 'and no when it is dismissed');

  ok(!errs.length, 'no script errors (' + errs.join(' | ') + ')');
  await browser.close();
  console.log(fail ? fail + ' FAILED' : 'all passed'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
