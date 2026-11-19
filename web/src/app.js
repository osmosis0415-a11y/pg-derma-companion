/* ===== Router, lock screen, boot ===== */
const ROUTES = [
  [/^home$/, vHome, 'home'], [/^patients$/, vPatients, 'patients'], [/^patient\/([\w-]+)$/, vPatient, 'patients', ['id']],
  [/^add$/, vAdd, 'add'], [/^visit\/([\w-]+)$/, vVisit, 'patients', ['id']],
  [/^score\/([\w-]+)\/(\w+)(?:\/([\w-]+))?$/, vScore, 'patients', ['id', 'scale', 'sid']],
  [/^map\/([\w-]+)$/, vMap, 'patients', ['id']], [/^wa\/([\w-]+)$/, vWA, 'patients', ['id']],
  [/^cam\/([\w-]+)$/, vCam, 'vault', ['id']], [/^vault$/, vVault, 'vault'], [/^photo\/([\w-]+)$/, vPhoto, 'vault', ['id']],
  [/^deid\/([\w-]+)$/, vDeid, 'vault', ['id']], [/^compare\/([\w-]+)$/, vCompare, 'vault', ['id']],
  [/^inv$/, vInv, 'more'], [/^cal$/, vCal, 'more'], [/^logbook$/, vLogbook, 'more'], [/^logadd$/, vLogAdd, 'more'], [/^targets$/, vTargets, 'more'],
  [/^thesis$/, vThesis, 'more'], [/^thesis-setup$/, vThesisSetup, 'more'], [/^analytics$/, vAnalytics, 'more'],
  [/^formulary$/, vFormulary, 'more'], [/^checklists$/, vChecklists, 'more'], [/^more$/, vMore, 'more'], [/^settings$/, vSettings, 'more'], [/^batch$/, vBatch, 'community'], [/^admin$/, vAdmin, 'more'], [/^study$/, vStudy, 'study'], [/^feed$/, vFeed, 'study'], [/^community$/, vCommunity, 'community'], [/^notifs$/, vNotifs, 'community'], [/^dms$/, vDMs, 'community'], [/^dm\/([\w-]+)$/, vDM, 'community', ['id']], [/^story-new$/, vStoryNew, 'community'], [/^people$/, vPeople, 'community'], [/^flist\/([\w-]+)$/, vFList, 'community', ['id']], [/^compose$/, vCompose, 'community'], [/^post\/([\w-]+)$/, vPost, 'community', ['id']], [/^u\/([\w-]+)$/, vUser, 'community', ['id']], [/^study-run$/, vStudyRun, 'study'], [/^study-set$/, vStudySet, 'study']
];
function render() {
  if (!D) return;
  stopCam(); if (scanStream) ACT.scanstop(); closeSheet(); if (typeof Feed !== 'undefined' && $('#feedui')) Feed.close(); if (typeof threadUnsub !== 'undefined' && threadUnsub) { try { threadUnsub(); } catch (e) {} threadUnsub = null; } if (typeof DM !== 'undefined' && DM.mUnsub) { try { DM.mUnsub(); } catch (e) {} DM.mUnsub = null; }
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = h.split('?');
  ROUTE = { path: path.split('/')[0], q: Object.fromEntries(new URLSearchParams(qs || '')) };
  if (ROUTE.path !== 'batch' && typeof Cloud !== 'undefined') Cloud.stop();
  if (ROUTE.path !== 'admin' && adminUnsub) { adminUnsub(); adminUnsub = null; }
  const na = $('#navadmin'); if (na) na.hidden = !amAdmin();
  const mv = $('#meav'); if (mv) mv.textContent = initials(D.settings.name || 'PG');
  for (const [re, fn, tab, keys] of ROUTES) {
    const m = path.match(re);
    if (m) { (keys || []).forEach((k, i) => ROUTE[k] = m[i + 1]); $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab)); window.scrollTo(0, 0); fn(); return; }
  }
  go('#/home');
}

