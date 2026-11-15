#!/usr/bin/env python3
"""Builds next.html (the redesign preview) from index.html (the live app).

The live file stays untouched until cut-over. Each phase adds to the pieces in
this folder; this script swaps the old markup-building functions for the new
ones and appends the design-system stylesheet. Nothing here touches storage,
sync, prompts or scoring: every replaced function keeps its data logic.

    python3 tools/next/build.py
"""
import re, sys, pathlib

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent.parent
src = (ROOT / 'index.html').read_text()
VERSION = 'v11.0 preview 1'

def piece(name):
    return (HERE / name).read_text().rstrip('\n') + '\n'

def swap(a, b, count=1):
    """Replace an exact string, insisting it appears exactly `count` times."""
    global src
    n = src.count(a)
    if n != count:
        sys.exit(f'build: expected {count} of {a[:70]!r}, found {n}')
    src = src.replace(a, b)

def swap_range(start, until, new):
    """Replace from the line that starts with `start` up to (not including)
    the line that starts with `until`."""
    global src
    i = src.find('\n' + start)
    if i < 0 or src.count('\n' + start) != 1:
        sys.exit(f'build: start marker not unique: {start!r}')
    j = src.find('\n' + until, i + 1)
    if j < 0:
        sys.exit(f'build: end marker not found after {start!r}: {until!r}')
    src = src[:i + 1] + new + src[j + 1:]

# ---------------------------------------------------------------- head
swap('<title>Life OS</title>', '<title>LifeOS</title>')
swap('<meta name="apple-mobile-web-app-title" content="Life OS">', '<meta name="apple-mobile-web-app-title" content="LifeOS">')
swap('<meta name="theme-color" id="metaTheme" content="#33527B">',
     '<meta name="theme-color" id="metaTheme" content="#F5F2EB">\n'
     '<script>/* theme and direction before first paint, so the wrong one never flashes */\n'
     '(function(){try{var d=document.documentElement,t=localStorage.getItem("lifeos_theme"),r=localStorage.getItem("lifeos_dir");'
     'if(t)d.setAttribute("data-theme",t);if(r)d.setAttribute("data-dir",r);'
     'var m=document.getElementById("metaTheme");if(m&&t==="dark")m.setAttribute("content",r==="b"?"#0B0C0E":"#131210");else if(m&&r==="b")m.setAttribute("content","#F1F2F4");}catch(e){}})();</script>')
swap('</style>\n</head>', '</style>\n<style id="ds">\n' + piece('ds.css') + '</style>\n</head>')

# ---------------------------------------------------------------- chrome
swap('<div class="app">', '<div class="app" data-large="1">')
ASK_IC = '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20.5 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.3-4.4A7.5 7.5 0 1 1 20.5 12Z"/></svg>'
swap_range('  <header class="topbar">', '  <div class="ptr" id="ptr">',
     '  <header class="topbar">\n'
     '    <div class="tb-left"></div>\n'
     '    <h1 id="topTitle">Today</h1>\n'
     '    <div class="tb-right">\n'
     '      <button class="tb-btn tb-ask" onclick="showView(\'ask\')" aria-label="Ask Ben">' + ASK_IC + '<span>Ask Ben</span></button>\n'
     '      <button class="tb-btn me topgear" id="topGear" onclick="showView(\'settings\')" aria-label="Settings">B</button>\n'
     '    </div>\n'
     '  </header>\n')
swap_range('    <section class="view active" id="view-today">', '    <!-- ============ INSIGHTS ============ -->',
     '    <section class="view active" id="view-today">\n'
     '      <header class="lt">\n'
     '        <div class="lt-eyebrow" id="topDate"></div>\n'
     '        <h1 class="lt-title" id="greetHi">Hello</h1>\n'
     '      </header>\n'
     '      <div id="briefCard"></div>\n'
     '      <div id="seasonSlot"></div>\n'
     '      <section class="sec">\n'
     '        <div class="sec-h"><h2>Noticed</h2><button class="link" id="noticedMore" onclick="toggleNoticed()" hidden></button></div>\n'
     '        <div class="sec-body" id="attnList"></div>\n'
     '      </section>\n'
     '      <section class="sec">\n'
     '        <div class="sec-h"><h2>Schedule</h2><button class="link" onclick="showView(\'schedule\')">Week</button></div>\n'
     '        <div class="sec-body" id="todaySched"></div>\n'
     '      </section>\n'
     '      <div id="todayDigest"></div>\n'
     '      <div id="macroCard"></div>\n'
     '      <input type="file" id="mealInput" accept="image/*" capture="environment" hidden>\n'
     '      <div id="onThisDay"></div>\n'
     '      <div id="todayMore"></div>\n'
     '    </section>\n\n')
