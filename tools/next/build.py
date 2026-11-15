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
VERSION = 'v11.0 preview 3'

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
     '<meta name="theme-color" id="metaTheme" content="#F1F2F4">\n'
     '<script>/* theme and direction before first paint, so the wrong one never flashes */\n'
     '(function(){try{var d=document.documentElement,t=localStorage.getItem("lifeos_theme");'
     'if(t)d.setAttribute("data-theme",t);'
     'var m=document.getElementById("metaTheme");if(m&&t==="dark")m.setAttribute("content","#0B0C0E");}catch(e){}})();</script>')
swap('</style>\n</head>', '</style>\n<style id="ds">\n' + piece('ds.css') + '</style>\n</head>')

# ---------------------------------------------------------------- chrome
swap('<div class="app">', '<div class="app" data-large="1" data-view="today">')
BACK_IC = '<svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 5.5 8.5 12l6.5 6.5"/></svg>'
ASK_IC = '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20.5 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.3-4.4A7.5 7.5 0 1 1 20.5 12Z"/></svg>'
swap_range('  <header class="topbar">', '  <div class="ptr" id="ptr">',
     '  <header class="topbar">\n'
     '    <div class="tb-left"><button class="tb-back" id="tbBack" onclick="navBack()" aria-label="Back" hidden>' + BACK_IC + '<span id="tbBackLabel">Back</span></button></div>\n'
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
     '    <section class="view" id="view-styleguide"><div id="guideBody"></div></section>\n'
     '    <!-- ============ STUDY (Quest for Knowledge, under Goals) ============ -->')
swap('      <span>Friends</span></button>', '      <span>People</span></button>')
swap("""<div class="syncbanner" id="syncBanner" hidden onclick="showView('settings')">""", """<div class="syncbanner" id="syncBanner" hidden onclick="showView('set-account')">""")

# ---------------------------------------------------------------- structure: Insights hub and doors, large titles, Settings pages
swap_range('    <section class="view" id="view-insights">', '    <!-- ============ SCHEDULE ============ -->',
     '    <section class="view" id="view-insights">\n'
     '      <header class="lt"><h1 class="lt-title">Insights</h1></header>\n'
     '      <div id="insightsHub"></div>\n'
     '    </section>\n'
     '    <!-- behind the Insights doors: the blocks of the old single page, regrouped -->\n'
     '    <section class="view" id="view-mind">\n'
     '      <div id="moodCard"></div>\n'
     '      <section class="sec"><div class="sec-h"><h2>Today’s check-in</h2><button class="link" id="ckOpen">Check in</button></div><div id="ckCard"></div></section>\n'
     '      <div id="mindExtra"></div>\n'
     '    </section>\n'
     '    <section class="view" id="view-body">\n'
     '      <section class="sec"><div class="sec-h"><h2>Today’s numbers</h2><span class="meta">tap for the trend</span></div><div class="sec-body" id="tiles"></div></section>\n'
     '      <div id="bodyExtra"></div>\n'
     '      <div id="bodyCard"></div>\n'
     '    </section>\n'
     '    <section class="view" id="view-money"><div id="moneyBody"></div></section>\n'
     '    <section class="view" id="view-firm"><div id="firmBody"></div></section>\n\n')
