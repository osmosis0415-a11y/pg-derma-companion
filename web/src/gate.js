/* ===== Access gate: Google sign-in + manual approval by the admin =====
   approvals/{uid} = { email, name, photo, status: pending|approved|rejected, requestedAt, decidedAt, decidedBy }
   The admin is approved automatically. Once approved, the decision is cached on the device so the app works
   offline; it is re-checked whenever the app is online, and a revoked user is signed out of the app. */
const ADMIN_EMAILS = ['sriramdeverashetty@gmail.com'];
const isAdminUser = u => !!(u && u.email && ADMIN_EMAILS.includes(u.email.toLowerCase()));
const amAdmin = () => isAdminUser(Cloud.user) || !!(Gate.cached && ADMIN_EMAILS.includes((Gate.cached.email || '').toLowerCase()));

async function googleSignIn() {
  await Cloud.init();
  const f = Cloud.f, pr = new f.GoogleAuthProvider();
  pr.setCustomParameters({ prompt: 'select_account' });
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) { await f.signInWithRedirect(Cloud.auth, pr); return; }
  try { await f.signInWithPopup(Cloud.auth, pr); }
  catch (e) { if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') await f.signInWithRedirect(Cloud.auth, pr); else throw e; }
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
    l.innerHTML = `<div class="lockbox"><div class="logo">🩺</div><h1>PG Derma Companion</h1><p class="muted small">MD Dermatology, Venereology & Leprosy</p>${html}</div>`;
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
    if (!confirm('Sign out of PG Derma Companion on this device? Your encrypted data stays on this device; you will need Google sign-in (and your PIN) to open it again.')) return;
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
  main().innerHTML = `<div class="chips">${[['pending', '⏳ Pending'], ['approved', '✅ Approved'], ['rejected', '⛔ Rejected']].map(([k, l]) => `<a class="chip${k === tab ? ' on' : ''}" href="#/admin?t=${k}">${l} <span id="cnt_${k}"></span></a>`).join('')}</div>
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
        <div class="btnrow" style="margin:0">${x.status !== 'approved' ? `<button class="btn xs" data-act="adminset" data-id="${x.id}" data-s="approved">Approve</button>` : ''}${x.status === 'pending' ? `<button class="btn xs ghost danger" data-act="adminset" data-id="${x.id}" data-s="rejected">Reject</button>` : ''}${x.status === 'approved' ? `<button class="btn xs ghost danger" data-act="adminset" data-id="${x.id}" data-s="rejected">Revoke</button>` : ''}</div></div>`).join('') || `<p class="muted small">No ${tab} requests.</p>`;
    }, e => { const el = $('#alist'); if (el) el.innerHTML = `<p class="err">${esc(e.code || e.message)}</p>`; });
  }).catch(() => { $('#alist').innerHTML = '<p class="err">Could not reach Firebase.</p>'; });
}
ACT.adminset = async el => {
  const s = el.dataset.s;
  if (s === 'rejected' && !confirm(el.textContent === 'Revoke' ? 'Revoke access? They will be locked out of the app the next time it goes online.' : 'Reject this request?')) return;
  const f = Cloud.f;
  try { await f.updateDoc(f.doc(Cloud.db, 'approvals', el.dataset.id), { status: s, decidedAt: f.serverTimestamp(), decidedBy: Cloud.user.email }); toast(s === 'approved' ? 'Approved ✓' : 'Done'); }
  catch (e) { toast('Could not update: ' + (e.code || e.message)); }
};
ACT.adminshare = () => { const url = location.origin + location.pathname; const msg = `PG Derma Companion — app for DVL residents 🩺\n${url}\nOpen it, tap “Continue with Google”, and I'll approve you.`; if (navigator.share) navigator.share({ text: msg }).catch(() => {}); else window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank'); };
ACT.appsignout = () => Gate.signOut();
