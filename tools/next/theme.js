function applyTheme(){ const th=DB.settings.theme || 'light';
  document.documentElement.setAttribute('data-theme', th);
  try{ localStorage.setItem('lifeos_theme', th); }catch(e){}
  syncThemeColor(); }
// the browser chrome and status strip take the page colour of whichever theme and direction is showing
function syncThemeColor(){ const m=document.getElementById('metaTheme'); if(!m) return;
  const c=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); if(c) m.setAttribute('content', c); }
function setDir(d){ try{ if(d==='b') localStorage.setItem('lifeos_dir','b'); else localStorage.removeItem('lifeos_dir'); }catch(e){}
  if(d==='b') document.documentElement.setAttribute('data-dir','b'); else document.documentElement.removeAttribute('data-dir');
  syncThemeColor(); renderAll(); if(currentView==='styleguide') renderStyleGuide(); }
function setThemePref(th){ DB.settings.theme=th; save(); applyTheme(); const sel=$('setTheme'); if(sel) sel.value=th; if(currentView==='styleguide') renderStyleGuide(); }
