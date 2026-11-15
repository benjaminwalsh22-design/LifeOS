// ---------- charts: one language for every inline chart ----------
// pts: [{label, v}] where v may be null for a gap. Direct labels, a quiet
// average line, a marker on the latest reading, touch to scrub.
let _chartSeq=0; const CHARTS={};
function dsChart(pts, o){
  o=o||{}; const id='ch'+(++_chartSeq); const W=320, H=o.h||132, L=2, R=2, T=14, B=20;
  const fmt=o.fmt||(v=>(Math.round(v*10)/10).toLocaleString()+(o.unit||''));
  const vals=pts.map(p=>p.v).filter(v=>v!=null);
  if(vals.length<2) return '<div class="empty-state"><div class="es-title">Not enough readings yet.</div><div class="es-text">'+esc(o.emptyText||'A trend needs at least two. This fills in on its own.')+'</div></div>';
  let lo=Math.min(...vals), hi=Math.max(...vals); if(lo===hi){ lo-=1; hi+=1; } const pad=(hi-lo)*.14; lo-=pad; hi+=pad;
  const X=i=>L+(i/(pts.length-1))*(W-L-R), Y=v=>T+(1-(v-lo)/(hi-lo))*(H-T-B);
  let d='', pen=false, dots='';
  pts.forEach((p,i)=>{ if(p.v==null){ pen=false; return; }
    const alone=(i===0||pts[i-1].v==null)&&(i===pts.length-1||pts[i+1].v==null);
    if(alone) dots+='<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="2" style="fill:'+(o.color||'var(--c1)')+'"/>';
    d+=(pen?' L ':' M ')+X(i).toFixed(1)+' '+Y(p.v).toFixed(1); pen=true; });
  let last=pts.length-1; while(last>0 && pts[last].v==null) last--;
  const mean=vals.reduce((a,b)=>a+b,0)/vals.length, col=o.color||'var(--c1)';
  if(_chartSeq % 40 === 0) Object.keys(CHARTS).forEach(k => { if(!document.getElementById(k)) delete CHARTS[k]; });   // forget charts that have left the page
  CHARTS[id]={ pts, X, Y, fmt, last, W };
  return '<div class="chart-wrap" id="'+id+'"><div class="chart-read"><span class="cr-l">'+esc(pts[last].label)+'</span><b class="cr-v">'+esc(fmt(pts[last].v))+'</b></div>'+
    '<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(o.label||'Trend')+'" onpointerdown="chartScrub(event,\''+id+'\')" onpointermove="chartScrub(event,\''+id+'\')" onpointerup="chartScrub(null,\''+id+'\')" onpointerleave="chartScrub(null,\''+id+'\')">'+
    '<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(mean).toFixed(1)+'" y2="'+Y(mean).toFixed(1)+'"/>'+

    '<path class="line" d="'+d.trim()+'" style="stroke:'+col+'"/>'+dots+
    '<line class="now" x1="'+X(last).toFixed(1)+'" x2="'+X(last).toFixed(1)+'" y1="'+T+'" y2="'+(H-B)+'"/>'+
    '<circle class="pt" cx="'+X(last).toFixed(1)+'" cy="'+Y(pts[last].v).toFixed(1)+'" r="4.5" style="fill:'+col+'"/>'+
    '<text x="'+L+'" y="'+(H-4)+'">'+esc(pts[0].label)+'</text><text x="'+(W/2)+'" y="'+(H-4)+'" text-anchor="middle">average '+esc(fmt(mean))+'</text><text x="'+(W-R)+'" y="'+(H-4)+'" text-anchor="end" class="lab">'+esc(o.nowLabel||pts[pts.length-1].label)+'</text>'+
    '</svg></div>';
}
function chartScrub(ev, id){
  const c=CHARTS[id], el=$(id); if(!c||!el) return;
  let i=c.last;
  if(ev){ const r=el.querySelector('svg').getBoundingClientRect(); const f=Math.max(0,Math.min(1,(ev.clientX-r.left)/Math.max(1,r.width)));
    i=Math.round(f*(c.pts.length-1)); let k=0; while(c.pts[i].v==null && k<c.pts.length){ k++; const a=i-k, b=i+k; if(a>=0&&c.pts[a].v!=null){ i=a; break; } if(b<c.pts.length&&c.pts[b].v!=null){ i=b; break; } } }
  if(c.pts[i].v==null) return;
  const pt=el.querySelector('.pt'), now=el.querySelector('.now');
  pt.setAttribute('cx', c.X(i).toFixed(1)); pt.setAttribute('cy', c.Y(c.pts[i].v).toFixed(1));
  now.setAttribute('x1', c.X(i).toFixed(1)); now.setAttribute('x2', c.X(i).toFixed(1));
  el.querySelector('.cr-l').textContent=c.pts[i].label; el.querySelector('.cr-v').textContent=c.fmt(c.pts[i].v);
}

// ---------- style guide: the kit on one screen ----------
function renderStyleGuide(){
  const el=$('guideBody'); if(!el) return;
  const th=DB.settings.theme||'light';
  const sw=(name,tok)=>'<div class="sw"><i style="background:var('+tok+')"></i>'+name+'</div>';
  const sec=(title,body,meta)=>'<section class="sec"><div class="sec-h"><h2>'+title+'</h2>'+(meta?'<span class="meta">'+meta+'</span>':'')+'</div>'+body+'</section>';
  const demo=[['Oct 17',52],['Oct 20',55],['Oct 23',49],['Oct 26',null],['Oct 29',58],['Nov 1',61],['Nov 4',57],['Nov 7',54],['Nov 10',60],['Nov 13',63],['Today',59]].map(p=>({label:p[0],v:p[1]}));
  let h='<header class="lt"><div class="lt-eyebrow">LifeOS redesign</div><h1 class="lt-title">Style guide</h1></header>';
  h+='<div class="sg-stack"><div><div class="field"><label>Theme</label><div class="segc"><button class="'+(th==='light'?'on':'')+'" onclick="setThemePref(\'light\')">Light</button><button class="'+(th==='dark'?'on':'')+'" onclick="setThemePref(\'dark\')">Dark</button></div></div></div></div>';
  h+=sec('Colour','<div class="sg-swatches">'+sw('bg','--bg')+sw('surface','--surface')+sw('raised','--surface-raised')+sw('sunken','--surface-sunken')+
     sw('ink','--ink')+sw('ink-2','--ink-2')+sw('ink-muted','--ink-muted')+sw('accent','--accent')+
     sw('good','--good')+sw('watch','--watch')+sw('serious','--serious')+sw('ai wash','--ai-wash')+
     sw('series 1','--c1')+sw('series 2','--c2')+sw('series 3','--c3')+sw('series 4','--c4')+'</div>','semantic tokens');
  h+=sec('Type','<div class="sg-type">'+
     '<div><span style="font-family:var(--title-font);font-size:var(--t-h1);font-weight:var(--w-semi);letter-spacing:var(--title-track);line-height:var(--lh-tight)">Large title</span><small>34</small></div>'+
     '<div><span style="font-family:var(--title-font);font-size:var(--t-h2);font-weight:var(--w-semi);letter-spacing:var(--title-track)">Screen title</span><small>26</small></div>'+
     '<div><span style="font-family:var(--title-font);font-size:var(--t-h3);font-weight:var(--w-semi);letter-spacing:var(--title-track)">Section title</span><small>20</small></div>'+
     '<div><span style="font-size:var(--t-body)">Body and controls</span><small>17</small></div>'+
     '<div><span style="font-size:var(--t-sub);font-weight:var(--w-semi)">Row title</span><small>15</small></div>'+
     '<div><span style="font-size:var(--t-foot);color:var(--ink-muted)">Secondary line, freshness</span><small>13</small></div>'+
     '<div><span class="eyebrow">Label</span><small>12</small></div></div>','seven sizes');
  h+=sec('Three voices','<div class="sg-stack">'+
     '<div><span class="eyebrow">1 · My own words</span><div class="own" style="margin-top:var(--s2)"><div class="own-date">7 years ago <span>· Fri, Nov 15, 2019</span></div><div class="own-text">Up before the kids. Read for twenty minutes, then wrote this. The deal closes Friday and I keep noticing I am calmer on the days I walk first.</div></div></div>'+
     '<div><span class="eyebrow">2 · Measured</span><div class="stats" style="margin-top:var(--s2)"><div><div class="stat-label">Sleep</div><div class="stat-value">7.4<span class="unit">h</span></div><div class="stat-fresh">Oura · this morning</div></div>'+
       '<div><div class="stat-label">HRV</div><div class="stat-value">59<span class="unit">ms</span> <span class="delta good">up 4</span></div><div class="stat-fresh stale">Oura · 3 days ago</div></div></div></div>'+
     '<div><span class="eyebrow">3 · Written by the model</span><div class="ai" style="margin-top:var(--s2)">'+aiLabel('What stands out','toast(\'Reading it again\')','moderate')+'<p class="ai-body">On weeks with three or more workouts your evening anxiety scores run about a point lower. Eleven weeks support it; four do not.</p></div></div></div>');
  h+=sec('Buttons','<div class="sg-stack"><button class="btn" onclick="guideSheet()">Primary · open a sheet</button><button class="btn secondary" onclick="toast(\'Saved\')">Secondary · show a toast</button>'+
     '<div class="btn-row"><button class="btn quiet">Quiet</button><button class="btn danger">Destructive</button></div>'+
     '<div class="chips"><button class="btn sm">Small</button><button class="btn sm secondary">Small secondary</button></div></div>');
  h+=sec('Rows','<div class="sec-body"><div class="row"><span class="dot watch"></span><div class="row-main"><div class="row-title">Marcus is 9 days past your monthly rhythm</div><div class="row-sub">Last spoke Oct 6</div><div class="notice-act"><button class="btn sm secondary">Draft a hello</button></div></div></div>'+
     '<div class="row" onclick="toast(\'Row tapped\')"><span class="av" style="background:var(--c3)">A</span><div class="row-main"><div class="row-title">Annalise</div><div class="row-sub clip">Anniversary in 12 days</div></div><span class="row-chev">'+CHEV+'</span></div>'+
     '<div class="row"><span class="row-time">9:30 AM</span><div class="row-main"><div class="row-title">Closing call</div></div><span class="cal-tag">Calendar</span></div></div>');
  h+=sec('Controls','<div class="sg-stack"><div class="segc"><button class="on">Week</button><button>Month</button><button>Year</button></div>'+
     '<div class="chips"><button class="chip on">All</button><button class="chip">History</button><button class="chip">Astronomy</button><button class="chip">Animals</button></div>'+
     '<div class="chips"><span class="status good">On pace</span><span class="status watch">38 days since contact</span><span class="status serious">Not transcribed</span><span class="status info">Queued</span><span class="status">Draft</span></div>'+
     '<div><div class="bar"><i style="width:62%"></i></div></div><div><div class="bar"><i class="good" style="width:100%"></i></div></div>'+
     '<div class="sec-body"><div class="count-row hit"><span class="count-mark">'+IC_CHECK+'</span><div class="row-main"><div class="row-title">Date night</div><div class="row-sub">Friday or Saturday</div></div><span class="count-n">1/1</span></div>'+
       '<div class="count-row"><span class="count-mark">3</span><div class="row-main"><div class="row-title">Gym, 8 sessions</div><div class="row-sub">On pace · last Nov 12</div></div><span class="count-n">3/8</span></div></div>'+
     '<div class="row"><div class="row-main"><div class="row-title">Study reminder, 8 PM</div></div><button class="switch" role="switch" aria-checked="true" onclick="this.setAttribute(\'aria-checked\', this.getAttribute(\'aria-checked\')===\'true\'?\'false\':\'true\')"></button></div>'+
     '<div class="field"><label>Happiness this evening</label><input type="range" class="slider" min="0" max="10" value="7"></div>'+
     '<div class="field"><label>Text field</label><input placeholder="Gym, dinner with Mom…"></div></div>');
  h+=sec('Banner','<div class="banner" style="margin-left:0;margin-right:0"><span>Signed out of the cloud. New entries are waiting on this phone. <b>Sign in again</b></span></div>');
  h+=sec('Chart','<div>'+dsChart(demo,{unit:' ms',label:'HRV, last four weeks',nowLabel:'Today'})+'</div>','drag to read a day');
  h+=sec('States','<div class="sg-stack"><div><span class="eyebrow">Loading</span><div style="margin-top:var(--s2)">'+skelLines('w60','w100','w80')+'</div></div>'+
     '<div><span class="eyebrow">Empty</span><div class="empty-state"><div class="es-title">No entries yet.</div><div class="es-text">Scan a page and it shows up here, transcribed.</div><button class="btn sm secondary">Scan a page</button></div></div>'+
     '<div><span class="eyebrow">Stale</span><div class="stat-fresh stale" style="margin-top:var(--s2)">Ring last synced 3 days ago</div></div>'+
     '<div><span class="eyebrow">Error</span><div class="error-state"><div class="es-title">Couldn’t reach the cloud.</div><div class="es-text">What is on this phone is still here. It will try again on its own.</div><button class="btn sm secondary">Try now</button></div></div></div>');
  el.innerHTML=h;
}
function guideSheet(){
  openSheet('<h3>A bottom sheet</h3><p class="row-sub" style="margin-bottom:var(--s4)">Grabber on top, drag down to dismiss, the page behind stays still, and it keeps clear of the keyboard.</p>'+
    '<div class="field"><label>Title</label><input placeholder="Type here"></div><button class="btn" onclick="closeSheet();toast(\'Saved\')">Save</button><button class="btn quiet" onclick="closeSheet()">Cancel</button>');
}
