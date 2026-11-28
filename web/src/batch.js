/* ===== Batch hub (Firebase) =====
   Shares ONLY: batch calendar events, member display names/years, and anonymous procedure COUNTS.
   No patient, photo, thesis or visit data is ever sent. Core app stays fully offline. */
const FB_VER = '10.12.2';
const EVENT_TYPES = ['Seminar', 'Journal club', 'Case presentation', 'Clinical meet', 'Posting', 'Duty', 'Exam / assessment', 'Workshop / CME', 'Other'];
const Cloud = {
  ready: null, auth: null, db: null, f: {}, user: null, unsubs: [], lastUid: undefined, gen: 0,
  cfg() { return (D && D.settings.fbConfig) || window.FIREBASE_CONFIG || null; },
  init() {
    if (this.ready) return this.ready;
    const cfg = this.cfg(); if (!cfg) return Promise.reject(new Error('nocfg'));
    this.ready = (async () => {
      const base = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';
      const [A, Au, F] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
      this.f = Object.assign({}, Au, F);
      const app = A.initializeApp(cfg);
      this.auth = Au.getAuth(app); this.db = F.getFirestore(app);
      try { await Au.getRedirectResult(this.auth); } catch (e) { if (e.code) toast(authMsg(e)); }
      await new Promise(res => { const u = Au.onAuthStateChanged(this.auth, us => { this.user = us; this.lastUid = us?.uid || null; u(); res(); }); });
      Au.onAuthStateChanged(this.auth, us => { this.user = us; const id = us?.uid || null; if (id !== this.lastUid) { this.lastUid = id; if (ROUTE.path === 'batch') render(); } });
    })();
    this.ready.catch(() => { this.ready = null; });
    return this.ready;
  },
  stop() { this.gen++; this.unsubs.forEach(u => { try { u(); } catch (e) {} }); this.unsubs = []; }
};
const authMsg = e => ({ 'auth/invalid-credential': 'Wrong email or password', 'auth/wrong-password': 'Wrong email or password', 'auth/user-not-found': 'No account with this email', 'auth/email-already-in-use': 'Account exists — sign in instead', 'auth/weak-password': 'Password must be at least 6 characters', 'auth/invalid-email': 'Invalid email address', 'auth/network-request-failed': 'No internet connection', 'auth/popup-closed-by-user': 'Sign-in cancelled', 'auth/unauthorized-domain': 'This site is not authorised in Firebase → Authentication → Settings → Authorised domains', 'auth/too-many-requests': 'Too many attempts — try again later', 'auth/requires-recent-login': 'For security, sign in again and then retry', 'auth/missing-password': 'Enter your password' }[e.code] || e.message || 'Something went wrong');
const B = () => D.batch || null;
/* Email/password accounts must verify their address before using sync or the batch hub (also enforced in firestore.rules). */
const needsVerify = () => { const u = Cloud.user; return !!(u && !u.emailVerified && (u.providerData || []).some(p => p.providerId === 'password')); };
async function sendVerify() { try { await Cloud.f.sendEmailVerification(Cloud.user); toast('Verification link sent to ' + Cloud.user.email + ' — check inbox and spam', 4500); } catch (e) { toast(authMsg(e), 3500); } }
async function checkVerified() {
  try { await Cloud.user.reload(); Cloud.user = Cloud.auth.currentUser; if (Cloud.user.emailVerified) { await Cloud.user.getIdToken(true); toast('Email verified ✓'); return true; } toast('Not verified yet — open the link in the email first', 3500); } catch (e) { toast(authMsg(e)); }
  return false;
}
function verifyHTML() {
  return `<div class="card"><h3>📧 Verify your email</h3><p class="small">We sent a link to <b>${esc(Cloud.user.email)}</b>. Open it (check spam too), then tap “I've verified”.</p>
  <div class="btnrow"><button class="btn sm" data-act="vcheck">I've verified</button><button class="btn sm ghost" data-act="vresend">Resend link</button><button class="btn sm ghost" data-act="acctsignout">Use another account</button></div></div>`;
}
ACT.vresend = () => sendVerify();
ACT.vcheck = async () => { if (await checkVerified()) render(); };
const randCode = () => { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(8)); return 'DVL-' + [...r].map(x => a[x % a.length]).join('').replace(/(.{4})/, '$1-'); };
const myCounts = () => { const c = {}; for (const l of D.logbook) { const k = l.proc; c[k] = c[k] || {}; const y = c[k][l.year] = c[k][l.year] || { P: 0, A: 0, O: 0 }; y[l.role[0]]++; } return c; };

