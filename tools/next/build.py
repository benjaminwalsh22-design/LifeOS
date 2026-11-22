#!/usr/bin/env python3
"""Builds the redesigned LifeOS from the last version before the redesign.

    python3 tools/next/build.py           writes next.html (the preview)
    python3 tools/next/build.py --live    also writes index.html (the live app), labelled v11.0

The starting point is rollback/index-v10.5.html, which never changes. This
script swaps the old markup-building functions for the pieces in this folder
and appends the design-system stylesheet. Nothing here touches storage, sync,
prompts or scoring: every replaced function keeps its data logic, and
tests/ui/parity.test.js holds the two builds to that.
"""
import re, sys, pathlib

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parent.parent
LIVE = '--live' in sys.argv
src = (ROOT / 'rollback' / 'index-v10.5.html').read_text()
VERSION = 'v11.1' if LIVE else 'v11.1 preview'

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
src, _n = re.subn(r'<link rel="icon" href="data:image/svg\+xml,[^"]*">', '<link rel="icon" href="data:image/svg+xml,' + "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='96 88 320 348'%3E%3Cpath d='M256 122v30M172 151l21 25M340 151l-21 25' fill='none' stroke='%23FFC289' stroke-width='14' stroke-linecap='round'/%3E%3Cpath d='M154 307a102 102 0 0 1 204 0Z' fill='%23FFA98C'/%3E%3Crect x='128' y='322' width='256' height='19' rx='9.5' fill='%23FFB98C'/%3E%3Crect x='158' y='358' width='196' height='18' rx='9' fill='%23FFD3B4'/%3E%3C/svg%3E" + '">', src)
if _n != 1: sys.exit('build: favicon link not found')
swap('<meta name="apple-mobile-web-app-title" content="Life OS">', '<meta name="apple-mobile-web-app-title" content="LifeOS">')
swap('<meta name="theme-color" id="metaTheme" content="#33527B">',
     '<meta name="theme-color" id="metaTheme" content="#F1F2F4">\n'
     '<script>/* theme and direction before first paint, so the wrong one never flashes */\n'
     '(function(){try{var d=document.documentElement,t=localStorage.getItem("lifeos_theme");'
     'if(t)d.setAttribute("data-theme",t);'
     'var m=document.getElementById("metaTheme");if(m&&t==="dark")m.setAttribute("content","#0B0C0E");}catch(e){}})();</script>')
swap('</style>\n</head>', '</style>\n<style id="ds">\n' + piece('ds.css') + '</style>\n</head>')

