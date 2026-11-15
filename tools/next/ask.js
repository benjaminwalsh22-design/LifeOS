// ---------- Ask your journal: the on-phone fallback, folded into Ask Ben ----------
// Ask Ben reads the whole record from your account. This older, simpler ask runs
// on the phone alone (your key, straight to the model) and also reads the 52
// Memories, so it stays as the way to ask when signed out or about the memories.
function openAsk(q){
  if(!DB.settings.apiKey){ toast('Add an API key in Settings to ask your journal'); return; }
  if(!DB.journal.length){ toast('No entries yet to ask about'); return; }
  openSheet('<h3>Ask your journal</h3>'+
    '<p class="sheet-text">A quick ask that runs on this phone: Claude reads the entries and 52 Memories that best match your words and answers with dates. Try “When did I write about burnout?”</p>'+
    '<div class="field"><textarea id="askQ" placeholder="Ask anything about your journals">'+esc(typeof q === 'string' ? q : '')+'</textarea></div>'+
    '<button class="btn" onclick="askJournal()">Ask</button><div id="askOut"></div>');
  setTimeout(()=>{ const el=$('askQ'); if(el) el.focus(); },60);
}
function renderAskAlt(){
  const el = $('askAlt'); if(!el) return;
  const signed = !!(SUPA && SUPA.session);
  el.innerHTML = (signed ? '' : '<div class="banner static"><div class="row-main">Ask Ben reads your whole record from your account, and this phone is signed out. You can still ask your journal here.</div></div>')+
    '<div class="sec-body">'+
    '<div class="row nav" onclick="openAsk($(\'askInput\').value.trim())"><div class="row-main"><div class="row-title">Ask your journal on this phone</div><div class="row-sub">Quicker and shallower. Also reads your 52 Memories.</div></div><span class="row-chev">'+CHEV+'</span></div>'+
    (signed ? '' : '<div class="row nav" onclick="showView(\'set-account\')"><div class="row-main"><div class="row-title">Sign in for Ask Ben</div></div><span class="row-chev">'+CHEV+'</span></div>')+
    '</div>';
}
