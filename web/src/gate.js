/* ===== Access gate: Google sign-in + manual approval by the admin =====
   approvals/{uid} = { email, name, photo, status: pending|approved|rejected, requestedAt, decidedAt, decidedBy }
   The admin is approved automatically. Once approved, the decision is cached on the device so the app works
   offline; it is re-checked whenever the app is online, and a revoked user is signed out of the app. */
const ADMIN_EMAILS = ['sriramdeverashetty@gmail.com'];
const isAdminUser = u => !!(u && u.email && ADMIN_EMAILS.includes(u.email.toLowerCase()));
const amAdmin = () => isAdminUser(Cloud.user) || !!(Gate.cached && ADMIN_EMAILS.includes((Gate.cached.email || '').toLowerCase()));

// Google Identity Services popup → Google access token → Firebase credential. Works in installed PWAs.
async function gisSignIn(f) {
  await Drive.loadGis();
  const tok = await new Promise((res, rej) => {
    const c = google.accounts.oauth2.initTokenClient({ client_id: DRIVE_CLIENT_ID, scope: 'openid email profile',
      callback: r => r && r.access_token ? res(r.access_token) : rej(Object.assign(new Error('Sign-in was cancelled'), { code: 'auth/popup-closed-by-user' })),
      error_callback: e => rej(Object.assign(new Error('Sign-in was cancelled'), { code: e && e.type === 'popup_failed_to_open' ? 'auth/popup-blocked' : 'auth/popup-closed-by-user' })) });
    c.requestAccessToken({ prompt: 'select_account' });
  });
  await f.signInWithCredential(Cloud.auth, f.GoogleAuthProvider.credential(null, tok));
}
async function googleSignIn() {
  await Cloud.init();
  const f = Cloud.f, pr = new f.GoogleAuthProvider();
  pr.setCustomParameters({ prompt: 'select_account' });
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  // Installed app (or popup refused): Firebase's redirect flow breaks when the auth domain differs from
  // the site (browser storage partitioning), so sign in through Google Identity Services instead.
  if (standalone) await gisSignIn(f);
  else {
    try { await f.signInWithPopup(Cloud.auth, pr); }
    catch (e) {
      if (!['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported', 'auth/internal-error'].includes(e.code)) throw e;
      await gisSignIn(f);
    }
  }
  Cloud.user = Cloud.auth.currentUser;
}

