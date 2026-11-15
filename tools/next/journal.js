// ---------- Journal (redesigned): one primary action, a short shelf, then the entries ----------
const IC_CAMERA = '<svg fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6.8 7h-1A2.8 2.8 0 0 0 3 9.8v7.4A2.8 2.8 0 0 0 5.8 20h12.4a2.8 2.8 0 0 0 2.8-2.8V9.8A2.8 2.8 0 0 0 18.2 7h-1l-1.2-2.1A1.8 1.8 0 0 0 14.4 4H9.6a1.8 1.8 0 0 0-1.6.9L6.8 7Z"/><circle cx="12" cy="13" r="3.4"/></svg>';
const navRow = (fn, title, end, sub) => '<div class="row nav" onclick="'+fn+'"><div class="row-main"><div class="row-title">'+title+'</div>'+(sub ? '<div class="row-sub">'+sub+'</div>' : '')+'</div>'+
  (end ? '<span class="row-end num">'+end+'</span>' : '')+'<span class="row-chev">'+CHEV+'</span></div>';
const noteCard = (title, meta, text, extra, fn) => '<div class="note-card"'+(fn ? ' onclick="'+fn+'"' : '')+'><div class="note-top"><b>'+title+'</b>'+(meta ? '<span class="meta num">'+meta+'</span>' : '')+'</div>'+
  (text ? '<div class="note-text">'+text+'</div>' : '')+(extra||'')+'</div>';

