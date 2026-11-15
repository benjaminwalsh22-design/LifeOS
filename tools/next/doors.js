// ---------- behind the Insights doors: Mind, Body, Money, The Firm ----------
// Same data and sums as before. One chart (dsChart), one small sparkline, the
// data voice throughout; anything written by a model keeps its own panel.
const dayLabel = d => { const x = parseD(String(d).slice(0,10)); return isNaN(x) ? String(d) : MON[x.getMonth()]+' '+x.getDate()+', '+x.getFullYear(); };
function sparkSVG(vals, color){
  const n = vals.length, W = 72, H = 28, pad = 4;
  const nn = vals.map((o,i) => ({ i:i, v:o.v })).filter(o => o.v != null);
  if(nn.length < 2) return '';
  const mn = Math.min.apply(null, nn.map(o => o.v)), mx = Math.max.apply(null, nn.map(o => o.v));
  const X = i => 3+(i/(n-1))*(W-6), Y = v => mx === mn ? H/2 : pad+(1-(v-mn)/(mx-mn))*(H-2*pad);
  const last = nn[nn.length-1];
  return '<svg class="spark" viewBox="0 0 '+W+' '+H+'" aria-hidden="true"><polyline points="'+nn.map(o => X(o.i).toFixed(1)+','+Y(o.v).toFixed(1)).join(' ')+'" style="stroke:'+(color||'var(--c1)')+'"/>'+
    '<circle cx="'+X(last.i).toFixed(1)+'" cy="'+Y(last.v).toFixed(1)+'" r="2.4" style="fill:'+(color||'var(--c1)')+'"/></svg>';
}
// the last seven readings against the seven before, as the old trend cards worked it out
function weekOf(m){
  const vals = trendSeries(m.kind || 'stat', m.key, 30, m.zero), nz = vals.filter(o => o.v != null).map(o => o.v);
  const m7 = nz.length >= 3 ? mean(nz.slice(-7)) : null, mp = nz.slice(-14, -7).length ? mean(nz.slice(-14, -7)) : null;
  return { vals:vals, n:nz.length, latest:nz.length ? nz[nz.length-1] : null, m7:m7, mp:mp };
}
function weekSubHTML(m, w){
  if(w.m7 == null) return '';
  let d = '';
  if(w.mp != null && Math.abs(w.m7 - w.mp) >= 0.05){ const up = w.m7 > w.mp, good = (m.goodUp !== false) ? up : !up;
    d = ' <span class="delta '+(good ? 'good' : 'bad')+'">'+(up ? 'up' : 'down')+'</span>'; }
  return '<div class="chg-s">7-day '+esc(trendFmt(m, w.m7))+d+'</div>';
}

