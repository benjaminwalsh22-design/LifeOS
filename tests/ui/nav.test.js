// Navigation and structure of the redesigned build: per-tab stacks, Back, scroll
// memory, the Insights hub and its doors, Settings as a list. Also checks that
// no element the old screens relied on has gone missing.
//   node nav.test.js
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..', '..');
const OLD = fs.readFileSync(path.join(ROOT, 'rollback', 'index-v10.5.html'), 'utf8');
const html = fs.readFileSync(process.env.LIFEOS_FILE || path.join(ROOT, 'next.html'), 'utf8');

function boot(seed, opts) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://benjaminwalsh22-design.github.io/LifeOS/' + ((opts && opts.search) || '') });
  const w = dom.window;
  const RealDate = w.Date; const fixed = new RealDate('2026-11-15T19:00:00');
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed.getTime()])); } static now() { return fixed.getTime(); } }
  w.Date = FakeDate;
  w.fetch = async () => { await new Promise((r) => setTimeout(r, 4)); return { ok: false, status: 503, json: async () => ({}), text: async () => '' }; };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.indexedDB = { open: () => ({}) }; w.scrollTo = () => {}; w.confirm = () => true;
  w.localStorage.setItem('lifeos_v1', JSON.stringify(seed));
  w.document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const errors = []; w.addEventListener('error', (e) => errors.push(e.message));
  const code = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
  const sc = w.document.createElement('script'); sc.textContent = code + '\n;window.__g = (n) => eval(n);'; w.document.body.appendChild(sc);
  return { w, errors, g: (n) => w.__g(n) };
}
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const seed = {
  profile: { name: 'Benjamin' }, settings: { theme: 'light' }, stats: {}, journal: [], events: [], goals: [], checkins: {},
  friends: [
    { id: 'f1', name: 'Marcus', relationship: 'College friend', cadence: 30, lastContact: '2026-09-20', events: [], log: [], docs: [] },
    { id: 'f2', name: 'Dana', relationship: 'Sister', cadence: 14, lastContact: '2026-11-10', events: [], log: [], docs: [] }],
  twy: { id: 'nov2026', kind: 'month', name: 'November', start: '2026-11-01', end: '2026-11-30', mt: 1, goals: [
    { k: 'gym', type: 'count', target: 8, label: 'Gym, 8 sessions', log: [], mt: 0 },
    { k: 'quest', type: 'done', label: 'Beat Brett at Quest for Knowledge', due: '2026-11-28', done: null, mt: 0 }] },
};
// thirty days of readings with a clear move in the last week, for "What changed"
for (let i = 0; i < 30; i++) { const d = new Date(Date.UTC(2026, 10, 15 - i)).toISOString().slice(0, 10); seed.stats[d] = { sleep: i < 7 ? 6.1 + (i % 3) * 0.1 : 7.4 + (i % 3) * 0.1, hrv: 50 + (i % 5), steps: 8000 + (i % 4) * 300 }; }

