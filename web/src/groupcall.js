/* ===== Group calls (up to 4 people, voice or video) =====
   Free phone-to-phone "mesh": every participant connects directly to every other one (max 3 links each).
     batches/{b}/rooms/{r}                    = { host, hostName, people:[uid…] (host first, max 4), names:{uid:name}, video, status:'live'|'ended', createdAt }
     batches/{b}/rooms/{r}/peers/{uid}        = { name, sid, video, at }          one per person currently in the call
     batches/{b}/rooms/{r}/sig/{pair}         = { offer, answer }                 one per pair of join sessions
     batches/{b}/rooms/{r}/sig/{pair}/cands/x = { from: uid, c }                  network candidates
   Same rules as 1:1 calls: only people the admin has allowed to call can start or join. Nothing is recorded. */
const GROUP_MAX = 4, GROUP_RING_MS = 45000;
const Group = {
  room: null, seen: new Set(), incomingId: null,

  /* ---------- invitations ---------- */
  watch() {
    const f = Cloud.f, db = Cloud.db, b = D.batch.id, me = Cloud.user.uid;
    Calls.unsubs.push(f.onSnapshot(f.query(f.collection(db, 'batches', b, 'rooms'), f.where('people', 'array-contains', me)), s => {
      const docs = s.docChanges ? s.docChanges().filter(c => c.type !== 'removed').map(c => c.doc) : s.docs;
      docs.forEach(d => this.invite(d.id, d.data()));
    }, e => Calls.diag('roomlisten', e)));
  },
  invite(id, x) {
    if (x && x.host === Cloud.user.uid) return;
    if (!x || x.status !== 'live' || !Calls.allowed) { if (this.incomingId === id && x && x.status !== 'live') this.dismiss(); return; }
    if (this.seen.has(id)) return;
    const age = x.createdAt && x.createdAt.toMillis ? Date.now() - x.createdAt.toMillis() : 0;
    if (age > GROUP_RING_MS + 60000) return;
    this.seen.add(id);
    if (Calls.cur || this.room) return;
    this.incomingId = id; this.inv = { id, x };
    this.screenIncoming(); Calls.tone('ring'); try { navigator.vibrate && navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) {}
    clearTimeout(this.ringT); this.ringT = setTimeout(() => { if (this.incomingId === id) { this.dismiss(); toast('Missed group call from ' + x.hostName); } }, GROUP_RING_MS);
  },
  dismiss() { this.incomingId = null; this.inv = null; clearTimeout(this.ringT); Calls.tone(null); try { navigator.vibrate && navigator.vibrate(0); } catch (e) {} const b = $('#callui'); if (b && !this.room) b.remove(); },

  /* ---------- start / join ---------- */
  async startRoom(uids, video) {
    if (!Calls.allowed) return toast('Calling is not enabled for you yet — ask the admin');
    if (Calls.cur || this.room) return toast('You are already on a call');
    uids = uids.slice(0, GROUP_MAX - 1);
    if (!uids.length) return toast('Pick at least one batchmate');
    const f = Cloud.f, db = Cloud.db, b = D.batch.id, me = Cloud.user.uid;
    const names = {}; names[me] = Calls.myName(); (D.batch.members || []).forEach(m => { if (uids.includes(m.id)) names[m.id] = m.name || 'Batchmate'; });
    const ref = f.doc(f.collection(db, 'batches', b, 'rooms'));
    this.seen.add(ref.id);
    try { await f.setDoc(ref, { host: me, hostName: Calls.myName(), people: [me].concat(uids), names, video: !!video, status: 'live', createdAt: f.serverTimestamp() }); }
    catch (e) { Calls.diag('gstart', e); return toast(e && e.code === 'permission-denied' ? 'Calling is not allowed for one of you — ask the admin' : 'Could not start the group call'); }
    return this.join(ref.id, video, true);
  },
  async join(id, video, host) {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) return toast('Calls are not supported in this browser');
    this.dismiss();
    const f = Cloud.f, db = Cloud.db, b = D.batch.id, me = Cloud.user.uid;
    const ref = f.doc(db, 'batches', b, 'rooms', id);
    let local; try { local = await Calls.media(video); } catch (e) { Calls.diag('gmedia', e); return toast(video ? 'Allow camera & microphone to join' : 'Allow microphone to join'); }
    const r = this.room = { id, ref, video: !!video, host: !!host, local, sid: Math.random().toString(36).slice(2, 10), conns: new Map(), names: {}, unsubs: [], started: Date.now() };
    this.screen();
    try {
      r.ice = await Calls.iceServers();
      const beat = () => f.setDoc(f.doc(ref, 'peers', me), { name: Calls.myName(), sid: r.sid, video: !!video, at: f.serverTimestamp() });
      await beat(); r.beat = setInterval(() => { if (this.room === r) beat().catch(() => {}); }, 30000);
      r.unsubs.push(f.onSnapshot(ref, s => { const x = s.data(); if (!x || this.room !== r) return; r.names = x.names || {}; if (x.status === 'ended') this.leave(false, 'The group call has ended'); }));
      r.unsubs.push(f.onSnapshot(f.collection(ref, 'peers'), s => {
        if (this.room !== r) return;
        const present = new Map(); s.docs.forEach(d => { const x = d.data(), t = x.at && x.at.toMillis ? x.at.toMillis() : (typeof x.at === 'number' ? x.at : Date.now()); if (d.id !== me && Date.now() - t < 100000) present.set(d.id, x); });
        for (const [uid, c] of r.conns) { const p = present.get(uid); if (!p || p.sid !== c.sid) this.drop(uid); }
        for (const [uid, p] of present) if (!r.conns.has(uid) && r.conns.size < GROUP_MAX - 1) this.connect(uid, p);
        this.screen();
      }));
    } catch (e) { Calls.diag('gjoin', e); toast('Could not join the group call'); this.leave(true); }
  },

  /* ---------- one link per other participant ---------- */
  connect(uid, p) {
    const r = this.room, f = Cloud.f, me = Cloud.user.uid;
    const mine = me + '.' + r.sid, theirs = uid + '.' + p.sid, pair = [mine, theirs].sort().join('__'), offerer = mine < theirs;
    const sref = f.doc(r.ref, 'sig', pair), cref = f.collection(sref, 'cands');
    const pc = new RTCPeerConnection({ iceServers: r.ice });
    const c = { uid, sid: p.sid, name: p.name, video: !!p.video, pc, remote: new MediaStream(), held: [], seen: new Set(), unsubs: [], state: 'connecting' };
    r.conns.set(uid, c);
    r.local.getTracks().forEach(t => pc.addTrack(t, r.local));
    pc.ontrack = e => { (e.streams[0] ? e.streams[0].getTracks() : [e.track]).forEach(t => { if (!c.remote.getTracks().includes(t)) c.remote.addTrack(t); }); this.attach(); };
    pc.onicecandidate = e => { if (e.candidate) f.addDoc(cref, { from: me, c: e.candidate.toJSON() }).catch(() => {}); };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState; c.state = s === 'connected' ? 'live' : s;
      if (s === 'failed') Calls.diag('gfailed', 'group link failed', 'peer=' + uid.slice(0, 5));
      this.screen();
    };
    const flush = () => c.held.splice(0).forEach(x => pc.addIceCandidate(x).catch(() => {}));
    c.unsubs.push(f.onSnapshot(f.query(cref, f.where('from', '==', uid)), s => {
      (s.docChanges ? s.docChanges().filter(ch => ch.type === 'added').map(ch => ch.doc) : s.docs).forEach(d => {
        if (c.seen.has(d.id)) return; c.seen.add(d.id);
        if (pc.remoteDescription) pc.addIceCandidate(d.data().c).catch(() => {}); else c.held.push(d.data().c);
      });
    }));
    c.unsubs.push(f.onSnapshot(sref, async s => {
      const x = s.data(); if (!x || this.room !== r) return;
      try {
        if (offerer && x.answer && !pc.currentRemoteDescription && !c.busy) { c.busy = true; await pc.setRemoteDescription(x.answer); flush(); }
        if (!offerer && x.offer && !pc.remoteDescription && !c.busy) {
          c.busy = true; await pc.setRemoteDescription(x.offer); flush();
          const a = await pc.createAnswer(); await pc.setLocalDescription(a);
          await f.setDoc(sref, { answer: { type: a.type, sdp: a.sdp } }, { merge: true });
        }
      } catch (e) { Calls.diag('gsig', e); }
    }));
    if (offerer) (async () => { try { const o = await pc.createOffer(); await pc.setLocalDescription(o); await f.setDoc(sref, { offer: { type: o.type, sdp: o.sdp } }); } catch (e) { Calls.diag('goffer', e); } })();
  },
  drop(uid) {
    const r = this.room, c = r && r.conns.get(uid); if (!c) return;
    c.unsubs.forEach(u => { try { u(); } catch (e) {} }); try { c.pc.close(); } catch (e) {}
    r.conns.delete(uid);
  },

  /* ---------- leave ---------- */
  async leave(silent, msg) {
    const r = this.room; if (!r) return; this.room = null;
    clearInterval(r.clock); clearInterval(r.beat);
    r.unsubs.forEach(u => { try { u(); } catch (e) {} });
    for (const uid of [...r.conns.keys()]) { const c = r.conns.get(uid); c.unsubs.forEach(u => { try { u(); } catch (e) {} }); try { c.pc.close(); } catch (e) {} }
    r.local && r.local.getTracks().forEach(t => t.stop());
    const box = $('#callui'); if (box) box.remove();
    const f = Cloud.f, me = Cloud.user && Cloud.user.uid;
    if (f && me) {
      try {
        await f.deleteDoc(f.doc(r.ref, 'peers', me));
        const left = await f.getDocs(f.collection(r.ref, 'peers'));
        if (!left.size) await f.updateDoc(r.ref, { status: 'ended', endedAt: f.serverTimestamp() });
      } catch (e) {}
    }
    if (!silent) toast(msg || 'You left the group call · ' + Calls.dur(Math.round((Date.now() - r.started) / 1000)));
  },

  /* ---------- screens ---------- */
  box() { let b = $('#callui'); if (!b) { b = document.createElement('div'); b.id = 'callui'; document.body.appendChild(b); } return b; },
  screenIncoming() {
    const x = this.inv && this.inv.x; if (!x) return;
    const b = this.box(); b.className = 'callui';
    const others = Object.entries(x.names || {}).filter(([u]) => u !== Cloud.user.uid && u !== x.host).map(([, n]) => n);
    b.innerHTML = `<div class="call-top"><div class="call-av">${ic('users')}</div><h2>${esc(x.hostName || 'Batchmate')}</h2><p>Group ${x.video ? 'video' : 'voice'} call${others.length ? ' · with ' + esc(others.join(', ')) : ''}</p></div>
      <div class="call-ctl"><button class="cbtn red" data-g="decline" aria-label="Decline">${ic('phoneoff')}</button><button class="cbtn green" data-g="voice" aria-label="Join with voice">${ic('phone')}</button>${x.video ? `<button class="cbtn green" data-g="video" aria-label="Join with video">${ic('video')}</button>` : ''}</div>`;
    b.onclick = e => { const t = e.target.closest('[data-g]'); if (!t) return; e.stopPropagation(); const inv = this.inv;
      if (t.dataset.g === 'decline') return this.dismiss();
      this.join(inv.id, t.dataset.g === 'video'); };
  },
  screen() {
    const r = this.room; if (!r) return;
    const b = this.box(); b.className = 'callui group';
    const me = Cloud.user.uid, tiles = [{ uid: me, name: 'You', self: true, video: r.video && !r.camOff, state: 'live' }]
      .concat([...r.conns.values()].map(c => ({ uid: c.uid, name: c.name, video: c.video, state: c.state })));
    const waiting = Object.keys(r.names || {}).filter(u => u !== me && !r.conns.has(u)).map(u => r.names[u]);
    b.innerHTML = `<div class="g-head"><b>Group call</b><span>${tiles.length} in call${waiting.length ? ' · waiting for ' + esc(waiting.join(', ')) : ''} · <span id="gtime">${Calls.dur(Math.round((Date.now() - r.started) / 1000))}</span></span></div>
      <div class="g-grid n${tiles.length}">${tiles.map(t => `<div class="g-tile" data-u="${t.uid}">${t.video ? `<video autoplay playsinline ${t.self ? 'muted' : ''} data-v="${t.uid}"></video>` : `<audio autoplay data-a="${t.uid}"></audio><div class="call-av">${esc(initials(t.name))}</div>`}<span class="g-name">${esc(t.name)}${t.state !== 'live' ? ' · ' + (t.state === 'failed' ? 'couldn’t connect' : 'connecting…') : ''}</span></div>`).join('')}</div>
      <div class="call-ctl"><button class="cbtn${r.muted ? ' on' : ''}" data-g="mute" aria-label="Mute">${ic(r.muted ? 'micoff' : 'mic')}</button>${r.video ? `<button class="cbtn${r.camOff ? ' on' : ''}" data-g="cam" aria-label="Camera">${ic(r.camOff ? 'videooff' : 'video')}</button>` : ''}<button class="cbtn red" data-g="leave" aria-label="Leave call">${ic('phoneoff')}</button></div>`;
    b.onclick = e => { const t = e.target.closest('[data-g]'); if (!t) return; e.stopPropagation(); this.ctl(t.dataset.g); };
    this.attach();
    clearInterval(r.clock); r.clock = setInterval(() => { const el = $('#gtime'); if (el && this.room === r) el.textContent = Calls.dur(Math.round((Date.now() - r.started) / 1000)); }, 1000);
  },
  attach() {
    const r = this.room; if (!r) return; const me = Cloud.user.uid;
    $$('#callui [data-v],#callui [data-a]').forEach(el => {
      const uid = el.dataset.v || el.dataset.a, s = uid === me ? r.local : (r.conns.get(uid) || {}).remote;
      if (s && el.srcObject !== s) { el.srcObject = s; el.play && el.play().catch(() => {}); }
    });
  },
  ctl(a) {
    const r = this.room; if (!r) return;
    if (a === 'leave') return this.leave();
    if (a === 'mute') { r.muted = !r.muted; r.local.getAudioTracks().forEach(t => { t.enabled = !r.muted; }); }
    if (a === 'cam') { r.camOff = !r.camOff; r.local.getVideoTracks().forEach(t => { t.enabled = !r.camOff; }); }
    this.screen();
  }
};

