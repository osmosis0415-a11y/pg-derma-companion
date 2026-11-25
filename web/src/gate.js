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
    await IDB.del('meta', 'gate'); await Drive.forget().catch(() => {}); location.reload();
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
const ADMIN_TABS = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['design', 'Designs'], ['batches', 'Batches'], ['content', 'Content'], ['reports', 'Reports'], ['errors', 'Errors']];
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

/* ---------- Admin → Designs: pick, preview on this phone, deploy to everyone, roll back ---------- */
let designDraft = null;
const designSummary = c => `${DESIGN_NAMES.home[c.home]} home · ${DESIGN_NAMES.layout[c.layout]} · ${DESIGN_NAMES.deck[c.deck]}`;
const designLive = () => ({ home: AppCfg.live.home, deck: AppCfg.live.deck, layout: AppCfg.layout });
const sameDesign = (a, b) => a.home === b.home && a.deck === b.deck && a.layout === b.layout;
function vAdminDesign() {
  setTitle('Deploy designs', true);
  if (!amAdmin()) { main().innerHTML = empty('Admins only'); return; }
  const live = designLive(), pv = AppCfg.preview();
  if (!designDraft) designDraft = pv ? Object.assign({}, live, pv.design, { layout: pv.layout || live.layout }) : Object.assign({}, live);
  const d = designDraft, same = sameDesign(d, live);
  const opt = (k, v, label, sub, sw) => `<button class="dopt${d[k] === v ? ' on' : ''}" data-act="designpick" data-k="${k}" data-v="${v}" role="radio" aria-checked="${d[k] === v}"><span class="dsw ${sw}" aria-hidden="true"></span><span class="dtx"><b>${esc(label)}</b><small>${esc(sub)}</small></span><span class="drad" aria-hidden="true"></span></button>`;
  const ts = x => (x && x.seconds ? x.seconds * 1000 : typeof x === 'number' ? x : 0);
  main().innerHTML = `<div class="chips">${ADMIN_TABS.map(([k, l]) => `<a class="chip${k === 'design' ? ' on' : ''}" href="#/admin?t=${k}">${l}</a>`).join('')}</div>
  <section class="card dlive"><small>Live for everyone</small><b>${esc(designSummary(live))}</b>${pv ? `<p class="small">You are previewing a different design on this phone only. <button class="btn xs ghost" data-act="designunpreview">Stop preview</button></p>` : ''}</section>
  <section class="card"><h3>1 · Home screen</h3><div class="dopts" role="radiogroup" aria-label="Home screen">
    ${opt('home', 'classic', 'Classic', 'Teal hero with your Today list', 'sw-classic')}
    ${opt('home', 'bento', 'Bento', 'Light bento grid: case carousel, goal, streak, quiz', 'sw-bento')}
    ${opt('home', 'glass', 'Bento Glass', 'Same grid on dark frosted glass', 'sw-glass')}</div></section>
  <section class="card"><h3>2 · Community feed</h3><div class="dopts" role="radiogroup" aria-label="Community feed">
    ${opt('layout', 'twitter', 'X-style timeline', 'Dark-friendly 3-column timeline, round avatars', 'sw-x')}
    ${opt('layout', 'insta', 'Instagram feed', 'Big image cards with stories', 'sw-insta')}</div></section>
  <section class="card"><h3>3 · Study feed</h3><div class="dopts" role="radiogroup" aria-label="Study feed">
    ${opt('deck', 'classic', 'Classic swipe feed', 'Colour-coded full-screen cards', 'sw-feed')}
    ${opt('deck', 'micro', 'Micro-learning deck', 'Obsidian cards, topic pill, indigo + emerald, thumb rail', 'sw-micro')}</div></section>
  <div class="dbtns"><button class="btn ghost" data-act="designpreview">${ic('user')} Preview on this phone</button>
    <button class="btn" data-act="designdeploy"${same ? ' disabled' : ''}>Deploy to everyone</button></div>
  <p class="small muted center">${same ? 'This is what is live now. Change something to deploy.' : 'Everyone gets it the next time the app opens online. You can roll back below.'}</p>
  <section class="card"><h3>Deploy history</h3>${AppCfg.history.length ? AppCfg.history.slice(0, 6).map((h, i) => { const c = Object.assign({}, DESIGN_DEFAULT, { layout: 'twitter' }, h); const isLive = sameDesign(c, live);
    return `<div class="li"><div><b>${esc(designSummary(c))}</b><small>${ts(h.at) ? fmt(new Date(ts(h.at)).toISOString()) : ''}${h.by ? ' · ' + esc(h.by) : ''}</small></div>${isLive ? '<span class="tag">Live</span>' : `<button class="btn xs ghost danger" data-act="designrollback" data-i="${i}">Roll back</button>`}</div>`; }).join('') : '<p class="muted small">No deploys yet.</p>'}</section>`;
  Cloud.init().then(() => AppCfg.load()).then(() => { if (ROUTE.path === 'admin' && ROUTE.q.t === 'design' && !$('.dopt:focus')) { const h = JSON.stringify(AppCfg.history); if (h !== vAdminDesign._h) { vAdminDesign._h = h; vAdminDesign(); } } }).catch(() => {});
}
ACT.designpick = el => { designDraft = Object.assign({}, designDraft || designLive(), { [el.dataset.k]: el.dataset.v }); vAdminDesign(); };
ACT.designpreview = () => {
  const d = designDraft || designLive();
  localStorage.setItem('pgd_design_preview', JSON.stringify({ design: AppCfg.clean(d), layout: d.layout }));
  AppCfg.apply(); toast('Previewing on this phone only'); go(d.layout !== AppCfg.layout && d.home === AppCfg.live.home && d.deck === AppCfg.live.deck ? '#/community' : d.deck !== AppCfg.live.deck && d.home === AppCfg.live.home ? '#/feed' : '#/home');
};
ACT.designunpreview = () => { localStorage.removeItem('pgd_design_preview'); designDraft = null; AppCfg.apply(); toast('Preview off — you see what everyone sees'); vAdminDesign(); };
async function designWrite(c, msg) {
  const f = Cloud.f, entry = { home: c.home, deck: c.deck, layout: c.layout, at: Date.now(), by: (Cloud.user && Cloud.user.email) || '' };
  const hist = [entry].concat(AppCfg.history || []).slice(0, 10);
  await f.setDoc(f.doc(Cloud.db, 'config', 'app'), { layout: c.layout, design: AppCfg.clean(c), designHistory: hist, updatedAt: f.serverTimestamp() }, { merge: true });
  AppCfg.layout = c.layout; AppCfg.live = AppCfg.clean(c); AppCfg.history = hist;
  localStorage.setItem('pgd_layout', c.layout); localStorage.setItem('pgd_design', JSON.stringify(AppCfg.live)); localStorage.removeItem('pgd_design_preview');
  designDraft = null; AppCfg.apply(); toast(msg); vAdminDesign();
}
ACT.designdeploy = async () => {
  const d = designDraft || designLive(); if (sameDesign(d, designLive())) return;
  if (!(await uiConfirm(`Deploy to everyone? ${designSummary(d)}. Approved users get it the next time the app opens online.`, { ok: 'Deploy' }))) return;
  try { await Cloud.init(); await designWrite(d, 'Deployed to everyone'); } catch (e) { toast('Could not deploy: ' + (e.code || e.message)); }
};
ACT.designrollback = async el => {
  const h = AppCfg.history[+el.dataset.i]; if (!h) return; const c = Object.assign({}, DESIGN_DEFAULT, { layout: 'twitter' }, h);
  if (!(await uiConfirm(`Roll back everyone to: ${designSummary(c)}?`, { ok: 'Roll back' }))) return;
  try { await Cloud.init(); await designWrite(c, 'Rolled back'); } catch (e) { toast('Could not roll back: ' + (e.code || e.message)); }
};