// ---- Body: today's numbers, one row each (label, where it came from, the last 30 days, the value)
function tileRowHTML(tl, st, t, idx){
  let raw = st[tl.key]; let has = raw != null && raw !== ''; let stale = null;
  if(!has && tl.carry > 0){
    const p = idx[tl.key];
    if(p && daysApart(p.day, t) <= tl.carry){ raw = p.val; has = true; stale = agoLabel(p.day, t); }
  }
  const disp = has ? (tl.fmt === 'int' ? Number(raw).toLocaleString()
    : tl.fmt === 'usd' ? '$' + Number(raw).toLocaleString(undefined,{maximumFractionDigits:0})
    : tl.fmt === 'signed' ? (Number(raw) > 0 ? '+' : '') + Number(raw).toFixed(2)
    : tl.fmt === 'clock' ? clockOf(Number(raw))
    : esc(String(raw))) : null;
  const via = tl.src === 'health' ? 'via Apple Health' : tl.src === 'oura' ? 'via Oura' : tl.src === 'ynab' ? 'via YNAB' : tl.hint;
  const hint = stale ? stale : has ? via : (tl.src === 'manual' ? tl.hint : 'nothing yet today');
  const m = trendMeta(tl.key), w = weekOf(m), wk = weekSubHTML(m, w);
  return '<div class="row stat-row" onclick="editTile(\''+tl.key+'\')"><div class="row-main"><div class="row-title">'+tl.label+'</div>'+
    '<div class="row-sub'+(stale ? ' stale' : '')+'">'+esc(hint)+'</div></div>'+
    sparkSVG(w.vals)+
    '<div class="chg"><div class="chg-v'+(stale ? ' stale' : '')+'">'+(has ? disp+(tl.unit ? '<span class="unit">'+tl.unit+'</span>' : '') : '<span class="none">—</span>')+'</div>'+wk+'</div></div>';
}
function tilesHTML(st, day){
  const t = day || today(), idx = statIndex(t);
  return TILES.filter(tl => tl.key !== 'budget' && (tl.always || idx[tl.key])).map(tl => tileRowHTML(tl, st, t, idx)).join('') + cycleTileHTML();
}
function cycleTileHTML(){
  const c = CYCLE.t; if(!c) return '';
  const ph = PHASE_LABEL[c.phase] || c.phase;
  const hint = c.phase === 'unknown' ? 'tap when her period starts'
    : ph + (c.phase_est ? ' · est.' : '') + (c.source === 'manual' ? ' · from your tap' : ' · via Natural Cycles');
  return '<div class="row stat-row" onclick="editTile(\'cycle\')"><div class="row-main"><div class="row-title">Annalise</div><div class="row-sub">'+esc(hint)+'</div></div>'+
    '<div class="chg"><div class="chg-v">'+(c.cycle_day ? 'Day '+c.cycle_day : '<span class="none">—</span>')+'</div></div></div>';
}
// measures that have a trend but no daily tile
function trendRowHTML(m){
  const w = weekOf(m); if(w.n < 3 || !sparkSVG(w.vals)) return '';
  const tap = m.kind === 'stat' ? ' onclick="openTrend(\''+m.key+'\')"' : '';
  return '<div class="row stat-row"'+tap+'><div class="row-main"><div class="row-title">'+esc(m.label)+'</div>'+
    '<div class="row-sub">'+w.n+' days logged</div></div>'+sparkSVG(w.vals)+
    '<div class="chg"><div class="chg-v">'+esc(trendFmt(m, w.latest))+'<span class="unit">'+esc(m.unit||'')+'</span></div>'+weekSubHTML(m, w)+'</div></div>';
}
function renderBody(){
  const el=$('bodyCard'); if(!el) return;
  const rows=bodyDays();
  const head='<div class="sec-h"><h2>Body composition</h2>'+(rows.length>=2 ? '<span class="meta num">'+rows.length+' weigh-ins</span>' : '')+'</div>';
  if(rows.length<2){
    el.innerHTML='<section class="sec">'+head+'<div class="sec-body"><div class="empty-state"><div class="es-title">'+(rows.length ? 'One weigh-in so far' : 'No weigh-ins yet')+'</div>'+
      '<div class="es-text">'+(rows.length ? 'A trend needs a few more.' : 'Weigh-ins appear here once Apple Health is connected. Settings has the link.')+'</div></div></div></section>';
    return;
  }
  const last=rows[rows.length-1];
  const one=(key, name, unit, color)=>{ const vals=roll(rows,key,7);
    const pts=rows.map((r,i)=>({ label:dayLabel(r.d), v:vals[i] })).filter(p=>p.v!=null);
    if(pts.length<2) return '';
    const delta=pts[pts.length-1].v-pts[0].v;
    return '<div class="chart-block"><div class="chart-name"><i style="background:'+color+'"></i>'+name+'<span class="meta num">'+(delta>=0?'+':'−')+Math.abs(delta).toFixed(1)+unit+' since '+esc(pts[0].label)+'</span></div>'+
      dsChart(pts, { unit:unit, color:color, label:name+', 7-day average', h:112 })+'</div>'; };
  el.innerHTML='<section class="sec">'+head+'<div class="sec-body">'+one('w','Weight',' lb','var(--c1)')+one('f','Body fat',' %','var(--c2)')+
    '<div class="data-fresh chart-note">7-day average. Weight is measured; body fat is the scale’s estimate and moves a point or two on hydration alone.'+
    (last.b!=null ? ' BMI today <b class="num">'+last.b.toFixed(1)+'</b>.' : '')+'</div></div></section>';
}