# ---------------------------------------------------------------- chrome
# the app's own mark: the sunrise of the home-screen icon, drawn once here and used on the lock screen and in About
SUN_DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><linearGradient id="sunG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFA18F"/><stop offset="1" stop-color="#FFB585"/></linearGradient><linearGradient id="sunL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFA98C"/><stop offset="1" stop-color="#FFCB90"/></linearGradient></defs></svg>'
SUN = '<svg class="sunrise" viewBox="112 104 288 316" role="img" aria-label="LifeOS"><path d="M256 122v30M172 151l21 25M340 151l-21 25" fill="none" stroke="#FFC289" stroke-width="14" stroke-linecap="round"/><path d="M154 307a102 102 0 0 1 204 0Z" fill="url(#sunG)"/><rect x="128" y="322" width="256" height="19" rx="9.5" fill="url(#sunL)"/><rect x="158" y="358" width="196" height="18" rx="9" fill="url(#sunL)" opacity=".62"/><rect x="190" y="392" width="132" height="16" rx="8" fill="url(#sunL)" opacity=".34"/></svg>'
swap('<div class="app">', SUN_DEFS + '\n<div class="app" data-large="1" data-view="today">')
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
swap("""<div class="syncbanner" id="syncBanner" hidden onclick="showView('settings')">""", """<div class="netbanner" id="netBanner" hidden>You are offline. Everything you add is kept on this phone and syncs when you are back.</div>\n  <div class="syncbanner" id="syncBanner" hidden onclick="showView('set-account')">""")

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
     '    <!-- each Settings row opens one of these; every control keeps the id the app already listens to -->\n'
     '    <section class="view" id="view-set-profile">\n'
     '      <div class="sec-body pane">\n'
     '        <div class="field"><label for="setName">Your name</label><input id="setName" placeholder="Benjamin" autocomplete="given-name"></div>\n'
     '        <div class="field"><label for="setTheme">Appearance</label>\n'
     '          <select id="setTheme"><option value="light">Light</option><option value="dark">Dark</option></select>\n'
     '        </div>\n'
     '      </div>\n'
     '    </section>\n'
     '    <section class="view" id="view-set-ai">\n'
     '      <div class="sec-body pane">\n'
     '        <div class="field"><label for="setApiKey">Anthropic API key</label>\n'
     '          <input id="setApiKey" type="password" placeholder="sk-ant-..." autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">\n'
     '        </div>\n'
     '      </div>\n'
     '      <div class="data-fresh pane-note">With a key, this phone asks Claude directly for the morning line, On this day, reviews, the people agent and Ask your journal. Pages you scan while signed in are read in your account instead, even with the app closed. Get a key at <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a>. Leave it blank to just keep the photos.</div>\n'
     '    </section>\n'
     '    <section class="view" id="view-set-data">\n'
     '      <div class="sec-body pane">\n'
     '        <button class="btn secondary" id="exportBtn">Save a backup file</button>\n'
     '        <button class="btn secondary" id="importBtn">Restore from a backup file</button>\n'
     '        <input type="file" id="importInput" accept="application/json" hidden>\n'
     '      </div>\n'
     '      <div class="data-fresh pane-note">Your data is kept on this phone and, when you are signed in, in your account. A backup file is a second copy you hold yourself. For a large archive the file leaves the photos out; Journal has its own export for those.</div>\n'
     '      <div class="sec-body pane" style="margin-top:var(--s8)"><button class="btn danger" id="wipeBtn">Erase everything on this phone</button></div>\n'
     '      <div class="data-fresh pane-note">Removes LifeOS data from this phone only. Anything synced to your account comes back when you sign in again.</div>\n'
     '    </section>\n'
     '    <section class="view" id="view-set-health">\n'
     '      <div class="sec-body pane">\n'
     '        <div class="field"><label for="setSyncUrl">Live sync address (optional)</label><input id="setSyncUrl" type="url" placeholder="https://…/health?key=…" autocapitalize="none" autocorrect="off" spellcheck="false"></div>\n'
     '        <button class="btn secondary" id="syncNowBtn">Sync now</button>\n'
     '        <div class="notice" id="syncStatus"></div>\n'
     '        <button class="btn secondary" onclick="testHealthSync()">Try it with sample numbers</button>\n'
     '      </div>\n'
     '      <div class="data-fresh pane-note">Apple doesn’t let a web app read Health directly. There are two ways in: a Shortcut that opens LifeOS with your numbers, or live sync, where the app pulls the latest from a private address your Shortcut posts to. Ask Claude for either recipe.</div>\n'
     '    </section>\n'
     '    <section class="view" id="view-set-lock"><div class="sec-body pane" id="lockCard"></div></section>\n'
     '    <section class="view" id="view-set-notif"><div class="sec-body pane" id="notifCard"></div></section>\n'
     '    <section class="view" id="view-set-account"><div class="sec-body pane" id="acctBody"></div></section>\n'
     '    <section class="view" id="view-set-about">\n'
     '      <div class="sec-body pane about">\n'
     '        ' + SUN + '\n        <div class="about-name">LifeOS</div>\n'
     '        <div class="about-ver" id="appVer">' + VERSION + '</div>\n'
     '        <button class="btn secondary" onclick="checkUpdate()">Check for updates</button>\n'
     '        <button class="btn secondary" onclick="showView(\'styleguide\')">Style guide</button>\n'
     '      </div>\n'
     '      <div class="data-fresh pane-note">Checking for updates fetches the newest version from your site and reloads. Your data is not touched.</div>\n'
     '    </section>\n\n')
