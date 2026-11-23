// ---------- Goals (redesigned): what is in season on top, life goals beneath ----------
function seasonStudyRowHTML(){
  if(typeof QFK === 'undefined' || today() > QFK.exam) return '';
  const left=daysBetween(today(),QFK.exam), nights=studyLast7(), tonight=studyTonight();
  return '<div class="season-study" onclick="showView(\'study\')"><span class="hero-num">'+(left>0?left:'0')+'</span><div class="row-main">'+
    '<div class="row-title">Quest for Knowledge, '+(left>0?left+' day'+(left===1?'':'s')+' to the test':'test day')+'</div>'+
    '<div class="row-sub">Tonight '+esc(subName(tonight))+' · '+nights+' of the last 7 nights studied</div></div><span class="row-chev">'+CHEV+'</span></div>';
}
function renderSprint(el){
  const T=DB.twy, S=sprintDays();
  const hits=T.goals.filter(sprintHit).length;
  const past=DB.twyPast&&DB.twyPast.fall2026;
  let h='<section class="sec"><div class="sec-h"><h2>'+esc(T.name)+' sprint</h2>'+
    '<span class="meta num">'+(!S.started?('starts '+fmtDate(T.start)):S.over?'complete':('day '+S.day+' of '+S.total+' · '+S.left+' left'))+'</span></div><div class="sec-body">';
  h+=T.goals.map(g=>{
    const hit=sprintHit(g);
    let right, sub=g.sub, bar='';
    if(g.type==='count'){
      const n=sprintCount(g), pace=S.started?Math.ceil(g.target*S.day/S.total):0;
      right=n+'/'+g.target;
      const last=sprintDaysDone(g).slice(-1)[0], ring=sprintRingDays(g).length;
      if(!hit && S.started) sub=(n>=pace?'on pace':('behind — pace is '+pace+' by today'))+(last?(' · last '+fmtDate(last).slice(5)):'')+(ring?(' · '+ring+' from the ring'):' · tap to add one');
      bar='<div class="bar count-bar"><i class="'+(hit?'good':(n<pace?'watch':''))+'" style="width:'+Math.min(100,Math.round(n/g.target*100))+'%"></i></div>';
    } else {
      const dl=g.due?daysBetween(today(),g.due):null;
      right=hit?'done':(g.due?(dl>=0?(dl+(dl===1?' day':' days')):'past'):'—');
      if(hit) sub='done '+fmtDate(g.done);
    }
    return '<div class="count-row'+(hit?' hit':'')+'" onclick="sprintTap(\''+g.k+'\',1)" oncontextmenu="event.preventDefault();sprintTap(\''+g.k+'\',-1)">'+
      '<span class="count-mark">'+(hit?IC_CHECK:(g.type==='count'?sprintCount(g):''))+'</span>'+
      '<div class="row-main"><div class="row-title">'+esc(g.label)+'</div>'+(sub?'<div class="row-sub">'+esc(sub)+'</div>':'')+bar+'</div>'+
      '<span class="count-n" onclick="event.stopPropagation();sprintTap(\''+g.k+'\',-1)">'+esc(right)+'</span></div>';
  }).join('');
  h+='<div class="count-foot"><span>'+hits+' of '+T.goals.length+' done'+(T.goals.some(g=>g.type==='count')?' · long-press a row to undo':'')+'</span><b class="num'+(hits===T.goals.length?' good':'')+'">'+hits+'/'+T.goals.length+'</b></div>';
  h+='</div>'+seasonStudyRowHTML();
  if(past){
    const wk=past.weeks||{}, scored=Object.keys(wk).filter(k=>Object.keys(wk[k].c||{}).length).length;
    const avg=scored?Math.round(Object.keys(wk).reduce((a,k)=>a+(past.tactics.filter(t=>((wk[k].c||{})[t.k]||0)>=t.t).length),0)/scored/past.tactics.length*100):0;
    h+='<div class="data-fresh season-past">'+esc(past.name)+' 12 Week Year stopped at week '+Math.max(1,Math.min(12,Math.floor((parseD(past.endedEarly||today())-parseD(past.start))/(7*86400000))+1))+' · '+scored+' weeks scored, '+avg+'% average. The next twelve weeks start in January.</div>';
  }
  el.innerHTML=h+'</section>';
}
function renderTWY(){
  const el=$('twyBody'); if(!el) return;
  if(!DB.twy){ el.innerHTML=''; return; }
  if(isSprint()) return renderSprint(el);
  const T=DB.twy, today_=today();
  const curW=twyWeekOf(today_);
  if(TWYV.wk===null) TWYV.wk=Math.min(12, Math.max(1, curW));
  const n=TWYV.wk, [ws,we]=twyWeekDates(n);
  const w=(T.weeks||{})['w'+n]||{c:{},note:''};
  const hits=twyHits(n), score=Math.round(hits/T.tactics.length*100);
  const notStarted=curW<1, over=curW>12;
  let strip='';
  for(let i=1;i<=12;i++){
    const h=twyHits(i), scored=Object.keys((T.weeks||{})['w'+i]?.c||{}).length>0;
    let cls=''; if(i<curW || (scored&&i!==curW)) cls=h>=8?' hit':h>=7?' miss':scored||i<curW?' low':'';
    if(i===n) cls+=' cur';
    strip+='<button class="wk'+cls+'" onclick="TWYV.wk='+i+';renderTWY()" aria-label="Week '+i+'">'+i+'</button>';
  }
  // the week's counts that the app can see for itself (sleep, food) are kept up to date here, as before
  if(!notStarted && n<=Math.max(1,curW)){
    const wk=twyWk(n); const wd=twyWeekDates(n);
    const M=DB.settings.macros||{p:150,f:30,s:25};
    let cnt=0,sum=0,days=0,cC=0,cD=0;
    for(let d=parseD(wd[0]); dstr(d)<=wd[1]; d.setDate(d.getDate()+1)){
      const ds=dstr(d);
      const s=(DB.stats||{})[ds]; const v=s&&Number(s.sleep);
      if(v){ days++; sum+=v; if(v>=7) cnt++; }
      if(s && s.protein!=null){
        if(Number(s.protein)>=M.p && Number(s.fiber||0)>=M.f) cC++;
        if(Number(s.kcal||0)>0 && Number(s.sugar||0)<M.s) cD++;
      }
    }
    let dirty=false;
    if(cnt>(wk.c.A||0)){ wk.c.A=cnt; dirty=true; }
    if(cC>(wk.c.C||0)){ wk.c.C=cC; dirty=true; }
    if(cD>(wk.c.D||0)){ wk.c.D=cD; dirty=true; }
    const avg=days?Math.round(sum/days*10)/10:null;
    if(avg!=null && wk.slp!==avg){ wk.slp=avg; dirty=true; }
    if(dirty){ wk.mt=Date.now(); save(); }
  }
  const fr=twyFriendTouches(n);
  let h='<section class="sec"><div class="sec-h"><h2>12 Week Year · '+esc(T.name)+'</h2>'+
    '<span class="meta">'+(notStarted?('starts '+fmtDate(T.start)):over?'complete':twyPhase(curW))+'</span></div><div class="sec-body">';
  h+='<div class="wk-head"><b>Week '+n+' of 12</b><span class="meta num">'+fmtDate(ws)+' – '+fmtDate(we)+' · '+twyPhase(n)+'</span></div>';
  h+='<div class="wk-strip">'+strip+'</div>';
  if(n===12) h+='<div class="data-fresh wk-note">Sprint finish: work ends Thu Nov 12, Kauai on the 13th. The trip is the reward.</div>';
  h+=T.tactics.map(t=>{
    const c=w.c[t.k]||0, hit=c>=t.t;
    const sub=t.k==='H'&&fr>c ? (fr+' logged in People this week, tap to count') : t.sub;
    return '<div class="count-row'+(hit?' hit':'')+'" onclick="twyTap(\''+t.k+'\',1)" oncontextmenu="event.preventDefault();twyTap(\''+t.k+'\',-1)">'+
      '<span class="count-mark">'+(hit?IC_CHECK:t.k)+'</span>'+
      '<div class="row-main"><div class="row-title">'+esc(t.label)+'</div>'+(sub?'<div class="row-sub">'+esc(sub)+'</div>':'')+'</div>'+
      '<span class="count-n" onclick="event.stopPropagation();twyTap(\''+t.k+'\',-1)">'+c+'/'+t.t+'</span></div>';
  }).join('');
  h+='<div class="count-foot"><span>'+hits+' of '+T.tactics.length+' tactics hit · target 80%</span><b class="num'+(score>=80?' good':score>=70?' watch':'')+'">'+score+'%</b></div>';
  h+='<div class="field wk-field"><input placeholder="What happened this week" value="'+esc(w.note||'')+'" onchange="twySetNote(this.value)"></div>';
  h+='</div></section>';
  el.innerHTML=h;
}
// ---------- Goals: a few goals that count themselves ----------
// A goal has a shape. 'weekly' is an action counted per week (gym twice, seven hours of sleep on
// five nights), with an optional result such as weight. 'long' is a number moved over years and
// looked at monthly. 'list' is a set of things to tick, never scored. Goals made before this
// version keep every field they had (kind, current, target, updates, milestones) and gain a
// shape and a state; nothing is removed.
const GOAL_CAP = 3;                 // weekly goals in play at once
const GOAL_SRC = { tap:'Marked by you', sleep7:'Counted by the ring: nights of seven hours or more', gym:'Counted by the ring when it sees a strength session, and by your taps' };
const goalShape = g => g.shape || (g.kind==='milestones' ? 'list' : 'long');
const goalActive = g => (g.state||'active')==='active';
const goalsWeekly = () => (DB.goals||[]).filter(g => goalActive(g) && goalShape(g)==='weekly');
function goalsUpgrade(){
  DB.goals = DB.goals || [];
  const now = Date.now(); let dirty = false;
  // the set-up chosen on 23 Nov 2026: weight with the gym as its action, sleep, date night
  const mine = DB.goals.find(g => /^lose 15 pounds$/i.test(String(g.name||'').trim()));
  if(mine && !DB.settings.goals2){
    Object.assign(mine, { shape:'weekly', state:'active', act:{ label:'Gym', n:2, src:'gym', days:[], off:[] }, resSrc:'weight', since:today(), mt:now });
    const add = g => { if(!DB.goals.some(x => x.id===g.id) && !(DB.tomb||{})[g.id]) DB.goals.push(Object.assign({ why:'', kind:'number', shape:'weekly', state:'active', updates:[], createdTs:now, since:today(), mt:now }, g)); };
    add({ id:'g2-sleep', name:'Seven hours of sleep', act:{ label:'Nights', n:5, src:'sleep7', days:[], off:[] } });
    add({ id:'g2-date', name:'Date night', act:{ label:'Date night', n:1, src:'tap', days:[], off:[] } });
    DB.settings.goals2 = 1; dirty = true;
  }
  DB.goals.forEach(g => { if(!g.shape){ g.shape = g.kind==='milestones' ? 'list' : 'long'; g.state = g.state || 'active'; g.mt = now; dirty = true; } });
  if(dirty){ try{ save(); }catch(e){} }
}
goalsUpgrade();

