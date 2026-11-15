function memThisMonthHTML(){
  const ym=today().slice(0,7), mm=ym.slice(5);
  const ms=(DB.memories||[]).filter(m=>m.date && m.date.slice(5,7)===mm && m.date<ym);
  if(!ms.length) return '';
  const day=Number(today().slice(8,10)); const seen=new Set(); const pick=[];
  for(let k=0;k<ms.length && pick.length<2;k++){ const m=ms[(day*7+k*13)%ms.length]; if(!seen.has(m.id)){ seen.add(m.id); pick.push(m); } }
  return '<section class="sec mem-strip"><div class="sec-h"><h2>From your 52 Memories</h2></div>'+pick.map(m=>
    '<div class="own" onclick="openMemory(\''+m.id+'\')"><div class="own-date">'+esc(m.title)+' <span>· '+esc(fmtMonth(m.date))+'</span></div>'+
    (m.text?'<div class="own-text">'+esc(clip(m.text,150))+'</div>':'')+'</div>').join('')+'</section>';
}
