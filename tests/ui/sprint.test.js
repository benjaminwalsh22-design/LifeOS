// Headless render test for the November sprint: load index.html in jsdom with a
// Fall 2026 plan already in localStorage, freeze the clock at chosen dates, and
// check the migration, the Goals card, the Today brief and the cloud merge.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(process.env.LIFEOS_FILE || require('path').join(__dirname, '..', '..', 'index.html'), 'utf8');

function boot(dateStr, seed) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://benjaminwalsh22-design.github.io/LifeOS/' });
  const w = dom.window;
  // freeze "now"
  const RealDate = w.Date;
  const fixed = new RealDate(dateStr + 'T10:00:00');
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed.getTime()])); } static now() { return fixed.getTime(); } }
  w.Date = FakeDate;
  // quiet the parts that need a network or a real browser
  w.fetch = async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => '' });
  w.navigator.serviceWorker = undefined;
  w.indexedDB = { open: () => ({}) };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.scrollTo = () => {};
  w.alert = () => {}; w.confirm = () => true;
  const key='lifeos_v1'; w.localStorage.setItem(key, JSON.stringify(seed));
  dom.window.document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const code = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
  const errors = [];
  w.addEventListener('error', (e) => errors.push(e.message));
  const sc = w.document.createElement('script'); sc.textContent = code + '\n;window.__g = (n) => eval(n);'; w.document.body.appendChild(sc);
  const g = (n) => { try { return w.__g(n); } catch (e) { return undefined; } };
  for (const n of ['DB','isSprint','showView','renderTWY','twyFocusHTML','sprintNudges','sprintTap','sprintGoal','sprintHit','sprintCount','sprintDaysDone','mergeRemote','clockOf','sessionDead','sessionAlive','supaRest','renderJournalList','SUPA']) { if (typeof w[n] === 'undefined') Object.defineProperty(w, n, { get: () => g(n), configurable: true }); }
  if (typeof w.showView !== 'function') errors.push('showView missing: ' + (w.__g ? 'script ran' : 'script did not finish'));
  return { w, errors, key };
}

const fall = { id: 'fall2026', name: 'Fall 2026', rev: 6, start: '2026-08-24', mt: 1, weeks: { w1: { c: { A: 5, B: 2, C: 5, D: 5, E: 1, F: 1, G: 6, H: 1 }, note: 'good', mt: 5 }, w2: { c: { A: 4, B: 2 }, mt: 6 } },
  tactics: [{ k: 'A', t: 5 }, { k: 'B', t: 2 }, { k: 'C', t: 5 }, { k: 'D', t: 5 }, { k: 'E', t: 1 }, { k: 'F', t: 1 }, { k: 'G', t: 6 }, { k: 'H', t: 1 }, { k: 'I', t: 6 }, { k: 'J', t: 1 }] };
const seed = { settings: {}, stats: {}, journal: [], friends: [], events: [], goals: [], checkins: {}, twy: fall };

let fail = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fail++; };

