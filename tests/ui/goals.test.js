// Goals v2: weekly goals that count themselves, a long game, lists.
// Loads the built app in jsdom with a frozen clock and checks the counting, the cap,
// the carry-over of goals made before this version, and what the screens show.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(process.env.LIFEOS_FILE || require('path').join(__dirname, '..', '..', 'next.html'), 'utf8');

function boot(dateStr, seed, extra, net) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://benjaminwalsh22-design.github.io/LifeOS/' });
  const w = dom.window;
  const RealDate = w.Date, fixed = new RealDate(dateStr + 'T10:00:00');
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed.getTime()])); } static now() { return fixed.getTime(); } }
  w.Date = FakeDate;
  w.fetch = net || (async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => '' }));
  w.navigator.serviceWorker = undefined; w.indexedDB = { open: () => ({}) };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
  w.localStorage.setItem('lifeos_v1', JSON.stringify(seed));
  for (const k in (extra || {})) w.localStorage.setItem(k, typeof extra[k] === 'string' ? extra[k] : JSON.stringify(extra[k]));
  w.document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const code = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
  const errors = []; w.addEventListener('error', (e) => errors.push(e.message));
  const sc = w.document.createElement('script'); sc.textContent = code + '\n;window.__g = (n) => eval(n);'; w.document.body.appendChild(sc);
  const g = (n) => w.__g(n);
  return { w, errors, g, $: (id) => w.document.getElementById(id), saved: () => JSON.parse(w.localStorage.getItem('lifeos_v1')) };
}
let fail = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fail++; };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + (JSON.stringify(a) === JSON.stringify(b) ? '' : '  (got ' + JSON.stringify(a) + ', wanted ' + JSON.stringify(b) + ')'));

// the four goals as they stood before this version (names as he typed them; numbers are stand-ins)
const his = () => ({
  profile: { name: 'Benjamin' }, settings: { theme: 'light' }, journal: [], friends: [], events: [], checkins: {}, tomb: {},
  stats: { '2026-08-28': { weight: 188.5 }, '2026-09-01': { weight: 186.1 },
    '2026-11-30': { sleep: 7.2 }, '2026-12-01': { sleep: 6.5, gym: 40 }, '2026-12-02': { sleep: 7.0 } },
  goals: [
    { id: 'a', name: 'Lose 15 Pounds', kind: 'number', unit: 'Lbs', start: 185, target: 170, current: 184, direction: 'down', targetDate: '2026-12-31', why: 'Be healthy and have more energy', createdTs: Date.parse('2026-07-20'), updates: [{ date: '2026-08-22', ts: 1, value: 184 }], lastProgressTs: 1, milestones: [] },
    { id: 'b', name: 'Retire at 40', kind: 'number', unit: '$M portfolio', start: 2, target: 6.25, current: 2.2, direction: 'up', targetDate: '2031-01-01', why: 'Work is a choice', createdTs: 2, mt: 5, updates: [{ date: '2026-08-26', ts: 2, value: 2.2 }], lastProgressTs: 2, milestones: [] },
    { id: 'c', name: 'School-Year Bucket-List Bingo', kind: 'milestones', why: 'One team', createdTs: 3, mt: 5, updates: [], milestones: [{ id: 'm1', text: 'Five in a row', done: false }, { id: 'm2', text: 'Blackout by June', done: false }] },
    { id: 'd', name: "Annalise's health checkpoints", kind: 'milestones', why: '', createdTs: 4, mt: 5, updates: [], milestones: [{ id: 'm3', text: 'Week 4', done: false }] }],
  twy: { id: 'nov2026', kind: 'month', name: 'November', start: '2026-11-01', end: '2026-11-30', mt: 1, goals: [{ k: 'gym', type: 'count', target: 8, label: 'Gym, 8 sessions', sub: '', log: [], mt: 0 }] },
});

