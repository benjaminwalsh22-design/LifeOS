function applyTheme(){ const th=DB.settings.theme || 'light';
  document.documentElement.setAttribute('data-theme', th);
  try{ localStorage.setItem('lifeos_theme', th); localStorage.removeItem('lifeos_dir'); }catch(e){}   // lifeos_dir: left over from the two-direction preview
  syncThemeColor(); }
// the browser chrome and status strip take the page colour of whichever theme and direction is showing
function syncThemeColor(){ const m=document.getElementById('metaTheme'); if(!m) return;
  const c=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); if(c) m.setAttribute('content', c); }
function setThemePref(th){ DB.settings.theme=th; save(); applyTheme(); const sel=$('setTheme'); if(sel) sel.value=th; if(currentView==='styleguide') renderStyleGuide(); }