// ---- counting a weekly action ----
function goalWeekDays(ws){ const out=[], d=parseD(ws); for(let i=0;i<7;i++){ out.push(dstr(d)); d.setDate(d.getDate()+1); } return out; }
function goalAutoDay(g, d){
  const s=(DB.stats||{})[d]||{}, src=(g.act||{}).src;
  if(src==='sleep7') return Number(s.sleep)>=7;
  if(src==='gym') return Number(s.gym)>=15;
  return false;
}
// a day counts when the ring saw it or he marked it, unless he struck it
function goalDayOn(g, d){ const a=g.act||{}; if((a.off||[]).includes(d)) return false; return (a.days||[]).includes(d) || goalAutoDay(g, d); }
function goalWeek(g, ws){
  const days=goalWeekDays(ws), t=today(), on=days.map(d => d<=t && goalDayOn(g, d));
  const n=on.filter(Boolean).length, target=Math.max(1, Number((g.act||{}).n)||1);
  return { ws, days, on, n, target, hit:n>=target };
}
// the last n weeks, oldest first. One short week a month (one under the target) is covered by a spare.
function goalHistory(g, n){
  const cur=mondayOf(new Date()), since=g.since||today(), used={}, out=[];
  for(let i=n-1;i>=0;i--){
    const d=parseD(cur); d.setDate(d.getDate()-7*i);
    const w=goalWeek(g, dstr(d));
    if(w.days[6]<since) w.k='none';
    else if(w.hit) w.k='hit';
    else if(w.ws===cur) w.k='now';
    else if(w.n===w.target-1 && !used[w.ws.slice(0,7)]){ used[w.ws.slice(0,7)]=1; w.k='spare'; }
    else w.k='short';
    out.push(w);
  }
  return out;
}
function goalSpareFree(g, ws){ return !goalHistory(g, 6).some(w => w.k==='spare' && w.ws.slice(0,7)===ws.slice(0,7)); }
function goalStatus(g){
  const w=goalWeek(g, mondayOf(new Date())), t=today(), src=(g.act||{}).src;
  // can today still count? a night's sleep is settled once the ring has reported it
  const todayOpen = goalDayOn(g, t) ? 0 : (src==='sleep7' && ((DB.stats||{})[t]||{}).sleep!=null ? 0 : 1);
  const open=w.days.filter(d => d>t).length + todayOpen, need=w.target-w.n;
  if(need<=0) return { w, k:'good', label:'Done this week' };
  if(need<=open) return { w, k:'', label:'On pace' };
  const short=need-open;
  if(short===1 && goalSpareFree(g, w.ws)) return { w, k:'', label:'Spare week' };
  return { w, k:'watch', label: short===1 ? 'One behind' : short+' behind' };
}
function goalLastDay(g){
  for(let i=0;i<28;i++){ const d=new Date(); d.setDate(d.getDate()-i); const ds=dstr(d);
    if(goalDayOn(g, ds)) return { d:ds, auto: !((g.act||{}).days||[]).includes(ds) }; }
  return null;
}
// tap: count or uncount a day by hand (today unless a day is named)
function goalTap(id, d, fromSheet){
  const g=(DB.goals||[]).find(x => x.id===id); if(!g || !g.act) return;
  d = d || today(); if(d>today()) return;
  const a=g.act; a.days=a.days||[]; a.off=a.off||[];
  if(goalDayOn(g, d)){ if(a.days.includes(d)) a.days=a.days.filter(x => x!==d); else a.off.push(d); }
  else { a.off=a.off.filter(x => x!==d); if(!goalAutoDay(g, d)) a.days.push(d); }
  a.days.sort(); g.mt=Date.now(); g.lastProgressTs=Date.now(); save();
  if(fromSheet) openGoal(id);
  renderGoals(); if(typeof renderToday==='function' && currentView==='today') renderToday();
}

