// ---------- Reviews, Places, Schedule (redesigned markup) ----------
function arrowHTML(cur, prior, goodUp){
  if(cur==null||prior==null) return '';
  const up=cur>prior, same=Math.abs(cur-prior)<0.05; if(same) return '';
  const good = goodUp?up:!up;
  return ' <span class="delta '+(good?'good':'bad')+'">'+(up?'up':'down')+'</span>';
}
function reviewNumbersHTML(w){
  const r1=v=>v==null?'—':Math.round(v*10)/10;
  const rows=[];
  if(w.hap!=null) rows.push(['Happiness', r1(w.hap)+'/10'+arrowHTML(w.hap,w.hapP,true)]);
  if(w.anx!=null) rows.push(['Anxiety', r1(w.anx)+'/10'+arrowHTML(w.anx,w.anxP,false)]);
  if(w.sleep!=null) rows.push(['Sleep, average', r1(w.sleep)+' h'+arrowHTML(w.sleep,w.sleepP,true)]);
  if(w.hrv!=null) rows.push(['HRV', Math.round(w.hrv)+' ms'+arrowHTML(w.hrv,w.hrvP,true)]);
  if(w.rhr!=null) rows.push(['Resting HR', Math.round(w.rhr)+' bpm']);
  if(w.steps!=null) rows.push(['Steps, average', Math.round(w.steps).toLocaleString()+arrowHTML(w.steps,w.stepsP,true)]);
  rows.push(['Journal entries', String(w.journalCount)]);
  if(w.cal) rows.push(['Meetings', w.cal.events+' · '+w.cal.hours+' h']);
  if(w.enoughCk) rows.push(['Check-ins', w.ckN+' / '+(w.N||7)]);
  rows.push(['Connected with', w.connected.length?esc(w.connected.join(', ')):'—']);
  if(w.goalProg.length) rows.push(['Goals moved', esc(w.goalProg.join(', '))]);
  return '<div class="sec-body">'+rows.map(r=>'<div class="row kv2"><div class="row-title plain">'+esc(r[0])+'</div><span class="row-end num money-amt">'+r[1]+'</span></div>').join('')+'</div>';
}
function reviewBodyHTML(rev){
  const w=rev.stats; const k=rev.kind||'week'; const NOUN={week:'week',month:'month',year:'year'}[k];
  let h='<header class="lt review-head"><div class="lt-eyebrow">'+esc(fmtDate(rev.weekStart))+' – '+esc(fmtDate(rev.weekEnd))+'</div><h1 class="lt-title">The '+NOUN+', reviewed</h1></header>';
  h+=rev.narrative ? '<div class="ai">'+aiLabel('Written for you')+'<div class="ai-body review-text">'+esc(rev.narrative)+'</div></div>'
    : '<div class="sec-body"><p class="study-text review-text">'+esc(factsSummary(w))+'</p></div>';
  h+='<section class="sec"><div class="sec-h"><h2>By the numbers</h2></div>'+reviewNumbersHTML(w)+'</section>';
  return h;
}
function renderReview(){
  const el=$('reviewBody'); if(!el) return;
  const NOUN={week:'Weekly',month:'Monthly',year:'Yearly'}, ONE={week:'week',month:'month',year:'year'};
  const revs=(DB.reviews||[]).filter(r=>(r.kind||'week')===rvKind);
  const fresh=revs.length&&revs[0].weekEnd>=weekData(null,rvKind).start;
  let h='<div class="segc review-seg">'+['week','month','year'].map(k=>'<button class="'+(k===rvKind?'on':'')+'" onclick="setRvKind(\''+k+'\')">'+NOUN[k].replace('ly','')+'</button>').join('')+'</div>';
  if(!revs.length){
    h+='<div class="sec-body"><div class="empty-state"><div class="es-title">Reflect on your '+ONE[rvKind]+'</div><div class="es-text">A synthesis across your mood, sleep, the people you saw, your goals and what you journaled, written for you.'+
      (DB.settings.apiKey?'':' Without an API key it shows the numbers; add one in Settings for the written reflection.')+'</div>'+
      '<button class="btn sm" onclick="generateReview()">Write the '+NOUN[rvKind].toLowerCase()+' review</button></div></div>';
    el.innerHTML=h; return;
  }
  h+=reviewBodyHTML(revs[0]);
  h+='<button class="btn secondary review-again" onclick="generateReview()">'+(fresh?'Write it again':'Write the new '+NOUN[rvKind].toLowerCase()+' review')+'</button>';
  if(revs.length>1){ h+='<section class="sec"><div class="sec-h"><h2>Past reviews</h2></div><div class="sec-body">'+revs.slice(1,13).map(r=>
    '<div class="row" onclick="openReview(\''+r.id+'\')"><div class="row-main"><div class="row-title">'+esc(fmtDate(r.weekStart))+' – '+esc(fmtDate(r.weekEnd))+'</div>'+
    '<div class="row-sub clamp2">'+esc((r.narrative||factsSummary(r.stats)).slice(0,160))+'</div></div><span class="row-chev">'+CHEV+'</span></div>').join('')+'</div></section>'; }
  el.innerHTML=h;
}

