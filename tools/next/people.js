// ---------- People (redesigned) ----------
const IC_CHECK = '<svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m5.5 12.5 4.2 4.2 8.8-9.4"/></svg>';
function renderFriends(){
  if (!DB.friends.length){
    $('friendList').innerHTML = '<div class="sec-body"><div class="empty-state"><div class="es-title">Nobody here yet</div><div class="es-text">Add the people you want to stay close to. Give each a profile, log your conversations, and the agent helps you keep up: birthdays, what to say, gift ideas.</div>'+
      '<button class="btn sm" onclick="editFriend(\'\')">Add someone</button></div></div>';
    return;
  }
  const scored = DB.friends.map(f => { const s = friendStatus(f);
    let score = 500 + (s.since || 0) - (f.cadence || 999);
    if (s.overdue) score += 1000;
    if (s.bd && s.bd.days <= 14) score += 2000 - s.bd.days;
    if (s.nextEvent && s.nextEvent.days <= 14) score += 1500 - s.nextEvent.days;
    return { f, s, score, due: s.overdue || (s.bd && s.bd.days <= 14) || (s.nextEvent && s.nextEvent.days <= 14) };
  }).sort((a,b) => b.score - a.score);
  const row = ({f, s}) => {
    const meta = [];
    if (s.bd && s.bd.days === 0) meta.push('<span class="soon">Birthday today</span>');
    else if (s.bd && s.bd.days <= 14) meta.push('<span class="soon">Birthday '+(s.bd.days === 1 ? 'tomorrow' : 'in '+s.bd.days+' days')+'</span>');
    if (s.nextEvent && s.nextEvent.days <= 14) meta.push('<span class="soon">'+esc(s.nextEvent.title)+' '+s.nextEvent.dateLabel+'</span>');
    if (s.overdue) meta.push('<span class="late">'+(s.since === null ? 'never logged' : s.since+(s.since === 1 ? ' day' : ' days')+' since you talked')+'</span>');
    else if (s.since !== null) meta.push('talked '+(s.since === 0 ? 'today' : s.since === 1 ? 'yesterday' : s.since+' days ago'));
    if (!meta.length && f.relationship) meta.push(esc(f.relationship));
    return '<div class="row" onclick="openPerson(\''+f.id+'\')">' +
      '<span class="av" style="background:'+avVar(f.name)+'">'+esc(f.name[0].toUpperCase())+'</span>' +
      '<div class="row-main"><div class="row-title">'+esc(f.name)+'</div><div class="row-sub">'+meta.join(' · ')+'</div></div>' +
      '<button class="icon-btn" aria-label="Mark '+esc(f.name)+' contacted today" onclick="markContacted(\''+f.id+'\');event.stopPropagation()">'+IC_CHECK+'</button></div>';
  };
  const due = scored.filter(x => x.due), rest = scored.filter(x => !x.due);
  $('friendList').innerHTML =
    (due.length ? '<div class="group-h">Reach out</div><div class="sec-body">'+due.map(row).join('')+'</div>' : '') +
    (rest.length ? '<div class="group-h'+(due.length ? ' gap' : '')+'">'+(due.length ? 'In touch' : 'Everyone')+'</div><div class="sec-body">'+rest.map(row).join('')+'</div>' : '');
}
function rhythmHTML(p){
  const rc=rhythmCounts(p,6); const max=Math.max.apply(null, rc.map(r=>r.n).concat([1]));
  if(rc.every(r=>!r.n)) return '';
  const d=driftStatus(p);
  return '<section class="sec"><div class="sec-h"><h2>Rhythm</h2><span class="meta">contacts a month</span></div><div class="sec-body"><div class="rhythm">'+rc.map(r=>
      '<div class="rh"><b class="num">'+(r.n||'')+'</b><span class="rh-b"><i class="'+(r.n?'':'none')+'" style="height:'+Math.max(8, Math.round(r.n/max*100))+'%"></i></span><span class="rh-l">'+r.label+'</span></div>').join('')+'</div>'+
    (d.drifting ? '<div class="rh-note"><span class="status watch">Drifting</span> '+d.in60+' in the last two months, '+d.prior60+' in the two before.</div>' : '')+'</div></section>';
}
function renderPerson(){
  const el=$('personBody'); if(!el) return;
  const p=DB.friends.find(x=>x.id===currentPersonId);
  if(!p){ el.innerHTML=''; return; }
  const s=friendStatus(p), bd=s.bd, K=!!DB.settings.apiKey;
  // who, then when
  const when = s.since!=null ? ('Talked '+(s.since===0?'today':s.since===1?'yesterday':s.since+' days ago')) : 'No contact logged yet';
  const bdl = bd ? ('Birthday '+(bd.days<=30?(bd.days===0?'today':bd.days===1?'tomorrow':'in '+bd.days+' days'):bd.label)) : '';
  let h='<header class="lt person-head"><span class="av xl" style="background:'+avVar(p.name)+'">'+esc(p.name[0].toUpperCase())+'</span>'+
    '<div class="person-who">'+(p.relationship?'<div class="lt-eyebrow">'+esc(p.relationship)+'</div>':'')+'<h1 class="lt-title">'+esc(p.name)+'</h1></div></header>'+
    '<div class="person-when"><span class="data-line'+(s.overdue?' late':'')+'">'+esc(when)+(s.overdue && p.cadence ? ' <span class="unit">· you aim for every '+p.cadence+' days</span>' : '')+'</span>'+
    (bdl ? '<span class="data-line'+(bd.days<=14?' soon':'')+'">'+esc(bdl)+'</span>' : '')+'</div>';
  h+='<div class="btn-row person-acts"><button class="btn" onclick="logChat(\''+p.id+'\')">Log a chat</button><button class="btn secondary" onclick="markContacted(\''+p.id+'\')">Contacted today</button></div>';
  h+='<section class="sec"><div class="sec-h"><h2>Ask the agent</h2></div><div class="chips">'+
    [['draftMessage','Draft a message'],['whatToTalk','What to talk about'],['textThem','Text them something'],['giftIdeas','Gift ideas']].map(a =>
      '<button class="chip accent" onclick="'+a[0]+'(\''+p.id+'\')">'+a[1]+'</button>').join('')+'</div>'+
    (K ? '' : '<div class="data-fresh agent-off">Add an Anthropic API key in Settings to switch the agent on.</div>')+
    '<div id="agentOut"></div></section>';
  const up=[]; if(bd) up.push({title:p.name+'’s birthday', label:(bd.days===0?'today':bd.days===1?'tomorrow':'in '+bd.days+' days'), days:bd.days});
  upcomingEvents(p,180).forEach(e=>up.push({title:e.title,label:e.dateLabel,days:e.days,eid:e.id}));
  up.sort((a,b)=>a.days-b.days);
  h+='<section class="sec"><div class="sec-h"><h2>Upcoming</h2><button class="link" onclick="addPersonEvent(\''+p.id+'\')">Add a date</button></div><div class="sec-body">'+
    (up.length ? up.map(u=>'<div class="row"><div class="row-main"><div class="row-title plain">'+esc(u.title)+'</div></div><span class="row-end num">'+esc(u.label)+'</span>'+
        (u.eid?'<button class="icon-btn quiet" aria-label="Remove '+esc(u.title)+'" onclick="delPersonEvent(\''+p.id+'\',\''+u.eid+'\')">&times;</button>':'')+'</div>').join('')
      : '<div class="empty-state"><div class="es-text">No dates yet. Add anniversaries, kids’ birthdays, work milestones.</div></div>')+'</div></section>';
  const ab=[['Family',p.family],['Favorites and interests',p.favorites],['Sports team',p.team],['How we met',p.how],['Gift ideas',p.giftIdeas],['Notes',p.notes],['Stay in touch',p.stay||(p.cadence?('every '+p.cadence+' days'):'')]].filter(a=>a[1]);
  h+='<section class="sec"><div class="sec-h"><h2>About</h2><button class="link" onclick="editFriend(\''+p.id+'\')">Edit</button></div><div class="sec-body">'+
    (ab.length ? ab.map(a=>'<div class="fact"><div class="fact-l">'+esc(a[0])+'</div><div class="fact-v">'+esc(a[1])+'</div></div>').join('')
      : '<div class="empty-state"><div class="es-text">Use Edit to add family, interests and notes.</div></div>')+'</div></section>';
  h+=rhythmHTML(p);
  const jm=journalMentions(p.name,5);
  if(jm.length){ h+='<section class="sec"><div class="sec-h"><h2>From your journal</h2></div>'+
    jm.map(j=>'<div class="own" onclick="openEntry(\''+j.id+'\')"><div class="own-date">'+esc(fmtDateY(j.date))+'</div><div class="own-text">'+esc(mentionSnippet(j,p.name))+'</div></div>').join('')+'</section>'; }
  const items=[].concat((p.log||[]).map(l=>Object.assign({},l,{_t:'log'})), (p.docs||[]).map(d=>Object.assign({},d,{_t:'doc'}))).sort((a,b)=>(b.ts||0)-(a.ts||0));
  h+='<section class="sec"><div class="sec-h"><h2>History</h2><button class="link" onclick="importMaterial(\''+p.id+'\')">Import</button></div><div class="sec-body">'+
    (items.length ? items.map(it=>{ const text = it._t==='doc' ? (it.text||'').slice(0,140) : (it.text||'');
        return '<div class="row" onclick="'+(it._t==='doc'?'openDoc':'openLog')+'(\''+p.id+'\',\''+it.id+'\')"><div class="row-main"><div class="row-title">'+esc(docKindLabel(it.kind))+
          (it.auto?' <span class="unit">auto</span>':'')+'</div>'+(text?'<div class="row-sub clamp2">'+esc(text)+'</div>':'')+'</div><span class="row-end num">'+esc(/^\d{4}-\d{2}-\d{2}/.test(it.date||'') ? dayLabel(it.date) : (it.date||''))+'</span></div>'; }).join('')
      : '<div class="empty-state"><div class="es-text">No history yet. Log a chat, or import a text thread or call transcript.</div></div>')+'</div></section>';
  h+='<section class="sec"><div class="sec-body"><div class="row act danger" onclick="confirmDeleteFriend(\''+p.id+'\')"><div class="row-main"><div class="row-title">Remove '+esc(p.name.split(/\s+/)[0])+'</div></div></div></div></section>';
  el.innerHTML=h;
}
function confirmDeleteFriend(id){
  const p=DB.friends.find(x=>x.id===id); if(!p) return;
  openSheet('<h3>Remove '+esc(p.name)+'?</h3><p class="sheet-text">Their profile, dates and history are removed from this phone and from your account. Journal entries that mention them are not touched.</p>'+
    '<button class="btn destructive" onclick="deleteFriend(\''+id+'\')">Remove</button><button class="btn secondary" onclick="closeSheet()">Keep</button>');
}
function agentBusy(msg){ if($('agentOut')) $('agentOut').innerHTML='<div class="ai agent-out" aria-busy="true">'+aiLabel('Working')+'<p class="ai-body"><span class="spinner"></span> '+esc(msg)+'</p></div>'; }
function agentResult(title, inner){ if($('agentOut')) $('agentOut').innerHTML='<div class="ai agent-out">'+aiLabel(title)+'<div class="agent-body">'+inner+'</div></div>'; }
