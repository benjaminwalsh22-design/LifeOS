const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(process.env.LIFEOS_FILE || require('path').join(__dirname, '..', '..', 'index.html'), 'utf8');
function boot(dateStr, seed) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://benjaminwalsh22-design.github.io/LifeOS/' });
  const w = dom.window;
  const RealDate = w.Date; const fixed = new RealDate(dateStr + 'T19:00:00');
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed.getTime()])); } static now() { return fixed.getTime(); } }
  w.Date = FakeDate;
  w.fetch = async (u) => ({ ok: true, status: 200, json: async () => (String(u).includes('wikipedia') ? { thumbnail: { source: 'https://upload.wikimedia.org/x/320px-y.jpg' }, originalimage: {} } : {}), text: async () => '' });
  w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.indexedDB = { open: () => ({}) }; w.scrollTo = () => {}; w.confirm = () => true;
  w.localStorage.setItem('lifeos_v1', JSON.stringify(seed));
  w.document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const errors = []; w.addEventListener('error', (e) => errors.push(e.message));
  const code = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
  const sc = w.document.createElement('script'); sc.textContent = code + '\n;window.__g = (n) => eval(n);'; w.document.body.appendChild(sc);
  const g = (n) => { try { return w.__g(n); } catch (e) { return undefined; } };
  for (const n of ['DB','STUDYV','QFK','mergeRemote']) { if (typeof w[n] === 'undefined') Object.defineProperty(w, n, { get: () => g(n), configurable: true }); }
  return { w, errors };
}
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const seed = { settings: {}, stats: {}, journal: [], friends: [], events: [], goals: [], checkins: {}, twy: { id: 'nov2026', kind: 'month', name: 'November', start: '2026-11-01', end: '2026-11-30', mt: 1, goals: [
  { k: 'gym', type: 'count', target: 8, label: 'Gym, 8 sessions', log: [], mt: 0 },
  { k: 'belay', type: 'done', label: 'Belay certified at Boulderdash', done: null, mt: 0 },
  { k: 'quest', type: 'done', label: 'Beat Brett at Quest for Knowledge', due: '2026-11-28', done: null, mt: 0 }] } };