/* ---------- View ---------- */
async function vBatch() {
  setTitle('Batch hub', false);
  if (ROUTE.q.join) D.settings.pendingJoin = ROUTE.q.join.toUpperCase();
  if (!Cloud.cfg()) { main().innerHTML = batchSetupHTML(); return; }
  if (!navigator.onLine && !B()) { main().innerHTML = empty('You are offline', 'Connect to the internet to sign in or join your batch.'); return; }
  if (!navigator.onLine && B()) { main().innerHTML = `<p class="warn">Offline — showing the last synced calendar.</p>` + batchTabsHTML(); paintBatch(); return; }
  main().innerHTML = `<div class="empty"><div>Connecting…</div></div>`;
  try { await Cloud.init(); } catch (e) { main().innerHTML = e.message === 'nocfg' ? batchSetupHTML() : `<p class="warn">Could not load Firebase: ${esc(e.message)}</p>` + (B() ? batchTabsHTML() : ''); if (B()) paintBatch(); return; }
  if (ROUTE.path !== 'batch') return;
  if (!Cloud.user) { main().innerHTML = signInHTML(); return; }
  if (needsVerify()) { main().innerHTML = verifyHTML(); return; }
  if (!B()) { main().innerHTML = joinHTML(); return; }
  main().innerHTML = batchTabsHTML();
  paintBatch(); subscribeBatch();
  if (B().shareStats) publishStats().catch(() => {});
}
function batchSetupHTML() {
  return `<div class="card"><h3>Batch hub isn't set up yet</h3><p class="small">The batch calendar and logbook comparison use a free Firebase project. Whoever sets it up (usually one person per batch) pastes the web config below once; after that, put it in the repo so everyone gets it automatically.</p>
  <ol class="small"><li>console.firebase.google.com → Add project</li><li>Build → Authentication → Sign-in method: enable <b>Email/Password</b> and <b>Google</b></li><li>Authentication → Settings → Authorised domains: add <b>${esc(location.hostname)}</b></li><li>Build → Firestore Database → Create (production mode, region asia-south1), then paste the rules from <code>firestore.rules</code> in the repo</li><li>Project settings → Your apps → Web (&lt;/&gt;) → copy the <code>firebaseConfig</code> object</li></ol>
  <div class="form"><label>firebaseConfig (JSON or the JS object)<textarea id="fbcfg" rows="6" placeholder='{ "apiKey": "…", "authDomain": "…", "projectId": "…", "appId": "…" }'></textarea></label><button class="btn" data-act="fbcfgsave">Save config</button></div></div>`;
}
ACT.fbcfgsave = () => {
  let t = val('fbcfg').replace(/^[^{]*/, '').replace(/[^}]*$/, '');
  let cfg = null; try { cfg = JSON.parse(t); } catch (e) { try { cfg = JSON.parse(t.replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":').replace(/'/g, '"').replace(/,\s*}/g, '}')); } catch (e2) {} }
  if (!cfg || !cfg.apiKey || !cfg.projectId) return toast('Could not read the config — paste the whole firebaseConfig object');
  D.settings.fbConfig = cfg; Store.save(); Cloud.ready = null; toast('Firebase config saved'); render();
};
function signInHTML() {
  return `<div class="card"><h3>Sign in to your batch hub</h3><p class="small muted">Only your name, residency year, batch events and (if you opt in) anonymous procedure counts are stored online. Patient data never leaves this phone unencrypted.</p>
  <button class="btn gbtn" data-act="gsign2" style="width:100%"><span class="g">G</span> Continue with Google</button></div>`;
}
ACT.gsign2 = async () => { try { await googleSignIn(); render(); } catch (e) { toast(authMsg(e)); } };
ACT.gsign = ACT.gsign2;
ACT.esignin = async () => { try { await Cloud.f.signInWithEmailAndPassword(Cloud.auth, val('b_email'), $('#b_pw').value); Cloud.user = Cloud.auth.currentUser; render(); } catch (e) { toast(authMsg(e)); } };
ACT.esignup = async () => { try { await Cloud.f.createUserWithEmailAndPassword(Cloud.auth, val('b_email'), $('#b_pw').value); Cloud.user = Cloud.auth.currentUser; await sendVerify(); render(); } catch (e) { toast(authMsg(e)); } };
ACT.ereset = async () => { if (!val('b_email')) return toast('Enter your email first'); try { await Cloud.f.sendPasswordResetEmail(Cloud.auth, val('b_email')); toast('Reset link sent to your email'); } catch (e) { toast(authMsg(e)); } };
function joinHTML() {
  const nm = D.settings.name || Cloud.user.displayName || '';
  return `<div class="card form"><h3>Join your batch</h3><p class="small muted">Signed in as ${esc(Cloud.user.email || '')} · <a class="link" data-act="bsignout" href="#">Sign out</a></p>
  <label>Your display name<input id="b_name" value="${esc(nm)}" placeholder="Dr. …"></label><label>Residency year${chips('b_year', ['JR1', 'JR2', 'JR3', 'Faculty'], residencyYear(today()))}</label>
  <label>Batch code<input id="b_code" value="${esc(D.settings.pendingJoin || '')}" placeholder="DVL-XXXX-XXXX" autocapitalize="characters"></label>
  <button class="btn" data-act="bjoin" style="width:100%">Join batch</button></div>
  <div class="card form"><h3>…or create a new batch</h3><label>Batch / department name<input id="b_bname" placeholder="e.g. DVL PGs 2026 – XYZ Medical College"></label><button class="btn ghost" data-act="bcreate" style="width:100%">Create & get invite code</button></div>`;
}
const memberDoc = () => ({ name: val('b_name') || D.settings.name || Cloud.user.displayName || 'Resident', year: getChips('b_year') || residencyYear(today()), joinedAt: Cloud.f.serverTimestamp() });
ACT.bcreate = async () => {
  const name = val('b_bname'); if (!name) return toast('Enter a batch name'); if (!val('b_name')) return toast('Enter your display name');
  const f = Cloud.f, id = randCode(), uid = Cloud.user.uid;
  try {
    await f.setDoc(f.doc(Cloud.db, 'batches', id), { name, createdBy: uid, admins: [uid], createdAt: f.serverTimestamp() });
    await f.setDoc(f.doc(Cloud.db, 'batches', id, 'members', uid), memberDoc());
    D.batch = { id, name, events: [], members: [], stats: [], shareStats: false, admin: true }; Store.save(); toast('Batch created'); render(); Calls.start();
  } catch (e) { toast('Could not create batch: ' + (e.code || e.message)); }
};
ACT.bjoin = async () => {
  const id = val('b_code').toUpperCase().replace(/\s/g, ''); if (!/^DVL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id)) return toast('Batch code looks like DVL-XXXX-XXXX'); if (!val('b_name')) return toast('Enter your display name');
  const f = Cloud.f;
  try {
    const s = await f.getDoc(f.doc(Cloud.db, 'batches', id)); if (!s.exists()) return toast('No batch with that code');
    await f.setDoc(f.doc(Cloud.db, 'batches', id, 'members', Cloud.user.uid), memberDoc());
    D.batch = { id, name: s.data().name, events: [], members: [], stats: [], shareStats: false, admin: (s.data().admins || []).includes(Cloud.user.uid) };
    delete D.settings.pendingJoin; Store.save(); toast('Joined ' + s.data().name); render(); Calls.start();
  } catch (e) { toast('Could not join: ' + (e.code || e.message)); }
};
ACT.bsignout = async () => { Usage.clearLocal(); Cloud.stop(); Sync.stop(); await Cloud.f.signOut(Cloud.auth); render(); };

function batchTabsHTML() {
  Chat.sync();
  const t = ROUTE.q.t || 'cal';
  return `<div class="row between"><div><b>${esc(B().name)}</b><div class="small muted">Code ${esc(B().id)}</div></div><button class="btn sm ghost" data-act="binvite">Invite</button></div>
  <div class="chips">${[['chat', 'Chat' + chatUnreadBadge()], ['cal', 'Calendar'], ['log', 'Logbook comparison'], ['mem', 'Members']].map(([k, l]) => `<a class="chip${k === t ? ' on' : ''}" href="#/batch?t=${k}">${l}</a>`).join('')}</div><div id="bpane"></div>`;
}
function paintBatch() {
  const el = $('#bpane'); if (!el || !B()) return;
  const t = ROUTE.q.t || 'cal';
  if (t === 'chat') return paintChat(el);
  if (t === 'cal') {
    const up = (B().events || []).filter(e => e.date >= today()).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const past = (B().events || []).filter(e => e.date < today()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
    const row = e => `<div class="li"><div><b>${esc(e.title)}</b> <span class="tag">${esc(e.type)}</span><small>${fmt(e.date)}${e.time ? ' · ' + esc(e.time) : ''}${e.venue ? ' · ' + esc(e.venue) : ''}${e.presenter ? ' · ' + esc(e.presenter) : ''}</small>${e.notes ? `<small>${esc(e.notes)}</small>` : ''}</div>${e.createdBy === Cloud.user?.uid || bAdmin() ? `<button class="icon" data-act="bevdel" data-id="${esc(e.id)}" aria-label="Delete">✕</button>` : ''}</div>`;
    el.innerHTML = `<div class="btnrow"><button class="btn sm" data-act="bevadd">＋ Add event</button><button class="btn sm ghost" data-act="bevics">📅 Add all to my calendar</button><button class="btn sm ghost" data-act="bevwa">Share week on WhatsApp</button></div>
    <div class="card">${up.map(row).join('') || '<p class="muted">No upcoming events. Add the seminar / journal-club schedule so everyone sees it.</p>'}</div>
    ${past.length ? `<details><summary class="small muted">Past events</summary><div class="card">${past.map(row).join('')}</div></details>` : ''}`;
  }
  if (t === 'log') {
    const yr = ROUTE.q.y || 'All', roleSel = ROUTE.q.r || 'P';
    const pick = (counts, proc) => { const c = counts?.[proc] || {}; const ys = yr === 'All' ? Object.keys(c) : [yr]; return ys.reduce((s, y) => s + (c[y] ? (roleSel === 'PA' ? c[y].P + c[y].A : c[y][roleSel] || 0) : 0), 0); };
    const others = (B().stats || []).filter(s => s.id !== Cloud.user?.uid), mine = myCounts();
    const all = [...others.map(s => s.counts), ...(B().shareStats ? [mine] : [])];
    const procs = [...new Set([...PROCEDURES.map(p => p[0]), ...all.flatMap(c => Object.keys(c || {})), ...Object.keys(mine)])];
    const rows = procs.map(p => { const v = all.map(c => pick(c, p)).sort((a, b) => a - b); const n = v.length; const avg = n ? v.reduce((a, b) => a + b, 0) / n : 0; const med = n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : 0; return { p, me: pick(mine, p), avg, med, max: n ? v[n - 1] : 0, n }; }).filter(r => r.me || r.max);
    el.innerHTML = `<div class="card"><label class="row"><input type="checkbox" data-act="bshare" ${B().shareStats ? 'checked' : ''}> <span><b>Share my anonymous counts</b><br><small class="muted">Only procedure names and numbers — no name, no patients, no dates.</small></span></label></div>
    ${chips('bly', ['All', 'JR1', 'JR2', 'JR3'], yr)}${chips('blr', [['P', 'Performed'], ['PA', 'Performed + Assisted'], ['A', 'Assisted'], ['O', 'Observed']], roleSel)}
    <p class="small muted">${all.length} resident(s) sharing${B().shareStats ? ' (including you)' : ''}. Bars: <b style="color:var(--acc)">you</b> vs batch average (line).</p>
    <div class="card">${all.length < 2 ? '<p class="muted small">Comparison appears once at least 2 residents share their counts.</p>' : ''}${rows.map(r => { const sc = Math.max(r.max, r.me, 1); return `<div class="cmprow"><div class="row between"><span>${esc(r.p)}</span><small>you <b>${r.me}</b> · avg ${r1(r.avg)} · median ${r1(r.med)} · top ${r.max}</small></div><div class="bar rel"><i style="width:${r.me / sc * 100}%"></i><em style="left:${r.avg / sc * 100}%"></em></div></div>`; }).join('') || '<p class="muted small">No procedures logged yet.</p>'}</div>
    <button class="btn sm ghost" data-act="bpub">↻ Update my counts now</button>`;
    $('[data-group="bly"]').addEventListener('click', () => setTimeout(() => go('#/batch?t=log&y=' + getChips('bly') + '&r=' + roleSel)));
    $('[data-group="blr"]').addEventListener('click', () => setTimeout(() => go('#/batch?t=log&y=' + yr + '&r=' + getChips('blr'))));
  }
  if (t === 'mem') {
    const gOn = (B().members || []).filter(m => m.id !== Cloud.user?.uid && Calls.canCall(m.id) && Calls.isOnline(m.id)).length;
    el.innerHTML = `${Calls.allowed ? `<div class="card gcard"><div><b>Group call</b><small class="muted">Up to 4 people · discuss cases, revise together · ${gOn} online</small></div><button class="btn sm" data-act="gcall" ${gOn ? '' : 'disabled'}>${ic('users')} Start</button></div>` : ''}<div class="card">${(B().members || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(m => { const me = m.id === Cloud.user?.uid, on = me || Calls.isOnline(m.id);
      return `<div class="li"><div class="row" style="gap:10px"><span class="pres${on ? ' on' : ''}" title="${on ? 'Online' : 'Offline'}"></span><div><b>${esc(m.name)}</b>${me ? ' <span class="tag">You</span>' : ''}<small>${esc(m.year || '')}${!me ? (on ? ' · online' : ' · offline') : ''}</small></div></div>
      <div class="row" style="gap:2px">${!me && Calls.canCall(m.id) ? `<button class="icon callbtn" data-act="bcall" data-id="${esc(m.id)}" data-n="${esc(m.name)}" data-v="0" aria-label="Voice call ${esc(m.name)}" ${on ? '' : 'disabled'}>${ic('phone')}</button><button class="icon callbtn" data-act="bcall" data-id="${esc(m.id)}" data-n="${esc(m.name)}" data-v="1" aria-label="Video call ${esc(m.name)}" ${on ? '' : 'disabled'}>${ic('video')}</button>` : ''}${bAdmin() && !me ? `<button class="icon" data-act="bkick" data-id="${esc(m.id)}" aria-label="Remove">✕</button>` : ''}</div></div>`; }).join('') || '<p class="muted">Loading…</p>'}</div>
    ${Calls.allowed ? '' : '<p class="small muted">Voice/video calls are switched on by the admin. Ask the admin if you need calling.</p>'}<div class="btnrow"><button class="btn sm ghost" data-act="bleave">Leave batch</button><button class="btn sm ghost" data-act="bsignout">Sign out</button></div>
    ${bAdmin() ? `<div class="card"><h3>Admin</h3><p class="small muted">${B().admin ? 'You created this batch.' : 'You are the app admin.'} These actions affect everyone.</p><div class="btnrow"><button class="btn sm ghost danger" data-act="bclearchat">Clear chat</button><button class="btn sm danger" data-act="bdelete">Delete batch</button></div></div>` : ''}`;
  }
}
/* ---------- Cheap hub sync (issue #16 part 5) ----------
   The hub used to attach full listeners to events (60 days), members, logstats and the last 150 messages on every
   open/tab switch (~240 reads). Now everything is cached in D.batch (inside the PIN-encrypted vault, never plain
   localStorage; 'batch' is LOCAL_ONLY so it is not sent to Drive sync) and each open reads only what changed:
   - messages: render from cache (last MSG_CAP), then listen where at >= newest-cached (>= so equal/truncated
     timestamps are not lost; ids are de-duplicated). Older history: "Load older" = where at < oldest, desc, limit 50.
   - events: render from cache, then listen where createdAt >= newest-cached createdAt (events are add/delete only).
   - members / logstats: live full listener only while their own tab is open; otherwise a one-shot fetch at most daily.
   Deletes: while a listener is open, a cached item inside its range (>= since) that is missing from the server snapshot
   is dropped, so the deleter and anyone with the hub open see deletes at once; the deleter also drops it locally.
   Deletes of OLDER items reach other members on the daily full refresh (events: whole 60-day window; messages: the
   newest MSG_FULL, and if fewer than MSG_FULL exist the whole cache is replaced, which also covers admin "Clear chat").
   Trade-off: up to a day of staleness for other people's deletes of older items, in exchange for ~2 reads per open.
   Cache format is versioned (hc.v); a cache from another version is dropped and rebuilt (old backups stay importable). */
const HUB_V = 1, MSG_CAP = 300, MSG_FULL = 100, MSG_PAGE = 50, HUB_DAY = 864e5;
const hubMs = x => x && x.toMillis ? x.toMillis() : (typeof x === 'number' ? x : null);
const tsVal = ms => (Cloud.f.Timestamp && Cloud.f.Timestamp.fromMillis) ? Cloud.f.Timestamp.fromMillis(ms) : ms; // real SDK needs a Timestamp; the test mocks store numbers
function hubCache() {
  const b = B(); if (!b) return null;
  if (!b.hc || b.hc.v !== HUB_V) b.hc = { v: HUB_V, msgs: [], more: true, full: {} };
  return b.hc;
}
const msgOf = d => { const x = d.data() || {}; return { id: d.id, uid: x.uid, name: x.name, text: String(x.text == null ? '' : x.text), at: hubMs(x.at) ?? Date.now() }; };
const evOf = d => Object.assign({ id: d.id }, d.data(), { createdAt: hubMs(d.data().createdAt) });
const byAt = (a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/* One-shot read: getDocs on the real SDK; first snapshot of a listener where a stand-in has no getDocs. */
function hubOnce(q) {
  const f = Cloud.f; if (f.getDocs) return f.getDocs(q);
  return new Promise((res, rej) => { let done = false, u = null; u = f.onSnapshot(q, s => { if (done) return; done = true; res(s); if (u) u(); }, e => { if (!done) { done = true; rej(e); } }); if (done && u) u(); });
}
const fromCache = s => !!(s && s.metadata && s.metadata.fromCache);
function setMsgs(list) {
  const seen = new Map(); for (const m of list) seen.set(m.id, m);
  Chat.msgs = [...seen.values()].sort(byAt);
  const hc = hubCache(); if (hc) { hc.msgs = Chat.msgs.slice(-MSG_CAP); hc.more = Chat.more || Chat.msgs.length > MSG_CAP; }
}
function chatChanged() {
  Store.save();
  if (ROUTE.path !== 'batch') return;
  if (ROUTE.q.t === 'chat') { paintChatList(); Chat.markRead(); } else { const c = $('#chatbadge'); if (c) c.outerHTML = chatUnreadBadge(); }
}
const evWindow = () => addDays(today(), -60);
function evChanged() { B().events = (B().events || []).filter(e => e.date >= evWindow()); Store.save(); if (ROUTE.path === 'batch' && (ROUTE.q.t || 'cal') === 'cal') paintBatch(); }
function subscribeBatch() {
  Cloud.stop(); const f = Cloud.f, id = B().id, db = Cloud.db, gen = Cloud.gen, hc = hubCache(), now = Date.now(), t = ROUTE.q.t || 'cal';
  const same = () => !!(B() && B().id === id), live = () => Cloud.gen === gen && same(); // same: data still applies; live: this subscription is current
  const err = e => { if (!same()) return; if (e && !e.code) { try { ErrLog.capture('hub', String(e.message || e), e.stack); } catch (x) {} } if (e && e.code === 'permission-denied') { toast('You are no longer a member of this batch'); Calls.stop(); D.batch = null; Store.save(); render(); Calls.start(); } };
  const col = n => f.collection(db, 'batches', id, n);
  Chat.sync(); // paint from cache straight away
  const due = k => !(now - (hc.full[k] || 0) < HUB_DAY);
  const daily = async (k, fn) => { if (!due(k)) return; const prev = hc.full[k]; hc.full[k] = now; try { await fn(); } catch (e) { hc.full[k] = prev; throw e; } };

  // events
  (async () => {
    await daily('ev', async () => {
      const s = await hubOnce(f.query(col('events'), f.where('date', '>=', evWindow()), f.orderBy('date'))); if (!same() || fromCache(s)) return;
      const got = s.docs.map(evOf), top = Math.max(0, ...got.map(e => e.createdAt || 0));
      B().events = got.concat((B().events || []).filter(e => (e.createdAt || 0) > top && !got.some(g => g.id === e.id))); evChanged(); // keep anything a newer listener already added
    });
    if (!live()) return;
    // newest createdAt we hold; with none, start just before the last full fetch (1 h margin for clock skew) so an
    // empty window does not re-read every old event of the batch on each open
    const since = Math.max(0, (hc.full.ev || 0) - 36e5, ...(B().events || []).map(e => e.createdAt || 0));
    Cloud.unsubs.push(f.onSnapshot(f.query(col('events'), f.where('createdAt', '>=', tsVal(since))), s => {
      if (!live()) return;
      const got = s.docs.map(evOf).filter(e => !(typeof e.createdAt === 'number' && e.createdAt < since)), ids = new Set(got.map(e => e.id));
      let list = B().events || [];
      if (!fromCache(s)) list = list.filter(e => !(typeof e.createdAt === 'number' && e.createdAt >= since) || ids.has(e.id));
      const m = new Map(list.map(e => [e.id, e])); got.forEach(e => m.set(e.id, e)); B().events = [...m.values()]; evChanged();
    }, err));
  })().catch(err);

  // members + logstats: live while their tab is open, otherwise at most one fetch a day
  const memOf = d => ({ id: d.id, name: d.data().name, year: d.data().year }), stOf = d => ({ id: d.id, counts: d.data().counts || {} });
  for (const [k, tab, key, map] of [['members', 'mem', 'members', memOf], ['logstats', 'log', 'stats', stOf]]) {
    const apply = s => { if (!same() || fromCache(s)) return; B()[key] = s.docs.map(map); hc.full[k] = Date.now(); Store.save(); if (ROUTE.path === 'batch' && t === tab) paintBatch(); };
    if (t === tab) Cloud.unsubs.push(f.onSnapshot(col(k), apply, err));
    else daily(k, async () => apply(await hubOnce(col(k)))).catch(err);
  }

  // messages
  try {
    (async () => {
      await daily('msg', async () => {
        const s = await hubOnce(f.query(col('messages'), f.orderBy('at', 'desc'), f.limit(MSG_FULL))); if (!same() || fromCache(s)) return;
        const got = s.docs.map(msgOf).sort(byAt), list = Chat.msgs;
        if (!got.length) { Chat.more = false; setMsgs([]); } // empty collection (e.g. admin cleared the chat)
        else {
          const lo = got[0].at, hi = got[got.length - 1].at, whole = got.length < MSG_FULL;
          // older cached messages are kept only if they join up with this page (no gap) and there can be older ones
          const older = !whole && list.some(m => m.at >= lo) ? list.filter(m => m.at < lo) : [];
          Chat.more = !whole; setMsgs(older.concat(got, list.filter(m => m.at > hi)));
        }
        chatChanged();
      });
      if (!live()) return;
      const since = Chat.msgs.length ? Chat.msgs[Chat.msgs.length - 1].at : 0;
      Cloud.unsubs.push(f.onSnapshot(f.query(col('messages'), f.where('at', '>=', tsVal(since)), f.orderBy('at')), s => {
        if (!live()) return;
        const got = s.docs.map(msgOf), ids = new Set(got.map(m => m.id));
        let list = Chat.msgs; if (!fromCache(s)) list = list.filter(m => m.at < since || ids.has(m.id));
        setMsgs(list.concat(got)); chatChanged();
      }, err));
    })().catch(err);
  } catch (e) { ErrLog.capture('chat', String(e && e.message || e), e && e.stack); }
}
/* Older chat history on demand: the 50 messages before the oldest one we hold. */
async function loadOlderChat() {
  const hc = hubCache(); if (!hc || Chat.loading || !Chat.more || !Cloud.f.getDocs) return;
  const f = Cloud.f, oldest = Chat.msgs.length ? Chat.msgs[0].at : Date.now() + 1;
  Chat.loading = true; const box = $('#chatlist'), h0 = box ? box.scrollHeight - box.scrollTop : 0;
  try {
    const s = await f.getDocs(f.query(f.collection(Cloud.db, 'batches', B().id, 'messages'), f.where('at', '<', tsVal(oldest)), f.orderBy('at', 'desc'), f.limit(MSG_PAGE)));
    const got = s.docs.map(msgOf).filter(m => m.at < oldest);
    if (got.length < MSG_PAGE) Chat.more = false;
    setMsgs(got.concat(Chat.msgs)); // the saved cache keeps only the newest MSG_CAP; older pages stay in memory
    Store.save(); paintChatList(false, true);
    const b2 = $('#chatlist'); if (b2) b2.scrollTop = b2.scrollHeight - h0;
  } catch (e) { toast('Could not load older messages'); }
  Chat.loading = false;
}
ACT.chatolder = () => loadOlderChat();
async function publishStats() { const f = Cloud.f; await f.setDoc(f.doc(Cloud.db, 'batches', B().id, 'logstats', Cloud.user.uid), { counts: myCounts(), updatedAt: f.serverTimestamp() }); }
ACT.bpub = () => { if (!B().shareStats) return toast('Turn on sharing first'); publishStats().then(() => toast('Counts updated'), e => toast(e.code || e.message)); };
ACT.bshare = async el => {
  const on = el.checked; B().shareStats = on; Store.save();
  try { if (on) { await publishStats(); toast('Sharing anonymous counts'); } else { await Cloud.f.deleteDoc(Cloud.f.doc(Cloud.db, 'batches', B().id, 'logstats', Cloud.user.uid)); toast('Your counts were removed'); } } catch (e) { toast(e.code || e.message); }
  paintBatch();
};
ACT.binvite = () => { const url = location.origin + location.pathname + '#/batch?join=' + B().id; const msg = `Join our DVL batch hub on PG Derma Companion 🩺\n\n1. Open ${url}\n2. Install it (Add to Home screen) and set your PIN\n3. Sign in → batch code: ${B().id}`; if (navigator.share) navigator.share({ text: msg }).catch(() => {}); else window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank'); };
ACT.bevadd = () => openSheet(`<h3>Add batch event</h3><div class="form"><label>Title<input id="ev_t" maxlength="150" placeholder="e.g. Seminar: Leprosy reactions"></label><label>Type${chips('ev_ty', EVENT_TYPES, 'Seminar')}</label>
  <div class="grid2"><label>Date<input id="ev_d" type="date" value="${today()}"></label><label>Time<input id="ev_tm" type="time"></label></div>
  <div class="grid2"><label>Presenter<input id="ev_p" maxlength="80"></label><label>Venue<input id="ev_v" maxlength="80" placeholder="Seminar hall / OPD"></label></div>
  <label>Notes<input id="ev_n" maxlength="300" placeholder="Topic, moderator, reading list…"></label>
  <label>Repeat weekly for<select id="ev_r">${optList([['1', 'Just once'], ['4', '4 weeks'], ['8', '8 weeks'], ['12', '12 weeks']], '1')}</select></label>
  <p class="small muted">Do not include patient names or identifiers.</p>
  <div class="actions"><button class="btn ghost" data-act="closesheet">Cancel</button><button class="btn" data-act="bevsave">Save</button></div></div>`);
ACT.bevsave = async () => {
  const title = val('ev_t'); if (!title) return toast('Enter a title');
  const f = Cloud.f, reps = +val('ev_r') || 1, base = val('ev_d') || today();
  try {
    const ty = getChips('ev_ty', $('#sheet')), tm = val('ev_tm'), pr = val('ev_p'), ve = val('ev_v'), no = val('ev_n');
    for (let i = 0; i < reps; i++) {
      const ev = { title, type: ty, date: addDays(base, 7 * i), time: tm, presenter: pr, venue: ve, notes: no, createdBy: Cloud.user.uid };
      const r = await f.addDoc(f.collection(Cloud.db, 'batches', B().id, 'events'), Object.assign({}, ev, { createdAt: f.serverTimestamp() }));
      // show it at once; the createdAt listener later replaces it with the server copy (same id)
      const rid = String(r && r.id || '').split('/').pop(); if (rid && B() && !(B().events || []).some(e => e.id === rid)) (B().events = B().events || []).push(Object.assign({ id: rid, createdAt: null }, ev));
    }
    evChanged(); closeSheet(); toast(reps > 1 ? reps + ' events added' : 'Event added');
  } catch (e) { toast('Could not save: ' + (e.code || e.message)); }
};
ACT.bevdel = async el => { const eid = el.dataset.id; if (!(await uiConfirm('Delete this event for everyone?'))) return; try { await Cloud.f.deleteDoc(Cloud.f.doc(Cloud.db, 'batches', B().id, 'events', eid)); if (B()) { B().events = (B().events || []).filter(e => e.id !== eid); evChanged(); } } catch (e) { toast(e.code || e.message); } };
ACT.bevics = () => { const ev = (B().events || []).filter(e => e.date >= today()).map(e => ({ id: 'b' + e.id, date: e.date, time: e.time, title: e.type + ': ' + e.title, desc: [e.presenter, e.venue, e.notes].filter(Boolean).join(' · ') })); if (!ev.length) return toast('No upcoming events'); download(makeICS(ev), 'batch-calendar.ics'); };
ACT.bevwa = () => { const ev = (B().events || []).filter(e => e.date >= today() && e.date <= addDays(today(), 7)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))); if (!ev.length) return toast('Nothing in the next 7 days'); const msg = `📅 ${B().name} — this week\n\n` + ev.map(e => `• ${fmt(e.date)}${e.time ? ' ' + e.time : ''} — ${e.type}: ${e.title}${e.presenter ? ' (' + e.presenter + ')' : ''}${e.venue ? ' @ ' + e.venue : ''}`).join('\n'); window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank'); };
ACT.bleave = async () => { if (!(await uiConfirm('Leave this batch? Your shared counts will be removed.'))) return; Calls.stop(); const f = Cloud.f, id = B().id, uid = Cloud.user.uid; try { await f.deleteDoc(f.doc(Cloud.db, 'batches', id, 'presence', uid)).catch(() => {}); await f.deleteDoc(f.doc(Cloud.db, 'batches', id, 'logstats', uid)).catch(() => {}); await f.deleteDoc(f.doc(Cloud.db, 'batches', id, 'members', uid)); } catch (e) {} Cloud.stop(); D.batch = null; Store.save(); render(); Calls.start(); };
ACT.bkick = async el => { if (!(await uiConfirm('Remove this member?'))) return; const f = Cloud.f; try { await f.deleteDoc(f.doc(Cloud.db, 'batches', B().id, 'logstats', el.dataset.id)).catch(() => {}); await f.deleteDoc(f.doc(Cloud.db, 'batches', B().id, 'members', el.dataset.id)); } catch (e) { toast(e.code || e.message); } };
ACT.fbcfgclear = () => { delete D.settings.fbConfig; Store.save(); Cloud.ready = null; toast('Removed'); render(); };

const bAdmin = () => !!(B() && (B().admin || amAdmin()));
/* Delete a whole batch: every message, event, shared count and member, then the batch itself.
   Members go last because the batch-admin rules check membership. Used by the batch admin and the app admin. */
async function deleteBatchAll(id, onProgress) {
  const f = Cloud.f, db = Cloud.db; let n = 0;
  { // group-call rooms and everything under them
    const rs = await f.getDocs(f.collection(db, 'batches', id, 'rooms'));
    for (const r of rs.docs) {
      const sg = await f.getDocs(f.collection(r.ref, 'sig'));
      for (const s of sg.docs) { const cd = await f.getDocs(f.collection(s.ref, 'cands')); for (let i = 0; i < cd.docs.length; i += 400) { const wb = f.writeBatch(db); cd.docs.slice(i, i + 400).forEach(x => wb.delete(x.ref)); await wb.commit(); } }
      const pe = await f.getDocs(f.collection(r.ref, 'peers'));
      const all = sg.docs.concat(pe.docs);
      for (let i = 0; i < all.length; i += 400) { const wb = f.writeBatch(db); all.slice(i, i + 400).forEach(x => wb.delete(x.ref)); await wb.commit(); }
      await f.deleteDoc(r.ref); n++;
    }
  }
  for (const sub of ['calls', 'presence', 'messages', 'events', 'logstats', 'members']) {
    if (sub === 'calls') { const cs = await f.getDocs(f.collection(db, 'batches', id, 'calls')); for (const d of cs.docs) { const cd = await f.getDocs(f.collection(db, 'batches', id, 'calls', d.id, 'cands')); for (let i = 0; i < cd.docs.length; i += 400) { const wb = f.writeBatch(db); cd.docs.slice(i, i + 400).forEach(x => wb.delete(x.ref)); await wb.commit(); } } }
    const snap = await f.getDocs(f.collection(db, 'batches', id, sub));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const wb = f.writeBatch(db); snap.docs.slice(i, i + 400).forEach(d => wb.delete(d.ref)); await wb.commit();
      n += Math.min(400, snap.docs.length - i); onProgress && onProgress(n);
    }
  }
  await f.deleteDoc(f.doc(db, 'batches', id));
  return n;
}
async function clearBatchChat(id) {
  const f = Cloud.f, db = Cloud.db, snap = await f.getDocs(f.collection(db, 'batches', id, 'messages'));
  for (let i = 0; i < snap.docs.length; i += 400) { const wb = f.writeBatch(db); snap.docs.slice(i, i + 400).forEach(d => wb.delete(d.ref)); await wb.commit(); }
  return snap.docs.length;
}
ACT.bdelete = async () => {
  const b = B(); if (!b || !bAdmin()) return;
  if (!(await uiType(`This permanently deletes "${b.name}" for everyone: chat, calendar, shared counts and members.`, 'DELETE'))) return;
  try { Cloud.stop(); Calls.stop(); toast('Deleting…'); const n = await deleteBatchAll(b.id); D.batch = null; Store.save(); toast(`Batch deleted (${n} items)`); render(); Calls.start(); }
  catch (e) { toast('Could not delete: ' + (e.code || e.message)); subscribeBatch(); }
};
ACT.bclearchat = async () => {
  if (!bAdmin() || !(await uiConfirm('Delete ALL chat messages in this batch for everyone?'))) return;
  try { const n = await clearBatchChat(B().id); Chat.more = false; setMsgs([]); Store.save(); toast(n + ' messages deleted'); } catch (e) { toast('Could not clear: ' + (e.code || e.message)); }
};

/* ---------- Batch group chat ----------
   batches/{id}/messages/{m} = { uid, name, text, at }. Only members can read or post; you can delete your own
   messages and the batch admin can delete any. The newest MSG_CAP messages are cached in D.batch.hc (encrypted vault,
   so they are also inside encrypted .pgbak backups, but never in Drive sync); older pages load on demand. */
const Chat = {
  msgs: [], more: true, loading: false, hc: null,
  /* (re)load the in-memory list from the encrypted cache when the batch/cache changed; keeps older pages loaded this session */
  sync() { const hc = hubCache(); if (!hc) { this.msgs = []; this.hc = null; return; } if (this.hc !== hc) { this.hc = hc; this.msgs = (hc.msgs || []).slice(); this.more = hc.more !== false; } },
  lastRead() { return (D.batch && D.batch.chatRead) || 0; },
  unread() { const me = Cloud.user?.uid, lr = this.lastRead(); return this.msgs.filter(m => m.uid !== me && m.at > lr).length; },
  markRead() { const last = this.msgs.length ? this.msgs[this.msgs.length - 1].at : 0; if (D.batch && last > this.lastRead()) { D.batch.chatRead = last; Store.save(); } }
};
const chatUnreadBadge = () => { const n = Chat.unread(); return n && ROUTE.q.t !== 'chat' ? `<span id="chatbadge" class="badge red" style="margin-left:6px">${n > 99 ? '99+' : n}</span>` : '<span id="chatbadge"></span>'; };
const PHI_RE = /(\b[6-9]\d{9}\b)|(\bUHID\b)|(\b(?:OPD|IP|MRD)\s*(?:no|#|:)?\s*\d{3,}\b)|(\b\d{4}[-/]\d{4,}\b)/i;
function paintChat(el) {
  el.innerHTML = `<div class="chatwarn small">Messages are visible to everyone in this batch. Avoid patient names, UHIDs and phone numbers — de-identify photos before sharing.</div>
  <div id="chatlist" class="chatlist"></div>
  <form id="chatform" class="chatbar" autocomplete="off"><textarea id="chatin" rows="1" maxlength="1000" placeholder="Message ${esc(B().name)}"></textarea><button class="btn chatsend" aria-label="Send">${ic('send')}</button></form>`;
  const ta = $('#chatin');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); sendChat(); } });
  $('#chatform').addEventListener('submit', e => { e.preventDefault(); sendChat(); });
  paintChatList(true); Chat.markRead();
}
function paintChatList(force, keepPos) {
  const box = $('#chatlist'); if (!box) return;
  const near = !keepPos && (force || box.scrollHeight - box.scrollTop - box.clientHeight < 120);
  if (!box.dataset.older) { box.dataset.older = '1'; box.addEventListener('scroll', () => { if (box.scrollTop < 40 && Chat.more && Chat.msgs.length) loadOlderChat(); }, { passive: true }); }
  const me = Cloud.user?.uid; let day = '', prev = null;
  box.innerHTML = (Chat.more && Chat.msgs.length && Cloud.f.getDocs ? `<div class="chatday"><button type="button" class="linkbtn" data-act="chatolder">${Chat.loading ? 'Loading…' : 'Load older messages'}</button></div>` : '') + (Chat.msgs.length ? Chat.msgs.map(m => {
    const d = new Date(m.at), dk = d.toDateString(); let h = '';
    if (dk !== day) { day = dk; prev = null; h += `<div class="chatday">${fmt(d.toISOString().slice(0, 10))}</div>`; }
    const mine = m.uid === me, cont = prev && prev.uid === m.uid && m.at - prev.at < 5 * 60e3; prev = m;
    const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return h + `<div class="msg${mine ? ' me' : ''}${cont ? ' cont' : ''}">${!mine && !cont ? `<b>${esc(m.name || 'Member')}</b>` : ''}<p>${esc(m.text).replace(/\n/g, '<br>')}</p><small>${t}${mine || bAdmin() ? ` · <button type="button" class="linkbtn" data-act="chatdel" data-id="${esc(m.id)}">delete</button>` : ''}</small></div>`;
  }).join('') : '<p class="empty">No messages yet. Say hi to your batch 👋</p>');
  if (near) box.scrollTop = box.scrollHeight;
}
async function sendChat() {
  const ta = $('#chatin'), text = ta.value.trim(); if (!text) return;
  if (PHI_RE.test(text) && !(await uiConfirm('This message may contain patient identifiers (UHID / phone / OPD number). Everyone in the batch will see it. Send anyway?'))) return;
  const f = Cloud.f, me = (B().members || []).find(m => m.id === Cloud.user.uid);
  ta.value = ''; ta.style.height = 'auto';
  try { await f.addDoc(f.collection(Cloud.db, 'batches', B().id, 'messages'), { uid: Cloud.user.uid, name: (me && me.name) || D.settings.name || Cloud.user.displayName || 'Member', text, at: f.serverTimestamp() }); }
  catch (e) { ta.value = text; toast(e.code === 'permission-denied' ? 'You are not a member of this batch' : 'Could not send — check your internet'); }
}
ACT.chatdel = async el => { const mid = el.dataset.id; if (!(await uiConfirm('Delete this message for everyone?'))) return; try { await Cloud.f.deleteDoc(Cloud.f.doc(Cloud.db, 'batches', B().id, 'messages', mid)); if (B()) { setMsgs(Chat.msgs.filter(m => m.id !== mid)); Store.save(); paintChatList(); } } catch (e) { toast('Could not delete'); } };
