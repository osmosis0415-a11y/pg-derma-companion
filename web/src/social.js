/* ===== Social layer: profile photos, follow, notifications, DMs, stories (photo/text/poll/quiz), push, app layout =====
   Firestore:
     profiles/{uid}.photo                        small JPEG data URL (avatar)
     follows/{a}_{b}           = { a, b, at }    a follows b
     notifs/{id}               = { to, from, fromName, type, ref, text, at, read, pushed }   (bot pushes unread ones)
     dms/{a_b}                 = { members:[a,b], names:{}, last, lastAt, unread:{uid:n} }
     dms/{a_b}/m/{id}          = { uid, text, at }
     stories/{id}              = { uid, name, kind:'photo'|'text'|'poll'|'quiz', text, img?, opts?, ans?, createdAt }
     stories/{id}/votes/{uid}  = { o, at }
     pushTokens/{uid}          = { tokens:[], updatedAt }
     config/app                = { layout:'insta'|'twitter' }   set by the admin */
const VAPID_KEY = window.FCM_VAPID_KEY || '';
const Prof = {
  map: {}, at: 0,
  async load(force) {
    if (!Comm.ok() || (!force && Date.now() - this.at < 120000)) return;
    this.at = Date.now();
    try { const s = await Cloud.f.getDocs(Cloud.f.collection(Cloud.db, 'profiles')); s.docs.forEach(d => { this.map[d.id] = d.data(); }); $$('[data-av]').forEach(el => { const p = this.map[el.dataset.av]; if (p && p.photo) el.innerHTML = `<img src="${esc(p.photo)}" alt="">`; }); } catch (e) {}
  }
};
/* avatar contents: photo if the person set one, else initials */
function av(uid, name) { const p = Prof.map[uid]; return p && p.photo ? `<img src="${esc(p.photo)}" alt="">` : esc(initials(name)); }
function avA(uid, name, cls = 'pav') { return `<a class="${cls}" data-av="${esc(uid)}" href="#/u/${esc(uid)}">${av(uid, name)}</a>`; }

/* ---------- App layout chosen by the admin ---------- */
const AppCfg = {
  layout: localStorage.getItem('pgd_layout') || 'insta',
  apply() { document.body.classList.toggle('lay-twitter', this.layout === 'twitter'); },
  async load() {
    if (!Comm.ok()) return;
    try { const d = await Cloud.f.getDoc(Cloud.f.doc(Cloud.db, 'config', 'app')); const l = d.exists() && d.data().layout; if (l && l !== this.layout) { this.layout = l; localStorage.setItem('pgd_layout', l); this.apply(); if (ROUTE.path === 'community') render(); } } catch (e) {}
  }
};
AppCfg.apply();
ACT.setlayout = async el => {
  const l = el.dataset.l; try { await Cloud.f.setDoc(Cloud.f.doc(Cloud.db, 'config', 'app'), { layout: l, updatedAt: Cloud.f.serverTimestamp() }, { merge: true }); AppCfg.layout = l; localStorage.setItem('pgd_layout', l); AppCfg.apply(); toast(l === 'twitter' ? 'Everyone now sees the Twitter-style timeline' : 'Everyone now sees the Instagram-style feed'); render(); } catch (e) { toast('Could not save: ' + (e.code || e.message)); }
};

