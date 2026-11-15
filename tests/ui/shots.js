// Renders screens of a build at iPhone size, in both themes and both directions.
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
const b64 = (p) => fs.readFileSync(p).toString('base64');
const face = (fam, file, w, st) => `@font-face{font-family:"${fam}";font-weight:${w};font-style:${st || 'normal'};src:url(data:font/woff2;base64,${b64(path.join(FONTS, file))}) format("woff2")}`;
const fontCSS = [
  face('SF Stand-in', 'inter/files/inter-latin-400-normal.woff2', 400), face('SF Stand-in', 'inter/files/inter-latin-500-normal.woff2', 500), face('SF Stand-in', 'inter/files/inter-latin-600-normal.woff2', 600),
  face('New York', 'source-serif-4/files/source-serif-4-latin-400-normal.woff2', 400), face('New York', 'source-serif-4/files/source-serif-4-latin-600-normal.woff2', 600),
  ':root{--sans:"SF Stand-in",sans-serif}',
].join('\n');

async function shot(browser, { name, theme, dir, view, w = 393, h = 852, prep }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles', locale: 'en-US' });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(NOW) });
  await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  await page.addInitScript(([t, d]) => { try { localStorage.setItem('lifeos_theme', t); if (d === 'b') localStorage.setItem('lifeos_dir', 'b'); } catch (e) {} }, [theme, dir]);
  await page.goto('file://' + FILE);
  await page.addStyleTag({ content: fontCSS });
  await page.evaluate(([p, t]) => {
    if (p) { mergeRemote(p); if (p.twy) DB.twy = p.twy; if (p.twyPast) DB.twyPast = p.twyPast; }
    DB.settings.theme = t; applyTheme(); renderAll();
  }, [payload, theme]);
  if (prep) await page.evaluate(prep);
  if (view) await page.evaluate((v) => showView(v), view);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  const metrics = await page.evaluate(() => { const m = document.querySelector('main'); return { scrollH: m.scrollHeight, clientH: m.clientHeight, errors: window.__errs || 0 }; });
  await ctx.close();
  return metrics;
}

(async () => {
  const browser = await chromium.launch();
  const jobs = [];
  for (const dir of ['a', 'b']) for (const theme of ['light', 'dark']) {
    jobs.push({ name: `today-${dir}-${theme}`, theme, dir });
    jobs.push({ name: `today-${dir}-${theme}-full`, theme, dir, h: Number(process.env.LIFEOS_FULL_H || 2700) });
  }
  for (const theme of ['light', 'dark']) jobs.push({ name: `guide-a-${theme}`, theme, dir: 'a', view: 'styleguide', h: 4300 });
  jobs.push({ name: 'guide-b-light', theme: 'light', dir: 'b', view: 'styleguide', h: 4300 });
  for (const wd of [375, 430]) jobs.push({ name: `today-a-light-${wd}`, theme: 'light', dir: 'a', w: wd });
  for (const v of ['journal', 'insights', 'goals', 'friends', 'settings', 'study', 'ask']) jobs.push({ name: `legacy-${v}`, theme: 'light', dir: 'a', view: v, h: 1500 });
  jobs.push({ name: 'today-a-light-bigtext', theme: 'light', dir: 'a', w: 375, h: 1500, prep: "document.documentElement.style.fontSize='21px'; renderAll()" });
  const only = process.env.LIFEOS_ONLY;
  for (const j of jobs) { if (only && !j.name.includes(only)) continue; const m = await shot(browser, j); console.log(j.name, JSON.stringify(m)); }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
