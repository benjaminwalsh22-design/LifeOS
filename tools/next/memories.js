// ---------- 52 Memories (redesigned) ----------
const IC_BOOK = '<svg fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.5c-1.8-1.2-4-1.8-7-1.8v13c3 0 5.2.6 7 1.8m0-13c1.8-1.2 4-1.8 7-1.8v13c-3 0-5.2.6-7 1.8m0-13v13"/></svg>';
const IC_SEARCH = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path stroke-linecap="round" d="m16 16 4.5 4.5"/></svg>';
const IC_HEART = '<svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6c0 5.5-7.5 10.1-7.5 10.1Z"/></svg>';
function renderMemories(){
  const el=$('memBody'); if(!el) return;
  const ys=memYears();
  const chips=ys.map(y=>'<button class="chip'+(MEMV.yr===y?' on':'')+'" onclick="MEMV.yr='+y+';MEMV.q=\'\';renderMemories()">Year '+memYearNum(y)+'</button>').join('')+
    '<button class="chip'+(MEMV.yr==='next'?' on':'')+'" onclick="MEMV.yr=\'next\';renderMemories()">Year '+memYearNum(annivNextYr())+' · collecting</button>';
  el.innerHTML='<header class="lt"><div class="lt-eyebrow">'+(DB.memories||[]).length+' memories, read every August since 2017</div><h1 class="lt-title">52 Memories</h1></header>'+
    '<label class="search mem-search">'+IC_SEARCH+'<input id="memQ" type="search" placeholder="Search every year" autocomplete="off" value="'+esc(MEMV.q)+'" oninput="memSearch(this.value)"></label>'+
    '<div class="chips scroll mem-years">'+chips+'</div><div id="memList"></div>';
  renderMemList();
  // bring the chosen year into view once the row has a width
  const centre=()=>{ const row=el.querySelector('.mem-years'), on=row&&row.querySelector('.chip.on'); if(on && row.clientWidth) row.scrollLeft=on.offsetLeft-(row.clientWidth-on.offsetWidth)/2; };
  centre(); if(window.requestAnimationFrame) requestAnimationFrame(centre);
}
function renderMemList(){
  const el=$('memList'); if(!el) return;
  const q=(MEMV.q||'').trim().toLowerCase();
  const group = rows => '<div class="sec-body">'+rows.join('')+'</div>';
  if(q){
    const toks=q.split(/\s+/).filter(Boolean);
    const hits=(DB.memories||[]).filter(m=>{ const t=(m.title+' '+(m.text||'')).toLowerCase(); return toks.every(k=>t.includes(k)); });
    el.innerHTML=hits.length?group(hits.map(memItemHTML)):'<div class="sec-body"><div class="empty-state"><div class="es-title">No memories match</div><div class="es-text">Try a name, a place or a single word.</div></div></div>';
    return;
  }
  if(MEMV.yr==='next'){ el.innerHTML=memCandHTML(); return; }
  const ms=(DB.memories||[]).filter(m=>m.yr===MEMV.yr).sort((a,b)=>(a.n||0)-(b.n||0));
  if(!ms.length){ el.innerHTML='<div class="sec-body"><div class="empty-state"><div class="es-title">Nothing here yet</div></div></div>'; return; }
  el.innerHTML='<button class="btn mem-read" onclick="memReadStart('+MEMV.yr+')">'+IC_BOOK+'<span>Read Year '+memYearNum(MEMV.yr)+' aloud</span></button>'+group(ms.map(memItemHTML));
}
function memItemHTML(m){
  const meta = (MEMV.q?('Year '+memYearNum(m.yr)+(m.date?' · ':'')):'')+(m.date?fmtMonth(m.date):'')+(!MEMV.q&&m.n?(m.date?' · ':'')+m.n+'/52':'');
  return '<div class="mem-row" onclick="openMemory(\''+m.id+'\')"><div class="mem-top"><span class="mem-title">'+esc(m.title)+'</span><span class="meta num">'+esc(meta)+'</span></div>'+
    (m.text?'<div class="mem-prev">'+esc(m.text.slice(0,160))+'</div>':'')+'</div>';
}
function openMemory(id){
  const m=(DB.memories||[]).find(x=>x.id===id); if(!m) return;
  const i=(DB.memories||[]).filter(x=>x.yr===m.yr).sort((a,b)=>(a.n||0)-(b.n||0)).findIndex(x=>x.id===id);
  openSheet('<h3 class="mem-h">'+esc(m.title)+'</h3>'+
    '<div class="data-fresh mem-meta">Year '+memYearNum(m.yr)+(m.n?' · '+m.n+' of 52':'')+(m.date?' · '+fmtMonth(m.date):'')+'</div>'+
    (m.text?'<div class="page-text mem-text">'+esc(m.text)+'</div>':'<p class="sheet-text">No written card for this one yet. Add the story with Edit.</p>')+
    '<div id="memPhotos"></div>'+
    '<div class="btn-row mem-acts"><button class="btn secondary" onclick="editMemory(\''+id+'\')">Edit</button>'+
    '<button class="btn" onclick="closeSheet();memReadStart('+m.yr+','+Math.max(0,i)+')">Read from here</button></div>');
  if(m.date) loadPhotoStrip('memPhotos', { month:m.date });
}
// next year's list, collected as the year goes
function memCandHTML(){
  const cs=(DB.memCand||[]).slice().sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
  const yr=annivNextYr();
  let h='<p class="study-text mem-intro">Collecting for <b>Year '+memYearNum(yr)+'</b>, to be read in August '+yr+'. Add moments as they happen: from here, from any journal entry, or let Claude suggest from your journal.</p>';
  h+='<button class="btn" onclick="addMemCandSheet()">Add a memory</button>';
  h+='<div class="btn-row mem-acts"><button class="btn secondary" onclick="memSuggest(this)">'+(DB.settings.apiKey?'Suggest from my journal':'Suggest (needs API key)')+'</button>'+
    (cs.length?'<button class="btn secondary" onclick="exportMemCand()">Export list</button>':'')+'</div>';
  h+='<section class="sec"><div class="sec-h"><h2>Collected</h2><span class="meta num">'+(cs.length? cs.length+(cs.length>=52?', a full year':' of 52') : 'the year is young')+'</span></div>';
  h+=cs.length ? '<div class="sec-body">'+cs.map(c=>'<div class="row"><div class="row-main"><div class="mem-title">'+esc(c.text)+'</div>'+
    '<div class="row-sub">'+(c.date?esc(fmtMonth(c.date))+' · ':'')+(c.src==='ai'?'Suggested by Claude':c.src==='journal'?'From a journal entry':'Added by you')+'</div></div>'+
    '<button class="icon-btn quiet" aria-label="Remove from the list" onclick="delMemCand(\''+c.id+'\')">&times;</button></div>').join('')+'</div>'
    : '<div class="sec-body"><div class="empty-state"><div class="es-text">Nothing collected yet.</div></div></div>';
  return h+'</section>';
}