// ---- the result a goal is after (a weight, a balance) ----
function goalReadings(g){
  if(g.resSrc==='weight'){
    const out=[]; for(const d in (DB.stats||{})){ const v=Number((DB.stats[d]||{}).weight); if(v) out.push({ d, v }); }
    return out.sort((a,b) => a.d<b.d?-1:1);
  }
  return (g.updates||[]).map(u => ({ d:u.date, v:Number(u.value) })).filter(x => x.d && !isNaN(x.v));
}
function goalResult(g){
  if(g.target==null || g.target==='' || isNaN(Number(g.target))) return null;
  const r=goalReadings(g), last=r.length ? r[r.length-1] : null;
  const cur = last ? last.v : (g.current!=null && g.current!=='' ? Number(g.current) : null);
  return { cur, last, unit:g.unit||'', target:Number(g.target), start:(g.start!=null && g.start!=='') ? Number(g.start) : null, by:g.targetDate||'', readings:r };
}
const goalNum = (v, dp) => { if(v==null) return '—'; const k=Math.pow(10, dp==null ? 2 : dp); return String(Math.round(v*k)/k); };
const goalDay = d => { const x=parseD(d); return MON[x.getMonth()]+' '+x.getDate()+(x.getFullYear()!==new Date().getFullYear() ? ', '+x.getFullYear() : ''); };
// readings against the straight line from where he started to where he wants to be
function goalPaceSVG(g, r){
  const from = g.createdTs ? dstr(new Date(g.createdTs)) : (r.readings[0]||{}).d;
  if(!from || !r.by || r.start==null || r.by<=from) return '';
  const pts = r.readings.filter(p => p.d>=from && p.d<=today()); if(!pts.length) return '';
  const W=300, H=44, span=daysBetween(from, r.by), vals=[r.start, r.target].concat(pts.map(p => p.v));
  const lo=Math.min.apply(null, vals), hi=Math.max.apply(null, vals), pad=(hi-lo)*0.12 || 1;
  const X = d => 4 + Math.max(0, Math.min(1, daysBetween(from, d)/span))*(W-8), Y = v => 4 + (1-(v-(lo-pad))/((hi+pad)-(lo-pad)))*(H-8);
  const line = pts.map((p,i) => (i?'L':'M')+X(p.d).toFixed(1)+' '+Y(p.v).toFixed(1)).join('');
  const lastP = pts[pts.length-1];
  return '<svg class="g-pace" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">'+
    '<path d="M'+X(from).toFixed(1)+' '+Y(r.start).toFixed(1)+'L'+X(r.by).toFixed(1)+' '+Y(r.target).toFixed(1)+'" class="g-pace-plan"/>'+
    '<path d="'+line+'" class="g-pace-line"/><circle cx="'+X(lastP.d).toFixed(1)+'" cy="'+Y(lastP.v).toFixed(1)+'" r="3.5" class="g-pace-dot"/></svg>';
}
function goalResultHTML(g){
  const r=goalResult(g); if(!r) return '';
  const meta = (r.unit ? esc(r.unit)+' · ' : '')+'aiming for '+goalNum(r.target)+(r.by ? ' by '+esc(goalDay(r.by)) : '');
  return '<div class="g-result"><span class="hero-num">'+goalNum(r.cur, 1)+'</span><span class="g-unit">'+meta+'</span></div>'+goalPaceSVG(g, r)+
    '<div class="data-fresh g-fresh">'+(r.last ? (g.resSrc==='weight' ? 'From your scale · last reading ' : 'Last entered ')+esc(goalDay(r.last.d)) : (g.resSrc==='weight' ? 'No reading from your scale yet' : 'No reading yet'))+'</div>';
}

