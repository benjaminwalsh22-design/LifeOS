// Old build vs redesigned build: the same scripted session must leave the same
// data behind and make the same network calls. The redesign may change every
// pixel; it may not change what is saved or sent.
//   node parity.test.js            compares index.html with next.html
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..', '..');
const OLD = process.env.LIFEOS_OLD || path.join(ROOT, 'rollback', 'index-v10.5.html');
const NEW = process.env.LIFEOS_FILE || path.join(ROOT, 'next.html');

function boot(file, dateStr, seed) {
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://benjaminwalsh22-design.github.io/LifeOS/' });
  const w = dom.window;
  const RealDate = w.Date; const fixed = new RealDate(dateStr + 'T19:00:00');
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed.getTime()])); } static now() { return fixed.getTime(); } }
  w.Date = FakeDate;
  let r = 12345; w.Math.random = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };   // same ids in both builds
  const calls = [];
  w.fetch = async (u, o) => { calls.push({ u: String(u), m: (o && o.method) || 'GET', b: o && o.body ? String(o.body).slice(0, 4000) : '' }); await new Promise((r) => setTimeout(r, 4)); return { ok: false, status: 503, json: async () => ({}), text: async () => '' }; };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.indexedDB = { open: () => ({}) }; w.scrollTo = () => {}; w.confirm = () => true;
  w.localStorage.setItem('lifeos_v1', JSON.stringify(seed));
  w.localStorage.setItem('lifeos_supa_cfg', JSON.stringify({ url: 'https://x.supabase.co', key: 'anon', session: { access_token: 'a', refresh_token: 'r', user: { id: 'u1', email: 'b@example.com' } } }));
  w.document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const errors = []; w.addEventListener('error', (e) => errors.push(e.message));
  const code = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
  const sc = w.document.createElement('script'); sc.textContent = code + '\n;window.__g = (n) => eval(n);'; w.document.body.appendChild(sc);
  return { w, errors, calls, g: (n) => w.__g(n) };
}

const seed = () => ({
  profile: { name: 'Benjamin' }, settings: { theme: 'light', apiKey: 'sk-test', macros: { p: 150, f: 30, s: 25 } },
  stats: { '2026-11-14': { sleep: 7.2, hrv: 58, rhr: 50, steps: 9100, gym: 40, workout: 55 }, '2026-11-15': { sleep: 6.4, hrv: 51, protein: 80, fiber: 12, sugar: 30, kcal: 1500 } },
  journal: [
    { id: 'j1', date: '2019-11-15', ts: 1, status: 'done', transcription: 'Nov 15. Up early, walked before the kids woke. Closing Friday.', summary: 'An early walk before a closing week.', mood: 'steady', themes: ['work'], hap: 7, anx: 4, mt: 1 },
    { id: 'j2', date: '2021-11-15', ts: 2, status: 'done', transcription: 'Long day. Annalise and I talked about the move.', summary: 'A long day and a talk about moving.', mood: 'tired', themes: ['family'], hap: 6, anx: 5, mt: 1 },
    { id: 'j3', date: '2023-11-15', ts: 3, status: 'done', transcription: 'William took his first steps tonight.', summary: 'First steps.', mood: 'joyful', themes: ['kids'], hap: 9, anx: 2, mt: 1 },
    { id: 'j4', date: '2026-11-13', ts: 4, status: 'done', transcription: 'Studied astronomy with Marcus on the phone.', summary: 'Study night.', mood: 'focused', themes: ['study'], hap: 7, anx: 3, mt: 1 }],
  friends: [
    { id: 'f1', name: 'Marcus', relationship: 'College friend', cadence: 30, lastContact: '2026-09-20', birthday: '1991-11-19', events: [], log: [], docs: [] },
    { id: 'f2', name: 'Dana', relationship: 'Sister', cadence: 14, lastContact: '2026-11-10', events: [], log: [], docs: [] }],
  events: [{ id: 'e1', title: 'Closing call', date: '2026-11-15', time: '09:30', notes: '', done: false }], calEvents: [{ title: 'Dentist', date: '2026-11-15', time: '14:00' }],
  goals: [{ id: 'g1', name: 'Read 20 books', kind: 'number', current: 12, target: 20, unit: 'books', why: 'To think better', createdTs: 1, updates: [], lastProgressTs: 1 }],
  checkins: {}, memories: [{ id: 'm1', yr: 2019, date: '2019-11', title: 'The cabin weekend', text: 'Snowed in for two days.' }], memCand: [], reviews: [], tomb: {},
  twy: { id: 'nov2026', kind: 'month', name: 'November', rev: 1, start: '2026-11-01', end: '2026-11-30', mt: 1, goals: [
    { k: 'gym', type: 'count', target: 8, label: 'Gym, 8 sessions', sub: '', log: ['2026-11-03', '2026-11-05'], mt: 2 },
    { k: 'belay', type: 'done', label: 'Belay certified at Boulderdash', sub: '', done: null, mt: 0 },
    { k: 'quest', type: 'done', label: 'Beat Brett at Quest for Knowledge', sub: '', due: '2026-11-28', done: null, mt: 0 }] },
});

