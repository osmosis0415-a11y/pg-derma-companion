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

/* Referral: ?ref=CODE in an invite link is remembered until sign-up. A person's code = first 8 characters of their uid. */
(() => { try { const r = new URLSearchParams(location.search).get('ref'); if (r && /^[A-Za-z0-9]{4,20}$/.test(r)) localStorage.setItem('pgd_ref', r); } catch (e) {} })();
const myRefCode = () => (Cloud.user?.uid || (Gate.cached || {}).uid || '').slice(0, 8);
const inviteLink = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'site/?ref=' + myRefCode();
const AUTH_SLIDES = [['reels', 'Swipe to learn', 'An endless feed of MCQs, spots, pearls and flashcards, made for MD DVL.'], ['users', 'Your residency community', 'Share cases, ask doubts, follow seniors, message and call batchmates.'], ['book', 'Log everything', 'Encrypted case logbook, photos, scores and thesis tracking, all on your phone.'], ['flame', 'Build a daily streak', 'Five minutes a day, reminders that work, and a weekly leaderboard.']];
const Gate = {
  cached: null, _done: null, unsub: null,
  enabled() { return !!Cloud.cfg(); },
  async ensure() {
    if (!this.enabled()) return;
    const g = await IDB.get('meta', 'gate').catch(() => null);
    if (g && g.status === 'approved') { this.cached = g; return; }
    await new Promise(res => { this._done = res; this.screen(); });
  },
  box(html, hero) {
    $('#app').hidden = true; const l = $('#lock'); l.hidden = false; clearInterval(this._car);
    l.innerHTML = authShell(html, hero);
  },
  retry(msg) { this.box(`<p class="err">${esc(msg)}</p><button class="btn" id="gretry" style="width:100%">Try again</button>`); $('#gretry').onclick = () => this.screen(); },
  async screen() {
    if (!navigator.onLine) return this.retry('You are offline. Connect to the internet to sign in the first time.');
    this.box('<p class="muted small">Connecting…</p>');
    try { await Cloud.init(); } catch (e) { return this.retry('Could not reach Google sign-in. Check your internet.'); }
    const u = Cloud.user;
    if (!u) {
      return this.welcome();
    }
    if (isAdminUser(u)) return this.approve(u);
    const f = Cloud.f, ref = f.doc(Cloud.db, 'approvals', u.uid);
    let s;
    try {
      s = await f.getDoc(ref);
      if (!s.exists()) return this.signupForm(u);
    } catch (e) { return this.retry('Could not reach the server (' + (e.code || e.message) + ').'); }
    const st = s.data().status;
    if (st === 'approved') return this.approve(u);
    this.pending(u, st);
    if (this.unsub) this.unsub();
    this.unsub = f.onSnapshot(ref, d => { const x = d.data(); if (!x) return; if (x.status === 'approved') { this.unsub(); this.unsub = null; this.approve(u); } else this.pending(u, x.status); }, () => {});
  },
  /* ---------- Welcome: carousel + Create account / Log in ---------- */
  welcome(mode) {
    const ref = localStorage.getItem('pgd_ref');
    this.box(`<div class="carousel" id="car">${AUTH_SLIDES.map((x, k) => `<div class="slide${k ? '' : ' on'}"><span class="sic">${ic(x[0])}</span><b>${x[1]}</b><p>${x[2]}</p></div>`).join('')}</div>
      <div class="cdots">${AUTH_SLIDES.map((_, k) => `<i class="${k ? '' : 'on'}"></i>`).join('')}</div>
      ${ref ? `<div class="refban">${ic('users')}<span>You were invited by a batchmate · code <b>${esc(ref)}</b></span></div>` : ''}
      <button class="btn abtn" id="gup">${ic('plus')} Create account</button>
      <button class="btn ghost abtn" id="gin"><span class="g">G</span> Log in with Google</button>
      <p id="lerr" class="err"></p>
      <p class="tiny muted">Both use your Google account; no new password. New accounts are approved by the admin. Patient data stays encrypted on your phone.</p>`, true);
    Drive.loadGis().catch(() => {});
    let k = 0; const sl = $$('#car .slide'), dots = $$('.cdots i');
    const show = n => { k = (n + sl.length) % sl.length; sl.forEach((e, i) => e.classList.toggle('on', i === k)); dots.forEach((e, i) => e.classList.toggle('on', i === k)); };
    this._car = setInterval(() => show(k + 1), 3200);
    dots.forEach((d, i) => d.onclick = () => { show(i); clearInterval(this._car); });
    let sx = null; const car = $('#car'); car.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true }); car.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) { show(k + (dx < 0 ? 1 : -1)); clearInterval(this._car); } sx = null; });
    const go = async (which) => { const b = $(which === 'up' ? '#gup' : '#gin'); b.disabled = true; this.mode = which; try { await googleSignIn(); this.screen(); } catch (e) { $('#lerr').textContent = authMsg(e); b.disabled = false; } };
    $('#gup').onclick = () => go('up'); $('#gin').onclick = () => go('in');
  },
  /* ---------- Sign-up details (first time only) ---------- */
  signupForm(u) {
    const ref = localStorage.getItem('pgd_ref') || '';
    this.box(`${steps(1)}<h2 class="ah">${this.mode === 'in' ? 'Finish creating your account' : 'Tell us about you'}</h2>
      <div class="aform">
        <div class="who">${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span>${esc(initials(u.displayName || u.email))}</span>`}<div><b>${esc(u.displayName || '')}</b><small>${esc(u.email)}</small></div></div>
        <label>Name as you'd like it shown<input id="su_name" maxlength="80" value="${esc(u.displayName || '')}" placeholder="Dr. Your Name"></label>
        <label>College / institute<input id="su_col" maxlength="80" placeholder="e.g. Osmania Medical College"></label>
        <label>You are</label>${chips('su_year', [['JR1', 'JR1'], ['JR2', 'JR2'], ['JR3', 'JR3'], ['SR', 'Senior resident'], ['Faculty', 'Faculty'], ['Aspirant', 'PG aspirant']], 'JR1')}
        <label>Referral code (optional)<input id="su_ref" maxlength="20" value="${esc(ref)}" placeholder="From your batchmate's invite link"></label>
        <label class="row decl"><input type="checkbox" id="su_ok"> <span class="small">I'm a doctor or medical student. I won't post patient-identifiable information, and I accept that the admin may remove content or access.</span></label>
        <button class="btn abtn" id="su_go">Request access</button><p id="lerr" class="err"></p>
        <button class="link small" id="su_out">Use a different Google account</button></div>`);
    $('#su_out').onclick = async () => { try { await Cloud.f.signOut(Cloud.auth); } catch (e) {} Cloud.user = null; this.welcome(); };
    $('#su_go').onclick = async () => {
      const name = $('#su_name').value.trim(), col = $('#su_col').value.trim(), yr = getChips('su_year') || 'JR1', rf = $('#su_ref').value.trim();
      if (name.length < 2) return $('#lerr').textContent = 'Please enter your name';
      if (!col) return $('#lerr').textContent = 'Please enter your college';
      if (rf && !/^[A-Za-z0-9]{4,20}$/.test(rf)) return $('#lerr').textContent = 'That referral code doesn\'t look right';
      if (!$('#su_ok').checked) return $('#lerr').textContent = 'Please accept the community rules';
      $('#su_go').disabled = true;
      const f = Cloud.f, d = { email: u.email, name: name.slice(0, 80), photo: (u.photoURL || '').slice(0, 500), status: 'pending', requestedAt: f.serverTimestamp(), college: col.slice(0, 80), year: yr };
      if (rf && rf !== u.uid.slice(0, 8)) d.ref = rf;
      try { await f.setDoc(f.doc(Cloud.db, 'approvals', u.uid), d); if (D) { D.settings.name = d.name; } localStorage.setItem('pgd_signup', JSON.stringify({ name: d.name, college: d.college, year: yr })); localStorage.removeItem('pgd_ref'); this.screen(); }
      catch (e) { $('#su_go').disabled = false; $('#lerr').textContent = 'Could not send your request (' + (e.code || e.message) + ')'; }
    };
  },
  pending(u, st) {
    const rej = st === 'rejected';
    const msg = `Hi Dr. Sriram, I've requested access to PG Derma Companion with ${u.email}. Please approve. ${location.origin + location.pathname}`;
    const inv = `Join me on PG Derma — the app for MD Dermatology residents: daily study feed, case community and logbook.\n${inviteLink()}`;
    this.box(`${steps(rej ? -1 : 2)}<div class="who big">${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span>${esc(initials(u.displayName || u.email))}</span>`}<div><b>${esc(u.displayName || '')}</b><small>${esc(u.email)}</small></div></div>
      ${rej ? '<p class="err">Your access request was not approved. Contact the admin if you think this is a mistake.</p>'
        : `<div class="waiting"><span class="pulse"></span><b>Waiting for admin approval</b><small>This screen opens the app by itself the moment you're approved.</small></div>
        <a class="btn wa abtn" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Ask the admin on WhatsApp</a>
        <div class="invite"><b>Invite your batchmates</b><small>Share your link. You get credit when they join.</small><div class="code">${esc(myRefCode())}</div><a class="btn ghost abtn" href="https://wa.me/?text=${encodeURIComponent(inv)}" target="_blank" rel="noopener">${ic('send')} Share invite</a></div>`}
      <button class="btn ghost abtn" id="gcheck">Check again</button>
      <button class="link small" id="gout">Use a different Google account</button>`);
    $('#gcheck').onclick = () => this.screen();
    $('#gout').onclick = async () => { if (this.unsub) { this.unsub(); this.unsub = null; } try { await Cloud.f.signOut(Cloud.auth); } catch (e) {} Cloud.user = null; this.screen(); };
  },
  async approve(u) {
    try { const su = JSON.parse(localStorage.getItem('pgd_signup') || 'null'); if (su) { Gate.signup = su; localStorage.removeItem('pgd_signup'); } } catch (e) {}
    clearInterval(this._car);
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
    await IDB.del('meta', 'gate'); Usage.clearLocal(); await Drive.forget().catch(() => {}); location.reload();
  }
};

function steps(n) {
  const L = [['Google', 'check'], ['Details', 'user'], ['Approval', 'shield'], ['Ready', 'flame']];
  return `<div class="steps">${L.map(([t, i], k) => `<span class="${n < 0 && k === 2 ? 'bad' : k < n || (n === 3) ? 'done' : k === n ? 'cur' : ''}"><i>${ic(i)}</i><small>${t}</small></span>`).join('<b></b>')}</div>`;
}
function authShell(html, hero) {
  return `<div class="authbg"><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i></div><div class="authcard${hero ? ' hero' : ''}"><div class="alogo">${logoSvg()}</div><h1>PG Derma</h1><p class="atag">${hero ? '<span class="rot"><span>Learn daily.</span><span>Discuss cases.</span><span>Log your residency.</span></span>' : 'MD Dermatology, Venereology & Leprosy'}</p>${html}</div>`;
}
/* ---------- Invite card (Profile) ---------- */
function inviteCardHTML() {
  if (!Cloud.user && !(Gate.cached || {}).uid) return '';
  const n = typeof Notif !== 'undefined' ? Notif.list.filter(x => x.type === 'refer').length : 0;
  return `<div class="card invite2"><div class="row between"><div><b>Invite batchmates</b><small class="muted"> · ${n} joined with your link</small></div><span class="code">${esc(myRefCode())}</span></div>
    <div class="btnrow"><button class="btn sm" data-act="invshare">${ic('send')} Share invite</button><button class="btn sm ghost" data-act="invcopy">Copy link</button></div></div>`;
}
ACT.invshare = () => { const t = `Join me on PG Derma — the app for MD Dermatology residents: daily study feed, case community and logbook.\n${inviteLink()}`; if (navigator.share) navigator.share({ text: t }).catch(() => {}); else window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank'); };
ACT.invcopy = async () => { try { await navigator.clipboard.writeText(inviteLink()); toast('Invite link copied'); } catch (e) { toast(inviteLink(), 5000); } };
/* When the admin approves someone who used a referral code, credit the referrer. */
async function creditReferrer(x) {
  if (!x || !x.ref) return; const f = Cloud.f;
  try { const all = await f.getDocs(f.collection(Cloud.db, 'approvals')); const r = all.docs.find(d => d.id.slice(0, 8) === x.ref && d.id !== x.id); if (!r) return;
    await f.addDoc(f.collection(Cloud.db, 'notifs'), { to: r.id, from: Cloud.user.uid, fromName: (x.name || x.email || 'A resident').slice(0, 80), type: 'refer', ref: x.id.slice(0, 120), text: '', at: f.serverTimestamp(), read: false, pushed: false }); } catch (e) {}
}

/* ---------- Admin panel ---------- */
let adminUnsub = null;
function vAdmin() {
  setTitle('Access requests', false);
  if (!amAdmin()) { main().innerHTML = empty('Admins only'); return; }
  const tab = ROUTE.q.t || 'pending';
  if (tab === 'errors') return vAdminErrors();
  if (tab === 'batches') return vAdminBatches();
  if (tab === 'content') return vAdminContent();
  if (tab === 'reports') return vAdminReports();
  if (tab === 'design') return vAdminDesign();
  if (tab === 'bots') return vAdminBots();
  if (tab === 'analytics') return vAdminAnalytics();
  if (tab === 'storage') return vAdminStorage();
  if (tab === 'health') return vAdminHealth();
  main().innerHTML = `<div class="chips">${ADMIN_TABS.map(([k, l]) => `<a class="chip${k === tab ? ' on' : ''}" href="#/admin?t=${k}">${l} <span id="cnt_${k}"></span></a>`).join('')}</div>
  <div id="alist" class="card"><p class="muted small">Loading…</p></div>
  <a class="card link" href="#/admin?t=design"><b>${ic('grid')} Deploy designs</b><small class="muted"> — Bento / Glass home, X-style feed, micro-learning deck ›</small></a>
  <div class="card laycard"><h3>App style</h3><p class="small muted">How the Community feed looks for everyone.</p><div class="btnrow"><button class="btn sm${AppCfg.layout !== 'twitter' ? ' on' : ' ghost'}" data-act="setlayout" data-l="insta">Instagram style</button><button class="btn sm${AppCfg.layout === 'twitter' ? ' on' : ' ghost'}" data-act="setlayout" data-l="twitter">Twitter / X style</button></div></div>
  <div class="card"><h3>Invite people</h3><p class="small muted">Share the app link. They sign in with Google and appear here for your approval.</p><button class="btn sm ghost" data-act="adminshare">Share app link</button></div>`;
  Cloud.init().then(() => {
    if (ROUTE.q.dial && amAdmin()) { const id = ROUTE.q.dial, v = ROUTE.q.v === '1'; history.replaceState(null, '', '#/admin?t=approved'); Cloud.f.getDoc(Cloud.f.doc(Cloud.db, 'approvals', id)).then(d => { const x = d.data() || {}; Calls.call(id, x.name || x.email || 'Resident', v, true); }); }
    if (adminUnsub) adminUnsub();
    adminUnsub = Cloud.f.onSnapshot(Cloud.f.collection(Cloud.db, 'approvals'), snap => {
      if (ROUTE.path !== 'admin') return;
      const all = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      for (const k of ['pending', 'approved', 'rejected']) { const c = $('#cnt_' + k); if (c) c.textContent = all.filter(x => x.status === k).length || ''; }
      const ts = x => (x && x.seconds ? x.seconds * 1000 : 0);
      const list = all.filter(x => x.status === tab).sort((a, b) => ts(b.requestedAt) - ts(a.requestedAt));
      const el = $('#alist'); if (!el) return;
      el.innerHTML = list.map(x => `<div class="li"><div class="row" style="gap:10px">${x.photo ? `<img class="gav sm" src="${esc(x.photo)}" alt="" referrerpolicy="no-referrer">` : ''}<div><b>${esc(x.name || x.email)}</b><small>${esc(x.email)}${x.year || x.college ? ' · ' + esc([x.year, x.college].filter(Boolean).join(', ')) : ''}${x.ref ? ' · referred by ' + esc((all.find(y => y.id.slice(0, 8) === x.ref) || {}).name || x.ref) : ''}${ts(x.requestedAt) ? ' · requested ' + fmt(new Date(ts(x.requestedAt)).toISOString()) : ''}</small></div></div>
        <div class="btnrow" style="margin:0">${x.status !== 'approved' ? `<button class="btn xs" data-act="adminset" data-id="${x.id}" data-s="approved">Approve</button>` : ''}${x.status === 'pending' ? `<button class="btn xs ghost danger" data-act="adminset" data-id="${x.id}" data-s="rejected">Reject</button>` : ''}${x.status === 'approved' && !ADMIN_EMAILS.includes((x.email || '').toLowerCase()) ? `<button class="btn xs" data-act="admindial" data-id="${x.id}" data-n="${esc(x.name || x.email)}" data-v="0" aria-label="Voice call">${ic('phone')}</button><button class="btn xs" data-act="admindial" data-id="${x.id}" data-n="${esc(x.name || x.email)}" data-v="1" aria-label="Video call">${ic('video')}</button>` : ''}${x.status === 'approved' && !ADMIN_EMAILS.includes((x.email || '').toLowerCase()) ? `<button class="btn xs ${x.calls ? '' : 'ghost'}" data-act="admincalls" data-id="${x.id}" data-on="${x.calls ? 1 : 0}" title="Voice/video calls">${ic('phone')} Calls ${x.calls ? 'on' : 'off'}</button>` : ''}${x.status === 'approved' ? `<button class="btn xs ghost danger" data-act="adminset" data-id="${x.id}" data-s="rejected">Revoke</button>` : ''}${x.status === 'rejected' ? `<button class="btn xs ghost" data-act="admindel" data-id="${x.id}">Remove</button>` : ''}</div></div>`).join('') || `<p class="muted small">No ${tab} requests.</p>`;
    }, e => { const el = $('#alist'); if (el) el.innerHTML = `<p class="err">${esc(e.code || e.message)}</p>`; });
  }).catch(() => { $('#alist').innerHTML = '<p class="err">Could not reach Firebase.</p>'; });
}
ACT.admindial = el => Calls.call(el.dataset.id, el.dataset.n, el.dataset.v === '1', true);
ACT.adminset = async el => {
  const s = el.dataset.s;
  if (s === 'rejected' && !(await uiConfirm(el.textContent === 'Revoke' ? 'Revoke access? They will be locked out of the app the next time it goes online.' : 'Reject this request?'))) return;
  const f = Cloud.f;
  try { await f.updateDoc(f.doc(Cloud.db, 'approvals', el.dataset.id), { status: s, decidedAt: f.serverTimestamp(), decidedBy: Cloud.user.email }); toast(s === 'approved' ? 'Approved ✓' : 'Done');
    if (s === 'approved') { const d = await f.getDoc(f.doc(Cloud.db, 'approvals', el.dataset.id)); creditReferrer(Object.assign({ id: el.dataset.id }, d.data())); } }
  catch (e) { toast('Could not update: ' + (e.code || e.message)); }
};
ACT.adminshare = () => { const url = location.origin + location.pathname; const msg = `PG Derma Companion — app for DVL residents 🩺\n${url}\nOpen it, tap “Continue with Google”, and I'll approve you.`; if (navigator.share) navigator.share({ text: msg }).catch(() => {}); else window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank'); };
ACT.appsignout = () => Gate.signOut();
const ADMIN_TABS = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['design', 'Designs'], ['bots', 'Bots'], ['batches', 'Batches'], ['content', 'Content'], ['reports', 'Reports'], ['errors', 'Errors'], ['analytics', 'Analytics'], ['storage', 'Storage'], ['health', 'Health']];
ACT.admincalls = async el => {
  const on = el.dataset.on !== '1';
  if (on && !(await uiConfirm('Allow this person to make and receive voice/video calls with batchmates?', { ok: 'Allow calls' }))) return;
  try { await Cloud.f.updateDoc(Cloud.f.doc(Cloud.db, 'approvals', el.dataset.id), { calls: on }); toast(on ? 'Calls switched on' : 'Calls switched off'); }
  catch (e) { toast('Could not update: ' + (e.code || e.message)); }
};
ACT.admindel = async el => {
  if (!(await uiConfirm('Remove this record? If they sign in again they will appear as a new request.'))) return;
  try { await Cloud.f.deleteDoc(Cloud.f.doc(Cloud.db, 'approvals', el.dataset.id)); await Cloud.f.deleteDoc(Cloud.f.doc(Cloud.db, 'usage', el.dataset.id)).catch(() => {}); toast('Removed'); } catch (e) { toast('Could not remove: ' + (e.code || e.message)); }
};
/* ---------- Admin → Content: review study items drafted by the bot ---------- */
function contentPreview(x) {
  if (x.t === 'mcq') return `<b>${esc(x.q)}</b><ol type="A" class="small">${(x.o || []).map((o, i) => `<li${i === +x.a ? ' class="okc"' : ''}>${esc(o)}</li>`).join('')}</ol><p class="small muted">${esc(x.x || '')}</p>${x.r ? `<small class="muted">${esc(x.r)}</small>` : ''}`;
  if (x.t === 'card') return `<b>${esc(x.f)}</b><p class="small pre">${esc(x.b)}</p>`;
  if (x.t === 'spot') return `<p class="small">${esc(x.v)}</p><b>→ ${esc(x.dx)}</b><p class="small muted">${esc(x.x || '')}</p>`;
  return `<p>${esc(x.p)}</p>`;
}
let contentDrafts = [];
function vAdminContent() {
  main().innerHTML = `<div class="chips">${ADMIN_TABS.map(([k, l]) => `<a class="chip${k === 'content' ? ' on' : ''}" href="#/admin?t=${k}">${l}</a>`).join('')}</div>
  <p class="small muted">The content bot drafts study items every morning with free Gemini AI. Check each one — AI can be wrong. Nothing reaches residents until you publish it.</p>
  <div id="clist"><p class="muted small">Loading…</p></div>`;
  Cloud.init().then(async () => {
    const f = Cloud.f, db = Cloud.db;
    const dr = await f.getDocs(f.query(f.collection(db, 'content'), f.where('status', '==', 'draft')));
    const lv = await f.getDocs(f.query(f.collection(db, 'content'), f.where('status', '==', 'live')));
    contentDrafts = dr.docs.map(d => Object.assign({ id: d.id }, d.data()));
    const el = $('#clist'); if (!el) return;
    el.innerHTML = `<div class="info small" style="margin-bottom:10px">${contentDrafts.length} waiting for review · ${lv.size} published · plus ${STUDY_BANK.length} built-in items</div>
      ${contentDrafts.length ? `<button class="btn sm" data-act="cpuball">Publish all ${contentDrafts.length}</button>` : ''}
      ${contentDrafts.map(x => `<div class="card citem"><div class="qtag"><span>${STUDY_TYPES[x.t] || x.t}</span><span>${esc(x.top || '')}</span></div>${contentPreview(x)}
        <div class="btnrow"><button class="btn xs" data-act="cpub" data-id="${x.id}">Publish</button><button class="btn xs ghost" data-act="cedit" data-id="${x.id}">Edit</button><button class="btn xs ghost danger" data-act="cdel" data-id="${x.id}">Discard</button></div></div>`).join('') || '<p class="muted small">No drafts waiting. New ones arrive each morning by email too.</p>'}`;
  }).catch(e => { const el = $('#clist'); if (el) el.innerHTML = `<p class="err">${esc(e.code || e.message || 'Could not load')}</p>`; });
}
const C_FIELDS = { mcq: [['q', 'Question'], ['o', 'Options (one per line)'], ['a', 'Correct option (A–E)'], ['x', 'Explanation'], ['r', 'Reference']], card: [['f', 'Front'], ['b', 'Back']], spot: [['v', 'Vignette'], ['dx', 'Diagnosis'], ['x', 'Explanation']], pearl: [['p', 'One-liner']] };
ACT.cpub = async el => { const f = Cloud.f; try { await f.updateDoc(f.doc(Cloud.db, 'content', el.dataset.id), { status: 'live', approvedAt: f.serverTimestamp() }); toast('Published'); vAdminContent(); } catch (e) { toast('Could not publish: ' + (e.code || e.message)); } };
ACT.cpuball = async () => { if (!(await uiConfirm(`Publish all ${contentDrafts.length} drafts to every resident? Make sure you have checked them.`, { ok: 'Publish all' }))) return; const f = Cloud.f; let n = 0; for (const x of contentDrafts) { try { await f.updateDoc(f.doc(Cloud.db, 'content', x.id), { status: 'live', approvedAt: f.serverTimestamp() }); n++; } catch (e) {} } toast('Published ' + n); vAdminContent(); };
ACT.cdel = async el => { if (!(await uiConfirm('Discard this draft?', { ok: 'Discard' }))) return; try { await Cloud.f.deleteDoc(Cloud.f.doc(Cloud.db, 'content', el.dataset.id)); toast('Discarded'); vAdminContent(); } catch (e) { toast('Could not discard'); } };
ACT.cedit = el => {
  const x = contentDrafts.find(y => y.id === el.dataset.id); if (!x) return;
  openSheet(`<h3>Edit ${STUDY_TYPES[x.t] || ''}</h3><div class="form">${(C_FIELDS[x.t] || []).map(([k, l]) => `<label>${l}<textarea id="ce_${k}" rows="${k === 'a' || k === 'dx' || k === 'r' ? 1 : 3}">${esc(k === 'o' ? (x.o || []).join('\n') : k === 'a' ? 'ABCDE'[+x.a] : (x[k] || ''))}</textarea></label>`).join('')}
    <div class="btnrow"><button class="btn" data-act="csave" data-id="${x.id}" data-pub="1">Save and publish</button><button class="btn ghost" data-act="csave" data-id="${x.id}">Save draft</button></div></div>`);
};
ACT.csave = async el => {
  const x = contentDrafts.find(y => y.id === el.dataset.id); if (!x) return;
  const up = {};
  for (const [k] of C_FIELDS[x.t] || []) { const v = ($('#ce_' + k).value || '').trim(); up[k] = k === 'o' ? v.split('\n').map(s => s.trim()).filter(Boolean) : k === 'a' ? Math.max(0, 'ABCDE'.indexOf(v.toUpperCase().slice(0, 1))) : v; }
  if (x.t === 'mcq' && (up.o.length < 2 || up.a >= up.o.length || !up.q)) return toast('Check the question, options and correct letter');
  if (el.dataset.pub) { up.status = 'live'; up.approvedAt = Cloud.f.serverTimestamp(); }
  try { await Cloud.f.updateDoc(Cloud.f.doc(Cloud.db, 'content', x.id), up); closeSheet(); toast(el.dataset.pub ? 'Saved and published' : 'Saved'); vAdminContent(); } catch (e) { toast('Could not save: ' + (e.code || e.message)); }
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

/* ---------- Admin → Designs: pick a theme for every page (+ fine-tune layouts), preview on this phone, deploy to everyone, roll back ---------- */
let designDraft = null;
const designOf = h => Object.assign({ layout: 'twitter' }, AppCfg.clean(h), { layout: h.layout || 'twitter' });
const designSummary = c => `${DESIGN_NAMES.theme[c.theme]} theme · ${DESIGN_NAMES.home[c.home]} · ${DESIGN_NAMES.layout[c.layout]} · ${DESIGN_NAMES.deck[c.deck]}`;
const designLive = () => Object.assign({}, AppCfg.live, { layout: AppCfg.layout });
const sameDesign = (a, b) => ['theme', 'home', 'deck', 'layout'].every(k => a[k] === b[k]);
const THEME_INFO = [
  ['classic', 'Classic', 'Teal and white; follows each phone\'s light/dark setting'],
  ['bento', 'Bento', 'White and stone, pastel tiles, black pill buttons, red accent'],
  ['glass', 'Glass', 'Dark navy with glowing colour behind frosted cards'],
  ['x', 'X Dark', 'OLED black, hairline borders, blue accent'],
  ['micro', 'Obsidian', 'Soft dark, indigo and emerald — the micro-learning look']
];
function vAdminDesign() {
  setTitle('Deploy designs', true);
  if (!amAdmin()) { main().innerHTML = empty('Admins only'); return; }
  const live = designLive(), pv = AppCfg.preview();
  if (!designDraft) designDraft = pv ? Object.assign({}, live, AppCfg.clean(pv.design), { layout: pv.layout || live.layout }) : Object.assign({}, live);
  const d = designDraft, same = sameDesign(d, live);
  const opt = (k, v, label, sub, sw) => `<button class="dopt${d[k] === v ? ' on' : ''}" data-act="designpick" data-k="${k}" data-v="${v}" role="radio" aria-checked="${d[k] === v}"><span class="dsw ${sw}" aria-hidden="true"></span><span class="dtx"><b>${esc(label)}</b><small>${esc(sub)}</small></span><span class="drad" aria-hidden="true"></span></button>`;
  const ts = x => (x && x.seconds ? x.seconds * 1000 : typeof x === 'number' ? x : 0);
  main().innerHTML = `<div class="chips">${ADMIN_TABS.map(([k, l]) => `<a class="chip${k === 'design' ? ' on' : ''}" href="#/admin?t=${k}">${l}</a>`).join('')}</div>
  <section class="card dlive"><small>Live for everyone</small><b>${esc(designSummary(live))}</b>${pv ? `<p class="small">You are previewing a different design on this phone only. <button class="btn xs ghost" data-act="designunpreview">Stop preview</button></p>` : ''}</section>
  <section class="card"><h3>1 · Theme — every page</h3><p class="small muted">Colours, cards, buttons, navigation, Community, Study, the swipe feed and this admin console all follow the theme. Picking a theme also picks the layouts that suit it; change them below if you like.</p>
    <div class="dopts" role="radiogroup" aria-label="Theme">${THEME_INFO.map(([v, l, sub]) => `<button class="dopt${d.theme === v ? ' on' : ''}" data-act="designtheme" data-v="${v}" role="radio" aria-checked="${d.theme === v}"><span class="dsw tsw-${v}" aria-hidden="true"></span><span class="dtx"><b>${esc(l)}</b><small>${esc(sub)}</small></span><span class="drad" aria-hidden="true"></span></button>`).join('')}</div></section>
  <section class="card"><h3>2 · Fine-tune layouts</h3>
    <h4>Home screen</h4><div class="dopts" role="radiogroup" aria-label="Home screen">
    ${opt('home', 'classic', 'Classic hero', 'Hero banner with your Today list', 'sw-classic')}
    ${opt('home', 'bento', 'Bento grid', 'Case carousel, goal, streak, quick quiz, what\'s due', 'sw-bento')}</div>
    <h4>Community feed</h4><div class="dopts" role="radiogroup" aria-label="Community feed">
    ${opt('layout', 'twitter', 'X-style timeline', 'Round avatars, hairline rows, reply / like / share bar', 'sw-x')}
    ${opt('layout', 'insta', 'Instagram feed', 'Big image cards with stories', 'sw-insta')}</div>
    <h4>Study feed</h4><div class="dopts" role="radiogroup" aria-label="Study feed">
    ${opt('deck', 'classic', 'Classic swipe feed', 'Colour-coded full-screen cards', 'sw-feed')}
    ${opt('deck', 'micro', 'Micro-learning deck', 'Topic pill, one card per swipe, thumb rail — in the theme\'s colours', 'sw-micro')}</div></section>
  <div class="dbtns"><button class="btn ghost" data-act="designpreview">${ic('user')} Preview on this phone</button>
    <button class="btn" data-act="designdeploy"${same ? ' disabled' : ''}>Deploy to everyone</button></div>
  <p class="small muted center">${same ? 'This is what is live now. Change something to deploy.' : 'Everyone gets it the next time the app opens online. You can roll back below.'}</p>
  <section class="card"><h3>Deploy history</h3>${AppCfg.history.length ? AppCfg.history.slice(0, 6).map((h, i) => { const c = designOf(h); const isLive = sameDesign(c, live);
    return `<div class="li"><div><b>${esc(designSummary(c))}</b><small>${ts(h.at) ? fmt(new Date(ts(h.at)).toISOString()) : ''}${h.by ? ' · ' + esc(h.by) : ''}</small></div>${isLive ? '<span class="tag">Live</span>' : `<button class="btn xs ghost danger" data-act="designrollback" data-i="${i}">Roll back</button>`}</div>`; }).join('') : '<p class="muted small">No deploys yet.</p>'}</section>`;
  Cloud.init().then(() => AppCfg.load()).then(() => { if (ROUTE.path === 'admin' && ROUTE.q.t === 'design') { const h = JSON.stringify(AppCfg.history); if (h !== vAdminDesign._h) { vAdminDesign._h = h; vAdminDesign(); } } }).catch(() => {});
}
ACT.designtheme = el => { const t = el.dataset.v; designDraft = Object.assign({}, designDraft || designLive(), { theme: t }, THEME_BUNDLES[t]); vAdminDesign(); };
ACT.designpick = el => { designDraft = Object.assign({}, designDraft || designLive(), { [el.dataset.k]: el.dataset.v }); vAdminDesign(); };
ACT.designpreview = () => {
  const d = designDraft || designLive();
  localStorage.setItem('pgd_design_preview', JSON.stringify({ design: AppCfg.clean(d), layout: d.layout }));
  AppCfg.apply(); toast('Previewing on this phone only — open any page'); go('#/home');
};
ACT.designunpreview = () => { localStorage.removeItem('pgd_design_preview'); designDraft = null; AppCfg.apply(); toast('Preview off — you see what everyone sees'); vAdminDesign(); };
async function designWrite(c, msg) {
  const f = Cloud.f, cl = AppCfg.clean(c), entry = Object.assign({}, cl, { layout: c.layout, at: Date.now(), by: (Cloud.user && Cloud.user.email) || '' });
  const hist = [entry].concat(AppCfg.history || []).slice(0, 10);
  await f.setDoc(f.doc(Cloud.db, 'config', 'app'), { layout: c.layout, design: cl, designHistory: hist, updatedAt: f.serverTimestamp() }, { merge: true });
  AppCfg.layout = c.layout; AppCfg.live = cl; AppCfg.history = hist;
  localStorage.setItem('pgd_layout', c.layout); localStorage.setItem('pgd_design', JSON.stringify(cl)); localStorage.removeItem('pgd_design_preview');
  designDraft = null; AppCfg.apply(); toast(msg); vAdminDesign();
}
ACT.designdeploy = async () => {
  const d = designDraft || designLive(); if (sameDesign(d, designLive())) return;
  if (!(await uiConfirm(`Deploy to everyone? ${designSummary(d)}. Approved users get it the next time the app opens online.`, { ok: 'Deploy' }))) return;
  try { await Cloud.init(); await designWrite(d, 'Deployed to everyone'); } catch (e) { toast('Could not deploy: ' + (e.code || e.message)); }
};
ACT.designrollback = async el => {
  const h = AppCfg.history[+el.dataset.i]; if (!h) return; const c = designOf(h);
  if (!(await uiConfirm(`Roll back everyone to: ${designSummary(c)}?`, { ok: 'Roll back' }))) return;
  try { await Cloud.init(); await designWrite(c, 'Rolled back'); } catch (e) { toast('Could not roll back: ' + (e.code || e.message)); }
};
/* ---------- Admin → Bots: switch the labelled community bots on/off (the Apps Script reads config/bots) ---------- */
const BOT_LIST = [['case', 'Case of the Day Bot', '9 am teaching case · answer revealed in the thread by evening'], ['sop', 'Basics & SOP Bot', '1 pm basics lesson or procedure SOP'],
  ['replies', 'Bot answers to questions', 'Basics & SOP Bot replies to residents\' Questions unanswered for an hour'], ['thesis', 'Thesis Coach Bot', '6 pm Mon/Wed/Fri research-method tip'], ['journal', 'Journal Club Bot', '8 pm discussion on a paper from the live Journal digest']];
let botsCfg = null;
function vAdminBots() {
  setTitle('Bots', true);
  if (!amAdmin()) { main().innerHTML = empty('Admins only'); return; }
  const c = botsCfg || {}, on = c.on !== false, last = c.last || {};
  const sw = (k, label, sub) => { const v = k === 'on' ? on : c[k] !== false; return `<div class="li"><div><b>${esc(label)}</b><small>${esc(sub)}${k !== 'on' && k !== 'replies' && last[k] ? ' · last post ' + esc(last[k]) : ''}</small></div><button class="btn xs${v ? '' : ' ghost'}" role="switch" aria-checked="${v}" data-act="botset" data-k="${k}" data-v="${v ? 0 : 1}"${k !== 'on' && !on ? ' disabled' : ''}>${v ? 'On' : 'Off'}</button></div>`; };
  main().innerHTML = `<div class="chips">${ADMIN_TABS.map(([k, l]) => `<a class="chip${k === 'bots' ? ' on' : ''}" href="#/admin?t=${k}">${l}</a>`).join('')}</div>
  <p class="small muted">Bots are clearly labelled AI accounts (name ends in “Bot”, BOT badge, AI-generated note on every post). They post automatically from the admin bot script. Delete any bot post from its ⋯ menu.</p>
  <section class="card">${botsCfg ? sw('on', 'All bots', on ? 'Bots are posting' : 'All bots are paused') + BOT_LIST.map(([k, l, s]) => sw(k, l, s)).join('') : '<p class="muted small">Loading…</p>'}</section>
  <p class="small muted">First time: open the admin bot script, paste the latest <code>tools/admin-bot.gs</code> and run <b>setupBots()</b> once.</p>`;
  if (!botsCfg) Cloud.init().then(async () => { try { const d = await Cloud.f.getDoc(Cloud.f.doc(Cloud.db, 'config', 'bots')); botsCfg = d.exists() ? d.data() : {}; } catch (e) { botsCfg = {}; } if (ROUTE.path === 'admin' && ROUTE.q.t === 'bots') vAdminBots(); }).catch(() => {});
}
ACT.botset = async el => {
  const k = el.dataset.k, v = el.dataset.v === '1';
  try { await Cloud.f.setDoc(Cloud.f.doc(Cloud.db, 'config', 'bots'), { [k]: v, updatedAt: Cloud.f.serverTimestamp() }, { merge: true }); botsCfg = Object.assign({}, botsCfg, { [k]: v }); toast(v ? 'Switched on' : 'Switched off'); vAdminBots(); }
  catch (e) { toast('Could not save: ' + (e.code || e.message)); }
};

/* ---------- Admin → Analytics / Storage / Health (numbers only; maths in usage.js) ---------- */
const admMs = x => !x ? 0 : x.toMillis ? x.toMillis() : x.seconds ? x.seconds * 1000 : typeof x === 'number' ? x : Date.parse(x) || 0;
const adminChips = t => `<div class="chips">${ADMIN_TABS.map(([k, l]) => `<a class="chip${k === t ? ' on' : ''}" href="#/admin?t=${k}">${l}</a>`).join('')}</div>`;
const admAgo = x => { const t = admMs(x); if (!t) return ''; const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : Math.floor(s / 86400) + ' d ago'; };
const nfmt = n => n == null ? '—' : Number(n).toLocaleString('en-IN');
const pfmt = p => p == null ? '—' : p + '%';
const LIGHT = { green: ['🟢', 'All good'], yellow: ['🟡', 'Needs a look'], red: ['🔴', 'Action needed'] };
function lightHTML(h, compact) {
  const [e, l] = LIGHT[h.light] || LIGHT.green;
  return `<div class="card hlight hl-${h.light}" id="hlight" data-light="${h.light}"><b>${e} ${l}</b>${h.reasons.length ? (compact ? `<small class="muted"> · ${esc(h.reasons[0])}${h.reasons.length > 1 ? ' +' + (h.reasons.length - 1) : ''}</small>` : `<ul class="small">${h.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`) : '<small class="muted"> · no problems found</small>'}${compact ? ' <a class="link small" href="#/admin?t=health">Health ›</a>' : ''}</div>`;
}
const statsHTML = rows => `<div class="stats">${rows.map(([n, l]) => `<div class="stat"><b>${esc(typeof n === 'number' ? nfmt(n) : n)}</b><small>${esc(l)}</small></div>`).join('')}</div>`;
function barsSVG(items, label) {
  const W = 320, H = 120, n = items.length || 1, bw = W / n, max = Math.max(1, ...items.map(x => x.n));
  return `<svg class="abars" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="${esc(label)}">${items.map((x, i) => { const h = Math.round(x.n / max * H); return `<rect x="${(i * bw + 2).toFixed(1)}" y="${H - h}" width="${(bw - 4).toFixed(1)}" height="${h}" rx="3"><title>${esc(x.label)}: ${x.n}</title></rect>${x.n ? `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${Math.max(10, H - h - 3)}" text-anchor="middle">${x.n}</text>` : ''}${i % 3 === 0 || i === n - 1 ? `<text class="ax" x="${(i * bw + bw / 2).toFixed(1)}" y="${H + 14}" text-anchor="middle">${esc(x.label)}</text>` : ''}`; }).join('')}</svg>`;
}
function hbarsHTML(obj, empty) {
  const e = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]), max = Math.max(1, ...e.map(x => x[1]));
  return e.length ? `<div class="hbars">${e.map(([k, v]) => `<div class="hb"><span>${esc(k)}</span><i style="width:${Math.max(2, Math.round(v / max * 100))}%"></i><b>${nfmt(v)}</b></div>`).join('')}</div>` : `<p class="muted small">${esc(empty || 'No data yet.')}</p>`;
}
const gaugeHTML = (name, g, sub) => `<div class="gauge g-${g.level}" data-level="${g.level}"><div class="row between"><b>${esc(name)}</b><small>${pfmt(g.pct)}</small></div><div class="gbar"><i style="width:${Math.min(100, g.pct)}%"></i></div><small class="muted">${esc(sub || '')}</small></div>`;
async function fsCount(q) {
  const f = Cloud.f;
  try { if (f.getCountFromServer) return (await f.getCountFromServer(q)).data().count; return (await f.getDocs(q)).size; } catch (e) { return null; }
}
/* One cached read of what the three tabs share (approvals, heartbeat docs, recent errors, bot heartbeat). */
let adminCache = null;
async function adminData(force) {
  if (adminCache && !force && Date.now() - adminCache.now < 60000) return adminCache;
  await Cloud.init(); const f = Cloud.f, db = Cloud.db, now = Date.now();
  const [ap, us, er, bot] = await Promise.all([
    f.getDocs(f.collection(db, 'approvals')),
    f.getDocs(f.collection(db, 'usage')),
    f.getDocs(f.query(f.collection(db, 'errors'), f.orderBy('createdAt', 'desc'), f.limit(300))).catch(() => ({ docs: [] })),
    f.getDoc(f.doc(db, 'system', 'bot')).catch(() => null)]);
  const row = d => Object.assign({ id: d.id }, d.data());
  adminCache = { now, today: usageDay(now), approvals: ap.docs.map(row), usage: us.docs.map(row).filter(x => typeof x.day === 'string'), errors: er.docs.map(row), bot: bot && bot.exists() ? bot.data() : null };
  return adminCache;
}
/* Sections that need the per-user usage counts show this line until that update ships (no misleading zeros). */
const NEEDS_USAGE = 'Needs the usage counts update (coming after Sriram\'s review)';
const needsHTML = () => `<p class="muted small needs-usage">${esc(NEEDS_USAGE)}</p>`;
function adminMetrics(d, extra) {
  const hasU = d.usage.length > 0, act7 = activeSince(d.usage, d.today, 7), act = activeCounts(d.usage, d.today);
  const errs7 = d.errors.filter(e => d.now - admMs(e.createdAt || e.at) <= 7 * 864e5);
  /* Daily reads/writes: active users today from usage counts; without them, every approved account counts as active (upper estimate). */
  const approvedN = d.approvals.filter(x => x.status === 'approved').length, opsUsers = hasU ? act.today : approvedN;
  const ops = Object.assign(dailyOps(opsUsers), { users: opsUsers, basis: hasU ? 'active today' : 'estimate from approved users' });
  const m = { now: d.now, hasU, act, act7, errs7, crashFree: crashFree(act7.map(x => x.id), errs7.map(e => e.uid)), ver: versionAdoption(act7, typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''),
    syncPct: syncHealth(act7, d.now), bot: d.bot ? { lastRun: admMs(d.bot.lastRun), ok: d.bot.ok } : null,
    gauges: [Object.assign(gauge(ops.reads, FS_FREE.reads), { name: 'Daily reads' }), Object.assign(gauge(ops.writes, FS_FREE.writes), { name: 'Daily writes' })], ops };
  m.latestPct = m.ver.pct;
  Object.assign(m, extra || {});
  m.light = healthLight(m);
  return m;
}
const yrOf = (d, u) => u.yr || (d.approvals.find(a => a.id === u.id) || {}).year || 'unknown';
function adminLoadErr(sel, e) { const el = $(sel); if (el) el.innerHTML = `<p class="err">${esc(e.code || e.message || 'Could not load')}</p>`; }