// ---- the Goals screen ----
function goalDots(n, target, k){
  let h=''; const tot=Math.max(target, n);
  for(let i=0;i<tot;i++) h+='<i class="g-dot'+(i<n ? (k==='good' ? ' on good' : ' on') : '')+'">'+(i<n ? IC_CHECK : '')+'</i>';
  return '<span class="g-dots" aria-hidden="true">'+h+'</span>';
}
function goalCardHTML(g){
  const st=goalStatus(g), w=st.w, a=g.act||{}, last=goalLastDay(g), counted=goalDayOn(g, today());
  return '<div class="g-card" onclick="openGoal(\''+g.id+'\')">'+
    '<div class="g-top"><span class="g-name">'+esc(g.name)+'</span><span class="status '+st.k+'">'+st.label+'</span></div>'+
    (g.why ? '<div class="g-why">'+esc(g.why)+'</div>' : '')+
    goalResultHTML(g)+
    '<div class="g-act"><span class="g-act-name">'+esc(a.label||'This week')+'</span>'+goalDots(w.n, w.target, st.k)+'<span class="g-act-n num">'+w.n+' of '+w.target+' this week</span></div>'+
    '<div class="g-ev"><span>'+(last ? '<b>'+esc(fmtDate(last.d))+'</b> <span class="g-src">'+(last.auto ? 'from the ring' : 'marked by you')+'</span>' : 'Nothing counted yet')+'</span>'+
      (a.src==='sleep7' ? '' : '<button class="btn sm secondary g-tap" onclick="event.stopPropagation();goalTap(\''+g.id+'\')">'+(counted ? 'Undo today' : 'Count today')+'</button>')+'</div>'+
  '</div>';
}
// "2.2 of 6.25 $M portfolio, by Jan 1, 2031": the unit once, the year when it is not this one
function goalLongText(g){
  const u=g.unit ? ' '+g.unit : '';
  return goalNum(Number(g.current)||0)+' of '+goalNum(Number(g.target)||0)+u+(g.targetDate ? ' · by '+goalDay(g.targetDate) : '');
}
function goalLongRowHTML(g){
  const p=goalPct(g), last=(g.updates||[]).slice(-1)[0], stale=last && last.date ? daysBetween(last.date, today())>31 : true;
  return '<div class="goal-row" onclick="openGoal(\''+g.id+'\')"><div class="goal-top"><span class="row-title">'+esc(g.name)+'</span>'+
      (p>=1 ? '<span class="status good">Reached</span>' : stale ? '<span class="status watch">Update due</span>' : '')+'</div>'+
    '<div class="row-sub">'+esc(goalLongText(g))+(last && last.date ? ' · updated '+esc(goalDay(last.date)) : '')+'</div>'+
    '<div class="bar goal-bar"><i style="width:'+Math.round(p*100)+'%"></i></div></div>';
}
function goalPlainRowHTML(g){
  const sh=goalShape(g), m=g.milestones||[];
  const sub = sh==='list' ? (m.filter(x => x.done).length+' of '+m.length+' ticked') : sh==='weekly' ? ((g.act||{}).label||'Weekly')+', '+((g.act||{}).n||1)+' a week' : goalLongText(g);
  return '<div class="row" onclick="openGoal(\''+g.id+'\')"><div class="row-main"><div class="row-title">'+esc(g.name)+'</div><div class="row-sub">'+esc(sub)+'</div></div><span class="row-chev">'+CHEV+'</span></div>';
}
function renderGoals(){
  renderTWY();          // the month's sprint and the study row keep their own section, beneath
  const el=$('goalList'); if(!el) return;
  const all=DB.goals||[], act=all.filter(goalActive);
  const weekly=act.filter(g => goalShape(g)==='weekly'), long=act.filter(g => goalShape(g)==='long'), lists=act.filter(g => goalShape(g)==='list');
  const parked=all.filter(g => g.state==='parked'), done=all.filter(g => g.state==='done');
  const eb=$('goalsEyebrow');
  if(eb) eb.textContent = weekly.length ? ('This week · '+weekly.filter(g => goalStatus(g).k==='good').length+' of '+weekly.length+' done') : '';
  if(!all.length){
    el.innerHTML='<div class="sec-body"><div class="empty-state"><div class="es-title">No goals yet</div><div class="es-text">Start with one thing you want to do each week. Where the ring can count it, it will; otherwise one tap does it.</div>'+
      '<button class="btn sm" onclick="editGoal(\'\')">Add your first goal</button></div></div>'; return; }
  const sec = (title, meta, rows) => rows.length ? '<section class="sec"><div class="sec-h"><h2>'+title+'</h2>'+(meta ? '<span class="meta">'+meta+'</span>' : '')+'</div><div class="sec-body">'+rows.join('')+'</div></section>' : '';
  el.innerHTML =
    (weekly.length ? '<div class="g-cards">'+weekly.map(goalCardHTML).join('')+'</div>'
      : '<div class="sec-body"><div class="empty-state"><div class="es-text">No weekly goal is in play. Add one, or make a parked goal active.</div></div></div>')+
    sec('Long game', 'looked at monthly', long.map(goalLongRowHTML))+
    sec('Lists', 'no score', lists.map(goalPlainRowHTML))+
    sec('Parked', 'not counted', parked.map(goalPlainRowHTML))+
    sec('Finished', '', done.map(goalPlainRowHTML));
}
function openGoal(id){
  const g=(DB.goals||[]).find(x => x.id===id); if(!g) return;
  const sh=goalShape(g), on=goalActive(g);
  let b='<h3>'+esc(g.name)+'</h3>';
  if(g.why) b+='<div class="own goal-why"><div class="own-date">Your why</div><div class="own-text">'+esc(g.why)+'</div></div>';
  if(sh==='weekly'){
    const st=goalStatus(g), w=st.w, a=g.act||{}, t=today();
    b+=goalResultHTML(g);
    if(g.resSrc!=='weight' && goalResult(g)) b+='<button class="btn secondary goal-log" onclick="logProgress(\''+g.id+'\')">Enter a reading</button>';
    b+='<div class="ck-label">'+esc(a.label||'This week')+' · '+w.n+' of '+w.target+' this week</div>'+
      '<div class="g-week">'+w.days.map((d,i) => { const hit=w.on[i], fut=d>t;
        return '<button class="g-day'+(fut?' fut':'')+'"'+(fut ? ' disabled' : ' onclick="goalTap(\''+g.id+'\',\''+d+'\',1)"')+' aria-label="'+esc(fmtDate(d))+(hit?', counted':'')+'" aria-pressed="'+(hit?'true':'false')+'">'+
          '<i class="g-dot'+(hit?' on':'')+'">'+(hit?IC_CHECK:'')+'</i><span>'+'MTWTFSS'.charAt(i)+'</span></button>'; }).join('')+'</div>'+
      '<div class="data-fresh">'+esc(GOAL_SRC[a.src]||GOAL_SRC.tap)+'. Tap a day to correct it.</div>';
    const H=goalHistory(g, 12).filter(x => x.k!=='none');
    if(H.length>1){
      const past=H.filter(x => x.k!=='now'), hits=past.filter(x => x.k==='hit').length, sp=past.filter(x => x.k==='spare').length;
      b+='<div class="ck-label">Weeks so far</div><div class="g-hist">'+H.map(x => '<i class="g-wk '+x.k+'" title="Week of '+esc(goalDay(x.ws))+': '+x.n+' of '+x.target+'"></i>').join('')+'</div>'+
        '<div class="data-fresh">'+hits+' of '+past.length+' weeks hit'+(sp ? ' · '+sp+' covered by a spare' : '')+'</div>';
    }
    b+='<div class="field g-plan"><label for="gPlan">Your plan</label><input id="gPlan" placeholder="'+(a.src==='sleep7' ? 'If it is 10 pm, then phone on the charger and lights out' : a.src==='gym' ? 'If it is Tuesday at 6:30, then gym before work' : 'If it is the day and the time, then I do it')+'" value="'+esc(g.plan||'')+'" onchange="goalSetPlan(\''+g.id+'\',this.value)"></div>';
  } else if(sh==='long'){
    const p=goalPct(g), last=(g.updates||[]).slice(-1)[0];
    b+='<div class="goal-top goal-state"><span class="data-line">'+esc(goalLongText(g))+'</span></div>'+
      '<div class="bar goal-bar"><i style="width:'+Math.round(p*100)+'%"></i></div>'+
      '<div class="data-fresh">'+(last && last.date ? 'Last updated '+esc(goalDay(last.date))+'. ' : '')+'Looked at monthly, not weekly.</div>'+
      '<button class="btn goal-log" onclick="logProgress(\''+g.id+'\')">Update the number</button>';
  } else {
    b+='<div class="ck-label">'+((g.milestones||[]).filter(x => x.done).length)+' of '+(g.milestones||[]).length+' ticked</div>'+
      (g.milestones||[]).map(x => '<div class="mile'+(x.done?' done':'')+'" onclick="toggleMilestone(\''+g.id+'\',\''+x.id+'\')"><span class="mk">'+CHECK+'</span><span class="mt">'+esc(x.text)+'</span></div>').join('');
  }
  if(DB.settings.apiKey && sh!=='list') b+='<button class="btn secondary" onclick="goalCoach(\''+g.id+'\')">Ask for a nudge</button><div id="coachOut"></div>';
  b+='<button class="btn secondary" onclick="editGoal(\''+g.id+'\')">Edit goal</button>';
  b+= on ? '<button class="btn secondary" onclick="goalSetState(\''+g.id+'\',\'parked\')">Park this goal</button>'
         : '<button class="btn secondary" onclick="goalSetState(\''+g.id+'\',\'active\')">Make it active</button>';
  if(g.state!=='done') b+='<button class="btn secondary" onclick="goalSetState(\''+g.id+'\',\'done\')">Mark it finished</button>';
  b+='<button class="btn danger" onclick="confirmDeleteGoal(\''+g.id+'\')">Delete goal</button>';
  openSheet(b);
}
function goalSetPlan(id, v){ const g=(DB.goals||[]).find(x => x.id===id); if(!g) return; g.plan=String(v||'').trim(); g.mt=Date.now(); save(); }
// three weekly goals at most: making a fourth active means parking one
function goalSetState(id, state){
  const g=(DB.goals||[]).find(x => x.id===id); if(!g) return;
  if(state==='active' && goalShape(g)==='weekly'){
    const others=goalsWeekly().filter(x => x.id!==id);
    if(others.length>=GOAL_CAP){
      openSheet('<h3>Three weekly goals at a time</h3><p class="sheet-text">More than a few goals at once and none of them get done. Park one to make room for “'+esc(g.name)+'”.</p>'+
        others.map(o => '<button class="btn secondary" onclick="goalSwap(\''+o.id+'\',\''+id+'\')">Park “'+esc(o.name)+'”</button>').join('')+
        '<button class="btn quiet" onclick="openGoal(\''+id+'\')">Leave it parked</button>');
      return;
    }
    if(!g.since) g.since=today();
  }
  g.state=state; g.mt=Date.now(); save(); closeSheet(); renderAll();
  toast(state==='parked' ? 'Parked' : state==='done' ? 'Marked finished' : 'Active');
}
function goalSwap(parkId, id){
  const a=(DB.goals||[]).find(x => x.id===parkId), b=(DB.goals||[]).find(x => x.id===id); if(!a || !b) return;
  a.state='parked'; a.mt=Date.now(); b.state='active'; b.mt=Date.now(); if(!b.since) b.since=today();
  save(); closeSheet(); renderAll(); toast('Active');
}
function confirmDeleteGoal(id){
  const g=(DB.goals||[]).find(x=>x.id===id); if(!g) return;
  openSheet('<h3>Delete this goal?</h3><p class="sheet-text">“'+esc(g.name)+'” and its history are removed from this phone and from your account. Parking it keeps the history.</p>'+
    '<button class="btn destructive" onclick="deleteGoal(\''+id+'\')">Delete goal</button><button class="btn secondary" onclick="openGoal(\''+id+'\')">Keep it</button>');
}
// this week's goals, for Today
function goalsWeekHTML(){
  const gs=goalsWeekly(); if(!gs.length) return '';
  return '<section class="sec"><div class="sec-h"><h2>This week</h2><button class="link" onclick="showView(\'goals\')">Goals</button></div><div class="sec-body">'+gs.map(g => {
    const st=goalStatus(g), w=st.w, a=g.act||{}, label=a.label||g.name;
    return '<div class="row" onclick="showView(\'goals\')"><div class="row-main"><div class="row-title">'+esc(label)+'</div>'+(label!==g.name ? '<div class="row-sub clip">'+esc(g.name)+'</div>' : '')+'</div>'+
      goalDots(w.n, w.target, st.k)+'<span class="row-end num">'+w.n+' of '+w.target+'</span></div>'; }).join('')+'</div></section>';
}