/* ---------- Lock screen ---------- */
/* Same account on a new phone: just the PIN (data comes back from the account's encrypted Google Drive backup). */
async function showReturning() {
  const g = Gate.cached || {}, first = (g.name || '').replace(/^Dr\.?\s+/i, '').split(' ')[0];
  $('#app').hidden = true; $('#lock').hidden = false;
  $('#lock').innerHTML = authShell(`<h2 class="ah">Welcome back${first ? ', Dr. ' + esc(first) : ''}</h2><p class="small muted">New phone? Enter your PIN, and your data comes back from your Google Drive backup. No new account needed.</p>
    <div class="who">${g.photo ? `<img src="${esc(g.photo)}" alt="" referrerpolicy="no-referrer">` : `<span>${esc(initials(g.name || g.email))}</span>`}<div><b>${esc(g.name || '')}</b><small>${esc(g.email || '')}</small></div></div>
    <div class="pindots" id="pdots"></div><input id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Your PIN"><button class="btn abtn" id="unlock">Unlock</button><p id="lerr" class="err"></p>
    <p class="tiny muted">Google may ask once to let PG Derma open its backup folder in your Drive.</p>
    <button class="link small" id="fresh">Start fresh on this phone instead</button>`);
  const pin = $('#pin'), dots = () => { const n = pin.value.length; $('#pdots').innerHTML = Array.from({ length: Math.max(4, Math.min(8, n)) }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join(''); };
  pin.addEventListener('input', dots); dots(); pin.focus(); Drive.loadGis().catch(() => {});
  const go2 = async () => {
    const v = pin.value; $('#lerr').textContent = ''; if (v.length < 4) return $('#lerr').textContent = 'Enter your PIN';
    $('#unlock').disabled = true; $('#unlock').textContent = 'Restoring…';
    try {
      await Drive.connect(g.email, '');
      const m = await Drive.manifest(); if (!m) throw new Error('No backup found in this Google Drive. Tap "Start fresh" or turn on backup on your old phone.');
      await restoreWithPin(v, m);
    } catch (e) { Vault.key = null; $('#lerr').textContent = e.message || 'Could not restore'; const pd = $('#pdots'); pd.classList.remove('shake'); void pd.offsetWidth; pd.classList.add('shake'); $('#unlock').disabled = false; $('#unlock').textContent = 'Unlock'; pin.select(); }
  };
  $('#unlock').onclick = go2; pin.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go2(); } });
  $('#fresh').onclick = async () => { if (await uiConfirm('Start an empty vault on this phone? Your Drive backup stays safe, and you can link it later from Settings → Cloud sync.', { ok: 'Start fresh' })) { Gate._fresh = true; showLock(); } };
}
async function showLock() {
  const auth = await IDB.get('meta', 'auth');
  if (!auth && Gate.cached && !Gate._fresh && navigator.onLine && await hasDriveVault()) return showReturning();
  $('#app').hidden = true; $('#lock').hidden = false;
  const gname = ((Gate.signup || {}).name || (Gate.cached || {}).name || '').replace(/^Dr\.?\s+/i, '').split(' ')[0];
  $('#lock').innerHTML = authShell(`${auth ? `<h2 class="ah">${gname ? 'Welcome back, Dr. ' + esc(gname) : 'Welcome back'}</h2><p class="small muted">Enter your PIN to unlock</p><div class="pindots" id="pdots"></div><input id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="PIN"><button class="btn abtn" id="unlock">Unlock</button><p id="lerr" class="err"></p>`
    : `${Gate.cached ? steps(3) : ''}<h2 class="ah">Secure your vault</h2><p class="small muted">Create a PIN. It encrypts all patient data and photos on this phone (AES-256). There is no PIN recovery, so keep backups.</p><div class="pindots" id="pdots"></div>
    <input id="pin" type="password" inputmode="numeric" autocomplete="new-password" placeholder="New PIN (min 4)"><input id="pin2" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Confirm PIN"><button class="btn abtn" id="unlock">Create vault</button><p id="lerr" class="err"></p>`}
  ${!auth ? '<button class="btn ghost abtn" id="restorebtn">☁️ Restore from Google Drive (new phone)</button>' : ''}
  <p class="tiny muted">Works offline · encrypted on this device</p>`);
  const dots = () => { const d = $('#pdots'); if (d) { const n = $('#pin').value.length; d.innerHTML = Array.from({ length: Math.max(4, Math.min(8, n)) }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join(''); } };
  $('#pin').addEventListener('input', dots); dots();
  $('#restorebtn')?.addEventListener('click', restoreFlow);
  const pin = $('#pin'); pin.focus();
  const go2 = async () => {
    const v = pin.value; $('#lerr').textContent = '';
    if (v.length < 4) { $('#lerr').textContent = 'PIN must be at least 4 characters'; return; }
    $('#unlock').disabled = true; $('#unlock').textContent = 'Working…';
    try {
      if (!auth) { if (v !== $('#pin2').value) throw new Error('PINs do not match'); await Vault.setup(v); }
      else if (!(await Vault.unlock(v))) throw new Error('Incorrect PIN');
      await Store.load();
      if (Gate.signup) { if (!D.settings.name) D.settings.name = Gate.signup.name; if (!D.settings.inst) D.settings.inst = Gate.signup.college; D.community = Object.assign(D.community || {}, { college: (D.community || {}).college || Gate.signup.college }); Gate.signup = null; }
      await Store.flush(); await Session.save();
      $('#lock').hidden = true; $('#app').hidden = false; pin.value = '';
      lastAct = Date.now(); render(); checkNotify(); Sync.start(); Gate.recheck(); Calls.start(); Cloud.cfg() && Cloud.init().then(() => { Study.pull(); Social.start(); }).catch(() => {});
    } catch (e) { $('#lerr').textContent = e.message; const pd = $('#pdots'); if (pd) { pd.classList.remove('shake'); void pd.offsetWidth; pd.classList.add('shake'); } $('#unlock').disabled = false; $('#unlock').textContent = auth ? 'Unlock' : 'Create vault'; pin.select(); }
  };
  $('#unlock').onclick = go2; pin.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (auth) go2(); else $('#pin2').focus(); } });
  $('#pin2')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go2(); } });
}
async function lockApp(skipFlush) {
  if (skipFlush !== true) await Store.flush().catch(() => {});
  closeSheet(); await Session.clear(); Sync.stop(); Sync.set('off'); Calls.stop(); Comm.stop(); Social.stop();
  stopCam(); Cloud.stop(); D = null; Vault.key = null;
  for (const u of urlCache.values()) URL.revokeObjectURL(u); urlCache.clear();
  $('#main').innerHTML = ''; showLock();
}
ACT.lock = lockApp;
let lastAct = Date.now(), hiddenAt = 0;
['pointerdown', 'keydown', 'scroll'].forEach(e => addEventListener(e, () => { lastAct = Date.now(); Session.touch(); }, { passive: true }));
setInterval(() => { if (Calls.cur || Group.room) { lastAct = Date.now(); return; } if (D && Date.now() - lastAct > (D.settings.lockMin || 15) * 60000) lockApp(); }, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); Store.flush(); Session.save().catch(() => {}); }
  else if (D && hiddenAt && !Calls.cur && !Group.room && Date.now() - hiddenAt > (D.settings.lockMin || 15) * 60000) lockApp();
  else if (D && Sync.on()) Sync.run();
});
addEventListener('pagehide', () => Store.flush());

/* ---------- Global delegated events ---------- */
document.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (chip && chip.tagName === 'BUTTON' && !chip.dataset.act) {
    const g = chip.parentElement;
    if (g.id === 'dxsel') { chip.remove(); return; }
    if (g.dataset.group) { if (g.dataset.multi === '1') chip.classList.toggle('on'); else { const was = chip.classList.contains('on'); $$('.chip', g).forEach(c => c.classList.remove('on')); if (!was || !g.closest('form')) chip.classList.add('on'); } }
  }
  const a = e.target.closest('[data-act]');
  if (a && ACT[a.dataset.act] && a.type !== 'checkbox') { e.preventDefault(); ACT[a.dataset.act](a, e); }
});
document.addEventListener('change', e => { const a = e.target.closest('input[type=checkbox][data-act]'); if (a && ACT[a.dataset.act]) ACT[a.dataset.act](a, e); });
document.addEventListener('submit', e => e.preventDefault());
ACT.mic = el => dictate(document.getElementById(el.dataset.for), el);
$('#back').onclick = () => history.length > 1 ? history.back() : go('#/home');
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
addEventListener('hashchange', render);
let lastW = innerWidth; addEventListener('resize', () => { if ((lastW >= 900) !== (innerWidth >= 900) && ROUTE.path === 'patient') render(); lastW = innerWidth; });

/* ---------- Boot ---------- */
(async () => {
  paintIcons(); $$('.brandlogo').forEach(e => { e.innerHTML = logoSvg(); });
  if (!window.crypto?.subtle || !window.indexedDB) { document.body.innerHTML = '<p style="padding:24px">This browser does not support secure storage (needs HTTPS + IndexedDB + WebCrypto).</p>'; return; }
  try { await navigator.storage?.persist?.(); } catch (e) {}
  await IDB.open();
  await Gate.ensure();
  if (await Session.resume()) {
    try { await Store.load(); $('#lock').hidden = true; $('#app').hidden = false; lastAct = Date.now(); render(); checkNotify(); Sync.start(); Gate.recheck(); Calls.start(); Cloud.cfg() && Cloud.init().then(() => { Study.pull(); Social.start(); }).catch(() => {}); }
    catch (e) { Vault.key = null; D = null; await Session.clear(); showLock(); }
  } else showLock();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    /* OTA updates: a new deploy installs in the background; the user taps the bar to switch (stays unlocked). */
    navigator.serviceWorker.register('sw.js').then(reg => {
      const ask = w => { const b = $('#updbar'); b.hidden = false; b.onclick = () => { b.textContent = 'Updating…'; Store.flush().finally(() => w.postMessage('skip')); }; };
      if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
      reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w); }); });
      const check = () => reg.update().catch(() => {});
      setInterval(check, 30 * 60000); document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    }).catch(() => {});
    let reloading = false; const hadController = !!navigator.serviceWorker.controller;
    /* Reload only when an UPDATE takes over — not when the first-ever install claims the page. */
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
  }
})();