/* ---------- Notifications ---------- */
const Notif = {
  list: [], unsub: null,
  async send(to, type, ref, text) {
    if (!Comm.ok() || !to || to === Cloud.user.uid) return;
    const f = Cloud.f; try { await f.addDoc(f.collection(Cloud.db, 'notifs'), { to, from: Cloud.user.uid, fromName: (D.settings.name || Cloud.user.displayName || 'Resident').slice(0, 80), type, ref: String(ref || '').slice(0, 120), text: String(text || '').slice(0, 160), at: f.serverTimestamp(), read: false, pushed: false }); } catch (e) {}
  },
  listen() {
    if (this.unsub || !Comm.ok()) return; const f = Cloud.f;
    try {
      this.unsub = f.onSnapshot(f.query(f.collection(Cloud.db, 'notifs'), f.where('to', '==', Cloud.user.uid), f.limit(100)), s => {
        this.list = s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => tsMs(b.at) - tsMs(a.at));
        this.badge(); if (ROUTE.path === 'notifs') vNotifs();
      }, () => {});
    } catch (e) {}
  },
  stop() { if (this.unsub) { try { this.unsub(); } catch (e) {} this.unsub = null; } },
  unread() { return this.list.filter(n => !n.read).length; },
  badge() { const n = this.unread() + DM.unread(); $$('[data-nbadge]').forEach(el => { el.textContent = n > 9 ? '9+' : n; el.hidden = !n; }); commBadge(); }
};
const NTXT = { refer: 'joined PG Derma with your invite 🎉', like: 'liked your post', comment: 'commented on your post', follow: 'started following you', dm: 'sent you a message', call: 'tried to call you', vote: 'answered your story' };
function vNotifs() {
  setTitle('Notifications', true, `<a class="icon" href="#/dms" aria-label="Messages">${ic('send')}</a>`);
  const L = Notif.list, today = Date.now() - 864e5;
  const row = n => `<a class="li nrow${n.read ? '' : ' unread'}" href="${n.type === 'dm' ? '#/dm/' + esc(n.ref) : n.type === 'refer' ? '#/u/' + esc(n.ref) : n.type === 'follow' || n.type === 'call' ? '#/u/' + esc(n.from) : n.type === 'vote' ? '#/community' : '#/post/' + esc(n.ref)}" data-nid="${n.id}">
    <span class="pav" data-av="${esc(n.from)}">${av(n.from, n.fromName)}</span><span class="nt"><b>${esc(n.fromName)}</b> ${NTXT[n.type] || ''}${n.text ? `: <span class="muted">${esc(n.text)}</span>` : ''}<small>${agoTxt(tsMs(n.at))}</small></span>${n.type === 'follow' && !Follow.has(n.from) ? `<button class="btn xs" data-act="follow" data-id="${esc(n.from)}" data-n="${esc(n.fromName)}">Follow back</button>` : ''}</a>`;
  main().innerHTML = `${pushPromptHTML()}${L.length ? `<h4 class="nh">New</h4><div class="list">${L.filter(n => tsMs(n.at) > today).map(row).join('') || '<p class="muted small">Nothing new today.</p>'}</div><h4 class="nh">Earlier</h4><div class="list">${L.filter(n => tsMs(n.at) <= today).map(row).join('') || '<p class="muted small">—</p>'}</div>` : `<div class="card empty-feed"><h3>No notifications yet</h3><p class="muted small">Likes, comments, new followers and messages appear here.</p></div>`}`;
  const f = Cloud.f; L.filter(n => !n.read).forEach(n => { f.updateDoc(f.doc(Cloud.db, 'notifs', n.id), { read: true }).catch(() => {}); });
  Prof.load();
}

