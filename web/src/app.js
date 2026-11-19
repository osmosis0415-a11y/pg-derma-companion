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
  [/^formulary$/, vFormulary, 'more'], [/^checklists$/, vChecklists, 'more'], [/^more$/, vMore, 'more'], [/^settings$/, vSettings, 'more'], [/^batch$/, vBatch, 'more'], [/^admin$/, vAdmin, 'more']
];
function render() {
  if (!D) return;
  stopCam(); if (scanStream) ACT.scanstop(); closeSheet();
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = h.split('?');
  ROUTE = { path: path.split('/')[0], q: Object.fromEntries(new URLSearchParams(qs || '')) };
  if (ROUTE.path !== 'batch' && typeof Cloud !== 'undefined') Cloud.stop();
  if (ROUTE.path !== 'admin' && adminUnsub) { adminUnsub(); adminUnsub = null; }
  const na = $('#navadmin'); if (na) na.hidden = !amAdmin();
  for (const [re, fn, tab, keys] of ROUTES) {
    const m = path.match(re);
    if (m) { (keys || []).forEach((k, i) => ROUTE[k] = m[i + 1]); $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab)); window.scrollTo(0, 0); fn(); return; }
  }
  go('#/home');
}

/* ---------- Lock screen ---------- */
async function showLock() {
  const auth = await IDB.get('meta', 'auth');
  $('#app').hidden = true; $('#lock').hidden = false;
  $('#lock').innerHTML = `<div class="lockbox"><div class="logo">🩺</div><h1>PG Derma Companion</h1><p class="muted small">MD Dermatology, Venereology & Leprosy</p>
  ${auth ? `<input id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Enter PIN"><button class="btn" id="unlock">Unlock</button><p id="lerr" class="err"></p>`
    : `<p class="small">Create a PIN to encrypt all patient data and photos on this device (AES-256). There is no PIN recovery — keep backups.</p>
    <input id="pin" type="password" inputmode="numeric" autocomplete="new-password" placeholder="New PIN (min 4)"><input id="pin2" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Confirm PIN"><button class="btn" id="unlock">Create vault</button><p id="lerr" class="err"></p>`}
  ${!auth ? '<button class="btn ghost" id="restorebtn" style="width:100%;margin-top:10px">☁️ Restore from Google Drive (new phone)</button>' : ''}
  <p class="tiny muted">🔒 Works offline · encrypted on this device</p></div>`;
  $('#restorebtn')?.addEventListener('click', restoreFlow);
  const pin = $('#pin'); pin.focus();
  const go2 = async () => {
    const v = pin.value; $('#lerr').textContent = '';
    if (v.length < 4) { $('#lerr').textContent = 'PIN must be at least 4 characters'; return; }
    $('#unlock').disabled = true; $('#unlock').textContent = 'Working…';
    try {
      if (!auth) { if (v !== $('#pin2').value) throw new Error('PINs do not match'); await Vault.setup(v); }
      else if (!(await Vault.unlock(v))) throw new Error('Incorrect PIN');
      await Store.load(); await Store.flush(); await Session.save();
      $('#lock').hidden = true; $('#app').hidden = false; pin.value = '';
      lastAct = Date.now(); render(); checkNotify(); Sync.start(); Gate.recheck();
    } catch (e) { $('#lerr').textContent = e.message; $('#unlock').disabled = false; $('#unlock').textContent = auth ? 'Unlock' : 'Create vault'; pin.select(); }
  };
  $('#unlock').onclick = go2; pin.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (auth) go2(); else $('#pin2').focus(); } });
  $('#pin2')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go2(); } });
}
async function lockApp(skipFlush) {
  if (skipFlush !== true) await Store.flush().catch(() => {});
  closeSheet(); await Session.clear(); Sync.stop(); Sync.set('off');
  stopCam(); Cloud.stop(); D = null; Vault.key = null;
  for (const u of urlCache.values()) URL.revokeObjectURL(u); urlCache.clear();
  $('#main').innerHTML = ''; showLock();
}
ACT.lock = lockApp;
let lastAct = Date.now(), hiddenAt = 0;
['pointerdown', 'keydown', 'scroll'].forEach(e => addEventListener(e, () => { lastAct = Date.now(); Session.touch(); }, { passive: true }));
setInterval(() => { if (D && Date.now() - lastAct > (D.settings.lockMin || 15) * 60000) lockApp(); }, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); Store.flush(); Session.save().catch(() => {}); }
  else if (D && hiddenAt && Date.now() - hiddenAt > (D.settings.lockMin || 15) * 60000) lockApp();
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
  if (!window.crypto?.subtle || !window.indexedDB) { document.body.innerHTML = '<p style="padding:24px">This browser does not support secure storage (needs HTTPS + IndexedDB + WebCrypto).</p>'; return; }
  try { await navigator.storage?.persist?.(); } catch (e) {}
  await IDB.open();
  await Gate.ensure();
  if (await Session.resume()) {
    try { await Store.load(); $('#lock').hidden = true; $('#app').hidden = false; lastAct = Date.now(); render(); checkNotify(); Sync.start(); Gate.recheck(); }
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