// ---- Mind
function renderMood(){
  const el=$('moodCard'); if(!el) return;
  const all=moodScored();
  const total=(DB.journal||[]).filter(j=>j.status==='done'&&(j.transcription||j.summary)).length;
  const head='<div class="sec-h"><h2>Mood over time</h2><span class="meta num">'+all.length.toLocaleString()+' of '+total.toLocaleString()+' scored</span></div>';
  if(all.length < 5){
    el.innerHTML='<section class="sec">'+head+'<div class="sec-body"><div class="empty-state"><div class="es-title">'+(all.length ? 'Scoring your journal' : 'Nothing scored yet')+'</div><div class="es-text">'+
      (all.length ? all.length+' of '+total+' entries so far. The chart appears once there is enough to draw.'
        : 'Every journal entry is scored for happiness and anxiety on the same 1 to 10 scale as your check-ins. This fills in as it runs.')+'</div></div></div></section>';
    return;
  }
  const ms=moodMonths(), ys=moodYears(), R=MOOD_RANGES[MOODV.range]||MOOD_RANGES.all;
  const inRange = ms.reduce((n,m)=>n+m.n,0);
  const avg=k=>ms.reduce((s,m)=>s+m[k]*m.n,0)/Math.max(1,inRange);
  const best=[...ms].sort((a,b)=>b.hap-a.hap)[0], worst=[...ms].sort((a,b)=>a.hap-b.hap)[0];
  const unit = R.daily ? 'day' : 'month';
  const short = { all:'All', '5y':'5 years', '1y':'Year', '90d':'Quarter', '30d':'Month' };
  const seg = ['all','5y','1y','90d','30d'].map(k=>'<button class="'+(MOODV.range===k?'on':'')+'" onclick="MOODV.range=\''+k+'\';renderMood()">'+short[k]+'</button>').join('');
  const one=(k, name, color)=>'<div class="chart-block"><div class="chart-name"><i style="background:'+color+'"></i>'+name+'</div>'+
    dsChart(ms.map(m=>({ label:fmtYM(m.ym), v:m[k] })), { color:color, label:name+' over time', h:112, fmt:v=>v.toFixed(1) })+'</div>';
  const stat=(l, v, s)=>'<div><div class="stat-label">'+l+'</div><div class="stat-value">'+v+'</div><div class="stat-fresh">'+esc(s)+'</div></div>';
  el.innerHTML='<section class="sec">'+head+'<div class="segc mood-seg">'+seg+'</div>'+
    '<div class="sec-body">'+one('hap','Happiness','var(--c1)')+one('anx','Anxiety','var(--c2)')+'</div>'+
    '<div class="sec-body stats mood-stats2">'+stat('Happiness', avg('hap').toFixed(1), R.sub)+stat('Anxiety', avg('anx').toFixed(1), R.sub)+
      (best ? stat('Best '+unit, best.hap.toFixed(1), fmtYM(best.ym)) : '')+(worst ? stat('Hardest', worst.hap.toFixed(1), fmtYM(worst.ym)) : '')+'</div></section>'+
    '<section class="sec"><div class="sec-h"><h2>Year by year</h2><span class="meta">average happiness</span></div><div class="sec-body">'+
      ys.map(r=>'<div class="yr-row"><span class="yr-l num">'+r.y+'</span><span class="bar"><i style="width:'+Math.round(r.hap/10*100)+'%"></i></span><span class="yr-v num">'+r.hap.toFixed(1)+'</span></div>').join('')+
    '</div></section>';
}
function renderCheckin(){
  const el = $('ckCard'); if (!el) return;
  const c = DB.checkins[today()], btn = $('ckOpen');
  if(btn) btn.textContent = c ? 'Edit' : 'Check in';
  if (!c){
    el.innerHTML = '<div class="sec-body" onclick="openCheckin()"><div class="empty-state"><div class="es-title">Not logged yet today</div>'+
      '<div class="es-text">Sixty seconds: mood, people, work, selfcare.</div></div></div>';
    return;
  }
  const a = ckAnx(c), h = ckHap(c), a7 = last7(ckAnx), h7 = last7(ckHap);
  const fmt = v => v == null ? '—' : (Math.round(v*10)/10);
  const stat=(l, v, s)=>'<div><div class="stat-label">'+l+'</div><div class="stat-value">'+v+'</div><div class="stat-fresh">'+s+'</div></div>';
  el.innerHTML = '<div class="sec-body stats mood-stats2" onclick="openCheckin()">'+
    stat('Happiness', fmt(h), 'today')+stat('Anxiety', fmt(a), 'today')+stat('Happiness', fmt(h7), '7-day average')+stat('Anxiety', fmt(a7), '7-day average')+'</div>';
}