/* ---------- Follow ---------- */
const Follow = {
  following: new Set(), loaded: false,
  has(uid) { return this.following.has(uid); },
  async load() {
    if (!Comm.ok() || this.loaded) return; this.loaded = true; const f = Cloud.f;
    try { const s = await f.getDocs(f.query(f.collection(Cloud.db, 'follows'), f.where('a', '==', Cloud.user.uid))); s.docs.forEach(d => this.following.add(d.data().b)); } catch (e) { this.loaded = false; }
  },
  async toggle(uid, name) {
    const f = Cloud.f, me = Cloud.user.uid, ref = f.doc(Cloud.db, 'follows', me + '_' + uid), on = !this.has(uid);
    try { if (on) { await f.setDoc(ref, { a: me, b: uid, at: f.serverTimestamp() }); this.following.add(uid); Notif.send(uid, 'follow'); Rank.bump('author', uid, 6); } else { await f.deleteDoc(ref); this.following.delete(uid); } toast(on ? 'Following ' + name : 'Unfollowed'); }
    catch (e) { toast('Could not update: ' + (e.code || e.message)); }
  },
  async counts(uid) {
    const f = Cloud.f; let a = 0, b = 0;
    try { a = (await f.getDocs(f.query(f.collection(Cloud.db, 'follows'), f.where('b', '==', uid)))).size; } catch (e) {}
    try { b = (await f.getDocs(f.query(f.collection(Cloud.db, 'follows'), f.where('a', '==', uid)))).size; } catch (e) {}
    return { followers: a, following: b };
  }
};
ACT.follow = async el => { await Follow.toggle(el.dataset.id, el.dataset.n); if (ROUTE.path === 'u') vUser(); else if (ROUTE.path === 'notifs') vNotifs(); };