// what is in flight: cloud queue, pages that need a human, failures, a bulk import
function renderArchiveProgress(){
  const el=$('archiveProgress'); if(!el) return;
  if(!ARCHIVE){
    const q=DB.journal.filter(j=>j.status==='queued').length;
    const errs=DB.journal.filter(j=>j.status==='error' && !j.refused).length;
    const refused=DB.journal.filter(j=>j.status==='error' && j.refused).length;
    let h='';
    if(q>0) h+=noteCard('Transcribing in the cloud', q+' remaining', 'Runs on its own, about '+Math.ceil(q/4)+' min left. Pull down to refresh; you will be notified when it is done.');
    if(refused>0) h+=noteCard(refused+' page'+(refused===1?'':'s')+' need'+(refused===1?'s':'')+' a human', '',
      'Claude declined to transcribe '+(refused===1?'this page':'these pages')+' (it occasionally does this with certain content). Open the entry and use Edit text to type it in, or ask in a Claude chat to transcribe it for you.', '', 'openFirstRefused()');
    if(errs>0 && typeof SUPA!=='undefined' && SUPA && SUPA.session)
      h+=noteCard(errs+' page'+(errs===1?'':'s')+' failed', '', 'Send them to the cloud queue to retry.', '<button class="btn secondary" onclick="retryFailedCloud()">Retry '+errs+' in cloud</button>');
    el.innerHTML=h; return;
  }
  const n=ARCHIVE.files.length, i=ARCHIVE.i, pct=Math.round(i/n*100);
  if(ARCHIVE.mode==='cloud'){
    el.innerHTML=noteCard('Uploading to cloud', i+' / '+n, '', '<div class="bar note-bar"><i style="width:'+pct+'%"></i></div>'+
      '<div class="note-text">'+ARCHIVE.ok+' uploaded'+(ARCHIVE.skip?' · '+ARCHIVE.skip+' duplicates skipped':'')+' · keep the app open just for this part</div>'+
      '<div class="btn-row note-acts"><button class="btn secondary" onclick="cancelArchive()">Stop</button></div>');
    return;
  }
  const spent=(i*0.02).toFixed(2);
  el.innerHTML=noteCard('Transcribing archive', i+' / '+n, '', '<div class="bar note-bar"><i style="width:'+pct+'%"></i></div>'+
    '<div class="note-text">'+ARCHIVE.ok+' transcribed'+(ARCHIVE.fail?' · '+ARCHIVE.fail+' failed':'')+(ARCHIVE.skip?' · '+ARCHIVE.skip+' duplicates skipped':'')+' · ~$'+spent+' spent</div>'+
    '<div class="btn-row note-acts">'+(ARCHIVE.running?'<button class="btn secondary" onclick="pauseArchive()">Pause</button>':'<button class="btn" onclick="resumeArchive()">Resume</button>')+
    '<button class="btn secondary" onclick="cancelArchive()">Stop</button></div>');
}
// the shelf: three ways back into the archive, one line each
function renderMemHome(){
  const el=$('memCard'); if(!el) return;
  const n=(DB.memories||[]).length, cand=(DB.memCand||[]).length, ys=memYears();
  const otd=onThisDayEntries().length;
  const q=DB.journal.filter(j=>j.status==='queued').length, rev=reviewList().length;
  let rows='';
  if(otd) rows+=navRow('openAllOnThisDay()', 'On this day', otd+(otd===1?' year':' years'));
  if(n || cand) rows+=navRow('openMemories()', '52 Memories', ys.length+' years · '+n, cand ? 'Year '+memYearNum(annivNextYr())+' list: '+cand+' collected so far' : '');
  if(rev>0 && q<10) rows+=navRow('openReviewQueue()', 'Worth a second look', rev+(rev===1?' page':' pages'));
  el.innerHTML = rows ? '<div class="sec-body shelf">'+rows+'</div>' : '';
}
const pageFirstWords = (j, n) => clip(String(j.transcription||'').replace(/\[\?\]/g,'').replace(/^\s+/,''), n);
async function renderJournalList(){
  const list = journalFiltered(); const total = DB.journal.length;
  if ($('journalCount')) $('journalCount').textContent = (jState.q||jState.year||jState.review) ? (list.length.toLocaleString()+' of '+total.toLocaleString()) : total.toLocaleString();
  const _dg = total>1 ? dupGroups() : [];
  const _banner = (jState.review
      ? '<div class="banner" onclick="jState.review=false;renderJournalList()"><div class="row-main">Showing flagged pages only: reading gaps, or a date that doesn’t match.</div><b>Clear</b></div>'
      : '')
    + (_dg.length && !jState.review ? '<div class="banner" onclick="openDupReview()"><div class="row-main">'+_dg.length+' possible duplicate group'+(_dg.length>1?'s':'')+'. The same page scanned twice, or a batch run again.</div><b>Review</b></div>' : '');
  if (!total){ $('journalList').innerHTML = '<div class="sec-body"><div class="empty-state"><div class="es-title">No entries yet</div><div class="es-text">Photograph today’s page, or bring in your old journals with Bulk upload.</div></div></div>'; renderEntry(); return; }
  if (!list.length){ $('journalList').innerHTML = _banner+'<div class="sec-body"><div class="empty-state"><div class="es-title">Nothing matches</div><div class="es-text">Try fewer words, or another year.</div></div></div>'; renderEntry(); return; }
  const cap = list.slice(0, 150);
  const rows = await Promise.all(cap.map(async j => {
    const u = await thumbURL(j.id);
    const status = j.status === 'queued' ? (SUPA&&SUPA.expired ? '<span class="jrow-state watch">Waiting on this phone. Sign in to sync.</span>' : '<span class="jrow-state"><span class="spinner"></span>In the cloud queue</span>')
      : j.status === 'analyzing' ? '<span class="jrow-state"><span class="spinner"></span>Analyzing</span>'
      : j.status === 'error' ? '<span class="jrow-state serious">Not transcribed. Tap to retry.</span>'
      : (j.transcription ? '<span class="jrow-text">'+esc(pageFirstWords(j, 150))+'</span>' : '<span class="jrow-state">'+esc(j.summary || j.note || 'Saved')+'</span>');
    const moodBits = [j.mood, ...(j.themes||[]).slice(0,3)].filter(Boolean);
    const flags = reviewFlags(j);
    return { yr:(j.date||'').slice(0,4), html:'<div class="jrow" onclick="openEntry(\''+j.id+'\')">' +
      (u ? '<img class="jthumb" src="'+u+'" alt="">' : '<div class="jthumb"></div>') +
      '<div class="row-main"><div class="jrow-top"><span class="jrow-date">'+fmtDate(j.date)+'</span>' +
      (j.hap > 0 ? '<span class="jrow-score num" aria-label="happiness '+j.hap+', anxiety '+j.anx+'"><i style="background:'+SC_HAP+'"></i>'+j.hap+'<i style="background:'+SC_ANX+'"></i>'+j.anx+(j.hapMine ? '<em>yours</em>' : '')+'</span>' : '') + '</div>' +
      status +
      (flags.length ? '<div class="row-sub watch">'+esc(flags[0])+'</div>' : '') +
      (moodBits.length ? '<div class="row-sub clip">'+moodBits.map(esc).join(' · ')+'</div>' : '') +
      '</div></div>' };
  }));
  let h='', yr=null;
  rows.forEach(r => { if(r.yr !== yr){ if(yr !== null) h+='</div>'; yr=r.yr; h+='<div class="group-h jyear">'+esc(yr||'Undated')+'</div><div class="sec-body">'; } h+=r.html; });
  h+='</div>';
  $('journalList').innerHTML = _banner + h + (list.length>150 ? '<div class="empty">Showing 150 of '+list.length+'. Search to narrow.</div>' : '');
  renderEntry();
}