swap('    <!-- ============ STUDY (Quest for Knowledge, under Goals) ============ -->',
     '    <!-- ============ STYLE GUIDE (redesign preview) ============ -->\n'
     '    <section class="view" id="view-styleguide"><div class="backrow" onclick="showView(\'settings\')">&lsaquo; Settings</div><div id="guideBody"></div></section>\n'
     '    <!-- ============ STUDY (Quest for Knowledge, under Goals) ============ -->')
swap('      <span>Friends</span></button>', '      <span>People</span></button>')
swap('<div style="font-size:13px;color:var(--muted)">LifeOS <b id="appVer">v10.5</b></div>',
     '<div style="font-size:13px;color:var(--muted)">LifeOS <b id="appVer">' + VERSION + '</b></div>\n'
     '        <button class="btn secondary" style="margin-top:10px" onclick="showView(\'styleguide\')">Style guide</button>')

# ---------------------------------------------------------------- behaviour of the chrome
swap_range('function openSheet(html){', '// ---------- navigation ----------', piece('sheet.js') + '\n')
swap("goals:'Goals', study:'Quest for Knowledge', review:'Weekly Review', settings:'Settings' };",
     "goals:'Goals', study:'Quest for Knowledge', review:'Weekly Review', settings:'Settings', styleguide:'Style guide' };")
swap("const VIEWS = { today:'Today', friends:'Friends',", "const VIEWS = { today:'Today', friends:'People',")
swap("goals:'goals', study:'goals', settings:'today',", "goals:'goals', study:'goals', settings:'today', styleguide:'today',")
swap("  $('topTitle').textContent = VIEWS[v] || '';\n",
     "  $('topTitle').textContent = VIEWS[v] || '';\n"
     "  const app = document.querySelector('.app'); app.setAttribute('data-large', v === 'today' || v === 'styleguide' ? '1' : '0'); app.classList.remove('scrolled');\n"
     "  if (v === 'styleguide') renderStyleGuide();\n")
swap_range('function applyTheme(){', 'function initSettings(){', piece('theme.js'))

# ---------------------------------------------------------------- Today
swap('let _briefGen=false;', 'let _briefGen=false, _briefFail=0;   // _briefFail: when the last attempt at today\'s line failed')
swap('  }catch(e){}\n  _briefGen=false;\n}\nfunction regenBrief(){ DB.briefLine=null; save(); ensureBriefLine(); toast(\'Refreshing…\'); }',
     '  }catch(e){}\n  _briefGen=false;\n'
     '  // no line came back: stop holding space for it and show the day\'s quotation instead\n'
     '  if(!(DB.briefLine && DB.briefLine.date===today())){ _briefFail=Date.now(); const b=$(\'briefCard\'); if(b) b.innerHTML=briefHTML(); }\n'
     '}\nfunction regenBrief(){ DB.briefLine=null; _briefFail=0; save(); renderToday(); toast(\'Writing another\'); }')
swap_range('function briefHTML(){', '// ---------- the joined view', '\n\n')
swap_range('function renderInsights(){', 'const QUOTES=[', '')
swap_range('function renderToday(){', 'function editTile(key){', piece('today.js'))
swap_range('function memThisMonthHTML(){', "// when Claude hasn't weighed in yet", piece('otd.js'))
swap_range('function otdCard(j, yr, why){', '// ---- the look-back', piece('otd2.js'))
swap_range('function renderMacros(){', 'function twyWeekOf(dstr){', piece('macros.js'))
swap('// ---------- push notifications ----------', piece('guide.js') + '// ---------- push notifications ----------')

(ROOT / 'next.html').write_text(src)
print('next.html written:', len(src), 'bytes,', src.count('\n'), 'lines')