/* ---------- Direct messages ---------- */
const DM = {
  convs: [], unsub: null, mUnsub: null,
  cid(a, b) { return [a, b].sort().join('_'); },
  unread() { const me = Cloud.user?.uid; return this.convs.reduce((s, c) => s + ((c.unread || {})[me] || 0), 0); },
  listen() {
    if (this.unsub || !Comm.ok()) return; const f = Cloud.f;
    try { this.unsub = f.onSnapshot(f.query(f.collection(Cloud.db, 'dms'), f.where('members', 'array-contains', Cloud.user.uid)), s => {
      this.convs = s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => tsMs(b.lastAt) - tsMs(a.lastAt)); Notif.badge(); if (ROUTE.path === 'dms') vDMs();
    }, () => {}); } catch (e) {}
  },
  stop() { [this.unsub, this.mUnsub].forEach(u => { try { u && u(); } catch (e) {} }); this.unsub = this.mUnsub = null; },
  async send(cid, other, otherName, text) {
    const f = Cloud.f, me = Cloud.user.uid, myName = (D.settings.name || Cloud.user.displayName || 'Resident').slice(0, 80), ref = f.doc(Cloud.db, 'dms', cid);
    const c = this.convs.find(x => x.id === cid);
    if (!c) await f.setDoc(ref, { members: [me, other].sort(), names: { [me]: myName, [other]: (otherName || 'Resident').slice(0, 80) }, last: '', lastAt: f.serverTimestamp(), unread: { [me]: 0, [other]: 0 } });
    await f.addDoc(f.collection(Cloud.db, 'dms', cid, 'm'), { uid: me, text: text.slice(0, 2000), at: f.serverTimestamp() });
    await f.updateDoc(ref, { last: text.slice(0, 120), lastAt: f.serverTimestamp(), ['unread.' + other]: f.increment(1) });
    Notif.send(other, 'dm', cid, text.slice(0, 80));
  }
};
function vDMs() {
  setTitle('Messages', true, `<a class="icon" href="#/notifs" aria-label="Notifications">${ic('heart')}</a>`);
  const me = Cloud.user?.uid;
  if (!Comm.ok()) { main().innerHTML = '<p class="muted">Sign in to use messages.</p>'; return; }
  main().innerHTML = `<p class="small muted">Private 1:1 messages with residents. Don't share patient identifiers here.</p><div class="list">${DM.convs.map(c => { const o = c.members.find(x => x !== me) || me, n = (c.names || {})[o] || 'Resident', u = (c.unread || {})[me] || 0;
    return `<a class="li dmrow${u ? ' unread' : ''}" href="#/dm/${esc(c.id)}"><span class="pav" data-av="${esc(o)}">${av(o, n)}</span><span class="nt"><b>${esc(n)}</b><small>${esc(c.last || 'Say hi')} · ${agoTxt(tsMs(c.lastAt))}</small></span>${u ? `<i class="nb" style="position:static">${u}</i>` : ''}</a>`; }).join('') || '<div class="card empty-feed"><h3>No messages yet</h3><p class="muted small">Open anyone\'s profile and tap Message.</p></div>'}</div>`;
  Prof.load();
}
function vDM() {
  const cid = ROUTE.id, me = Cloud.user?.uid; if (!Comm.ok()) return go('#/community');
  const parts = cid.split('_'), other = parts.find(x => x !== me) || parts[0];
  const c = DM.convs.find(x => x.id === cid), name = (c && c.names && c.names[other]) || ROUTE.q.n || (Prof.map[other] || {}).name || 'Resident';
  setTitle(name, true, `${Calls.allowed ? `<button class="icon" data-act="ucall" data-id="${esc(other)}" data-n="${esc(name)}" data-v="0" aria-label="Call">${ic('phone')}</button><button class="icon" data-act="ucall" data-id="${esc(other)}" data-n="${esc(name)}" data-v="1" aria-label="Video call">${ic('video')}</button>` : ''}<a class="icon" href="#/u/${esc(other)}" aria-label="Profile">${ic('user')}</a>`);
  main().innerHTML = `<div id="dmlist" class="dmlist"><p class="muted small center">Loading…</p></div><div class="chatbar dmbar"><textarea id="dm_text" rows="1" maxlength="2000" placeholder="Message…"></textarea><button class="btn" data-act="dmsend" data-cid="${esc(cid)}" data-o="${esc(other)}" data-n="${esc(name)}" aria-label="Send">${ic('send')}</button></div>`;
  const f = Cloud.f; if (DM.mUnsub) { try { DM.mUnsub(); } catch (e) {} }
  if (c && (c.unread || {})[me]) f.updateDoc(f.doc(Cloud.db, 'dms', cid), { ['unread.' + me]: 0 }).catch(() => {});
  DM.mUnsub = f.onSnapshot(f.query(f.collection(Cloud.db, 'dms', cid, 'm'), f.orderBy('at', 'asc'), f.limit(300)), s => {
    const el = $('#dmlist'); if (!el) return;
    el.innerHTML = s.docs.map(d => { const m = d.data(); return `<div class="dmm${m.uid === me ? ' mine' : ''}"><p class="pre">${esc(m.text)}</p><small>${agoTxt(tsMs(m.at))}</small></div>`; }).join('') || `<p class="muted small center">Start the conversation with ${esc(name)}.</p>`;
    el.scrollTop = el.scrollHeight; window.scrollTo(0, document.body.scrollHeight);
    const cc = DM.convs.find(x => x.id === cid); if (cc && (cc.unread || {})[me]) f.updateDoc(f.doc(Cloud.db, 'dms', cid), { ['unread.' + me]: 0 }).catch(() => {});
  }, () => { const el = $('#dmlist'); if (el) el.innerHTML = '<p class="muted small center">Say hi 👋</p>'; });
}
ACT.dmsend = async el => {
  const ta = $('#dm_text'), t = ta.value.trim(); if (!t) return;
  if (PHI_RE.test(t) && !(await uiConfirm('This may contain a phone number or hospital ID. Send anyway?', { ok: 'Send' }))) return;
  el.disabled = true; try { await DM.send(el.dataset.cid, el.dataset.o, el.dataset.n, t); ta.value = ''; } catch (e) { toast('Could not send: ' + (e.code || e.message)); } el.disabled = false;
};
ACT.dmopen = el => { const me = Cloud.user.uid; go('#/dm/' + DM.cid(me, el.dataset.id) + '?n=' + encodeURIComponent(el.dataset.n || '')); };