LOCK_IC = '<svg fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path stroke-linecap="round" d="M9 10v1.5M15 10v1.5M12 10v3.2h-1M9 15.5c.8.7 1.8 1 3 1s2.2-.3 3-1"/></svg>'
swap_range('  <div class="lockscreen" id="lockscreen" style="display:none">', '  <!-- modals -->',
     '  <div class="lockscreen" id="lockscreen" style="display:none">\n'
     '    <div class="lock-inner">\n'
     '      <div class="cover">' + SUN + '<div class="cover-title">LifeOS</div><div class="cover-name" id="lockName"></div></div>\n'
     '      <div class="lock-form">\n'
     '        <button class="btn" id="lockFace" style="display:none" onclick="faceUnlock()">' + LOCK_IC + '<span>Unlock with Face ID</span></button>\n'
     '        <div class="lock-or" id="lockOr" style="display:none">or enter your PIN</div>\n'
     '        <input id="lockPin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN" maxlength="8" aria-label="PIN">\n'
     '        <button class="btn" id="lockPinBtn" onclick="tryUnlock()">Unlock</button>\n'
     '        <div class="lock-forgot" onclick="lockForgot()">Forgot PIN?</div>\n'
     '      </div>\n'
     '    </div>\n'
     '  </div>\n\n')

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
swap_range('function renderGoals(){ renderTWY();', 'function toggleMilestone(gid, mid){', piece('goals.js'))
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

# ---------------------------------------------------------------- Ask Ben, with the older ask folded in; the two unreachable screens retired
swap_range('    <section class="view" id="view-ask">', '    <!-- ============ PLACES ============ -->',
     '    <section class="view" id="view-ask">\n'
     '      <header class="lt"><div class="lt-eyebrow" id="askMeta">&nbsp;</div><h1 class="lt-title">Ask Ben</h1></header>\n'
     '      <div class="ask-quote" id="askQuote"></div>\n'
     '      <div class="ask-box">\n'
     '        <textarea id="askInput" rows="4" placeholder="What’s the situation? Be specific. Names, dates, what you’re tempted to do."></textarea>\n'
     '        <div class="ask-ctl">\n'
     '          <div class="segc" id="askVoice"><button data-v="both" class="on">Both</button><button data-v="past">Past Ben</button><button data-v="future">Future Ben</button></div>\n'
     '          <div class="segc" id="askDepth"><button data-d="deep" class="on">Deep</button><button data-d="quick">Quick</button></div>\n'
     '          <div class="ask-go">\n'
     '            <button class="btn" id="askGo" onclick="askBen()">Ask</button>\n'
     '            <button class="btn secondary" id="askStop" onclick="askStop()" style="display:none">Stop</button>\n'
     '          </div>\n'
     '        </div>\n'
     '      </div>\n'
     '      <div class="group-h ask-start">Start from</div>\n'
     '      <div class="chips scroll ask-chips" id="askChips"></div>\n'
     '      <div class="ask-thread" id="askThread"></div>\n'
     '      <section class="sec ask-past">\n'
     '        <div class="sec-h"><h2>Past conversations</h2><button class="link" onclick="askNewSession()">New</button></div>\n'
     '        <div class="sec-body" id="askSessions"><div class="empty">Nothing yet.</div></div>\n'
     '      </section>\n'
     '      <div class="ask-alt" id="askAlt"></div>\n'
     '    </section>\n\n')
swap_range('function openAsk(){', 'function scoreEntry(j, toks){', piece('ask.js'))
swap("  askQuote(false);\n  askLoadSessions();\n}", "  askQuote(false);\n  askLoadSessions();\n  renderAskAlt();\n}")
swap("  if(!SUPA || !SUPA.session){ toast('Sign in first'); return; }\n  if(!DB.settings.apiKey){ toast('Add an API key in Settings'); return; }\n  if(ASK.ctl) return;",
     "  if(!SUPA || !SUPA.session){ openAsk(q); return; }     // signed out: the on-phone ask takes the question instead\n  if(!DB.settings.apiKey){ toast('Add an API key in Settings'); return; }\n  if(ASK.ctl) return;")
swap_range('    <!-- ============ HEALTH (under Life) ============ -->', '    <!-- ============ STYLE GUIDE (redesign preview) ============ -->', '')
swap_range('function renderHealthView(){', '// ---------- Goals ----------', '')

# ---------------------------------------------------------------- 52 Memories and Reading Mode
swap_range('  <div class="memread" id="memRead">', '  <div class="lockscreen" id="lockscreen"',
     '  <div class="memread" id="memRead" role="dialog" aria-label="Reading Mode">\n'
     '    <div class="mr-prog"><i id="mrBar"></i></div>\n'
     '    <div class="mr-top"><span class="mr-yr" id="mrYr"></span><button class="icon-btn" onclick="memReadClose()" aria-label="Close Reading Mode">&times;</button></div>\n'
     '    <div class="mr-body" id="mrBody"></div>\n'
     '    <div class="mr-nav"><button class="btn secondary" onclick="memReadPrev()" id="mrPrev">Back</button><button class="btn" onclick="memReadNext()" id="mrNext">Next</button></div>\n'
     '  </div>\n\n')