// ---- Places
function renderPlaces(){
  const el = $('placesBody'); if (!el) return;
  if (!DB.places){
    el.innerHTML = '<div class="sec-body"><div class="empty-state"><div class="es-title">Everywhere you go, summarized</div>'+
      '<div class="es-text">Google Maps quietly keeps your Timeline on your phone. Export it and this screen turns it into your places, your weeks, your patterns.</div>'+
      '<ol class="steps"><li>Open the Google Maps app</li><li>Tap your profile picture, then Settings</li><li>Location and Privacy, then Export Timeline data</li><li>Save the file, then import it here</li></ol>'+
      '<button class="btn" onclick="$(\'tlInput\').click()">Import location-history.json</button>'+
      '<div class="data-fresh places-note">Read entirely on your phone. Nothing is uploaded anywhere.</div></div></div>';
    return;
  }
  const P = DB.places;
  const topPlaces = Object.entries(P.clusters).sort((a,b) => b[1].ms - a[1].ms).slice(0, 12);
  const stat=(l, v, s)=>'<div><div class="stat-label">'+l+'</div><div class="stat-value">'+v+'</div><div class="stat-fresh">'+s+'</div></div>';
  el.innerHTML =
    '<div class="sec-body stats mood-stats2 places-top">'+
      stat('Places', Object.keys(P.clusters).length, P.totalVisits+' visits · '+esc(P.start ? dayLabel(P.start) : '')+' to '+esc(P.end ? dayLabel(P.end) : ''))+
      stat('Traveled', mi(P.weeks.reduce((a,w) => a+w.d, 0)), 'across '+P.weeks.length+' weeks')+'</div>'+
    '<section class="sec"><div class="sec-h"><h2>Where your time goes</h2><button class="link" onclick="matchTripPlaces()">Name from trips</button></div><div class="sec-body">'+
    topPlaces.map(([key, c]) =>
      '<div class="row"><div class="row-main"><div class="row-title">'+esc(placeName(key))+'</div>'+
      '<div class="row-sub">'+c.n+' visits · '+hrs(c.ms)+' · last '+esc(c.last ? dayLabel(c.last) : '')+
        ((DB.placeTrip&&DB.placeTrip[key]&&!DB.placeNames[key]) ? ' · from your itinerary' : '')+'</div></div>'+
      '<div class="row-acts"><button class="btn sm secondary" onclick="namePlace(\''+key+'\')">Name</button>'+
      '<button class="btn sm secondary" onclick="window.open(\'https://maps.google.com/?q='+c.lat+','+c.lng+'\')">Map</button></div></div>').join('')+'</div></section>'+
    '<section class="sec"><div class="sec-h"><h2>Week by week</h2></div><div class="sec-body">'+
    P.weeks.slice(0, 10).map(w => {
      const d = parseD(w.wk); const e = new Date(d); e.setDate(e.getDate()+6);
      return '<div class="row"><div class="row-main"><div class="row-title">'+MON[d.getMonth()]+' '+d.getDate()+' – '+MON[e.getMonth()]+' '+e.getDate()+'</div>'+
      '<div class="row-sub">'+w.visits+' visits · '+hrs(w.ms)+' out · '+mi(w.d)+' traveled'+
      (w.newP ? ' · '+w.newP+' new place'+(w.newP>1?'s':'') : '')+'</div>'+
      (w.top ? '<div class="row-sub">Most time: <b>'+esc(placeName(w.top))+'</b></div>' : '')+'</div></div>';
    }).join('')+'</div></section>'+
    (geoPending().length? '<button class="btn places-btn" onclick="lookupPlaceNames()">'+(_geoRunning?'Looking up names…':'Find place names ('+geoPending().length+')')+'</button>':'')+
    '<button class="btn secondary places-btn" onclick="$(\'tlInput\').click()">Import a newer export</button>'+
    '<div class="data-fresh places-note">Importing again replaces the summary with the newer export. Names come from OpenStreetMap (© OpenStreetMap contributors); your own names always win.</div>';
}

// ---- Schedule: a week strip, then the day
function eventHTML(e){
  const time = '<span class="row-time">'+(e.time ? esc(fmtTime(e.time)) : 'All day')+'</span>';
  if(e._src === 'cal')
    return '<div class="row"><span class="tick ghost" aria-hidden="true"></span>'+time+'<div class="row-main"><div class="row-title">'+esc(e.title)+'</div><div class="row-sub">From your calendar</div></div></div>';
  return '<div class="row'+(e.done ? ' done' : '')+'">'+
    '<button class="tick'+(e.done ? ' on' : '')+'" aria-label="'+(e.done ? 'Mark not done' : 'Mark done')+'" onclick="toggleEvent(\''+e.id+'\');event.stopPropagation()">'+IC_CHECK+'</button>'+time+
    '<div class="row-main" onclick="editEvent(\''+e.id+'\')"><div class="row-title">'+esc(e.title)+'</div>'+(e.notes ? '<div class="row-sub">'+esc(e.notes)+'</div>' : '')+'</div></div>';
}
function renderSchedule(){
  const days = weekDays();
  if (!days.includes(selDate)) selDate = days[0];
  const evDates = new Set([...DB.events.map(e => e.date), ...(DB.calEvents||[]).map(e => e.date)]);
  $('weekstrip').innerHTML = days.map(d => { const dt = parseD(d);
    return '<button class="day'+(d === selDate ? ' sel' : '')+(d === today() ? ' today' : '')+(evDates.has(d) ? ' has' : '')+'" onclick="selectDay(\''+d+'\')" aria-label="'+esc(fmtDate(d))+'">' +
      '<span class="day-dow">'+DOW[dt.getDay()]+'</span><span class="day-num num">'+dt.getDate()+'</span><i></i></button>';
  }).join('');
  $('schedDayLabel').innerHTML = '<button class="icon-btn quiet flip" aria-label="Previous week" onclick="shiftWeek(-1)">'+CHEV+'</button><span>'+fmtDate(selDate)+'</span>'+
    '<button class="icon-btn quiet" aria-label="Next week" onclick="shiftWeek(1)">'+CHEV+'</button>';
  const evs = eventsOn(selDate);
  $('schedEvents').innerHTML = '<div class="sec-body">'+(evs.length ? evs.map(eventHTML).join('') : '<div class="empty-state"><div class="es-title">Nothing on this day</div></div>')+'</div>';
}
