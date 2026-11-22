// The pen importer, run against a pretend OneDrive, a pretend database and real PDFs.
// It checks what matters: a page becomes one entry, once; a page written on again
// replaces its entry and keeps his note; a deleted entry stays deleted; nothing is
// written to the journal while the importer is on hold.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PDFDocument, rgb } from 'pdf-lib';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '../../supabase/functions/pen-tick/index.ts'), 'utf8');
fs.mkdirSync(path.join(here, '.build'), { recursive: true });
fs.writeFileSync(path.join(here, '.build/stub.mjs'), 'export const createClient = () => globalThis.__admin;\n');
fs.writeFileSync(path.join(here, '.build/pen.ts'), src
  .replace('"npm:@supabase/supabase-js@2"', '"./stub.mjs"')
  .replace('"npm:mupdf@1.28.6"', '"mupdf"') + '\nexport { workFile, release, reconcile, tick, discover };\n');

// ---- pretend platform
const ENV = { CRON_SECRET: 's3', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'k', MS_CLIENT_ID: 'a', MS_CLIENT_SECRET: 'b' };
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { globalThis.__handler = h; } };

// ---- pretend database
const UID = '11111111-2222-3333-4444-555555555555';
const T = { ms_auth: [{ user_id: UID, access_token: 'tok', expires_at: Date.now() + 3.6e6, refresh_token: 'r' }],
  pen_state: [], pen_files: [], pen_pages: [] };
const PAYLOAD = { journal: [{ id: 'old1', date: '2026-01-01', status: 'done', transcription: 'an older entry' }], tomb: {} };
const KEYS = { pen_state: ['user_id'], pen_files: ['user_id', 'file_id'], pen_pages: ['user_id', 'file_id', 'sig'] };
class Q {
  constructor(t) { this.t = t; this.f = []; this.op = 'select'; }
  select(_c, o) { if (this.op === 'select') this.o = o; return this; }
  insert(row) { this.op = 'insert'; this.row = row; return this; }
  update(p) { this.op = 'update'; this.p = p; return this; }
  upsert(row, o) { this.op = 'upsert'; this.row = row; this.o = o; return this; }
  eq(k, v) { this.f.push((r) => r[k] === v); return this; }
  gte(k, v) { this.f.push((r) => r[k] >= v); return this; }
  match(m) { for (const k in m) this.eq(k, m[k]); return this; }
  order() { return this; }
  limit(n) { this.n = n; return this; }
  maybeSingle() { this.one = true; return this; }
  run() {
    const rows = T[this.t];
    if (this.op === 'insert') {
      const defaults = this.t === 'pen_pages' ? { revs: 0, readds: 0, prev_entry: null, entry_id: null, changed_at: new Date().toISOString() } : {};
      const row = { ...defaults, ...this.row };
      if (rows.some((r) => KEYS[this.t].every((k) => r[k] === row[k]))) throw new Error('duplicate key in ' + this.t);
      rows.push(row); return { data: null, error: null };
    }
    if (this.op === 'upsert') {
      const i = rows.findIndex((r) => KEYS[this.t].every((k) => r[k] === this.row[k]));
      if (i >= 0) Object.assign(rows[i], this.row); else rows.push({ ...this.row });
      return { data: null, error: null };
    }
    const hit = rows.filter((r) => this.f.every((fn) => fn(r)));
    if (this.op === 'update') { hit.forEach((r) => Object.assign(r, this.p)); return { data: null, error: null }; }
    if (this.o && this.o.head) return { count: hit.length, data: null };
    const out = hit.map((r) => ({ ...r })).slice(0, this.n || 1e9);
    return this.one ? { data: out[0] || null } : { data: out, error: null };
  }
  then(a, b) { try { a(this.run()); } catch (e) { b ? b(e) : a({ data: null, error: e }); } }
}
let paceCalls = [];
globalThis.__admin = {
  from: (t) => new Q(t),
  rpc: async (name, args) => {
    if (name === 'pen_pace') { paceCalls.push(args.fast); return { data: 'ok' }; }
    if (name === 'pen_missing') {
      const out = {}; for (const id of args.ids) if (!PAYLOAD.journal.some((j) => j.id === id)) out[id] = PAYLOAD.tomb[id] ? 'deleted' : 'lost';
      return { data: out };
    }
    if (name === 'pen_apply') {      // the same rules as the SQL function (which is checked against Postgres separately)
      const res = {};
      for (const it of args.items) {
        const e = { ...it.entry }, old = it.replaces;
        if (PAYLOAD.tomb[e.id]) { res[e.id] = 'deleted'; continue; }
        if (PAYLOAD.journal.some((j) => j.id === e.id)) { res[e.id] = 'exists'; continue; }
        let was = null;
        if (old) {
          if (PAYLOAD.tomb[old]) { res[e.id] = 'deleted'; continue; }
          was = PAYLOAD.journal.find((j) => j.id === old) || null;
          if (was) { if (was.note) e.note = was.note; PAYLOAD.journal = PAYLOAD.journal.filter((j) => j.id !== old); PAYLOAD.tomb[old] = Date.now(); }
        }
        PAYLOAD.journal.push(e); res[e.id] = was ? 'replaced' : 'added';
      }
      return { data: res };
    }
    throw new Error('unexpected rpc ' + name);
  },
};