const Gate = {
  cached: null, _done: null, unsub: null,
  enabled() { return !!Cloud.cfg(); },
  async ensure() {
    if (!this.enabled()) return;
    const g = await IDB.get('meta', 'gate').catch(() => null);
    if (g && g.status === 'approved') { this.cached = g; return; }
    await new Promise(res => { this._done = res; this.screen(); });
  },
  box(html) {
    $('#app').hidden = true; const l = $('#lock'); l.hidden = false;
    l.innerHTML = `<div class="lockbox"><div class="logo">${ic('steth')}</div><h1>PG Derma Companion</h1><p class="muted small">MD Dermatology, Venereology & Leprosy</p>${html}</div>`;
  },
  retry(msg) { this.box(`<p class="err">${esc(msg)}</p><button class="btn" id="gretry" style="width:100%">Try again</button>`); $('#gretry').onclick = () => this.screen(); },
  async screen() {
    if (!navigator.onLine) return this.retry('You are offline. Connect to the internet to sign in the first time.');
    this.box('<p class="muted small">Connecting…</p>');
    try { await Cloud.init(); } catch (e) { return this.retry('Could not reach Google sign-in. Check your internet.'); }
    const u = Cloud.user;
    if (!u) {
      this.box(`<p class="small">Sign in with your Google account to continue. New accounts are approved by the app admin before first use.</p>
        <button class="btn gbtn" id="gsign" style="width:100%"><span class="g">G</span> Continue with Google</button><p id="lerr" class="err"></p>
        <p class="tiny muted">Patient data stays encrypted on your device. Google sign-in only confirms who you are.</p>`);
      Drive.loadGis().catch(() => {});
      $('#gsign').onclick = async () => { $('#gsign').disabled = true; try { await googleSignIn(); this.screen(); } catch (e) { $('#lerr').textContent = authMsg(e); $('#gsign').disabled = false; } };
      return;
    }
    if (isAdminUser(u)) return this.approve(u);
    const f = Cloud.f, ref = f.doc(Cloud.db, 'approvals', u.uid);
    let s;
    try {
      s = await f.getDoc(ref);
      if (!s.exists()) { await f.setDoc(ref, { email: u.email, name: u.displayName || '', photo: u.photoURL || '', status: 'pending', requestedAt: f.serverTimestamp() }); s = await f.getDoc(ref); }
    } catch (e) { return this.retry('Could not send your access request (' + (e.code || e.message) + ').'); }
    const st = s.data().status;
    if (st === 'approved') return this.approve(u);
    this.pending(u, st);
    if (this.unsub) this.unsub();
    this.unsub = f.onSnapshot(ref, d => { const x = d.data(); if (!x) return; if (x.status === 'approved') { this.unsub(); this.unsub = null; this.approve(u); } else this.pending(u, x.status); }, () => {});
  },
  pending(u, st) {
    const rej = st === 'rejected';
    const msg = `Hi Dr. Sriram, I've requested access to PG Derma Companion with ${u.email}. Please approve. ${location.origin + location.pathname}`;
    this.box(`${u.photoURL ? `<img class="gav" src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : ''}<p><b>${esc(u.displayName || '')}</b><br><span class="small muted">${esc(u.email)}</span></p>
      ${rej ? '<p class="err">Your access request was not approved. Contact the admin if you think this is a mistake.</p>'
        : '<p class="small">⏳ <b>Waiting for approval</b> by the app admin. This screen opens automatically once you are approved.</p>'}
      ${rej ? '' : `<a class="btn wa" style="width:100%" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Ask for approval on WhatsApp</a>`}
      <button class="btn ghost" id="gcheck" style="width:100%;margin-top:8px">Check again</button>
      <button class="btn ghost" id="gout" style="width:100%;margin-top:8px">Use a different Google account</button>`);
    $('#gcheck').onclick = () => this.screen();
    $('#gout').onclick = async () => { if (this.unsub) { this.unsub(); this.unsub = null; } try { await Cloud.f.signOut(Cloud.auth); } catch (e) {} Cloud.user = null; this.screen(); };
  },
  async approve(u) {
    const g = { uid: u.uid, email: u.email, name: u.displayName || '', photo: u.photoURL || '', status: 'approved', at: Date.now() };
    await IDB.put('meta', 'gate', g); this.cached = g;
    if (this._done) { const d = this._done; this._done = null; d(); }
  },
  /* Online re-check: a revoked or signed-out account loses access on this device (its encrypted data is kept). */
  async recheck() {
    if (!this.enabled() || !navigator.onLine) return;
    try { await Cloud.init(); } catch (e) { return; }
    const u = Cloud.user;
    if (!u || (this.cached && this.cached.uid && u.uid !== this.cached.uid)) return this.revoke('Please sign in again with Google.');
    if (isAdminUser(u)) return;
    try {
      const s = await Cloud.f.getDoc(Cloud.f.doc(Cloud.db, 'approvals', u.uid));
      if (!s.exists() || s.data().status !== 'approved') return this.revoke('Your access to PG Derma Companion has been removed by the admin.');
    } catch (e) { if (e.code === 'permission-denied') return this.revoke('Your access to PG Derma Companion has been removed by the admin.'); }
  },
  async revoke(msg) {
    await IDB.del('meta', 'gate'); this.cached = null;
    if (D) { await Store.flush().catch(() => {}); stopCam(); Sync.stop(); Cloud.stop(); closeSheet(); }
    await Session.clear(); D = null; Vault.key = null;
    for (const u of urlCache.values()) URL.revokeObjectURL(u); urlCache.clear(); $('#main').innerHTML = '';
    this.box(`<p class="err">${esc(msg)}</p><button class="btn" id="gretry" style="width:100%">Continue</button>`);
    $('#gretry').onclick = () => location.reload();
  },
  async signOut() {
    if (!(await uiConfirm('Sign out of PG Derma Companion on this device? Your encrypted data stays on this device; you will need Google sign-in (and your PIN) to open it again.'))) return;
    try { await Cloud.f.signOut(Cloud.auth); } catch (e) {}
    await IDB.del('meta', 'gate'); await Drive.forget().catch(() => {}); location.reload();
  }
};

/* ---------- Admin panel ---------- */
let adminUnsub = null;
function vAdmin() {
  setTitle('Access requests', false);
  if (!amAdmin()) { main().innerHTML = empty('Admins only'); return; }
  const tab = ROUTE.q.t || 'pending';
  if (tab === 'errors') return vAdminErrors();
  if (tab === 'batches') return vAdminBatches();
  main().innerHTML = `<div class="chips">${ADMIN_TABS.map(([k, l]) => `<a class="chip${k === tab ? ' on' : ''}" href="#/admin?t=${k}">${l} <span id="cnt_${k}"></span></a>`).join('')}</div>
  <div id="alist" class="card"><p class="muted small">Loading…</p></div>
  <div class="card"><h3>Invite people</h3><p class="small muted">Share the app link. They sign in with Google and appear here for your approval.</p><button class="btn sm ghost" data-act="adminshare">Share app link</button></div>`;
  Cloud.init().then(() => {
    if (adminUnsub) adminUnsub();
    adminUnsub = Cloud.f.onSnapshot(Cloud.f.collection(Cloud.db, 'approvals'), snap => {
      if (ROUTE.path !== 'admin') return;
      const all = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      for (const k of ['pending', 'approved', 'rejected']) { const c = $('#cnt_' + k); if (c) c.textContent = all.filter(x => x.status === k).length || ''; }
      const ts = x => (x && x.seconds ? x.seconds * 1000 : 0);
      const list = all.filter(x => x.status === tab).sort((a, b) => ts(b.requestedAt) - ts(a.requestedAt));
      const el = $('#alist'); if (!el) return;
      el.innerHTML = list.map(x => `<div class="li"><div class="row" style="gap:10px">${x.photo ? `<img class="gav sm" src="${esc(x.photo)}" alt="" referrerpolicy="no-referrer">` : ''}<div><b>${esc(x.name || x.email)}</b><small>${esc(x.email)}${ts(x.requestedAt) ? ' · requested ' + fmt(new Date(ts(x.requestedAt)).toISOString()) : ''}</small></div></div>
        <div class="btnrow" style="margin:0">${x.status !== 'approved' ? `<button class="btn xs" data-act="adminset" data-id="${x.id}" data-s="approved">Approve</button>` : ''}${x.status === 'pending' ? `<button class="btn xs ghost danger" data-act="adminset" data-id="${x.id}" data-s="rejected">Reject</button>` : ''}${x.status === 'approved' && !ADMIN_EMAILS.includes((x.email || '').toLowerCase()) ? `<button class="btn xs ${x.calls ? '' : 'ghost'}" data-act="admincalls" data-id="${x.id}" data-on="${x.calls ? 1 : 0}" title="Voice/video calls">${ic('phone')} Calls ${x.calls ? 'on' : 'off'}</button>` : ''}${x.status === 'approved' ? `<button class="btn xs ghost danger" data-act="adminset" data-id="${x.id}" data-s="rejected">Revoke</button>` : ''}${x.status === 'rejected' ? `<button class="btn xs ghost" data-act="admindel" data-id="${x.id}">Remove</button>` : ''}</div></div>`).join('') || `<p class="muted small">No ${tab} requests.</p>`;
    }, e => { const el = $('#alist'); if (el) el.innerHTML = `<p class="err">${esc(e.code || e.message)}</p>`; });
  }).catch(() => { $('#alist').innerHTML = '<p class="err">Could not reach Firebase.</p>'; });
}
ACT.adminset = async el => {
  const s = el.dataset.s;
  if (s === 'rejected' && !(await uiConfirm(el.textContent === 'Revoke' ? 'Revoke access? They will be locked out of the app the next time it goes online.' : 'Reject this request?'))) return;
  const f = Cloud.f;
  try { await f.updateDoc(f.doc(Cloud.db, 'approvals', el.dataset.id), { status: s, decidedAt: f.serverTimestamp(), decidedBy: Cloud.user.email }); toast(s === 'approved' ? 'Approved ✓' : 'Done'); }
  catch (e) { toast('Could not update: ' + (e.code || e.message)); }
};
ACT.adminshare = () => { const url = location.origin + location.pathname; const msg = `PG Derma Companion — app for DVL residents 🩺\n${url}\nOpen it, tap “Continue with Google”, and I'll approve you.`; if (navigator.share) navigator.share({ text: msg }).catch(() => {}); else window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank'); };
ACT.appsignout = () => Gate.signOut();
const ADMIN_TABS = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['batches', 'Batches'], ['errors', 'Errors']];
ACT.admincalls = async el => {
  const on = el.dataset.on !== '1';
  if (on && !(await uiConfirm('Allow this person to make and receive voice/video calls with batchmates?', { ok: 'Allow calls' }))) return;
  try { await Cloud.f.updateDoc(Cloud.f.doc(Cloud.db, 'approvals', el.dataset.id), { calls: on }); toast(on ? 'Calls switched on' : 'Calls switched off'); }
  catch (e) { toast('Could not update: ' + (e.code || e.message)); }
};
ACT.admindel = async el => {
  if (!(await uiConfirm('Remove this record? If they sign in again they will appear as a new request.'))) return;
  try { await Cloud.f.deleteDoc(Cloud.f.doc(Cloud.db, 'approvals', el.dataset.id)); toast('Removed'); } catch (e) { toast('Could not remove: ' + (e.code || e.message)); }
};
function vAdminBatches() {
  main().innerHTML = `<div class="chips">${ADMIN_TABS.map(([k, l]) => `<a class="chip${k === 'batches' ? ' on' : ''}" href="#/admin?t=${k}">${l}</a>`).join('')}</div>
  <p class="small muted">Every batch in the app. Deleting removes its chat, calendar, shared counts and members for everyone.</p><div id="relayuse" class="info small" style="margin-bottom:10px">Call relay this month: loading…</div><div id="blist" class="card"><p class="muted small">Loading…</p></div>`;
  Cloud.init().then(async () => {
    const f = Cloud.f, db = Cloud.db, snap = await f.getDocs(f.collection(db, 'batches'));
    f.getDoc(f.doc(db, 'usage', new Date().toISOString().slice(0, 7))).then(u => { const x = u.exists() ? u.data() : {}, mb = x.relayMB || 0, el = $('#relayuse');
      if (el) el.textContent = `Call relay this month: about ${mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb + ' MB'} over ${x.relayCalls || 0} relayed call${x.relayCalls === 1 ? '' : 's'} — free up to 1,000 GB/month. Direct calls use none.`; }).catch(() => { const el = $('#relayuse'); if (el) el.hidden = true; });
    const rows = await Promise.all(snap.docs.map(async d => {
      const x = d.data(), [m, msg] = await Promise.all([f.getDocs(f.collection(db, 'batches', d.id, 'members')), f.getDocs(f.collection(db, 'batches', d.id, 'messages'))]);
      return { id: d.id, name: x.name, created: x.createdAt && x.createdAt.seconds ? x.createdAt.seconds * 1000 : 0, members: m.docs.map(z => ({ id: z.id, name: z.data().name, year: z.data().year })), msgs: msg.size };
    }));
    rows.sort((a, b) => b.created - a.created);
    const el = $('#blist'); if (!el) return;
    el.innerHTML = rows.map(r => `<details class="err-item"><summary><b>${esc(r.name || r.id)}</b><br><small class="muted">${esc(r.id)} · ${r.members.length} member${r.members.length === 1 ? '' : 's'} · ${r.msgs} message${r.msgs === 1 ? '' : 's'}${r.created ? ' · created ' + fmt(new Date(r.created).toISOString()) : ''}</small></summary>
      ${r.members.map(m => `<div class="li"><div>${esc(m.name || 'Member')}<small>${esc(m.year || '')}</small></div><button class="btn xs ghost danger" data-act="abkick" data-b="${esc(r.id)}" data-id="${esc(m.id)}">Remove</button></div>`).join('') || '<p class="small muted">No members.</p>'}
      <div class="btnrow"><button class="btn sm ghost danger" data-act="abclear" data-b="${esc(r.id)}">Clear chat</button><button class="btn sm danger" data-act="abdel" data-b="${esc(r.id)}" data-n="${esc(r.name || r.id)}">Delete batch</button></div></details>`).join('') || '<p class="muted small">No batches yet.</p>';
  }).catch(e => { const el = $('#blist'); if (el) el.innerHTML = `<p class="err">${esc(e.code || e.message)}</p>`; });
}
ACT.abdel = async el => {
  if (!(await uiType(`Delete "${el.dataset.n}" for everyone? This removes its chat, calendar, shared counts and members.`, 'DELETE'))) return;
  el.disabled = true; el.textContent = 'Deleting…';
  try { const n = await deleteBatchAll(el.dataset.b); if (D.batch && D.batch.id === el.dataset.b) { D.batch = null; Store.save(); } toast(`Deleted (${n} items)`); render(); }
  catch (e) { toast('Could not delete: ' + (e.code || e.message)); render(); }
};
ACT.abclear = async el => { if (!(await uiConfirm('Delete ALL chat messages in this batch?'))) return; try { const n = await clearBatchChat(el.dataset.b); toast(n + ' messages deleted'); render(); } catch (e) { toast('Could not clear: ' + (e.code || e.message)); } };
ACT.abkick = async el => {
  if (!(await uiConfirm('Remove this member from the batch? Their shared counts are removed too.'))) return;
  const f = Cloud.f, db = Cloud.db;
  try { await f.deleteDoc(f.doc(db, 'batches', el.dataset.b, 'logstats', el.dataset.id)).catch(() => {}); await f.deleteDoc(f.doc(db, 'batches', el.dataset.b, 'members', el.dataset.id)); toast('Removed'); render(); }
  catch (e) { toast('Could not remove: ' + (e.code || e.message)); }
};
function vAdminErrors() {
  main().innerHTML = `<div class="chips">${ADMIN_TABS.map(([k, l]) => `<a class="chip${k === 'errors' ? ' on' : ''}" href="#/admin?t=${k}">${l}</a>`).join('')}</div>
  <p class="small muted">App errors from approved users (last 50). Messages are scrubbed — no patient data is sent.</p>
  <div class="btnrow"><button class="btn sm ghost" data-act="errclear">Clear all</button></div><div id="elist" class="card"><p class="muted small">Loading…</p></div>`;
  Cloud.init().then(async () => {
    const f = Cloud.f, s = await f.getDocs(f.query(f.collection(Cloud.db, 'errors'), f.orderBy('createdAt', 'desc'), f.limit(50)));
    const el = $('#elist'); if (!el) return;
    window.__errDocs = s.docs.map(d => d.id);
    el.innerHTML = s.docs.map(d => { const x = d.data(); return `<details class="err-item"><summary><b>${esc(x.msg)}</b><br><small class="muted">${esc(x.type)} · ${esc(x.route)} · v${esc(x.version)} · ${esc((x.at || '').replace('T', ' ').slice(0, 16))}</small></summary><pre class="small">${esc(x.stack)}</pre><small class="muted">${esc(x.ua)}</small></details>`; }).join('') || '<p class="muted small">No errors reported 🎉</p>';
  }).catch(e => { const el = $('#elist'); if (el) el.innerHTML = `<p class="err">${esc(e.code || e.message)}</p>`; });
}
ACT.errclear = async () => { if (!(await uiConfirm('Delete all error reports?'))) return; const f = Cloud.f; for (const id of window.__errDocs || []) await f.deleteDoc(f.doc(Cloud.db, 'errors', id)).catch(() => {}); render(); };
