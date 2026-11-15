// one past entry, in his own words where the page was transcribed
function otdCard(j, yr, why){
  const n=yr-Number(j.date.slice(0,4));
  const words=(j.transcription||'').trim();
  return '<div class="own" onclick="openEntry(\''+j.id+'\')"><div class="own-date">'+(n===1?'A year ago':n+' years ago')+' <span>· '+esc(fmtDateY(j.date))+'</span></div>'+
    (words ? '<div class="own-text">'+esc(clip(words,190))+'</div>' : '<div class="row-sub">'+esc(clip(j.summary||j.note||'Not transcribed yet',150))+'</div>')+
    (why?'<div class="own-note">'+esc(why)+'</div>':'')+'</div>';
}
function onThisDayHTML(){
  const es=onThisDayEntries(); if(!es.length) return memThisMonthHTML();
  const yr=Number(today().slice(0,4));
  const lb=(DB.otd && DB.otd.date===today()) ? DB.otd : null;
  const why={}; if(lb) (lb.picks||[]).forEach(p=>{ why[p.id]=p.why; });
  let show = lb && (lb.picks||[]).length ? lb.picks.map(p=>es.find(e=>e.id===p.id)).filter(Boolean) : [];
  if(!show.length) show=otdFallback(es);
  const head='<div class="sec-h"><h2>On this day</h2>'+(es.length>1?'<span class="meta num">'+es.length+' years</span>':'')+'</div>';
  const look = lb ? '<div class="ai">'+aiLabel('Looking back','regenLookBack()')+'<p class="ai-body">'+esc(lb.text)+'</p></div>'
    : (DB.settings.apiKey && es.length>=3 ? '<div class="ai" aria-busy="true">'+aiLabel('Looking back')+'<p class="ai-body">'+skelLines('w100','w100','w60')+'</p><div class="data-fresh">Reading back through '+es.length+' years…</div></div>' : '');
  return '<section class="sec otd-block">'+head + look + show.map(j=>otdCard(j, yr, why[j.id])).join('') +
    (es.length>show.length ? '<div><button class="link otd-all" onclick="openAllOnThisDay()">See all '+es.length+' years</button></div>' : '') + '</section>' +
    memThisMonthHTML();
}
function openAllOnThisDay(){
  const es=onThisDayEntries(); if(!es.length) return;
  const yr=Number(today().slice(0,4));
  const lb=(DB.otd && DB.otd.date===today()) ? DB.otd : null;
  const why={}; if(lb) (lb.picks||[]).forEach(p=>{ why[p.id]=p.why; });
  openSheet('<h3>'+esc(fmtDate(today()).replace(/,\s*\d{4}$/,''))+' &middot; every year</h3>'+
    '<div class="otd-block">'+(lb?'<div class="ai">'+aiLabel('Looking back')+'<p class="ai-body">'+esc(lb.text)+'</p></div>':'')+
    es.map(j=>otdCard(j, yr, why[j.id])).join('')+'</div>');
}