// ---- pretend OneDrive and storage
const DRIVE = { folders: {}, files: {} };     // folders: id -> {name, kids:[ids]}; files: id -> {name, bytes, cTag, modified, mime}
const STORE = new Map();
let downloads = 0;
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const meta = (id) => { const f = DRIVE.files[id]; return { id, name: f.name, size: f.bytes.length, cTag: f.cTag, lastModifiedDateTime: f.modified, file: { mimeType: f.mime } }; };
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith('https://db.test/storage/v1/object/journal-photos/')) {
    const key = decodeURIComponent(url.split('/journal-photos/')[1]);
    if (opts.method === 'POST') { STORE.set(key, opts.body); return json({}); }
    if (opts.method === 'DELETE') { STORE.delete(key); return json({}); }
    return STORE.has(key) ? new Response(STORE.get(key), { headers: { 'content-type': 'image/jpeg' } }) : json({}, 404);
  }
  const u = url.replace('https://graph.microsoft.com/v1.0', '');
  let m;
  if ((m = u.match(/^\/me\/drive\/root:\/([^?]+)\?/))) {
    const name = decodeURIComponent(m[1]); const id = Object.keys(DRIVE.folders).find((k) => DRIVE.folders[k].name === name && DRIVE.folders[k].root);
    return id ? json({ id, name, folder: {} }) : json({ error: { message: 'not found' } }, 404);
  }
  if (u.startsWith('/me/drive/root/search')) {
    // like the real search, this also returns a document that only mentions the word inside
    const v = [];
    for (const id in DRIVE.folders) if (/moleskine/i.test(DRIVE.folders[id].name)) v.push({ id, name: DRIVE.folders[id].name, folder: {}, parentReference: { path: '/drive/root:' } });
    for (const id in DRIVE.files) if (/moleskine/i.test(DRIVE.files[id].name) || DRIVE.files[id].mentions) v.push({ ...meta(id), parentReference: { path: '/drive/root:/Documents' } });
    return json({ value: v });
  }
  if ((m = u.match(/^\/me\/drive\/items\/([^/?]+)\/children/))) {
    const f = DRIVE.folders[m[1]]; if (!f) return json({ error: { message: 'gone' } }, 404);
    return json({ value: f.kids.map((id) => (DRIVE.folders[id] ? { id, name: DRIVE.folders[id].name, folder: {} } : meta(id))) });
  }
  if ((m = u.match(/^\/me\/drive\/items\/([^/?]+)\/content/))) { downloads++; return new Response(DRIVE.files[m[1]].bytes); }
  if ((m = u.match(/^\/me\/drive\/items\/([^/?]+)\?/))) return DRIVE.files[m[1]] ? json(meta(m[1])) : json({ error: { message: 'gone' } }, 404);
  throw new Error('unexpected request ' + url);
};

