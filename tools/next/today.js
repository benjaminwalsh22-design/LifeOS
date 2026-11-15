// ---------- Today (redesigned) ----------
// Order: greeting and brief, the season slot, Noticed (top three), today's
// schedule, this week's people, food, on this day. Data and decisions come from
// the same functions as before; only the markup is new.
const TODAYV = { noticedAll:false };
const IC_REFRESH = '<svg fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20 11a8 8 0 1 0-.6 4M20 5v6h-6"/></svg>';
const longDate = s => parseD(s).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
const avVar = name => 'var(--c' + (1 + [...String(name||'?')].reduce((a,c) => a + c.charCodeAt(0), 0) % 6) + ')';
const clip = (s, n) => { s = String(s||'').replace(/\s+/g,' ').trim(); if(s.length <= n) return s; const cut = s.slice(0, n); return cut.slice(0, Math.max(cut.lastIndexOf(' '), n-24)) + '…'; };
// the label every model-written passage carries
function aiLabel(text, actFn, evidence){
  return '<div class="ai-label">'+SPARK+'<span>'+esc(text)+'</span>'+
    (evidence ? '<span class="evidence '+esc(evidence)+'">'+esc(evidence[0].toUpperCase()+evidence.slice(1))+' evidence</span>' : '')+
    (actFn ? '<span class="spacer"></span><button class="ai-act" aria-label="Write it again" onclick="event.stopPropagation();'+actFn+'">'+IC_REFRESH+'</button>' : '')+'</div>';
}
const skelLines = (...w) => w.map(x => '<span class="skel line '+x+'"></span>').join('');

function briefPending(){ return !!DB.settings.apiKey && !(DB.briefLine && DB.briefLine.date===today()) && Date.now()-_briefFail >= 300000; }
function briefHTML(){
  const custom = (DB.briefLine && DB.briefLine.date===today()) ? DB.briefLine.text : null;
  let h = '<div class="brief2">';
  if(custom) h += '<div class="ai">'+aiLabel('Written for you','regenBrief()')+'<p class="ai-body lead">'+esc(custom)+'</p></div>';
  else if(briefPending()) h += '<div class="ai" aria-busy="true">'+aiLabel('Written for you')+'<p class="ai-body lead">'+skelLines('w100','w80')+'</p></div>';
  else { const q = QUOTES[dayOfYear()%QUOTES.length];
    h += '<figure class="quote"><blockquote class="quote-text">“'+esc(q[0])+'”</blockquote><figcaption class="quote-by">'+esc(q[1])+'</figcaption></figure>'; }
  h += '</div>';
  if(!seasonHTML()) h += focusRowsHTML();
  return h;
}
// with nothing in season, the life goals that most need a push sit under the brief
function focusRowsHTML(){
  const gs = (DB.goals||[]).filter(g => goalPct(g) < 1); if(!gs.length) return '';
  const rank = g => { const m = goalMomentum(g).cls; return m==='low'?0:m==='steady'?1:2; };
  gs.sort((a,b) => rank(a)-rank(b));
  return '<div class="focus-rows">'+gs.slice(0,2).map(g =>
    '<div class="row" onclick="showView(\'goals\')"><div class="row-main"><div class="row-title">'+esc(g.name)+'</div>'+
    '<div class="row-sub">'+esc(goalNext(g).replace(/\.$/,''))+'.'+(g.why ? ' Your why: “'+esc(g.why)+'.”' : '')+'</div></div><span class="row-chev">'+CHEV+'</span></div>').join('')+'</div>';
}

