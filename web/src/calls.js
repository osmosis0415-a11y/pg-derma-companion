/* ===== One-to-one voice & video calls between batchmates =====
   Media goes phone-to-phone (WebRTC). Firestore only carries the ringing/answer messages:
     batches/{b}/presence/{uid}            = { name, at }                 heartbeat while the app is open
     batches/{b}/calls/{id}                = { caller, callerName, callee, calleeName, video, status, offer, answer, createdAt, endedAt }
     batches/{b}/calls/{id}/cands/{x}      = { from: 'caller'|'callee', c: <ICE candidate JSON> }
   When a direct connection is blocked, the call relays through a free TURN relay (ExpressTURN) using a
   short-lived pass from the Apps Script helper. Nothing is recorded or stored. */
/* Calls are off by default; the admin enables them per person in Access requests → Approved. */
const CALL_RING_MS = 40000, PRESENCE_MS = 60000, ONLINE_WINDOW = 150000;
const Calls = {
  unsubs: [], presTimer: null, cur: null, online: {}, callable: {}, allowed: false, ice: null, iceExp: 0,

  /* ---------- lifecycle ---------- */
  async start() {
    this.stop();
    if (!D.batch || !Cloud.cfg()) return;
    try { await Cloud.init(); } catch (e) { return; }
    if (!Cloud.user || !D.batch) return;
    const f = Cloud.f, db = Cloud.db, b = D.batch.id, me = Cloud.user.uid;
    const beat = () => f.setDoc(f.doc(db, 'batches', b, 'presence', me), { name: this.myName(), at: f.serverTimestamp(), calls: this.allowed }).catch(() => {});
    // Calling is off until the admin switches it on for this person (approvals/{uid}.calls). Watch it live.
    if (isAdminUser(Cloud.user)) {
      const ar = f.doc(db, 'approvals', me);
      try { const a = await f.getDoc(ar); if (!a.exists() || a.data().calls !== true) await (a.exists() ? f.updateDoc(ar, { calls: true }) : f.setDoc(ar, { email: Cloud.user.email, name: Cloud.user.displayName || '', photo: '', status: 'approved', calls: true })); } catch (e) {}
      this.allowed = true;
    }
    this.unsubs.push(f.onSnapshot(f.doc(db, 'approvals', me), s => {
      const was = this.allowed; let ok = false; try { ok = !!(s && typeof s.exists === 'function' && s.exists() && s.data().calls === true); } catch (e) {} this.allowed = isAdminUser(Cloud.user) || ok;
      if (was !== this.allowed) { beat(); if (!this.allowed && this.cur) this.hangup(); if (ROUTE.path === 'batch' && ROUTE.q.t === 'mem') paintBatch(); }
    }, () => {}));
    beat(); this.presTimer = setInterval(() => { if (!document.hidden) beat(); }, PRESENCE_MS);
    this._vis = () => { if (!document.hidden) beat(); }; document.addEventListener('visibilitychange', this._vis);
    try {
      this.unsubs.push(f.onSnapshot(f.collection(db, 'batches', b, 'presence'), s => {
        this.online = {}; this.callable = {}; s.docs.forEach(d => { const x = d.data(); this.callable[d.id] = x.calls === true; this.online[d.id] = x.at && x.at.toMillis ? x.at.toMillis() : (typeof x.at === 'number' ? x.at : 0); });
        if (ROUTE.path === 'batch' && ROUTE.q.t === 'mem') paintBatch();
      }, () => {}));
      this.unsubs.push(f.onSnapshot(f.query(f.collection(db, 'batches', b, 'calls'), f.where('callee', '==', me), f.where('status', '==', 'ringing')), s => {
        s.docChanges ? s.docChanges().forEach(ch => { if (ch.type === 'added') this.incoming(ch.doc.id, ch.doc.data()); })
          : s.docs.forEach(d => this.incoming(d.id, d.data()));
      }, () => {}));
    } catch (e) { ErrLog.capture('calls', String(e && e.message || e), e && e.stack); }
  },
  stop() {
    this.unsubs.forEach(u => { try { u(); } catch (e) {} }); this.unsubs = [];
    clearInterval(this.presTimer); this.presTimer = null;
    if (this._vis) document.removeEventListener('visibilitychange', this._vis);
    if (this.cur) this.hangup(true);
  },
  myName() { const m = D.batch && (D.batch.members || []).find(x => x.id === Cloud.user?.uid); return (m && m.name) || D.settings.name || Cloud.user?.displayName || 'Batchmate'; },
  isOnline(uid) { return Date.now() - (this.online[uid] || 0) < ONLINE_WINDOW; },

  /* ---------- relay passes ---------- */
  async iceServers() {
    const stun = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
    if (this.ice && Date.now() < this.iceExp) return stun.concat(this.ice);
    if (!window.DRIVE_TOKEN_HELPER || !Cloud.user) return stun;
    try {
      const idToken = await Cloud.user.getIdToken();
      const r = await fetch(window.DRIVE_TOKEN_HELPER, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'turn', idToken }) });
      const j = await r.json();
      if (j.iceServers && j.iceServers.length) { this.ice = j.iceServers; this.iceExp = Date.now() + ((j.ttl || 21600) - 600) * 1000; return stun.concat(this.ice); }
    } catch (e) {}
    return stun;
  },

  /* ---------- outgoing ---------- */
  async call(uid, name, video) {
    if (!this.allowed) return toast('Calling is not enabled for you yet — ask the admin');
    if (this.cur) return toast('You are already on a call');
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) return toast('Calls are not supported in this browser');
    const f = Cloud.f, db = Cloud.db, b = D.batch.id, me = Cloud.user.uid;
    let local; try { local = await this.media(video); } catch (e) { return toast(video ? 'Allow camera & microphone to call' : 'Allow microphone to call'); }
    const ref = f.doc(f.collection(db, 'batches', b, 'calls'));
    const c = this.cur = { id: ref.id, ref, role: 'caller', peer: uid, peerName: name, video, local, unsubs: [], status: 'ringing' };
    this.screen();
    try {
      const pc = await this.peer(c);
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      await f.setDoc(ref, { caller: me, callerName: this.myName(), callee: uid, calleeName: name, video: !!video, status: 'ringing', offer: { type: offer.type, sdp: offer.sdp }, createdAt: f.serverTimestamp() });
      c.flush();
      c.unsubs.push(f.onSnapshot(ref, s => {
        const x = s.data(); if (!x || this.cur !== c) return;
        if (x.answer && !pc.currentRemoteDescription) pc.setRemoteDescription(x.answer).catch(() => {});
        if (x.status !== c.status) { c.status = x.status; if (['declined', 'ended', 'missed', 'busy'].includes(x.status)) this.finish(x.status); else this.screen(); }
      }));
      this.listenCands(c, 'callee');
      this.tone('ringback');
      c.ringTimer = setTimeout(() => { if (this.cur === c && c.status === 'ringing') { f.updateDoc(ref, { status: 'missed', endedAt: f.serverTimestamp() }).catch(() => {}); this.finish('missed'); } }, CALL_RING_MS);
    } catch (e) { toast('Could not start the call'); ErrLog.capture('calls', String(e && e.message || e), e && e.stack); this.hangup(true); }
  },

  /* ---------- incoming ---------- */
  canCall(uid) { return this.allowed && this.callable[uid] === true; },
  incoming(id, x) {
    if (!x || x.status !== 'ringing' || !this.allowed) return;
    const age = x.createdAt && x.createdAt.toMillis ? Date.now() - x.createdAt.toMillis() : 0;
    if (age > CALL_RING_MS) return;
    const f = Cloud.f, ref = f.doc(Cloud.db, 'batches', D.batch.id, 'calls', id);
    if (this.cur) { f.updateDoc(ref, { status: 'busy', endedAt: f.serverTimestamp() }).catch(() => {}); return; }
    const c = this.cur = { id, ref, role: 'callee', peer: x.caller, peerName: x.callerName, video: !!x.video, offer: x.offer, unsubs: [], status: 'incoming' };
    c.unsubs.push(f.onSnapshot(ref, s => { const y = s.data(); if (this.cur !== c || !y) return; if (['ended', 'missed'].includes(y.status) && c.status !== 'ended') this.finish(c.status === 'incoming' ? 'missed' : 'ended'); }));
    this.screen(); this.tone('ring'); try { navigator.vibrate && navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) {}
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.ready.then(r => r.showNotification('Incoming ' + (x.video ? 'video' : 'voice') + ' call', { body: x.callerName + ' is calling — open PG Derma', tag: 'call-' + id, renotify: true })).catch(() => {});
    }
    c.ringTimer = setTimeout(() => { if (this.cur === c && c.status === 'incoming') this.finish('missed'); }, CALL_RING_MS);
  },
  async accept(withVideo) {
    const c = this.cur; if (!c || c.role !== 'callee' || c.status !== 'incoming') return;
    this.tone(null); clearTimeout(c.ringTimer); c.status = 'connecting'; c.video = !!withVideo; this.screen();
    const f = Cloud.f;
    try {
      c.local = await this.media(withVideo);
      const pc = await this.peer(c);
      await pc.setRemoteDescription(c.offer);
      const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
      await f.updateDoc(c.ref, { answer: { type: ans.type, sdp: ans.sdp }, status: 'accepted' });
      this.listenCands(c, 'caller');
    } catch (e) { toast(e && e.name === 'NotAllowedError' ? 'Allow microphone/camera to answer' : 'Could not answer the call'); this.hangup(); }
  },
  decline() { const c = this.cur; if (!c) return; Cloud.f.updateDoc(c.ref, { status: 'declined', endedAt: Cloud.f.serverTimestamp() }).catch(() => {}); this.finish('declined', true); },

  /* ---------- WebRTC plumbing ---------- */
  async media(video) {
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } } : false });
  },
  async peer(c) {
    const pc = c.pc = new RTCPeerConnection({ iceServers: await this.iceServers() });
    c.local.getTracks().forEach(t => pc.addTrack(t, c.local));
    c.remote = new MediaStream();
    pc.ontrack = e => { e.streams[0] ? e.streams[0].getTracks().forEach(t => c.remote.addTrack(t)) : c.remote.addTrack(e.track); this.attach(); };
    const f = Cloud.f, cands = f.collection(c.ref, 'cands');
    // The caller's first candidates can appear before the call document exists; hold them until it does.
    c.ready = c.role === 'callee'; c.q = [];
    c.flush = () => { c.ready = true; c.q.splice(0).forEach(j => f.addDoc(cands, { from: c.role, c: j }).catch(() => {})); };
    pc.onicecandidate = e => { if (!e.candidate) return; const j = e.candidate.toJSON(); if (c.ready) f.addDoc(cands, { from: c.role, c: j }).catch(() => {}); else c.q.push(j); };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected' && c.status !== 'live') { c.status = 'live'; c.started = Date.now(); clearTimeout(c.ringTimer); this.tone(null); this.screen(); this.routeCheck(c); }
      if (s === 'failed') { toast('Connection failed — network blocked the call'); this.hangup(); }
      if (s === 'disconnected') { clearTimeout(c.dropTimer); c.dropTimer = setTimeout(() => { if (this.cur === c && pc.connectionState !== 'connected') { toast('Call dropped'); this.hangup(); } }, 12000); }
    };
    return pc;
  },
  listenCands(c, from) {
    const f = Cloud.f;
    c.unsubs.push(f.onSnapshot(f.query(f.collection(c.ref, 'cands'), f.where('from', '==', from)), s => {
      (s.docChanges ? s.docChanges().filter(ch => ch.type === 'added').map(ch => ch.doc) : s.docs).forEach(d => {
        if (!c.seen) c.seen = new Set(); if (c.seen.has(d.id)) return; c.seen.add(d.id);
        c.pc && c.pc.addIceCandidate(d.data().c).catch(() => {});
      });
    }));
  },
  async routeCheck(c) {
    try {
      const st = await c.pc.getStats(); let pair, locals = {};
      st.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = st.get(r.selectedCandidatePairId); if (r.type === 'local-candidate') locals[r.id] = r; });
      if (!pair) st.forEach(r => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
      c.relay = !!(pair && locals[pair.localCandidateId] && locals[pair.localCandidateId].candidateType === 'relay');
      this.screen();
    } catch (e) {}
  },

  /* ---------- end ---------- */
  hangup(silent) {
    const c = this.cur; if (!c) return;
    const f = Cloud.f;
    if (c.status !== 'ended' && f) f.updateDoc(c.ref, { status: c.status === 'ringing' && c.role === 'caller' ? 'missed' : 'ended', endedAt: f.serverTimestamp() }).catch(() => {});
    this.finish('ended', silent);
  },
  finish(why, silent) {
    const c = this.cur; if (!c) return; this.cur = null;
    clearTimeout(c.ringTimer); clearTimeout(c.dropTimer); clearInterval(c.clock); this.tone(null);
    try { navigator.vibrate && navigator.vibrate(0); } catch (e) {}
    c.unsubs.forEach(u => { try { u(); } catch (e) {} });
    try { c.pc && c.pc.close(); } catch (e) {}
    c.local && c.local.getTracks().forEach(t => t.stop());
    const secs = c.started ? Math.round((Date.now() - c.started) / 1000) : 0;
    if (c.relay && secs) this.logRelay(secs, c.video);
    const box = $('#callui'); if (box) box.remove();
    if (!silent) toast({ declined: c.peerName + ' declined', missed: c.role === 'caller' ? 'No answer' : 'Missed call from ' + c.peerName, busy: c.peerName + ' is on another call', ended: secs ? 'Call ended · ' + Calls.dur(secs) : 'Call ended' }[why] || 'Call ended');
  },
  logRelay(secs, video) {
    const f = Cloud.f; if (!f || !f.increment) return;
    const mb = Math.ceil(secs / 60 * (video ? 15 : 1));
    f.setDoc(f.doc(Cloud.db, 'usage', new Date().toISOString().slice(0, 7)), { relayMB: f.increment(mb), relayCalls: f.increment(1), updatedAt: f.serverTimestamp() }, { merge: true }).catch(() => {});
  },
  dur(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },

  /* ---------- sounds ---------- */
  tone(kind) {
    if (this._tone) { clearInterval(this._tone.t); try { this._tone.ctx.close(); } catch (e) {} this._tone = null; }
    if (!kind) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const beep = () => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = kind === 'ring' ? 880 : 425; g.gain.value = kind === 'ring' ? 0.18 : 0.08; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (kind === 'ring' ? 0.35 : 1)); };
      beep(); this._tone = { ctx, t: setInterval(beep, kind === 'ring' ? 1200 : 3000) };
    } catch (e) {}
  },

  /* ---------- call screen ---------- */
  screen() {
    const c = this.cur; if (!c) return;
    let box = $('#callui'); if (!box) { box = document.createElement('div'); box.id = 'callui'; document.body.appendChild(box); }
    const initials = (c.peerName || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const label = { ringing: 'Ringing…', incoming: 'Incoming ' + (c.video ? 'video' : 'voice') + ' call', connecting: 'Connecting…', accepted: 'Connecting…', live: '' }[c.status] || '';
    const live = c.status === 'live';
    box.className = 'callui' + (c.video ? ' video' : '') + (live ? ' live' : '');
    box.innerHTML = `${c.video ? '<video id="cremote" autoplay playsinline></video><video id="clocal" autoplay playsinline muted></video>' : '<audio id="cremote" autoplay></audio>'}
      <div class="call-top"><div class="call-av">${esc(initials)}</div><h2>${esc(c.peerName || 'Batchmate')}</h2><p id="cstat">${live ? '<span id="ctime">0:00</span>' + (c.relay ? ' · via relay' : '') : esc(label)}</p></div>
      <div class="call-ctl">${c.status === 'incoming'
        ? `<button class="cbtn red" data-call="decline" aria-label="Decline">${ic('phoneoff')}</button>${c.video ? `<button class="cbtn green" data-call="accept-voice" aria-label="Answer with voice only">${ic('phone')}</button><button class="cbtn green" data-call="accept-video" aria-label="Answer with video">${ic('video')}</button>` : `<button class="cbtn green" data-call="accept-voice" aria-label="Answer">${ic('phone')}</button>`}`
        : `<button class="cbtn${c.muted ? ' on' : ''}" data-call="mute" aria-label="Mute">${ic(c.muted ? 'micoff' : 'mic')}</button>${c.video ? `<button class="cbtn${c.camOff ? ' on' : ''}" data-call="cam" aria-label="Camera">${ic(c.camOff ? 'videooff' : 'video')}</button><button class="cbtn" data-call="flip" aria-label="Switch camera">${ic('flip')}</button>` : ''}<button class="cbtn red" data-call="end" aria-label="End call">${ic('phoneoff')}</button>`}</div>`;
    box.onclick = e => { const b = e.target.closest('[data-call]'); if (!b) return; e.stopPropagation(); this.ctl(b.dataset.call); };
    this.attach();
    clearInterval(c.clock);
    if (live) c.clock = setInterval(() => { const t = $('#ctime'); if (t) t.textContent = this.dur(Math.round((Date.now() - c.started) / 1000)); }, 1000);
  },
  attach() {
    const c = this.cur; if (!c) return;
    const r = $('#cremote'), l = $('#clocal');
    if (r && c.remote && r.srcObject !== c.remote) { r.srcObject = c.remote; r.play && r.play().catch(() => {}); }
    if (l && c.local && l.srcObject !== c.local) { l.srcObject = c.local; l.play && l.play().catch(() => {}); }
  },
  async ctl(a) {
    const c = this.cur; if (!c) return;
    if (a === 'accept-voice') return this.accept(false);
    if (a === 'accept-video') return this.accept(true);
    if (a === 'decline') return this.decline();
    if (a === 'end') return this.hangup();
    if (a === 'mute') { c.muted = !c.muted; c.local.getAudioTracks().forEach(t => { t.enabled = !c.muted; }); return this.screen(); }
    if (a === 'cam') { c.camOff = !c.camOff; c.local.getVideoTracks().forEach(t => { t.enabled = !c.camOff; }); return this.screen(); }
    if (a === 'flip') {
      c.facing = c.facing === 'environment' ? 'user' : 'environment';
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: c.facing } }), nt = s.getVideoTracks()[0];
        const sender = c.pc.getSenders().find(x => x.track && x.track.kind === 'video'); if (sender) await sender.replaceTrack(nt);
        c.local.getVideoTracks().forEach(t => { c.local.removeTrack(t); t.stop(); }); c.local.addTrack(nt); const l = $('#clocal'); if (l) { l.srcObject = null; this.attach(); }
      } catch (e) { toast('Could not switch camera'); }
    }
  }
};
ACT.bcall = el => Calls.call(el.dataset.id, el.dataset.n, el.dataset.v === '1');
