/* ===== Community: posts (cases & questions), comments, likes, reports, profiles, weekly leaderboard =====
   Open to every approved user. Firestore:
     posts/{id}                 = { uid, name, year, kind, text, tags[], img?, likes, comments, reports, createdAt }
     posts/{id}/likes/{uid}     = { at }
     threads/{tid}/c/{cid}      = { uid, name, text, at }      tid = 'p_<postId>' (post) or 'c_<cardId>' (Feed card)
     reports/{id}               = { post, uid, reason, at }    admin-only
     profiles/{uid}             = { name, year, college, bio, streak, best, total, xp:{w<yyyyww>:n}, posts, updatedAt }
   Posts go live at once; anyone can report; the admin deletes posts or revokes the author. Patient photos must be
   de-identified — the composer warns, checks text for identifiers and requires a declaration. */
const POST_KINDS = { case: 'Case', question: 'Question', pearl: 'Pearl' };
/* Bot accounts (uid bot_*) are labelled everywhere so nobody mistakes them for a resident. */
const isBot = x => !!(x && (x.bot === true || /^bot_/.test(String(x.uid || ''))));
const botBadge = x => isBot(x) ? '<span class="botb" title="Automated account — posts are AI-generated">BOT</span>' : '';
const weekKey = (d = new Date()) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7); return 'w' + y + String(w).padStart(2, '0'); };
const agoTxt = ms => { const s = Math.max(1, Math.round((Date.now() - ms) / 1000)); return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : s < 604800 ? Math.floor(s / 86400) + 'd' : fmt(new Date(ms).toISOString()); };
const tsMs = x => !x ? Date.now() : x.toMillis ? x.toMillis() : typeof x === 'number' ? x : x.seconds ? x.seconds * 1000 : Date.now();

const Comm = {
  posts: [], liked: {}, unsub: null, me: null, _pt: null,
  ok() { return Cloud.cfg() && Cloud.user && Cloud.f; },
  st() { if (!D.community) D.community = { xp: {}, total: 0, seen: {}, college: '', bio: '', board: true }; return D.community; },
  /* ---------- XP + public profile ---------- */
  addXP(n) { const c = this.st(), w = weekKey(); c.xp[w] = (c.xp[w] || 0) + n; c.total = (c.total || 0) + n; for (const k of Object.keys(c.xp)) if (k < 'w' + (new Date().getFullYear() - 1) + '00') delete c.xp[k]; Store.save(); clearTimeout(this._pt); this._pt = setTimeout(() => this.pushProfile(), 4000); },
  pushProfile() {
    if (!this.ok()) return; const c = this.st(), f = Cloud.f, s = typeof Study !== 'undefined' ? Study.st() : {};
    const xp = {}; Object.keys(c.xp).sort().slice(-4).forEach(k => { xp[k] = c.xp[k]; });
    const ph = Object.assign(c.photo ? { photo: c.photo } : {}, { board: c.board !== false });
    f.setDoc(f.doc(Cloud.db, 'profiles', Cloud.user.uid), { ...ph, name: (D.settings.name || Cloud.user.displayName || 'Resident').slice(0, 80), year: residencyYear(new Date()), college: (c.college || '').slice(0, 80), bio: (c.bio || '').slice(0, 200),
      streak: typeof Study !== 'undefined' ? Study.streakNow() : 0, best: s.best || 0, total: c.total || 0, xp, posts: c.posts || 0, updatedAt: f.serverTimestamp() }).catch(() => {});
  },
  /* ---------- posts ---------- */
  listen() {
    if (this.unsub || !this.ok()) return;
    const f = Cloud.f;
    this.unsub = f.onSnapshot(f.query(f.collection(Cloud.db, 'posts'), f.orderBy('createdAt', 'desc'), f.limit(60)), s => {
      this.posts = s.docs.map(d => Object.assign({ id: d.id }, d.data()));
      if (ROUTE.path === 'community' && (ROUTE.q.t || 'posts') === 'posts') paintPosts();
      if (ROUTE.path === 'community' && ROUTE.q.t === 'explore') vExplore();
      commBadge();
    }, e => { const el = $('#plist'); if (el) el.innerHTML = `<p class="err small">${esc(e.code === 'permission-denied' ? 'Waiting for admin approval to join the community.' : 'Could not load posts.')}</p>`; });
  },
  stop() { if (this.unsub) { try { this.unsub(); } catch (e) {} this.unsub = null; } },
  newOnMine() { const me = Cloud.user?.uid, seen = this.st().seen; return this.posts.filter(p => p.uid === me).reduce((a, p) => a + Math.max(0, (p.comments || 0) - (seen[p.id] || 0)), 0); },
  async like(id) {
    const f = Cloud.f, me = Cloud.user.uid, p = this.posts.find(x => x.id === id); if (!p) return;
    const on = !this.liked[id]; this.liked[id] = on; p.likes = Math.max(0, (p.likes || 0) + (on ? 1 : -1)); paintPostLike(id);
    try {
      const lr = f.doc(Cloud.db, 'posts', id, 'likes', me);
      if (on) { await f.setDoc(lr, { at: f.serverTimestamp() }); Notif.send(p.uid, 'like', id, (p.text || '').slice(0, 60)); } else await f.deleteDoc(lr);
      await f.updateDoc(f.doc(Cloud.db, 'posts', id), { likes: f.increment(on ? 1 : -1) });
    } catch (e) { this.liked[id] = !on; p.likes += on ? -1 : 1; paintPostLike(id); toast('Could not update like'); }
  },
  async loadLikes() {
    if (!this.ok()) return; const f = Cloud.f, me = Cloud.user.uid;
    await Promise.all(this.posts.slice(0, 40).map(async p => { if (this.liked[p.id] !== undefined) return; try { const d = await f.getDoc(f.doc(Cloud.db, 'posts', p.id, 'likes', me)); this.liked[p.id] = d.exists(); } catch (e) {} }));
    $$('[data-plike]').forEach(b => paintPostLike(b.dataset.plike));
  }
};
function commBadge() { const n = Comm.newOnMine(), el = document.querySelector('.nav.bottom a[data-tab="community"]'); if (!el) return; let b = el.querySelector('.nb'); if (!n) { b && b.remove(); return; } if (!b) { b = document.createElement('i'); b.className = 'nb'; el.appendChild(b); } b.textContent = n > 9 ? '9+' : n; }

