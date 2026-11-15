// ---------- sheet: grabber, swipe to dismiss, background held still ----------
let _sheetClear=null, _confirmDone=null;
// a yes/no question as a sheet instead of the browser's own dialog. Resolves true only on the confirming button.
function confirmSheet(title, text, yes, danger){
  return new Promise(resolve => {
    openSheet('<h3>'+esc(title)+'</h3>'+(text ? '<p class="sheet-text">'+esc(text)+'</p>' : '')+
      '<button class="btn'+(danger ? ' destructive' : '')+'" onclick="confirmYes()">'+esc(yes || 'OK')+'</button><button class="btn secondary" onclick="closeSheet()">Cancel</button>');
    _confirmDone = resolve;
    const lk = $('lockscreen'); if(lk && lk.style.display !== 'none') $('overlay').classList.add('top');    // the one question the lock screen itself asks
  });
}
function confirmYes(){ const done=_confirmDone; _confirmDone=null; closeSheet(); if(done) done(true); }
function openSheet(html){
  clearTimeout(_sheetClear);
  const s=$('sheet');
  s.innerHTML = '<div class="grab" aria-hidden="true"></div><button class="closer" aria-label="Close" onclick="closeSheet()">&times;</button>' + html;
  s.style.transform=''; s.scrollTop=0;
  $('overlay').classList.add('open'); document.body.classList.add('sheet-open'); }
function closeSheet(){
  if(_confirmDone){ const done=_confirmDone; _confirmDone=null; done(false); }     // a question that is dismissed is answered no
  $('overlay').classList.remove('open','top'); document.body.classList.remove('sheet-open');
  const s=$('sheet'); s.classList.remove('dragging'); s.style.transform='';
  clearTimeout(_sheetClear);
  // the content stays for the length of the slide-out, then goes
  _sheetClear=setTimeout(()=>{ if(!$('overlay').classList.contains('open')) s.innerHTML=''; }, 340);
}
$('overlay').addEventListener('click', e => { if (e.target === $('overlay')) closeSheet(); });
(function(){
  const s=$('sheet'); let y0=0, x0=0, dy=0, t0=0, armed=false;
  s.addEventListener('touchstart', e=>{
    const tg=e.target; const field=tg.closest && tg.closest('input,textarea,select');
    armed = !field && (!!(tg.closest && tg.closest('.grab')) || s.scrollTop<=0);
    y0=e.touches[0].clientY; x0=e.touches[0].clientX; dy=0; t0=Date.now();
  }, {passive:true});
  s.addEventListener('touchmove', e=>{
    if(!armed) return;
    dy=e.touches[0].clientY-y0; const dx=Math.abs(e.touches[0].clientX-x0);
    if(!s.classList.contains('dragging')){ if(dy<10 || dx>dy){ if(dy<-6) armed=false; return; } s.classList.add('dragging'); }
    if(e.cancelable) e.preventDefault();
    s.style.transform='translateY('+Math.max(0,dy)+'px)';
  }, {passive:false});
  s.addEventListener('touchend', ()=>{
    if(!s.classList.contains('dragging')) return;
    s.classList.remove('dragging');
    if(dy>120 || dy/Math.max(1,Date.now()-t0)>0.6) closeSheet(); else s.style.transform='';
  });
  // keep sheets clear of the keyboard
  if(window.visualViewport){ const fit=()=>document.documentElement.style.setProperty('--vvh', window.visualViewport.height+'px');
    window.visualViewport.addEventListener('resize', fit); fit(); }
  // :active needs a touch listener on iOS to fire at all
  document.addEventListener('touchstart', function(){}, {passive:true});
})();
