// ---------- Settings pages that build their own content: notifications, app lock ----------
async function renderNotifCard(){
  const el=$('notifCard'); if(!el) return;
  const p=notifPrefs();
  const supported=('Notification' in window)&&('serviceWorker' in navigator)&&('PushManager' in window);
  const sub=supported? await pushSubRow() : null;
  if(!supported){ el.innerHTML='<div class="empty-state"><div class="es-title">Not available in this browser</div><div class="es-text">On iPhone, add LifeOS to your Home Screen (iOS 16.4 or later) and turn notifications on from inside the app.</div></div>'; return; }
  let h='';
  if(!sub){
    h+='<div class="empty-state"><div class="es-title">Off on this phone</div><div class="es-text">Journal reminders, birthday alerts, the Sunday review and the study nudge, delivered even when the app is closed.'+
      ((SUPA&&SUPA.session)?'':' You need to be signed in first (Account and sync).')+'</div>'+
      '<button class="btn sm" onclick="enablePush()">Turn on for this phone</button></div>';
  } else {
    h+='<div class="status good pane-state">On for this phone</div>'+
      '<div class="ck-label">Journal reminder</div><div class="toggle-row">'+tglBtn('npJournal',p.journalOn,'Remind me')+
      '<select id="npHour" class="tgl">'+[19,20,21,22].map(hh=>'<option value="'+hh+'"'+(p.journalHour===hh?' selected':'')+'>'+(hh>12?hh-12:hh)+' PM</option>').join('')+'</select></div>'+
      '<div class="ck-label">Also send</div><div class="toggle-row">'+tglBtn('npBday',p.birthdaysOn,'Birthdays')+tglBtn('npReview',p.reviewOn,'Sunday review')+tglBtn('npStudy',p.studyOn,'Study, 8 PM')+'</div>'+
      '<button class="btn pane-btn" onclick="savePushPrefs()">Save</button>'+
      '<button class="btn secondary" onclick="testPush()">Send a test notification</button>'+
      '<button class="btn danger" onclick="disablePush()">Turn off for this phone</button>';
  }
  el.innerHTML=h;
}
function renderLockCard(){
  const el=$('lockCard'); if(!el) return;
  const cfg=lockCfg();
  el.innerHTML=(cfg ? '<div class="status good pane-state">On</div>' : '')+
    '<p class="study-text">'+(cfg
      ? ((cfg.cred?'Face ID':'A PIN')+' is required '+(cfg.delay?('after '+(cfg.delay===60?'1 minute':'5 minutes')+' in the background'):'every time you open the app')+'.'
         +(cfg.cred?' Your PIN still works if Face ID fails.':''))
      : 'Keep your journals behind Face ID or a PIN on this phone.')+'</p>'+
    '<button class="btn'+(cfg?' secondary':'')+'" onclick="openLockSetup()">'+(cfg?'Change PIN, Face ID or timing':'Set up app lock')+'</button>'+
    (cfg?'<button class="btn danger" onclick="disableLock()">Turn off</button>':'');
  if(typeof renderSettingsList === 'function' && currentView === 'settings') renderSettingsList();
}