/* Start a group call: pick up to 3 online batchmates who have calling switched on. */
ACT.gcall = () => {
  const me = Cloud.user?.uid;
  const list = (D.batch.members || []).filter(m => m.id !== me && Calls.canCall(m.id) && Calls.isOnline(m.id));
  if (!list.length) return toast('No batchmates with calling are online right now');
  openSheet(`<h3>Group call</h3><p class="small muted">Pick up to ${GROUP_MAX - 1} batchmates who are online.</p>
    <div class="list">${list.map(m => `<label class="li"><span><b>${esc(m.name)}</b><small>${esc(m.year || '')} · online</small></span><input type="checkbox" class="gpick" value="${m.id}"></label>`).join('')}</div>
    <div class="btnrow"><button class="btn" data-act="gstart" data-v="1">${ic('video')} Video call</button><button class="btn ghost" data-act="gstart" data-v="0">${ic('phone')} Voice call</button></div>`);
  $$('.gpick').forEach(cb => cb.addEventListener('change', () => { const on = $$('.gpick:checked'); if (on.length > GROUP_MAX - 1) { cb.checked = false; toast('Up to ' + GROUP_MAX + ' people in a group call'); } }));
};
ACT.gstart = el => { const ids = $$('.gpick:checked').map(x => x.value); closeSheet(); Group.startRoom(ids, el.dataset.v === '1'); };
