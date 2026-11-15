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
function renderGoals(){ renderTWY();
  const el=$('goalList'); if(!el) return; const gs=DB.goals||[];
  if(!gs.length){ el.innerHTML='<div class="sec-body"><div class="empty-state"><div class="es-title">No goals yet</div><div class="es-text">Set a life goal: a number to move (books read, pounds, dollars saved, hours practiced) or a project with milestones. LifeOS tracks momentum and points at the next step.</div>'+
    '<button class="btn sm" onclick="editGoal(\'\')">Add your first goal</button></div></div>'; return; }
  el.innerHTML='<div class="sec-body">'+gs.map(g=>{ const p=goalPct(g), m=goalMomentum(g);
    return '<div class="goal-row" onclick="openGoal(\''+g.id+'\')"><div class="goal-top"><span class="row-title">'+esc(g.name)+'</span><span class="status '+(m.cls==='low'?'watch':m.cls==='up'?'good':'')+'">'+m.label+'</span></div>'+
      '<div class="row-sub">'+esc(goalProgressText(g))+'</div>'+
      '<div class="bar goal-bar"><i class="'+(m.cls==='low'?'watch':'')+'" style="width:'+Math.round(p*100)+'%"></i></div>'+
      '<div class="row-sub goal-next">'+esc('Next: '+String(goalNext(g)).replace(/^Next:\s*/,''))+'</div></div>';
  }).join('')+'</div>';
}
