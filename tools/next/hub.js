// ---------- Insights: a hub and its doors ----------
// The hub answers two questions (what changed, what stands out) and then gets
// out of the way: everything else lives one tap in, behind Mind, Body, Money,
// The Firm, Places and Reviews. The numbers come from the same functions the
// old single page used; nothing is computed differently.
const HUBV = { obsAll:false, open:{} };
const shortDay = s => { const d = parseD(String(s).slice(0,10)); return isNaN(d) ? String(s) : MON[d.getMonth()]+' '+d.getDate(); };

// the trend cards' own sum: the average of the last seven readings against the
// seven before. Ranked here by how unusual the move is for that measure.
function weekChanges(){
  const out = [];
  TRENDS.forEach(m => {
    const nz = trendSeries(m.kind, m.key, 30, m.zero).filter(o => o.v != null).map(o => o.v);
    if(nz.length < 10) return;
    const now = mean(nz.slice(-7)), was = mean(nz.slice(-14, -7));
    if(now == null || was == null) return;
    const mu = mean(nz), sd = Math.sqrt(mean(nz.map(v => (v-mu)*(v-mu))) || 0);
    if(!sd) return;
    const z = (now - was) / sd; if(Math.abs(z) < 0.4) return;
    out.push({ m:m, now:now, was:was, z:z });
  });
  return out.sort((a,b) => Math.abs(b.z) - Math.abs(a.z));
}
function changeRowHTML(c){
  const m = c.m, d = c.now - c.was, up = d > 0, good = m.goodUp ? up : !up;
  const unit = (m.unit||'');
  let delta;
  if(m.fmt === 'clock'){ const mins = Math.round(Math.abs(d)*60); delta = mins + ' min ' + (up ? 'later' : 'earlier'); }
  else { const a = Math.abs(d); let dp = m.fmt === 'int' ? 0 : (m.dp||0);
    if(Number(a.toFixed(dp)) === 0) dp += 1;                      // a move too small for the measure's own precision still shows as a move
    delta = (up ? '+' : '−') + (dp ? a.toFixed(dp) : Math.round(a).toLocaleString()) + unit; }
  const tap = m.kind === 'stat' ? ' onclick="openTrend(\''+m.key+'\')"' : '';
  return '<div class="row"'+tap+'><div class="row-main"><div class="row-title">'+esc(m.label)+'</div>'+
    '<div class="row-sub">'+esc(trendFmt(m, c.was))+esc(unit)+' the week before</div></div>'+
    '<div class="chg"><div class="chg-v">'+esc(trendFmt(m, c.now))+'<span class="unit">'+esc(unit)+'</span></div>'+
    '<div class="delta '+(good?'good':'bad')+'">'+esc(delta)+'</div></div>'+
    (tap ? '<span class="row-chev">'+CHEV+'</span>' : '')+'</div>';
}
function hubChangedHTML(){
  const ch = weekChanges().slice(0, 4);
  return '<section class="sec"><div class="sec-h"><h2>What changed</h2><span class="meta">7-day average</span></div><div class="sec-body">'+
    (ch.length ? ch.map(changeRowHTML).join('')
      : '<div class="empty-state"><div class="es-title">Nothing has moved much</div><div class="es-text">'+
        (healthDepth() >= 14 ? 'This week looks like last week across everything that is measured.' : 'Once two weeks of readings are in, the measures that moved most show up here.')+'</div></div>')+
    '</div></section>';
}
function hubObsHTML(){
  const o = LIFE.obs, items = (o && o.items) || [];
  const signed = !!(SUPA && SUPA.session);
  let body;
  if(items.length){
    const when = o.at ? new Date(o.at) : null;
    const ago = when ? (Math.round((Date.now()-when.getTime())/3600000) < 24 ? 'Read your data today' : 'Read your data ' + fmtDate(dstr(when))) : 'Written from your data';
    const show = HUBV.obsAll ? items : items.slice(0, 2);
    body = '<div class="ai obs-stack">'+aiLabel(ago, 'refreshObs()')+
      show.map((it, i) => { const open = !!HUBV.open[i];
        return '<article class="obs2" onclick="HUBV.open['+i+']=!HUBV.open['+i+'];renderHub()"><div class="obs2-top"><span class="obs2-kind">'+esc(it.kind||'')+'</span>'+
        (it.strength ? '<span class="evidence '+esc(it.strength)+'">'+esc(String(it.strength))+' evidence</span>' : '')+'</div>'+
        '<h3 class="obs2-title">'+esc(it.title||'')+'</h3><p class="ai-body'+(open ? '' : ' clamp')+'">'+esc(it.body||'')+'</p>'+
        (open ? '' : '<div class="obs2-more">Read on</div>')+'</article>'; }).join('')+'</div>';
  } else if(signed && (LIFE.loading || !LIFE.at)){
    body = '<div class="ai" aria-busy="true">'+aiLabel('Reading your data')+'<p class="ai-body">'+skelLines('w60','w100','w80')+'</p></div>';
  } else if(signed && !LIFE.digest && !o){
    body = '<div class="sec-body"><div class="error-state"><div class="es-title">Could not reach your account</div><div class="es-text">What stands out is written from the data in your account. Nothing on this phone is affected.</div>'+
      '<button class="btn sm secondary" onclick="loadLife(true)">Try again</button></div></div>';
  } else if(signed){
    body = '<div class="sec-body"><div class="empty-state"><div class="es-title">Nothing written yet</div><div class="es-text">Observations are written from your sleep, money, work and journal once there is enough to read.</div>'+
      '<button class="btn sm secondary" onclick="refreshObs()">Read it now</button></div></div>';
  } else {
    body = '<div class="sec-body"><div class="empty-state"><div class="es-title">Sign in to see what stands out</div><div class="es-text">These observations are written from the data in your account.</div>'+
      '<button class="btn sm secondary" onclick="showView(\'set-account\')">Account and sync</button></div></div>';
  }
  return '<section class="sec"><div class="sec-h"><h2>What stands out</h2>'+
    (items.length > 2 ? '<button class="link" onclick="HUBV.obsAll=!HUBV.obsAll;renderHub()">'+(HUBV.obsAll ? 'Show fewer' : 'Show all '+items.length)+'</button>' : '')+'</div>'+body+'</section>';
}
// one line under each door, from data already in hand
function doorSummaries(){
  const idx = statIndex(today()), fresh = k => idx[k] && daysApart(idx[k].day, today()) <= 1 ? idx[k].val : null;
  const hap = last7(ckHap), anx = last7(ckAnx);
  const sleep = fresh('sleep'), ready = fresh('readiness');
  const d = LIFE.digest || {}, m = d.money, w = d.work;
  let money = 'This month against a typical one';
  if(m){ const mtd = Number(m.mtd_total)||0, tot = Number(m.typical_total)||0, pct = tot ? Math.round(100*mtd/tot) : null;
    money = money0(mtd)+' this month'+(pct == null ? '' : pct < 100 ? ', '+(100-pct)+'% under pace' : ', '+(pct-100)+'% over pace'); }
  const rv = (DB.reviews||[])[0];
  return {
    mind: hap != null ? 'Happiness '+hap.toFixed(1)+(anx != null ? ', anxiety '+anx.toFixed(1) : '')+' this week' : 'Mood over time, check-in, patterns',
    body: (sleep != null || ready != null) ? [sleep != null ? 'Slept '+sleep+' h' : '', ready != null ? 'readiness '+Math.round(ready) : ''].filter(Boolean).join(', ').replace(/^r/, 'R') : 'Sleep, heart, weight, trends',
    money: money,
    firm: w && w.latest && w.latest.period_end ? 'Through '+shortDay(w.latest.period_end) : 'Hours, billing, the year so far',
    places: DB.places ? Object.keys(DB.places.clusters||{}).length+' places, '+(DB.places.weeks||[]).length+' weeks' : 'Where your time goes',
    review: rv ? 'Latest: week of '+shortDay(rv.weekStart) : 'Weekly, monthly, yearly',
  };
}
function hubDoorsHTML(){
  const s = doorSummaries();
  const door = (v, title, sub) => '<div class="row nav" onclick="showView(\''+v+'\')"><div class="row-main"><div class="row-title">'+title+'</div>'+
    '<div class="row-sub clip">'+esc(sub)+'</div></div><span class="row-chev">'+CHEV+'</span></div>';
  return '<section class="sec"><div class="sec-h"><h2>Look closer</h2></div><div class="sec-body">'+
    door('mind','Mind',s.mind)+door('body','Body',s.body)+door('money','Money',s.money)+
    door('firm','The Firm',s.firm)+door('places','Places',s.places)+door('review','Reviews',s.review)+'</div></section>';
}
function renderHub(){
  const el = $('insightsHub'); if(!el) return;
  el.innerHTML = hubChangedHTML() + hubObsHTML() + hubDoorsHTML();
}
// behind the doors: the blocks of the old page, each in the room it belongs to
function renderDoors(){
  const stateHTML = (title, text) => '<div class="sec-body"><div class="empty-state"><div class="es-title">'+title+'</div><div class="es-text">'+text+'</div>'+
    (SUPA && SUPA.session ? '' : '<button class="btn sm secondary" onclick="showView(\'set-account\')">Account and sync</button>')+'</div></div>';
  const head = (t, meta) => '<div class="section-head" style="margin-top:22px"><h2>'+t+'</h2>'+(meta ? '<span class="action" style="cursor:default">'+meta+'</span>' : '')+'</div>';
  const cards = kind => TRENDS.filter(m => (m.kind === 'checkin') === (kind === 'mind')).map(trendCardHTML).filter(Boolean);
  let el = $('mindExtra');
  if(el){ const pat = patternInsights(), tc = cards('mind');
    el.innerHTML = (tc.length ? head('Trends','last 30 days') + tc.join('') : '') +
      (pat.length ? head('Patterns in your data') + pat.map(insightCardHTML).join('') : ''); }
  el = $('bodyExtra');
  if(el){ const hi = healthInsights(), tc = cards('body');
    el.innerHTML = (tc.length ? head('Trends','last 30 days') + tc.join('') : '') + head('Signals') +
      (hi.length ? hi.map(insightCardHTML).join('')
        : '<div class="empty">'+(healthDepth() >= 14
          ? 'Nothing out of the ordinary in your numbers right now. Signals speak up when something moves — a jump in resting heart rate, a short night, a week of better sleep.'
          : 'Sync a few days from Apple Health and trends show up here.')+'</div>'); }
  el = $('moneyBody');
  if(el) el.innerHTML = moneyPanelHTML() || stateHTML('No spending to show yet', 'Money comes from your budget, through your account. It appears here once this phone is signed in and the first sync has run.');
  el = $('firmBody');
  if(el) el.innerHTML = workHTML() || stateHTML('No firm report yet', 'The firm’s hours, billing and year-to-date figures arrive with each report, through your account.');
}
function renderInsightsView(){
  loadLife(false);
  if($('tiles')) $('tiles').innerHTML = tilesHTML(DB.stats[today()]||{});
  renderHub(); renderDoors();
}