swap('    <section class="view" id="view-friends">\n', '    <section class="view" id="view-friends">\n      <header class="lt"><h1 class="lt-title">People</h1></header>\n')
swap('    <section class="view" id="view-journal">\n', '    <section class="view" id="view-journal">\n      <header class="lt"><h1 class="lt-title">Journal</h1></header>\n')
swap('    <section class="view" id="view-goals">\n', '    <section class="view" id="view-goals">\n      <header class="lt"><h1 class="lt-title">Goals</h1></header>\n')
swap_range('    <section class="view" id="view-settings">', '    <!-- ============ HEALTH (under Life) ============ -->',
     '    <section class="view" id="view-settings">\n'
     '      <header class="lt"><h1 class="lt-title">Settings</h1></header>\n'
     '      <div id="settingsList"></div>\n'
     '    </section>\n'
     '    <!-- each Settings row opens one of these; the controls and their ids are the old ones -->\n'
     '    <section class="view" id="view-set-profile">\n'
     '      <div class="card">\n'
     '        <div class="field"><label>Your name</label><input id="setName" placeholder="Benjamin"></div>\n'
     '        <div class="field"><label>Theme</label>\n'
     '          <select id="setTheme"><option value="light">Light</option><option value="dark">Dark</option></select>\n'
     '        </div>\n'
     '      </div>\n'
     '    </section>\n'
     '    <section class="view" id="view-set-ai">\n'
     '      <div class="card">\n'
     '        <div class="field"><label>Anthropic API key (for journal AI analysis)</label>\n'
     '          <input id="setApiKey" type="password" placeholder="sk-ant-...">\n'
     '        </div>\n'
     '        <div class="notice">With a key, journal photos are transcribed, summarized and analyzed by Claude, directly from your phone to the Anthropic API — no other server involved. Get a key at <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>. Leave blank to just store photos.</div>\n'
     '      </div>\n'
     '    </section>\n'
     '    <section class="view" id="view-set-data">\n'
     '      <div class="card">\n'
     '        <button class="btn secondary" id="exportBtn">Export data backup (JSON)</button>\n'
     '        <button class="btn secondary" id="importBtn" style="margin-top:10px">Import backup</button>\n'
     '        <input type="file" id="importInput" accept="application/json" hidden>\n'
     '        <div class="notice">Everything lives on this device. Export occasionally to keep a backup — it includes journal photos.</div>\n'
     '        <button class="btn danger" id="wipeBtn">Erase all data</button>\n'
     '      </div>\n'
     '    </section>\n'
     '    <section class="view" id="view-set-health">\n'
     '      <div class="card">\n'
     '        <div style="font-size:15px;font-weight:650;margin-bottom:6px">Apple Health</div>\n'
     '        <div class="notice" style="margin-top:0">Apple doesn’t let a web app read Health directly. Two ways in: a <b>Shortcut</b> that opens LifeOS with your numbers, or <b>live sync</b> — point the app at a private URL your Shortcut posts to, and it pulls the latest on its own.</div>\n'
     '        <div class="field" style="margin-top:12px"><label>Live sync URL (optional)</label><input id="setSyncUrl" type="url" placeholder="https://…/health?key=…"></div>\n'
     '        <button class="btn secondary" id="syncNowBtn">Sync now</button>\n'
     '        <div class="notice" id="syncStatus"></div>\n'
     '        <button class="btn secondary" style="margin-top:6px" onclick="testHealthSync()">Test with sample data</button>\n'
     '        <div class="notice">Ask Claude for the Shortcut recipe (opens-the-app) or the live-sync relay setup.</div>\n'
     '      </div>\n'
     '    </section>\n'
     '    <section class="view" id="view-set-lock"><div class="card" id="lockCard"></div></section>\n'
     '    <section class="view" id="view-set-notif"><div class="card" id="notifCard"></div></section>\n'
     '    <section class="view" id="view-set-account">\n'
     '      <div class="card">\n'
     '        <div style="font-size:15px;font-weight:650;margin-bottom:6px">Account &amp; Sync</div>\n'
     '        <div id="acctBody"></div>\n'
     '      </div>\n'
     '    </section>\n'
     '    <section class="view" id="view-set-about">\n'
     '      <div class="card" style="text-align:center">\n'
     '        <div style="font-size:13px;color:var(--muted)">LifeOS <b id="appVer">' + VERSION + '</b></div>\n'
     '        <button class="btn secondary" style="margin-top:10px" onclick="checkUpdate()">Check for updates</button>\n'
     '        <div class="notice">Fetches the newest version from your site and reloads. Your data is untouched — it lives on this phone, not in the app files.</div>\n'
     '        <button class="btn secondary" style="margin-top:10px" onclick="showView(\'styleguide\')">Style guide</button>\n'
     '      </div>\n'
     '    </section>\n\n')