// ---- ticking, entering a number, adding and editing ----
function toggleMilestone(gid, mid){ const g=DB.goals.find(x=>x.id===gid); if(!g) return; const mm=(g.milestones||[]).find(x=>x.id===mid); if(mm){ mm.done=!mm.done; g.lastProgressTs=Date.now(); g.mt=Date.now(); save(); openGoal(gid); renderAll(); } }
function logProgress(id){ const g=DB.goals.find(x=>x.id===id); if(!g) return;
  openSheet('<h3>'+esc(g.name)+'</h3><div class="field"><label for="gpv">'+(g.unit ? 'Today’s number, in '+esc(g.unit) : 'Today’s number')+'</label><input id="gpv" type="number" inputmode="decimal" value="'+(g.current!=null?g.current:'')+'"></div><button class="btn" onclick="saveProgress(\''+id+'\')">Save</button>');
  setTimeout(()=>{ const e=$('gpv'); if(e) e.focus(); },60);
}
function saveProgress(id){ const g=DB.goals.find(x=>x.id===id); if(!g) return; const v=Number($('gpv').value); if(isNaN(v)){ return; }
  g.current=v; g.updates=g.updates||[]; g.updates.push({date:today(), ts:Date.now(), value:v}); g.lastProgressTs=Date.now(); g.mt=Date.now(); save(); closeSheet(); renderAll(); toast('Saved'); }