// ---------------------------------------------------------------- carry-over (Wednesday 2 December 2026)
{
  const { w, errors, g, $, saved } = boot('2026-12-02', his());
  ok(!errors.length, 'boots without errors (' + errors.join(' | ') + ')');
  const G = () => g('DB').goals, by = (id) => G().find((x) => x.id === id);
  eq(G().map((x) => x.id), ['a', 'b', 'c', 'd', 'g2-sleep', 'g2-date'], 'his four goals are kept and the two chosen weekly goals are added');
  eq([by('a').shape, by('a').state, by('a').act.label, by('a').act.n, by('a').act.src, by('a').resSrc], ['weekly', 'active', 'Gym', 2, 'gym', 'weight'], 'the weight goal becomes a weekly goal: gym twice a week, weight from the scale');
  eq([by('a').kind, by('a').start, by('a').target, by('a').targetDate, by('a').updates.length, by('a').why], ['number', 185, 170, '2026-12-31', 1, 'Be healthy and have more energy'], 'and keeps every field it had');
  eq([by('b').shape, by('c').shape, by('d').shape, by('b').state], ['long', 'list', 'list', 'active'], 'the portfolio goal is a long-game goal; the two milestone goals are lists; none is hidden');
  eq([by('g2-sleep').act.src, by('g2-sleep').act.n, by('g2-date').act.src, by('g2-date').act.n], ['sleep7', 5, 'tap', 1], 'sleep is counted by the ring on five nights; date night is once a week by tap');
  ok(saved().settings.goals2 === 2 && saved().goals.length === 6, 'the set-up is saved');
  ok(/gym or did a strength workout/.test(by('a').act.what) && /Annalise/.test(by('g2-date').act.what) && by('g2-sleep').act.what === undefined, 'the gym and date night say what counts, for the journal to go by; sleep is left to the ring');
  const again = boot('2026-12-03', saved());
  eq(again.g('DB').goals.length, 6, 'opening the app again adds nothing twice');

  // ---- counting
  const wk = (id) => { const s = g('goalStatus')(by(id)); return [s.w.n, s.w.target, s.label]; };
  eq(wk('g2-sleep'), [2, 5, 'On pace'], 'sleep: Monday and Wednesday were seven hours, Tuesday was not: 2 of 5, on pace');
  eq(wk('a'), [1, 2, 'On pace'], 'gym: the ring saw a session on Tuesday: 1 of 2');
  eq(wk('g2-date'), [0, 1, 'On pace'], 'date night: nothing yet');
  w.goalTap('g2-date');
  eq([wk('g2-date'), by('g2-date').act.days], [[1, 1, 'Done this week'], ['2026-12-02']], 'a tap counts today, and the week is done');
  ok(by('g2-date').mt > 1e12, 'a tap stamps the goal so the change reaches other devices');
  w.goalTap('g2-date');
  eq(wk('g2-date')[0], 0, 'a second tap takes it back');
  w.goalTap('a', '2026-12-01');
  eq([wk('a')[0], by('a').act.off], [0, ['2026-12-01']], 'a day the ring counted can be struck by hand');
  w.goalTap('a', '2026-12-01');
  eq([wk('a')[0], by('a').act.off, by('a').act.days], [1, [], []], 'and put back, without double counting');
  w.goalTap('a', '2026-12-05');
  eq(wk('a')[0], 1, 'a day in the future cannot be counted');
  w.goalTap('a'); w.goalTap('a', '2026-11-30');
  eq(wk('a'), [3, 2, 'Done this week'], 'more than the target still reads as done');

  // ---- the result
  const r = g('goalResult')(by('a'));
  eq([r.cur, r.last.d, r.target, r.by], [186.1, '2026-09-01', 170, '2026-12-31'], 'the result is the latest reading from the scale, with its date');
  ok(/<svg class="g-pace"/.test(g('goalResultHTML')(by('a'))) && /From your scale .{1,3}last reading Sep 1/.test(g('goalResultHTML')(by('a')).replace(/<[^>]+>/g, ' ')), 'shown against the pace line, with how fresh it is');

  // ---- the screens
  w.showView('goals');
  const txt = (el) => el.textContent.replace(/\s+/g, ' ');
  const list = $('goalList');
  eq(list.querySelectorAll('.g-card').length, 3, 'Goals shows three cards');
  ok(/Long game/.test(txt(list)) && /Retire at 40/.test(txt(list)) && /Lists/.test(txt(list)) && /Bucket-List Bingo/.test(txt(list)), 'with the long game and the lists beneath');
  ok(/2\.2 of 6\.25 \$M portfolio .{1,3}by Jan 1, 2031/.test(txt(list)), 'the long-game line keeps its figures exact and names the year');
  ok(/This week .{1,3}\d of 3 done/.test($('goalsEyebrow').textContent), 'the heading counts the week: ' + $('goalsEyebrow').textContent);
  ok(list.querySelector('.g-card .g-tap') && !list.querySelectorAll('.g-card')[1].querySelector('.g-tap'), 'the gym card can be counted by hand; the sleep card, counted by the ring, cannot');
  ok($('twyBody').compareDocumentPosition(list) & 2, 'the month’s sprint sits beneath the goals');
  ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(list.innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '')), 'no emoji or glyphs');
  w.showView('today');
  eq($('weekSlot').querySelectorAll('.row').length, 3, 'Today shows the week in three rows');
  ok(/Gym.*Lose 15 Pounds.*3 of 2/.test(txt($('weekSlot'))), 'each with its action, its goal and the count: ' + txt($('weekSlot')).slice(0, 90));

  // ---- a goal's sheet
  w.openGoal('a');
  const sheet = $('sheet');
  eq(sheet.querySelectorAll('.g-day').length, 7, 'a goal opens with the seven days of the week');
  eq([...sheet.querySelectorAll('.g-day')].map((b) => b.getAttribute('aria-pressed')).join(','), 'true,true,true,false,false,false,false', 'the counted days are marked');
  ok(sheet.querySelectorAll('.g-day[disabled]').length === 4, 'days still to come cannot be tapped');
  ok(/Your why/.test(txt(sheet)) && /Be healthy and have more energy/.test(txt(sheet)), 'his why is shown in his words');
  const plan = $('gPlan'); plan.value = 'If it is Tuesday at 6:30, then gym before work'; plan.onchange ? plan.onchange() : w.goalSetPlan('a', plan.value);
  w.goalSetPlan('a', plan.value);
  eq(by('a').plan, 'If it is Tuesday at 6:30, then gym before work', 'the plan is saved on the goal');
  w.closeSheet();

  // ---- three weekly goals at most
  w.editGoal(''); $('gName').value = 'Run'; $('gShape').value = 'weekly'; $('gAct').value = 'Run'; $('gN').value = '3'; w.saveGoal('');
  const run = G().find((x) => x.name === 'Run');
  eq([run.state, run.act.n, run.kind, run.shape], ['parked', 3, 'number', 'weekly'], 'a fourth weekly goal is saved parked');
  w.goalSetState(run.id, 'active');
  ok(/Three weekly goals at a time/.test(txt($('sheet'))) && run.state === 'parked', 'making it active asks which one to park');
  w.goalSwap('g2-date', run.id);
  eq([run.state, by('g2-date').state, g('goalsWeekly')().length], ['active', 'parked', 3], 'parking one lets it in, and there are still three');
  w.goalSetState('g2-date', 'done');
  eq(by('g2-date').state, 'done', 'a goal can be marked finished');
  w.showView('goals');
  ok(/Finished/.test(txt($('goalList'))) && /Date night/.test(txt($('goalList'))), 'and is listed under Finished');

  // ---- long game and lists
  w.logProgress('b'); $('gpv').value = '2.4'; w.saveProgress('b');
  eq([by('b').current, by('b').updates.length, by('b').mt > 1e12], [2.4, 2, true], 'the long-game number is updated and stamped');
  w.toggleMilestone('c', 'm1');
  ok(by('c').milestones[0].done && by('c').mt > 1e12, 'a list item is ticked and stamped');
  w.editGoal('b'); eq([$('gShape').value, $('gCur').value, $('gTgt').value, $('gUnit').value], ['long', '2.4', '6.25', '$M portfolio'], 'editing a long-game goal shows its numbers');
  $('gTgt').value = '7'; w.saveGoal('b');
  eq([by('b').target, by('b').shape, by('b').start, by('b').updates.length], [7, 'long', 2, 2], 'saving keeps its history');

  // ---- another device
  const remote = JSON.parse(JSON.stringify(g('DB'))); const ra = remote.goals.find((x) => x.id === 'a'); ra.act.days = ['2026-11-30', '2026-12-02', '2026-12-03']; ra.mt = w.Date.now() + 5000;
  w.mergeRemote(remote);
  eq(by('a').act.days, ['2026-11-30', '2026-12-02', '2026-12-03'], 'a later change made elsewhere wins when the copies merge');
  ok(!errors.length, 'no errors through the session (' + errors.join(' | ') + ')');
}