swap_range('function memReadStart(yr,i){', '// next-year collector', '')
swap_range('function memCandHTML(){', 'function addMemCandSheet(){', '')
swap_range('function renderMemories(){', 'function editMemory(id){', piece('memories.js'))

# ---------------------------------------------------------------- Reviews, Places, Schedule
swap_range('    <section class="view" id="view-schedule">', '    <!-- ============ FRIENDS ============ -->',
     '    <section class="view" id="view-schedule">\n'
     '      <div class="week" id="weekstrip"></div>\n'
     '      <div class="sec-h sched-h"><h2 class="sched-day" id="schedDayLabel"></h2><button class="link" id="schedAddEvent">Add</button></div>\n'
     '      <div id="schedEvents"></div>\n'
     '    </section>\n\n')
swap_range('function arrowHTML(cur, prior, goodUp){', 'function openReview(id){', '')
swap_range('function renderSchedule(){', 'function shiftWeek(n){', '')
swap_range('function eventHTML(e){', 'function toggleEvent(id){', '')
swap_range('function renderPlaces(){', 'function namePlace(key){', piece('misc.js'))
swap("""    if($('reviewBody')) $('reviewBody').innerHTML='<div class="pagehead2"><div class="a-lead">Writing your review…</div></div><div class="brief" style="margin-top:8px"><p><span class="spinner"></span>Reading your '+NOUN[kind]+'…</p></div>';""",
     """    if($('reviewBody')) $('reviewBody').innerHTML='<div class="ai" aria-busy="true">'+aiLabel('Writing your review')+'<p class="ai-body">'+skelLines('w100','w100','w80','w60')+'</p><div class="data-fresh">Reading your '+NOUN[kind]+'.</div></div>';""")

# ---------------------------------------------------------------- Settings pages that draw themselves
swap_range('async function renderNotifCard(){', 'regSW().then(', '')
swap_range('function renderLockCard(){', "document.addEventListener('visibilitychange', () => {", piece('settings2.js'))

# ---------------------------------------------------------------- polish: questions as sheets, no symbol glyphs in messages
swap("  if (dupOf && !confirm('This photo looks identical to your '+fmtDate(dupOf.date)+' entry. Save anyway?')){ window._pendingPhoto=null; closeSheet(); return; }",
     "  if (dupOf && !(await confirmSheet('Save it anyway?', 'This photo looks identical to your '+fmtDate(dupOf.date)+' entry.', 'Save anyway'))){ window._pendingPhoto=null; closeSheet(); return; }")
swap("    if (!confirm('Erase everything? This cannot be undone.')) return;",
     "    if (!(await confirmSheet('Erase everything on this phone?', 'This cannot be undone here. Anything synced to your account comes back when you sign in again.', 'Erase', true))) return;")
swap("  if(!confirm('Disconnect the ring? Numbers already in LifeOS stay put.')) return;",
     "  if(!(await confirmSheet('Disconnect the ring?', 'Numbers already in LifeOS stay put.', 'Disconnect'))) return;")
swap("  if(!confirm('Disconnect OneDrive? Photos already copied into LifeOS stay put.')) return;",
     "  if(!(await confirmSheet('Disconnect OneDrive?', 'Photos already copied into LifeOS stay put.', 'Disconnect'))) return;")
swap("function lockForgot(){\n  if(confirm('Reset this device? Local data is erased; anything synced to your account returns after you log back in.')){",
     "async function lockForgot(){\n  if(await confirmSheet('Reset this phone?', 'Local data is erased; anything synced to your account returns after you log back in.', 'Reset', true)){")
swap("(g.label.split(',')[0]+' — '+g.target+' done ✓')", "(g.label.split(',')[0]+': '+g.target+' done')")
swap("    if(g.done) toast(g.label+' ✓');", "    if(g.done) toast(g.label+': done');")
swap("(j._mem?'&#10022; ':'')+fmtDate(j.date)", "(j._mem?'52 Memories · ':'')+fmtDate(j.date)")

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