// ---- the season slot: present only while something seasonal is live ----
function seasonHTML(){
  const study = (typeof QFK !== 'undefined' && today() <= QFK.exam);
  let head = '', body = '';
  if(isSprint()){
    const T = DB.twy, S = sprintDays();
    if(!S.over){
      head = '<div class="season-top"><span class="eyebrow">In season</span><span class="data-fresh">'+(S.started ? 'Day '+S.day+' of '+S.total : 'Starts '+esc(fmtDate(T.start)))+'</span></div>'+
        '<h3 class="season-title">'+esc(T.name)+' sprint</h3>';
      body += '<div class="season-goals">'+T.goals.map(g => {
        const hit = sprintHit(g);
        if(g.type==='count'){
          const n = sprintCount(g), pace = S.started ? Math.ceil(g.target*S.day/S.total) : 0, behind = !hit && n < pace;
          return '<div class="sg'+(hit?' done':'')+'"><span class="sg-name">'+esc(g.label)+'</span><span class="sg-val '+(hit?'good':behind?'watch':'')+'">'+n+' of '+g.target+'</span>'+
            '<div class="bar"><i class="'+(hit?'good':behind?'watch':'')+'" style="width:'+Math.min(100, Math.round(n/g.target*100))+'%"></i></div></div>';
        }
        const dd = g.due ? daysBetween(today(), g.due) : null;
        return '<div class="sg'+(hit?' done':'')+'"><span class="sg-name">'+esc(g.label)+'</span><span class="sg-val '+(hit?'good':'')+'">'+(hit ? 'Done' : dd!=null ? (dd>0 ? dd+' days' : dd===0 ? 'Today' : 'Past') : 'Open')+'</span></div>';
      }).join('')+'</div>';
      const nd = sprintNudges();
      if(nd){
        body += '<div class="season-due">'+(nd.items.length ? nd.items.slice(0,2).map(i =>
          '<div class="due" onclick="event.stopPropagation();showView(\''+(i.view||'goals')+'\')"><span class="dot '+(i.p===0?'watch':'info')+'"></span><span>'+esc(i.txt)+'</span></div>').join('')
          : '<div class="due"><span class="dot"></span><span>All '+T.goals.length+' are on track today.</span></div>')+'</div>';
      }
    }
  } else {
    const nd = twyNudges();
    if(nd){
      head = '<div class="season-top"><span class="eyebrow">In season</span><span class="data-fresh">'+esc(nd.phase)+'</span></div>'+
        '<h3 class="season-title">Week '+nd.n+' of 12</h3>';
      body += '<div class="season-goals"><div class="sg"><span class="sg-name">Weekly tactics hit</span><span class="sg-val">'+nd.hits+' of '+nd.total+'</span>'+
        '<div class="bar"><i class="'+(nd.hits/nd.total>=.8?'good':'')+'" style="width:'+Math.round(nd.hits/nd.total*100)+'%"></i></div></div></div>'+
        '<div class="season-due">'+(nd.items.length ? nd.items.map(i => '<div class="due"><span class="dot '+(i.p===0?'watch':'info')+'"></span><span>'+esc(i.txt)+'</span></div>').join('')
          : '<div class="due"><span class="dot"></span><span>Everything due today is done.</span></div>')+'</div>';
    }
  }
  if(study){
    const left = daysBetween(today(), QFK.exam), done = !!(DB.study && DB.study.log && DB.study.log[today()]);
    body += '<div class="season-study" onclick="event.stopPropagation();showView(\'study\')"><span class="hero-num">'+left+'</span>'+
      '<div class="row-main"><div class="row-title">'+(left===1?'day':'days')+' to Quest for Knowledge</div>'+
      '<div class="row-sub">'+(done ? 'Studied tonight' : 'Tonight: '+esc(subName(studyTonight())))+' · '+studyLast7()+' of the last 7 nights</div></div><span class="row-chev">'+CHEV+'</span></div>';
    if(!head) head = '<div class="season-top"><span class="eyebrow">In season</span></div>';
  }
  if(!head && !body) return '';
  return '<section class="season" onclick="showView(\'goals\')">'+head+body+'</section>';
}