// ---- Money
function moneyDoorHTML(){
  const d = LIFE.digest; if(!d || !d.money) return '';
  const m = d.money, now = m.month_to_date||{}, typ = m.typical_same_window||{};
  const mtd = Number(m.mtd_total)||0, tot = Number(m.typical_total)||0;
  const dayN = new Date().getDate();
  const pct = tot ? Math.round(100*mtd/tot) : null;
  const keys = [...new Set([...Object.keys(now), ...Object.keys(typ)])]
    .sort((a,b) => (Number(typ[b])||0)+(Number(now[b])||0) - ((Number(typ[a])||0)+(Number(now[a])||0)));
  const max = Math.max(1, ...keys.map(k => Math.max(Number(now[k])||0, Number(typ[k])||0)));
  const through = m.settled_through || '', pending = Number(m.days_still_posting)||0;
  const wk = Number(m.last_settled_week)||0, wkTyp = Number(m.typical_week)||0;
  const settledDay = through ? Number(String(through).slice(8,10)) : dayN;
  const hero = pct == null ? '' : '<div class="sec-body money-hero"><div class="eyebrow">Spent this month, through the '+ord(settledDay)+'</div>'+
    '<div class="hero-num">'+money0(mtd)+'</div>'+
    '<div class="data-line">A typical month reaches '+money0(tot)+' by then. You are <span class="delta '+(pct < 100 ? 'good">'+(100-pct)+'% under' : 'bad">'+(pct-100)+'% over')+'</span> that pace.</div>'+
    (wk ? '<div class="data-line">Last settled week <b class="num">'+money0(wk)+'</b>'+(wkTyp ? ' <span class="unit">against '+money0(wkTyp)+' in a usual week</span>' : '')+'</div>' : '')+
    (pending > 0 ? '<div class="data-fresh">The bank takes a few days to report. '+pending+' day'+(pending===1?'':'s')+' since the '+ord(settledDay)+' '+(pending===1?'is':'are')+' still posting and '+(pending===1?'is':'are')+' not counted above.</div>' : '')+'</div>';
  const rows = keys.slice(0,7).map(k => { const a = Number(now[k])||0, b = Number(typ[k])||0;
    return '<div class="cat-row"><span class="cat-l">'+esc(k === 'day' ? 'Day-to-day' : k.charAt(0).toUpperCase()+k.slice(1))+'</span>'+
      '<span class="cat-bars"><span class="bar"><i style="width:'+(100*a/max).toFixed(1)+'%"></i></span><span class="bar typ"><i style="width:'+(100*b/max).toFixed(1)+'%"></i></span></span>'+
      '<span class="cat-v num">'+money0(a)+'</span></div>'; }).join('');
  const items = (m.biggest_this_month||[]).slice(0,5).map(x =>
    '<div class="row"><div class="row-main"><div class="row-title">'+esc(String(x.payee||'').replace(/^Transfer : /,''))+'</div><div class="row-sub">'+esc(x.cat||'')+'</div></div>'+
    '<span class="row-end num money-amt">'+money0(x.amt)+'</span></div>').join('');
  const idx = statIndex(today()), bt = TILES.find(t => t.key === 'budget');
  return '<section class="sec"><div class="sec-h"><h2>This month</h2><span class="meta num">as of '+esc(shortDay(d.as_of||''))+'</span></div>'+hero+'</section>'+
    (bt ? '<section class="sec"><div class="sec-body">'+tileRowHTML(bt, DB.stats[today()]||{}, today(), idx)+'</div></section>' : '')+
    (rows ? '<section class="sec"><div class="sec-h"><h2>Where it went</h2></div><div class="sec-body">'+rows+
      '<div class="cat-key"><span><i></i>this month</span><span><i class="typ"></i>typical by the '+ord(settledDay)+'</span></div></div></section>' : '')+
    (items ? '<section class="sec"><div class="sec-h"><h2>Largest this month</h2></div><div class="sec-body">'+items+'</div></section>' : '');
}