# ---------------------------------------------------------------- behaviour of the chrome
swap_range('function openSheet(html){', '// ---------- navigation ----------', piece('sheet.js') + '\n')
swap_range('// ---------- navigation ----------', '// ---------- friends logic ----------', piece('nav.js'))
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
# ---------------------------------------------------------------- Goals and the study hub
swap('      <div class="section-head" style="margin-top:22px"><h2>Life goals</h2><button class="action" id="goalAdd">+ Add</button></div>\n      <div id="goalList"></div>\n',
     '      <section class="sec"><div class="sec-h"><h2>Life goals</h2><button class="link" id="goalAdd">Add</button></div><div id="goalList"></div></section>\n')
swap_range('function renderSprint(el){', 'function renderGoals(){ renderTWY();', '')
swap_range('function renderGoals(){ renderTWY();', 'function openGoal(id){', piece('goals.js'))
swap_range('// ---- plan ----', 'function studyGrade(ok){', '')
swap_range('function studyTestHTML(){', 'function studyPick(i){', '')
swap_range('function studyTestResultHTML(){', '// ---- visual drills ----', '')
swap_range('function studyVisualHTML(){', 'function studyVisPick(i){', '')
swap_range('function lifeSVG(item){', 'function studyVisMake(kind){', '')
swap_range('// ---- listening ----', '// ---------- push notifications ----------', '')
swap_range('function studyHeadHTML(){', 'function studyGrade(ok){', piece('study.js'))
swap("""    svg:'<div id="studyPhoto" style="width:100%;max-width:300px;aspect-ratio:1;margin:0 auto;border-radius:12px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px;overflow:hidden">loading…</div>',""",
     """    svg:'<div id="studyPhoto" class="study-photo"><span class="spinner"></span></div>',""")
swap("""    box.innerHTML = '<img src="' + esc(url) + '" alt="" style="width:100%;height:100%;object-fit:cover">';""", """    box.innerHTML = '<img src="' + esc(url) + '" alt="">';""")
swap("""box.textContent = 'No photo available offline — tap Next'; }""", """box.textContent = 'No photo available offline. Tap Next.'; }""")

swap('// ---------- push notifications ----------', piece('guide.js') + piece('settings.js') + '// ---------- push notifications ----------')

# ---------------------------------------------------------------- Insights hub
swap_range('function renderMood(){', 'function moodHover(ms){', '')
swap_range('function renderBody(){', 'const QUOTES=[', '')
swap_range('function tilesHTML(st, day){', "// ---- Annalise's cycle", '')
swap_range('function cycleTileHTML(){', 'function openCycleSheet(){', '')
swap_range('function renderCheckin(){', 'const slider = (k, label, v) =>', '')
swap_range('function openTrend(key, range){', 'function trendHover(pts, m){', '')
swap_range('function renderInsightsView(){', '// ---------- account sync (Supabase) ----------', piece('hub.js') + piece('doors.js'))