// ---------------------------------------------------------------- the journal as evidence (Thursday 3 December 2026)
{
  // the data as v11.3 saved it: weekly goals with no sentence saying what counts
  const seed = { settings: { goals2: 1, theme: 'light' }, tomb: {}, friends: [], events: [], checkins: {},
    stats: { '2026-12-01': { gym: 40 } },
    journal: [{ id: 'pg1', date: '2026-12-01', ts: 1, status: 'done', transcription: 'Dinner out with Annalise last night, just us.' }, { id: 'pg2', date: '2026-12-02', ts: 2, status: 'done', transcription: 'Gym before work, legs.' }],
    goals: [
      { id: 'a', name: 'Lose 15 Pounds', kind: 'number', shape: 'weekly', state: 'active', since: '2026-11-23', updates: [], mt: 5, act: { label: 'Gym', n: 2, src: 'gym', days: [], off: [] } },
      { id: 'g2-sleep', name: 'Seven hours of sleep', kind: 'number', shape: 'weekly', state: 'active', since: '2026-11-23', updates: [], mt: 5, act: { label: 'Nights', n: 5, src: 'sleep7', days: [], off: [] } },
      { id: 'g2-date', name: 'Date night', kind: 'number', shape: 'weekly', state: 'active', since: '2026-11-23', updates: [], mt: 5, act: { label: 'Date night', n: 1, src: 'tap', days: [], off: [] } }] };
  const { w, errors, g, $, saved } = boot('2026-12-03', seed);
  const by = (id) => g('DB').goals.find((x) => x.id === id), n = (id) => g('goalStatus')(by(id)).w.n;
  const txt = (el) => el.textContent.replace(/\s+/g, ' ');
  ok(/gym or did a strength workout/.test(by('a').act.what) && /Annalise/.test(by('g2-date').act.what) && saved().settings.goals2 === 2 && by('a').mt > 1e12, 'goals saved by v11.3 gain a sentence saying what counts, once');
  eq([by('a').act.days, by('a').since, by('g2-sleep').act.what], [[], '2026-11-23', undefined], 'and nothing else about them changes');
  eq([n('a'), n('g2-date')], [1, 0], 'before the journal is read: the ring’s one gym day, no date night');

  eq(w.goalEvSet([{ g: 'g2-date', d: '2026-11-30', q: 'Dinner out with Annalise last night, just us', p: 'pg1' }, { g: 'a', d: '2026-12-02', q: 'Gym before work, legs', p: 'pg2' },
    { g: 'a', d: '2026-12-01', q: 'Lifted with Sam', p: 'gone' }, { g: 'g2-sleep', d: '2026-12-02', q: 'Slept well', p: 'pg2' }, { g: 'a', d: 'soon', q: 'x' }]), true, 'the journal’s reading arrives');
  eq([n('g2-date'), g('goalStatus')(by('g2-date')).label], [1, 'Done this week'], 'date night is counted from the page, on the night it happened');
  eq(n('a'), 2, 'gym: the ring’s Tuesday and the journal’s Wednesday; a day both saw counts once');
  eq(n('g2-sleep'), 0, 'sleep stays with the ring, whatever a page says');
  eq([by('a').act.days, by('g2-date').act.days], [[], []], 'nothing is written into his own marks');
  eq(JSON.parse(w.localStorage.getItem('lifeos_gev')).length, 4, 'the reading is kept apart from the saved data, and a row without a date is dropped');
  ok(!('gev' in saved()) && !/Dinner out/.test(w.localStorage.getItem('lifeos_v1').replace(/"journal":\[[\s\S]*?\]/, '')), 'none of it is in the saved data');

  w.showView('goals');
  const cards = [...$('goalList').querySelectorAll('.g-card')], date = cards[2], gym = cards[0];
  ok(/Mon, Nov 30|Nov 30/.test(txt(date)) && /from your journal/.test(txt(date)), 'the date night card says where the count came from: ' + txt(date.querySelector('.g-ev')).slice(0, 60));
  eq(date.querySelector('.g-quote').textContent, '“Dinner out with Annalise last night, just us”', 'and shows his sentence');
  ok(/from your journal/.test(txt(gym.querySelector('.g-ev'))) && /Gym before work/.test(txt(gym)), 'the gym card shows its latest, from the journal');

  w.openGoal('g2-date');
  const sheet = $('sheet');
  eq(sheet.querySelectorAll('.g-evi').length, 1, 'the goal lists the sentences the journal gave');
  ok(/written Dec 1/.test(txt(sheet.querySelector('.g-evi'))) && /Not this/.test(txt(sheet.querySelector('.g-evi'))), 'with the day, the page it was written on, and a way to strike it');
  eq(sheet.querySelector('.g-day').getAttribute('aria-pressed'), 'true', 'Monday is marked in the week');
  w.goalStrike('g2-date', '2026-11-30');
  eq([n('g2-date'), by('g2-date').act.struck, by('g2-date').act.off, by('g2-date').mt > 1e12], [0, ['2026-11-30'], [], true], 'striking it uncounts the day and is saved on the goal');
  ok($('sheet').querySelector('.g-evi.out') && /Count it/.test(txt($('sheet').querySelector('.g-evi'))), 'the sentence stays, struck through');
  w.goalTap('g2-date', '2026-11-30', 1);
  eq([n('g2-date'), by('g2-date').act.days], [1, ['2026-11-30']], 'a struck day can still be counted by hand');
  w.goalTap('g2-date', '2026-11-30', 1); w.goalStrike('g2-date', '2026-11-30');
  eq([n('g2-date'), by('g2-date').act.struck, by('g2-date').act.days], [1, [], []], 'and the sentence can be put back');
  w.goalTap('g2-date', '2026-11-30', 1);
  eq([n('g2-date'), by('g2-date').act.off], [0, ['2026-11-30']], 'tapping the day in the week turns it off');
  ok($('sheet').querySelector('.g-evi.out'), 'which also shows the sentence as not counted');
  w.goalStrike('g2-date', '2026-11-30');
  eq([n('g2-date'), by('g2-date').act.off, by('g2-date').act.struck], [1, [], []], 'Count it brings it back');
  let opened = ''; const real = w.openEntry; w.openEntry = (id) => { opened = id; };
  $('sheet').querySelector('.g-evi .own').onclick(); eq(opened, 'pg1', 'tapping the sentence opens the page it came from');
  w.openGoal('a');
  ok(!$('sheet').querySelectorAll('.g-evi .own')[1].hasAttribute('onclick'), 'a page that is not on this phone yet is shown but cannot be opened');
  w.openEntry = real;

  // a tap on a day the journal also counted: one tap, off
  w.goalTap('a', '2026-12-02'); eq(n('a'), 1, 'a day the journal counted can be turned off by a tap');
  w.goalTap('a', '2026-12-02'); w.goalTap('a', '2026-12-03'); w.goalTap('a', '2026-12-03');
  eq([n('a'), by('a').act.days, by('a').act.off], [2, [], []], 'and back, leaving no marks behind');

  // editing keeps what he struck and the sentence saying what counts
  w.goalStrike('a', '2026-12-02');
  w.editGoal('a'); ok(/gym or did a strength workout/.test($('gWhat').value), 'Edit goal shows what counts');
  $('gWhat').value = 'I lifted weights'; w.saveGoal('a');
  eq([by('a').act.what, by('a').act.struck], ['I lifted weights', ['2026-12-02']], 'saving keeps the sentence and what he struck');
  w.openGoal('g2-sleep'); ok(!/From your journal/.test(txt($('sheet'))), 'the sleep goal has no journal section');

  // a page that left a doubt: shown, not counted, until he says
  w.goalEvSet([{ g: 'g2-date', d: '2026-12-02', q: 'Dinner at the new place', p: 'pg2', s: false }]);
  eq([n('g2-date'), g('goalMaybes')(by('g2-date')).length], [0, 1], 'a sentence the page leaves open is not counted');
  w.showView('goals');
  ok(/may show one more/.test(txt($('goalList').querySelectorAll('.g-card')[2])), 'the card says there is one to look at');
  w.openGoal('g2-date');
  ok(/Not counted: the page leaves it open/.test(txt($('sheet'))) && $('sheet').querySelectorAll('.g-evi .g-yn button').length === 2, 'the goal shows it with yes and no');
  w.goalMaybe('g2-date', '2026-12-02', 1);
  eq([n('g2-date'), by('g2-date').act.days, g('goalMaybes')(by('g2-date')).length], [1, ['2026-12-02'], 0], 'yes counts the day as his own mark');
  eq([...$('sheet').querySelectorAll('.g-evi .g-yn button')].map((b) => b.textContent), ['Not this'], 'and can be taken back');
  w.goalMaybe('g2-date', '2026-12-02', 0);
  eq([n('g2-date'), by('g2-date').act.days, by('g2-date').act.struck, g('goalMaybes')(by('g2-date')).length], [0, [], ['2026-12-02'], 0], 'no strikes it, and the card stops asking');
  ok($('sheet').querySelector('.g-evi.out') && !/may show one more/.test(txt($('goalList'))), 'it stays in the list, struck through');
  w.closeSheet();
  ok(!errors.length, 'no errors (' + errors.join(' | ') + ')');

  // the reading survives a restart, and is fetched from his account when he is signed in
  w.goalEvSet([{ g: 'g2-date', d: '2026-11-30', q: 'Dinner out with Annalise last night, just us', p: 'pg1', s: true }]);
  const again = boot('2026-12-03', saved(), { lifeos_gev: w.localStorage.getItem('lifeos_gev') });
  eq(again.g('goalStatus')(again.g('DB').goals.find((x) => x.id === 'g2-date')).w.n, 1, 'after a restart the count is still there');
  const asked = [];
  const live = boot('2026-12-03', seed, { lifeos_supa_cfg: { url: 'https://x.supabase.co', key: 'anon', session: { access_token: 'a', refresh_token: 'r', user: { id: 'u1', email: 'b@example.com' } } } },
    async (u) => { asked.push(String(u)); await new Promise((r) => setTimeout(r, 4)); return /rpc\/my_goal_evidence/.test(String(u))
      ? { ok: true, status: 200, json: async () => [{ g: 'g2-date', d: '2026-11-30', q: 'Dinner out with Annalise last night, just us', p: 'pg1' }], text: async () => '' }
      : { ok: false, status: 503, json: async () => ({}), text: async () => '' }; });
  live.w.showView('goals'); live.w.renderAll(); live.w.renderAll();
  setTimeout(() => {
    ok(asked.some((u) => /rpc\/my_goal_evidence/.test(u)), 'signed in, the app asks his account for the journal’s reading');
    ok(/from your journal/.test(live.$('goalList').textContent) && /Dinner out with Annalise/.test(live.$('goalList').textContent), 'and the card is redrawn with it');
    eq(asked.filter((u) => /rpc\/my_goal_evidence/.test(u)).length, 1, 'once, not on every redraw');
    ok(!live.errors.length, 'no errors (' + live.errors.join(' | ') + ')');
  }, 120);
}