function gKindToggle(){ const k=$('gShape').value; ['weekly','long','list'].forEach(x => { const el=$('gBlock-'+x); if(el) el.style.display = (k===x) ? '' : 'none'; }); }
function editGoal(id){
  const g=id ? DB.goals.find(x=>x.id===id) : null, sh=g ? goalShape(g) : 'weekly', a=(g&&g.act)||{};
  const opt=(v,l,sel)=>'<option value="'+v+'"'+(sel?' selected':'')+'>'+l+'</option>';
  const num = v => (v!=null && v!=='') ? v : '';
  openSheet('<h3>'+(g?'Edit goal':'New goal')+'</h3>'+
    '<div class="field"><label for="gName">Goal</label><input id="gName" placeholder="Get stronger, read more, be home for dinner" value="'+esc(g?g.name:'')+'"></div>'+
    '<div class="field"><label for="gWhy">Why it matters, in your words (optional)</label><textarea id="gWhy" placeholder="A line for the days you would rather not">'+esc(g?(g.why||''):'')+'</textarea></div>'+
    '<div class="field"><label for="gShape">What kind of goal</label><select id="gShape" onchange="gKindToggle()">'+opt('weekly','Something I do each week',sh==='weekly')+opt('long','A number to move over the long run',sh==='long')+opt('list','A list to tick off',sh==='list')+'</select></div>'+
    '<div id="gBlock-weekly">'+
      '<div class="row2"><div class="field"><label for="gAct">The action</label><input id="gAct" placeholder="Gym, date night, a long run" value="'+esc(a.label||'')+'"></div>'+
      '<div class="field"><label for="gN">Times a week</label><input id="gN" type="number" inputmode="numeric" min="1" max="7" value="'+(a.n||'')+'" placeholder="3"></div></div>'+
      '<div class="field"><label for="gSrc">How it is counted</label><select id="gSrc">'+opt('tap','I mark it with a tap',!a.src||a.src==='tap')+opt('gym','The ring counts strength sessions, and I can tap',a.src==='gym')+opt('sleep7','The ring counts nights of seven hours or more',a.src==='sleep7')+'</select></div>'+
      '<div class="ck-label">The result you are after (optional)</div>'+
      '<div class="row2"><div class="field"><label for="gwTgt">Target</label><input id="gwTgt" type="number" inputmode="decimal" value="'+(g&&sh==='weekly'?num(g.target):'')+'" placeholder="170"></div>'+
      '<div class="field"><label for="gwUnit">Unit</label><input id="gwUnit" placeholder="lb" value="'+esc(g&&sh==='weekly'?(g.unit||''):'')+'"></div></div>'+
      '<div class="row2"><div class="field"><label for="gwStart">Starting from</label><input id="gwStart" type="number" inputmode="decimal" value="'+(g&&sh==='weekly'?num(g.start):'')+'"></div>'+
      '<div class="field"><label for="gwDate">By</label><input id="gwDate" type="date" value="'+(g&&sh==='weekly'?(g.targetDate||''):'')+'"></div></div>'+
      '<div class="field"><label for="gwRes">Where the number comes from</label><select id="gwRes">'+opt('','I enter it',!g||g.resSrc!=='weight')+opt('weight','My weight, from the scale',g&&g.resSrc==='weight')+'</select></div>'+
    '</div>'+
    '<div id="gBlock-long" style="display:none">'+
      '<div class="row2"><div class="field"><label for="gDir">Direction</label><select id="gDir">'+opt('up','Increase',!g||g.direction!=='down')+opt('down','Decrease',g&&g.direction==='down')+'</select></div>'+
      '<div class="field"><label for="gUnit">Unit</label><input id="gUnit" placeholder="books, $, hours" value="'+esc(g&&sh!=='weekly'?(g.unit||''):'')+'"></div></div>'+
      '<div class="row2"><div class="field"><label for="gCur">Now</label><input id="gCur" type="number" inputmode="decimal" value="'+(g&&sh!=='weekly'?num(g.current):'')+'"></div>'+
      '<div class="field"><label for="gTgt">Target</label><input id="gTgt" type="number" inputmode="decimal" value="'+(g&&sh!=='weekly'?num(g.target):'')+'"></div></div>'+
      '<div class="field"><label for="gDate">Target date (optional)</label><input id="gDate" type="date" value="'+(g&&sh!=='weekly'?(g.targetDate||''):'')+'"></div>'+
    '</div>'+
    '<div id="gBlock-list" style="display:none"><div class="field"><label for="gMiles">Items, one per line</label><textarea id="gMiles" placeholder="Camp under the stars&#10;Bake bread together">'+esc(g&&g.milestones?g.milestones.map(m=>m.text).join('\n'):'')+'</textarea></div></div>'+
    '<button class="btn" onclick="saveGoal(\''+(g?g.id:'')+'\')">Save goal</button>');
  setTimeout(gKindToggle, 40);
}
function saveGoal(id){
  const name=$('gName').value.trim(); if(!name){ toast('Give it a name'); return; }
  const sh=$('gShape').value, isNew=!id, numOr = (v, d) => (v===''||v==null||isNaN(Number(v))) ? d : Number(v);
  let g=id ? DB.goals.find(x=>x.id===id) : { id:uid(), createdTs:Date.now(), updates:[] };
  const was=goalShape(g), wasActive=!isNew && goalActive(g);
  g.name=name; g.why=$('gWhy').value.trim(); g.shape=sh; g.kind = sh==='list' ? 'milestones' : 'number';
  if(sh==='weekly'){
    const old=g.act||{};
    g.act={ label:$('gAct').value.trim() || name, n:Math.max(1, Math.min(7, Math.round(numOr($('gN').value, 1)))), src:$('gSrc').value, days:old.days||[], off:old.off||[] };
    const tgt=$('gwTgt').value;
    if(tgt!==''){ g.target=Number(tgt); g.unit=$('gwUnit').value.trim(); g.start=numOr($('gwStart').value, g.start!=null ? g.start : null); g.targetDate=$('gwDate').value;
      g.direction = (g.start!=null && g.target<g.start) ? 'down' : 'up'; g.resSrc=$('gwRes').value || ''; if(g.current==null) g.current=g.start; }
    else { g.target=null; g.resSrc=''; }
    g.milestones=g.milestones||[];
    if(was!=='weekly' || !g.since) g.since=today();
  } else if(sh==='long'){
    g.direction=$('gDir').value; g.unit=$('gUnit').value.trim();
    g.current=Number($('gCur').value)||0; g.target=Number($('gTgt').value)||0; g.targetDate=$('gDate').value;
    if(isNew || g.start==null) g.start=g.current; g.milestones=g.milestones||[]; g.resSrc='';
  } else {
    const lines=$('gMiles').value.split('\n').map(x=>x.trim()).filter(Boolean), prev=g.milestones||[];
    g.milestones=lines.map(t=>{ const ex=prev.find(pp=>pp.text===t); return { id:ex?ex.id:uid(), text:t, done:ex?ex.done:false }; });
  }
  if(!g.lastProgressTs) g.lastProgressTs=Date.now();
  // a fourth weekly goal is saved parked, with the choice of which to swap left to him
  const others=goalsWeekly().filter(x => x.id!==g.id);
  const overCap = sh==='weekly' && others.length>=GOAL_CAP && !(wasActive && was==='weekly');
  if(isNew || overCap) g.state = overCap ? 'parked' : 'active';
  g.mt=Date.now();
  if(isNew){ DB.goals=DB.goals||[]; DB.goals.push(g); }
  save(); closeSheet(); renderAll();
  toast(overCap ? 'Saved as parked: three weekly goals at a time' : 'Goal saved');
}