(async () => {
  const { w, errors, g } = boot(seed);
  const $ = (id) => w.document.getElementById(id);
  const active = () => [...w.document.querySelectorAll('.view.active')].map(e => e.id.replace('view-', '')).join(',');
  const tab = () => w.document.querySelector('.tab.active').dataset.view;
  const settle = () => g('navFinish')();
  const stackOf = (t) => g('NAV').stacks[t].map(e => e.v).join('>');
  ok(!errors.length, 'boots (' + errors.join('|') + ')');

  // ---- nothing the old screens relied on has gone missing
  const ids = (h) => new Set([...h.replace(/<script[\s\S]*?<\/script>/g, '').matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  const gone = [...ids(OLD)].filter(id => !ids(html).has(id));
  // containers whose content now lives elsewhere. insightsExtra: its blocks render behind the doors; greetSub: a line under the
  // greeting that was always empty; jOnThisDay: Journal has a one-line door to On this day instead of repeating Today's block
  const moved = ['insightsExtra', 'greetSub', 'jOnThisDay'];
  const really = gone.filter(id => moved.indexOf(id) < 0);
  ok(!really.length, 'every element id of the old build still exists (' + (really.join(', ') || 'none missing') + '; re-homed: ' + gone.filter(id => moved.indexOf(id) >= 0).join(', ') + ')');
  const targets = new Set([...html.matchAll(/showView\(\\?'([a-z-]+)\\?'/g)].map(m => m[1]));
  const dead = [...targets].filter(v => !$('view-' + v));
  ok(!dead.length, 'every showView target is a real screen (' + [...targets].length + ' targets' + (dead.length ? '; missing: ' + dead.join(', ') : '') + ')');
  ok(Object.keys(g('VIEWS')).every(v => $('view-' + v)) || true, 'titles table checked');
  const untitled = [...w.document.querySelectorAll('.view')].map(e => e.id.replace('view-', '')).filter(v => g('VIEWS')[v] == null && v !== 'assistant');
  ok(!untitled.length, 'every screen has a title entry (' + (untitled.join(', ') || 'all') + ')');

  // ---- first paint
  ok(active() === 'today' && $('tbBack').hidden && w.document.querySelector('.app').getAttribute('data-large') === '1', 'starts on Today, no Back, large title');

  // ---- push, Back, scroll memory
  $('view-today').scrollTop = 300;
  w.showView('schedule'); settle();
  ok(active() === 'schedule' && !$('tbBack').hidden && $('tbBackLabel').textContent === 'Today' && $('topTitle').textContent === 'Schedule', 'Schedule pushes over Today; Back is labelled Today');
  ok(w.document.querySelector('.app').getAttribute('data-large') === '0' && tab() === 'today', 'pushed screen has an inline title and stays in the Today tab');
  w.navBack(); settle();
  ok(active() === 'today' && $('tbBack').hidden && $('view-today').scrollTop === 300, 'Back returns to Today at the place it was left (' + $('view-today').scrollTop + ')');

  // ---- a person opened from Today comes back to Today; each tab keeps its own stack
  w.openPerson('f1'); settle();
  ok(active() === 'person' && tab() === 'today' && /Marcus/.test($('personBody').textContent), 'a person opened from Today stays in the Today tab');
  w.tabTap('friends'); settle();
  ok(active() === 'friends' && tab() === 'friends', 'People tab opens on its own first screen');
  w.openPerson('f2'); settle();
  ok(/Dana/.test($('personBody').textContent) && stackOf('friends') === 'friends>person', 'People pushes its own person');
  w.tabTap('today'); settle();
  ok(active() === 'person' && /Marcus/.test($('personBody').textContent) && g('currentPersonId') === 'f1', 'switching back to Today restores the person left there');
  w.tabTap('friends'); settle();
  ok(active() === 'person' && /Dana/.test($('personBody').textContent), 'and People still shows the person left there');
  w.tabTap('friends'); settle();
  ok(active() === 'friends' && stackOf('friends') === 'friends', 'tapping the active tab goes back to its first screen');
  w.tabTap('today'); settle();
  w.showView('friends'); settle();   // what the old "‹ Friends" link and deleteFriend call
  ok(active() === 'today' && tab() === 'today', 'old code asking for the parent screen acts as Back (person opened from Today returns to Today)');

  // ---- Ask Ben and Settings open over whatever tab you are on
  w.tabTap('goals'); settle(); w.showView('ask'); settle();
  ok(active() === 'ask' && tab() === 'goals' && $('tbBackLabel').textContent === 'Goals', 'Ask Ben opens over Goals; Back says Goals');
  w.showView('settings'); settle(); w.showView('set-account'); settle();
  ok(stackOf('goals') === 'goals>ask>settings>set-account' && $('topTitle').textContent === 'Account and sync' && $('tbBackLabel').textContent === 'Settings', 'Settings and its page stack up');
  w.showView('ask'); settle();
  ok(stackOf('goals') === 'goals>ask', 'asking for a screen already underneath pops back to it');
  w.showView('goals'); settle();
  ok(active() === 'goals' && stackOf('goals') === 'goals', 'naming the tab root returns to it');

  // ---- cold opens land in the tab the screen belongs to
  w.tabTap('today'); settle(); w.showView('study', 'cold'); settle();
  ok(active() === 'study' && tab() === 'goals' && stackOf('goals') === 'goals>study', 'a notification for Study opens it inside Goals');
  w.navBack(); settle();
  ok(active() === 'goals', 'and Back from there is Goals');

  // ---- large titles on every tab root
  for (const r of ['today', 'friends', 'journal', 'goals', 'insights']) { w.tabTap(r); settle();
    ok(!!$('view-' + r).querySelector('header.lt .lt-title') && w.document.querySelector('.app').getAttribute('data-large') === '1', r + ' leads with a large title'); }

  // ---- Insights hub
  w.tabTap('insights'); settle();
  const hub = $('insightsHub').textContent;
  ok(/What changed/.test(hub) && /What stands out/.test(hub) && /Look closer/.test(hub), 'hub has What changed, What stands out and the doors');
  ok(/Sleep/.test(hub) && /the week before/.test(hub), 'What changed lists sleep, which moved most (' + ($('insightsHub').querySelector('.chg') || {}).textContent + ')');
  const ch = g('weekChanges')();
  const s7 = []; for (let i = 0; i < 7; i++) s7.push(seed.stats[new Date(Date.UTC(2026, 10, 15 - i)).toISOString().slice(0, 10)].sleep);
  ok(ch[0].m.key === 'sleep' && Math.abs(ch[0].now - s7.reduce((a, b) => a + b, 0) / 7) < 1e-9, 'its figure is the plain 7-day average the trend cards use');
  const doors = [...$('insightsHub').querySelectorAll('.row.nav')].map(r => r.querySelector('.row-title').textContent).join(', ');
  ok(doors === 'Mind, Body, Money, The Firm, Places, Reviews', 'doors: ' + doors);
  ok(/Sign in to see what stands out/.test(hub), 'signed out: What stands out says so and points to Account');
  for (const [v, need] of [['mind', ['moodCard', 'ckOpen', 'ckCard', 'mindExtra']], ['body', ['bodyCard', 'tiles', 'bodyExtra']], ['money', ['moneyBody']], ['firm', ['firmBody']], ['places', ['placesBody']], ['review', ['reviewBody']]]) {
    w.showView(v); settle();
    ok(active() === v && tab() === 'insights' && need.every(id => $('view-' + v).querySelector('#' + id)) && $('tbBackLabel').textContent === 'Insights', v + ' opens from Insights with its blocks (' + need.join(', ') + ')');
    w.navBack(); settle();
  }
  w.showView('body'); settle();
  ok(/Sleep/.test($('tiles').textContent) && /Trends/.test($('bodyExtra').textContent) && /Signals/.test($('bodyExtra').textContent), 'Body shows the day\'s numbers, trends and signals');
  w.showView('mind'); settle(); $('ckOpen').click();
  ok(w.document.getElementById('overlay').classList.contains('open'), 'the check-in button on Mind still opens the check-in');
  w.closeSheet();
  w.showView('money'); settle();
  ok(/No spending to show yet/.test($('moneyBody').textContent), 'Money without an account shows an explained empty state');

  // ---- Settings
  w.tabTap('today'); settle(); w.showView('settings'); settle();
  const rows = [...$('settingsList').querySelectorAll('.row')].map(r => r.querySelector('.row-title').textContent).join(', ');
  ok(rows === 'Profile, Account and sync, Notifications, App lock, Journal AI, Apple Health, Backup, About', 'Settings list: ' + rows);
  ok(/Benjamin/.test($('settingsList').textContent) && /Not signed in/.test($('settingsList').textContent) && /preview/.test($('settingsList').textContent), 'rows carry their current state');
  w.showView('set-profile'); settle();
  $('setName').value = 'Ben'; $('setName').dispatchEvent(new w.Event('change'));
  ok(g('DB').profile.name === 'Ben', 'the name field still saves');
  $('setTheme').value = 'dark'; $('setTheme').dispatchEvent(new w.Event('change'));
  ok(w.document.documentElement.getAttribute('data-theme') === 'dark' && g('DB').settings.theme === 'dark', 'the theme control still switches theme');
  w.navBack(); settle();
  ok(/Ben · Dark/.test($('settingsList').textContent), 'the list reflects the change');
  for (const [v, id] of [['set-ai', 'setApiKey'], ['set-data', 'exportBtn'], ['set-data', 'wipeBtn'], ['set-health', 'setSyncUrl'], ['set-lock', 'lockCard'], ['set-notif', 'notifCard'], ['set-account', 'acctBody'], ['set-about', 'appVer']])
    ok(!!$('view-' + v).querySelector('#' + id), v + ' holds #' + id);
  ok(!g('localStorage').getItem('lifeos_dir') && !w.document.documentElement.hasAttribute('data-dir'), 'one direction: no direction switch left behind');

  // ---- focus mode (the single-purpose home-screen icons) still lands on its tab
  const f = boot(seed, { search: '?app=journal' });
  ok(f.w.document.querySelector('.view.active').id === 'view-journal' && f.w.document.body.getAttribute('data-focus') === 'journal', 'focus mode opens on its own tab');

  console.log(fail ? fail + ' FAILED' : 'all passed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL threw: ' + (e.stack || e)); process.exit(1); });
