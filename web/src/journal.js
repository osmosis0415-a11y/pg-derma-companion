/* ===== Journal digest: new dermatology papers summarised for residents =====
   Posts live in Firestore digest/{id}; residents read only published ("live") ones. The admin publishes them from
   admin.html → Journal digest (the bot drafts them daily from PubMed). A copy is cached in the encrypted vault (D.journal)
   so the list works offline. Pictures are openly licensed (credit + licence shown) or the admin's own. */
const Journal = {
  at: 0,
  st() { if (!D.jr) D.jr = { seen: {}, saved: {} }; return D.jr; },
  items() { return D.journal || []; },
  byId(id) { return this.items().find(x => x.id === id); },
  fresh() { const s = this.st(); return this.items().filter(x => !s.seen[x.id]); },
  safeUrl(u) { u = String(u || ''); return /^https:\/\//.test(u) ? u : ''; },
  safeImg(u) { u = String(u || ''); return /^https:\/\//.test(u) || /^data:image\/jpeg;base64,/.test(u) ? u : ''; },
  clean(id, x) {
    const s = (v, n) => String(v == null ? '' : v).slice(0, n), t = v => !v ? 0 : v.toMillis ? v.toMillis() : v.seconds ? v.seconds * 1000 : typeof v === 'number' ? v : Date.parse(v) || 0;
    return { id: 'j_' + id, h: s(x.h, 160), s: s(x.s, 1500), k: (Array.isArray(x.k) ? x.k : []).map(v => s(v, 400)).slice(0, 5), w: s(x.w, 600), lvl: s(x.lvl, 60),
      top: s(x.top || 'Dermatology', 40), j: s(x.j, 120), au: s(x.au, 160), yr: s(x.yr, 4), pmid: s(x.pmid, 12).replace(/\D/g, ''), url: this.safeUrl(x.url),
      img: this.safeImg(x.img), imgCap: s(x.imgCap, 300), imgCredit: s(x.imgCredit, 160), imgLic: s(x.imgLic, 60), imgSrc: this.safeUrl(x.imgSrc), imgKind: s(x.imgKind, 20),
      src: s(x.src, 10), at: t(x.approvedAt) || t(x.createdAt) };
  },
  async pull(force) {
    if (typeof Cloud === 'undefined' || !Cloud.cfg() || !Cloud.user || !Cloud.f) return;
    if (!force && Date.now() - this.at < 5 * 60000) return;
    try {
      const f = Cloud.f, snap = await f.getDocs(f.query(f.collection(Cloud.db, 'digest'), f.where('status', '==', 'live')));
      const list = snap.docs.map(d => this.clean(d.id, d.data())).filter(x => x.h && x.s).sort((a, b) => b.at - a.at).slice(0, 300);
      const was = this.fresh().length; D.journal = list; this.at = Date.now(); Store.save();
      if (this.fresh().length !== was && ['journal', 'home'].includes(ROUTE.path)) render();
    } catch (e) { /* offline or not approved yet — cached list still shows */ }
  },
  cite(x) { return [x.au, [x.j, x.yr].filter(Boolean).join(' ')].filter(Boolean).join(' · '); },
  credit(x) {
    if (!x.img) return '';
    const what = x.imgKind === 'illustrative' ? 'Illustrative image' : x.imgKind === 'paper' ? 'Figure from the paper' : 'Image';
    return `<small class="jcred">${what}${x.imgCredit ? ' · ' + esc(x.imgCredit) : ''}${x.imgLic ? ' · ' + esc(x.imgLic) : ''}${x.imgSrc ? ` · <a href="${esc(x.imgSrc)}" target="_blank" rel="noopener">source</a>` : ''}</small>`;
  },
  cardHTML(x, open) {
    const s = this.st();
    return `<article class="card jcard${s.seen[x.id] ? '' : ' new'}" id="${esc(x.id)}">
      ${x.img ? `<figure class="jfig"><img src="${esc(x.img)}" alt="${esc(x.imgCap || x.top)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()">${x.imgCap ? `<figcaption>${esc(x.imgCap)}</figcaption>` : ''}${this.credit(x)}</figure>` : ''}
      <div class="qtag"><span>${esc(x.lvl || 'Paper')}</span><span>${esc(x.top)}</span>${s.seen[x.id] ? '' : '<span class="fnew">New</span>'}</div>
      <h3 class="jh">${esc(x.h)}</h3><small class="muted">${esc(this.cite(x))}</small>
      <p class="jsum">${esc(x.s)}</p>
      ${open ? `${x.k.length ? `<ul class="jkp">${x.k.map(k => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}${x.w ? `<div class="jtake"><b>What it means for you</b><p>${esc(x.w)}</p></div>` : ''}`
        : `<button class="link small" data-act="jopen" data-id="${esc(x.id)}">Key points & take-home ›</button>`}
      <div class="jbtns">${x.url ? `<a class="btn sm ghost" href="${esc(x.url)}" target="_blank" rel="noopener">Read the paper ↗</a>` : ''}
        <button class="btn sm ghost" data-act="jsave" data-id="${esc(x.id)}">${ic(s.saved[x.id] ? 'heartfill' : 'heart')} ${s.saved[x.id] ? 'Saved' : 'Save'}</button>
        <button class="btn sm ghost" data-act="jshare" data-id="${esc(x.id)}">${ic('send')} Share</button></div>
    </article>`;
  },
  /* one compact card for the swipe feed */
  feedHTML(x, i) {
    return `<section class="fcard t-news" data-i="${i}" data-id="${esc(x.id)}"><div class="ftop"><span>Journal</span><span>${esc(x.top)}</span>${x.lvl ? `<span>${esc(x.lvl)}</span>` : ''}</div>
      <div class="fbody">${x.img ? `<img class="fimg" src="${esc(x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<h2>${esc(x.h)}</h2><p class="fptxt">${esc(x.s.slice(0, x.img ? 260 : 520))}${x.s.length > (x.img ? 260 : 520) ? '…' : ''}</p>
      <small class="fcite">${esc(this.cite(x))}</small><a class="ftap" href="#/journal?id=${encodeURIComponent(x.id)}">Key points & take-home ›</a></div></section>`;
  },
  /* pick unseen posts for the feed, newest first */
  feedPick() { const used = this._fused || (this._fused = new Set()), x = this.fresh().concat(this.items()).find(y => !used.has(y.id)); if (x) used.add(x.id); return x; }
};

function vJournal() {
  const s = Journal.st(), all = Journal.items(), q = ROUTE.q || {}, filt = q.f || 'all';
  setTitle('Journal digest', true, `<button class="icon" data-act="jrefresh" aria-label="Refresh">${ic('refresh')}</button>`);
  const tops = [...new Set(all.map(x => x.top))].sort();
  let list = filt === 'saved' ? all.filter(x => s.saved[x.id]) : filt === 'all' ? all : all.filter(x => x.top === filt);
  const signedIn = typeof Cloud !== 'undefined' && Cloud.user;
  main().innerHTML = `<p class="small muted">New dermatology papers, summarised for residents. Always read the paper before changing practice.</p>
    ${all.length ? `<div class="chips jchips"><a class="chip${filt === 'all' ? ' on' : ''}" href="#/journal">All (${all.length})</a><a class="chip${filt === 'saved' ? ' on' : ''}" href="#/journal?f=saved">Saved (${Object.keys(s.saved).filter(id => Journal.byId(id)).length})</a>${tops.map(t => `<a class="chip${filt === t ? ' on' : ''}" href="#/journal?f=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : ''}
    ${list.map(x => Journal.cardHTML(x, q.id === x.id || list.length === 1)).join('') || `<section class="card empty"><p class="muted">${!all.length ? (signedIn ? 'No papers published yet. New ones arrive after admin review.' : 'Sign in (Batch hub) to receive the journal digest.') : 'Nothing here yet.'}</p></section>`}
    <p class="tiny muted center">Summaries are written with AI from the PubMed abstract and checked by the admin. Pictures are the author's figure (open-access papers only) or openly licensed images, with credit.</p>`;
  // mark what is on screen as read
  for (const x of list) s.seen[x.id] = 1; Store.save();
  if (q.id) setTimeout(() => { const el = document.getElementById(q.id); el && el.scrollIntoView({ block: 'start' }); }, 50);
  Journal.pull();
}
ACT.jopen = el => { const card = document.getElementById(el.dataset.id), x = Journal.byId(el.dataset.id); if (card && x) card.outerHTML = Journal.cardHTML(x, true); };
ACT.jsave = el => { const s = Journal.st(), id = el.dataset.id; if (s.saved[id]) delete s.saved[id]; else s.saved[id] = 1; Store.save(); el.innerHTML = `${ic(s.saved[id] ? 'heartfill' : 'heart')} ${s.saved[id] ? 'Saved' : 'Save'}`; };
ACT.jshare = el => { const x = Journal.byId(el.dataset.id); if (!x) return; const t = `${x.h}\n${Journal.cite(x)}\n\n${x.s}\n${x.url ? '\nPaper: ' + x.url : ''}\n\nvia PG Derma ${location.origin + location.pathname}#/journal`;
  if (navigator.share) navigator.share({ text: t }).catch(() => {}); else window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank'); };
ACT.jrefresh = () => { Journal.pull(true).then(() => { toast('Up to date'); render(); }); };
