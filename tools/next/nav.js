// ---------- navigation ----------
// Five tabs, each with its own stack of screens. A screen opened from anywhere
// is pushed onto the tab you are in, and Back (the button, or a swipe from the
// left edge) returns to where you came from, at the scroll position you left.
const VIEWS = { today:'Today', friends:'People', person:'', journal:'Journal', ask:'Ask Ben', memories:'52 Memories',
  entry:'', insights:'Insights', mind:'Mind', body:'Body', money:'Money', firm:'The Firm', places:'Places', review:'Reviews', health:'Health',
  schedule:'Schedule', goals:'Goals', study:'Quest for Knowledge', settings:'Settings', styleguide:'Style guide',
  'set-profile':'Profile', 'set-account':'Account and sync', 'set-notif':'Notifications', 'set-lock':'App lock',
  'set-ai':'Journal AI', 'set-health':'Apple Health', 'set-data':'Backup', 'set-about':'About' };
// the tab a screen belongs to: where it opens when the app is launched straight into it
const TAB_OF = { today:'today', schedule:'today', settings:'today', styleguide:'today',
  'set-profile':'today', 'set-account':'today', 'set-notif':'today', 'set-lock':'today', 'set-ai':'today', 'set-health':'today', 'set-data':'today', 'set-about':'today',
  goals:'goals', study:'goals', friends:'friends', person:'friends', journal:'journal', ask:'journal', memories:'journal', entry:'journal',
  insights:'insights', mind:'insights', body:'insights', money:'insights', firm:'insights', places:'insights', health:'insights', review:'insights' };
const ROOTS = ['today','friends','journal','goals','insights'];
let currentView = 'today';
let currentPersonId = null;
const FOCUS_APPS = { journal:{title:'Journal', tab:'journal'}, friends:{title:'Friends', tab:'friends'}, insights:{title:'Insights', tab:'insights'} };
const FOCUS = (new URLSearchParams(location.search).get('app')||'').toLowerCase();
const FOCUS_APP = FOCUS_APPS[FOCUS] || null;
function applyFocus(){
  if(!FOCUS_APP) return;
  document.body.setAttribute('data-focus', FOCUS);
  document.title = FOCUS_APP.title + ' — LifeOS';
  const mt=document.querySelector('meta[name=\'apple-mobile-web-app-title\']'); if(mt) mt.setAttribute('content', FOCUS_APP.title);
  let link=document.querySelector('link[rel=\'apple-touch-icon\']'); if(!link){ link=document.createElement('link'); link.rel='apple-touch-icon'; document.head.appendChild(link); }
  link.href='icon-'+FOCUS+'.png';
}

const NAV = { tab:'today', stacks:{}, anim:null, swiping:false, still:false };
ROOTS.forEach(r => { NAV.stacks[r] = [{ v:r, y:0 }]; });
const viewEl = v => document.getElementById('view-'+v);
const navStack = () => NAV.stacks[NAV.tab];
const navTop = () => { const s = navStack(); return s[s.length-1]; };
// the element that scrolls: each screen scrolls on its own, so each keeps its place
function scroller(){ return viewEl(currentView) || document.querySelector('main'); }
function navMotion(){ return !NAV.still && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

// showView(v): a tab's first screen switches to that tab; anything else is pushed
// onto the tab you are in, or popped back to if it is already underneath.
//   how = 'tab'   the tab bar: switch tabs and keep that tab's stack as it was left
//   how = 'cold'  a notification or link: open the screen in the tab it belongs to
function showView(v, how){
  if(!viewEl(v)) return;
  navFinish();
  const from = navTop(); from.y = (viewEl(from.v)||{}).scrollTop || 0;
  let kind = 'none';
  if(ROOTS.indexOf(v) >= 0){
    const stack = navStack();
    if(v === NAV.tab){ if(stack.length > 1){ stack.length = 1; kind = 'pop'; } }
    // older code says "go up to my parent screen" by naming it; here that is simply Back
    else if(how !== 'tab' && stack.length > 1 && TAB_OF[from.v] === v){ stack.pop(); kind = 'pop'; }
    else { NAV.tab = v; if(how !== 'tab') NAV.stacks[v].length = 1; kind = 'tab'; }
  } else {
    const home = v === 'ask' ? null : TAB_OF[v];
    if(how === 'cold' && home && home !== 'today' && home !== NAV.tab){ NAV.tab = home; kind = 'tab'; }
    const stack = navStack(), at = stack.map(e => e.v).lastIndexOf(v);
    if(at === stack.length - 1){ /* already showing */ }
    else if(at >= 0){ stack.length = at + 1; if(kind === 'none') kind = 'pop'; }
    else { stack.push({ v:v, y:0 }); if(kind === 'none') kind = 'push'; }
    if(v === 'person') navTop().pid = currentPersonId;
    if(v === 'entry') navTop().eid = currentEntryId;
  }
  navApply(from, kind);
}
function navBack(){
  const s = navStack(); if(s.length < 2) return;
  navFinish();
  const from = navTop(); s.pop(); navApply(from, 'pop');
}
function backHome(){ if(navStack().length > 1) navBack(); else showView(FOCUS_APP ? FOCUS_APP.tab : 'today'); }
// the tab bar: another tab switches to it; the tab you are on goes back to its first screen, then to the top
function tabTap(v){
  if(v !== NAV.tab){ showView(v, 'tab'); return; }
  if(navStack().length > 1){ showView(v); return; }
  const el = viewEl(v); if(!el) return;
  if(el.scrollTo && navMotion()) el.scrollTo({ top:0, behavior:'smooth' }); else el.scrollTop = 0;
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => tabTap(b.dataset.view)));

