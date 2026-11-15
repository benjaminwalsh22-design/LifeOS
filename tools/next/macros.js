function renderMacros(){
  const el=$('macroCard'); if(!el) return;
  const M=DB.settings.macros||{p:150,f:30,s:25};
  const t=macroTotals(today());
  const ms=mealsToday();
  const st=DB.stats[today()]||{};
  const hasExt=!ms.length && (st.protein!=null);
  const P=hasExt?st.protein:t.protein, F=hasExt?st.fiber||0:t.fiber, S=hasExt?st.sugar||0:t.sugar;
  const row=(label,v,tg,invert,cap)=>{ const pct=Math.min(100,Math.round(v/tg*100));
    const cls=invert ? (v<tg?'good':'serious') : (v>=tg?'good':'');
    return '<div class="food-row"><span class="fl">'+label+'</span><div class="bar"><i class="'+cls+'" style="width:'+pct+'%"></i></div>'+
      '<span class="fv">'+v+' <span>/ '+tg+' g'+(cap?' cap':'')+'</span></span></div>'; };
  const kcal=(hasExt?st.kcal:t.kcal)||0;
  let h='<section class="sec"><div class="sec-h"><h2>Food today</h2><span class="meta num">'+Number(kcal).toLocaleString()+' kcal</span></div><div class="sec-body">';
  h+=row('Protein',P,M.p)+row('Fiber',F,M.f)+row('Sugar',S,M.s,true,true);
  if(ms.length) h+='<div class="chips food-meals">'+ms.map(m=>'<span class="chip">'+esc(m.desc)+' <span class="num">'+m.kcal+'</span><span class="x" role="button" aria-label="Remove" onclick="delMeal(\''+m.id+'\')">×</span></span>').join('')+'</div>';
  h+='<div class="food-act"><button class="btn sm secondary" onclick="logMealSheet()">Log a meal</button></div>';
  h+='</div></section>';
  el.innerHTML=h;
}