/* ---------- Profile photo ---------- */
ACT.avpick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = async () => { const fl = i.files[0]; if (!fl) return; const url = await squareAvatar(fl); const c = Comm.st(); c.photo = url; Store.save(); Prof.map[Cloud.user.uid] = Object.assign(Prof.map[Cloud.user.uid] || {}, { photo: url }); Comm.pushProfile(); toast('Profile photo updated'); render(); }; i.click(); };
ACT.avclear = () => { const c = Comm.st(); delete c.photo; Store.save(); if (Prof.map[Cloud.user.uid]) delete Prof.map[Cloud.user.uid].photo; Comm.pushProfile(); render(); };
async function squareAvatar(blob) {
  const img = await createImageBitmap(blob), s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 256;
  c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
  let q = 0.8, u = c.toDataURL('image/jpeg', q); while (u.length > 55000 && q > 0.3) { q -= 0.1; u = c.toDataURL('image/jpeg', q); } return u;
}

/* ---------- Stories you create: photo / text / poll / quiz (24 h) ---------- */
const Stories = {
  list: [], votes: {},
  async load() {
    if (!Comm.ok()) return; const f = Cloud.f, cut = Date.now() - 24 * 36e5;
    try { const s = await f.getDocs(f.query(f.collection(Cloud.db, 'stories'), f.orderBy('createdAt', 'desc'), f.limit(80))); this.list = s.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(x => tsMs(x.createdAt) > cut); } catch (e) {}
    const st = $('#stories'); if (st && ROUTE.path === 'community') st.innerHTML = storiesHTML();
  },
  async tally(id) { const f = Cloud.f, s = await f.getDocs(f.collection(Cloud.db, 'stories', id, 'votes')), t = {}; let mine = null; s.docs.forEach(d => { const o = d.data().o; t[o] = (t[o] || 0) + 1; if (d.id === Cloud.user.uid) mine = o; }); return { t, n: s.size, mine }; }
};
function vStoryNew() {
  setTitle('New story', true); const k = ROUTE.q.k || 'poll';
  main().innerHTML = `<div class="card form">${chips('sk', [['poll', 'Poll'], ['quiz', 'Quiz'], ['text', 'Text'], ['photo', 'Photo']], k)}
    <textarea id="st_text" rows="3" maxlength="300" placeholder="${k === 'quiz' ? 'Ask a question — e.g. What is the diagnosis?' : k === 'poll' ? 'Ask your batch — e.g. First-line for this?' : 'Share a pearl or thought'}"></textarea>
    <div id="st_opts" ${k === 'poll' || k === 'quiz' ? '' : 'hidden'}>${[0, 1, 2, 3].map(i => `<div class="row"><input id="st_o${i}" maxlength="60" placeholder="Option ${'ABCD'[i]}${i > 1 ? ' (optional)' : ''}">${k === 'quiz' ? `<label class="row small"><input type="radio" name="st_ans" value="${i}" ${i === 0 ? 'checked' : ''}> correct</label>` : ''}</div>`).join('')}</div>
    <div id="st_ph" ${k === 'photo' || k === 'quiz' ? '' : 'hidden'}><label class="btn sm ghost">${ic('image')} Add photo<input type="file" accept="image/*" id="st_file" hidden></label><div id="st_prev"></div><label class="row decl"><input type="checkbox" id="st_ok"> <span class="small">No face, name, UHID or tattoo visible; consent taken.</span></label></div>
    <button class="btn wide" data-act="stpost">Share to story · 24 h</button></div>`;
  $('[data-group="sk"]').addEventListener('click', () => setTimeout(() => go('#/story-new?k=' + getChips('sk'))));
  const fi = $('#st_file'); if (fi) fi.addEventListener('change', async e => { const fl = e.target.files[0]; if (!fl) return; Stories.img = await shrinkImage(fl); $('#st_prev').innerHTML = `<div class="cimg"><img src="${Stories.img}" alt=""></div>`; });
  Stories.img = '';
}
ACT.stpost = async el => {
  const k = getChips('sk') || 'text', text = $('#st_text').value.trim(), f = Cloud.f;
  const opts = [0, 1, 2, 3].map(i => ($('#st_o' + i) || {}).value || '').map(s => s.trim()).filter(Boolean);
  if (!text && !Stories.img) return toast('Write something first');
  if ((k === 'poll' || k === 'quiz') && opts.length < 2) return toast('Add at least two options');
  if (Stories.img && !$('#st_ok').checked) return toast('Please confirm the photo has no identifiers');
  if (PHI_RE.test(text) && !(await uiConfirm('This may contain a phone number or hospital ID. Share anyway?', { ok: 'Share' }))) return;
  const d = { uid: Cloud.user.uid, name: (D.settings.name || Cloud.user.displayName || 'Resident').slice(0, 80), kind: k, text: text.slice(0, 300), createdAt: f.serverTimestamp() };
  if (k === 'poll' || k === 'quiz') d.opts = opts.slice(0, 4);
  if (k === 'quiz') { const a = +((document.querySelector('input[name=st_ans]:checked') || {}).value || 0); d.ans = Math.min(a, d.opts.length - 1); }
  if (Stories.img) d.img = Stories.img;
  el.disabled = true;
  try { await f.addDoc(f.collection(Cloud.db, 'stories'), d); Comm.addXP(3); toast('Added to your story'); await Stories.load(); go('#/community'); } catch (e) { el.disabled = false; toast('Could not share: ' + (e.code || e.message)); }
};
ACT.stvote = async el => {
  const f = Cloud.f, id = el.dataset.sid, o = +el.dataset.o, s = Stories.list.find(x => x.id === id);
  try { await f.setDoc(f.doc(Cloud.db, 'stories', id, 'votes', Cloud.user.uid), { o, at: f.serverTimestamp() }); if (s) Notif.send(s.uid, 'vote', id, (s.opts || [])[o] || ''); } catch (e) { if (e.code !== 'permission-denied') toast('Could not vote'); }
  Story.paint(true);
};