// ---- real PDFs: each page is a list of "lines of handwriting"
async function notebook(pages) {
  const doc = await PDFDocument.create();
  for (const lines of pages) {
    const page = doc.addPage([420, 595]);
    for (let y = 60; y < 560; y += 24) page.drawLine({ start: { x: 30, y }, end: { x: 390, y }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) });   // ruled paper
    lines.forEach((seed, i) => {
      let d = `M 40 ${-(540 - i * 24)}`;
      for (let x = 40; x < 380; x += 5) d += ` L ${x} ${-(540 - i * 24) + Math.sin(x * 0.31 + seed) * 5 + Math.cos(x * 0.07 * seed) * 3}`;
      page.drawSvgPath(d, { x: 0, y: 0, borderColor: rgb(0.1, 0.1, 0.25), borderWidth: 1 });
    });
  }
  return doc.save();
}
const lines = (from, n) => Array.from({ length: n }, (_, i) => from + i);

let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) passed++; else { failed++; console.log('  FAIL  ' + what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), what + '  (got ' + JSON.stringify(a) + ', wanted ' + JSON.stringify(b) + ')');

const pen = await import(pathToFileURL(path.join(here, '.build/pen.ts')).href);
const mupdf = await import('mupdf');
const call = async (body) => (await globalThis.__handler(new Request('https://f.test/pen-tick', { method: 'POST',
  headers: { 'content-type': 'application/json', 'x-cron-secret': 's3' }, body: JSON.stringify(body || {}) }))).json();
const pages = (state) => T.pen_pages.filter((r) => !state || r.state === state);
const penEntries = () => PAYLOAD.journal.filter((j) => j.src === 'pen');

// ================================================================ signatures
{
  const A = [lines(1, 12), lines(20, 9), lines(40, 5), []];
  const a1 = await notebook(A), a2 = await notebook(A);
  const s1 = await pen.pageSigs(mupdf.Document.openDocument(a1, 'application/pdf'));
  const s2 = await pen.pageSigs(mupdf.Document.openDocument(a2, 'application/pdf'));
  eq(s1, s2, 'the same notebook backed up twice gives the same page signatures');
  eq(new Set(s1).size, 4, 'four different pages give four different signatures');
  const B = [lines(1, 12), lines(20, 9), lines(40, 8), [], lines(70, 3)];
  const s3 = await pen.pageSigs(mupdf.Document.openDocument(await notebook(B), 'application/pdf'));
  eq([s3[0] === s1[0], s3[1] === s1[1], s3[2] === s1[2], s3[3] === s1[3]], [true, true, false, true], 'only the page that was written on again changes');
  const d0 = pen.drawPage(mupdf.Document.openDocument(a1, 'application/pdf'), 0), d3 = pen.drawPage(mupdf.Document.openDocument(a1, 'application/pdf'), 3);
  ok(d0.w === 1000 && d0.jpg[0] === 0xff && d0.jpg[1] === 0xd8, 'a page is drawn as a 1000-pixel-wide JPEG');
  ok(d0.ink > 0.004, 'a written page has ink (' + d0.ink.toFixed(4) + ')');
  ok(d3.ink < 0.0006, 'ruled paper with nothing on it counts as empty (' + d3.ink.toFixed(5) + ')');
}

// ================================================================ nothing to find yet
{
  DRIVE.files.client = { name: 'Engagement letter.pdf', bytes: await notebook([lines(5, 4)]), cTag: 'c1', modified: ago(600), mime: 'application/pdf', mentions: true };
  const r = await call({});
  eq(r.out[0].watching, 0, 'with no pen folder in the drive, nothing is watched');
  eq(T.pen_pages.length, 0, 'and a document that merely mentions the word is not touched');
  eq(downloads, 0, 'and nothing is downloaded');
  eq(T.pen_state[0].live, false, 'the importer starts on hold');
}

