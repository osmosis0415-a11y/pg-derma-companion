/* ===== Session keep-alive: a refresh does not lock the app until the auto-lock time has passed.
   The non-extractable AES key is kept in IndexedDB together with the last-activity time. ===== */
const Session = {
  _t: 0,
  async save() { if (!Vault.key) return; this._t = Date.now(); await IDB.put('meta', 'session', { key: Vault.key, last: Date.now(), lockMin: (D && D.settings.lockMin) || 15 }); },
  touch() { if (Vault.key && Date.now() - this._t > 15000) this.save().catch(() => {}); },
  async clear() { this._t = 0; await IDB.del('meta', 'session').catch(() => {}); },
  async resume() {
    const s = await IDB.get('meta', 'session').catch(() => null), auth = await IDB.get('meta', 'auth');
    if (!s || !s.key || !auth) return false;
    if (Date.now() - s.last > (s.lockMin || 15) * 60000) { await this.clear(); return false; }
    try { if ((await Vault.decJSON(auth.check, s.key)) !== 'PGDERMA-OK') throw 0; } catch (e) { await this.clear(); return false; }
    Vault.key = s.key; return true;
  }
};

/* ===== End-to-end encrypted cloud sync (Firebase Firestore) =====
   Uploads only ciphertext produced with the PIN-derived AES-256-GCM key; Firebase never sees plaintext.
   Layout:  users/{uid}                    { v, salt, iter, check, at, device }   (manifest)
            users/{uid}/blobs/{key}        { iv, n }   + /c/{i} { d: base64 chunk }
            keys: 'db', 'p_<photoId>', 't_<photoId>' */
const CHUNK = 700000;
const SYNC_COLLS = ['patients', 'visits', 'scores', 'pins', 'photos', 'logbook', 'inv', 'reminders', 'formulary'];
const SYNC_OBJS = ['settings', 'templates', 'checks'];
const LOCAL_ONLY = ['sync', 'batch'];
let DEVICE = null;

function merge3Arr(b, l, r) {
  const B = new Map((b || []).map(x => [x.id, JSON.stringify(x)])), L = new Map((l || []).map(x => [x.id, x])), R = new Map((r || []).map(x => [x.id, x]));
  const out = [];
  for (const id of new Set([...L.keys(), ...R.keys()])) {
    const lx = L.get(id), rx = R.get(id), bx = B.get(id);
    if (lx && rx) { out.push(JSON.stringify(lx) === bx ? rx : lx); continue; }
    if (lx) { if (bx !== undefined && JSON.stringify(lx) === bx) continue; out.push(lx); continue; }   // deleted remotely
    if (bx !== undefined && JSON.stringify(rx) === bx) continue; out.push(rx);                        // deleted locally
  }
  return out;
}
function merge3Val(b, l, r) { const js = JSON.stringify; return js(l) === js(b) ? r : l; }
function merge3Obj(b, l, r) { const o = {}; b = b || {}; l = l || {}; r = r || {}; for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) { const v = merge3Val(b[k], l[k], r[k]); if (v !== undefined) o[k] = v; } return o; }
function mergeDB(base, local, remote) {
  const out = {};
  for (const k of Object.keys(remote)) out[k] = remote[k];
  for (const k of Object.keys(local)) if (!(k in out)) out[k] = local[k];
  for (const k of SYNC_COLLS) out[k] = merge3Arr(base && base[k], local[k], remote[k]);
  for (const k of SYNC_OBJS) out[k] = merge3Obj(base && base[k], local[k], remote[k]);
  out.thesis = merge3Val(base ? base.thesis : undefined, local.thesis, remote.thesis);
  for (const k of LOCAL_ONLY) out[k] = local[k];
  return out;
}
const syncPayload = () => { const o = {}; for (const k in D) if (!LOCAL_ONLY.includes(k)) o[k] = D[k]; return o; };
async function sha(s) { return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }

const Sync = {
  state: 'off', msg: '', busy: false, again: false, quiet: false, _t: null, unsub: null, forcePush: false, last: null,
  on() { return !!(D && D.sync && D.sync.on); },
  set(s, m) { this.state = s; this.msg = m || ''; const d = $('#syncdot'); if (d) { d.dataset.s = this.on() ? s : 'off'; d.title = syncLabel(); } const x = $('#syncstat'); if (x) x.textContent = syncLabel(); },
  ref(...p) { return Cloud.f.doc(Cloud.db, 'users', Cloud.user.uid, ...p); },
  async putBlob(key, o) {
    const f = Cloud.f, s = b64(o.data), n = Math.max(1, Math.ceil(s.length / CHUNK));
    for (let i = 0; i < n; i += 10) { const bt = f.writeBatch(Cloud.db); for (let j = i; j < Math.min(n, i + 10); j++) bt.set(this.ref('blobs', key, 'c', String(j)), { d: s.slice(j * CHUNK, (j + 1) * CHUNK) }); await bt.commit(); }
    await f.setDoc(this.ref('blobs', key), { iv: b64(o.iv), n });
  },
  async getBlob(key) {
    const f = Cloud.f, m = await f.getDoc(this.ref('blobs', key)); if (!m.exists()) return null;
    const { iv, n } = m.data(); const parts = await Promise.all([...Array(n).keys()].map(i => f.getDoc(this.ref('blobs', key, 'c', String(i)))));
    if (parts.some(p => !p.exists())) throw new Error('Cloud copy of ' + key + ' is incomplete');
    return { iv: unb64(iv), data: unb64(parts.map(p => p.data().d).join('')).buffer };
  },
  async delBlob(key) { const f = Cloud.f, m = await f.getDoc(this.ref('blobs', key)); if (!m.exists()) return; const n = m.data().n || 1; for (let i = 0; i < n; i++) await f.deleteDoc(this.ref('blobs', key, 'c', String(i))); await f.deleteDoc(this.ref('blobs', key)); },
  schedule(ms = 3000) { if (!this.on() || this.quiet) return; clearTimeout(this._t); this._t = setTimeout(() => this.run(), ms); },
  async start() {
    if (!this.on()) { this.set('off'); return; }
    if (!navigator.onLine) { this.set('offline', 'Offline — will sync when back online'); return; }
    try { await Cloud.init(); } catch (e) { this.set('error', 'Could not reach Firebase'); return; }
    if (!Cloud.user) { this.set('error', 'Signed out — sign in under Settings → Cloud sync'); return; }
    if (!DEVICE) { DEVICE = await IDB.get('meta', 'device'); if (!DEVICE) { DEVICE = uid(); await IDB.put('meta', 'device', DEVICE); } }
    if (this.unsub) this.unsub();
    this.unsub = Cloud.f.onSnapshot(Cloud.f.doc(Cloud.db, 'users', Cloud.user.uid), s => { const m = s.data(); if (m && m.device !== DEVICE) IDB.get('kv', 'syncbase').then(b => { if (!b || b.v !== m.v) this.run(); }); }, () => {});
    await this.run();
  },
  stop() { clearTimeout(this._t); if (this.unsub) { this.unsub(); this.unsub = null; } },
  async run() {
    if (!this.on() || !D || !Vault.key) return;
    if (this.busy) { this.again = true; return; }
    if (!navigator.onLine) { this.set('offline', 'Offline — will sync when back online'); return; }
    if (!Cloud.user) return this.start();
    this.busy = true; this.set('busy', 'Syncing…');
    try {
      const f = Cloud.f, uref = Cloud.f.doc(Cloud.db, 'users', Cloud.user.uid);
      const auth = await IDB.get('meta', 'auth'), saltB = b64(auth.salt);
      const m = (await f.getDoc(uref)).data();
      if (m && m.salt !== saltB && !this.forcePush) { this.set('error', 'Your cloud vault uses a different PIN. Open Settings → Cloud sync → Link this device.'); return; }
      const baseRec = await IDB.get('kv', 'syncbase');
      let pulled = false;
      if (m && m.v && !this.forcePush && (!baseRec || baseRec.v !== m.v)) {
        const remote = await Vault.decJSON(await this.getBlob('db'));
        const base = baseRec && baseRec.enc ? await Vault.decJSON(baseRec.enc) : null;
        const merged = mergeDB(base, D, remote);
        const before = JSON.stringify(syncPayload());
        for (const k of Object.keys(D)) delete D[k]; Object.assign(D, merged);
        pulled = JSON.stringify(syncPayload()) !== before;
        await IDB.put('kv', 'syncbase', { v: m.v, h: await sha(JSON.stringify(remote)), enc: await Vault.encJSON(remote) });
      }
      const payload = syncPayload(), h = await sha(JSON.stringify(payload)), cur = await IDB.get('kv', 'syncbase');
      if (!cur || cur.h !== h || this.forcePush) {
        const v = Date.now();
        await this.putBlob('db', await Vault.encJSON(payload));
        await f.setDoc(uref, { v, salt: saltB, iter: auth.iter, check: { iv: b64(auth.check.iv), data: b64(auth.check.data) }, at: f.serverTimestamp(), device: DEVICE });
        await IDB.put('kv', 'syncbase', { v, h, enc: await Vault.encJSON(payload) });
        this.forcePush = false;
      }
      this.quiet = true; await Store.flush(); this.quiet = false;
      await this.syncPhotos();
      this.last = new Date(); D.sync.last = this.last.toISOString();
      this.set('ok', 'Synced ' + this.last.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (pulled) { toast('Synced changes from your other device'); if (!['add', 'score', 'logadd', 'thesis-setup', 'deid', 'cam'].includes(ROUTE.path) && !$('#sheet').classList.contains('open')) render(); }
    } catch (e) {
      this.quiet = false; console.error('sync', e);
      this.set('error', e.code === 'permission-denied' ? 'Cloud permission denied — check Firestore rules' : e.code === 'resource-exhausted' ? 'Firebase free quota reached for today' : 'Sync failed: ' + (e.message || e.code));
    } finally {
      this.busy = false;
      if (this.again) { this.again = false; this.schedule(1500); }
    }
  },
  async syncPhotos() {
    const want = new Set(D.photos.map(p => p.id));
    const keys = await IDB.keys('photos'), local = new Set(keys.filter(k => !k.endsWith('_t')));
    const synced = new Set((await IDB.get('kv', 'psynced')) || []);
    const save = () => IDB.put('kv', 'psynced', [...synced]);
    for (const k of keys) { const id = k.replace(/_t$/, ''); if (!want.has(id)) { await IDB.del('photos', k); if (urlCache.has(k)) { URL.revokeObjectURL(urlCache.get(k)); urlCache.delete(k); } } }
    for (const id of synced) if (!want.has(id)) { await this.delBlob('p_' + id); await this.delBlob('t_' + id); synced.delete(id); await save(); }
    if (D.sync.photos === false) return;
    let up = 0, down = 0;
    for (const id of want) {
      if (local.has(id) && !synced.has(id)) { this.set('busy', 'Uploading photos… ' + (++up)); await this.putBlob('p_' + id, await IDB.get('photos', id)); const t = await IDB.get('photos', id + '_t'); if (t) await this.putBlob('t_' + id, t); synced.add(id); await save(); }
      else if (!local.has(id)) { const o = await this.getBlob('p_' + id); if (o) { this.set('busy', 'Downloading photos… ' + (++down)); await IDB.put('photos', id, o); const t = await this.getBlob('t_' + id); if (t) await IDB.put('photos', id + '_t', t); synced.add(id); await save(); } }
    }
    if (down && ['vault', 'photo', 'patient', 'visit', 'compare'].includes(ROUTE.path)) hydrateImgs();
  },
  /* Re-encrypt this device's vault with the cloud vault's key (used when linking a second device). */
  async link(pin) {
    await Cloud.init(); const f = Cloud.f, m = (await f.getDoc(Cloud.f.doc(Cloud.db, 'users', Cloud.user.uid))).data();
    if (!m) return true;
    const salt = unb64(m.salt), nk = await Vault.derive(pin, salt, m.iter);
    try { if ((await Vault.decJSON({ iv: unb64(m.check.iv), data: unb64(m.check.data).buffer }, nk)) !== 'PGDERMA-OK') throw 0; } catch (e) { return false; }
    const ok = Vault.key;
    for (const k of await IDB.keys('photos')) { const o = await IDB.get('photos', k); await IDB.put('photos', k, await Vault.enc(await Vault.dec(o, ok), nk)); }
    await IDB.put('meta', 'auth', { salt, iter: m.iter, check: { iv: unb64(m.check.iv), data: unb64(m.check.data).buffer } });
    Vault.key = nk; urlCache.clear();
    await IDB.del('kv', 'syncbase'); await IDB.put('kv', 'psynced', []);
    await Store.flush(); await Session.save();
    return true;
  }
};
function syncLabel() {
  if (!D || !Sync.on()) return 'Cloud sync off';
  return Sync.msg || ({ ok: 'Synced', busy: 'Syncing…', error: 'Sync error', offline: 'Offline' }[Sync.state] || 'Waiting to sync');
}

/* ---------- Settings card ---------- */
function syncCardHTML() {
  const s = D.sync || {}, signed = Cloud.user;
  if (!Cloud.cfg()) return '';
  return `<div class="card"><h3>☁️ Cloud sync <small class="muted">end-to-end encrypted</small></h3>
  <p class="small muted">Keeps your patients, visits, scores, logbook, thesis data${s.photos === false ? '' : ' and photos'} in sync across your phone, iPad and laptop, and lets you restore on a new phone. Everything is encrypted with your PIN <b>before</b> upload — Firebase only stores unreadable data.</p>
  ${!signed ? `<div class="btnrow"><button class="btn sm" data-act="syncgoogle">Sign in with Google</button><a class="btn sm ghost" href="#/batch">Email sign-in</a></div>`
    : s.on ? `<p class="small"><span class="sdot" data-s="${Sync.state}"></span> <b id="syncstat">${esc(syncLabel())}</b> · ${esc(Cloud.user.email || '')}</p>
      <label class="row small"><input type="checkbox" data-act="syncphotos" ${s.photos === false ? '' : 'checked'}> Also sync photos (uses more of the free cloud space)</label>
      <div class="btnrow"><button class="btn sm" data-act="syncnow">↻ Sync now</button><button class="btn sm ghost" data-act="syncoff">Turn off on this device</button></div>`
    : `<p class="small">Signed in as <b>${esc(Cloud.user.email || '')}</b></p><button class="btn sm" data-act="syncon">Turn on cloud sync</button>`}
  </div>`;
}
ACT.syncgoogle = async () => { try { await Cloud.init(); } catch (e) { return toast('Could not reach Firebase'); } await ACT.gsign(); setTimeout(() => ROUTE.path === 'settings' && render(), 1500); };
ACT.syncon = async () => {
  await Cloud.init();
  const m = (await Cloud.f.getDoc(Cloud.f.doc(Cloud.db, 'users', Cloud.user.uid))).data(), auth = await IDB.get('meta', 'auth');
  if (m && m.salt !== b64(auth.salt)) {
    const pin = prompt('This account already has a cloud vault (from another device). Enter the PIN you use there — this device will switch to that PIN and both devices will be merged.');
    if (!pin) return;
    toast('Linking… re-encrypting this device', 8000);
    if (!(await Sync.link(pin))) return toast('That PIN does not match the cloud vault');
  }
  D.sync = { on: true, photos: true }; await Store.flush(); toast('Cloud sync on'); Sync.start(); render();
};
ACT.syncoff = () => { if (!confirm('Stop syncing this device? Data already in the cloud stays there.')) return; D.sync.on = false; Sync.stop(); Store.save(); Sync.set('off'); render(); };
ACT.syncnow = () => Sync.run();
ACT.syncphotos = el => { D.sync.photos = el.checked; Store.save(); Sync.schedule(500); };

/* ---------- Restore on a new device (from the lock screen, before a vault exists) ---------- */
async function restoreFlow() {
  const box = $('.lockbox');
  box.innerHTML = `<div class="logo">☁️</div><h1>Restore from cloud</h1><p class="small muted">Sign in with the account you used for Cloud sync.</p><div id="rbody"><p class="muted small">Connecting…</p></div><button class="btn ghost" id="rback">Back</button>`;
  $('#rback').onclick = () => { sessionStorage.removeItem('pgRestore'); showLock(); };
  sessionStorage.setItem('pgRestore', '1');
  try { await Cloud.init(); } catch (e) { $('#rbody').innerHTML = '<p class="err">Could not reach Firebase — check your internet connection.</p>'; return; }
  if (!Cloud.user) {
    $('#rbody').innerHTML = `<button class="btn" id="rg">Continue with Google</button><input id="re" type="email" placeholder="Email"><input id="rp" type="password" placeholder="Password"><button class="btn ghost" id="rs">Sign in with email</button><p id="lerr" class="err"></p>`;
    $('#rg').onclick = () => ACT.gsign().then(() => setTimeout(restoreFlow, 800));
    $('#rs').onclick = async () => { try { await Cloud.f.signInWithEmailAndPassword(Cloud.auth, $('#re').value.trim(), $('#rp').value); restoreFlow(); } catch (e) { $('#lerr').textContent = authMsg(e); } };
    return;
  }
  const m = (await Cloud.f.getDoc(Cloud.f.doc(Cloud.db, 'users', Cloud.user.uid))).data();
  if (!m) { $('#rbody').innerHTML = `<p class="err">No cloud vault found for ${esc(Cloud.user.email)}. Turn on Cloud sync on your other device first.</p>`; return; }
  $('#rbody').innerHTML = `<p class="small">Signed in as <b>${esc(Cloud.user.email)}</b>. Enter the PIN you use on your other device.</p><input id="pin" type="password" inputmode="numeric" placeholder="PIN"><button class="btn" id="rgo">Restore</button><p id="lerr" class="err"></p>`;
  const go2 = async () => {
    const pin = $('#pin').value; $('#rgo').disabled = true; $('#rgo').textContent = 'Restoring…';
    try {
      const salt = unb64(m.salt), k = await Vault.derive(pin, salt, m.iter), check = { iv: unb64(m.check.iv), data: unb64(m.check.data).buffer };
      try { if ((await Vault.decJSON(check, k)) !== 'PGDERMA-OK') throw 0; } catch (e) { throw new Error('Incorrect PIN'); }
      Vault.key = k;
      const blob = await Sync.getBlob('db'); const remote = await Vault.decJSON(blob);
      await IDB.put('meta', 'auth', { salt, iter: m.iter, check });
      await IDB.put('kv', 'db', blob);
      await IDB.put('kv', 'syncbase', { v: m.v, h: await sha(JSON.stringify(remote)), enc: await Vault.encJSON(remote) });
      await IDB.put('kv', 'psynced', []);
      sessionStorage.removeItem('pgRestore');
      await Store.load(); D.sync = { on: true, photos: true }; await Store.flush(); await Session.save();
      $('#lock').hidden = true; $('#app').hidden = false; lastAct = Date.now(); render(); toast('Restored — downloading photos in the background', 4000); Sync.start();
    } catch (e) { Vault.key = null; $('#lerr').textContent = e.message; $('#rgo').disabled = false; $('#rgo').textContent = 'Restore'; }
  };
  $('#rgo').onclick = go2; $('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go2(); } });
}
addEventListener('online', () => Sync.on() && Sync.run());