// ---- Noticed: the three that matter most, the rest one tap away ----
function noticedRowHTML(i){
  const tone = i.tone==='watch' ? 'watch' : i.tone==='info' ? 'info' : '';
  return '<div class="row"><span class="dot '+tone+'"></span><div class="row-main"><div class="row-title">'+esc(i.text)+'</div>'+
    (i.why ? '<div class="row-sub">'+esc(i.why)+'</div>' : '')+
    (i.act ? '<div class="notice-act"><button class="btn sm secondary" onclick="'+i.act.fn+'">'+esc(i.act.label)+'</button></div>' : '')+'</div></div>';
}
function renderInsights(){
  renderMood(); renderBody();
  const full = computeInsights(50); const el = $('attnList'); if(!el) return;
  const more = $('noticedMore');
  if(!full.length){
    el.innerHTML = '<div class="empty-state"><div class="es-title">All calm.</div><div class="es-text">Nothing needs you right now. Check-ins and the ring teach this what to watch for.</div></div>';
    if(more) more.hidden = true; return;
  }
  // collapsed, the three lead with what is not already said elsewhere on the page: while
  // This week's people is showing, plain "reach out" cards wait behind Show all
  const hasPeople = peopleThisWeek().length > 0;
  const echo = i => hasPeople && /^Reach out to /.test(i.text);
  const lead = full.filter(i => !echo(i));
  el.innerHTML = (TODAYV.noticedAll ? full : (lead.length ? lead : full).slice(0,3)).map(noticedRowHTML).join('');
  if(more){ more.hidden = full.length <= 3; more.textContent = TODAYV.noticedAll ? 'Show fewer' : 'Show all '+full.length; }
}
function toggleNoticed(){ TODAYV.noticedAll = !TODAYV.noticedAll; renderInsights(); }

// ---- today's schedule, with the week one tap away ----
function todaySchedHTML(){
  const evs = eventsOn(today());
  if(!evs.length) return '<div class="sched-empty"><span>Nothing on the calendar today.</span><button class="btn sm secondary" onclick="selDate=today();editEvent(\'\')">Add</button></div>';
  return evs.slice(0,4).map(e => {
    const time = '<span class="row-time">'+(e.time ? esc(fmtTime(e.time)) : 'All day')+'</span>';
    if(e._src==='cal') return '<div class="row">'+time+'<div class="row-main"><div class="row-title">'+esc(e.title)+'</div></div><span class="cal-tag">Calendar</span></div>';
    return '<div class="row'+(e.done?' done':'')+'" onclick="editEvent(\''+e.id+'\')">'+time+'<div class="row-main"><div class="row-title">'+esc(e.title)+'</div>'+
      (e.notes ? '<div class="row-sub clip">'+esc(e.notes)+'</div>' : '')+'</div><span class="row-chev">'+CHEV+'</span></div>';
  }).join('') + (evs.length > 4 ? '<div class="row" onclick="showView(\'schedule\')"><div class="row-main"><div class="row-sub">'+(evs.length-4)+' more today</div></div><span class="row-chev">'+CHEV+'</span></div>' : '');
}

// ---- this week's people ----
function pwRowHTML(x){ const f = x.f, K = !!DB.settings.apiKey;
  return '<div class="row" onclick="openPerson(\''+f.id+'\')"><span class="av" style="background:'+avVar(f.name)+'">'+esc(f.name[0].toUpperCase())+'</span>'+
    '<div class="row-main"><div class="row-title">'+esc(f.name)+'</div><div class="row-sub clip">'+esc(x.reason)+'</div></div>'+
    (K ? '<button class="btn sm secondary" onclick="event.stopPropagation();draftMessage(\''+f.id+'\')">Draft</button>' : '')+'<span class="row-chev">'+CHEV+'</span></div>';
}

function renderToday(){
  const t = today();
  $('topDate').textContent = longDate(t);
  const h = new Date().getHours();
  const name = DB.profile.name || 'there';
  $('greetHi').textContent = (h < 12 ? 'Good morning, ' : h < 18 ? 'Good afternoon, ' : 'Good evening, ') + name;
  const me = $('topGear'); if(me) me.textContent = (DB.profile.name || 'B').trim()[0].toUpperCase();

  $('briefCard').innerHTML = briefHTML();
  ensureBriefLine();
  loadCycle();
  $('seasonSlot').innerHTML = seasonHTML();

  // the proactive feed
  renderInsights();
  $('todaySched').innerHTML = todaySchedHTML();

  // this week's people
  const pw = peopleThisWeek();
  $('todayDigest').innerHTML = pw.length ? '<section class="sec"><div class="sec-h"><h2>This week’s people</h2><button class="link" onclick="showView(\'friends\')">Everyone</button></div>'+
    '<div class="sec-body">'+pw.map(pwRowHTML).join('')+'</div></section>' : '';

  $('todayMore').innerHTML = '';
}