/* ---------- Push notifications (Firebase Cloud Messaging) ---------- */
const Push = {
  supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID_KEY; },
  async enable(silent) {
    if (!this.supported()) { if (!silent) toast(VAPID_KEY ? 'This browser can\'t receive notifications. On iPhone, add the app to the Home Screen first.' : 'Notifications are not set up yet'); return false; }
    try {
      const perm = Notification.permission === 'granted' ? 'granted' : silent ? Notification.permission : await Notification.requestPermission();
      if (perm !== 'granted') { if (!silent) toast('Notifications were not allowed'); return false; }
      const M = await import('https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-messaging.js');
      const app = (await import('https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-app.js')).getApp();
      const reg = await navigator.serviceWorker.ready;
      const tok = await M.getToken(M.getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
      if (!tok) return false;
      const f = Cloud.f; await f.setDoc(f.doc(Cloud.db, 'pushTokens', Cloud.user.uid), { tokens: f.arrayUnion(tok), updatedAt: f.serverTimestamp() }, { merge: true });
      localStorage.setItem('pgd_push', '1'); if (!silent) toast('Notifications on for this phone'); return true;
    } catch (e) { if (!silent) toast('Could not turn on notifications: ' + (e.code || e.message)); ErrLog.capture('push', String(e && e.message || e)); return false; }
  }
};
function pushPromptHTML() { return Push.supported() && Notification.permission !== 'granted' ? `<div class="card hint pushhint">${ic('bell')}<span><b>Get notified</b><small class="muted"> of likes, comments, messages and calls, even when the app is closed</small></span><button class="btn sm" data-act="pushon">Turn on</button></div>` : ''; }
ACT.pushon = async () => { if (await Push.enable()) render(); };

/* ---------- start/stop with the session ---------- */
const Social = {
  async start() {
    if (!Cloud.cfg()) return; try { await Cloud.init(); } catch (e) { return; } if (!Cloud.user) return;
    Notif.listen(); DM.listen(); Follow.load(); Prof.load(); AppCfg.load(); Stories.load();
    if (localStorage.getItem('pgd_push') === '1') Push.enable(true);
  },
  stop() { Notif.stop(); DM.stop(); }
};