/* ---------- Community hub ---------- */
function vCommunity() {
  const t = ROUTE.q.t || 'posts';
  setTitle('Community', false, `<a class="icon" href="#/people" aria-label="Find people">${ic('search')}</a><a class="icon topic" href="#/notifs" aria-label="Notifications">${ic('heart')}<i class="nb" data-nbadge hidden></i></a><a class="icon topic" href="#/dms" aria-label="Messages">${ic('send')}</a>`); setTimeout(() => Notif.badge());
  const tabs = [['posts', 'For you'], ['explore', 'Explore'], ['top', 'Leaderboard'], ['batch', 'Batch']];
  main().innerHTML = `<div class="seg">${tabs.map(([k, l]) => `<a class="${k === t ? 'on' : ''}" href="${k === 'batch' ? '#/batch' : '#/community?t=' + k}">${l}</a>`).join('')}</div><div id="cpane"></div>`;
  if (!Cloud.cfg()) { $('#cpane').innerHTML = `<div class="card"><p>Sign in with Google (Batch hub) to join the community.</p><a class="btn" href="#/batch">Sign in</a></div>`; return; }
  Cloud.init().then(() => {
    if (!Cloud.user) { $('#cpane').innerHTML = `<div class="card"><p>Sign in with Google to join the community.</p><a class="btn" href="#/batch">Sign in</a></div>`; return; }
    if (t === 'top') return vBoard();
    if (t === 'explore') { Comm.listen(); $('#cpane').innerHTML = '<p class="muted small">Loading…</p>'; setTimeout(vExplore, Comm.posts.length ? 0 : 900); return; }
    $('#cpane').innerHTML = `${pushPromptHTML()}<div id="stories"></div><a class="card composer" href="#/compose"><span class="pav" data-av="${esc(Cloud.user.uid)}">${av(Cloud.user.uid, D.settings.name || 'PG')}</span><span class="muted">${AppCfg.feedLayout === 'twitter' ? 'What\'s happening in your OPD?' : 'Share a case, ask a doubt, post a pearl…'}</span>${ic('image')}</a>${AppCfg.feedLayout === 'twitter' ? `<a class="fabtw" href="#/compose" aria-label="New post">${ic('plus')}</a>` : ''}
      <div class="chips scroll" id="pfilt">${[['', 'All'], ...Object.entries(POST_KINDS)].map(([k, l]) => `<a class="chip${(ROUTE.q.k || '') === k ? ' on' : ''}" href="#/community?k=${k}">${l}${k ? 's' : ''}</a>`).join('')}<a class="chip${ROUTE.q.k === 'following' ? ' on' : ''}" href="#/community?k=following">Following</a><a class="chip${ROUTE.q.k === 'mine' ? ' on' : ''}" href="#/community?k=mine">Mine</a><a class="chip${ROUTE.q.k === 'new' ? ' on' : ''}" href="#/community?k=new">Latest</a></div>
      <div id="plist" class="feed"><p class="muted small">Loading posts…</p></div>`;
    Comm.listen(); paintPosts(); Comm.pushProfile(); Social.start(); Prof.load(); Follow.load().then(() => { if (ROUTE.q.k === 'following') paintPosts(); });
  }).catch(() => { $('#cpane').innerHTML = '<p class="err">Could not reach the community. Check your connection.</p>'; });
}
function postHTML(p, full) {
  if (typeof AppCfg !== 'undefined' && AppCfg.feedLayout === 'twitter') return tweetHTML(p, full);
  const me = Cloud.user?.uid, mine = p.uid === me, n = mine ? Math.max(0, (p.comments || 0) - (Comm.st().seen[p.id] || 0)) : 0;
  const txt = p.text || '', cut = !full && txt.length > 280;
  return `<article class="post cpost" data-pid="${p.id}">
    <header>${avA(p.uid, p.name)}<a class="pwho" href="#/u/${esc(p.uid)}"><b>${esc(p.name || 'Resident')}${botBadge(p)}</b><small>${esc(p.year || '')} · ${agoTxt(tsMs(p.createdAt))}</small></a><span class="ptag k-${esc(p.kind)}">${POST_KINDS[p.kind] || 'Post'}</span><button class="icon" data-act="pmenu" data-id="${p.id}" aria-label="More">${ic('more')}</button></header>
    <a class="pbody" href="#/post/${p.id}"><p class="pre">${esc(cut ? txt.slice(0, 280) + '…' : txt)}</p>${cut ? '<span class="muted small">more</span>' : ''}</a>
    ${p.img ? `<a class="pmedia" href="#/post/${p.id}"><img src="${esc(p.img)}" alt="Case photo" loading="lazy"></a>` : ''}
    ${(p.tags || []).length ? `<div class="ptags">${p.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="pact"><button class="icon plike${Comm.liked[p.id] ? ' on' : ''}" data-act="plike" data-plike="${p.id}" aria-label="Like">${ic(Comm.liked[p.id] ? 'heartfill' : 'heart')}<b>${p.likes || 0}</b></button>
      <a class="icon" href="#/post/${p.id}" aria-label="Comments">${ic('chat')}<b>${p.comments || 0}</b>${n ? `<i class="nb">${n}</i>` : ''}</a>
      <button class="icon" data-act="pshare" data-id="${p.id}" aria-label="Share">${ic('send')}</button></div><i class="fburst">${ic('heartfill')}</i></article>`;
}
const handleOf = (uid, name) => '@' + String(name || 'resident').replace(/^Dr\.?\s+/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) + String(uid || '').slice(0, 3).toLowerCase();
function tweetHTML(p, full) {
  const txt = p.text || '', cut = !full && txt.length > 420;
  return `<article class="tweet cpost" data-pid="${p.id}">${avA(p.uid, p.name)}<div class="tw">
    <div class="twh"><a href="#/u/${esc(p.uid)}"><b>${esc(p.name || 'Resident')}</b>${botBadge(p)}</a><small>${esc(handleOf(p.uid, p.name))} · ${agoTxt(tsMs(p.createdAt))}</small><span class="ptag k-${esc(p.kind)}">${POST_KINDS[p.kind] || 'Post'}</span><button class="icon" data-act="pmenu" data-id="${p.id}" aria-label="More">${ic('more')}</button></div>
    <a class="pbody" href="#/post/${p.id}"><p class="pre">${esc(cut ? txt.slice(0, 420) + '…' : txt)}</p></a>
    ${p.img ? `<a class="pmedia" href="#/post/${p.id}"><img src="${esc(p.img)}" alt="Case photo" loading="lazy"></a>` : ''}
    ${(p.tags || []).length ? `<div class="ptags">${p.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="pact"><a class="icon" href="#/post/${p.id}" aria-label="Reply">${ic('chat')}<b>${p.comments || 0}</b></a><button class="icon plike${Comm.liked[p.id] ? ' on' : ''}" data-act="plike" data-plike="${p.id}" aria-label="Like">${ic(Comm.liked[p.id] ? 'heartfill' : 'heart')}<b>${p.likes || 0}</b></button><button class="icon" data-act="pshare" data-id="${p.id}" aria-label="Share">${ic('send')}</button></div></div><i class="fburst">${ic('heartfill')}</i></article>`;
}
function paintPosts() {
  const el = $('#plist'); if (!el) return; const k = ROUTE.q.k || '', me = Cloud.user?.uid;
  const filt = Comm.posts.filter(p => !k || k === 'new' || (k === 'mine' ? p.uid === me : k === 'following' ? Follow.has(p.uid) || p.uid === me : p.kind === k));
  const list = k === 'new' || k === 'mine' ? filt : Rank.rankPosts(filt);
  const st = $('#stories'); if (st) st.innerHTML = storiesHTML();
  el.innerHTML = list.map(p => postHTML(p)).join('') || `<div class="card empty-feed"><h3>${k === 'mine' ? 'You haven\'t posted yet' : k === 'following' ? 'Follow residents to fill this feed' : 'Start the conversation'}</h3><p class="muted small">Share an interesting case (de-identified), a doubt from rounds, or a pearl from today's OPD.</p><a class="btn" href="#/compose">Create a post</a></div>`;
  Comm.loadLikes(); watchPostViews();
}
let postIO = null, postSeenT = {};
function watchPostViews() {
  if (postIO) postIO.disconnect();
  postIO = new IntersectionObserver(es => es.forEach(e => { const id = e.target.dataset.pid; if (!id) return; if (e.isIntersecting) postSeenT[id] = Date.now(); else if (postSeenT[id]) { const ms = Date.now() - postSeenT[id]; delete postSeenT[id]; const p = Comm.posts.find(x => x.id === id); if (p) { Rank.dwell(Object.assign({ top: (p.tags || [])[0], t: p.kind }, p), ms); if (ms > 1200) Rank.seenPost(id); } } }), { threshold: 0.6 });
  $$('#plist .cpost').forEach(el => postIO.observe(el));
}
function paintPostLike(id) { const p = Comm.posts.find(x => x.id === id); $$(`[data-plike="${id}"]`).forEach(b => { b.classList.toggle('on', !!Comm.liked[id]); b.innerHTML = ic(Comm.liked[id] ? 'heartfill' : 'heart') + `<b>${p ? p.likes || 0 : 0}</b>`; }); }
ACT.plike = el => { if (!Comm.ok()) return toast('Sign in to like'); const p = Comm.posts.find(x => x.id === el.dataset.plike); if (p && !Comm.liked[p.id]) Rank.liked(p); Comm.like(el.dataset.plike); };
ACT.pshare = el => { const p = Comm.posts.find(x => x.id === el.dataset.id) || Comm.cur; if (!p) return; const t = `${POST_KINDS[p.kind] || 'Post'} by ${p.name} on PG Derma:\n${(p.text || '').slice(0, 400)}\n${location.origin + location.pathname}#/post/${p.id}`; if (navigator.share) navigator.share({ text: t }).catch(() => {}); else window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank'); };
ACT.pmenu = el => {
  const p = Comm.posts.find(x => x.id === el.dataset.id) || Comm.cur; if (!p) return; const mine = p.uid === Cloud.user?.uid, adm = amAdmin();
  openSheet(`<h3>Post options</h3><div class="list">
    ${mine || adm ? `<button class="li" data-act="pdel" data-id="${p.id}"><b class="danger">Delete post</b></button>` : ''}
    ${!mine ? `<button class="li" data-act="preport" data-id="${p.id}"><b>Report</b><small>Patient identifiable, wrong info, spam or abuse</small></button>` : ''}
    ${adm && !mine ? `<button class="li" data-act="pblock" data-uid="${esc(p.uid)}" data-n="${esc(p.name)}"><b class="danger">Revoke ${esc(p.name)}'s access</b></button>` : ''}
    <button class="li" data-act="pshare" data-id="${p.id}"><b>Share</b></button></div>`);
};
ACT.pdel = async el => { closeSheet(); if (!(await uiConfirm('Delete this post and its comments for everyone?', { ok: 'Delete' }))) return; try { await deletePost(el.dataset.id); toast('Post deleted'); if (ROUTE.path === 'post') go('#/community'); } catch (e) { toast('Could not delete: ' + (e.code || e.message)); } };
async function deletePost(id) {
  const f = Cloud.f, db = Cloud.db;
  for (const sub of [f.collection(db, 'threads', 'p_' + id, 'c'), f.collection(db, 'posts', id, 'likes')]) { try { const s = await f.getDocs(sub); for (const d of s.docs) await f.deleteDoc(d.ref); } catch (e) {} }
  await f.deleteDoc(f.doc(db, 'posts', id));
}
ACT.preport = async el => {
  closeSheet(); const r = await uiPrompt('What is wrong with this post? (e.g. patient face visible, wrong dose, spam)', '', { ok: 'Report' }); if (r == null) return;
  const f = Cloud.f;
  try { await f.addDoc(f.collection(Cloud.db, 'reports'), { post: el.dataset.id, uid: Cloud.user.uid, reason: String(r).slice(0, 300), at: f.serverTimestamp() }); toast('Reported. The admin will review it.'); } catch (e) { toast('Could not report'); }
};
ACT.pblock = async el => {
  closeSheet(); if (!(await uiConfirm(`Revoke ${el.dataset.n}'s access to the app? Their posts stay until you delete them.`, { ok: 'Revoke' }))) return;
  const f = Cloud.f; try { await f.updateDoc(f.doc(Cloud.db, 'approvals', el.dataset.uid), { status: 'rejected', decidedAt: f.serverTimestamp(), decidedBy: Cloud.user.email }); toast('Access revoked'); } catch (e) { toast('Could not revoke: ' + (e.code || e.message)); }
};

/* ---------- Composer ---------- */
let composeImg = '';
function vCompose() {
  setTitle('New post', true); composeImg = '';
  const tops = [...new Set(STUDY_BANK.map(x => x.top))].sort();
  const deid = D.photos.filter(p => p.deid).slice(-12).reverse();
  main().innerHTML = `<div class="card form">
    ${chips('ck', Object.entries(POST_KINDS), ROUTE.q.k || 'case')}
    <textarea id="c_text" rows="7" maxlength="3000" placeholder="Case: age/sex, complaint, duration, findings, what you're thinking — and your question for the community.\nNo names, UHIDs, phone numbers or faces."></textarea>
    <p id="c_warn" class="warn small" hidden></p>
    <label>Topics</label><div class="chips scroll" id="c_tags">${tops.map(t => `<button type="button" class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    <label>Photo (optional)</label>
    <div class="row" style="gap:8px;flex-wrap:wrap"><label class="btn sm ghost">${ic('image')} From gallery<input type="file" accept="image/*" id="c_file" hidden></label>${deid.length ? `<button type="button" class="btn sm ghost" data-act="cpickvault">${ic('shield')} De-identified photos</button>` : ''}</div>
    <div id="c_prev"></div>
    <label class="row decl"><input type="checkbox" id="c_ok"> <span class="small">I confirm there is <b>no patient name, UHID, phone number, face or tattoo</b> in this post, and the patient has consented to educational use of any photo.</span></label>
    <button class="btn wide" data-act="cpost">Post to community</button></div>`;
  $('#c_tags').addEventListener('click', e => { const b = e.target.closest('[data-tag]'); if (!b) return; b.classList.toggle('on'); if ($$('#c_tags .on').length > 3) { b.classList.remove('on'); toast('Up to 3 topics'); } });
  $('#c_text').addEventListener('input', () => { const w = $('#c_warn'), m = PHI_RE.test($('#c_text').value); w.hidden = !m; w.textContent = m ? 'This looks like it may contain a phone number, UHID or hospital number. Remove identifiers before posting.' : ''; });
  $('#c_file').addEventListener('change', async e => { const f = e.target.files[0]; if (f) setComposeImg(await shrinkImage(f)); });
}
async function shrinkImage(blob) {
  const img = await createImageBitmap(blob); let w = img.width, h = img.height, max = 1080; if (Math.max(w, h) > max) { const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
  let q = 0.72, url = c.toDataURL('image/jpeg', q); while (url.length > 420000 && q > 0.35) { q -= 0.1; url = c.toDataURL('image/jpeg', q); }
  if (url.length > 420000) { const c2 = document.createElement('canvas'); c2.width = Math.round(w * 0.7); c2.height = Math.round(h * 0.7); c2.getContext('2d').drawImage(c, 0, 0, c2.width, c2.height); url = c2.toDataURL('image/jpeg', 0.6); }
  return url;
}
function setComposeImg(url) { composeImg = url || ''; const p = $('#c_prev'); if (p) p.innerHTML = url ? `<div class="cimg"><img src="${url}" alt=""><button type="button" class="icon" data-act="cnoimg" aria-label="Remove photo">✕</button></div><p class="small muted">Check the photo carefully: no face, eyes, tattoos, jewellery or wristbands.</p>` : ''; }
ACT.cnoimg = () => setComposeImg('');
ACT.cpickvault = async () => {
  const list = D.photos.filter(p => p.deid).slice(-12).reverse();
  openSheet(`<h3>De-identified photos</h3><div class="pgrid">${list.map(p => `<button class="pg" data-act="cvault" data-id="${p.id}"><img data-pid="${p.id}" data-thumb="1" alt=""></button>`).join('')}</div>`); hydrateImgs();
};
ACT.cvault = async el => { closeSheet(); setComposeImg(await shrinkImage(await photoBlob(el.dataset.id))); };
ACT.cpost = async el => {
  const text = $('#c_text').value.trim(), kind = getChips('ck') || 'case', tags = $$('#c_tags .on').map(b => b.dataset.tag);
  if (text.length < 10) return toast('Write a little more (at least 10 characters)');
  if (!$('#c_ok').checked) return toast('Please confirm the post has no patient identifiers');
  if (PHI_RE.test(text) && !(await uiConfirm('The text may contain a phone number or hospital ID. Post anyway?', { ok: 'Post anyway' }))) return;
  if (!Comm.ok()) { try { await Cloud.init(); } catch (e) {} if (!Comm.ok()) return toast('Sign in first (Batch hub)'); }
  el.disabled = true; el.textContent = 'Posting…';
  const f = Cloud.f, data = { uid: Cloud.user.uid, name: (D.settings.name || Cloud.user.displayName || 'Resident').slice(0, 80), year: residencyYear(new Date()), kind, text: text.slice(0, 3000), tags, likes: 0, comments: 0, reports: 0, createdAt: f.serverTimestamp() };
  if (composeImg) data.img = composeImg;
  try { await f.addDoc(f.collection(Cloud.db, 'posts'), data); const c = Comm.st(); c.posts = (c.posts || 0) + 1; Comm.addXP(5); toast('Posted'); go('#/community'); }
  catch (e) { el.disabled = false; el.textContent = 'Post to community'; toast(e && e.code === 'permission-denied' ? 'Your account is waiting for admin approval' : 'Could not post: ' + (e.code || e.message)); }
};

/* ---------- Post detail + comments (also used for Feed cards) ---------- */
function vPost() {
  const id = ROUTE.id; setTitle('Post', true); main().innerHTML = '<p class="muted small">Loading…</p>';
  Cloud.init().then(async () => {
    const f = Cloud.f; let p = Comm.posts.find(x => x.id === id);
    if (!p) { const d = await f.getDoc(f.doc(Cloud.db, 'posts', id)); if (!d.exists()) { main().innerHTML = empty('Post not found', 'It may have been deleted.'); return; } p = Object.assign({ id }, d.data()); }
    Comm.cur = p;
    if (p.uid === Cloud.user.uid) { Comm.st().seen[p.id] = p.comments || 0; Store.save(); commBadge(); }
    if (Comm.liked[id] === undefined) { try { Comm.liked[id] = (await f.getDoc(f.doc(Cloud.db, 'posts', id, 'likes', Cloud.user.uid))).exists(); } catch (e) {} }
    main().innerHTML = `<div class="feed">${postHTML(p, true)}</div><div id="thread" class="card thread"></div>`;
    openThread('p_' + id, $('#thread'), id);
  }).catch(() => { main().innerHTML = '<p class="err">Could not load the post.</p>'; });
}
let threadUnsub = null;
function openThread(tid, el, postId) {
  if (threadUnsub) { try { threadUnsub(); } catch (e) {} threadUnsub = null; }
  const f = Cloud.f, me = Cloud.user.uid;
  el.innerHTML = `<h3>Discussion</h3><div class="tlist" id="tl"><p class="muted small">Loading…</p></div>
    <div class="cbox"><textarea id="tc_text" rows="2" maxlength="1000" placeholder="Add to the discussion…"></textarea><button class="btn sm" data-act="tcsend" data-tid="${esc(tid)}" ${postId ? `data-post="${esc(postId)}"` : ''}>${ic('send')}</button></div>`;
  threadUnsub = f.onSnapshot(f.query(f.collection(Cloud.db, 'threads', tid, 'c'), f.orderBy('at', 'asc'), f.limit(200)), s => {
    const tl = $('#tl'); if (!tl) return;
    tl.innerHTML = s.docs.map(d => { const c = d.data(), mine = c.uid === me; return `<div class="cm">${avA(c.uid, c.name, 'pav sm')}<div><b>${esc(c.name)}</b>${botBadge(c)} <small class="muted">${agoTxt(tsMs(c.at))}</small><p class="pre">${esc(c.text)}</p></div>${mine || amAdmin() ? `<button class="icon xs" data-act="tcdel" data-tid="${esc(tid)}" data-id="${d.id}" ${postId ? `data-post="${esc(postId)}"` : ''} aria-label="Delete comment">✕</button>` : ''}</div>`; }).join('') || '<p class="muted small">No comments yet — be the first.</p>';
  }, () => { const tl = $('#tl'); if (tl) tl.innerHTML = '<p class="err small">Could not load comments.</p>'; });
}
ACT.tcsend = async el => {
  const ta = $('#tc_text'), text = ta.value.trim(); if (!text) return;
  if (PHI_RE.test(text) && !(await uiConfirm('This may contain a phone number or hospital ID. Send anyway?', { ok: 'Send' }))) return;
  const f = Cloud.f; el.disabled = true;
  try {
    await f.addDoc(f.collection(Cloud.db, 'threads', el.dataset.tid, 'c'), { uid: Cloud.user.uid, name: (D.settings.name || Cloud.user.displayName || 'Resident').slice(0, 80), text: text.slice(0, 1000), at: f.serverTimestamp() });
    if (el.dataset.post) { await f.updateDoc(f.doc(Cloud.db, 'posts', el.dataset.post), { comments: f.increment(1) }).catch(() => {}); const pp = Comm.posts.find(x => x.id === el.dataset.post) || Comm.cur; if (pp) Notif.send(pp.uid, 'comment', el.dataset.post, text.slice(0, 80)); }
    ta.value = ''; Comm.addXP(1); const cp = el.dataset.post && (Comm.posts.find(x => x.id === el.dataset.post) || Comm.cur); if (cp) Rank.commented(cp);
  } catch (e) { toast('Could not send: ' + (e.code || e.message)); }
  el.disabled = false;
};
ACT.tcdel = async el => {
  if (!(await uiConfirm('Delete this comment?', { ok: 'Delete' }))) return; const f = Cloud.f;
  try { await f.deleteDoc(f.doc(Cloud.db, 'threads', el.dataset.tid, 'c', el.dataset.id)); if (el.dataset.post) await f.updateDoc(f.doc(Cloud.db, 'posts', el.dataset.post), { comments: f.increment(-1) }).catch(() => {}); } catch (e) { toast('Could not delete'); }
};
/* Discussion under a Feed card */
function openCardThread(cardId, title) {
  if (!Comm.ok()) { Cloud.init().then(() => Comm.ok() ? openCardThread(cardId, title) : toast('Sign in to join the discussion')).catch(() => toast('Sign in to join the discussion')); return; }
  openSheet(`<h3 class="small">${esc(title.slice(0, 120))}</h3><div id="sthread" class="thread"></div>`);
  openThread('c_' + cardId, $('#sthread'));
}

/* ---------- Leaderboard ---------- */
function vBoard() {
  const w = weekKey(), mode = ROUTE.q.m || 'week';
  $('#cpane').innerHTML = `<div class="chips">${[['week', 'This week'], ['all', 'All time'], ['streak', 'Streaks']].map(([k, l]) => `<a class="chip${k === mode ? ' on' : ''}" href="#/community?t=top&m=${k}">${l}</a>`).join('')}</div>
    <p class="small muted">XP: 1 per study card, 5 per post, 1 per comment. Hide yourself in Profile → Settings.</p><div id="blist2" class="card"><p class="muted small">Loading…</p></div>`;
  Comm.pushProfile();
  const f = Cloud.f, field = mode === 'week' ? 'xp.' + w : mode === 'all' ? 'total' : 'streak';
  f.getDocs(f.query(f.collection(Cloud.db, 'profiles'), f.orderBy(field, 'desc'), f.limit(50))).then(s => {
    const me = Cloud.user.uid, val = x => mode === 'week' ? (x.xp || {})[w] || 0 : mode === 'all' ? x.total || 0 : x.streak || 0;
    const rows = s.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(x => val(x) > 0 && x.board !== false);
    $('#blist2').innerHTML = rows.map((x, i) => `<a class="li rank${x.id === me ? ' me' : ''}" href="#/u/${esc(x.id)}"><span class="rk">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span><span class="pav sm" data-av="${esc(x.id)}">${av(x.id, x.name)}</span><span class="rn"><b>${esc(x.name)}</b><small>${esc([x.year, x.college].filter(Boolean).join(' · '))}</small></span><b class="rv">${val(x)}${mode === 'streak' ? ' 🔥' : ' XP'}</b></a>`).join('') || '<p class="muted small">No one on the board yet this week. Study a few cards to get on it.</p>';
  }).catch(e => { $('#blist2').innerHTML = `<p class="err small">${esc(e.code || 'Could not load')}</p>`; });
}

/* ---------- Public profile ---------- */
function vUser() {
  const uid = ROUTE.id; setTitle('Profile', true); main().innerHTML = '<p class="muted small">Loading…</p>';
  Cloud.init().then(async () => {
    const f = Cloud.f, me = uid === Cloud.user.uid;
    if (me) Comm.pushProfile();
    let pr = {}; try { const d = await f.getDoc(f.doc(Cloud.db, 'profiles', uid)); if (d.exists()) pr = d.data(); } catch (e) {}
    let posts = []; try { const s = await f.getDocs(f.query(f.collection(Cloud.db, 'posts'), f.where('uid', '==', uid), f.limit(30))); posts = s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)); } catch (e) {}
    const name = pr.name || (posts[0] && posts[0].name) || 'Resident', w = weekKey();
    const badges = [[pr.best >= 7, 'flame', '7-day streak'], [pr.best >= 30, 'flame', '30-day streak'], [(pr.total || 0) >= 100, 'bolt', '100 XP'], [(pr.total || 0) >= 1000, 'bolt', '1000 XP'], [(pr.posts || 0) >= 1, 'chat', 'First post'], [(pr.posts || 0) >= 10, 'chat', '10 posts']].filter(b => b[0]);
    if (pr.photo) Prof.map[uid] = pr; await Follow.load(); const fc = await Follow.counts(uid);
    main().innerHTML = `<section class="card uprof"><div class="phead"><span class="pbig${me ? ' edit' : ''}" ${me ? 'data-act="avpick" role="button" aria-label="Change profile photo"' : ''}>${pr.photo ? `<img src="${esc(pr.photo)}" alt="">` : esc(initials(name))}${me ? `<i class="avplus">+</i>` : ''}</span><div class="pstats"><div><b>${posts.length}</b><small>posts</small></div><a href="#/flist/${esc(uid)}?l=followers"><b>${fc.followers}</b><small>followers</small></a><a href="#/flist/${esc(uid)}?l=following"><b>${fc.following}</b><small>following</small></a></div></div>
      <h2>${esc(name)}${botBadge({ uid, bot: pr.bot })}</h2>${isBot({ uid, bot: pr.bot }) ? '<p class="small botnote">Automated account. Its posts are AI-generated — discuss them, and verify with your faculty before clinical use.</p>' : ''}<p class="small muted">${esc(handleOf(uid, name))} · ${esc([pr.year, pr.college].filter(Boolean).join(' · '))}</p>${pr.bio ? `<p class="pre">${esc(pr.bio)}</p>` : ''}
      ${badges.length ? `<div class="badges">${badges.map(b => `<span>${ic(b[1])}${b[2]}</span>`).join('')}</div>` : ''}
      <p class="small muted">🔥 ${pr.streak || 0}-day streak · ${(pr.xp || {})[w] || 0} XP this week</p>
      ${me ? `<div class="btnrow"><a class="btn sm ghost" href="#/settings">Edit profile</a><button class="btn sm ghost" data-act="avpick">${pr.photo ? 'Change' : 'Add'} photo</button><a class="btn sm ghost" href="#/story-new">Add story</a></div>${inviteCardHTML()}` : `<div class="btnrow"><button class="btn sm${Follow.has(uid) ? ' ghost' : ''}" data-act="follow" data-id="${esc(uid)}" data-n="${esc(name)}">${Follow.has(uid) ? 'Following' : 'Follow'}</button><button class="btn sm ghost" data-act="dmopen" data-id="${esc(uid)}" data-n="${esc(name)}">Message</button></div>`}
      ${me ? '' : (Calls.allowed ? `<div class="btnrow"><button class="btn sm" data-act="ucall" data-id="${esc(uid)}" data-n="${esc(name)}" data-v="0">${ic('phone')} Call</button><button class="btn sm ghost" data-act="ucall" data-id="${esc(uid)}" data-n="${esc(name)}" data-v="1">${ic('video')} Video</button></div>` : '')}</section>
      ${posts.length ? `<div class="xgrid">${posts.map(x => `<a class="xt${x.img ? '' : ' txt k-' + esc(x.kind)}" href="#/post/${x.id}">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy">` : `<span>${esc((x.text || '').slice(0, 90))}</span>`}</a>`).join('')}</div>` : '<p class="muted small center">No posts yet.</p>'}`;
  }).catch(() => { main().innerHTML = '<p class="err">Could not load the profile.</p>'; });
}

ACT.ucall = el => Calls.call(el.dataset.id, el.dataset.n, el.dataset.v === '1', true);
/* ---------- Admin → Reports ---------- */
function vAdminReports() {
  main().innerHTML = `<div class="chips">${ADMIN_TABS.map(([k, l]) => `<a class="chip${k === 'reports' ? ' on' : ''}" href="#/admin?t=${k}">${l}</a>`).join('')}</div>
  <p class="small muted">Posts that members reported. Delete the post, dismiss the report, or revoke the author's access.</p><div id="rlist"><p class="muted small">Loading…</p></div>`;
  Cloud.init().then(async () => {
    const f = Cloud.f, s = await f.getDocs(f.collection(Cloud.db, 'reports')), by = {};
    s.docs.forEach(d => { const r = d.data(); (by[r.post] = by[r.post] || []).push(Object.assign({ id: d.id }, r)); });
    const out = [];
    for (const pid of Object.keys(by)) { let p = null; try { const d = await f.getDoc(f.doc(Cloud.db, 'posts', pid)); if (d.exists()) p = Object.assign({ id: pid }, d.data()); } catch (e) {} out.push({ pid, p, rs: by[pid] }); }
    const el = $('#rlist'); if (!el) return;
    el.innerHTML = out.map(o => `<div class="card"><p class="small"><b>${o.rs.length} report(s):</b> ${o.rs.map(r => esc(r.reason || '—')).join(' · ')}</p>
      ${o.p ? `<div class="feed">${postHTML(o.p)}</div>` : '<p class="muted small">Post already deleted.</p>'}
      <div class="btnrow">${o.p ? `<button class="btn xs danger" data-act="rdelpost" data-id="${o.pid}">Delete post</button><button class="btn xs ghost danger" data-act="pblock" data-uid="${esc(o.p.uid)}" data-n="${esc(o.p.name)}">Revoke author</button>` : ''}<button class="btn xs ghost" data-act="rdismiss" data-ids="${o.rs.map(r => r.id).join(',')}">Dismiss</button></div></div>`).join('') || '<p class="muted small">No reports. 🎉</p>';
  }).catch(e => { const el = $('#rlist'); if (el) el.innerHTML = `<p class="err">${esc(e.code || e.message || 'Could not load')}</p>`; });
}
ACT.rdelpost = async el => { if (!(await uiConfirm('Delete this post for everyone?', { ok: 'Delete' }))) return; try { await deletePost(el.dataset.id); const f = Cloud.f, s = await f.getDocs(f.query(f.collection(Cloud.db, 'reports'), f.where('post', '==', el.dataset.id))); for (const d of s.docs) await f.deleteDoc(d.ref); toast('Deleted'); vAdminReports(); } catch (e) { toast('Could not delete'); } };
ACT.rdismiss = async el => { const f = Cloud.f; for (const id of el.dataset.ids.split(',')) { try { await f.deleteDoc(f.doc(Cloud.db, 'reports', id)); } catch (e) {} } toast('Dismissed'); vAdminReports(); };

/* ===== Ranking ("for you") — learns from what each resident dwells on, likes, saves, comments on and gets wrong =====
   Everything is computed on the phone from D.community.aff; nothing about behaviour leaves the device. */
const Rank = {
  aff() { const c = Comm.st(); if (!c.aff) c.aff = { top: {}, type: {}, author: {}, seenP: {} }; return c.aff; },
  bump(kind, key, n) { if (!key) return; const a = this.aff()[kind]; a[key] = Math.max(-5, Math.min(40, (a[key] || 0) + n)); this._dirty = true; clearTimeout(this._t); this._t = setTimeout(() => Store.save(), 3000); },
  /* signals */
  dwell(item, ms) { if (!item) return; const k = ms > 6000 ? 1.5 : ms > 2500 ? 1 : ms < 900 ? -0.4 : 0; if (!k) return; this.bump('top', item.top, k); this.bump('type', item.t || item.kind, k * 0.6); if (item.uid) this.bump('author', item.uid, k * 0.5); },
  liked(p) { (p.tags || []).forEach(t => this.bump('top', t, 3)); this.bump('author', p.uid, 2); this.bump('type', p.kind, 1); },
  commented(p) { (p.tags || []).forEach(t => this.bump('top', t, 4)); this.bump('author', p.uid, 3); },
  seenPost(id) { const s = this.aff().seenP; s[id] = Date.now(); const ks = Object.keys(s); if (ks.length > 400) ks.sort((a, b) => s[a] - s[b]).slice(0, 100).forEach(k => delete s[k]); },
  /* weakness: topics with more wrong answers get more practice */
  weak() { const s = typeof Study !== 'undefined' ? Study.st() : { ans: {} }, by = {}; for (const x of Study.all()) { const v = s.ans[x.id]; if (v === undefined) continue; const b = by[x.top] = by[x.top] || { w: 0, n: 0 }; b.n++; if (v === 0) b.w++; } const out = {}; for (const [t, b] of Object.entries(by)) out[t] = (b.w + 0.5) / (b.n + 1); return out; },
  postScore(p, now = Date.now()) {
    const a = this.aff(), h = Math.max(0, (now - tsMs(p.createdAt)) / 36e5), me = Cloud.user?.uid;
    const eng = Math.log2(2 + (p.likes || 0) * 2 + (p.comments || 0) * 3);
    const decay = 1 / Math.pow(h + 2, 1.15);
    const topic = (p.tags || []).reduce((s, t) => s + (a.top[t] || 0), 0) / 10;
    const mates = D.batch && (D.batch.members || []).some(m => m.id === p.uid) ? 0.35 : 0;
    const seen = a.seenP[p.id] ? 0.3 : 1, own = p.uid === me ? 0.6 : 1;
    return eng * decay * (1 + Math.max(-0.5, topic) + (a.author[p.uid] || 0) / 20 + mates) * (p.img ? 1.25 : 1) * seen * own;
  },
  rankPosts(list) { const now = Date.now(); return list.slice().sort((x, y) => this.postScore(y, now) - this.postScore(x, now)); },
  /* weights for study cards in the Feed */
  typeWeights() { const a = this.aff().type, base = { pearl: 4, mcq: 3, card: 2, spot: 1.5 }; const w = {}; for (const k in base) w[k] = Math.max(0.6, base[k] * (1 + (a[k] || 0) / 15)); return w; },
  itemScore(x, weak, now) { const a = this.aff(), s = Study.st(); let sc = 1 + (weak[x.top] || 0.3) * 2 + Math.max(-0.5, (a.top[x.top] || 0) / 12); if (!s.seen[x.id]) sc += 1.2; if (x.src === 'bot') sc += 0.5; if (x.t === 'mcq' && s.ans[x.id] === 0) sc += 1; return sc * (0.75 + Math.random() * 0.5); }
};

/* ---------- Stories: created stories (24 h: photo/text/poll/quiz) + posts from the last 48 h ---------- */
function storyItems(uid) {
  const cut = Date.now() - 48 * 36e5, cut24 = Date.now() - 24 * 36e5;
  const a = (typeof Stories !== 'undefined' ? Stories.list : []).filter(x => x.uid === uid && tsMs(x.createdAt) > cut24).map(x => Object.assign({ _s: 1 }, x));
  const b = Comm.posts.filter(p => p.uid === uid && tsMs(p.createdAt) > cut);
  return a.concat(b).sort((x, y) => tsMs(x.createdAt) - tsMs(y.createdAt));
}
function storiesHTML() {
  if (typeof AppCfg !== 'undefined' && AppCfg.feedLayout === 'twitter') return '';
  const me = Cloud.user?.uid, uids = new Set(), seen = Rank.aff().seenP;
  (typeof Stories !== 'undefined' ? Stories.list : []).forEach(x => uids.add(x.uid));
  Comm.posts.filter(p => tsMs(p.createdAt) > Date.now() - 48 * 36e5).forEach(p => uids.add(p.uid));
  const users = [...uids].map(uid => { const it = storyItems(uid); return { uid, name: (it[0] || {}).name || 'Resident', unseen: it.some(x => !seen[(x._s ? 's:' : '') + x.id]), n: it.length }; }).filter(u => u.n && u.uid !== me)
    .sort((a, b) => (b.unseen - a.unseen) || (Follow.has(b.uid) - Follow.has(a.uid)));
  const mine = storyItems(me).length;
  return `<div class="stories cstories"><a class="story mine${mine ? ' hot' : ''}" ${mine ? `data-act="story" data-uid="${esc(me)}"` : 'href="#/story-new"'}><span class="sav" data-av="${esc(me)}">${av(me, D.settings.name || 'You')}</span><i class="splus" data-act="storynew">+</i><small>Your story</small></a>${users.map(u => `<a class="story${u.unseen ? ' hot' : ''}" data-act="story" data-uid="${esc(u.uid)}"><span class="sav" data-av="${esc(u.uid)}">${av(u.uid, u.name)}</span><small>${esc((u.name || '').split(' ')[0])}</small></a>`).join('')}</div>`;
}
ACT.storynew = (el, e) => { if (e) e.stopPropagation(); go('#/story-new'); };
const Story = {
  open(uid) {
    const ps = storyItems(uid); if (!ps.length) return; this.ps = ps; this.uid = uid;
    const seen = Rank.aff().seenP; this.i = Math.max(0, ps.findIndex(p => !seen[(p._s ? 's:' : '') + p.id]));
    $('#storyui')?.remove(); const ui = document.createElement('div'); ui.id = 'storyui'; document.body.appendChild(ui);
    ui.addEventListener('click', e => { if (e.target.closest('[data-sclose]')) return this.close(); if (e.target.closest('a,button,input')) return; const x = e.clientX / innerWidth; x < 0.3 ? this.go(-1) : this.go(1); });
    this.paint();
  },
  async paint(keep) {
    const p = this.ps[this.i], ui = $('#storyui'); if (!p || !ui) return this.close();
    Rank.seenPost((p._s ? 's:' : '') + p.id); Store.save(); clearTimeout(this.t);
    const me = Cloud.user?.uid, isQ = p._s && (p.kind === 'poll' || p.kind === 'quiz');
    let opts = '';
    if (isQ) {
      let T = { t: {}, n: 0, mine: null }; try { T = await Stories.tally(p.id); } catch (e) {}
      const done = T.mine !== null || p.uid === me;
      opts = `<div class="sopts">${p.opts.map((o, k) => { const pc = T.n ? Math.round((T.t[k] || 0) / T.n * 100) : 0, cls = !done ? '' : p.kind === 'quiz' ? (k === p.ans ? ' right' : k === T.mine ? ' wrong' : '') : (k === T.mine ? ' mine' : '');
        return done ? `<div class="sopt res${cls}"><i style="width:${pc}%"></i><span>${esc(o)}</span><b>${pc}%</b></div>` : `<button class="sopt" data-act="stvote" data-sid="${esc(p.id)}" data-o="${k}">${esc(o)}</button>`; }).join('')}</div>
        <small class="svotes">${T.n} ${p.kind === 'quiz' ? 'answers' : 'votes'}${done && p.kind === 'quiz' && T.mine !== null ? (T.mine === p.ans ? ' · You got it ✓' : ' · Correct: ' + esc(p.opts[p.ans])) : ''}</small>`;
    }
    ui.innerHTML = `<div class="sbars">${this.ps.map((_, j) => `<i class="${j < this.i ? 'done' : j === this.i ? 'run' : ''}"></i>`).join('')}</div>
      <div class="shead"><span class="pav" data-av="${esc(p.uid)}">${av(p.uid, p.name)}</span><b>${esc(p.name)}</b><small>${agoTxt(tsMs(p.createdAt))}</small>${p._s && p.uid === me ? `<button data-act="stdel" data-sid="${esc(p.id)}" aria-label="Delete story">${ic('more')}</button>` : ''}<button data-sclose="1" aria-label="Close">✕</button></div>
      <div class="sbody">${p.img ? `<img src="${esc(p.img)}" alt="">` : ''}${p._s && p.kind !== 'photo' && !p.img ? `<p class="big">${esc(p.text || '')}</p>` : `<p class="${p.img ? 'cap' : 'big'}">${esc((p.text || '').slice(0, p.img ? 220 : 500))}</p>`}${opts}</div>
      ${p._s ? (p.uid !== me ? `<button class="sopen" data-act="dmopen" data-id="${esc(p.uid)}" data-n="${esc(p.name)}">${ic('send')} Reply</button>` : '<span class="sopen">Your story · 24 h</span>') : `<a class="sopen" href="#/post/${p.id}">${ic('chat')} Open discussion</a>`}`;
    if (!keep) this.t = setTimeout(() => this.go(1), isQ ? 15000 : p.img ? 6000 : 8000);
  },
  go(d) { this.i += d; if (this.i < 0) this.i = 0; if (this.i >= this.ps.length) return this.close(); this.paint(); },
  close() { clearTimeout(this.t); $('#storyui')?.remove(); if (ROUTE.path === 'community') paintPosts(); }
};
ACT.stdel = async el => { if (!(await uiConfirm('Delete this story?', { ok: 'Delete' }))) return; try { await Cloud.f.deleteDoc(Cloud.f.doc(Cloud.db, 'stories', el.dataset.sid)); Stories.list = Stories.list.filter(x => x.id !== el.dataset.sid); Story.close(); toast('Story deleted'); } catch (e) { toast('Could not delete'); } };
ACT.story = el => Story.open(el.dataset.uid);
window.addEventListener('hashchange', () => { if ($('#storyui')) Story.close(); });

/* ---------- Explore: photo grid of cases + study tiles, ranked ---------- */
function vExplore() {
  const posts = Rank.rankPosts(Comm.posts), weak = Rank.weak(), now = Date.now();
  const cards = Study.all().filter(x => x.t === 'pearl' || x.t === 'spot').map(x => [x, Rank.itemScore(x, weak, now)]).sort((a, b) => b[1] - a[1]).slice(0, 24).map(a => a[0]);
  const tiles = []; let pi = 0, ci = 0;
  while (pi < posts.length || ci < cards.length) { for (let k = 0; k < 2 && pi < posts.length; k++) tiles.push(['p', posts[pi++]]); if (ci < cards.length) tiles.push(['c', cards[ci++]]); if (tiles.length > 90) break; }
  $('#cpane').innerHTML = `<a class="psearch" href="#/people">${ic('search')}<span class="muted">Search residents by name or college</span></a><div class="xgrid">${tiles.map(([k, x]) => k === 'p'
    ? `<a class="xt${x.img ? '' : ' txt k-' + esc(x.kind)}" href="#/post/${x.id}">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy">` : `<span>${esc((x.text || '').slice(0, 90))}</span>`}${(x.likes || x.comments) ? `<i>${ic('heart')}${x.likes || 0}</i>` : ''}</a>`
    : `<a class="xt card-${x.t}" href="#/feed" data-act="xcard" data-id="${esc(x.id)}"><span>${esc((x.p || x.dx ? (x.t === 'spot' ? 'Spot: ' + x.v : x.p) : '').slice(0, 90))}</span><em>${esc(x.top)}</em></a>`).join('') || '<p class="muted small">Nothing to explore yet.</p>'}</div>`;
}
ACT.xcard = (el, e) => { if (e) e.preventDefault(); Feed.startId = el.dataset.id; go('#/feed'); };

/* ---------- Double-tap to like (posts) ---------- */
let _lastTap = { id: null, t: 0 };
document.addEventListener('pointerup', e => {
  const m = e.target.closest('.cpost .pmedia, .cpost .pbody'); if (!m) return; const post = m.closest('.cpost'), id = post && post.dataset.pid; if (!id) return;
  const t = Date.now();
  if (_lastTap.id === id && t - _lastTap.t < 320) {
    e.preventDefault(); _lastTap = { id: null, t: 0 };
    post.classList.add('burst'); setTimeout(() => post.classList.remove('burst'), 750);
    if (!Comm.liked[id] && Comm.ok()) { Comm.like(id); const p = Comm.posts.find(x => x.id === id); if (p) Rank.liked(p); }
  } else _lastTap = { id, t };
}, true);
document.addEventListener('click', e => { const m = e.target.closest('.cpost .pmedia, .cpost .pbody'); if (m && _lastTap.id && Date.now() - _lastTap.t < 320) { e.preventDefault(); setTimeout(() => { if (_lastTap.id && Date.now() - _lastTap.t >= 300) location.hash = m.getAttribute('href'); }, 330); } }, true);
