/* ===== Batch hub (Firebase) =====
   Shares ONLY: batch calendar events, member display names/years, and anonymous procedure COUNTS.
   No patient, photo, thesis or visit data is ever sent. Core app stays fully offline. */
const FB_VER = '10.12.2';
const EVENT_TYPES = ['Seminar', 'Journal club', 'Case presentation', 'Clinical meet', 'Posting', 'Duty', 'Exam / assessment', 'Workshop / CME', 'Other'];
const Cloud = {
  ready: null, auth: null, db: null, f: {}, user: null, unsubs: [], lastUid: undefined,
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
  stop() { this.unsubs.forEach(u => { try { u(); } catch (e) {} }); this.unsubs = []; }
};
const authMsg = e => ({ 'auth/invalid-credential': 'Wrong email or password', 'auth/wrong-password': 'Wrong email or password', 'auth/user-not-found': 'No account with this email', 'auth/email-already-in-use': 'Account exists — sign in instead', 'auth/weak-password': 'Password must be at least 6 characters', 'auth/invalid-email': 'Invalid email address', 'auth/network-request-failed': 'No internet connection', 'auth/popup-closed-by-user': 'Sign-in cancelled', 'auth/unauthorized-domain': 'This site is not authorised in Firebase → Authentication → Settings → Authorised domains', 'auth/too-many-requests': 'Too many attempts — try again later' }[e.code] || e.message || 'Something went wrong');
const B = () => D.batch || null;
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
  return `<div class="card form"><h3>Sign in to your batch hub</h3><p class="small muted">Only your name, residency year, batch events and (if you opt in) anonymous procedure counts are stored online. Patient data never leaves this phone.</p>
  <button class="btn ghost" data-act="gsign" style="width:100%">Continue with Google</button><p class="center small muted">or</p>
  <label>Email<input id="b_email" type="email" autocomplete="email"></label><label>Password<input id="b_pw" type="password" autocomplete="current-password"></label>
  <div class="actions"><button class="btn ghost" data-act="esignup">Create account</button><button class="btn" data-act="esignin">Sign in</button></div>
  <button class="btn xs ghost" data-act="ereset">Forgot password?</button></div>`;
}
ACT.gsign = async () => { const f = Cloud.f, pr = new f.GoogleAuthProvider(); const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone; try { if (standalone) await f.signInWithRedirect(Cloud.auth, pr); else await f.signInWithPopup(Cloud.auth, pr); } catch (e) { if (e.code === 'auth/popup-blocked') await f.signInWithRedirect(Cloud.auth, pr); else toast(authMsg(e)); } };
ACT.esignin = async () => { try { await Cloud.f.signInWithEmailAndPassword(Cloud.auth, val('b_email'), $('#b_pw').value); } catch (e) { toast(authMsg(e)); } };
ACT.esignup = async () => { try { await Cloud.f.createUserWithEmailAndPassword(Cloud.auth, val('b_email'), $('#b_pw').value); } catch (e) { toast(authMsg(e)); } };
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
    D.batch = { id, name, events: [], members: [], stats: [], shareStats: false, admin: true }; Store.save(); toast('Batch created'); render();
  } catch (e) { toast('Could not create batch: ' + (e.code || e.message)); }
};
ACT.bjoin = async () => {
  const id = val('b_code').toUpperCase().replace(/\s/g, ''); if (!/^DVL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id)) return toast('Batch code looks like DVL-XXXX-XXXX'); if (!val('b_name')) return toast('Enter your display name');
  const f = Cloud.f;
  try {
    const s = await f.getDoc(f.doc(Cloud.db, 'batches', id)); if (!s.exists()) return toast('No batch with that code');
    await f.setDoc(f.doc(Cloud.db, 'batches', id, 'members', Cloud.user.uid), memberDoc());
    D.batch = { id, name: s.data().name, events: [], members: [], stats: [], shareStats: false, admin: (s.data().admins || []).includes(Cloud.user.uid) };
    delete D.settings.pendingJoin; Store.save(); toast('Joined ' + s.data().name); render();
  } catch (e) { toast('Could not join: ' + (e.code || e.message)); }
};
ACT.bsignout = async () => { Cloud.stop(); await Cloud.f.signOut(Cloud.auth); render(); };