// the bar title: fixed for most screens, the date for an entry, the name for a person
function navTitle(v){
  if(v === 'entry') return entryTitle();
  if(v === 'person'){ const f = (DB.friends||[]).find(x => x.id === currentPersonId); return f ? f.name : ''; }
  return VIEWS[v] || '';
}
function navChrome(){
  const app = document.querySelector('.app'), stack = navStack(), top = navTop(), el = viewEl(top.v);
  $('topTitle').textContent = navTitle(top.v);
  app.setAttribute('data-view', top.v);
  app.setAttribute('data-large', el && el.querySelector('header.lt') ? '1' : '0');
  const back = $('tbBack'), prev = stack.length > 1 ? stack[stack.length-2] : null;
  if(back){ back.hidden = !prev;
    if(prev){ const t = VIEWS[prev.v] || ''; $('tbBackLabel').textContent = (t && t.length <= 9) ? t : 'Back'; } }
}
function navApply(from, kind){
  const top = navTop(), v = top.v, toEl = viewEl(v), fromEl = viewEl(from.v), app = document.querySelector('.app');
  currentView = v;
  if(v === 'person' && top.pid != null) currentPersonId = top.pid;
  if(v === 'entry' && top.eid != null) currentEntryId = top.eid;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === NAV.tab));
  renderAll();
  if(v === 'styleguide') renderStyleGuide();
  if(v === 'settings') renderSettingsList();
  navChrome();
  document.querySelectorAll('.view').forEach(s => { if(s !== toEl && s !== fromEl) s.classList.remove('active'); });
  toEl.classList.add('active');
  toEl.scrollTop = kind === 'push' ? 0 : (top.y || 0);
  if(fromEl && fromEl !== toEl){
    if((kind === 'push' || kind === 'pop') && navMotion()){
      const cls = kind === 'push' ? ['nav-in','nav-out'] : ['nav-back-in','nav-back-out'];
      toEl.classList.add(cls[0]); fromEl.classList.add(cls[1]);
      NAV.anim = { toEl:toEl, fromEl:fromEl, t:setTimeout(navFinish, 360) };
    } else fromEl.classList.remove('active');
  }
  app.classList.toggle('scrolled', toEl.scrollTop > 36);
}
// settle a slide that is still in flight (the next tap should never wait for it)
function navFinish(){
  const a = NAV.anim; if(!a) return;
  clearTimeout(a.t); NAV.anim = null;
  a.toEl.classList.remove('nav-in','nav-back-in');
  a.fromEl.classList.remove('active','nav-out','nav-back-out');
}

// the large title folds into the bar once the screen has scrolled
(function(){
  const main = document.querySelector('main'), app = document.querySelector('.app');
  if(!main || !app) return;
  main.addEventListener('scroll', e => { const t = e.target;
    if(t && t.id === 'view-'+currentView && !NAV.swiping) app.classList.toggle('scrolled', t.scrollTop > 36); }, { capture:true, passive:true });
})();

// swipe from the left edge to go back; the screen follows the finger
(function(){
  const main = document.querySelector('main'); if(!main) return;
  let g = null;
  const W = () => main.clientWidth || window.innerWidth || 390;
  main.addEventListener('touchstart', e => {
    g = null;
    if(e.touches.length !== 1 || navStack().length < 2 || document.body.classList.contains('sheet-open')) return;
    const t = e.touches[0]; if(t.clientX > 28) return;
    g = { x:t.clientX, y:t.clientY, t0:Date.now(), on:false, dx:0 };
  }, { passive:true });
  main.addEventListener('touchmove', e => {
    if(!g) return;
    const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
    if(!g.on){
      if(Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)){ g = null; return; }
      if(dx < 10) return;
      navFinish();
      const s = navStack(); g.cur = viewEl(s[s.length-1].v); g.prev = viewEl(s[s.length-2].v);
      if(!g.cur || !g.prev || g.cur === g.prev){ g = null; return; }
      g.on = true; NAV.swiping = true;
      g.prev.classList.add('under'); g.prev.scrollTop = s[s.length-2].y || 0; g.cur.classList.add('over','dragging');
    }
    if(e.cancelable) e.preventDefault();
    g.dx = Math.max(0, dx);
    g.cur.style.transform = 'translate3d(' + g.dx + 'px,0,0)';
    g.prev.style.transform = 'translate3d(' + (-28 * (1 - Math.min(1, g.dx / W()))) + '%,0,0)';
  }, { passive:false });
  const end = () => {
    if(!g || !g.on){ g = null; return; }
    const h = g; g = null;
    const go = h.dx > W() * 0.35 || (h.dx > 40 && h.dx / Math.max(1, Date.now() - h.t0) > 0.5);
    h.cur.classList.remove('dragging'); h.cur.classList.add('settling'); h.prev.classList.add('settling');
    h.cur.style.transform = go ? 'translate3d(100%,0,0)' : 'translate3d(0,0,0)';
    h.prev.style.transform = go ? 'translate3d(0,0,0)' : 'translate3d(-28%,0,0)';
    setTimeout(() => {
      h.cur.classList.remove('settling','over'); h.prev.classList.remove('settling','under');
      h.cur.style.transform = ''; h.prev.style.transform = '';
      NAV.swiping = false;
      if(go && navStack().length > 1){ const s = navStack(), from = s[s.length-1]; s.pop(); NAV.still = true; try{ navApply(from, 'pop'); } finally { NAV.still = false; } }
    }, 220);
  };
  main.addEventListener('touchend', end); main.addEventListener('touchcancel', end);
})();

