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

/* ===== End-to-end encrypted cloud sync to the user's own Google Drive (hidden app folder) =====
   Only ciphertext made with the PIN-derived AES-256-GCM key is uploaded.
   Files in appDataFolder:  manifest.json { v, salt, iter, check, device }   (no patient data)
                            db.bin, p_<photoId>.bin, t_<photoId>.bin        (iv[12] + ciphertext) */
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


const DRIVE_CLIENT_ID = '567044730190-4h86udqbbs8f2bbnd1ep26j2td2gj2u1.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const packBlob = o => { const iv = new Uint8Array(o.iv), d = new Uint8Array(o.data), u = new Uint8Array(12 + d.length); u.set(iv, 0); u.set(d, 12); return u; };
const unpackBlob = buf => { const u = new Uint8Array(buf); return { iv: u.slice(0, 12), data: u.slice(12).buffer }; };
const driveErr = (code, msg) => Object.assign(new Error(msg), { code });

/* Optional token helper (tools/drive-token-helper.gs). When set, Drive access renews silently in the background
   using a refresh token kept on this device, encrypted with the PIN key. Without it, a one-tap reconnect is needed hourly. */
const driveHelper = () => window.DRIVE_TOKEN_HELPER || '';
const helperCall = async (action, body) => {
  let r; try { r = await fetch(driveHelper(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action }, body)) }); }
  catch (e) { throw driveErr('drive/offline', 'Could not reach the Drive helper'); }
  return r.json();
};
const Drive = {
  token: null, exp: 0, client: null, codeClient: null, files: null, _pendingRT: null,
  loadGis() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (this._gis) return this._gis;
    this._gis = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.onload = res; sc.onerror = () => { this._gis = null; rej(driveErr('drive/offline', 'Could not load Google sign-in — check your internet')); }; document.head.appendChild(sc); });
    return this._gis;
  },
  valid() { return !!this.token && Date.now() < this.exp; },
  async setToken(t) { this.token = t.access_token; this.exp = Date.now() + (Number(t.expires_in || 3600) - 120) * 1000; this.files = null; await IDB.put('meta', 'dtoken', { t: this.token, exp: this.exp }); const b = $('#drivebar'); if (b) b.hidden = true; },
  async saveRefresh(rt) { if (!Vault.key) { this._pendingRT = rt; return; } await IDB.put('kv', 'drt', await Vault.encJSON(rt)); this._pendingRT = null; },
  async persistPending() { if (this._pendingRT) await this.saveRefresh(this._pendingRT); },
  hasRefresh() { return IDB.get('kv', 'drt').then(x => !!x).catch(() => false); },
  async refresh() {
    if (!driveHelper() || !Vault.key) return false;
    const enc = await IDB.get('kv', 'drt').catch(() => null); if (!enc) return false;
    const rt = await Vault.decJSON(enc);
    const t = await helperCall('refresh', { refresh_token: rt });
    if (!t.access_token) { if (t.error === 'invalid_grant') await IDB.del('kv', 'drt'); return false; }
    await this.setToken(t); return true;
  },
  async restoreToken() {
    if (this.valid()) return true;
    const t = await IDB.get('meta', 'dtoken').catch(() => null); if (t && Date.now() < t.exp) { this.token = t.t; this.exp = t.exp; return true; }
    try { return await this.refresh(); } catch (e) { return false; }
  },
  /* Must be started from a tap (browsers block the Google popup otherwise). */
  async connect(hint, prompt = '') {
    await this.loadGis();
    if (driveHelper()) {
      return new Promise((res, rej) => {
        this.codeClient = google.accounts.oauth2.initCodeClient({
          client_id: DRIVE_CLIENT_ID, scope: DRIVE_SCOPE, ux_mode: 'popup', login_hint: hint || undefined,
          select_account: prompt === 'select_account',
          callback: async r => {
            if (r.error) return rej(driveErr('drive/denied', r.error === 'access_denied' ? 'Google Drive access was not allowed' : r.error));
            if (r.scope && !r.scope.split(' ').includes(DRIVE_SCOPE)) return rej(driveErr('drive/denied', 'Please allow access to the app folder in Google Drive'));
            try {
              const t = await helperCall('exchange', { code: r.code });
              if (!t.access_token) return rej(driveErr('drive/helper', 'Google Drive sign-in failed (' + (t.error_description || t.error || 'helper') + ')'));
              await this.setToken(t); if (t.refresh_token) await this.saveRefresh(t.refresh_token); res();
            } catch (e) { rej(e); }
          },
          error_callback: e => rej(driveErr('drive/popup', e && e.type === 'popup_closed' ? 'Google sign-in was closed' : 'Google sign-in popup was blocked — tap again'))
        });
        this.codeClient.requestCode();
      });
    }
    if (!this.client) this.client = google.accounts.oauth2.initTokenClient({ client_id: DRIVE_CLIENT_ID, scope: DRIVE_SCOPE, callback: () => {} });
    return new Promise((res, rej) => {
      this.client.callback = async r => {
        if (r.error) return rej(driveErr('drive/denied', r.error === 'access_denied' ? 'Google Drive access was not allowed' : r.error));
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE)) return rej(driveErr('drive/denied', 'Please allow access to the app folder in Google Drive'));
        this.token = r.access_token; this.exp = Date.now() + (Number(r.expires_in) - 120) * 1000; this.files = null;
        await IDB.put('meta', 'dtoken', { t: this.token, exp: this.exp }); $('#drivebar').hidden = true; res();
      };
      this.client.error_callback = e => rej(driveErr('drive/popup', e && e.type === 'popup_closed' ? 'Google sign-in was closed' : 'Google sign-in popup was blocked — tap again'));
      this.client.requestAccessToken({ prompt, login_hint: hint || undefined });
    });
  },
  async forget() {
    const enc = await IDB.get('kv', 'drt').catch(() => null);
    if (enc && Vault.key) { try { const rt = await Vault.decJSON(enc); fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(rt), { method: 'POST' }).catch(() => {}); } catch (e) {} }
    await IDB.del('kv', 'drt').catch(() => {});
    const t = this.token; this.token = null; this.exp = 0; this.files = null; await IDB.del('meta', 'dtoken').catch(() => {}); if (t && window.google?.accounts?.oauth2) try { google.accounts.oauth2.revoke(t, () => {}); } catch (e) {} },
  async api(path, opts = {}, retried) {
    if (!this.valid() && !(await this.refresh().catch(() => false))) throw driveErr('drive/token', 'Google Drive needs reconnecting');
    let r;
    try { r = await fetch('https://www.googleapis.com/' + path, Object.assign({}, opts, { headers: Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + this.token }) })); }
    catch (e) { throw driveErr('drive/offline', 'No internet connection'); }
    if (r.status === 401) { this.token = null; this.exp = 0; await IDB.del('meta', 'dtoken').catch(() => {}); if (!retried && await this.refresh().catch(() => false)) return this.api(path, opts, true); throw driveErr('drive/token', 'Google Drive session expired'); }
    if (r.status === 403 && /storageQuotaExceeded|quotaExceeded/.test(await r.clone().text())) throw driveErr('drive/full', 'Your Google Drive is full');
    if (!r.ok) throw driveErr('drive/http', 'Google Drive error ' + r.status);
    return r;
  },
  async list() {
    const out = {}; let pt = '';
    do { const j = await (await this.api('drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(id,name)' + (pt ? '&pageToken=' + encodeURIComponent(pt) : ''))).json(); for (const f of j.files || []) out[f.name] = f.id; pt = j.nextPageToken; } while (pt);
    this.files = out; return out;
  },
  async put(name, bytes, mime = 'application/octet-stream') {
    if (!this.files) await this.list();
    const id = this.files[name];
    if (id) { await this.api('upload/drive/v3/files/' + id + '?uploadType=media', { method: 'PATCH', headers: { 'Content-Type': mime }, body: bytes }); return; }
    const fd = new FormData();
    fd.append('metadata', new Blob([JSON.stringify({ name, parents: ['appDataFolder'] })], { type: 'application/json' }));
    fd.append('file', new Blob([bytes], { type: mime }));
    const j = await (await this.api('upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body: fd })).json();
    this.files[name] = j.id;
  },
  async get(name) { if (!this.files) await this.list(); const id = this.files[name]; if (!id) return null; return (await this.api('drive/v3/files/' + id + '?alt=media')).arrayBuffer(); },
  async del(name) { if (!this.files) await this.list(); const id = this.files[name]; if (!id) return; try { await this.api('drive/v3/files/' + id, { method: 'DELETE' }); } catch (e) { if (e.code !== 'drive/http') throw e; } delete this.files[name]; },
  async manifest() { const b = await this.get('manifest.json'); return b ? JSON.parse(new TextDecoder().decode(b)) : null; },
  async about() { return (await this.api('drive/v3/about?fields=user(emailAddress),storageQuota(limit,usage)')).json(); }
};

const Sync = {
  state: 'off', msg: '', busy: false, again: false, quiet: false, _t: null, _poll: null, forcePush: false,
  on() { return !!(D && D.sync && D.sync.on); },
  set(s, m) { this.state = s; this.msg = m || ''; const d = $('#syncdot'); if (d) { d.dataset.s = this.on() ? s : 'off'; d.title = syncLabel(); } const x = $('#syncstat'); if (x) x.textContent = syncLabel(); const bar = $('#drivebar'); if (bar) bar.hidden = !(this.on() && s === 'reconnect'); },
  async getBlob(key) { const b = await Drive.get(key + '.bin'); return b ? unpackBlob(b) : null; },
  putBlob(key, o) { return Drive.put(key + '.bin', packBlob(o)); },
  delBlob(key) { return Drive.del(key + '.bin'); },
  schedule(ms = 3000) { if (!this.on() || this.quiet) return; clearTimeout(this._t); this._t = setTimeout(() => this.run(), ms); },
  async start() {
    if (!this.on()) { this.set('off'); return; }
    if (!DEVICE) { DEVICE = await IDB.get('meta', 'device'); if (!DEVICE) { DEVICE = uid(); await IDB.put('meta', 'device', DEVICE); } }
    Drive.loadGis().catch(() => {});
    if (!this._marked) { this._marked = 1; Cloud.cfg() && Cloud.init().then(() => markVault(true)).catch(() => {}); }
    clearInterval(this._poll);
    this._poll = setInterval(() => { if (!document.hidden && navigator.onLine && Drive.valid()) this.poll(); }, 60000);
    await this.run();
  },
  stop() { clearTimeout(this._t); clearInterval(this._poll); this._poll = null; },
  async poll() { try { const m = await Drive.manifest(); const b = await IDB.get('kv', 'syncbase'); if (m && (!b || b.v !== m.v)) this.run(); } catch (e) { if (e.code === 'drive/token') this.set('reconnect', 'Tap to reconnect Google Drive'); } },
  async run() {
    if (!this.on() || !D || !Vault.key) return;
    if (this.busy) { this.again = true; return; }
    if (!navigator.onLine) { this.set('offline', 'Offline — will sync when back online'); return; }
    if (!(await Drive.restoreToken())) { this.set('reconnect', 'Tap to reconnect Google Drive'); return; }
    this.busy = true; this.set('busy', 'Syncing…');
    try {
      Drive.files = null;
      const auth = await IDB.get('meta', 'auth'), saltB = b64(auth.salt);
      const m = await Drive.manifest();
      if (m && m.salt !== saltB && !this.forcePush) { this.set('error', 'Your Drive backup uses a different PIN. Open Settings → Cloud sync → Link this device.'); return; }
      const baseRec = await IDB.get('kv', 'syncbase');
      let pulled = false;
      if (m && m.v && !this.forcePush && (!baseRec || baseRec.v !== m.v)) {
        const blob = await this.getBlob('db'); if (!blob) throw driveErr('drive/missing', 'Drive backup is incomplete');
        const remote = await Vault.decJSON(blob);
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
        await Drive.put('manifest.json', new TextEncoder().encode(JSON.stringify({ app: 'pg-derma-companion', v, salt: saltB, iter: auth.iter, check: { iv: b64(auth.check.iv), data: b64(auth.check.data) }, device: DEVICE, at: new Date().toISOString() })), 'application/json');
        await IDB.put('kv', 'syncbase', { v, h, enc: await Vault.encJSON(payload) });
        this.forcePush = false;
      }
      this.quiet = true; await Store.flush(); this.quiet = false;
      await this.syncPhotos();
      D.sync.last = new Date().toISOString(); D.sync.fail = 0;   // local-only; read by the usage heartbeat
      this.set('ok', 'Synced ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (pulled) { toast('Synced changes from your other device'); if (!['add', 'score', 'logadd', 'thesis-setup', 'deid', 'cam'].includes(ROUTE.path) && !$('#sheet').classList.contains('open')) render(); }
    } catch (e) {
      this.quiet = false; console.warn('sync', e);
      if (e.code === 'drive/token') this.set('reconnect', 'Tap to reconnect Google Drive');
      else if (e.code === 'drive/offline') this.set('offline', 'Offline — will sync when back online');
      else { if (e.code !== 'drive/full') ErrLog.capture('sync', e.message || e.code, e.stack); }
      if (e.code !== 'drive/offline' && D && D.sync) D.sync.fail = (D.sync.fail | 0) + 1;
      if (!['drive/token', 'drive/offline'].includes(e.code)) this.set('error', e.code === 'drive/full' ? 'Your Google Drive is full — free up space or turn off photo sync' : 'Sync failed: ' + (e.message || e.code));
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
  /* Re-encrypt this device with the Drive backup's key (linking a second device that already had its own data). */
  async link(pin, m) {
    const salt = unb64(m.salt), nk = await Vault.derive(pin, salt, m.iter), check = { iv: unb64(m.check.iv), data: unb64(m.check.data).buffer };
    try { if ((await Vault.decJSON(check, nk)) !== 'PGDERMA-OK') throw 0; } catch (e) { return false; }
    const ok = Vault.key;
    for (const k of await IDB.keys('photos')) { const o = await IDB.get('photos', k); await IDB.put('photos', k, await Vault.enc(await Vault.dec(o, ok), nk)); }
    await IDB.put('meta', 'auth', { salt, iter: m.iter, check });
    const drt = await IDB.get('kv', 'drt').catch(() => null); if (drt) await IDB.put('kv', 'drt', await Vault.enc(await Vault.dec(drt, ok), nk));
    Vault.key = nk; urlCache.clear();
    await IDB.del('kv', 'syncbase'); await IDB.put('kv', 'psynced', []);
    await Store.flush(); await Session.save();
    return true;
  }
};
function syncLabel() {
  if (!D || !Sync.on()) return 'Cloud sync off';
  return Sync.msg || ({ ok: 'Synced', busy: 'Syncing…', error: 'Sync error', offline: 'Offline', reconnect: 'Tap to reconnect Google Drive' }[Sync.state] || 'Waiting to sync');
}

/* ---------- Settings card ---------- */
function syncCardHTML() {
  const s = D.sync || {};
  const drive = `<div class="card"><h3>☁️ Cloud sync — Google Drive <small class="muted">end-to-end encrypted</small></h3>
  <p class="small muted">Saves your patients, visits, scores, logbook, thesis data${s.photos === false ? '' : ' and photos'} to a <b>hidden app folder in your own Google Drive</b> and keeps your phone, iPad and laptop in sync. Everything is encrypted with your PIN <b>before</b> upload — the files can't be opened from Drive, only by this app with your PIN.</p>
  ${s.on ? `<p class="small"><span class="sdot" data-s="${Sync.state}"></span> <b id="syncstat">${esc(syncLabel())}</b>${s.email ? ' · ' + esc(s.email) : ''}</p>
      <p class="small muted" id="drivequota"></p>
      <label class="row small"><input type="checkbox" data-act="syncphotos" ${s.photos === false ? '' : 'checked'}> Also sync photos</label>
      <div class="btnrow wrap"><button class="btn sm" data-act="syncnow">↻ Sync now</button>${Sync.state === 'reconnect' ? '<button class="btn sm" data-act="driveconnect">Reconnect Google Drive</button>' : ''}<button class="btn sm ghost" data-act="syncoff">Turn off on this device</button><button class="btn sm ghost danger" data-act="drivewipe">Delete Drive backup</button></div>`
    : `<button class="btn" data-act="driveconnect">Connect Google Drive</button><p class="small muted">Google will ask to let PG Derma use its own app folder in your Drive. It can't see any of your other Drive files.</p>`}
  </div>`;
  return (Gate.enabled() && Gate.cached ? accountHTML() : '') + drive;
}
function showQuota() { if (!Drive.valid()) return; Drive.about().then(a => { const el = $('#drivequota'); if (!el || !a.storageQuota) return; const u = +a.storageQuota.usage || 0, l = +a.storageQuota.limit || 0; el.textContent = 'Google Drive used: ' + (u / 1073741824).toFixed(1) + ' GB' + (l ? ' of ' + (l / 1073741824).toFixed(0) + ' GB' : ''); }).catch(() => {}); }
function accountHTML() {
  const g = Gate.cached || {};
  return `<div class="card"><h3>👤 Account</h3><div class="row" style="gap:10px">${g.photo ? `<img class="gav sm" src="${esc(g.photo)}" alt="" referrerpolicy="no-referrer">` : ''}<div><b>${esc(g.name || '')}</b><div class="small muted">${esc(g.email || '')} · Google · approved${amAdmin() ? ' · admin' : ''}</div></div></div>
  <div class="btnrow wrap">${amAdmin() ? '<a class="btn sm" href="#/admin">🛡️ Access requests</a>' : ''}<button class="btn sm ghost" data-act="appsignout">Sign out of the app</button></div></div>`;
}
ACT.driveconnect = async () => {
  try {
    await Drive.connect((D.sync && D.sync.email) || (Gate.cached && Gate.cached.email));
    const about = await Drive.about().catch(() => ({}));
    const email = about.user && about.user.emailAddress;
    if (!(D.sync && D.sync.on)) {
      const m = await Drive.manifest(), auth = await IDB.get('meta', 'auth');
      if (m && m.salt !== b64(auth.salt)) {
        const pin = await uiPrompt('This Google Drive already has a PG Derma backup (from another device). Enter the PIN you use there — this device will switch to that PIN and both devices will be merged.', '', { type: 'password', ok: 'Link' });
        if (!pin) return;
        toast('Linking… re-encrypting this device', 8000);
        if (!(await Sync.link(pin, m))) return toast('That PIN does not match the Drive backup');
      }
      D.sync = { on: true, photos: true, email };
    } else if (email) D.sync.email = email;
    await Store.flush(); toast('Google Drive connected — you can now log in on any phone with just your PIN', 4000); Sync.start(); render(); Cloud.cfg() && Cloud.init().then(() => markVault(true)).catch(() => {});
  } catch (e) { toast(e.message || 'Could not connect Google Drive', 4000); }
};
ACT.syncoff = async () => { if (!(await uiConfirm('Stop syncing this device? Your Drive backup stays.'))) return; D.sync.on = false; Sync.stop(); await Drive.forget(); Store.save(); Sync.set('off'); render(); };
ACT.syncnow = () => Sync.run();
ACT.syncphotos = el => { D.sync.photos = el.checked; Store.save(); Sync.schedule(500); };
ACT.drivewipe = async () => {
  if (!(await uiType('Delete the PG Derma backup from your Google Drive? Data on this phone stays.', 'DELETE'))) return;
  try {
    if (!Drive.valid()) await Drive.connect(D.sync && D.sync.email);
    Sync.stop(); const files = await Drive.list();
    for (const name of Object.keys(files)) await Drive.del(name);
    D.sync.on = false; await IDB.del('kv', 'syncbase'); await IDB.put('kv', 'psynced', []); Store.save(); Sync.set('off'); markVault(false);
    toast('Drive backup deleted'); render();
  } catch (e) { toast(e.message, 4000); }
};

/* ---------- Restore on a new device (from the lock screen, before a vault exists) ---------- */
/* Restore this account's encrypted vault from its Google Drive backup using the PIN (new phone / reinstall). */
async function restoreWithPin(pin, m) {
  const salt = unb64(m.salt), k = await Vault.derive(pin, salt, m.iter), check = { iv: unb64(m.check.iv), data: unb64(m.check.data).buffer };
  try { if ((await Vault.decJSON(check, k)) !== 'PGDERMA-OK') throw 0; } catch (e) { throw new Error('Incorrect PIN'); }
  Vault.key = k;
  const blob = await Sync.getBlob('db'); if (!blob) throw new Error('Backup is incomplete');
  const remote = await Vault.decJSON(blob);
  const about = await Drive.about().catch(() => ({}));
  await IDB.put('meta', 'auth', { salt, iter: m.iter, check });
  await IDB.put('kv', 'db', blob);
  await IDB.put('kv', 'syncbase', { v: m.v, h: await sha(JSON.stringify(remote)), enc: await Vault.encJSON(remote) });
  await IDB.put('kv', 'psynced', []);
  await Store.load(); D.sync = { on: true, photos: true, email: about.user && about.user.emailAddress }; await Store.flush(); await Session.save(); await Drive.persistPending();
  $('#lock').hidden = true; $('#app').hidden = false; lastAct = Date.now(); render(); toast('Welcome back — your data is restored. Photos download in the background.', 4500); Sync.start();
  Calls.start(); Cloud.cfg() && Cloud.init().then(() => { Study.pull(); Social.start(); Usage.start(); }).catch(() => {});
}
/* Tell the account (not the data) that a Drive backup exists, so a new phone asks only for the PIN. */
function markVault(on) { try { if (!Cloud.cfg() || !Cloud.user || !Cloud.f) return; Cloud.f.setDoc(Cloud.f.doc(Cloud.db, 'vaults', Cloud.user.uid), { drive: !!on, updatedAt: Cloud.f.serverTimestamp() }).catch(() => {}); } catch (e) {} }
async function hasDriveVault() {
  try { if (!Cloud.cfg()) return false; await Cloud.init(); if (!Cloud.user) return false; const d = await Cloud.f.getDoc(Cloud.f.doc(Cloud.db, 'vaults', Cloud.user.uid)); return d.exists() && d.data().drive === true; } catch (e) { return false; }
}
async function restoreFlow() {
  const box = $('.authcard') || $('.lockbox');
  box.innerHTML = `<div class="logo">${ic('cloud')}</div><h1>Restore from Google Drive</h1><p class="small muted">Connect the Google account you used for Cloud sync.</p><div id="rbody"><button class="btn" id="rg" style="width:100%">Connect Google Drive</button><p id="lerr" class="err"></p></div><button class="btn ghost" id="rback" style="width:100%">Back</button>`;
  $('#rback').onclick = () => showLock();
  Drive.loadGis().catch(() => {});
  $('#rg').onclick = async () => {
    try { await Drive.connect(Gate.cached && Gate.cached.email, Gate.cached ? '' : 'select_account'); } catch (e) { $('#lerr').textContent = e.message; return; }
    let m; try { m = await Drive.manifest(); } catch (e) { $('#lerr').textContent = e.message; return; }
    if (!m) { $('#rbody').innerHTML = '<p class="err">No PG Derma backup found in this Google Drive. Turn on Cloud sync on your other device first, or tap Back and choose another account.</p>'; return; }
    $('#rbody').innerHTML = `<p class="small">Backup found${m.at ? ' (last saved ' + esc(fmt(m.at)) + ')' : ''}. Enter the PIN you use on your other device.</p><input id="pin" type="password" inputmode="numeric" placeholder="PIN"><button class="btn" id="rgo" style="width:100%">Restore</button><p id="lerr" class="err"></p>`;
    const go2 = async () => {
      const pin = $('#pin').value; $('#rgo').disabled = true; $('#rgo').textContent = 'Restoring…';
      try { await restoreWithPin(pin, m); }
      catch (e) { Vault.key = null; $('#lerr').textContent = e.message; $('#rgo').disabled = false; $('#rgo').textContent = 'Restore'; }
    };
    $('#rgo').onclick = go2; $('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go2(); } });
  };
}
addEventListener('online', () => Sync.on() && Sync.run());