function batchTabsHTML() {
  const t = ROUTE.q.t || 'cal';
  return `<div class="row between"><div><b>${esc(B().name)}</b><div class="small muted">Code ${esc(B().id)}</div></div><button class="btn sm ghost" data-act="binvite">Invite</button></div>
  <div class="chips">${[['cal', '📅 Calendar'], ['log', '📊 Logbook comparison'], ['mem', '👥 Members']].map(([k, l]) => `<a class="chip${k === t ? ' on' : ''}" href="#/batch?t=${k}">${l}</a>`).join('')}</div><div id="bpane"></div>`;
}
function paintBatch() {
  const el = $('#bpane'); if (!el || !B()) return;
  const t = ROUTE.q.t || 'cal';
  if (t === 'cal') {
    const up = (B().events || []).filter(e => e.date >= today()).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const past = (B().events || []).filter(e => e.date < today()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
    const row = e => `<div class="li"><div><b>${esc(e.title)}</b> <span class="tag">${esc(e.type)}</span><small>${fmt(e.date)}${e.time ? ' · ' + esc(e.time) : ''}${e.venue ? ' · ' + esc(e.venue) : ''}${e.presenter ? ' · ' + esc(e.presenter) : ''}</small>${e.notes ? `<small>${esc(e.notes)}</small>` : ''}</div>${e.createdBy === Cloud.user?.uid || B().admin ? `<button class="icon" data-act="bevdel" data-id="${e.id}" aria-label="Delete">✕</button>` : ''}</div>`;
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
    el.innerHTML = `<div class="card">${(B().members || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(m => `<div class="li"><div><b>${esc(m.name)}</b>${m.id === Cloud.user?.uid ? ' <span class="tag">You</span>' : ''}<small>${esc(m.year || '')}</small></div>${B().admin && m.id !== Cloud.user?.uid ? `<button class="icon" data-act="bkick" data-id="${m.id}" aria-label="Remove">✕</button>` : ''}</div>`).join('') || '<p class="muted">Loading…</p>'}</div>
    <div class="btnrow"><button class="btn sm ghost" data-act="bleave">Leave batch</button><button class="btn sm ghost" data-act="bsignout">Sign out</button></div>`;
  }
}
function subscribeBatch() {
  Cloud.stop(); const f = Cloud.f, id = B().id, db = Cloud.db;
  const err = e => { if (e.code === 'permission-denied') { toast('You are no longer a member of this batch'); D.batch = null; Store.save(); render(); } };
  Cloud.unsubs.push(f.onSnapshot(f.query(f.collection(db, 'batches', id, 'events'), f.where('date', '>=', addDays(today(), -60)), f.orderBy('date')), s => { B().events = s.docs.map(d => Object.assign({ id: d.id }, d.data(), { createdAt: null })); Store.save(); if ((ROUTE.q.t || 'cal') === 'cal') paintBatch(); }, err));
  Cloud.unsubs.push(f.onSnapshot(f.collection(db, 'batches', id, 'members'), s => { B().members = s.docs.map(d => ({ id: d.id, name: d.data().name, year: d.data().year })); if (ROUTE.q.t === 'mem') paintBatch(); }, err));
  Cloud.unsubs.push(f.onSnapshot(f.collection(db, 'batches', id, 'logstats'), s => { B().stats = s.docs.map(d => ({ id: d.id, counts: d.data().counts || {} })); if (ROUTE.q.t === 'log') paintBatch(); }, err));
}
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
    for (let i = 0; i < reps; i++) await f.addDoc(f.collection(Cloud.db, 'batches', B().id, 'events'), { title, type: getChips('ev_ty', $('#sheet')), date: addDays(base, 7 * i), time: val('ev_tm'), presenter: val('ev_p'), venue: val('ev_v'), notes: val('ev_n'), createdBy: Cloud.user.uid, createdAt: f.serverTimestamp() });
    closeSheet(); toast(reps > 1 ? reps + ' events added' : 'Event added');
  } catch (e) { toast('Could not save: ' + (e.code || e.message)); }
};
ACT.bevdel = async el => { if (!confirm('Delete this event for everyone?')) return; try { await Cloud.f.deleteDoc(Cloud.f.doc(Cloud.db, 'batches', B().id, 'events', el.dataset.id)); } catch (e) { toast(e.code || e.message); } };
ACT.bevics = () => { const ev = (B().events || []).filter(e => e.date >= today()).map(e => ({ id: 'b' + e.id, date: e.date, time: e.time, title: e.type + ': ' + e.title, desc: [e.presenter, e.venue, e.notes].filter(Boolean).join(' · ') })); if (!ev.length) return toast('No upcoming events'); download(makeICS(ev), 'batch-calendar.ics'); };
ACT.bevwa = () => { const ev = (B().events || []).filter(e => e.date >= today() && e.date <= addDays(today(), 7)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))); if (!ev.length) return toast('Nothing in the next 7 days'); const msg = `📅 ${B().name} — this week\n\n` + ev.map(e => `• ${fmt(e.date)}${e.time ? ' ' + e.time : ''} — ${e.type}: ${e.title}${e.presenter ? ' (' + e.presenter + ')' : ''}${e.venue ? ' @ ' + e.venue : ''}`).join('\n'); window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank'); };
ACT.bleave = async () => { if (!confirm('Leave this batch? Your shared counts will be removed.')) return; const f = Cloud.f, id = B().id, uid = Cloud.user.uid; try { await f.deleteDoc(f.doc(Cloud.db, 'batches', id, 'logstats', uid)).catch(() => {}); await f.deleteDoc(f.doc(Cloud.db, 'batches', id, 'members', uid)); } catch (e) {} Cloud.stop(); D.batch = null; Store.save(); render(); };
ACT.bkick = async el => { if (!confirm('Remove this member?')) return; const f = Cloud.f; try { await f.deleteDoc(f.doc(Cloud.db, 'batches', B().id, 'logstats', el.dataset.id)).catch(() => {}); await f.deleteDoc(f.doc(Cloud.db, 'batches', B().id, 'members', el.dataset.id)); } catch (e) { toast(e.code || e.message); } };
ACT.fbcfgclear = () => { delete D.settings.fbConfig; Store.save(); Cloud.ready = null; toast('Removed'); render(); };
