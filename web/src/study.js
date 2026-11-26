/* ===== Study: daily set, streak, spaced-repetition flashcards, spot diagnosis, one-liners =====
   Progress lives in the encrypted vault (D.study) and follows the user through Drive sync.
   Content = STUDY_BANK (shipped) + approved bot content from Firestore content/{id} (cached in D.studyCloud).
   Only a tiny summary (streak, last study day, reminder time) is written to Firestore study/{uid}, so the
   reminder bot knows whom to nudge. */
const STUDY_TYPES = { mcq: 'MCQ', card: 'Flashcard', spot: 'Spot diagnosis', pearl: 'One-liner' };
const Study = {
  sess: null,
  st() {
    if (!D.study) D.study = { goal: 10, streak: 0, best: 0, last: '', start: today(), done: {}, ans: {}, srs: {}, seen: {}, saved: {}, remind: { on: false, hour: 20 } };
    return D.study;
  },
  all() {
    const ids = new Set(), out = [];
    for (const x of STUDY_BANK.concat(D.studyCloud || [])) if (x && x.id && !ids.has(x.id) && STUDY_TYPES[x.t]) { ids.add(x.id); out.push(x); }
    return out;
  },
  byId(id) { return this.all().find(x => x.id === id); },
  doneToday() { return this.st().done[today()] || 0; },
  dueCards() { const s = this.st(), t = today(); return this.all().filter(x => x.t === 'card' && s.srs[x.id] && s.srs[x.id].due <= t); },
  fresh(type) { const s = this.st(); return this.all().filter(x => x.t === type && !s.seen[x.id]); },
  wrong() { const s = this.st(); return this.all().filter(x => x.t === 'mcq' && s.ans[x.id] === 0); },
  /* streak is "alive" if the goal was met today or yesterday */
  streakNow() { const s = this.st(); return (s.last === today() || s.last === addDays(today(), -1)) ? s.streak : 0; },

  /* ---------- building sessions ---------- */
  pick(arr, n) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); },
  dailySet() {
    const s = this.st(), goal = Math.max(5, s.goal || 10), out = [], add = arr => { for (const x of arr) if (out.length < goal && !out.includes(x)) out.push(x); };
    add(this.dueCards().slice(0, Math.ceil(goal * 0.3)));
    add(this.pick(this.fresh('mcq'), Math.ceil(goal * 0.3)));
    add(this.pick(this.fresh('spot'), 1));
    add(this.pick(this.fresh('card'), Math.ceil(goal * 0.2)));
    add(this.pick(this.fresh('pearl'), goal));
    add(this.pick(this.wrong(), goal));
    add(this.pick(this.all().filter(x => x.t !== 'card'), goal));
    return this.pick(out, out.length).sort((a, b) => (a.t === 'pearl') - (b.t === 'pearl'));
  },
  build(mode, top) {
    const all = this.all().filter(x => !top || x.top === top);
    if (mode === 'daily') return this.dailySet();
    if (mode === 'cards') { const due = this.dueCards().filter(x => !top || x.top === top); return due.length ? due.slice(0, 30) : this.pick(all.filter(x => x.t === 'card' && !this.st().srs[x.id]), 15); }
    if (mode === 'wrong') return this.pick(this.wrong(), 20);
    if (mode === 'saved') return this.all().filter(x => this.st().saved[x.id]);
    if (STUDY_TYPES[mode]) { const f = all.filter(x => x.t === mode), n = f.filter(x => !this.st().seen[x.id]); return this.pick(n.length >= 5 ? n : f, mode === 'pearl' ? 20 : 10); }
    return this.pick(all, 10);
  },
  begin(mode, top) {
    const items = this.build(mode, top);
    if (!items.length) { toast(mode === 'cards' ? 'No flashcards due — come back tomorrow' : mode === 'wrong' ? 'No mistakes to review' : 'Nothing here yet'); return false; }
    this.sess = { mode, top, items, i: 0, right: 0, answered: 0, revealed: false, pick: null };
    return true;
  },

  /* ---------- recording progress ---------- */
  touch(x, correct) {
    const s = this.st(), t = today();
    s.seen[x.id] = 1; if (typeof Comm !== 'undefined') Comm.addXP(1);
    if (x.t === 'mcq' || x.t === 'spot') s.ans[x.id] = correct ? 1 : 0;
    const before = s.done[t] || 0; s.done[t] = before + 1;
    for (const d of Object.keys(s.done)) if (d < addDays(t, -60)) delete s.done[d];
    let hit = false;
    if (before < s.goal && s.done[t] >= s.goal && s.last !== t) {
      s.streak = s.last === addDays(t, -1) ? (s.streak || 0) + 1 : 1; s.best = Math.max(s.best || 0, s.streak); s.last = t; hit = true;
      this.push();
    }
    Store.save(); return hit;
  },
  /* SM-2 style scheduling. q: 0 again, 3 hard, 4 good, 5 easy */
  grade(x, q) {
    const s = this.st(), c = s.srs[x.id] || { n: 0, iv: 0, ef: 2.5 };
    if (q < 3) { c.n = 0; c.iv = 1; }
    else { c.n += 1; c.iv = c.n === 1 ? 1 : c.n === 2 ? (q === 5 ? 4 : 3) : Math.round(c.iv * c.ef * (q === 3 ? 0.8 : q === 5 ? 1.3 : 1)); }
    c.ef = Math.max(1.3, c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    c.iv = Math.min(c.iv, 365); c.due = addDays(today(), q < 3 ? 0 : c.iv); s.srs[x.id] = c;
    return this.touch(x, q >= 3);
  },

  /* ---------- cloud: approved content in, tiny streak summary out ---------- */
  async pull() {
    if (!Cloud.cfg() || !Cloud.user) return;
    try {
      const f = Cloud.f, snap = await f.getDocs(f.query(f.collection(Cloud.db, 'content'), f.where('status', '==', 'live')));
      const items = snap.docs.map(d => Object.assign({}, d.data(), { id: 'x_' + d.id })).filter(x => STUDY_TYPES[x.t]);
      const clean = items.map(x => { const o = { id: x.id, t: x.t, top: String(x.top || 'General').slice(0, 40), src: 'bot' };
        for (const k of ['q', 'x', 'r', 'f', 'b', 'v', 'dx', 'p']) if (x[k] != null) o[k] = String(x[k]).slice(0, 2000);
        if (x.t === 'mcq') { o.o = (x.o || []).map(String).slice(0, 6); o.a = +x.a || 0; }
        return o; }).filter(o => o.t !== 'mcq' || (o.q && o.o.length >= 2 && o.a < o.o.length));
      const was = (D.studyCloud || []).length; D.studyCloud = clean; Store.save();
      if (clean.length > was && ROUTE.path === 'study') render();
      return clean.length - was;
    } catch (e) { /* offline or not approved yet — shipped bank still works */ }
  },
  push() {
    if (!Cloud.cfg() || !Cloud.user || !Cloud.f) return;
    const s = this.st(), f = Cloud.f;
    f.setDoc(f.doc(Cloud.db, 'study', Cloud.user.uid), { name: (D.settings.name || Cloud.user.displayName || '').slice(0, 80), email: Cloud.user.email || '', streak: this.streakNow(), last: s.last || '', goal: s.goal, remind: !!(s.remind && s.remind.on), hour: (s.remind && s.remind.hour) || 20, tz: 'Asia/Kolkata', updatedAt: f.serverTimestamp() }).catch(() => {});
  }
};