// one scripted session, driven through the app's own functions and forms
async function session(b) {
  const { w, g } = b; const $ = (id) => w.document.getElementById(id);
  const set = (id, v) => { const el = $(id); if (!el) throw new Error('missing field #' + id); el.value = v; };
  for (const v of ['today', 'friends', 'journal', 'goals', 'study', 'insights', 'schedule', 'places', 'health', 'review', 'settings', 'ask', 'today']) w.showView(v);
  w.logTile('sleep'); set('tileVal', '7.5'); w.saveTile('sleep');
  w.editEvent(''); set('evTitle', 'Gym'); set('evDate', '2026-11-15'); set('evTime', '05:00'); set('evNotes', 'legs'); w.saveEvent('');
  w.toggleEvent('e1');
  w.sprintTap('gym', 1); w.sprintTap('belay', 1); w.sprintTap('belay', 1);
  w.showView('study'); w.studyLogToday();
  g('STUDYV').seg = 'cards'; g('STUDYV').sub = 'astro'; g('STUDYV').queue = null; w.renderStudy(); g('STUDYV').flipped = true; w.studyGrade(true); g('STUDYV').flipped = true; w.studyGrade(false);
  w.editFriend(''); set('frName', 'Priya'); set('frRel', 'Law school'); set('frBday', '1990-03-02'); set('frCad', '30'); set('frLast', '2026-11-01'); w.saveFriend('');
  w.markContacted('f1');
  w.addMeal({ desc: 'Eggs and toast', calories: 420, protein_g: 28, fiber_g: 4, added_sugar_g: 2 });
  w.openCheckin(); set('ck_caffeine', '180'); set('ck_notes', 'steady day'); w.saveCheckin();
  w.regenBrief();
  try { await w.syncPush(); } catch (e) {}
  w.mergeRemote({ friends: [{ id: 'f9', name: 'Remote Friend', cadence: 30, events: [], log: [], docs: [] }], study: { log: { '2026-11-12': 1 }, cards: {}, tests: [] }, stats: { '2026-11-12': { sleep: 8 } } });
  w.renderAll(); w.showView('today');
  await new Promise((r) => setTimeout(r, 60));
}
const norm = (db) => { const d = JSON.parse(JSON.stringify(db)); return d; };

setTimeout(() => { console.log('FAIL timed out'); process.exit(1); }, 60000);
(async () => {
  let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
  const a = boot(OLD, '2026-11-15', seed()), b = boot(NEW, '2026-11-15', seed());
  let ea = null, eb = null;
  try { await session(a); } catch (e) { ea = e; } try { await session(b); } catch (e) { eb = e; }
  ok(!ea, 'old build runs the session' + (ea ? ': ' + ea.message : ''));
  ok(!eb, 'new build runs the session' + (eb ? ': ' + eb.message : ''));
  ok(!a.errors.length && !b.errors.length, 'no uncaught errors (old ' + a.errors.join('|') + ' / new ' + b.errors.join('|') + ')');
  const da = norm(a.g('DB')), db = norm(b.g('DB'));
  const keys = [...new Set([...Object.keys(da), ...Object.keys(db)])].sort();
  for (const k of keys) { const x = JSON.stringify(da[k]), y = JSON.stringify(db[k]); ok(x === y, 'DB.' + k + ' identical' + (x === y ? '' : '\n      old ' + String(x).slice(0, 300) + '\n      new ' + String(y).slice(0, 300))); }
  const la = a.w.localStorage.getItem('lifeos_v1'), lb = b.w.localStorage.getItem('lifeos_v1');
  ok(la === lb, 'saved copy on the phone identical (' + (la || '').length + ' bytes)');
  // Under a failing network both builds retry in the background, so the count and order
  // of calls depend on timing. What must match is the set of distinct requests: the same
  // endpoints, the same prompts, the same payloads.
  const uniq = (cs) => [...new Set(cs.map((c) => c.m + ' ' + c.u + ' ' + c.b))].sort();
  const ca = uniq(a.calls), cb = uniq(b.calls);
  const onlyA = ca.filter((x) => !cb.includes(x)), onlyB = cb.filter((x) => !ca.includes(x));
  ok(!onlyA.length && !onlyB.length, 'distinct network requests identical (' + ca.length + ' kinds; ' + a.calls.length + ' calls old, ' + b.calls.length + ' new)' +
    (onlyA.length || onlyB.length ? '\n      only old: ' + onlyA.map((x) => x.slice(0, 160)).join('\n                ') + '\n      only new: ' + onlyB.map((x) => x.slice(0, 160)).join('\n                ') : ''));
  const extra = Object.keys(b.w.localStorage).filter((k) => !(k in a.w.localStorage));
  ok(extra.every((k) => k === 'lifeos_theme' || k === 'lifeos_dir'), 'the only new storage keys are display preferences: ' + (extra.join(', ') || 'none'));
  console.log(fail ? fail + ' FAILED' : 'all passed'); process.exit(fail ? 1 : 0);
})();