// ---------- Entry: a pushed screen that reads like a page ----------
let currentEntryId = null;
async function openEntry(id){
  const j = DB.journal.find(x => x.id === id); if (!j) return;
  if($('overlay').classList.contains('open')) closeSheet();
  currentEntryId = id; showView('entry');
}
function entryScoreHTML(j){
  const link = (t) => '<button class="link" onclick="openScoreEdit(\''+j.id+'\')">'+t+'</button>';
  const row = (label, v, tone) => '<div class="score-row"><span class="score-l">'+label+'</span><span class="bar"><i class="'+tone+'" style="width:'+(v*10)+'%"></i></span><span class="score-v num"><b>'+v+'</b>/10</span></div>';
  if(j.hap > 0)
    return '<section class="sec"><div class="sec-h"><h2>How the day scored</h2>'+link(j.hapMine ? 'Change' : 'Disagree?')+'</div><div class="sec-body">'+
      row('Happiness', j.hap, '')+row('Anxiety', j.anx, 'serious')+
      '<div class="data-fresh score-by">'+(j.hapMine ? 'Your own scoring.' : 'Read from what you wrote, on the same scale as your check-ins.')+'</div></div></section>';
  if(j.hap === 0 && j.anx === 0)
    return '<section class="sec"><div class="sec-h"><h2>How the day scored</h2>'+link('Score it yourself')+'</div><div class="sec-body"><div class="data-fresh score-by">This page couldn’t be scored automatically.</div></div></section>';
  if(j.status !== 'done' || !(j.transcription||'').trim()) return '';
  return '<section class="sec"><div class="sec-h"><h2>How the day scored</h2>'+link('Score it now')+'</div><div class="sec-body"><div class="data-fresh score-by">Not scored yet. This runs hourly once the entry reaches the cloud.</div></div></section>';
}
function entryTitle(){ const j = DB.journal.find(x => x.id === currentEntryId); return j && j.date ? fmtDateY(j.date) : ''; }
// re-rendered only when something about the entry has changed, so the page never jumps under the reader
let _entrySig = '';
function renderEntry(){
  const el = $('entryBody'); if(!el || currentView !== 'entry') return;
  const id = currentEntryId, j = DB.journal.find(x => x.id === id);
  if(!j){ el.innerHTML=''; _entrySig=''; navBack(); return; }
  const sig = [id, j.mt, j.status, j.date, j.hap, j.anx, j.hapMine, (j.transcription||'').length, (j.summary||'').length, (j.note||'').length,
    mentionedFriends(j).map(f => f.id+(loggedFromJournal(f, id)?'+':'-')).join(','), !!(SUPA&&SUPA.session), !!(SUPA&&SUPA.expired), !!DB.settings.apiKey].join('|');
  if(sig === _entrySig && el.firstChild) return;
  _entrySig = sig;
  const d = parseD(j.date), okDate = /^\d{4}-\d{2}-\d{2}$/.test(j.date||'');
  const yrs = okDate ? Number(today().slice(0,4)) - d.getFullYear() : 0;
  const act = (fn, label, tone) => '<div class="row act'+(tone ? ' '+tone : '')+'" onclick="'+fn+'"><div class="row-main"><div class="row-title">'+label+'</div></div></div>';
  let h = '<header class="lt"><div class="lt-eyebrow">'+(okDate ? d.toLocaleDateString('en-US',{weekday:'long'}) : 'Undated')+(yrs>0 ? ' · '+yrs+(yrs===1?' year ago':' years ago') : '')+'</div>'+
    '<h1 class="lt-title">'+(okDate ? d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : esc(j.date||''))+'</h1>'+
    '<div class="entry-meta"><button class="link" onclick="quickFixDate(\''+id+'\')">Change date</button></div></header>';
  // where the page is in its life
  if(j.status === 'analyzing') h += '<div class="banner info static"><span class="spinner"></span><div class="row-main">Analyzing this page.</div></div>';
  if(j.status === 'queued') h += (SUPA&&SUPA.expired
    ? '<div class="banner static"><div class="row-main">This entry is only on this phone. The cloud signed you out; sign in again in Settings and it will transcribe.</div></div>'
    : '<div class="banner info static"><span class="spinner"></span><div class="row-main">Waiting for cloud transcription. It runs even with the app closed.</div></div>');
  if(j.status === 'error' && j.refused) h += '<div class="banner static"><div class="row-main">Claude declined to transcribe this page, and retrying won’t help. Use Edit text to type it in yourself.</div></div>';
  // his words first, set like a page
  if(j.transcription || j.note){
    h += '<article class="page">'+
      (j.transcription ? '<div class="page-text">'+esc(j.transcription).replace(/\[\?\]/g, '<mark class="unread">[?]</mark>')+'</div>' : '')+
      (j.note ? '<div class="page-note"><div class="eyebrow">Your note</div><div class="page-text">'+esc(j.note)+'</div></div>' : '')+
      '</article>';
  }
  h += '<figure class="scan" id="entryScan" hidden></figure>';
  if(j.status === 'done' && j.transcription){
    const fl = reviewFlags(j);
    h += '<div class="scan-read"><div class="data-line"><b class="num">'+Math.round(confOf(j)*100)+'%</b> of the words were read without hesitation.</div>'+
      '<div class="data-fresh">'+(String(j.dw||'').trim() ? 'Date written on the page: “'+esc(String(j.dw).trim())+'”' : 'No date written on this page; the date came from its place in the batch.')+'</div>'+
      (fl.length ? '<div class="scan-flags">'+fl.map(f => '<span class="status watch">'+esc(f)+'</span>').join('')+'</div>' : '')+'</div>';
  }
  // what the model made of it
  if(j.summary || j.insight || j.mood || (j.themes||[]).length){
    h += '<section class="sec"><div class="ai">'+aiLabel('Read by Claude')+
      (j.summary ? '<p class="ai-body lead">'+esc(j.summary)+'</p>' : '')+
      (j.insight ? '<p class="ai-body">'+esc(j.insight)+'</p>' : '')+
      ((j.mood || (j.themes||[]).length) ? '<div class="chips ai-tags">'+[j.mood, ...(j.themes||[])].filter(Boolean).map(x => '<span class="tag">'+esc(x)+'</span>').join('')+'</div>' : '')+
      '</div></section>';
  }
  h += entryScoreHTML(j);
  const mf = mentionedFriends(j);
  if(mf.length) h += '<section class="sec"><div class="sec-h"><h2>People mentioned</h2></div><div class="chips">'+
    mf.map(f => { const first = esc(f.name.split(/\s+/)[0]); return loggedFromJournal(f, j.id)
      ? '<span class="status good">Logged to '+first+'</span>'
      : '<button class="chip accent" onclick="logJournalToPerson(\''+f.id+'\',\''+j.id+'\')">Log to '+first+'</button>'; }).join('')+'</div></section>';
  h += '<div id="entryPhotos"></div>';
  h += '<section class="sec"><div class="sec-body">'+
    (j.status !== 'done' && j.status !== 'analyzing' && j.status !== 'queued' ? act('analyzeEntry(\''+id+'\')', DB.settings.apiKey ? 'Analyze with Claude' : 'Analyze (needs an API key in Settings)') : '')+
    act('editEntryText(\''+id+'\')', 'Edit text')+
    (j.status==='done' && j.psync && typeof SUPA!=='undefined' && SUPA && SUPA.session ? act('requeueEntry(\''+id+'\')', 'Re-transcribe in the cloud') : '')+
    ((j.summary||j.transcription) ? act('entryToMemCand(\''+id+'\')', 'Save as a 52 Memories candidate') : '')+
    '</div></section>'+
    '<section class="sec"><div class="sec-body">'+act('confirmDeleteEntry(\''+id+'\')', 'Delete entry', 'danger')+'</div></section>';
  el.innerHTML = h;
  thumbURL(id).then(u => { const f = $('entryScan'); if(u && f && currentEntryId === id){ f.innerHTML = '<img src="'+u+'" alt="The page as scanned"><figcaption>The page as scanned</figcaption>'; f.hidden = false; } });
  if(okDate) setTimeout(() => { if(currentEntryId === id && $('entryPhotos')) loadPhotoStrip('entryPhotos', { day:j.date }); }, 30);
}
function confirmDeleteEntry(id){
  const j = DB.journal.find(x => x.id === id); if(!j) return;
  openSheet('<h3>Delete this entry?</h3><p class="sheet-text">'+esc(fmtDateY(j.date))+'. The page, its photo and what was read from it are removed from this phone and from your account.</p>'+
    '<button class="btn destructive" onclick="deleteEntry(\''+id+'\')">Delete entry</button><button class="btn secondary" onclick="closeSheet()">Keep it</button>');
}
