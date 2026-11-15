// Renders screens of a build at iPhone size, in both themes.
//   LIFEOS_FILE=../../next.html LIFEOS_PAYLOAD=/path/payload.json LIFEOS_NOW=2026-11-02T07:40:00-08:00 node shots.js
// Network is blocked: nothing leaves the machine. Inter and Source Serif stand in for
// SF and New York, which only exist on Apple devices.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const FILE = path.resolve(process.env.LIFEOS_FILE || path.join(__dirname, '..', '..', 'next.html'));
const OUT = path.resolve(process.env.LIFEOS_SHOTS || path.join(__dirname, 'shots'));
const NOW = process.env.LIFEOS_NOW || '2026-11-02T07:40:00-08:00';
const FONTS = process.env.LIFEOS_FONTS || path.join(__dirname, 'node_modules', '@fontsource');
const payload = process.env.LIFEOS_PAYLOAD ? JSON.parse(fs.readFileSync(process.env.LIFEOS_PAYLOAD, 'utf8')) : null;
const life = process.env.LIFEOS_LIFE ? JSON.parse(fs.readFileSync(process.env.LIFEOS_LIFE, 'utf8')) : null;   // { digest, obs } as the account returns them
const b64 = (p) => fs.readFileSync(p).toString('base64');
const face = (fam, file, w, st) => `@font-face{font-family:"${fam}";font-weight:${w};font-style:${st || 'normal'};src:url(data:font/woff2;base64,${b64(path.join(FONTS, file))}) format("woff2")}`;
const fontCSS = [
  face('SF Stand-in', 'inter/files/inter-latin-400-normal.woff2', 400), face('SF Stand-in', 'inter/files/inter-latin-500-normal.woff2', 500), face('SF Stand-in', 'inter/files/inter-latin-600-normal.woff2', 600),
  face('New York', 'source-serif-4/files/source-serif-4-latin-400-normal.woff2', 400), face('New York', 'source-serif-4/files/source-serif-4-latin-600-normal.woff2', 600),
  ':root{--sans:"SF Stand-in",sans-serif}',
].join('\n');

async function shot(browser, { name, theme, view, w = 393, h = 852, prep, steps, wait = 450 }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles', locale: 'en-US' });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(NOW) });
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await page.addInitScript((t) => { try { localStorage.setItem('lifeos_theme', t); } catch (e) {} }, theme);
  await page.goto('file://' + FILE);
  await page.addStyleTag({ content: fontCSS });
  await page.evaluate(([p, t, l]) => {
    if (p) { mergeRemote(p); if (p.twy) DB.twy = p.twy; if (p.twyPast) DB.twyPast = p.twyPast; }
    if (l) { LIFE.digest = l.digest; LIFE.obs = l.obs; LIFE.at = Date.now(); }
    DB.settings.theme = t; applyTheme(); renderAll();
  }, [payload, theme, life]);
  if (prep) await page.evaluate(prep);
  for (const v of (view ? [].concat(view) : [])) { await page.evaluate((x) => (ROOTS.indexOf(x) >= 0 ? tabTap(x) : showView(x)), v); await page.waitForTimeout(40); }
  if (steps) await page.evaluate(steps);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(wait);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  const metrics = await page.evaluate(() => { const m = document.querySelector('main'); return { scrollH: m.scrollHeight, clientH: m.clientHeight, errors: window.__errs || 0 }; });
  await ctx.close();
  return metrics;
}

(async () => {
  const browser = await chromium.launch();
  const jobs = [];
  for (const theme of ['light', 'dark']) {
    jobs.push({ name: `today-${theme}`, theme });
    jobs.push({ name: `insights-${theme}`, theme, view: 'insights', h: Number(process.env.LIFEOS_FULL_H || 1500) });
    jobs.push({ name: `settings-${theme}`, theme, view: 'settings' });
  }
  jobs.push({ name: 'today-full', theme: 'light', h: Number(process.env.LIFEOS_FULL_H || 3760) });
  jobs.push({ name: 'guide-light', theme: 'light', view: ['settings', 'set-about', 'styleguide'], h: 4300 });
  for (const v of ['friends', 'journal', 'goals']) jobs.push({ name: `root-${v}`, theme: 'light', view: v });
  for (const v of ['mind', 'body', 'money', 'firm', 'places', 'review']) jobs.push({ name: `door-${v}`, theme: 'light', view: ['insights', v], h: 1500 });
  jobs.push({ name: 'door-body-dark', theme: 'dark', view: ['insights', 'body'] });
  for (const v of ['set-profile', 'set-account', 'set-notif', 'set-data', 'set-about']) jobs.push({ name: `page-${v}`, theme: 'light', view: ['settings', v] });
  jobs.push({ name: 'push-person', theme: 'light', steps: "openPerson(peopleThisWeek()[0].f.id)" });
  jobs.push({ name: 'push-schedule', theme: 'light', view: 'schedule' });
  jobs.push({ name: 'push-ask', theme: 'light', view: ['goals', 'ask'] });
  jobs.push({ name: 'push-study', theme: 'light', view: ['goals', 'study'] });
  jobs.push({ name: 'push-midway', theme: 'light', view: 'insights', steps: "showView('body')", wait: 110 });
  jobs.push({ name: 'scrolled-insights', theme: 'light', view: 'insights', steps: "document.getElementById('view-insights').scrollTop = 220" });
  for (const wd of [375, 430]) jobs.push({ name: `insights-${wd}`, theme: 'light', view: 'insights', w: wd });
  jobs.push({ name: 'insights-bigtext', theme: 'light', view: 'insights', w: 375, h: 1700, prep: "document.documentElement.style.fontSize='21px'; renderAll()" });
  const only = process.env.LIFEOS_ONLY;
  for (const j of jobs) { if (only && !j.name.includes(only)) continue; const m = await shot(browser, j); console.log(j.name, JSON.stringify(m)); }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