// ---------------------------------------------------------------- weeks so far, spare weeks, behind
{
  const seed = { settings: { goals2: 1 }, stats: {}, journal: [], friends: [], events: [], checkins: {}, tomb: {},
    goals: [{ id: 'x', name: 'Gym', kind: 'number', shape: 'weekly', state: 'active', since: '2026-11-02', updates: [], act: { label: 'Gym', n: 2, src: 'tap', off: [],
      days: ['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-18', '2026-12-01'] } }] };
  const { g, errors } = boot('2026-12-04', seed);       // a Friday
  const x = g('DB').goals[0];
  const H = g('goalHistory')(x, 6).map((w) => w.ws.slice(5) + ':' + w.k);
  eq(H, ['10-26:none', '11-02:hit', '11-09:spare', '11-16:short', '11-23:short', '11-30:now'], 'weeks: hit, then one short week covered by the month’s spare, then short weeks; nothing before the goal began');
  eq(g('goalStatus')(x).label, 'On pace', 'Friday with one to go and three days left: on pace');
  x.act.n = 5;
  eq(g('goalStatus')(x).label, 'Spare week', 'one more than can still be done, with December’s spare unused: a spare week');
  x.act.n = 7;
  eq([g('goalStatus')(x).label, g('goalStatus')(x).k], ['3 behind', 'watch'], 'further behind than that says so');
  ok(!errors.length, 'no errors (' + errors.join(' | ') + ')');
}