# ---------------------------------------------------------------- Journal and Entry
SEARCH_IC = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path stroke-linecap="round" d="m16 16 4.5 4.5"/></svg>'
CAMERA_IC = '<svg fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6.8 7h-1A2.8 2.8 0 0 0 3 9.8v7.4A2.8 2.8 0 0 0 5.8 20h12.4a2.8 2.8 0 0 0 2.8-2.8V9.8A2.8 2.8 0 0 0 18.2 7h-1l-1.2-2.1A1.8 1.8 0 0 0 14.4 4H9.6a1.8 1.8 0 0 0-1.6.9L6.8 7Z"/><circle cx="12" cy="13" r="3.4"/></svg>'
swap_range('    <section class="view" id="view-journal">', '    <!-- ============ ASK BEN ============ -->',
     '    <section class="view" id="view-journal">\n'
     '      <header class="lt"><h1 class="lt-title">Journal</h1></header>\n'
     '      <input type="file" id="photoInput" accept="image/*" capture="environment" hidden>\n'
     '      <input type="file" id="archiveInput" accept="image/*,application/pdf,.pdf" multiple hidden>\n'
     '      <button class="btn jscan" id="jScan">' + CAMERA_IC + '<span>Scan today’s page</span></button>\n'
     '      <div class="btn-row jsecond"><button class="btn secondary" id="jBulk">Bulk upload</button><button class="btn secondary" id="jExportBtn">Export</button></div>\n'
     '      <button id="jChat" hidden></button>\n'
     '      <div id="archiveProgress"></div>\n'
     '      <div id="memCard"></div>\n'
     '      <section class="sec">\n'
     '        <div class="sec-h"><h2>Entries</h2><span class="meta num" id="journalCount"></span></div>\n'
     '        <div class="jtools"><label class="search">' + SEARCH_IC + '<input id="jSearch" type="search" placeholder="Search your journal" autocomplete="off" autocorrect="off"></label><select id="jYear" aria-label="Year"></select></div>\n'
     '        <div id="journalList"></div>\n'
     '      </section>\n'
     '    </section>\n'
     '    <section class="view" id="view-entry"><div id="entryBody"></div></section>\n\n')
swap_range('function renderArchiveProgress(){', 'function openFirstRefused(){', '')
swap_range('function renderMemHome(){', 'function memSearch(v){', '')
swap_range('async function openEntry(id){', 'async function requeueEntry(id){', '')
swap_range('async function renderJournalList(){', "$('jScan').addEventListener('click'", piece('journal.js'))
swap('renderPerson(); renderReview(); renderInsightsView(); }', 'renderPerson(); renderReview(); renderInsightsView(); renderEntry(); }')

# ---------------------------------------------------------------- People and Person
swap('      <header class="lt"><h1 class="lt-title">People</h1></header>\n      <div class="section-head"><h2>Keep in touch</h2><button class="action" id="friendAdd">+ Add friend</button></div>\n',
     '      <header class="lt lt-row"><h1 class="lt-title">People</h1><button class="link" id="friendAdd">Add</button></header>\n')
swap_range('function renderFriends(){', 'function editFriend(id){', '')
swap_range('function rhythmHTML(p){', 'function friendTrendInsights(){', '')
swap_range('function agentBusy(msg){', 'function copyText(t){', '')
swap_range('function renderPerson(){', 'function openLog(pid,lid){', piece('people.js'))

# ---------------------------------------------------------------- the few places that reached for the old single scroller
swap("    if (mainEl.scrollTop <= 0){ P.y = e.touches[0].clientY; P.active = true; P.pull = 0; }", "    if (scroller().scrollTop <= 0){ P.y = e.touches[0].clientY; P.active = true; P.pull = 0; }")
swap("    if (!P.active || P.busy) return;\n    const dy = e.touches[0].clientY - P.y;\n    if (dy > 0 && mainEl.scrollTop <= 0){",
     "    if (!P.active || P.busy || NAV.swiping) return;\n    const dy = e.touches[0].clientY - P.y;\n    if (dy > 0 && scroller().scrollTop <= 0){")
swap("    '<div class=\"turn-a\">' + askMd(t.answer_markdown || '') + '</div></div>').join('');\n  const m = document.querySelector('main'); if(m) m.scrollTop = 0;",
     "    '<div class=\"turn-a\">' + askMd(t.answer_markdown || '') + '</div></div>').join('');\n  scroller().scrollTop = 0;")
# a notification or a link opens its screen in the tab it belongs to
swap("  if(Object.prototype.hasOwnProperty.call(VIEWS, v)){ showView(v); return true; }", "  if(Object.prototype.hasOwnProperty.call(VIEWS, v)){ showView(v, 'cold'); return true; }")
swap("if(m && VIEWS[m[1]]!=null) showView(m[1]); });", "if(m && VIEWS[m[1]]!=null) showView(m[1], 'cold'); });")

(ROOT / 'next.html').write_text(src)
print('next.html written:', len(src), 'bytes,', src.count('\n'), 'lines')