# ---------------------------------------------------------------- clear out: functions and styles nothing uses any more
def drop_fn(name, until):
    """Remove one function, from its declaration up to the line that starts with `until`."""
    global src
    m = re.search(r'\n(?:async )?function ' + re.escape(name) + r'\(', src)
    if not m or len(re.findall(r'\n(?:async )?function ' + re.escape(name) + r'\(', src)) != 1:
        sys.exit(f'build: cannot find exactly one function {name}')
    j = src.find('\n' + until, m.start() + 1)
    if j < 0 or j - m.start() > 9000:
        sys.exit(f'build: end marker for {name} not found close by: {until!r}')
    src = src[:m.start() + 1] + src[j + 1:]

for name, until in [
    ('insightCardHTML', '// ---------- mood over time'), ('moodChart', 'function fmtYM(ym){'), ('moodHover', '// ---------- body composition ----------'),
    ('bodyChart', 'const QUOTES=['), ('twyFocusHTML', 'function openMemoriesGuard(){'), ('moneyPanelHTML', 'function workHTML(){'),
    ('workHTML', 'function obsHTML(){'), ('obsHTML', 'async function refreshObs(){'), ('transHTML', 'function openReviewQueue(){'),
    ('scoreBlockHTML', 'function openScoreEdit(id){'), ('sparkline', 'function trendCardHTML(m){'), ('trendCardHTML', '// ---------- one metric over time'),
    ('trendChart', 'function trendHover(pts, m){'), ('trendHover', '// ---------- Insights: a hub and its doors ----------')]:
    drop_fn(name, until)
for name in ['insightCardHTML', 'moodChart', 'moodHover', 'bodyChart', 'twyFocusHTML', 'moneyPanelHTML', 'workHTML', 'obsHTML', 'transHTML', 'scoreBlockHTML', 'sparkline', 'trendCardHTML', 'trendChart', 'trendHover']:
    if re.search(r'(?<![\w$])' + name + r'\s*\(', src):
        sys.exit(f'build: {name} is still referenced after removal')

# the first stylesheet is the old one. Keep only the rules whose classes and ids still appear
# somewhere in the markup or the script; its colour tokens go too, since the design system defines them all.
def prune_css(css, alive):
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            break
        head = css[i:j]
        depth, k = 1, j + 1
        while k < n and depth:
            c = css[k]
            if c in '"\'':
                k = css.index(c, k + 1)
            elif c == '{': depth += 1
            elif c == '}': depth -= 1
            k += 1
        body = css[j + 1:k - 1]
        sel = re.sub(r'/\*.*?\*/', '', head, flags=re.S).strip()
        if sel.startswith('@media') or sel.startswith('@supports'):
            inner = prune_css(body, alive)
            if inner.strip():
                out.append(sel + ' {\n' + inner + '}\n')
        elif sel.startswith('@'):
            out.append(sel + ' {' + body + '}\n')
        elif sel in (':root', ':root[data-theme="dark"]'):
            pass
        else:
            keep = [x.strip() for x in sel.split(',')
                    if all(t in alive for t in re.findall(r'[.#]([A-Za-z_][\w-]*)', re.sub(r'\[[^\]]*\]', '', x)))]
            if keep:
                out.append(', '.join(keep) + ' {' + body + '}\n')
        i = k
    return ''.join(out)

m = re.search(r'<style>(.*?)</style>\n<style id="ds">', src, flags=re.S)
if not m:
    sys.exit('build: old stylesheet not found')
rest = src[:m.start(1)] + src[m.end(1):]
rest = re.sub(r'<style id="ds">.*?</style>', '', rest, flags=re.S)
alive = set(re.findall(r'[A-Za-z_][\w-]*', rest))
old_css = m.group(1)
new_css = prune_css(old_css, alive)
src = src[:m.start(1)] + '\n/* what is left of the old stylesheet: layout for parts the design system has not replaced */\n' + new_css + src[m.end(1):]
print('old stylesheet:', len(old_css), '->', len(new_css), 'bytes')

(ROOT / 'next.html').write_text(src)
if LIVE:
    (ROOT / 'index.html').write_text(src)
    print('index.html written: the redesign is live once this is pushed')
print('next.html written:', len(src), 'bytes,', src.count('\n'), 'lines')
