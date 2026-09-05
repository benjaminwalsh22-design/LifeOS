"""Rewrite Notion urls to LifeOS entry ids and emit SQL that loads every index
file into coach_index.

    python3 tools/load_index.py <index folder> <out.sql>

The folder holds wisdom_index.json, future_ben.json, voice_pool.json,
years/distilled_YYYY.json, HOW_IT_WAS_BUILT.md and notion_map.json — the last is
    select replace(page_id, '-', '') as pid, entry_id from public.notion_synced
saved as a JSON array. Apply the SQL as the service role (psql, or the Supabase
management API). The index files themselves must never be committed: this repo
is served publicly by GitHub Pages."""
import json, re, glob, os, sys
folder, out = sys.argv[1], sys.argv[2]
os.chdir(folder)
MAP = {r['pid']: r['entry_id'] for r in json.load(open('notion_map.json'))}
NOTION = re.compile(r'https?://(?:app|www)\.notion\.(?:com|so)/(?:[^/]*?)?([0-9a-f]{32})')

stats = {'rewritten': 0, 'unmapped': 0}
def walk(x):
    if isinstance(x, dict):
        out = {}
        for k, v in x.items():
            if k == 'url' and isinstance(v, str):
                m = NOTION.search(v)
                if m and m.group(1) in MAP:
                    out['entry_id'] = MAP[m.group(1)]; stats['rewritten'] += 1
                    continue                      # the url itself is dropped
                stats['unmapped'] += 1
                out['entry_id'] = None
                continue
            out[k] = walk(v)
        return out
    if isinstance(x, list): return [walk(i) for i in x]
    return x

# prefer the relinked copies (tools/relink_quotes.py) when they exist
pick = lambda n: n + '.linked.json' if os.path.exists(n + '.linked.json') else n + '.json'
files = {
  'wisdom_index': pick('wisdom_index'),
  'future_ben':   pick('future_ben'),
  'voice_pool':   pick('voice_pool'),
}
for y in glob.glob('years/distilled_*.json'):
    files['years/' + re.search(r'(\d{4})', y).group(1)] = y
docs = {k: walk(json.load(open(p))) for k, p in files.items()}
docs['how_built'] = {'markdown': open('HOW_IT_WAS_BUILT.md').read()}
print('links rewritten:', stats['rewritten'], '| unmapped:', stats['unmapped'])

# one statement per key, body passed as a dollar-quoted literal
def esc(s): return s.replace('$$', '$ $')
sql = []
for k, body in docs.items():
    j = json.dumps(body, ensure_ascii=False)
    sql.append("insert into public.coach_index (key, body, updated_at) values ('%s', $j$%s$j$::jsonb, now()) "
               "on conflict (key) do update set body = excluded.body, updated_at = now();" % (k, j.replace('$j$','$ j$')))
open(out,'w').write('\n'.join(sql))
print('keys:', ', '.join(sorted(docs)))
print('sql written to', out)