(async () => {
  const { w, errors } = boot('2026-11-03', seed);   // a Tuesday → astronomy
  ok(!errors.length, 'boots (' + errors.join('|') + ')');
  ok(w.QFK.cards.length > 140 && w.QFK.mc.length >= 70 && w.QFK.fill.length >= 90, 'pools: ' + w.QFK.cards.length + ' cards, ' + w.QFK.mc.length + ' MC, ' + w.QFK.fill.length + ' fill');
  // MC answer indices valid and 4 options each
  ok(w.QFK.mc.every(q => q[2].length === 4 && q[3] >= 0 && q[3] < 4), 'every MC has 4 options and a valid answer');
  // the goals page shows the study card; the brief nudge points to study
  w.showView('goals');
  ok(/Quest for Knowledge — 25 days to the test · tonight Astronomy/.test(w.document.getElementById('twyBody').textContent), 'goals page: study card with days and tonight\'s subject');
  const brief = w.twyFocusHTML();
  ok(/25 days to the test — tonight is Astronomy/.test(brief.replace(/<[^>]+>/g,'')) && /showView\('study'\)/.test(brief), 'brief nudge names tonight\'s subject and opens the hub');
  // open the hub
  w.showView('study');
  const body = () => w.document.getElementById('studyBody').textContent;
  ok(/25 days to the test/.test(body()) && /Tonight: Astronomy/.test(body()) && /Week 1 · foundations/.test(body()), 'plan segment renders: ' + body().slice(0, 80).replace(/\s+/g,' '));
  // log tonight
  w.studyLogToday();
  ok(w.DB.study.log['2026-11-03'] && /✓ Studied tonight/.test(body()) && /1 night running/.test(body()), 'log tonight → streak 1');
  ok(w.twyFocusHTML().indexOf('tonight is') < 0, 'brief stops nagging once tonight is logged');
  // guide
  w.STUDYV.seg = 'guide'; w.renderStudy();
  ok(/1491–1607 · Contact/.test(body()) && /Columbian Exchange/.test(body()), 'guide renders history sections');
  w.STUDYV.gsub = 'astro'; w.renderStudy(); ok(/Required sky recognition/.test(body()), 'guide: astronomy');
  w.STUDYV.gsub = 'animals'; w.renderStudy(); ok(/Look-alikes/.test(body()), 'guide: animals');
  // cards
  w.STUDYV.seg = 'cards'; w.STUDYV.sub = 'astro'; w.STUDYV.queue = null; w.renderStudy();
  const n0 = w.STUDYV.queue.length;
  ok(n0 === w.QFK.cards.filter(c => c[0] === 'astro').length, 'all astronomy cards due at first: ' + n0);
  ok(/tap to show the answer/.test(body()), 'card front shown');
  w.STUDYV.flipped = true; w.renderStudy(); ok(/Again/.test(body()) && /Got it/.test(body()), 'flip shows grading buttons');
  const first = w.STUDYV.card; w.studyGrade(true);
  ok(w.DB.study.cards['c' + first].box === 1 && w.DB.study.cards['c' + first].due === '2026-11-04', 'Got it → box 1, due tomorrow');
  const second = w.STUDYV.card; w.STUDYV.flipped = true; w.studyGrade(false);
  ok(w.DB.study.cards['c' + second].box === 1 && w.DB.study.cards['c' + second].due === '2026-11-03' && w.STUDYV.queue[w.STUDYV.queue.length - 1] === second, 'Again → stays due today and requeues at the end');
  ok(w.STUDYV.queue.length === n0 - 1, 'queue shrinks by one');
  // test: deterministic checks on the answer matcher
  ok(w.ansMatch('jamestown', ['Jamestown']) && w.ansMatch('The Columbian exchange', ['Columbian Exchange']) && w.ansMatch('Saratogga', ['Saratoga']) && w.ansMatch('14th', ['Fourteenth','14th','14']) && w.ansMatch('brown v board of ed', ['Brown v. Board of Education','Brown v Board','Brown']), 'matcher accepts case, articles, one typo, variants');
  ok(!w.ansMatch('crescent', ['Waning crescent']) && !w.ansMatch('', ['Zenith']) && !w.ansMatch('Yorktown', ['Saratoga']), 'matcher rejects vague, empty, wrong');
  w.STUDYV.seg = 'test'; w.STUDYV.sub = 'all'; w.renderStudy();
  ok(/20 questions/.test(body()) && /60, like the baseline/.test(body()), 'test launcher');
  w.studyTestStart('all', 20);
  const T = w.STUDYV.test;
  ok(T.qs.length === 20 && new Set(T.qs.map(x => x.s)).size === 3, '20 questions across three subjects');
  // answer every question: MC pick the right one, fill type the canonical answer (every other one wrong)
  let i = 0;
  while (w.STUDYV.test && w.STUDYV.test.at < 20) {
    const x = w.STUDYV.test.qs[w.STUDYV.test.at];
    if (x.kind === 'mc') { w.studyPick(i % 2 ? x.q[3] : (x.q[3] + 1) % 4); }
    else { const inp = w.document.getElementById('studyAns'); inp.value = i % 2 ? x.q[2][0] : 'zzz'; w.studyCheck(); }
    w.studyNext(); i++;
  }
  ok(w.DB.study.tests.length === 1 && w.DB.study.tests[0].n === 20 && w.DB.study.tests[0].score === 10, 'test saved: 10/20 (' + (w.DB.study.tests[0] && w.DB.study.tests[0].score) + ')');
  ok(/50%/.test(body()) && /Missed/.test(body()), 'result screen shows 50% and the missed list');
  // visuals
  for (const k of ['const','moon','eclipse','solar','life','galaxy']) {
    w.STUDYV.vis = k; w.STUDYV.visQ = null; w.STUDYV.seg = 'visual'; w.renderStudy();
    const Q = w.STUDYV.visQ;
    ok(Q.options.length === 4 && Q.options.includes(Q.answer) && new Set(Q.options).size === 4 && /<svg|→/.test(Q.svg), 'visual ' + k + ': 4 distinct options incl. answer → ' + Q.answer);
  }
  // moon geometry: waxing crescent lit on the right (path's inner arc sweep 0), waning on left
  ok(/A 36 36 0 0 1 50 86 A 19\.8 36 0 0 0/.test(w.moonSVG(1)) && /A 36 36 0 0 0 50 86 A 19\.8 36 0 0 1/.test(w.moonSVG(7)), 'moon crescents drawn on the correct sides');
  ok(/L 50 14/.test(w.moonSVG(2)) && /A 36 36 0 0 1 50 86 A 19\.8 36 0 0 1/.test(w.moonSVG(3)), 'first quarter is a half, waxing gibbous bulges left');
  w.studyVisPick(w.STUDYV.visQ.options.indexOf(w.STUDYV.visQ.answer));
  ok(w.STUDYV.visScore[0] === 1 && w.STUDYV.visScore[1] === 1, 'visual pick scores');
  w.STUDYV.vis = 'photo'; w.STUDYV.visQ = null; w.renderStudy();
  await new Promise(r => setTimeout(r, 30));
  ok(/<img src="https:\/\/upload\.wikimedia\.org\/x\/640px-y\.jpg"/.test(w.document.getElementById('studyPhoto').innerHTML), 'photo drill loads the Wikipedia lead image at 640px');
  ok(w.QFK.visual.photos.animals.length >= 75, 'photo list covers the recognition list: ' + w.QFK.visual.photos.animals.length);
  // listen
  w.STUDYV.seg = 'listen'; w.renderStudy(); ok((body().match(/↗/g) || []).length >= 15, 'listen links render');
  // merge: remote has an older card grade and a newer log night and a test
  const remote = JSON.parse(JSON.stringify(seed)); remote.study = { log: { '2026-11-02': 1 }, cards: { ['c' + first]: { box: 3, due: '2026-11-09', t: 1 } }, tests: [{ id: 'r1', date: '2026-11-02', sub: 'hist', n: 20, score: 15, ms: 60000, by: {} }] };
  w.mergeRemote(remote);
  ok(w.DB.study.log['2026-11-02'] && w.DB.study.log['2026-11-03'], 'merge: nights union');
  ok(w.DB.study.cards['c' + first].box === 1, 'merge: newer local grade wins over older remote');
  ok(w.DB.study.tests.length === 2 && w.DB.study.tests[0].id === 'r1', 'merge: tests union, sorted by date');
  ok(w.studyStreak() === 2, 'streak counts both nights');
  // notification prefs include study
  ok(w.notifPrefs().studyOn === true, 'studyOn default on');
  // after the exam: no card, no nudge
  const { w: w2 } = boot('2026-12-01', seed); w2.showView('goals');
  ok(w2.document.getElementById('twyBody').textContent.indexOf('Quest for Knowledge —') < 0, 'after the test: study card gone');
  console.log(fail ? fail + ' FAILED' : 'all passed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL threw: ' + (e.stack || e)); process.exit(1); });
