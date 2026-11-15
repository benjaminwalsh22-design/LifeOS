// ---------- Quest for Knowledge study hub (redesigned markup; the drills, pools and scoring are untouched) ----------
const segHTML = (items, cur, fn) => '<div class="segc study-seg">'+items.map(s => '<button class="'+(cur===s[0]?'on':'')+'" onclick="'+fn(s[0])+'">'+s[1]+'</button>').join('')+'</div>';
function studyHeadHTML(){
  const left = studyDaysLeft(), S = studyDB(), t = today(), done = !!S.log[t], streak = studyStreak();
  const tonight = studyTonight();
  let h = '<header class="lt"><div class="lt-eyebrow">' + fmtDate(QFK.exam) + ' · vs ' + esc(QFK.opponent) + '</div><h1 class="lt-title">' +
    (left > 1 ? left + ' days to the test' : left === 1 ? 'The test is tomorrow' : left === 0 ? 'Test day' : 'The test was ' + fmtDate(QFK.exam)) + '</h1></header>';
  h += '<div class="sec-body tonight"><div class="row"><div class="row-main"><div class="row-title">' +
    (left >= 0 ? subDot(tonight) + 'Tonight: ' + esc(subName(tonight)) : 'Study log') + '</div>' +
    '<div class="row-sub">' + streak + ' night' + (streak===1?'':'s') + ' running · ' + studyLast7() + ' of the last 7</div></div>' +
    '<button class="btn sm' + (done ? ' done' : '') + '" onclick="studyLogToday()">' + (done ? IC_CHECK + '<span>Studied tonight</span>' : 'Done studying tonight') + '</button></div></div>';
  return h;
}
// a test in progress has the screen to itself
function renderStudy(){
  const el = $('studyBody'); if(!el) return;
  if(currentView !== 'study') return;
  const seg = STUDYV.seg, T = STUDYV.test;
  let h = (seg==='test' && T && T.at < T.qs.length) ? '' : studyHeadHTML() + studySegHTML();
  if(seg==='plan') h += studyPlanHTML();
  else if(seg==='guide') h += studyGuideHTML();
  else if(seg==='cards') h += studyCardsHTML();
  else if(seg==='test') h += studyTestHTML();
  else if(seg==='visual') h += studyVisualHTML();
  else if(seg==='listen') h += studyListenHTML();
  el.innerHTML = h;
  if(seg==='visual' && STUDYV.vis==='photo') studyPhotoLoad();
}
function studySegHTML(){
  return segHTML([['plan','Plan'],['guide','Guide'],['cards','Cards'],['test','Test'],['visual','Visual'],['listen','Listen']], STUDYV.seg, k => 'STUDYV.seg=\''+k+'\';renderStudy()');
}
function subPillsHTML(cur, key, all){
  const subs = (all ? [['all','All']] : []).concat(Object.keys(QFK.subjects).map(k => [k, QFK.subjects[k].short]));
  return segHTML(subs, cur, k => 'STUDYV.' + key + '=\'' + k + '\';' + (key==='sub' ? 'STUDYV.queue=null;' : '') + 'renderStudy()');
}
const subDot = s => '<i class="sub-dot" style="background:' + subColor(s) + '"></i>';
const pctTone = r => r >= .85 ? 'good' : r >= .7 ? 'watch' : 'serious';
// ---- plan ----
function studyPlanHTML(){
  const wk = studyWeek(), t = today();
  let h = '';
  QFK.plan.forEach((w, i) => {
    const cur = i===wk, past = t > w.to;
    h += '<section class="sec plan-wk' + (past && !cur ? ' past' : '') + '"><div class="sec-h"><h2>' + esc(w.title) + '</h2><span class="meta num">' + fmtDate(w.from).slice(5) + ' – ' + fmtDate(w.to).slice(5) + '</span></div>' +
      '<div class="sec-body">' + (cur ? '<div class="plan-now"><span class="status info">This week</span></div>' : '') +
      [['hist','History'],['astro','Astronomy'],['animals','Animals']].map(s => '<div class="fact"><div class="fact-l">' + subDot(s[0]) + s[1] + '</div><div class="fact-v">' + esc(w[s[0]]) + '</div></div>').join('') +
      '<div class="fact"><div class="fact-l">Each night</div><div class="fact-v">' + esc(w.do) + '</div></div></div></section>';
  });
  h += '<section class="sec"><div class="sec-h"><h2>The test</h2></div><div class="sec-body"><p class="study-text">' +
    '120 questions, 40 per subject, 120 minutes: a minute each. 41 are visual, 39 fill in, 40 multiple choice. Half foundational, a third applied, 15% hard. Answer what you know, mark the rest, come back. On visuals answer at the level the prompt asks. Fill-ins forgive spelling, not vagueness ("waning crescent", not "crescent"). ' +
    'Nightly rotation: Sun Animals · Mon History · Tue Astronomy · Wed Animals · Thu History · Fri Astronomy · Sat a mixed test.</p>' +
    '<a class="row act" href="' + QFK.notion + '" target="_blank" rel="noopener"><div class="row-main"><div class="row-title">Rule guide and full study guides in Notion</div></div><span class="row-chev">' + CHEV + '</span></a></div></section>';
  const tests = studyDB().tests.slice(-6).reverse();
  if(tests.length) h += '<section class="sec"><div class="sec-h"><h2>Recent tests</h2></div><div class="sec-body">' + tests.map(x =>
    '<div class="row"><div class="row-main"><div class="row-title plain">' + esc(fmtDate(x.date).slice(5)) + ' · ' + esc(x.sub==='all'?'Mixed':QFK.subjects[x.sub].short) + ' · ' + x.n + ' Qs</div></div><span class="row-end num money-amt">' + Math.round(x.score/x.n*100) + '%</span></div>').join('') + '</div></section>';
  return h;
}
// ---- guide ----
function studyGuideHTML(){
  let h = subPillsHTML(STUDYV.gsub, 'gsub', false);
  const s = STUDYV.gsub;
  h += '<div class="data-fresh study-mix">' + esc(QFK.subjects[s].mix) + '</div>';
  QFK.guide[s].forEach((sec, i) => {
    h += '<details class="fold"' + (i===0?' open':'') + '><summary><b>' + esc(sec.h) + '</b>' + (sec.q ? '<span class="meta num">' + sec.q + ' Qs</span>' : '') + '</summary>' +
      '<div class="fold-body">' + sec.pts.map(p => '<p>' + mdb(p) + '</p>').join('') + '</div></details>';
  });
  return h;
}
// ---- cards (Leitner boxes) ----
function cardId(i){ return 'c' + i; }
function cardsDue(){
  const S = studyDB(), t = today();
  return QFK.cards.map((c, i) => ({ c, i })).filter(x => (STUDYV.sub==='all' || x.c[0]===STUDYV.sub))
    .filter(x => { const st = S.cards[cardId(x.i)]; return !st || !st.due || st.due <= t; });
}
function studyCardsHTML(){
  let h = subPillsHTML(STUDYV.sub, 'sub', true);
  if(!STUDYV.queue){ STUDYV.queue = shuffle(cardsDue().map(x => x.i)); STUDYV.card = null; STUDYV.flipped = false; }
  const S = studyDB();
  const boxes = [0,0,0,0,0,0];
  QFK.cards.forEach((c, i) => { if(STUDYV.sub!=='all' && c[0]!==STUDYV.sub) return; const st = S.cards[cardId(i)]; boxes[st ? Math.min(5, st.box||1) : 0]++; });
  const tally = boxes[0] + ' new · ' + (boxes[1]+boxes[2]) + ' learning · ' + (boxes[3]+boxes[4]+boxes[5]) + ' solid';
  if(STUDYV.card==null && STUDYV.queue.length) STUDYV.card = STUDYV.queue[0];
  if(STUDYV.card==null){
    return h + '<div class="sec-body"><div class="empty-state"><div class="es-title">Nothing due' + (STUDYV.sub!=='all' ? ' in ' + esc(QFK.subjects[STUDYV.sub].short) : '') + '</div>' +
      '<div class="es-text">Cards come back on a schedule: a card you know waits 1, 2, 4, 8 then 16 days. ' + tally + '.</div>' +
      '<button class="btn sm secondary" onclick="studyCardsReset()">Drill everything anyway</button></div></div>';
  }
  const c = QFK.cards[STUDYV.card], st = S.cards[cardId(STUDYV.card)] || {};
  h += '<div class="flash" onclick="if(!STUDYV.flipped){STUDYV.flipped=true;renderStudy()}">' +
    '<div class="flash-top"><span>' + subDot(c[0]) + esc(QFK.subjects[c[0]].short) + '</span><span class="num">' + STUDYV.queue.length + ' left today · box ' + (st.box||'new') + '</span></div>' +
    '<div class="flash-q">' + esc(c[1]) + '</div>' +
    (STUDYV.flipped ? '<div class="flash-a">' + esc(c[2]) + '</div>' : '<div class="flash-hint">tap to show the answer</div>') + '</div>';
  if(STUDYV.flipped) h += '<div class="btn-row study-acts"><button class="btn secondary" onclick="studyGrade(false)">Again</button><button class="btn" onclick="studyGrade(true)">Got it</button></div>';
  h += '<div class="data-fresh study-tally">' + tally + '</div>';
  return h;
}
// ---- practice tests ----
function studyTestHTML(){
  const T = STUDYV.test;
  if(!T){
    let h = subPillsHTML(STUDYV.sub, 'sub', true);
    h += '<div class="sec-body"><p class="study-text">Half multiple choice, half fill in, pulled at random from the pools (the baseline exam, the practice sets, and the guides). Fill-ins are checked the way the wives will check them: spelling forgiven, vagueness not. You can overrule the checker.</p>' +
      '<div class="btn-row study-acts"><button class="btn" onclick="studyTestStart(STUDYV.sub,20)">20 questions</button>' +
      '<button class="btn secondary" onclick="studyTestStart(STUDYV.sub,' + (STUDYV.sub==='all'?60:40) + ')">' + (STUDYV.sub==='all'?'60, like the baseline':'40, a full section') + '</button></div></div>';
    const tests = studyDB().tests.slice().reverse().slice(0, 10);
    if(tests.length){
      h += '<section class="sec"><div class="sec-h"><h2>Scores</h2></div><div class="sec-body">' + tests.map(x =>
        '<div class="row"><div class="row-main"><div class="row-title plain">' + esc(fmtDate(x.date).slice(5)) + ' · ' + esc(x.sub==='all'?'Mixed':QFK.subjects[x.sub].short) + '</div><div class="row-sub">' + x.n + ' Qs · ' + Math.round(x.ms/60000) + ' min</div></div>' +
        '<span class="row-end num score ' + pctTone(x.score/x.n) + '">' + x.score + '/' + x.n + '</span></div>').join('') +
        '<div class="data-fresh study-tally">85% and up is winning territory. Below 70% in a subject: back to that guide.</div></div></section>';
    }
    return h;
  }
  if(T.at >= T.qs.length) return studyTestResultHTML();
  const x = T.qs[T.at], q = x.q;
  let h = '<div class="quiz-top"><span>' + subDot(x.s) + '<span class="num">' + (T.at+1) + ' of ' + T.qs.length + '</span> · ' + esc(QFK.subjects[x.s].short) + '</span><span class="num">' + Math.round((Date.now()-T.start)/60000) + ' min</span></div>' +
    '<div class="bar quiz-bar"><i style="width:' + Math.round(T.at/T.qs.length*100) + '%"></i></div>';
  h += '<div class="sec-body quiz"><div class="quiz-q">' + esc(q[1]) + '</div>';
  if(x.kind==='mc'){
    h += '<div class="opts">' + q[2].map((o, i) => {
      let cls = ''; if(T.picked!=null){ if(i===q[3]) cls = ' right'; else if(i===T.picked) cls = ' wrong'; }
      return '<button class="opt' + cls + '" onclick="studyPick(' + i + ')"><span class="opt-k">' + 'ABCD'[i] + '</span><span class="opt-t">' + esc(o) + '</span></button>'; }).join('') + '</div>';
    if(T.picked!=null) h += (q[4] ? '<div class="quiz-note">' + esc(q[4]) + '</div>' : '') + '<button class="btn" onclick="studyNext()">Next</button>';
  } else {
    if(!T.shown) h += '<div class="field quiz-field"><input id="studyAns" placeholder="Your answer" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" value="' + esc(T.typed) + '" onkeydown="if(event.key===\'Enter\')studyCheck()"></div><button class="btn" onclick="studyCheck()">Check</button>';
    else {
      const ok = T.answers[T.at].ok;
      h += '<div class="quiz-wrote">You wrote: <b>' + esc(T.typed||'—') + '</b></div>' +
        '<div class="verdict ' + (ok?'right':'wrong') + '">' + (ok?'Right':'Not quite') + ' — <b>' + esc(q[2][0]) + '</b>' + (q[2].length>1 ? ' <span class="also">(also: ' + esc(q[2].slice(1).join(', ')) + ')</span>' : '') + '</div>' +
        (q[3] ? '<div class="quiz-note">' + esc(q[3]) + '</div>' : '') +
        '<div class="btn-row study-acts">' + (!ok ? '<button class="btn secondary" onclick="studyOverride()">I had it</button>' : '') + '<button class="btn" onclick="studyNext()">Next</button></div>';
    }
  }
  h += '</div><div class="quiz-quit"><button class="link" onclick="studyQuitAsk()">Quit this test</button></div>';
  return h;
}
function studyQuitAsk(){
  openSheet('<h3>Quit this test?</h3><p class="sheet-text">Your answers so far are dropped and nothing is scored.</p>'+
    '<button class="btn destructive" onclick="closeSheet();STUDYV.test=null;renderStudy()">Quit</button><button class="btn secondary" onclick="closeSheet()">Keep going</button>');
}
function studyTestResultHTML(){
  const T = STUDYV.test, score = T.answers.filter(a=>a.ok).length, n = T.qs.length, pct = Math.round(score/n*100);
  const by = {}; T.answers.forEach(a => { by[a.s] = by[a.s] || [0,0]; by[a.s][1]++; if(a.ok) by[a.s][0]++; });
  let h = '<div class="sec-body result"><div class="data-fresh">' + Math.round((Date.now()-T.start)/60000) + ' minutes</div>' +
    '<div class="hero-num score ' + pctTone(score/n) + '">' + pct + '%</div><div class="data-line">' + score + ' of ' + n + '</div>' +
    '<div class="result-by">' + Object.keys(by).map(s => '<div class="row"><div class="row-main"><div class="row-title plain">' + subDot(s) + esc(QFK.subjects[s].name) + '</div></div><span class="row-end num money-amt">' + by[s][0] + '/' + by[s][1] + '</span></div>').join('') + '</div>' +
    '<button class="btn" onclick="STUDYV.test=null;renderStudy()">Done</button></div>';
  const missed = T.qs.filter((x, i) => !T.answers[i].ok);
  if(missed.length) h += '<section class="sec"><div class="sec-h"><h2>Missed</h2><span class="meta num">' + missed.length + '</span></div><div class="sec-body">' + missed.map(x =>
    '<div class="fact"><div class="fact-l">' + esc(x.q[1]) + '</div><div class="fact-v"><b>' + esc(x.kind==='mc' ? x.q[2][x.q[3]] : x.q[2][0]) + '</b></div></div>').join('') + '</div></section>';
  return h;
}
// ---- visual drills ----
function studyVisualHTML(){
  const kinds = [['const','Constellations'],['moon','Moon'],['eclipse','Eclipses'],['solar','Solar system'],['life','Star life'],['galaxy','Galaxies'],['photo','Photos']];
  let h = '<div class="chips scroll">' + kinds.map(k => '<button class="chip' + (STUDYV.vis===k[0]?' on':'') + '" onclick="STUDYV.vis=\'' + k[0] + '\';STUDYV.visQ=null;renderStudy()">' + k[1] + '</button>').join('') + '</div>';
  if(!STUDYV.visQ) STUDYV.visQ = studyVisMake(STUDYV.vis);
  const Q = STUDYV.visQ;
  if(STUDYV.vis==='photo') h += '<div class="chips scroll">' + Object.keys(QFK.visual.photos).map(g => '<button class="chip' + (STUDYV.photoGroup===g?' on':'') + '" onclick="STUDYV.photoGroup=\'' + g + '\';STUDYV.visQ=null;renderStudy()">' + g[0].toUpperCase()+g.slice(1) + '</button>').join('') + '</div>';
  h += '<div class="sec-body quiz"><div class="quiz-prompt">' + esc(Q.prompt) + '</div><div class="vis-fig">' + Q.svg + '</div>' +
    '<div class="opts two">' + Q.options.map((o, i) => {
      let cls = ''; if(Q.picked!=null){ if(o===Q.answer) cls = ' right'; else if(i===Q.picked) cls = ' wrong'; }
      return '<button class="opt' + cls + '" onclick="studyVisPick(' + i + ')"><span class="opt-t">' + esc(o) + '</span></button>'; }).join('') + '</div>' +
    (Q.picked!=null ? (Q.note ? '<div class="quiz-note">' + esc(Q.note) + '</div>' : '') + '<button class="btn" onclick="STUDYV.visQ=null;renderStudy()">Next</button>' : '') +
    '<div class="data-fresh study-tally num">' + STUDYV.visScore[0] + ' of ' + STUDYV.visScore[1] + ' this session</div></div>';
  if(STUDYV.vis==='const') h += '<div class="data-fresh study-mix">Simplified patterns, not to scale; the exam may rotate them. The bright ring marks the key star.</div>';
  return h;
}
function lifeSVG(item){
  return '<div class="life"><div class="life-l">' + esc(item.label) + '</div>' +
    item.seq.map((s, i) => '<span class="life-s' + (s==='?' ? ' ask' : '') + '">' + esc(s) + '</span>' + (i<item.seq.length-1 ? '<span class="life-to">' + CHEV + '</span>' : '')).join('') + '</div>';
}
// ---- listening ----
function studyListenHTML(){
  let h = '<div class="data-fresh study-mix">Audio covers concepts and stories; 41 of 120 questions are pictures, so pair it with the Visual drills. Links open the show’s page or a search, so nothing here goes stale.</div>';
  Object.keys(QFK.subjects).forEach(s => {
    h += '<section class="sec"><div class="sec-h"><h2>' + subDot(s) + esc(QFK.subjects[s].name) + '</h2></div><div class="sec-body">' +
      QFK.listen.filter(l => l.s===s).map(l => '<a class="row" href="' + esc(l.url) + '" target="_blank" rel="noopener"><div class="row-main"><div class="row-title">' + esc(l.title) + '</div><div class="row-sub">' + esc(l.who) + '</div></div><span class="row-chev">' + CHEV + '</span></a>').join('') + '</div></section>';
  });
  return h;
}