function vAdminAnalytics() {
  setTitle('Analytics', true);
  main().innerHTML = `${adminChips('analytics')}<p class="small muted">Accounts, sign-ups and batches from Firestore. No names, patient data or notes.</p><div id="aan"><p class="muted small">Loading…</p></div>`;
  Cloud.init().then(async () => {
    const d = await adminData(), m = adminMetrics(d), f = Cloud.f, db = Cloud.db, el = $('#aan'); if (!el) return;
    const st = countBy(d.approvals, x => x.status), weeks = weekBuckets(d.approvals.map(x => admMs(x.requestedAt)).filter(Boolean), d.now, 12).map(w => ({ label: new Date(w.start + 864e5).toISOString().slice(5, 10), n: w.n }));
    const u30 = activeSince(d.usage, d.today, 30), U = m.hasU;
    el.innerHTML = `${lightHTML(m.light, true)}
      <div class="card"><h3>Accounts</h3>${statsHTML([[st.approved || 0, 'approved'], [st.pending || 0, 'pending'], [st.rejected || 0, 'rejected']])}</div>
      <div class="card"><h3>Active users</h3>${U ? statsHTML([[m.act.today, 'today'], [m.act.d7, 'last 7 days'], [m.act.d30, 'last 30 days']]) + `<small class="muted">${nfmt(d.usage.length)} users have ever sent counts.</small>` : needsHTML()}</div>
      <div class="card"><h3>Sign-ups per week</h3>${barsSVG(weeks, 'Sign-ups per week, last 12 weeks')}<small class="muted">Last 12 weeks, by request date.</small></div>
      <div class="card"><h3>By residency year <small class="muted">${U ? 'active 30 days' : 'approved accounts, from sign-up'}</small></h3>${U ? hbarsHTML(countBy(u30, u => yrOf(d, u))) : hbarsHTML(countBy(d.approvals.filter(x => x.status === 'approved'), x => x.year || 'unknown'), 'No approved accounts yet.')}</div>
      <div class="card"><h3>By department</h3>${U ? hbarsHTML(countBy(u30, u => u.dept || 'derma')) : needsHTML()}</div>
      <div class="card"><h3>Platforms</h3>${U ? hbarsHTML(countBy(u30, u => u.plat)) + '<h4>Installed app vs browser</h4>' + hbarsHTML(countBy(u30, u => u.inst ? 'installed' : 'browser')) : needsHTML()}</div>
      <div class="card"><h3>Feature use <small class="muted">screen opens, latest report per user</small></h3>${U ? hbarsHTML(sumMaps(u30.map(u => u.feat)), 'No screen opens reported yet.') : needsHTML()}</div>
      <div class="card"><h3>Batches</h3><div id="abatch"><p class="muted small">Counting…</p></div></div>`;
    const bs = await f.getDocs(f.collection(db, 'batches')), wk = new Date(d.now - 7 * 864e5);
    const rows = await Promise.all(bs.docs.map(async b => ({ name: b.data().name || b.id, members: await fsCount(f.collection(db, 'batches', b.id, 'members')), msgs: await fsCount(f.query(f.collection(db, 'batches', b.id, 'messages'), f.where('at', '>=', wk))) })));
    const be = $('#abatch'); if (be) be.innerHTML = rows.length ? `<table class="atable"><tr><th>Batch</th><th>Members</th><th>Msgs / 7 d</th></tr>${rows.sort((a, b) => (b.members || 0) - (a.members || 0)).map(r => `<tr><td>${esc(r.name)}</td><td>${nfmt(r.members)}</td><td>${nfmt(r.msgs)}</td></tr>`).join('')}</table>` : '<p class="muted small">No batches yet.</p>';
  }).catch(e => adminLoadErr('#aan', e));
}
const STORE_COLLS = ['approvals', 'usage', 'errors', 'posts', 'profiles', 'content', 'digest', 'batches', 'stories', 'study', 'follows', 'reports'];
function vAdminStorage() {
  setTitle('Storage', true);
  main().innerHTML = `${adminChips('storage')}<p class="small muted">Firestore free tier: 1 GiB stored, 50,000 reads and 20,000 writes a day. Sizes and daily use are rough estimates (documented in usage.js).</p><div id="ast"><p class="muted small">Counting…</p></div>`;
  Cloud.init().then(async () => {
    const f = Cloud.f, db = Cloud.db, d = await adminData();
    const counts = {}; await Promise.all(STORE_COLLS.map(async c => { counts[c] = await fsCount(f.collection(db, c)); }));
    const bytes = sizeEstimate(counts), sg = gauge(bytes, FS_FREE.bytes), m = adminMetrics(d), [rg, wg] = m.gauges;
    const act30 = activeSince(d.usage, d.today, 30), drv = act30.filter(u => u.drv), apps = drv.map(u => +u.drv.appMB || 0);
    const full = drv.filter(u => u.drv.totalGB > 0 && u.drv.usedGB / u.drv.totalGB > 0.9), stale = act30.filter(u => u.lastSync != null && d.now - u.lastSync > 7 * 864e5);
    const who = list => list.length ? `<ul class="small">${list.map(u => `<li><code>${esc(u.id.slice(0, 8))}</code> · ${esc(yrOf(d, u))}</li>`).join('')}</ul>` : '<p class="muted small">None.</p>';
    const el = $('#ast'); if (!el) return;
    el.innerHTML = `<div class="card"><h3>Documents per collection</h3><table class="atable"><tr><th>Collection</th><th>Docs</th><th>≈ size</th></tr>${STORE_COLLS.map(c => `<tr><td>${esc(c)}</td><td data-c="${esc(c)}">${nfmt(counts[c])}</td><td>${counts[c] == null ? '—' : (counts[c] * (FS_AVG_BYTES[c] || 1000) / 1048576).toFixed(2) + ' MB'}</td></tr>`).join('')}</table><small class="muted">Top-level collections only; batch chats and DM messages live in sub-collections.</small></div>
      <div class="card"><h3>Free-tier use</h3>${gaugeHTML('Stored data', sg, '≈ ' + (bytes / 1048576).toFixed(1) + ' MB of 1,024 MB')}${gaugeHTML('Daily reads', rg, '≈ ' + nfmt(m.ops.reads) + ' of 50,000 (' + m.ops.users + ' × ' + FS_PER_USER.reads + ', ' + m.ops.basis + ')')}${gaugeHTML('Daily writes', wg, '≈ ' + nfmt(m.ops.writes) + ' of 20,000 (' + m.ops.users + ' × ' + FS_PER_USER.writes + ', ' + m.ops.basis + ')')}</div>
      ${!m.hasU ? `<div class="card"><h3>Google Drive backups <small class="muted">users' own Drives</small></h3>${needsHTML()}</div><div class="card"><h3>On-device storage</h3>${needsHTML()}</div>` : `<div class="card"><h3>Google Drive backups <small class="muted">users' own Drives</small></h3>${statsHTML([[drv.length, 'users reporting'], [apps.length ? (apps.reduce((a, b) => a + b, 0) / 1024).toFixed(2) + ' GB' : '—', 'total backups'], [apps.length ? (apps.reduce((a, b) => a + b, 0) / apps.length).toFixed(1) + ' MB' : '—', 'average backup']])}
        <h4>Drive over 90% full (${full.length})</h4>${who(full)}<h4>Not synced for 7+ days (${stale.length})</h4>${who(stale)}</div>
      <div class="card"><h3>On-device storage</h3>${statsHTML([[act30.length ? (act30.reduce((a, u) => a + (+u.lsMB || 0), 0) / act30.length).toFixed(1) + ' MB' : '—', 'average per user'], [act30.length ? Math.max(...act30.map(u => +u.lsMB || 0)).toFixed(1) + ' MB' : '—', 'largest'], [act30.length, 'users (30 d)']])}</div>`}`;
  }).catch(e => adminLoadErr('#ast', e));
}
const GH_RUNS = 'https://api.github.com/repos/osmosis0415-a11y/pg-derma-companion/actions/runs?per_page=5';
function vAdminHealth() {
  setTitle('App health', true);
  main().innerHTML = `${adminChips('health')}<div id="ahl"><p class="muted small">Loading…</p></div>`;
  Cloud.init().then(async () => {
    const d = await adminData(), m = adminMetrics(d), el = $('#ahl'); if (!el) return;
    const e24 = d.errors.filter(e => d.now - admMs(e.createdAt || e.at) <= 864e5);
    const byMsg = Object.entries(countBy(m.errs7, e => String(e.msg || '').slice(0, 120))).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const b = m.bot, bAge = b && b.lastRun ? d.now - b.lastRun : null, bBad = !b || !b.lastRun || b.ok === false || bAge > BOT_STALE_MS;
    const paint = () => { const h = $('#hlight'); if (h) h.outerHTML = lightHTML(m.light); };
    el.innerHTML = `${lightHTML(m.light)}
      <div class="card"><h3>Errors</h3>${statsHTML([[e24.length, 'last 24 h'], [m.errs7.length, 'last 7 days']].concat(m.hasU ? [[pfmt(m.crashFree), 'crash-free users (7 d)']] : []))}${m.hasU ? '' : '<h4>Crash-free users</h4>' + needsHTML()}
        <h4>Top messages (7 d)</h4>${byMsg.length ? `<table class="atable">${byMsg.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}</table>` : '<p class="muted small">No errors in the last 7 days.</p>'}
        <h4>By version (7 d)</h4>${hbarsHTML(countBy(m.errs7, e => e.version || '?'), 'No errors.')}<a class="link small" href="#/admin?t=errors">All error reports ›</a></div>
      <div class="card"><h3>Versions and sync</h3>${m.hasU ? `${statsHTML([[pfmt(m.latestPct), 'active users on latest'], [m.act.d7, 'active (7 d)'], [pfmt(m.syncPct), 'synced in 24 h']])}<small class="muted">Latest: <code>${esc(m.ver.latest || '?')}</code>. Sync health counts active users who use Drive sync.</small>${hbarsHTML(countBy(m.act7, u => u.v))}` : needsHTML()}</div>
      <div class="card"><h3>Approval bot</h3><p class="small" id="botst" data-bad="${bBad ? 1 : 0}">${bBad ? '🔴' : '🟢'} ${b && b.lastRun ? 'Last run ' + esc(admAgo(b.lastRun)) + (b.ok === false ? ' · reported an error' : '') : 'never'}</p><small class="muted">Written by tools/admin-bot.gs every minute (system/bot). Red when older than 10 minutes.</small></div>
      <div class="card"><h3>GitHub Actions</h3><div id="ghruns"><p class="muted small">Checking…</p></div></div>`;
    try {
      const r = await fetch(GH_RUNS, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!r.ok) throw new Error('GitHub ' + r.status);
      const runs = ((await r.json()).workflow_runs || []).slice(0, 5), g = $('#ghruns'); if (!g) return;
      const res = x => x.status !== 'completed' ? '🟡 ' + x.status : x.conclusion === 'success' ? '🟢 success' : x.conclusion === 'failure' ? '🔴 failure' : '⚪ ' + (x.conclusion || '');
      const dep = runs.find(x => /deploy|pages/i.test(x.name || '')), pr = runs.find(x => x.event === 'pull_request');
      g.innerHTML = `<p class="small">Last deploy: <b>${dep ? esc(res(dep)) + ' · ' + esc(admAgo(dep.created_at)) : '—'}</b><br>Last PR check: <b>${pr ? esc(res(pr)) + ' · ' + esc(admAgo(pr.created_at)) : '—'}</b></p>
        <table class="atable">${runs.map(x => `<tr><td>${esc(x.name || '')}<br><small class="muted">${esc(x.head_branch || '')} · ${esc(x.event || '')}</small></td><td>${esc(res(x))}<br><small class="muted">${esc(admAgo(x.created_at))}</small></td></tr>`).join('')}</table>`;
      if (runs[0] && runs[0].status === 'completed') { m.ci = runs[0].conclusion === 'failure' ? 'failure' : 'ok'; m.light = healthLight(m); paint(); }
    } catch (e) { const g = $('#ghruns'); if (g) g.innerHTML = `<p class="muted small">Could not reach GitHub (${esc(e.message || 'offline')}).</p>`; }
  }).catch(e => adminLoadErr('#ahl', e));
}
