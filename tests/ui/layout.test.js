// Every screen at every iPhone width, at normal and large text, in both themes:
// nothing may run off the side of the screen, and nothing may throw.
//   LIFEOS_PAYLOAD=/path/payload.json node layout.test.js      (real data makes this a much better test; without it, sample data)
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(process.env.LIFEOS_FILE || path.join(__dirname, '..', '..', 'next.html'));
const payload = process.env.LIFEOS_PAYLOAD ? JSON.parse(fs.readFileSync(process.env.LIFEOS_PAYLOAD, 'utf8')) : null;
const life = process.env.LIFEOS_LIFE ? JSON.parse(fs.readFileSync(process.env.LIFEOS_LIFE, 'utf8')) : null;
let fail = 0; const ok = (c, m) => { if (!c) { console.log('FAIL ' + m); fail++; } };
const SCREENS = [['today'], ['friends'], ['journal'], ['goals'], ['insights'], ['schedule'], ['ask'], ['goals', 'study'], ['insights', 'mind'], ['insights', 'body'], ['insights', 'money'],
  ['insights', 'firm'], ['insights', 'places'], ['insights', 'review'], ['journal', 'memories'], ['settings'], ['settings', 'set-profile'], ['settings', 'set-account'], ['settings', 'set-notif'],
  ['settings', 'set-lock'], ['settings', 'set-ai'], ['settings', 'set-health'], ['settings', 'set-data'], ['settings', 'set-about'], ['settings', 'set-about', 'styleguide'], ['PERSON'], ['ENTRY']];
(async () => {
  const browser = await chromium.launch(); let checked = 0;
  for (const w of [375, 390, 393, 430]) for (const fs_ of [17, 21]) for (const theme of (w === 393 ? ['light', 'dark'] : ['light'])) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles' });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.clock.install({ time: new Date('2026-11-02T07:40:00-08:00') });
    await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
    await page.addInitScript((t) => { try { localStorage.setItem('lifeos_theme', t); } catch (e) {} }, theme);
    await page.goto('file://' + FILE);
    await page.waitForTimeout(250);                       // let the app finish reading its own storage before seeding
    await page.evaluate(([p, l, t, f]) => {
      if (p) { mergeRemote(p); if (p.twy) DB.twy = p.twy; if (p.twyPast) DB.twyPast = p.twyPast; }
      else { DB.friends.push({ id: 'f1', name: 'Bartholomew Featherstonehaugh-Montgomery', relationship: 'College friend and former colleague', cadence: 30, lastContact: '2026-09-20', events: [], log: [], docs: [] });
        DB.journal.push({ id: 'j1', date: '2026-11-01', ts: 1, status: 'done', transcription: 'A long day. '.repeat(40), summary: 'A long day indeed.', mood: 'steady', themes: ['work', 'family'], hap: 7, anx: 3, mt: 1 }); }
      if (l) { LIFE.digest = l.digest; LIFE.obs = l.obs; LIFE.at = Date.now(); }
      DB.settings.theme = t; applyTheme(); document.documentElement.style.fontSize = f + 'px'; renderAll();
    }, [payload, life, theme, fs_]);
    for (const sc of SCREENS) {
      await page.evaluate((steps) => { tabTap('today'); showView('today');
        if (steps[0] === 'PERSON') { tabTap('friends'); openPerson(DB.friends[0].id); }
        else if (steps[0] === 'ENTRY') { tabTap('journal'); openEntry(DB.journal.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0].id); }
        else for (const v of steps) (ROOTS.indexOf(v) >= 0 ? tabTap(v) : showView(v));
        navFinish(); }, sc);
      await page.waitForTimeout(60);
      const off = await page.evaluate(() => {
        const W = window.innerWidth, out = [], v = document.querySelector('.view.active');
        const hidden = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') return true; if (p !== el && /(auto|scroll)/.test(cs.overflowX) && p !== v) return true; if (p !== el && cs.overflow === 'hidden' && cs.textOverflow !== 'clip') return true; } return false; };
        for (const el of v.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
          if ((r.right > W + 1 || r.left < -1) && !hidden(el)) out.push((el.className && String(el.className).slice(0, 30) || el.tagName) + ' [' + Math.round(r.left) + ',' + Math.round(r.right) + ']'); }
        const bar = document.querySelector('header.topbar').getBoundingClientRect();
        if (v.scrollWidth > v.clientWidth + 1) out.push('screen scrolls sideways by ' + (v.scrollWidth - v.clientWidth) + 'px');
        if (bar.right > W + 1) out.push('top bar is wider than the screen');
        return out.slice(0, 4);
      });
      checked++;
      ok(!off.length, sc.join(' > ') + ' at ' + w + 'pt, text ' + fs_ + 'px, ' + theme + ': ' + off.join('; '));
    }
    ok(!errs.length, 'script errors at ' + w + 'pt: ' + errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log(fail ? fail + ' FAILED of ' + checked + ' screens' : 'all passed (' + checked + ' screen renders)'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