// ---------- Reading Mode: one memory to a page, made to be read aloud ----------
let _mrWake=null;
function memReadStart(yr,i){
  const ms=(DB.memories||[]).filter(m=>m.yr===yr).sort((a,b)=>(a.n||0)-(b.n||0));
  if(!ms.length) return;
  MEMR={ms,i:i||0,yr}; $('memRead').classList.add('open'); memReadRender();
  // keep the screen awake while reading, where the phone allows it
  try{ if(navigator.wakeLock) navigator.wakeLock.request('screen').then(l=>{ _mrWake=l; if(!MEMR){ l.release(); _mrWake=null; } }).catch(()=>{}); }catch(e){}
}
function memReadRender(dir){
  if(!MEMR) return; const m=MEMR.ms[MEMR.i], n=MEMR.ms.length, last=MEMR.i===n-1;
  $('mrYr').textContent='Year '+memYearNum(MEMR.yr)+' · 52 Memories';
  const bar=$('mrBar'); if(bar) bar.style.width=((MEMR.i+1)/n*100).toFixed(1)+'%';
  const body=$('mrBody');
  body.innerHTML='<article class="mr-page'+(dir?(dir>0?' fwd':' back'):'')+'"><div class="mr-count num">'+(MEMR.i+1)+'<span> of '+n+'</span></div>'+
    '<h2 class="mr-title'+(String(m.title).length>44?' long':'')+'">'+esc(m.title)+'</h2>'+
    (m.date?'<div class="mr-date">'+esc(fmtMonth(m.date))+'</div>':'')+
    (m.text?'<div class="mr-text">'+esc(m.text)+'</div>':'<div class="mr-text quiet">Just the title for this one. Tell the story out loud.</div>')+
    '<div id="mrPhotos" class="mr-photos"></div>'+
    (last?'<div class="mr-end">'+IC_HEART+'</div>':'')+'</article>';
  if(m.date) loadPhotoStrip('mrPhotos', { month:m.date });
  body.scrollTop=0;
  $('mrPrev').style.visibility=MEMR.i===0?'hidden':'visible';
  $('mrNext').textContent=last?'The end':'Next';
}
function memReadNext(){ if(!MEMR) return; if(MEMR.i>=MEMR.ms.length-1){ memReadClose(); return; } MEMR.i++; memReadRender(1); }
function memReadPrev(){ if(!MEMR||MEMR.i===0) return; MEMR.i--; memReadRender(-1); }
function memReadClose(){ MEMR=null; $('memRead').classList.remove('open'); if(_mrWake){ try{ _mrWake.release(); }catch(e){} _mrWake=null; } }
// turn the page with a swipe as well as the buttons
(function(){
  const el=$('memRead'); if(!el) return; let x0=0, y0=0, on=false;
  el.addEventListener('touchstart', e=>{ if(e.touches.length!==1){ on=false; return; } x0=e.touches[0].clientX; y0=e.touches[0].clientY; on=!(e.target.closest && e.target.closest('.lp-strip')); }, {passive:true});
  el.addEventListener('touchend', e=>{ if(!on||!MEMR) return; on=false; const t=e.changedTouches[0], dx=t.clientX-x0, dy=t.clientY-y0;
    if(Math.abs(dx)<56 || Math.abs(dx)<Math.abs(dy)*1.6) return; if(dx<0) memReadNext(); else memReadPrev(); });
})();