// 1. the day before it starts
{
  const { w, errors, key } = boot('2026-10-31', seed);
  ok(!errors.length, 'boots without errors on Oct 31 (' + errors.join(' | ') + ')');
  ok(key, 'storage key found: ' + key);
  const DB = w.DB;
  ok(DB.twy && DB.twy.id === 'nov2026' && DB.twy.goals.length === 3, 'migration: November plan with three goals');
  ok(DB.twyPast && DB.twyPast.fall2026 && DB.twyPast.fall2026.weeks.w1.c.A === 5, 'migration: Fall 2026 kept in twyPast with its weeks');
  ok(w.isSprint(), 'isSprint()');
  w.showView('goals'); w.renderTWY();
  const t = w.document.getElementById('twyBody').textContent;
  ok(/November sprint/.test(t) && /starts Sun, Nov 1/.test(t), 'goals card: shows "starts Sun, Nov 1" — ' + t.slice(0, 80).replace(/\s+/g, ' '));
  ok(/stopped at week 10/.test(t), 'goals card: Fall 2026 footer says stopped at week 10 — ' + (t.match(/Fall 2026[^.]*\./) || [''])[0]);
  const brief = w.twyFocusHTML();
  ok(/starts Sun, Nov 1/.test(brief), 'today brief before start: ' + brief.replace(/<[^>]+>/g, '').slice(0, 90));
}
// 2. mid-month, behind on the gym, test in 13 days
{
  const s2 = JSON.parse(JSON.stringify(seed));
  s2.twy = { id: 'nov2026', kind: 'month', name: 'November', rev: 1, start: '2026-11-01', end: '2026-11-30', mt: 1, goals: [
    { k: 'gym', type: 'count', target: 8, label: 'Gym, 8 sessions', sub: '', log: ['2026-11-03', '2026-11-05'], mt: 2 },
    { k: 'belay', type: 'done', label: 'Belay certified at Boulderdash', sub: '', done: '2026-11-10', mt: 2 },
    { k: 'quest', type: 'done', label: 'Beat Brett at Quest for Knowledge', sub: '', due: '2026-11-28', done: null, mt: 0 }] };
  const { w, errors } = boot('2026-11-15', s2);
  ok(!errors.length, 'boots without errors on Nov 15 (' + errors.join(' | ') + ')');
  const nd = w.sprintNudges();
  ok(nd && nd.S.day === 15 && nd.S.total === 30 && nd.S.left === 15, 'day 15 of 30, 15 left');
  ok(nd.hits === 1, 'one of three done (belay)');
  const txts = nd.items.map(i => i.txt);
  ok(txts.some(x => /Gym today — 2 of 8, pace says 4/.test(x)), 'gym nudge: behind pace → ' + txts[0]);
  ok(txts.some(x => /13 days to the test/.test(x)), 'quest nudge: 13 days to the test');
  ok(!txts.some(x => /elay/.test(x)), 'no belay nudge once done');
  w.showView('goals'); w.renderTWY();
  const el = w.document.getElementById('twyBody');
  ok(/behind — pace is 4 by today/.test(el.textContent), 'card: gym row says behind, pace 4');
  ok(/done Tue, Nov 10/.test(el.textContent), 'card: belay row shows done date');
  ok(/13d/.test(el.textContent), 'card: quest row shows 13d');
  // one tap counts today; a second tap the same day does not double count
  w.sprintTap('gym', 1); w.sprintTap('gym', 1);
  ok(w.sprintGoal('gym').log.length === 3 && w.sprintDaysDone(w.sprintGoal('gym')).length === 3, 'a tap counts once per day');
  // the ring saw strength work on five other days → counted without a tap
  for (const d of ['2026-11-06','2026-11-08','2026-11-10','2026-11-12','2026-11-14']) w.DB.stats[d] = { gym: 42, workout: 55 };
  w.renderTWY();
  ok(w.sprintCount(w.sprintGoal('gym')) === 8 && w.sprintHit(w.sprintGoal('gym')), 'five ring days + three taps → 8 of 8, hit');
  ok(/5 from the ring/.test(el.textContent) || /✓/.test(el.textContent), 'card shows the ring count or the tick');
  // a ring day and a tap on the same day are one session
  w.DB.stats['2026-11-03'] = { gym: 30 }; 
  ok(w.sprintCount(w.sprintGoal('gym')) === 8, 'ring + tap on Nov 3 still one session');
  ok(/✓/.test(el.textContent) && /2 of 3 done/.test(el.textContent), 'card: 2 of 3 done after gym completes');
  w.sprintTap('gym', -1);
  ok(w.sprintGoal('gym').log.length === 2 && w.sprintCount(w.sprintGoal('gym')) === 7, 'long-press undoes the tap, ring days stay');
  w.sprintTap('quest', 1);
  ok(w.sprintGoal('quest').done === '2026-11-15', 'tap marks quest done today');
  ok(w.sprintNudges().items.length === 1 && /on pace/.test(w.sprintNudges().items[0].txt) === false || w.sprintNudges().items.length === 0, 'gym at 7 of 8, on pace, quest done → at most a gentle line (' + w.sprintNudges().items.map(i=>i.txt).join('/') + ')');
  // 3. cloud merge: remote has a later belay undo and an older gym log
  const remote = JSON.parse(JSON.stringify(s2)); remote.twy.goals[1].done = null; remote.twy.goals[1].mt = 99; remote.twy.goals[0].log = ['2026-11-03']; remote.twy.goals[0].mt = 1;
  remote.twyPast = { fall2026: fall };
  w.mergeRemote(remote);
  ok(w.sprintGoal('belay').done === null, 'merge: later remote belay undo wins');
  ok(w.sprintGoal('gym').log.length === 2, 'merge: older remote gym log loses');
  ok(w.DB.twyPast.fall2026, 'merge: twyPast carried');
  // legacy plan from an old device must not replace the sprint
  const oldDev = JSON.parse(JSON.stringify(seed)); w.mergeRemote(oldDev);
  ok(w.DB.twy.id === 'nov2026', 'merge: a fall2026 payload from an old device does not replace November');
  // brief context line for the morning sentence
  ok(/November sprint, day 15 of 30/.test(w.twyFocusHTML().replace(/<[^>]+>/g, '')) || /November, day 15 of 30/.test(w.twyFocusHTML().replace(/<[^>]+>/g, '')), 'brief header: ' + w.twyFocusHTML().replace(/<[^>]+>/g, '').slice(0, 70));
}
// 4. test day and after the month
{
  const s3 = JSON.parse(JSON.stringify(seed));
  s3.twy = { id: 'nov2026', kind: 'month', name: 'November', start: '2026-11-01', end: '2026-11-30', mt: 1, goals: [
    { k: 'gym', type: 'count', target: 8, label: 'Gym, 8 sessions', log: [], mt: 0 },
    { k: 'quest', type: 'done', label: 'Beat Brett at Quest for Knowledge', due: '2026-11-28', done: null, mt: 0 }] };
  const { w } = boot('2026-11-28', s3);
  const txts = w.sprintNudges().items.map(i => i.txt);
  ok(txts.some(x => /^Test day/.test(x)), 'Nov 28: "Test day" nudge → ' + txts.join(' / '));
  ok(txts.some(x => /8 — 3 days left, this one is slipping/.test(x)), 'Nov 28: gym 0 of 8 flagged as slipping');
  const { w: w2 } = boot('2026-12-02', s3);
  ok(w2.sprintNudges() === null, 'Dec 2: no sprint nudges after the month');
  w2.showView('goals'); w2.renderTWY();
  ok(/complete/.test(w2.document.getElementById('twyBody').textContent), 'Dec 2: card header says complete');
}
// 5. clock formatter and the signed-out banner
{
  const { w } = boot('2026-11-02', seed);
  ok(w.clockOf(-0.5) === '11:30 PM' && w.clockOf(6.75) === '6:45 AM' && w.clockOf(0) === '12:00 AM' && w.clockOf(-3.08) === '8:55 PM', 'clockOf: ' + [w.clockOf(-0.5), w.clockOf(6.75), w.clockOf(0), w.clockOf(-3.08)].join(', '));
  // a signed-in phone whose refresh token is dead: every REST call 401s, refresh 401s
  w.eval("SUPA={url:'https://x.supabase.co',key:'k',session:{access_token:'a',refresh_token:'r',user:{email:'b@x'}}}");
  w.fetch = async (url) => ({ ok: false, status: 401, json: async () => ({ msg: 'Invalid Refresh Token' }), text: async () => '' });
  w.DB.journal.push({ id: 'q1', date: '2026-11-02', status: 'queued', mt: 1 });
  return Promise.resolve()
    .then(() => w.supaRest('lifeos_data?select=updated_at'))
    .then(() => {
      ok(w.eval('SUPA.expired') > 0, 'an uncurable 401 marks the session dead');
      ok(w.document.getElementById('syncBanner').hidden === false, 'banner shows');
      w.renderAcct();
      ok(/signed this phone out/.test(w.document.getElementById('acctBody').textContent), 'account card explains it');
      w.eval('thumbURL = async () => null');
      return w.renderJournalList();
    })
    .then(() => {
      ok(/Waiting on this phone — sign in to sync/.test(w.document.getElementById('journalList').textContent), 'queued entry says it is waiting on the phone');
      // a later successful call clears it
      w.fetch = async () => ({ ok: true, status: 200, json: async () => ([]), text: async () => '[]' });
      return w.supaRest('lifeos_data?select=updated_at').then(() => new Promise(res => setTimeout(res, 50)));   // let the settings card's own calls settle
    })
    .then(() => {
      ok(!w.eval('SUPA.expired') && w.document.getElementById('syncBanner').hidden === true, 'a good call clears the flag and hides the banner (expired=' + w.eval('SUPA.expired') + ', hidden=' + w.document.getElementById('syncBanner').hidden + ')');
      console.log(fail ? fail + ' FAILED' : 'all passed');
      process.exit(fail ? 1 : 0);
    }).catch(e => { console.log('FAIL async block threw: ' + (e && e.stack || e)); process.exit(1); });
}