// ---- The Firm
function firmDoorHTML(){
  const w = LIFE.digest && LIFE.digest.work;
  if(!w || (!w.latest && !w.last_narrative)) return '';
  const days = (w.days||[]).slice().reverse();      // oldest first for the chart
  const L = w.latest || {}, M = L.metrics || {};
  const ytd = (w.ytd && w.ytd.metrics) || {};
  const num = v => v == null ? null : Number(v);
  const hs = days.filter(d => num(d.hours) != null);
  const tiles = [
    ['Hours', M.hours != null ? M.hours : null],
    ['Billable', M.billable_hours != null ? M.billable_hours : null],
    ['Billed', M.billed != null ? money0(M.billed) : null],
    ['Open matters', M.matters_open != null ? M.matters_open : null],
  ].filter(c => c[1] != null);
  const saved = ['retirement_ytd','defined_benefit_ytd'].reduce((a,k)=> a + (num(ytd[k])||0), 0);
  const ytdRow = [
    ['Revenue', ytd.revenue_ytd], ['Owner comp', ytd.owner_comp_ytd],
    ['Retirement', ytd.retirement_ytd], ['Defined benefit', ytd.defined_benefit_ytd],
    ['SDE', ytd.sde_ytd],
  ].filter(c => c[1] != null);
  return '<section class="sec"><div class="sec-h"><h2>Latest report</h2>'+(L.period_end ? '<span class="meta num">through '+esc(shortDay(L.period_end))+'</span>' : '')+'</div>'+
      (tiles.length ? '<div class="sec-body stats mood-stats2">'+tiles.map(c => '<div><div class="stat-label">'+esc(c[0])+'</div><div class="stat-value">'+esc(String(c[1]))+'</div></div>').join('')+'</div>' : '')+'</section>'+
    (hs.length >= 3 ? '<section class="sec"><div class="sec-h"><h2>Hours a day</h2><span class="meta num">last '+hs.length+' reported</span></div><div class="sec-body">'+
      dsChart(hs.map(d => ({ label:d.d ? shortDay(d.d) : '', v:num(d.hours) })), { unit:' h', label:'Hours worked a day', h:112 })+'</div></section>' : '')+
    (w.last_narrative ? '<section class="sec"><div class="ai">'+aiLabel('From the last report')+'<p class="ai-body">'+esc(w.last_narrative)+'</p></div></section>' : '')+
    (ytdRow.length ? '<section class="sec"><div class="sec-h"><h2>Year to date</h2></div><div class="sec-body">'+ytdRow.map(c =>
        '<div class="row"><div class="row-main"><div class="row-title plain">'+esc(c[0])+'</div></div><span class="row-end num money-amt">'+money0(c[1])+'</span></div>').join('')+
        (saved ? '<div class="row"><div class="row-main"><div class="row-title">Saved at the firm</div><div class="row-sub">never reaches the household budget</div></div><span class="row-end num money-amt good">'+money0(saved)+'</span></div>' : '')+
      '</div></section>' : '');
}

