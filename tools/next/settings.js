// ---------- Settings: a grouped list; each row opens its own page ----------
function renderSettingsList(){
  const el = $('settingsList'); if(!el) return;
  const signed = !!(SUPA && SUPA.session);
  const row = (v, title, val, tone) => '<div class="row nav" onclick="showView(\''+v+'\')"><div class="row-main"><div class="row-title">'+title+'</div></div>'+
    (val ? '<span class="row-end'+(tone ? ' '+tone : '')+'">'+esc(val)+'</span>' : '')+'<span class="row-chev">'+CHEV+'</span></div>';
  const group = (label, rows) => '<section class="sec set-group">'+(label ? '<div class="group-h">'+label+'</div>' : '')+'<div class="sec-body">'+rows.join('')+'</div></section>';
  const ver = ($('appVer') && $('appVer').textContent) || '';
  el.innerHTML =
    group('', [ row('set-profile', 'Profile', [DB.profile.name || '', (DB.settings.theme||'light') === 'dark' ? 'Dark' : 'Light'].filter(Boolean).join(' · ')) ]) +
    group('This phone', [
      row('set-account', 'Account and sync', signed ? (SUPA.expired ? 'Signed out' : 'Signed in') : 'Not signed in', signed && !SUPA.expired ? '' : 'watch'),
      row('set-notif', 'Notifications', ''),
      row('set-lock', 'App lock', lockCfg() ? 'On' : 'Off') ]) +
    group('Connections', [
      row('set-ai', 'Journal AI', DB.settings.apiKey ? 'Key saved' : 'No key', DB.settings.apiKey ? '' : 'watch'),
      row('set-health', 'Apple Health', (DB.settings.healthSyncUrl||'').trim() ? 'Live sync on' : 'Off') ]) +
    group('Your data', [ row('set-data', 'Backup', '') ]) +
    group('', [ row('set-about', 'About', ver) ]);
}