// ---------------------------------------------------------------- sleep on a night the ring has already reported
{
  const seed = { settings: { goals2: 1 }, journal: [], friends: [], events: [], checkins: {}, tomb: {},
    stats: { '2026-12-03': { sleep: 7.5 }, '2026-12-04': { sleep: 7.1 }, '2026-12-05': { sleep: 5.9 } },
    goals: [{ id: 's', name: 'Sleep', kind: 'number', shape: 'weekly', state: 'active', since: '2026-11-30', updates: [], act: { label: 'Nights', n: 4, src: 'sleep7', days: [], off: [] } }] };
  const { g } = boot('2026-12-05', seed);                // Saturday: two nights counted, last night was short, only Sunday is left
  const s = g('goalStatus')(g('DB').goals[0]);
  eq([s.w.n, s.label], [2, 'Spare week'], 'a short night already reported cannot still count: two needed, one night left');
}

// ---------------------------------------------------------------- anyone else's goals: nothing invented, nothing hidden
{
  const seed = { settings: {}, stats: {}, journal: [], friends: [], events: [], checkins: {}, tomb: {},
    goals: [{ id: 'g1', name: 'Read 20 books', kind: 'number', current: 12, target: 20, unit: 'books', why: 'To think better', createdTs: 1, updates: [], lastProgressTs: 1 }] };
  const { w, g, $, errors } = boot('2026-11-15', seed);
  eq(g('DB').goals.map((x) => [x.id, x.shape, x.state]), [['g1', 'long', 'active']], 'a goal from before becomes a long-game goal and no goals are added');
  w.showView('goals');
  ok(/No weekly goal is in play/.test($('goalList').textContent) && /Read 20 books/.test($('goalList').textContent), 'Goals says no weekly goal is in play and still shows it');
  w.showView('today');
  eq($('weekSlot').innerHTML, '', 'Today shows no week strip');
  const empty = boot('2026-11-15', { settings: {}, goals: [] }); empty.w.showView('goals');
  ok(/No goals yet/.test(empty.$('goalList').textContent), 'with no goals at all, Goals says so');
  ok(!errors.length && !empty.errors.length, 'no errors');
}
setTimeout(() => { console.log(fail ? fail + ' FAILED' : 'all passed'); process.exit(fail ? 1 : 0); }, 400);   // after the late checks above