// ---- what fills the rooms
function renderDoors(){
  const stateHTML = (title, text) => '<div class="sec-body"><div class="empty-state"><div class="es-title">'+title+'</div><div class="es-text">'+text+'</div>'+
    (SUPA && SUPA.session ? '' : '<button class="btn sm secondary" onclick="showView(\'set-account\')">Account and sync</button>')+'</div></div>';
  const signalRows = list => '<div class="sec-body">'+list.map(noticedRowHTML).join('')+'</div>';
  let el = $('mindExtra');
  if(el){ const pat = patternInsights(), tr = TRENDS.filter(m => m.kind === 'checkin').map(trendRowHTML).filter(Boolean);
    el.innerHTML = (tr.length ? '<section class="sec"><div class="sec-h"><h2>Check-in trends</h2><span class="meta">last 30 days</span></div><div class="sec-body">'+tr.join('')+'</div></section>' : '') +
      (pat.length ? '<section class="sec"><div class="sec-h"><h2>Patterns in your data</h2></div>'+signalRows(pat)+'</section>' : ''); }
  el = $('bodyExtra');
  if(el){ const hi = healthInsights(), tiled = {}; TILES.forEach(t => { tiled[t.key] = 1; });
    const tr = TRENDS.filter(m => m.kind === 'stat' && !tiled[m.key]).map(trendRowHTML).filter(Boolean);
    el.innerHTML = (tr.length ? '<section class="sec"><div class="sec-h"><h2>Also tracked</h2><span class="meta">last 30 days</span></div><div class="sec-body">'+tr.join('')+'</div></section>' : '') +
      '<section class="sec"><div class="sec-h"><h2>Signals</h2></div>'+
      (hi.length ? signalRows(hi)
        : '<div class="sec-body"><div class="empty-state"><div class="es-title">Nothing out of the ordinary</div><div class="es-text">'+(healthDepth() >= 14
          ? 'Signals speak up when something moves: a jump in resting heart rate, a short night, a week of better sleep.'
          : 'Sync a few days from Apple Health and trends show up here.')+'</div></div></div>')+'</section>'; }
  el = $('moneyBody');
  if(el) el.innerHTML = moneyDoorHTML() || stateHTML('No spending to show yet', 'Money comes from your budget, through your account. It appears here once this phone is signed in and the first sync has run.');
  el = $('firmBody');
  if(el) el.innerHTML = firmDoorHTML() || stateHTML('No firm report yet', 'The firm’s hours, billing and year-to-date figures arrive with each report, through your account.');
}

// ---- one measure over time: the sheet a number opens
function openTrend(key, range){
  TRENDV.key=key; if(range) TRENDV.range=range;
  const m=trendMeta(key), pts=trendPoints(key, TRENDV.range);
  const vs=pts.map(p=>p.v), avg=mean(vs);
  const half=Math.floor(pts.length/2), recent=mean(vs.slice(half)), earlier=half?mean(vs.slice(0,half)):null;
  const best=pts.length?pts.reduce((a,b)=>b.v>a.v?b:a):null, low=pts.length?pts.reduce((a,b)=>b.v<a.v?b:a):null;
  const unitTxt=(m.unit||'').trim(), per=TRENDV.range.replace(/s$/,'');
  const seg=Object.keys(TREND_RANGES).map(k=>'<button class="'+(TRENDV.range===k?'on':'')+'" onclick="openTrend(\''+key+'\',\''+k+'\')">'+TREND_RANGES[k].label+'</button>').join('');
  const stat=(l, v, s)=>'<div><div class="stat-label">'+l+'</div><div class="stat-value">'+v+'</div><div class="stat-fresh">'+esc(s)+'</div></div>';
  let moved='';
  if(earlier!=null && Math.abs(recent-earlier)>=0.05){ const up=recent>earlier, good=(m.goodUp!==false)?up:!up; moved=' <span class="delta '+(good?'good':'bad')+'">'+(up?'up':'down')+'</span>'; }
  openSheet('<h3>'+esc(m.label)+'</h3><div class="segc">'+seg+'</div>'+
    '<div class="sheet-chart">'+dsChart(pts.map(p=>({ label:p.label, v:p.v })), { color:'var(--c1)', label:m.label+' over time', h:150, fmt:v=>trendFmt(m,v)+(m.unit||''),
      emptyText:'Not enough readings in this range yet.' })+'</div>'+
    (pts.length?'<div class="stats sheet-stats">'+
      stat('Average', esc(trendFmt(m,avg))+'<span class="unit">'+esc(unitTxt)+'</span>', pts.length+' '+per+(pts.length===1?'':'s'))+
      stat('Recent half', esc(trendFmt(m,recent))+moved, earlier!=null?('earlier half '+trendFmt(m,earlier)):'')+
      (best?stat('Highest', esc(trendFmt(m,best.v)), best.label):'')+
      (low?stat('Lowest', esc(trendFmt(m,low.v)), low.label):'')+'</div>':'')+
    '<button class="btn secondary" onclick="logTile(\''+key+'\')">Log a value for today</button>');
}
