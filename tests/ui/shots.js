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
  // phase 3 screens
  const ENTRY = "openEntry(DB.journal.filter(j=>j.status==='done'&&j.transcription&&j.summary&&j.hap>0).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0].id)";
  jobs.push({ name: 'p3-journal', theme: 'light', view: 'journal', h: 1700 });
  jobs.push({ name: 'p3-journal-dark', theme: 'dark', view: 'journal' });
  jobs.push({ name: 'p3-entry', theme: 'light', view: 'journal', steps: ENTRY, h: 2600 });
  jobs.push({ name: 'p3-entry-dark', theme: 'dark', view: 'journal', steps: ENTRY });
  for (const v of ['mind', 'body', 'money', 'firm']) jobs.push({ name: `p3-door-${v}`, theme: 'light', view: ['insights', v], h: 2300 });
  jobs.push({ name: 'p3-door-mind-dark', theme: 'dark', view: ['insights', 'mind'] });
  jobs.push({ name: 'p3-trend-sheet', theme: 'light', view: ['insights', 'body'], steps: "openTrend('hrv')", wait: 600 });
  jobs.push({ name: 'p3-people', theme: 'light', view: 'friends', h: 1500 });
  jobs.push({ name: 'p3-person', theme: 'light', view: 'friends', steps: "openPerson(DB.friends.slice().sort((a,b)=>((b.log||[]).length+(b.docs||[]).length)-((a.log||[]).length+(a.docs||[]).length))[0].id)", h: 2600 });
  jobs.push({ name: 'p3-person-dark', theme: 'dark', view: 'friends', steps: "openPerson(peopleThisWeek()[0].f.id)" });
  jobs.push({ name: 'p3-goals', theme: 'light', view: 'goals', h: 1500 });
  jobs.push({ name: 'p3-goals-dark', theme: 'dark', view: 'goals' });
  for (const seg of ['plan', 'guide', 'cards', 'test', 'visual', 'listen']) jobs.push({ name: `p3-study-${seg}`, theme: 'light', view: ['goals', 'study'], steps: `STUDYV.seg='${seg}'; renderStudy()`, h: 1300 });
  jobs.push({ name: 'p3-study-quiz', theme: 'light', view: ['goals', 'study'], steps: "STUDYV.seg='test'; studyTestStart('all',20); const T=STUDYV.test; const k=T.qs.findIndex(x=>x.kind==='mc'); T.at=k<0?0:k; renderStudy(); studyPick((T.qs[T.at].q[3]+1)%4)" });
  jobs.push({ name: 'p3-study-fill', theme: 'dark', view: ['goals', 'study'], steps: "STUDYV.seg='test'; studyTestStart('all',20); const T=STUDYV.test; const k=T.qs.findIndex(x=>x.kind==='fill'); T.at=k<0?0:k; renderStudy(); document.getElementById('studyAns').value='zzz'; studyCheck()" });
  jobs.push({ name: 'p3-study-card', theme: 'dark', view: ['goals', 'study'], steps: "STUDYV.seg='cards'; renderStudy(); STUDYV.flipped=true; renderStudy()" });
  const ASKMD = "## The record\n\nYou have been here before. In March 2019 you wrote about the same pull toward a fight when work ran long.\n\n> I picked a fight tonight because I was tired, not because she was wrong. (2019-03-14)\n\nThe pattern in the record is plain: the fights follow short nights.\n\n## Future Ben\n\nSleep first. Say the true thing tomorrow, in one sentence.\n\n## Sources\n\n- 2019-03-14 — the fight after the closing\n- 2021-10-02 — the apology";
  const ASKFILL = "document.getElementById('askQuote').innerHTML='<q>The good days are the ones where I stop keeping score.</q><div class=\\'aq-meta\\'><span>2022-06-11 · <a>open the entry</a></span><span role=\\'button\\'>another line</span></div>'; document.getElementById('askThread').innerHTML='<div class=\\'turn\\'><div class=\\'turn-q\\'>I am about to pick a fight with Annalise about the schedule. Am I doing the thing again?</div><div class=\\'turn-meta\\'>2026-11-02 · both voices · deep</div><div class=\\'turn-log\\'><div>searched the record for fights after long work days</div><div>read 14 entries</div></div><div class=\\'turn-a\\'>'+askMd(ASKMD_)+'</div></div>'";
  jobs.push({ name: 'p3-ask', theme: 'light', view: 'ask', h: 1100 });
  jobs.push({ name: 'p3-ask-answer', theme: 'light', view: 'ask', steps: "window.ASKMD_=" + JSON.stringify(ASKMD) + ";" + ASKFILL, h: 2100 });
  jobs.push({ name: 'p3-ask-answer-dark', theme: 'dark', view: 'ask', steps: "window.ASKMD_=" + JSON.stringify(ASKMD) + ";" + ASKFILL + ";document.getElementById('view-ask').scrollTop=520" });
  const MEMPICK = "(()=>{const m=DB.memories.filter(x=>x.text&&x.text.length>300&&x.text.length<700).sort((a,b)=>b.yr-a.yr)[0]||DB.memories[0]; const ms=DB.memories.filter(x=>x.yr===m.yr).sort((a,b)=>(a.n||0)-(b.n||0)); return {m, yr:m.yr, i:ms.indexOf(m), n:ms.length};})()";
  jobs.push({ name: 'p3-mem', theme: 'light', view: 'journal', steps: "MEMV.yr=" + MEMPICK + ".yr; showView('memories')", h: 1300 });
  jobs.push({ name: 'p3-mem-next', theme: 'light', view: 'journal', steps: "MEMV.yr='next'; showView('memories')" });
  jobs.push({ name: 'p3-mem-sheet', theme: 'light', view: 'journal', steps: "MEMV.yr=" + MEMPICK + ".yr; showView('memories'); openMemory(" + MEMPICK + ".m.id)", wait: 700 });
  for (const th of ['light', 'dark']) jobs.push({ name: `p3-read-${th}`, theme: th, steps: "{const P=" + MEMPICK + "; memReadStart(P.yr, P.i);}", wait: 700 });
  jobs.push({ name: 'p3-read-end', theme: 'light', steps: "{const P=" + MEMPICK + "; memReadStart(P.yr, P.n-1);}", wait: 700 });
  jobs.push({ name: 'p3-review', theme: 'light', view: ['insights', 'review'], h: 1700 });
  jobs.push({ name: 'p3-places', theme: 'light', view: ['insights', 'places'], h: 1500 });
  jobs.push({ name: 'p3-schedule', theme: 'light', view: 'schedule', steps: "DB.events.push({id:'x1',title:'Closing call',date:today(),time:'09:30',notes:'Bring the redline',done:false},{id:'x2',title:'Gym',date:today(),time:'17:00',notes:'',done:true}); DB.calEvents=[{title:'Dentist',date:today(),time:'14:00'}]; renderAll()" });
  jobs.push({ name: 'p3-schedule-dark', theme: 'dark', view: 'schedule' });
  const only = process.env.LIFEOS_ONLY;
  for (const j of jobs) { if (only && !j.name.includes(only)) continue; const m = await shot(browser, j); console.log(j.name, JSON.stringify(m)); }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
