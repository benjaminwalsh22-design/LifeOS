// The part of goal-tick that decides what to trust from the model's reading of a page.
// Run: node tests/goal/sift.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(here, '.build'), { recursive: true });
fs.writeFileSync(path.join(here, '.build/stub.mjs'), 'export const createClient = () => ({});\n');
fs.writeFileSync(path.join(here, '.build/goal-tick.ts'), fs.readFileSync(path.join(here, '../../supabase/functions/goal-tick/index.ts'), 'utf8').replace('"npm:@supabase/supabase-js@2"', '"./stub.mjs"'));
globalThis.Deno = { env: { get: () => '' }, serve: () => {} };
const { sift, actionsOf, flat, settle } = await import(pathToFileURL(path.join(here, '.build/goal-tick.ts')).href);
let fail = 0, pass = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.log('FAIL ' + m + '\n   got    ' + JSON.stringify(a) + '\n   wanted ' + JSON.stringify(b)); } };

const goals = [
  { id: 'gym', name: 'Lose 15 Pounds', shape: 'weekly', state: 'active', act: { label: 'Gym', n: 2, src: 'gym', what: 'Went to the gym' } },
  { id: 'date', name: 'Date night', shape: 'weekly', act: { label: 'Date night', n: 1, src: 'tap' } },
  { id: 'sleep', name: 'Sleep', shape: 'weekly', state: 'active', act: { label: 'Nights', n: 5, src: 'sleep7' } },
  { id: 'parked', name: 'Run', shape: 'weekly', state: 'parked', act: { label: 'Run', n: 3, src: 'tap' } },
  { id: 'long', name: 'Retire at 40', shape: 'long', state: 'active' }];
const actions = actionsOf(goals);
eq(actions.map((a) => a.id), ['gym', 'date'], 'only weekly goals in play are read for, and not the ones the ring counts');
eq(actions[0].what, 'Went to the gym (his goal: "Lose 15 Pounds")', 'his own description of what counts is used');
eq(actions[1].what, 'Date night (his goal: "Date night")', 'without one, the action’s name is');

const pages = [
  { id: 'p1', date: '2026-12-03', transcription: 'Up at six. Gym before work, legs.  Felt strong!\nDinner with Annalise last night, just us.' },
  { id: 'p2', date: '2026-12-05', transcription: 'I do need to get to the gym. Took the kids to the park.' }];
const today = '2026-12-05';
const run = (found) => sift(found, actions, pages, today).map((f) => [f.goal_id, f.day, f.sure, f.entry_id, f.quote]);

eq(run([{ page: 'p1', action: 'gym', date: '2026-12-03', quote: 'Gym before work, legs. Felt strong', sure: true }]),
  [['gym', '2026-12-03', true, 'p1', 'Gym before work, legs. Felt strong']], 'a finding with its sentence on the page is kept');
eq(run([{ page: 'p1', action: 'gym', date: '2026-12-03', quote: 'gym   before work LEGS', sure: true }]).length, 1, 'spacing, case and punctuation do not matter');
eq(run([{ page: 'p1', action: 'date', date: '2026-12-02', quote: 'Dinner with Annalise last night, just us', sure: true }])[0].slice(0, 2), ['date', '2026-12-02'], 'a page may place it on the day before');
eq(run([{ page: 'p1', action: 'gym', date: '2026-12-03', quote: 'Lifted heavy at the gym this morning', sure: true }]), [], 'a quotation that is not on the page is thrown away');
eq(run([{ page: 'p1', action: 'gym', date: '2026-12-03', quote: '', sure: true }]), [], 'so is a finding with no quotation');
eq(run([{ page: 'p1', action: 'gym', date: '2026-11-20', quote: 'Gym before work', sure: true }]), [], 'a day long before the page is refused');
eq(run([{ page: 'p1', action: 'gym', date: '2026-12-04', quote: 'Gym before work', sure: true }]), [], 'a day after the page was written is refused');
eq(run([{ page: 'p2', action: 'gym', date: '2026-12-06', quote: 'I do need to get to the gym', sure: true }]), [], 'a day in the future is refused');
eq(run([{ page: 'p9', action: 'gym', date: '2026-12-03', quote: 'Gym before work', sure: true }, { page: 'p1', action: 'sleep', date: '2026-12-03', quote: 'Up at six', sure: true }, { page: 'p1', action: 'gym', date: 'yesterday', quote: 'Gym before work', sure: true }]), [],
  'an unknown page, an action that is not being looked for, and a date that is not a date are refused');
eq(run([{ page: 'p2', action: 'gym', date: '2026-12-05', quote: 'I do need to get to the gym', sure: false }])[0].slice(0, 3), ['gym', '2026-12-05', false], 'an ambiguous finding is kept, marked unsure');
eq(run([{ page: 'p1', action: 'gym', date: '2026-12-03', quote: 'Felt strong', sure: false }, { page: 'p1', action: 'gym', date: '2026-12-03', quote: 'Gym before work', sure: true }]),
  [['gym', '2026-12-03', true, 'p1', 'Gym before work']], 'one finding per action per day, the sure one first');
eq(flat('  Gym — before\nwork! '), 'gym before work', 'flattening keeps only the words');

// ---- what gets written when pages are read (or read again)
const f = (goal_id, day, entry_id, sure = true) => ({ goal_id, day, entry_id, sure, quote: 'q' });
const plan = (kept, had, ids) => { const r = settle(kept, had, ids); return [r.put.map((x) => x.goal_id + ' ' + x.day + ' ' + x.entry_id), r.drop.map((x) => x.goal_id + ' ' + x.day)]; };
eq(plan([f('gym', '2026-12-03', 'p1')], [], ['p1']), [['gym 2026-12-03 p1'], []], 'a new finding is written');
eq(plan([], [f('gym', '2026-12-03', 'p1')], ['p1']), [[], ['gym 2026-12-03']], 'a page read again that no longer says it: the finding is dropped');
eq(plan([], [f('gym', '2026-12-03', 'p7')], ['p1']), [[], []], 'findings from pages not being read are left alone');
eq(plan([f('gym', '2026-12-02', 'p1')], [f('gym', '2026-12-03', 'p1')], ['p1']), [['gym 2026-12-02 p1'], ['gym 2026-12-03']], 'a page that now places it on another day moves it');
eq(plan([f('gym', '2026-12-03', 'p1', false)], [f('gym', '2026-12-03', 'p1', true)], ['p1']), [['gym 2026-12-03 p1'], []], 'the same page, now unsure, replaces its own earlier reading');
eq(plan([f('gym', '2026-12-03', 'p2', false)], [f('gym', '2026-12-03', 'p1', true)], ['p2']), [[], []], 'an unsure finding never replaces a sure one from another page');
eq(plan([f('gym', '2026-12-03', 'p2', true)], [f('gym', '2026-12-03', 'p1', false)], ['p2']), [['gym 2026-12-03 p2'], []], 'a sure one does replace an unsure one');
eq(plan([f('gym', '2026-12-03', 'p2', true)], [f('gym', '2026-12-03', 'p1', true)], ['p2']), [[], []], 'between two sure findings for the same day, the first stays');
console.log(fail ? `${fail} FAILED, ${pass} passed` : `goal evidence: ${pass} checks passed`);
process.exit(fail ? 1 : 0);