// ================================================================ hold: found, drawn, kept back
const V1 = [lines(1, 12), lines(20, 9), lines(40, 5), lines(60, 10), lines(80, 7), []];
{
  DRIVE.folders.mol = { name: 'Moleskine Notebooks', kids: ['nb'] };
  DRIVE.files.nb = { name: 'Journal.pdf', bytes: await notebook(V1), cTag: 'v1', modified: ago(45), mime: 'application/pdf' };
  const r = await call({});
  eq(r.out[0].watching, 1, 'the Moleskine folder is found by its name');
  eq([pages('held').length, pages('blank').length], [5, 1], 'five written pages are held, the empty one is only noted');
  eq(penEntries().length, 0, 'on hold, the journal is not touched');
  eq(STORE.size, 5, 'a picture is stored for each held page');
  const before = downloads; await call({});
  eq(downloads, before, 'an unchanged file is not downloaded again');
  const peek = await globalThis.__handler(new Request('https://f.test/pen-tick', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cron-secret': 's3' }, body: JSON.stringify({ peek: pages('held')[0].entry_id }) }));
  eq(peek.headers.get('content-type'), 'image/jpeg', 'a held page can be looked at');
  const no = await globalThis.__handler(new Request('https://f.test/pen-tick', { method: 'POST', body: '{}' }));
  eq(no.status, 401, 'without the scheduler secret the worker answers nothing');
}

// ================================================================ live: held pages become entries
{
  await call({ set: { live: true } });
  const r = await call({});
  eq(r.out[0].release.added, 5, 'going live adds the five held pages');
  const es = penEntries();
  eq(es.length, 5, 'five pen entries in the journal');
  ok(es.every((e) => e.status === 'queued' && e.psync === true && e.transcription === '' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.mt > 0 && STORE.has(UID + '/' + e.id + '.jpg')),
    'each is queued for transcription, dated, and has its picture where the phone looks for it');
  ok(PAYLOAD.journal.some((j) => j.id === 'old1'), 'entries that were already there are untouched');
  await call({}); await call({});
  eq(penEntries().length, 5, 'running again adds nothing twice');
}

// ================================================================ a page written on again, an empty page filled, a new page
{
  const p2 = pages().find((r) => r.page === 2), oldId = p2.entry_id;
  PAYLOAD.journal.find((j) => j.id === oldId).note = 'his own note';
  Object.assign(PAYLOAD.journal.find((j) => j.id === oldId), { status: 'done', transcription: 'first half of the page' });
  const V2 = [V1[0], V1[1], lines(40, 11), V1[3], V1[4], lines(100, 6), lines(120, 4)];
  Object.assign(DRIVE.files.nb, { bytes: await notebook(V2), cTag: 'v2', modified: ago(30) });
  const r = await call({});
  eq([r.out[0].fresh, r.out[0].edits], [1, 2], 'one new page, two pages changed (one of them was empty before)');
  eq(penEntries().length, 7, 'seven pen entries now');
  ok(!PAYLOAD.journal.some((j) => j.id === oldId) && PAYLOAD.tomb[oldId] > 0, 'the earlier entry for the rewritten page is replaced and tombstoned');
  const neu = PAYLOAD.journal.find((j) => j.id === pages().find((x) => x.page === 2).entry_id);
  ok(neu && neu.note === 'his own note' && neu.status === 'queued', 'its replacement keeps his note and is queued to be read again');
  ok(!STORE.has(UID + '/' + oldId + '.jpg'), 'the old picture is removed');
  eq(pages('imported').length, 7, 'all seven pages are marked imported');
  eq(pages('blank').length, 0, 'the once-empty page is no longer marked empty');
}

// ================================================================ still being written
{
  const V3 = [lines(1, 12), V1[1], lines(40, 11), V1[3], V1[4], lines(100, 6), lines(120, 9)];
  Object.assign(DRIVE.files.nb, { bytes: await notebook(V3), cTag: 'v3', modified: ago(4) });
  const before = downloads, r = await call({});
  eq([r.out[0].settling, downloads - before], [1, 0], 'a file changed four minutes ago is left alone for now');
  DRIVE.files.nb.modified = ago(25);
  await call({});
  eq(penEntries().length, 7, 'once it settles, the continued page replaces its entry and the count stays at seven');
}

// ================================================================ he deletes an entry
{
  const row = pages().find((r) => r.page === 4), id = row.entry_id;
  PAYLOAD.journal = PAYLOAD.journal.filter((j) => j.id !== id); PAYLOAD.tomb[id] = Date.now();
  await call({});
  eq(pages().find((r) => r.page === 4).state, 'deleted', 'a deleted entry is noticed');
  const V4 = [lines(1, 12), V1[1], lines(40, 11), V1[3], lines(80, 12), lines(100, 6), lines(120, 9)];
  Object.assign(DRIVE.files.nb, { bytes: await notebook(V4), cTag: 'v4', modified: ago(30) });
  await call({});
  eq(penEntries().length, 6, 'and it does not come back, even when that page is written on again');
}

// ================================================================ a page the phone dropped
{
  const row = pages('imported').find((r) => r.page === 3), id = row.entry_id;
  PAYLOAD.journal = PAYLOAD.journal.filter((j) => j.id !== id);          // gone, but not deleted by him
  const r = await call({});
  eq(r.out[0].reconcile.back, 1, 'a page that went missing without being deleted is noticed');
  ok(PAYLOAD.journal.some((j) => j.id === id), 'and is put back');
}

// ================================================================ a page inserted earlier in the book
{
  const V4 = [lines(1, 12), V1[1], lines(40, 11), V1[3], lines(80, 12), lines(100, 6), lines(120, 9)];
  const V5 = [V4[0], lines(200, 6), ...V4.slice(1)];
  Object.assign(DRIVE.files.nb, { bytes: await notebook(V5), cTag: 'v5', modified: ago(30) });
  const n = penEntries().length, r = await call({});
  eq([r.out[0].fresh, r.out[0].edits, penEntries().length - n], [1, 0, 1], 'only the inserted page is new; the pages that moved along are recognised');
}

// ================================================================ pictures saved by hand, and a second notebook
{
  const one = mupdf.Document.openDocument(await notebook([lines(300, 8)]), 'application/pdf');
  DRIVE.folders.home = { name: 'LifeOS Journal', root: true, kids: ['pic', 'sub'] };
  DRIVE.folders.sub = { name: 'November', kids: ['nb2'] };
  DRIVE.files.pic = { name: 'page.jpg', bytes: pen.drawPage(one, 0).jpg, cTag: 'p1', modified: ago(90), mime: 'image/jpeg' };
  DRIVE.files.nb2 = { name: 'Second.pdf', bytes: await notebook([lines(400, 5), lines(420, 5)]), cTag: 's1', modified: ago(90), mime: 'application/pdf' };
  T.pen_state[0].looked_at = ago(7 * 60);
  const n = penEntries().length; await call({});
  eq(penEntries().length - n, 3, 'a picture and a second notebook dropped into "LifeOS Journal" (and its subfolder) are imported too');
}

// ================================================================ a big first import is paced, and a flood waits
{
  const big = Array.from({ length: 70 }, (_, i) => lines(1000 + i * 30, 6));
  DRIVE.folders.home.kids.push('big');
  DRIVE.files.big = { name: 'Old notebook.pdf', bytes: await notebook(big), cTag: 'b1', modified: ago(90), mime: 'application/pdf' };
  const n = penEntries().length;
  let r = await call({}), runs = 1;
  ok(r.out[0].pending === true && paceCalls.at(-1) === true, 'a long notebook is drawn a few pages at a time, and the job speeds up while pages wait');
  while (r.out[0].pending && runs < 40) { r = await call({}); runs++; }
  eq(pages().filter((x) => x.file_id === 'big').length, 70, 'all seventy pages are drawn over ' + runs + ' runs');
  eq(penEntries().length - n, 0, 'but seventy pages at once are not put in the journal without a look');
  eq(paceCalls.at(-1), false, 'and the job drops back to its normal pace');
  ok((await call({})).out[0].release.flood.includes('big'), 'the run says which notebook is waiting');
  await call({ approve: 'big' });
  for (let i = 0; i < 4; i++) await call({});
  eq(penEntries().length - n, 70, 'once approved, they are added (twenty-five a run)');
}

// ================================================================ the entries are what the app expects
{
  const e = penEntries()[0];
  eq(Object.keys(e).sort(), ['archived', 'date', 'id', 'imgHash', 'insight', 'mood', 'mt', 'note', 'psync', 'src', 'status', 'summary', 'themes', 'transcription', 'ts'].sort(),
    'a pen entry has the same fields as a page scanned in the app, plus src and psync');
  const ids = PAYLOAD.journal.map((j) => j.id);
  eq(ids.length, new Set(ids).size, 'no entry id appears twice');
  const st = await call({ status: true });
  ok(st.live === true && st.counts.imported > 0 && st.files.length === 4, 'the status report describes what is watched and done');
}

console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `pen importer: ${passed} checks passed`);
process.exit(failed ? 1 : 0);