/* ---------- Study hub ---------- */
function vStudy() {
  const s = Study.st(), n = Study.doneToday(), goal = s.goal, streak = Study.streakNow(), due = Study.dueCards().length;
  const all = Study.all(), cnt = t => all.filter(x => x.t === t).length, seenN = all.filter(x => s.seen[x.id]).length;
  const pc = Math.min(100, Math.round(n / goal * 100)), wrong = Study.wrong().length, saved = Object.keys(s.saved).length;
  const tops = [...new Set(all.map(x => x.top))].sort();
  setTitle('Study', false, `<a class="icon" href="#/study-set" aria-label="Study settings">${ic('settings')}</a>`);
  const week = []; for (let i = 6; i >= 0; i--) { const d = addDays(today(), -i); week.push({ d, ok: (s.done[d] || 0) >= goal, some: (s.done[d] || 0) > 0 }); }
  main().innerHTML = `<a class="feedcta" href="#/feed"><span>${ic('reels')}</span><div><b>Scroll the feed</b><small>Endless swipe-up cards · MCQs, pearls, spots, flashcards</small></div>›</a>
  <section class="card streakcard">
    <div class="sk-top"><div class="flame${streak ? ' on' : ''}">${ic('flame')}<b>${streak}</b></div><div><h2>${streak ? streak + '-day streak' : 'Start a streak today'}</h2><p class="small muted">${n >= goal ? 'Today\'s goal done. See you tomorrow!' : `${goal - n} more to keep it going`} · best ${s.best || 0}</p></div></div>
    <div class="wk">${week.map(w => `<span class="${w.ok ? 'ok' : w.some ? 'some' : ''}${w.d === today() ? ' td' : ''}"><i></i>${'SMTWTFS'[new Date(w.d).getDay()]}</span>`).join('')}</div>
    <div class="bar big"><i style="width:${pc}%" class="${pc >= 100 ? 'ok' : ''}"></i></div><p class="small muted" style="margin:6px 0 12px">${n} / ${goal} today</p>
    <button class="btn wide" data-act="studygo" data-m="daily">${n >= goal ? 'Do a bonus set' : n ? 'Continue today\'s set' : 'Start today\'s set'}</button></section>
  <div class="modes">
    <a data-act="studygo" data-m="cards">${ic('cards')}<b>Flashcards</b><small>${due ? due + ' due now' : cnt('card') + ' cards'}</small></a>
    <a data-act="studygo" data-m="mcq">${ic('check')}<b>MCQs</b><small>${cnt('mcq')} questions</small></a>
    <a data-act="studygo" data-m="spot">${ic('search')}<b>Spot diagnosis</b><small>${cnt('spot')} cases</small></a>
    <a data-act="studygo" data-m="pearl">${ic('bolt')}<b>One-liners</b><small>${cnt('pearl')} pearls</small></a>
    <a data-act="studygo" data-m="wrong">${ic('refresh')}<b>Mistakes</b><small>${wrong} to retry</small></a>
    <a data-act="studygo" data-m="saved">${ic('heart')}<b>Saved</b><small>${saved} items</small></a>
  </div>
  <section class="card"><div class="row between"><h3>Topics</h3><small class="muted">${seenN}/${all.length} seen</small></div>
    <div class="topics">${tops.map((t, ti) => { const it = all.filter(x => x.top === t), sn = it.filter(x => s.seen[x.id]).length; return `<a data-act="studygo" data-m="topic" data-top="${esc(t)}"${ti >= 6 ? ' class="tmore" hidden' : ''}><span>${esc(t)}</span><small>${sn}/${it.length}</small><span class="bar"><i style="width:${Math.round(sn / it.length * 100)}%"></i></span></a>`; }).join('')}</div>${tops.length > 6 ? `<button class="btn sm ghost wide" data-act="topicsall">All ${tops.length} topics</button>` : ''}</section>
  ${!(s.remind && s.remind.on) ? `<a class="card hint" href="#/study-set">${ic('bell')} <span><b>Set a daily reminder</b><small class="muted"> so the streak doesn't slip</small></span></a>` : ''}
  <p class="small muted center">Content reviewed from standard texts (Rook, Fitzpatrick, IADVL). New items arrive after admin review. Always verify before clinical use.</p>`;
  Study.pull();
}
ACT.studygo = el => { if (Study.begin(el.dataset.m, el.dataset.top)) go('#/study-run'); };

/* ---------- session runner ---------- */
function vStudyRun() {
  const S = Study.sess; if (!S) return go('#/study');
  if (S.i >= S.items.length) return studyDone();
  const x = S.items[S.i], s = Study.st(), saved = !!s.saved[x.id];
  setTitle(`${S.i + 1} / ${S.items.length}`, true, `<button class="icon" data-act="studysave" aria-label="${saved ? 'Unsave' : 'Save'}">${ic(saved ? 'heartfill' : 'heart')}</button>`);
  const tag = `<div class="qtag"><span>${STUDY_TYPES[x.t]}</span><span>${esc(x.top)}</span>${x.src === 'bot' ? '<span>New</span>' : ''}</div>`;
  const prog = `<div class="qprog"><i style="width:${Math.round(S.i / S.items.length * 100)}%"></i></div>`;
  let body = '';
  if (x.t === 'mcq') {
    body = `<h2 class="qq">${esc(x.q)}</h2><div class="opts">${x.o.map((o, i) => { let c = ''; if (S.revealed) c = i === x.a ? ' right' : i === S.pick ? ' wrong' : ' dim'; return `<button class="opt${c}" data-act="studyans" data-i="${i}" ${S.revealed ? 'disabled' : ''}><b>${'ABCDEF'[i]}</b>${esc(o)}</button>`; }).join('')}</div>
      ${S.revealed ? `<div class="expl ${S.pick === x.a ? 'ok' : 'no'}"><b>${S.pick === x.a ? 'Correct' : 'Answer: ' + 'ABCDEF'[x.a]}</b><p>${esc(x.x || '')}</p>${x.r ? `<small>${esc(x.r)}</small>` : ''}</div><button class="btn wide" data-act="studynext">Next</button>` : ''}`;
  } else if (x.t === 'card') {
    body = `<div class="flash${S.revealed ? ' back' : ''}"><h2>${esc(x.f)}</h2>${S.revealed ? `<hr><p class="pre">${esc(x.b)}</p>` : ''}</div>
      ${S.revealed ? `<p class="small muted center">How well did you know it?</p><div class="grades"><button class="btn ghost" data-act="studygrade" data-q="0">Again<small>today</small></button><button class="btn ghost" data-act="studygrade" data-q="3">Hard</button><button class="btn ghost" data-act="studygrade" data-q="4">Good</button><button class="btn ghost" data-act="studygrade" data-q="5">Easy</button></div>`
        : `<button class="btn wide" data-act="studyreveal">Show answer</button>`}`;
  } else if (x.t === 'spot') {
    body = `<div class="flash spot"><small class="muted">Clinical vignette</small><h2>${esc(x.v)}</h2></div>
      ${S.revealed ? `<div class="expl"><b>${esc(x.dx)}</b><p>${esc(x.x || '')}</p></div><div class="grades two"><button class="btn ghost" data-act="studyspot" data-ok="0">I missed it</button><button class="btn" data-act="studyspot" data-ok="1">I got it</button></div>`
        : `<input id="spotguess" placeholder="Your diagnosis (optional)" autocomplete="off"><button class="btn wide" data-act="studyreveal">Reveal diagnosis</button>`}`;
  } else {
    body = `<div class="flash pearl">${ic('bolt')}<h2>${esc(x.p)}</h2></div><button class="btn wide" data-act="studynext">Got it</button>`;
  }
  main().innerHTML = prog + tag + body + `<button class="link small center endsess" data-act="studyquit">End session</button>`;
  if (S.guess && $('#spotguess')) $('#spotguess').value = S.guess;
}
function studyAdvance(hit) {
  const S = Study.sess; S.i++; S.revealed = false; S.pick = null; S.guess = '';
  if (hit) { S.hit = true; studyCelebrate(); }
  render();
}
function studyCelebrate() {
  try { navigator.vibrate && navigator.vibrate([60, 40, 120]); } catch (e) {}
  toast(`Daily goal done · ${Study.streakNow()}-day streak`);
}
function studyDone() {
  const S = Study.sess, s = Study.st();
  setTitle('Session done', true);
  const pc = S.answered ? Math.round(S.right / S.answered * 100) : null;
  main().innerHTML = `<section class="card donecard"><div class="flame big on">${ic('flame')}<b>${Study.streakNow()}</b></div>
    <h2>${S.hit ? 'Streak extended!' : Study.doneToday() >= s.goal ? 'Goal already done today' : 'Nice work'}</h2>
    <p class="muted">${S.items.length} items${pc != null ? ` · ${S.right}/${S.answered} correct (${pc}%)` : ''} · ${Study.doneToday()} today</p>
    <div class="btnrow center"><button class="btn" data-act="studygo" data-m="${S.mode === 'daily' ? 'daily' : S.mode}" ${S.top ? `data-top="${esc(S.top)}"` : ''}>${S.mode === 'daily' ? 'Bonus set' : 'Another round'}</button><a class="btn ghost" href="#/study">Back to Study</a></div></section>`;
}
ACT.studyans = el => { const S = Study.sess, x = S.items[S.i]; if (S.revealed) return; S.pick = +el.dataset.i; S.revealed = true; S.answered++; if (S.pick === x.a) S.right++; S.pendingHit = Study.touch(x, S.pick === x.a); render(); };
ACT.studynext = () => { const S = Study.sess, x = S.items[S.i]; let hit = S.pendingHit; S.pendingHit = false; if (x.t === 'pearl') hit = Study.touch(x, true); studyAdvance(hit); };
ACT.studyreveal = () => { const S = Study.sess; S.guess = $('#spotguess') ? $('#spotguess').value : ''; S.revealed = true; render(); };
ACT.studygrade = el => { const S = Study.sess; studyAdvance(Study.grade(S.items[S.i], +el.dataset.q)); };
ACT.studyspot = el => { const S = Study.sess, ok = el.dataset.ok === '1'; S.answered++; if (ok) S.right++; studyAdvance(Study.touch(S.items[S.i], ok)); };
ACT.studysave = () => { const S = Study.sess, x = S.items[S.i], s = Study.st(); if (s.saved[x.id]) delete s.saved[x.id]; else s.saved[x.id] = 1; Store.save(); toast(s.saved[x.id] ? 'Saved' : 'Removed from saved'); render(); };
ACT.studyquit = () => { Study.sess = null; go('#/study'); };

/* ---------- settings: daily goal + reminder ---------- */
function vStudySet() {
  const s = Study.st(), r = s.remind || { on: false, hour: 20 };
  setTitle('Study settings', true);
  const hours = []; for (let h = 5; h <= 23; h++) hours.push(h);
  const hl = h => (h % 12 || 12) + (h < 12 ? ' am' : ' pm');
  main().innerHTML = `<div class="card form"><h3>Daily goal</h3><p class="small muted">Items per day to keep your streak.</p>
    ${chips('sgoal', [['5', '5 · light'], ['10', '10 · steady'], ['20', '20 · serious'], ['30', '30 · exam mode']], String(s.goal))}</div>
  <div class="card form"><h3>Daily reminder</h3>
    <label class="row"><input type="checkbox" id="sr_on" ${r.on ? 'checked' : ''}> <span>Email me if I haven't studied by</span></label>
    <select id="sr_hour">${hours.map(h => `<option value="${h}" ${h === r.hour ? 'selected' : ''}>${hl(h)}</option>`).join('')}</select>
    <p class="small muted">Sent to ${esc(Cloud.user?.email || 'your Google email')} only on days you haven't met your goal. Times are India time.</p>
    <button class="btn" data-act="studysetsave">Save</button>
    <hr><p class="small">Prefer a phone alarm? Add a repeating calendar reminder:</p><button class="btn sm ghost" data-act="studycal">${ic('calendar')} Add to Google Calendar</button></div>`;
}
ACT.studysetsave = () => {
  const s = Study.st(); s.goal = +getChips('sgoal') || s.goal; s.remind = { on: $('#sr_on').checked, hour: +$('#sr_hour').value };
  if (s.remind.on && !Cloud.user) toast('Sign in (Batch hub) so the reminder can reach you');
  Store.save(); Study.push(); toast('Saved'); go('#/study');
};
ACT.studycal = () => {
  const h = +($('#sr_hour') || {}).value || 20, d = new Date(); d.setHours(h, 0, 0, 0);
  const p = n => String(n).padStart(2, '0'), stamp = x => `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}T${p(x.getHours())}${p(x.getMinutes())}00`;
  const e = new Date(d.getTime() + 15 * 60000), url = location.origin + location.pathname + '#/study';
  window.open('https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('PG Derma — daily study set') + '&details=' + encodeURIComponent('Keep your streak: ' + url) + '&dates=' + stamp(d) + '/' + stamp(e) + '&ctz=Asia/Kolkata&recur=' + encodeURIComponent('RRULE:FREQ=DAILY'), '_blank');
};

/* ---------- Feed: endless full-screen swipe-up knowledge cards ---------- */
const FEED_TINT = { mcq: 't-mcq', card: 't-card', spot: 't-spot', pearl: 't-pearl' };
const Feed = {
  q: [], n: 0, right: 0, answered: 0, io: null, viewT: {}, recent: [],
  next(k) {
    if (typeof Rank !== 'undefined') return this.nextRanked(k);
    const s = Study.st(), all = Study.all(), out = [], used = new Set(this.recent.slice(-60));
    const pool = t => all.filter(x => x.t === t && !used.has(x.id));
    const due = Study.dueCards().filter(x => !used.has(x.id));
    const freshFirst = arr => { const f = arr.filter(x => !s.seen[x.id]); return Study.pick(f.length ? f : arr, arr.length); };
    const bags = { pearl: freshFirst(pool('pearl')), mcq: freshFirst(pool('mcq')), card: due.concat(freshFirst(pool('card').filter(x => !due.includes(x)))), spot: freshFirst(pool('spot')) };
    const weights = [['pearl', 4], ['mcq', 3], ['card', 2], ['spot', 1]];
    for (let i = 0; i < k; i++) {
      let r = Math.random() * 10, t = 'pearl'; for (const [ty, w] of weights) { if ((r -= w) < 0) { t = ty; break; } }
      const x = (bags[t].length ? bags[t] : bags.pearl.length ? bags.pearl : bags.mcq).shift(); if (!x) break;
      out.push(x); this.recent.push(x.id); used.add(x.id);
    }
    return out;
  },
  /* Ranked mix: spaced-repetition due cards first, then types/topics weighted by what you engage with and get wrong,
     plus a peer case from the community every few cards (unseen, highest "for you" score). */
  nextRanked(k) {
    const used = new Set(this.recent.slice(-80)), all = Study.all().filter(x => !used.has(x.id)), weak = Rank.weak(), now = Date.now(), tw = Rank.typeWeights();
    const due = Study.dueCards().filter(x => !used.has(x.id));
    const scored = all.map(x => [x, Rank.itemScore(x, weak, now) * (tw[x.t] || 1)]).sort((a, b) => b[1] - a[1]).map(a => a[0]);
    if (this.startId) { const f = Study.byId(this.startId); this.startId = null; if (f) scored.unshift(f); }
    const peers = typeof Comm !== 'undefined' ? Rank.rankPosts(Comm.posts.filter(p => !Rank.aff().seenP[p.id] && !used.has('post:' + p.id))) : [];
    const out = [];
    for (let i = 0; i < k; i++) {
      this.slot = (this.slot || 0) + 1;
      let x = null;
      if (this.slot % 6 === 0 && peers.length) { const p = peers.shift(); x = Object.assign({ t: 'post', id: 'post:' + p.id, top: (p.tags || [])[0] || POST_KINDS[p.kind] }, { post: p }); }
      else if (due.length && this.slot % 3 === 1) x = due.shift();
      else { const pool = scored.filter(y => !out.includes(y) && !used.has(y.id)); x = pool[Math.floor(Math.random() * Math.min(3, pool.length))]; }
      if (!x) break; out.push(x); this.recent.push(x.id); used.add(x.id);
    }
    return out;
  },
  cardHTML(x, i) {
    if (x.t === 'post') { const p = x.post; return `<section class="fcard t-post" data-i="${i}" data-id="${esc(x.id)}"><div class="ftop"><span>Community</span><span>${esc(POST_KINDS[p.kind] || 'Post')}</span>${(p.tags || []).slice(0, 1).map(t => `<span>${esc(t)}</span>`).join('')}</div>
      <div class="fbody"><div class="fwho"><span class="pav">${esc(initials(p.name))}</span><b>${esc(p.name)}</b><small>${esc(p.year || '')} · ${agoTxt(tsMs(p.createdAt))}</small></div>${p.img ? `<img class="fimg" src="${esc(p.img)}" alt="">` : ''}<p class="fptxt">${esc((p.text || '').slice(0, p.img ? 260 : 600))}</p><a class="ftap" href="#/post/${p.id}">${ic('chat')} ${p.comments || 0} · Join the discussion</a></div>
      <div class="frail"><button data-flike="${p.id}" class="${Comm.liked[p.id] ? 'on' : ''}" aria-label="Like">${ic(Comm.liked[p.id] ? 'heartfill' : 'heart')}<small>${p.likes || 0}</small></button></div><i class="fburst">${ic('heartfill')}</i></section>`; }
    const s = Study.st(), sv = !!s.saved[x.id];
    let body = '';
    if (x.t === 'mcq') body = `<h2>${esc(x.q)}</h2><div class="fopts">${x.o.map((o, j) => `<button class="fopt" data-fa="${j}"><b>${'ABCDEF'[j]}</b>${esc(o)}</button>`).join('')}</div><div class="fexp" hidden><p>${esc(x.x || '')}</p>${x.r ? `<small>${esc(x.r)}</small>` : ''}</div>`;
    else if (x.t === 'card') body = `<h2>${esc(x.f)}</h2><div class="fback" hidden><p class="pre">${esc(x.b)}</p><div class="fgr"><button data-fg="0">Again</button><button data-fg="3">Hard</button><button data-fg="4">Good</button><button data-fg="5">Easy</button></div></div><button class="ftap" data-flip="1">Tap to reveal</button>`;
    else if (x.t === 'spot') body = `<small class="fk">What's the diagnosis?</small><h2 class="fv">${esc(x.v)}</h2><div class="fback" hidden><h3>${esc(x.dx)}</h3><p>${esc(x.x || '')}</p><div class="fgr two"><button data-fs="0">I missed it</button><button data-fs="1">I got it</button></div></div><button class="ftap" data-flip="1">Reveal diagnosis</button>`;
    else body = `<div class="fbolt">${ic('bolt')}</div><h2 class="fpearl">${esc(x.p)}</h2>`;
    return `<section class="fcard ${FEED_TINT[x.t]}" data-i="${i}" data-id="${esc(x.id)}">
      <div class="ftop"><span>${STUDY_TYPES[x.t]}</span><span>${esc(x.top)}</span>${x.src === 'bot' ? '<span>New</span>' : ''}${!s.seen[x.id] ? '<span class="fnew">First time</span>' : ''}</div>
      <div class="fbody">${body}</div>
      <div class="frail"><button data-fsave="1" class="${sv ? 'on' : ''}" aria-label="Save">${ic(sv ? 'heartfill' : 'heart')}<small>Save</small></button><button data-fdisc="1" aria-label="Discuss">${ic('chat')}<small>Discuss</small></button><button data-fshare="1" aria-label="Share">${ic('send')}<small>Share</small></button></div>
      <div class="fhint">${i === 0 ? 'Swipe up for the next card' : ''}</div><i class="fburst">${ic('heartfill')}</i></section>`;
  },
  checkpointHTML() {
    const pc = this.answered ? Math.round(this.right / this.answered * 100) : 0;
    return `<section class="fcard t-check"><div class="fbody center"><div class="flame big on">${ic('flame')}<b>${Study.streakNow()}</b></div><h2>${this.n} cards this session</h2><p>${this.answered ? `${this.right}/${this.answered} correct · ${pc}%` : 'Keep the streak burning'}</p><p class="small">${Study.doneToday()} today · goal ${Study.st().goal}</p><p class="fhint2">Swipe up to keep going</p></div></section>`;
  },
  append(k) {
    const box = $('#feedlist'); if (!box) return;
    const items = this.next(k); if (!items.length) return;
    if (typeof Journal !== 'undefined') for (let p = 3; p < items.length; p += 8) { const j = Journal.feedPick(); if (j) items.splice(p, 0, Object.assign({ t: 'news' }, j)); }
    const html = items.map(x => { const i = this.q.length; this.q.push(x); let h = x.t === 'news' ? Journal.feedHTML(x, i) : this.cardHTML(x, i); if (this.q.length % 15 === 0) h += this.checkpointHTML(); return h; }).join('');
    box.insertAdjacentHTML('beforeend', html);
    $$('#feedlist .fcard:not([data-obs])').forEach(el => { el.dataset.obs = 1; this.io.observe(el); });
  },
  stat() {
    const b = $('#fstat'); if (!b) return; const s = Study.st(), n = Study.doneToday();
    b.innerHTML = `<span class="flame${Study.streakNow() ? ' on' : ''}">${ic('flame')}<b>${Study.streakNow()}</b></span><span class="fgoal"><i style="width:${Math.min(100, n / s.goal * 100)}%"></i></span><small>${n}/${s.goal}</small>`;
  },
  count(x, correct) {
    const hit = Study.touch(x, correct); this.n++;
    if (hit) { const t = $('#fstat'); if (t) { t.classList.add('pop'); setTimeout(() => t.classList.remove('pop'), 900); } studyCelebrate(); }
    this.stat();
  },
  open() {
    if (typeof Comm !== 'undefined' && Cloud.cfg()) Cloud.init().then(() => Comm.listen()).catch(() => {});
    $('#feedui')?.remove(); if (typeof Journal !== 'undefined') Journal._fused = null; this.q = []; this.n = 0; this.right = 0; this.answered = 0; this.viewT = {};
    const ui = document.createElement('div'); ui.id = 'feedui';
    ui.innerHTML = `<div class="fbar"><button class="fx" data-fclose="1" aria-label="Close">‹</button><b class="fbrand">${logoSvg()}Feed</b><div id="fstat"></div></div><div id="feedlist"></div>`;
    document.body.appendChild(ui); document.body.classList.add('feedon');
    this.io = new IntersectionObserver(es => es.forEach(e => {
      const el = e.target, id = el.dataset.id;
      if (e.isIntersecting && e.intersectionRatio > 0.6) {
        if (+el.dataset.i >= this.q.length - 4) this.append(10);
        this.inT = this.inT || {}; this.inT[id] = Date.now();
        if (id && !el.dataset.counted) { const x = this.q[+el.dataset.i]; if (x && x.t === 'pearl') this.viewT[id] = setTimeout(() => { if (!el.dataset.counted) { el.dataset.counted = 1; this.count(x, true); } }, 1500); }
      } else if (id) { clearTimeout(this.viewT[id]); if (this.inT && this.inT[id] && typeof Rank !== 'undefined') { const ms = Date.now() - this.inT[id]; delete this.inT[id]; const x = this.q[+el.dataset.i]; if (x) { if (x.t === 'news') { Rank.dwell(x, ms); if (ms > 2500) { Journal.st().seen[x.id] = 1; } } else if (x.t === 'post') { Rank.dwell(Object.assign({ top: x.top, t: x.post.kind }, x.post), ms); if (ms > 1500) Rank.seenPost(x.post.id); } else Rank.dwell(x, ms); } } }
    }), { threshold: [0, 0.6, 1] });
    this.stat(); this.append(12);
    ui.addEventListener('click', e => this.click(e));
    let lastTap = 0; ui.addEventListener('pointerup', e => { const c = e.target.closest('.fcard'); if (!c || e.target.closest('button,a')) return; const t = Date.now(); if (t - lastTap < 300) { const lb = c.querySelector('[data-flike]'); if (lb) lb.click(); else this.save(c, true); } lastTap = t; });
  },
  close() { this.io && this.io.disconnect(); $('#feedui')?.remove(); document.body.classList.remove('feedon'); },
  save(c, only) {
    const s = Study.st(), id = c.dataset.id; if (!id || /^j_/.test(id)) return;
    if (only && s.saved[id]) { c.classList.add('burst'); setTimeout(() => c.classList.remove('burst'), 700); return; }
    if (s.saved[id]) delete s.saved[id]; else { s.saved[id] = 1; c.classList.add('burst'); setTimeout(() => c.classList.remove('burst'), 700); }
    Store.save(); const b = c.querySelector('[data-fsave]'); if (b) { b.classList.toggle('on', !!s.saved[id]); b.innerHTML = ic(s.saved[id] ? 'heartfill' : 'heart') + '<small>Save</small>'; }
  },
  click(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.fclose) return history.length > 1 ? history.back() : go('#/study');
    const c = b.closest('.fcard'); if (!c) return; const x = this.q[+c.dataset.i]; if (!x) return;
    if (b.dataset.flike) { const p = Comm.posts.find(y => y.id === b.dataset.flike); if (p && !Comm.liked[p.id]) { Rank.liked(p); Comm.like(p.id); b.classList.add('on'); b.innerHTML = ic('heartfill') + `<small>${(p.likes || 0)}</small>`; c.classList.add('burst'); setTimeout(() => c.classList.remove('burst'), 700); } return; }
    if (b.dataset.fsave) { if (typeof Rank !== 'undefined') Rank.bump('top', x.top, 2); return this.save(c); }
    if (b.dataset.fdisc) return openCardThread(x.id, x.q || x.f || x.v || x.p || '');
    if (b.dataset.fshare) { const txt = x.t === 'mcq' ? `${x.q}\n${x.o.map((o, j) => 'ABCDEF'[j] + ') ' + o).join('\n')}\n\nAnswer in PG Derma` : x.t === 'card' ? `${x.f}\n\n${x.b}` : x.t === 'spot' ? `${x.v}\n\nDiagnosis? (answer in PG Derma)` : x.p;
      const full = txt + '\n' + location.origin + location.pathname; if (navigator.share) navigator.share({ text: full }).catch(() => {}); else window.open('https://wa.me/?text=' + encodeURIComponent(full), '_blank'); return; }
    if (b.dataset.fa != null && !c.dataset.counted) {
      const j = +b.dataset.fa, ok = j === x.a; c.dataset.counted = 1; this.answered++; if (ok) this.right++;
      c.querySelectorAll('.fopt').forEach((o, k) => { o.disabled = true; o.classList.add(k === x.a ? 'right' : k === j ? 'wrong' : 'dim'); });
      const ex = c.querySelector('.fexp'); ex.hidden = false; ex.classList.add(ok ? 'ok' : 'no'); ex.insertAdjacentHTML('afterbegin', `<b>${ok ? 'Correct' : 'Answer: ' + 'ABCDEF'[x.a]}</b>`);
      try { navigator.vibrate && navigator.vibrate(ok ? 20 : [30, 40, 30]); } catch (er) {}
      return this.count(x, ok);
    }
    if (b.dataset.flip) { c.querySelector('.fback').hidden = false; b.remove(); return; }
    if (b.dataset.fg != null && !c.dataset.counted) { c.dataset.counted = 1; const q = +b.dataset.fg, hit = Study.grade(x, q); this.n++; if (hit) studyCelebrate(); this.stat(); c.querySelector('.fgr').innerHTML = `<small>Next review: ${q < 3 ? 'later today' : fmt(Study.st().srs[x.id].due)}</small>`; return; }
    if (b.dataset.fs != null && !c.dataset.counted) { c.dataset.counted = 1; const ok = b.dataset.fs === '1'; this.answered++; if (ok) this.right++; c.querySelector('.fgr').innerHTML = `<small>${ok ? 'Nice.' : 'Saved to review.'}</small>`; if (!ok) Study.st().saved[x.id] = 1; return this.count(x, ok); }
  }
};
function vFeed() { setTitle('Feed', true); main().innerHTML = ''; Feed.open(); }

ACT.topicsall = el => { $$('.topics .tmore').forEach(a => a.hidden = false); el.remove(); };
