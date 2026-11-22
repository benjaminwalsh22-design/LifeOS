#!/usr/bin/env python3
"""Contrast check for the design tokens: every text and signal colour against the
surfaces it sits on, in both themes. Exits non-zero on a miss."""
import re, sys, pathlib
css = (pathlib.Path(__file__).parent.parent.parent / 'tools' / 'next' / 'ds.css').read_text()
def block(sel):
    i = css.index(sel + ' {'); j = css.index('\n}', i); return css[i:j]
def toks(b): return dict(re.findall(r'(--[a-z0-9-]+):\s*([^;]+);', b))
base = toks(block(':root'))
dark = {**base, **toks(block(':root[data-theme="dark"]'))}
themes = {'light': base, 'dark': dark}
def rgb(v, T, under=None):
    v = v.strip()
    m = re.fullmatch(r'var\((--[a-z0-9-]+)\)', v)
    if m: return rgb(T[m.group(1)], T, under)
    if v.startswith('#'): return tuple(int(v[i:i+2], 16) for i in (1, 3, 5))
    m = re.match(r'rgba\((\d+),(\d+),(\d+),([\d.]+)\)', v)
    r, g, b, a = int(m[1]), int(m[2]), int(m[3]), float(m[4]); u = under or rgb(T['--bg'], T)
    return tuple(round(c*a + uc*(1-a)) for c, uc in zip((r, g, b), u))
def lum(c):
    f = lambda x: (x/255/12.92) if x/255 <= 0.03928 else ((x/255+0.055)/1.055)**2.4
    r, g, b = map(f, c); return .2126*r + .7152*g + .0722*b
def cr(a, b): la, lb = sorted([lum(a), lum(b)], reverse=True); return (la+.05)/(lb+.05)
text = ['--ink', '--ink-2', '--ink-muted']
pairs = [(t, s, 4.5) for t in text for s in ('--bg', '--surface', '--surface-raised', '--surface-sunken')]
pairs += [('--accent', '--bg', 4.5), ('--accent', '--surface', 4.5), ('--accent-ink', '--accent-fill', 4.5), ('--accent', '--surface-sunken', 4.5), ('--bg', '--ink', 4.5),
          ('--good', '--bg', 4.5), ('--watch', '--bg', 4.5), ('--serious', '--bg', 4.5), ('--good', '--surface', 4.5), ('--watch', '--surface', 4.5), ('--serious', '--surface', 4.5),
          ('--ink', '--ai-wash', 4.5), ('--ai-ink', '--ai-wash', 4.5), ('--ai-ink', '--bg', 4.5),
          ('--good', '--good-soft', 4.5), ('--watch', '--watch-soft', 4.5), ('--serious', '--serious-soft', 4.5), ('--accent', '--accent-soft', 4.5)]
pairs += [('--avatar-ink', f'--c{i}', 3) for i in range(1, 7)] + [(f'--c{i}', '--bg', 3) for i in range(1, 7)]
bad = 0
for name, T in themes.items():
    for fg, bgk, need in pairs:
        bg = rgb(T[bgk], T); r = cr(rgb(T[fg], T, bg), bg)
        if r < need: bad += 1; print(f'{name:8} {fg:14} on {bgk:18} {r:.2f} < {need}')
print(f'{len(pairs)*len(themes)} pairs checked, {bad} failing')
sys.exit(1 if bad else 0)
