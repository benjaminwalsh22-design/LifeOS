"""Point every quote in the index at the entry whose transcript contains it.

    python3 tools/relink_quotes.py <index folder> <entries.json>

entries.json is [{id, d, t}] — id, date, transcription — exported from
journal_entries. The index builder linked quotes by date, which goes wrong on
days with two entries, and never linked the per-year voice samples at all.
Rewrites the *.linked.json files and years/*.json in place; prints what moved.
"""
import json, re, glob, sys, os, collections
folder, entries = sys.argv[1], sys.argv[2]
rows = json.load(open(entries))
def norm(s):
    s = s.lower().replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
    s = re.sub(r'[^a-z0-9 ]+', ' ', s); return re.sub(r'\s+', ' ', s).strip()
T = {r['id']: norm(r['t']) for r in rows}
bydate = collections.defaultdict(list)
for r in rows: bydate[r['d']].append(r['id'])
def key(q): return re.sub(r'\s*\.\.\.$', '', norm(q).rstrip('. '))[:70]
def find(q, date):
    k = key(q)
    if len(k) < 20: return []
    same = [i for i in bydate.get(date, []) if k in T[i]]
    return same or [i for i in T if k in T[i]]
stats = collections.Counter(); moved = []
def walk(x, path):
    if isinstance(x, dict):
        if isinstance(x.get('quote'), str):
            stats['quotes'] += 1
            eid = x.get('entry_id'); c = find(x['quote'], x.get('date'))
            if eid and eid in T and key(x['quote']) in T[eid]: stats['ok'] += 1
            elif c:
                if eid != c[0]: moved.append((path, eid, c[0])); x['entry_id'] = c[0]
                stats['relinked'] += 1
            else: stats['unfound'] += 1; print('NOT FOUND', path, x['quote'][:70])
        for k, v in x.items(): walk(v, path + '/' + k)
    elif isinstance(x, list):
        for i, v in enumerate(x): walk(v, path + f'[{i}]')
os.chdir(folder)
files = ['wisdom_index.linked.json', 'future_ben.linked.json', 'voice_pool.linked.json'] + sorted(glob.glob('years/distilled_*.json'))
for p in files:
    doc = json.load(open(p)); walk(doc, p); json.dump(doc, open(p, 'w'), indent=1, ensure_ascii=False)
print(dict(stats)); print('moved:', len(moved))
