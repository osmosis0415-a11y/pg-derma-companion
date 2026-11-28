/* ===== UI shell, router & clinical views ===== */
const main = () => $('#main');
let ROUTE = { path: '', q: {} };
const go = h => { location.hash = h; };
const setTitle = (t, back = true, actions = '') => { $('#title').textContent = t; $('#title').classList.remove('brandmark'); $('#back').style.visibility = back ? 'visible' : 'hidden'; $('#topact').innerHTML = actions; };
const optList = (opts, sel) => opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`; }).join('');
const chips = (name, opts, sel, multi = false, cls = '') => `<div class="chips ${cls}" data-group="${name}" data-multi="${multi ? 1 : 0}">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; const on = multi ? (sel || []).includes(v) : sel === v; return `<button type="button" class="chip${on ? ' on' : ''}" data-v="${esc(v)}">${esc(l)}</button>`; }).join('')}</div>`;
const getChips = (name, root = document) => { const g = $(`[data-group="${name}"]`, root); if (!g) return null; const on = $$('.chip.on', g).map(c => c.dataset.v); return g.dataset.multi === '1' ? on : (on[0] ?? ''); };
const mic = id => SR ? `<button type="button" class="mic" data-act="mic" data-for="${id}" aria-label="Dictate">🎤</button>` : '';
const val = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
const empty = (t, sub = '') => `<div class="empty"><div>${t}</div>${sub ? `<small>${sub}</small>` : ''}</div>`;
/* In-app dialogs. window.confirm/prompt are blocked in some installed apps and embedded browsers
   ("prompt() is not supported"), so every question goes through this instead. */
function askDialog({ msg, input = false, value = '', placeholder = '', type = 'text', ok = 'OK', danger = false, word = '' }) {
  return new Promise(res => {
    const d = document.createElement('div'); d.className = 'dlg';
    const field = input || word ? `<input class="dlg-in" type="${type}" ${type === 'password' ? 'inputmode="numeric" autocomplete="off"' : 'autocomplete="off"'} placeholder="${esc(word ? 'Type ' + word : placeholder)}" value="${esc(value)}">` : '';
    d.innerHTML = `<div class="dlg-box" role="dialog" aria-modal="true"><p>${esc(msg).replace(/\n/g, '<br>')}</p>${field}<div class="dlg-btns"><button type="button" class="btn ghost" data-r="0">Cancel</button><button type="button" class="btn${danger ? ' danger' : ''}" data-r="1">${esc(ok)}</button></div></div>`;
    document.body.appendChild(d);
    const inp = d.querySelector('.dlg-in'), okb = d.querySelector('[data-r="1"]');
    if (word) { okb.disabled = true; inp.addEventListener('input', () => { okb.disabled = inp.value.trim().toUpperCase() !== word; }); }
    let settled = false; const done = r => { if (settled) return; settled = true; d.remove(); res(r); };
    d.addEventListener('click', e => { e.stopPropagation(); if (e.target === d) return done(null); const b = e.target.closest('[data-r]'); if (!b || b.disabled) return; done(b.dataset.r === '1' ? (inp && !word ? inp.value : true) : null); });
    d.addEventListener('keydown', e => { if (e.key === 'Escape') done(null); else if (e.key === 'Enter' && !okb.disabled) { e.preventDefault(); okb.click(); } });
    setTimeout(() => (inp || okb).focus(), 30);
  });
}
const DANGER_RE = /^(Sign out|Delete|Remove|Revoke|Reject|Leave|Restore|Stop)\b/;
const uiConfirm = (msg, o = {}) => { const m = msg.match(DANGER_RE); return askDialog(Object.assign({ msg, danger: !!m, ok: m ? m[1] : 'OK' }, o)).then(r => r === true); };
const uiPrompt = (msg, value = '', o = {}) => askDialog(Object.assign({ msg, input: true, value }, o)).then(r => r === null ? null : String(r));
const uiType = (msg, word, o = {}) => askDialog(Object.assign({ msg, word, danger: true, ok: word === 'DELETE' ? 'Delete' : word.charAt(0) + word.slice(1).toLowerCase() }, o)).then(r => r === true);
function openSheet(html) { $('#sheet .sheet-body').innerHTML = html; $('#sheet').classList.add('open'); }
function closeSheet() { $('#sheet').classList.remove('open'); }
const ACT = {};

/* ---------- Derived: thesis schedule & due items ---------- */
const wkLabel = w => (+w === 0 ? 'Baseline' : 'W' + w);
function thesisSchedule(p) {
  if (!D.thesis || !p.arm || !p.enrolled) return [];
  const vs = visitsOf(p.id);
  return D.thesis.weeks.map(w => { const label = wkLabel(w); return { w, label, due: addDays(p.enrolled, w * 7), visit: vs.find(v => v.label === label) }; });
}
function dueItems(horizon = 0) {
  const t = today(), lim = addDays(t, horizon), out = [];
  for (const r of D.reminders) if (!r.done && r.date <= lim) out.push({ kind: 'rem', date: r.date, title: r.type, sub: ptLabel(P(r.pid)) + (r.note ? ' · ' + r.note : ''), href: r.pid ? '#/patient/' + r.pid : '#/cal', id: r.id });
  for (const p of D.patients) if (p.arm && !p.dropout) for (const s of thesisSchedule(p)) if (!s.visit && s.due <= addDays(lim, 3)) out.push({ kind: 'thesis', date: s.due, title: 'Thesis ' + s.label + ' (' + p.arm + ')', sub: ptLabel(p), href: '#/patient/' + p.id });
  for (const i of D.inv) if (i.status === 'sent') { const d = addDays(i.sent, INV_DAYS[i.type] ?? 5); if (d <= lim) out.push({ kind: 'inv', date: d, title: 'Trace: ' + i.type, sub: ptLabel(P(i.pid)), href: '#/inv' }); }
  for (const e of (D.batch?.events || [])) if (e.date >= t && e.date <= lim) out.push({ kind: 'batch', date: e.date, title: e.type + ': ' + e.title, sub: [e.time, e.venue, e.presenter].filter(Boolean).join(' · ') || D.batch.name, href: '#/batch' });
  for (const i of D.inv) if (i.status === 'traced') { const d = addDays(i.traced || i.sent, 2); if (d <= lim) out.push({ kind: 'inv', date: d, title: 'Correlate: ' + i.type, sub: ptLabel(P(i.pid)) + ' — update final diagnosis', href: '#/inv?c=traced' }); }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
const dueBadge = d => { const k = daysBetween(today(), d); return k < 0 ? `<span class="badge red">${-k}d overdue</span>` : k === 0 ? '<span class="badge amber">Today</span>' : `<span class="badge">in ${k}d</span>`; };

/* ---------- HOME ---------- */
/* ---------- HOME: Instagram-style stories + feed ---------- */
const initials = t => String(t || '?').replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
const nbadge = n => n ? `<b class="nb">${n > 99 ? '99+' : n}</b>` : '';
function vHome() {
  const due = dueItems(0), unread = typeof Chat !== 'undefined' ? Chat.unread() : 0, t = today();
  setTitle('PG Derma', false, `<a class="icon topic" href="#/cal" aria-label="Reminders due">${ic('bell')}${nbadge(due.length)}</a><a class="icon topic" href="#/batch?t=chat" aria-label="Batch discussion">${ic('chat')}${nbadge(unread)}</a>`);
  $('#title').classList.add('brandmark'); $('#title').insertAdjacentHTML('afterbegin', logoSvg());
  const yr = residencyYear(new Date()), hr = new Date().getHours();
  const first = (D.settings.name || '').replace(/^Dr\.?\s+/i, '').split(/\s+/)[0];
  const hello = (hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening') + (first ? ', Dr. ' + first : '');
  const overdue = due.filter(d => d.date < t).length;
  const kindIc = { rem: 'bell', thesis: 'grad', inv: 'flask', batch: 'users' };
  // progress
  const perf = D.logbook.filter(l => l.role === 'Performed').length;
  const tgt = PROCEDURES.reduce((a, p) => a + (procTarget(p[0]) || 0), 0);
  const thA = D.patients.filter(p => p.arm === 'Case' && !p.dropout).length, thB = D.patients.filter(p => p.arm === 'Control' && !p.dropout).length;
  const thT = (+D.settings.sampleCase || 0) + (+D.settings.sampleControl || 0);
  const invOpen = D.inv.filter(i => i.status !== 'correlated').length;
  const prog = (href, icon, label, n, of, sub) => { const pc = of ? Math.min(100, Math.round(n / of * 100)) : 0;
    return `<a class="pg" href="${href}"><span class="pgi">${ic(icon)}</span><span class="pgb"><span class="row between"><b>${esc(label)}</b><small>${of ? n + ' / ' + of : esc(sub || '')}</small></span>${of ? `<span class="bar"><i style="width:${pc}%" class="${pc >= 100 ? 'ok' : ''}"></i></span>` : ''}</span></a>`; };
  const quick = [AppCfg.home === 'bento' ? ['#/inv', 'flask', 'Reports'] : ['#/add', 'plus', 'New case'], ['#/logadd', 'book', 'Log procedure'], ['#/vault', 'image', 'Photos'], ['#/formulary', 'pill', 'Formulary']];
  const online = D.batch && typeof Calls !== 'undefined' ? (D.batch.members || []).filter(m => m.id !== Cloud.user?.uid && Calls.isOnline(m.id)) : [];
  const recent = [...D.visits].sort((a, b) => (b.created || b.date).localeCompare(a.created || a.date)).slice(0, 4);
  const sd = typeof Study !== 'undefined' ? { n: Study.doneToday(), g: Study.st().goal, k: Study.streakNow(), due: Study.dueCards().length } : null;

  const arrow = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
  const jn = typeof Journal !== 'undefined' && Journal.items().length ? Journal.items()[0] : null;
  const slides = [
    sd ? { tag: 'Study set', t: sd.n >= sd.g ? 'Goal done — streak safe' : sd.k ? `Keep your ${sd.k}-day streak` : "Today's study set", s: `${sd.n}/${sd.g} done${sd.due ? ' · ' + sd.due + ' flashcards due' : ''}`, cta: sd.n ? 'Continue' : 'Start', h: '#/study' } : null,
    { tag: 'Feed', t: 'Scroll swipe-up dermatology cards', s: 'Pearls, MCQs, spotters and flashcards', cta: 'Open feed', h: '#/feed' },
    due.length ? { tag: 'Due today', t: `${due.length} thing${due.length > 1 ? 's' : ''} due${overdue ? ' · ' + overdue + ' overdue' : ''}`, s: due[0].title, cta: 'See all', h: '#/cal' } : null,
    jn ? { tag: 'Journal digest', t: jn.h, s: 'New papers summarised for residents', cta: 'Read', h: '#/journal' } : null,
    D.thesis ? { tag: 'Thesis', t: `Recruitment ${thA + thB}${thT ? ' / ' + thT : ''}`, s: 'Cases and controls enrolled', cta: 'Continue', h: '#/thesis' } : null
  ].filter(Boolean);
  const heroHTML = AppCfg.home === 'classic' ? `<section class="ahero"><i class="hb1"></i><i class="hb2"></i><span class="hpill"><i></i>${esc(yr)} · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span><h2>${esc(hello)}</h2><p>${due.length ? `<b>${due.length}</b> thing${due.length > 1 ? 's' : ''} due today` : 'All clear today'}${sd ? ` · <b>${sd.n}/${sd.g}</b> study cards` : ''}</p>
  ${sd ? `<a class="card studyhome" href="#/study"><div class="flame${sd.k ? ' on' : ''}">${ic('flame')}<b>${sd.k}</b></div><div class="sh"><b>${sd.n >= sd.g ? 'Goal done — streak safe' : sd.k ? 'Keep your ' + sd.k + '-day streak' : 'Today\'s study set'}</b><small class="muted">${sd.n}/${sd.g} done${sd.due ? ' · ' + sd.due + ' flashcards due' : ''}</small><span class="bar"><i style="width:${Math.min(100, Math.round(sd.n / sd.g * 100))}%" class="${sd.n >= sd.g ? 'ok' : ''}"></i></span></div><span class="btn sm">${sd.n >= sd.g ? 'Bonus' : sd.n ? 'Continue' : 'Start'}</span></a>` : ''}</section>` : `<section class="bento">
    <span class="bdate">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · ${esc(yr)}</span>
    <h2 class="bhello">${esc(hello)}.</h2>
    <div class="btile btop" id="bcar">${slides.map((x, i) => `<a class="bslide${i ? '' : ' on'}" href="${x.h}" data-i="${i}"><small>${esc(x.tag)}</small><b>${esc(x.t)}</b><span>${esc(x.s || '')}</span><em class="bpill">${esc(x.cta)} ${arrow}</em></a>`).join('')}
      <div class="bdots">${slides.map((x, i) => `<button class="${i ? '' : 'on'}" data-bdot="${i}" aria-label="Show card ${i + 1}"><i></i></button>`).join('')}</div></div>
    <div class="bsplit">
      <a class="btile bgoal" href="${sd ? '#/study' : '#/feed'}"><small>Daily goal</small><b>${sd ? sd.n : 0}<i>/${sd ? sd.g : 0}</i></b><span>study cards</span><span class="bbar"><i style="width:${sd ? Math.min(100, Math.round(sd.n / sd.g * 100)) : 0}%"></i></span><em class="bpill">${sd && sd.n ? 'Continue' : 'Start'} ${arrow}</em></a>
      <div class="bcol">
        <a class="btile bstreak" href="#/study"><small>Streak</small><b>${sd ? sd.k : 0} day${sd && sd.k === 1 ? '' : 's'}</b><span>${sd && sd.due ? sd.due + ' flashcards due' : 'Study daily to grow it'}</span><em class="bround">${arrow}</em></a>
        <a class="btile bquiz" href="#/feed"><small>Quick quiz</small><b>Swipe feed</b><span>MCQs · spotters</span><em class="bround">${arrow}</em></a>
      </div>
    </div>
    <a class="btile bstrip" href="${due.length ? '#/cal' : '#/add'}"><span><small>${due.length ? 'Due today' : 'Quick add'}</small><b>${due.length ? esc(due[0].title) : 'New OPD case'}</b></span><em class="bround">${arrow}</em></a>
  </section>`;
  main().innerHTML = `${heroHTML}
  ${typeof usageAskHTML === 'function' ? usageAskHTML() : ''}
  ${(!D.settings.lastBackup || daysBetween(ymd(D.settings.lastBackup), t) > 7) && !(Gate.cached && !(D.sync && D.sync.on) && !D.settings.backupNudgeOff) ? `<a class="warn" href="#/settings">No backup in the last 7 days — tap to back up</a>` : ''}
  ${Gate.cached && !(D.sync && D.sync.on) && !D.settings.backupNudgeOff ? `<div class="card backupnudge"><span class="bi">${ic('cloud')}</span><div><b>Log in on any phone with just your PIN</b><small class="muted">Turn on the encrypted Google Drive backup. On a new phone, enter your PIN and everything comes back.</small><div class="btnrow"><button class="btn sm" data-act="driveconnect">Turn on backup</button><button class="btn sm ghost" data-act="nudgeoff">Later</button></div></div></div>` : ''}
  ${AppCfg.home === 'classic' && typeof Journal !== 'undefined' && Journal.items().length ? (() => { const jn = Journal.fresh().length, j0 = Journal.items()[0]; return `<a class="card jhome" href="#/journal"><span class="jhi">${ic('news')}</span><span class="sh"><b>Journal digest${jn ? ' · ' + jn + ' new' : ''}</b><small class="muted">${esc(j0.h)}</small></span>›</a>`; })() : ''}
  <section class="card today"><div class="row between"><h3>Today</h3><a class="link" href="#/cal">See all ›</a></div>
    ${due.length ? `<p class="small muted">${due.length} due${overdue ? ` · <b class="od">${overdue} overdue</b>` : ''}</p><div class="tlist">${due.slice(0, 4).map(d => `<a class="ti" href="${d.href}"><span class="tic k-${d.kind}">${ic(kindIc[d.kind] || 'calendar')}</span><span class="tib"><b>${esc(d.title)}</b><small>${esc(d.sub || '')}</small></span><small class="${d.date < t ? 'od' : 'muted'}">${d.date < t ? fmt(d.date) : 'Today'}</small></a>`).join('')}</div>`
      : `<p class="muted small">Nothing due today. Follow-ups, thesis visits and report tracing show up here.</p>`}</section>
  <section class="card"><h3>Your progress</h3>
    ${prog('#/logbook', 'book', 'Logbook · performed', perf, tgt)}
    ${D.thesis ? prog('#/thesis', 'grad', 'Thesis recruitment', thA + thB, thT) : prog('#/thesis-setup', 'grad', 'Thesis', 0, 0, 'Set up ›')}
    ${prog('#/inv', 'flask', 'Reports to trace', invOpen, 0, invOpen ? invOpen + ' open' : 'All clear')}
  </section>
  <div class="quick">${quick.map(([h, i, l]) => `<a href="${h}"><span>${ic(i)}</span>${esc(l)}</a>`).join('')}</div>
  ${D.batch ? `<section class="card batchrow"><div class="row between"><h3>${esc(D.batch.name || 'Your batch')}</h3><a class="link" href="#/batch">Open ›</a></div>
    <div class="row between"><span class="small muted">${online.length ? online.length + ' online · ' + esc(online.slice(0, 3).map(m => (m.name || '').split(' ')[0]).join(', ')) : 'No one online right now'}${unread ? ' · ' + unread + ' new messages' : ''}</span>
    ${typeof Calls !== 'undefined' && Calls.allowed && online.length ? `<a class="btn sm ghost" href="#/batch?t=mem">${ic('video')} Call</a>` : ''}</div></section>`
    : `<a class="card batchrow link" href="#/batch"><b>Join your batch</b><small class="muted"> — discuss cases, share calendar, compare logbooks</small></a>`}
  <div class="row between feedhead"><h3>Recent cases</h3><a class="link" href="#/patients">All patients ›</a></div>
  <div class="list">${recent.map(v => { const p = P(v.pid); if (!p) return ''; const dx = (v.dx || []).join(', ') || (p.dx || []).join(', ');
    return `<a class="li" href="#/visit/${v.id}"><div class="row" style="gap:10px"><span class="pav sm">${esc(initials(p.name || p.uhid))}</span><div><b>${esc(ptLabel(p))}</b><small>${esc(dx || v.label || '')} · ${fmt(v.date)}</small></div></div>›</a>`; }).join('')
    || `<p class="muted small">No cases yet — tap <b>${AppCfg.home === 'bento' ? 'Quick add' : 'New case'}</b> above. Everything stays encrypted on this phone.</p>`}</div>
`;
  bentoStart();
}
/* Bento home: carousel auto-advances; dots switch cards. */
let bentoTimer = null;
function bentoShow(i) { const c = $('#bcar'); if (!c) { clearInterval(bentoTimer); return; } const sl = $$('#bcar .bslide'); if (!sl.length) return; i = (i + sl.length) % sl.length; sl.forEach((x, k) => x.classList.toggle('on', k === i)); $$('#bcar [data-bdot]').forEach((x, k) => x.classList.toggle('on', k === i)); c.dataset.cur = i; }
function bentoStart() { clearInterval(bentoTimer); if (!$('#bcar') || matchMedia('(prefers-reduced-motion: reduce)').matches) return; bentoTimer = setInterval(() => { const c = $('#bcar'); if (!c || document.hidden) { if (!c) clearInterval(bentoTimer); return; } bentoShow(+(c.dataset.cur || 0) + 1); }, 6000); }
document.addEventListener('click', e => { const b = e.target.closest('[data-bdot]'); if (!b) return; e.preventDefault(); bentoShow(+b.dataset.bdot); bentoStart(); });
/* ---------- PATIENTS LIST ---------- */
function patientListHTML(q = '', bucket = '') {
  const s = q.toLowerCase();
  const last = {}; for (const v of D.visits) if (!last[v.pid] || v.date > last[v.pid]) last[v.pid] = v.date;
  const list = D.patients.filter(p => (!s || [p.uhid, p.name, p.phone, (p.dx || []).join(' ')].join(' ').toLowerCase().includes(s)) && (!bucket || (p.buckets || []).includes(bucket)))
    .sort((a, b) => (last[b.id] || '').localeCompare(last[a.id] || ''));
  return list.length ? list.map(p => `<a class="li${ROUTE.path === 'patient' && ROUTE.id === p.id ? ' sel' : ''}" href="#/patient/${p.id}"><div><b>${esc(p.uhid)}</b> ${p.name ? '· ' + esc(p.name) : ''}<small>${esc([p.age && p.age + 'y', p.sex, p.fst && 'FST ' + p.fst].filter(Boolean).join(' · '))} ${(p.buckets || []).filter(b => b !== 'Routine').map(b => `<span class="tag">${esc(b)}</span>`).join('')}</small></div><small class="muted">${last[p.id] ? fmt(last[p.id]) : ''}</small></a>`).join('') : empty('No patients found');
}
function vPatients() {
  setTitle('Patients', false);
  main().innerHTML = `<div class="search"><input id="ps" type="search" placeholder="Search UHID, name, diagnosis…" value="${esc(ROUTE.q.s || '')}"></div>
  ${chips('pb', [['', 'All'], ...BUCKETS.map(b => [b, b])], ROUTE.q.b || '', false, 'scroll')}
  <div id="plist" class="list">${patientListHTML(ROUTE.q.s || '', ROUTE.q.b || '')}</div>`;
  const upd = () => { $('#plist').innerHTML = patientListHTML(val('ps'), getChips('pb')); };
  $('#ps').addEventListener('input', upd); $('[data-group="pb"]').addEventListener('click', () => setTimeout(upd));
}

/* ---------- QUICK ADD (30-second capture) ---------- */
function vAdd() {
  const ex = ROUTE.q.pid ? P(ROUTE.q.pid) : null;
  setTitle(ex ? 'New visit' : 'Quick add');
  const allDx = [...DX.D, ...DX.V, ...DX.L, ...DX.A];
  const fav = (D.settings.favDx || ['Psoriasis', 'Dermatophytosis (Tinea)', 'Acne vulgaris', 'Vitiligo', 'Melasma', 'Scabies', 'Urticaria', 'Atopic dermatitis', 'Alopecia areata', 'Leprosy – BT']);
  main().innerHTML = `<form id="qa" class="form" autocomplete="off">
  <label>UHID / OPD no. *<div class="inrow"><input id="q_uhid" required value="${esc(ex?.uhid || '')}" placeholder="e.g. 2026-123456" inputmode="text">${'BarcodeDetector' in window ? '<button type="button" class="mic" data-act="scan" aria-label="Scan barcode">▥</button>' : ''}</div></label>
  <div id="exnote"></div>
  <div class="grid2"><label>Name (optional)<div class="inrow"><input id="q_name" value="${esc(ex?.name || '')}">${mic('q_name')}</div></label>
  <label>Phone (for WhatsApp)<input id="q_phone" type="tel" inputmode="tel" value="${esc(ex?.phone || '')}"></label></div>
  <div class="grid2"><label>Age<input id="q_age" type="number" inputmode="numeric" min="0" max="120" value="${esc(ex?.age || '')}"></label>
  <label>Sex${chips('q_sex', ['M', 'F', 'O'], ex?.sex || '')}</label></div>
  <label>Fitzpatrick skin type${chips('q_fst', FST, ex?.fst || '')}</label>
  <label>Safety flags${chips('q_flags', ['Pregnant', 'Lactating', 'G6PD deficient', 'Diabetic', 'HIV+', 'On anticoagulants'], ex?.flags || [], true)}</label>
  <label>Drug allergies${chips('q_all', ['None known', 'Sulfa', 'Penicillin', 'NSAIDs', 'Cotrimoxazole', 'Carbamazepine'], ex?.allergies || [], true)}<input id="q_allx" placeholder="Other allergy…" value="${esc(ex?.allergyOther || '')}"></label>
  <label>Diagnosis<input id="q_dxs" list="dxlist" placeholder="Search diagnosis & press Add"><datalist id="dxlist">${allDx.map(d => `<option value="${esc(d)}">`).join('')}</datalist></label>
  <div class="row"><button type="button" class="btn sm ghost" data-act="dxadd">Add</button></div>
  <div id="dxsel" class="chips">${''}</div>
  ${chips('q_dxfav', fav, [], true, 'scroll')}
  <label>Academic buckets${chips('q_bk', BUCKETS, ex?.buckets || ['Routine'], true)}</label>
  <label>Clinical notes<div class="inrow"><textarea id="q_notes" rows="2" placeholder="Brief findings…"></textarea>${mic('q_notes')}</div></label>
  <label>Follow-up in${chips('q_fu', [['', 'None'], ['7', '1 wk'], ['14', '2 wk'], ['28', '4 wk'], ['42', '6 wk'], ['90', '3 mo']], '')}</label>
  <div class="actions sticky">
    <button type="button" class="btn ghost" data-act="qasave" data-then="next">Save & next</button>
    <button type="button" class="btn ghost" data-act="qasave" data-then="photo">+ Photo</button>
    <button type="button" class="btn" data-act="qasave" data-then="open">Save</button>
  </div></form>`;
  const chk = () => { const u = val('q_uhid').toLowerCase(); const p = u && D.patients.find(x => x.uhid.toLowerCase() === u); $('#exnote').innerHTML = p && !ex ? `<p class="info">Existing patient (${esc(ptLabel(p))}) — this will be saved as a new visit. <a href="#/add?pid=${p.id}">Load details</a></p>` : ''; };
  $('#q_uhid').addEventListener('input', chk);
  $('#q_uhid').focus();
}
ACT.dxadd = () => { const v = val('q_dxs'); if (!v) return; const box = $('#dxsel'); if (![...box.children].some(c => c.dataset.v === v)) box.insertAdjacentHTML('beforeend', `<button type="button" class="chip on" data-v="${esc(v)}">${esc(v)} ✕</button>`); $('#q_dxs').value = ''; };
ACT.qasave = async btn => {
  const uhid = val('q_uhid'); if (!uhid) { toast('UHID is required'); $('#q_uhid').focus(); return; }
  let p = D.patients.find(x => x.uhid.toLowerCase() === uhid.toLowerCase());
  const isNew = !p; if (isNew) { p = { id: uid(), uhid, created: new Date().toISOString(), buckets: [] }; D.patients.push(p); }
  const dx = [...$$('#dxsel .chip.on').map(c => c.dataset.v), ...getChips('q_dxfav')];
  Object.assign(p, { name: val('q_name') || p.name || '', phone: val('q_phone') || p.phone || '', age: +val('q_age') || p.age || '', sex: getChips('q_sex') || p.sex || '', fst: getChips('q_fst') || p.fst || '', flags: getChips('q_flags'), allergies: getChips('q_all'), allergyOther: val('q_allx') });
  const bk = getChips('q_bk'); p.buckets = [...new Set([...(p.buckets || []).filter(b => b !== 'Routine' || bk.includes('Routine')), ...bk])];
  if (dx.length) p.dx = [...new Set([...(p.dx || []), ...dx])];
  if (D.thesis && !p.arm && (bk.includes('Thesis Case') || bk.includes('Thesis Control'))) { p.arm = bk.includes('Thesis Case') ? 'Case' : 'Control'; p.enrolled = today(); p.studyId = nextStudyId(); }
  const sched = thesisSchedule(p), nextS = sched.find(s => !s.visit);
  const nVis = visitsOf(p.id).length;
  const v = { id: uid(), pid: p.id, date: today(), created: new Date().toISOString(), label: nextS ? nextS.label : (nVis ? 'Visit ' + (nVis + 1) : 'First visit'), dx, notes: val('q_notes'), crf: {}, ae: [] };
  D.visits.push(v);
  const fu = getChips('q_fu'); if (fu) D.reminders.push({ id: uid(), pid: p.id, type: p.arm ? 'Thesis follow-up' : 'Review visit', date: addDays(today(), +fu), note: dx.join(', '), done: false });
  Store.save();
  const then = btn.dataset.then;
  toast(isNew ? 'Patient saved' : 'Visit added');
  if (then === 'photo') go('#/cam/' + v.id); else if (then === 'next') { go('#/add?r=' + Date.now()); } else go('#/visit/' + v.id);
};
/* Scan the UHID barcode / QR on the OPD slip (Android Chrome BarcodeDetector, on-device) */
let scanStream = null;
ACT.scan = async () => {
  openSheet(`<h3>Scan OPD slip barcode</h3><div class="camwrap" style="aspect-ratio:4/3"><video id="sv" playsinline muted autoplay></video></div><p class="small muted">Point at the barcode or QR code on the slip.</p><div class="actions"><button class="btn ghost" data-act="scanstop">Cancel</button></div>`);
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const vid = $('#sv'); vid.srcObject = scanStream; await vid.play().catch(() => {});
    const det = new BarcodeDetector();
    const loop = async () => {
      if (!scanStream) return;
      try { const r = await det.detect(vid); if (r.length) { $('#q_uhid').value = r[0].rawValue.trim(); $('#q_uhid').dispatchEvent(new Event('input')); ACT.scanstop(); toast('UHID scanned'); return; } } catch (e) {}
      setTimeout(loop, 250);
    };
    loop();
  } catch (e) { ACT.scanstop(); toast('Camera unavailable for scanning'); }
};
ACT.scanstop = () => { if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; } closeSheet(); };
function nextStudyId() { const n = D.patients.reduce((m, p) => Math.max(m, parseInt((p.studyId || '').replace(/\D/g, '')) || 0), 0) + 1; return 'T' + String(n).padStart(3, '0'); }

/* ---------- PATIENT ---------- */
function patientDetailHTML(p) {
  const vs = visitsOf(p.id).reverse(), ph = photosOf(p.id), sched = thesisSchedule(p);
  const flags = [...(p.flags || []), ...(p.allergies || []).filter(a => a !== 'None known').map(a => 'Allergy: ' + a), p.allergyOther && 'Allergy: ' + p.allergyOther].filter(Boolean);
  return `<div class="card phead">
    <div class="row between"><div><h2>${esc(p.uhid)}</h2><div class="muted">${esc([p.name, p.age && p.age + ' y', p.sex, p.fst && 'FST ' + p.fst].filter(Boolean).join(' · '))}</div></div>
    <button class="icon" data-act="editpt" data-id="${p.id}" aria-label="Edit patient">${ic('edit')}</button></div>
    ${flags.length ? `<div class="flags">${flags.map(f => `<span class="flag">${esc(f)}</span>`).join('')}</div>` : ''}
    <div>${(p.buckets || []).map(b => `<span class="tag">${esc(b)}</span>`).join('')} ${p.arm ? `<span class="tag strong">${esc(p.studyId || '')} · ${esc(p.arm)}</span>` : ''}</div>
    ${(p.dx || []).length ? `<p class="small"><b>Dx:</b> ${esc(p.dx.join(', '))}</p>` : ''}
    <div class="btnrow">
      <a class="btn sm" href="#/add?pid=${p.id}">+ Visit</a>
      <a class="btn sm ghost" href="#/wa/${p.id}">WhatsApp</a>
      <button class="btn sm ghost" data-act="remadd" data-pid="${p.id}">Reminder</button>
      ${ph.length > 1 ? `<a class="btn sm ghost" href="#/compare/${p.id}">Compare</a>` : ''}
      <button class="btn sm ghost" data-act="invadd" data-pid="${p.id}">Investigation</button>
    </div>
  </div>
  ${sched.length ? `<div class="card"><h3>Thesis schedule ${p.dropout ? '<span class="badge red">Dropout</span>' : ''}</h3><div class="sched">${sched.map(s => `<div class="sitem ${s.visit ? 'done' : s.due < today() ? 'late' : ''}"><b>${s.label}</b><small>${fmt(s.due)}</small>${s.visit ? `<a href="#/visit/${s.visit.id}">✓ open</a>` : `<a href="#/add?pid=${p.id}">record</a>`}</div>`).join('')}</div>
   <label class="row small"><input type="checkbox" data-act="dropout" data-id="${p.id}" ${p.dropout ? 'checked' : ''}> Mark as dropout / lost to follow-up</label></div>` : ''}
  ${ph.length ? `<div class="card"><div class="row between"><h3>Photos (${ph.length})</h3><a class="link" href="#/vault?pid=${p.id}">All ›</a></div><div class="thumbs">${ph.slice(-8).reverse().map(x => `<a href="#/photo/${x.id}"><img data-pid="${x.id}" data-thumb="1" alt=""><small>${esc(x.cat)}</small></a>`).join('')}</div></div>` : ''}
  <div class="card"><h3>Visits</h3>${vs.map(v => { const sc = D.scores.filter(s => s.vid === v.id); return `<a class="li" href="#/visit/${v.id}"><div><b>${esc(v.label)}</b> <small class="muted">${fmt(v.date)}</small><small>${esc((v.dx || []).join(', '))}${sc.length ? ' · ' + sc.map(s => s.scale + ' ' + s.total).join(', ') : ''}</small></div><span>›</span></a>`; }).join('') || '<p class="muted">No visits</p>'}</div>
  <button class="btn danger ghost sm" data-act="delpt" data-id="${p.id}">Delete patient</button>`;
}
function vPatient() {
  const p = P(ROUTE.id); if (!p) return go('#/patients');
  setTitle(p.uhid);
  const wide = innerWidth >= 900;
  main().innerHTML = wide ? `<div class="split"><aside class="list">${patientListHTML()}</aside><section>${patientDetailHTML(p)}</section></div>` : patientDetailHTML(p);
  hydrateImgs();
}
ACT.dropout = el => { const p = P(el.dataset.id); p.dropout = el.checked; Store.save(); toast(el.checked ? 'Marked dropout' : 'Dropout cleared'); };
ACT.delpt = async el => { if (!(await uiConfirm('Delete this patient with all visits, scores and photos? This cannot be undone.'))) return; const id = el.dataset.id; const vids = D.visits.filter(v => v.pid === id).map(v => v.id); for (const ph of D.photos.filter(x => x.pid === id)) await deletePhoto(ph.id); D.patients = D.patients.filter(p => p.id !== id); D.visits = D.visits.filter(v => v.pid !== id); D.scores = D.scores.filter(s => !vids.includes(s.vid)); D.pins = D.pins.filter(s => !vids.includes(s.vid)); D.inv = D.inv.filter(i => i.pid !== id); D.reminders = D.reminders.filter(r => r.pid !== id); D.logbook.forEach(l => { if (l.pid === id) l.pid = null; }); Store.save(); go('#/patients'); };
ACT.editpt = el => {
  const p = P(el.dataset.id);
  openSheet(`<h3>Edit patient</h3><div class="form">
  <label>UHID<input id="e_uhid" value="${esc(p.uhid)}"></label><label>Name<input id="e_name" value="${esc(p.name || '')}"></label>
  <div class="grid2"><label>Age<input id="e_age" type="number" value="${esc(p.age || '')}"></label><label>Phone<input id="e_phone" type="tel" value="${esc(p.phone || '')}"></label></div>
  <label>Sex${chips('e_sex', ['M', 'F', 'O'], p.sex)}</label><label>FST${chips('e_fst', FST, p.fst)}</label>
  <label>Safety flags${chips('e_flags', ['Pregnant', 'Lactating', 'G6PD deficient', 'Diabetic', 'HIV+', 'On anticoagulants'], p.flags || [], true)}</label>
  <label>Buckets${chips('e_bk', BUCKETS, p.buckets || [], true)}</label>
  ${D.thesis ? `<label>Thesis arm${chips('e_arm', [['', 'Not enrolled'], ['Case', 'Case / Group A'], ['Control', 'Control / Group B']], p.arm || '')}</label><label>Enrolment date<input id="e_enr" type="date" value="${esc(p.enrolled || today())}"></label><label>Study ID<input id="e_sid" value="${esc(p.studyId || '')}"></label>` : ''}
  <div class="actions"><button class="btn ghost" data-act="closesheet">Cancel</button><button class="btn" data-act="savept" data-id="${p.id}">Save</button></div></div>`);
};
ACT.savept = el => {
  const p = P(el.dataset.id), r = $('#sheet');
  Object.assign(p, { uhid: val('e_uhid') || p.uhid, name: val('e_name'), age: +val('e_age') || '', phone: val('e_phone'), sex: getChips('e_sex', r), fst: getChips('e_fst', r), flags: getChips('e_flags', r), buckets: getChips('e_bk', r) });
  if (D.thesis) { const arm = getChips('e_arm', r); p.arm = arm || null; if (arm) { p.enrolled = val('e_enr') || today(); p.studyId = val('e_sid') || p.studyId || nextStudyId(); } }
  Store.save(); closeSheet(); render();
};
ACT.closesheet = closeSheet;

/* ---------- VISIT ---------- */
function vVisit() {
  const v = V(ROUTE.id); if (!v) return go('#/home'); const p = P(v.pid);
  setTitle(v.label + ' · ' + p.uhid);
  const sc = D.scores.filter(s => s.vid === v.id), ph = D.photos.filter(x => x.vid === v.id), pins = D.pins.filter(x => x.vid === v.id);
  const inv = D.inv.filter(i => i.vid === v.id), lb = D.logbook.filter(l => l.vid === v.id);
  const th = D.thesis && p.arm;
  const crfVars = th ? D.thesis.vars.filter(x => x.scope === 'visit' || v.label === 'Baseline') : [];
  main().innerHTML = `
  <a class="crumb" href="#/patient/${p.id}">‹ ${esc(ptLabel(p))}</a>
  <div class="card form">
    <div class="grid2"><label>Date<input id="v_date" type="date" value="${esc(v.date)}"></label>
    <label>Visit label<input id="v_label" list="vlabels" value="${esc(v.label)}"><datalist id="vlabels">${(D.thesis ? D.thesis.weeks.map(wkLabel) : []).concat(['First visit', 'Follow-up', 'Review']).map(l => `<option value="${esc(l)}">`).join('')}</datalist></label></div>
    <label>Diagnosis (comma separated)<input id="v_dx" value="${esc((v.dx || []).join(', '))}"></label>
    <label>Notes<div class="inrow"><textarea id="v_notes" rows="3">${esc(v.notes || '')}</textarea>${mic('v_notes')}</div></label>
    <label>Final HPE / correlated diagnosis<input id="v_final" value="${esc(v.finalDx || '')}" placeholder="Update when report is traced"></label>
    <button class="btn sm" data-act="savevisit" data-id="${v.id}">Save visit</button>
  </div>
  <div class="card"><div class="row between"><h3>Photos</h3><a class="btn sm" href="#/cam/${v.id}">📷 Capture</a></div>
    <div class="thumbs">${ph.map(x => `<a href="#/photo/${x.id}"><img data-pid="${x.id}" data-thumb="1" alt=""><small>${esc(x.cat)}</small></a>`).join('') || '<p class="muted small">No photos for this visit</p>'}</div></div>
  <div class="card"><h3>Severity scores</h3>
    ${sc.map(s => `<a class="li" href="#/score/${v.id}/${s.scale}/${s.id}"><div><b>${s.scale}</b> <small>${esc(SCORES[s.scale]?.band(s.total) || '')}</small></div><b class="big">${s.total}</b></a>`).join('')}
    <div class="chips">${Object.keys(SCORES).map(k => `<a class="chip" href="#/score/${v.id}/${k}">+ ${k}</a>`).join('')}<a class="chip" data-act="vida" data-id="${v.id}">VIDA${v.vida !== undefined ? ': ' + v.vida : ''}</a></div></div>
  <div class="card"><div class="row between"><h3>Body map</h3><a class="btn sm ghost" href="#/map/${v.id}">Open mapper</a></div><p class="small muted">${pins.length} pin(s) ${pins.length ? '· ' + [...new Set(pins.map(x => MAPS[x.chart]?.label))].join(', ') : ''}</p></div>
  <div class="card"><div class="row between"><h3>Investigations</h3><button class="btn sm ghost" data-act="invadd" data-pid="${p.id}" data-vid="${v.id}">+ Add</button></div>
    ${inv.map(i => `<div class="li"><div><b>${esc(i.type)}</b><small>${esc(i.status)} · sent ${fmt(i.sent)}${i.result ? ' · ' + esc(i.result) : ''}</small></div></div>`).join('') || '<p class="muted small">None</p>'}</div>
  <div class="card"><div class="row between"><h3>Procedures (logbook)</h3><a class="btn sm ghost" href="#/logadd?vid=${v.id}">+ Log</a></div>
    ${lb.map(l => `<div class="li"><div><b>${esc(l.proc)}</b><small>${esc(l.role)} · ${esc(l.year)}</small></div></div>`).join('') || '<p class="muted small">None</p>'}</div>
  ${th ? `<div class="card form"><h3>Thesis CRF — ${esc(v.label)}</h3>${crfVars.map(x => crfInput(x, (v.crf || {})[x.name])).join('') || '<p class="muted small">No custom variables for this visit.</p>'}
    <button class="btn sm" data-act="savecrf" data-id="${v.id}">Save CRF</button></div>
  <div class="card"><div class="row between"><h3>Adverse events</h3><button class="btn sm ghost" data-act="aeadd" data-id="${v.id}">+ Log AE</button></div>
    ${(v.ae || []).map((a, i) => `<div class="li"><div><b>${esc(a.event)}</b><small>${esc(a.sev)} · ${esc(a.cause)}</small></div><button class="icon" data-act="aedel" data-id="${v.id}" data-i="${i}">✕</button></div>`).join('') || '<p class="muted small">None recorded</p>'}</div>` : ''}
  <button class="btn danger ghost sm" data-act="delvisit" data-id="${v.id}">Delete visit</button>`;
  hydrateImgs();
}
function crfInput(x, cur) {
  const id = 'crf_' + x.name;
  if (x.type === 'number') return `<label>${esc(x.label)}<input id="${id}" type="number" step="any" inputmode="decimal" value="${esc(cur ?? '')}"></label>`;
  if (x.type === 'yesno') return `<label>${esc(x.label)}${chips(id, [['1', 'Yes'], ['0', 'No']], cur ?? '')}</label>`;
  if (x.type === 'select') return `<label>${esc(x.label)}${chips(id, x.options.split(',').map(s => s.trim()), cur ?? '')}</label>`;
  return `<label>${esc(x.label)}<input id="${id}" value="${esc(cur ?? '')}"></label>`;
}
ACT.savevisit = el => { const v = V(el.dataset.id); Object.assign(v, { date: val('v_date') || v.date, label: val('v_label') || v.label, dx: val('v_dx').split(',').map(s => s.trim()).filter(Boolean), notes: val('v_notes'), finalDx: val('v_final') }); const p = P(v.pid); p.dx = [...new Set([...(p.dx || []), ...v.dx])]; Store.save(); toast('Visit saved'); };
ACT.savecrf = el => { const v = V(el.dataset.id); v.crf = v.crf || {}; for (const x of D.thesis.vars) { const id = 'crf_' + x.name; if (x.type === 'yesno' || x.type === 'select') { const c = getChips(id); if (c !== null) v.crf[x.name] = c; } else { const e = document.getElementById(id); if (e) v.crf[x.name] = e.value.trim(); } } Store.save(); toast('CRF saved'); };
ACT.delvisit = async el => { if (!(await uiConfirm('Delete this visit and its scores, pins and photos?'))) return; const id = el.dataset.id, v = V(id); for (const ph of D.photos.filter(x => x.vid === id)) await deletePhoto(ph.id); D.visits = D.visits.filter(x => x.id !== id); D.scores = D.scores.filter(s => s.vid !== id); D.pins = D.pins.filter(s => s.vid !== id); Store.save(); go('#/patient/' + v.pid); };
ACT.aeadd = el => openSheet(`<h3>Adverse event</h3><div class="form"><label>Event<input id="ae_ev" placeholder="e.g. Burning, erythema, raised ALT"></label><label>Severity${chips('ae_sev', ['Mild', 'Moderate', 'Severe'], 'Mild')}</label><label>Causality (WHO-UMC)${chips('ae_c', ['Certain', 'Probable', 'Possible', 'Unlikely', 'Unrelated'], 'Possible')}</label><label>Action taken<input id="ae_act" placeholder="Continued / dose reduced / stopped"></label><div class="actions"><button class="btn ghost" data-act="closesheet">Cancel</button><button class="btn" data-act="aesave" data-id="${el.dataset.id}">Save</button></div></div>`);
ACT.aesave = el => { const v = V(el.dataset.id); const ev = val('ae_ev'); if (!ev) return toast('Describe the event'); (v.ae = v.ae || []).push({ event: ev, sev: getChips('ae_sev', $('#sheet')), cause: getChips('ae_c', $('#sheet')), action: val('ae_act'), date: today() }); Store.save(); closeSheet(); render(); };
ACT.aedel = el => { const v = V(el.dataset.id); v.ae.splice(+el.dataset.i, 1); Store.save(); render(); };
ACT.vida = el => { const v = V(el.dataset.id); openSheet(`<h3>VIDA — Vitiligo Disease Activity</h3>${chips('vida', VIDA, v.vida !== undefined ? String(v.vida) : '')}<div class="actions"><button class="btn ghost" data-act="closesheet">Cancel</button><button class="btn" data-act="vidasave" data-id="${v.id}">Save</button></div>`); };
ACT.vidasave = el => { const v = V(el.dataset.id); const c = getChips('vida', $('#sheet')); if (c !== '') v.vida = +c; if (D.thesis && D.thesis.vars.some(x => x.name === 'VIDA')) { v.crf = v.crf || {}; v.crf.VIDA = c; } Store.save(); closeSheet(); render(); };

/* ---------- SCORE CALCULATORS ---------- */
function vScore() {
  const v = V(ROUTE.id), key = ROUTE.scale, S = SCORES[key]; if (!v || !S) return go('#/home');
  const ex = ROUTE.sid ? D.scores.find(s => s.id === ROUTE.sid) : null, I = ex ? ex.inputs : {};
  setTitle(key);
  const sel = (name, opts, cur) => `<select data-k="${name}">${optList(opts, cur ?? '0')}</select>`;
  let body = '';
  if (key === 'PASI') body = S.regions.map(([k, l, w]) => `<fieldset><legend>${l} <small>×${w}</small></legend><div class="grid4">${S.signs.map(([s, sl]) => `<label>${sl}${sel(k + '.' + s, SEV4, I[k]?.[s])}</label>`).join('')}<label>Area${sel(k + '.a', AREA6, I[k]?.a)}</label></div></fieldset>`).join('');
  if (key === 'EASI') body = `<label class="row"><input type="checkbox" data-k="child" ${I.child ? 'checked' : ''}> Child aged 0–7 years (head 0.2, legs 0.3)</label>` + S.regions.map(([k, l]) => `<fieldset><legend>${l}</legend><div class="grid4">${S.signs.map(([s, sl]) => `<label>${sl}${sel(k + '.' + s, SEV3, I[k]?.[s])}</label>`).join('')}<label>Area${sel(k + '.a', AREA6, I[k]?.a)}</label></div></fieldset>`).join('');
  if (key === 'SCORAD') body = `<label class="row"><input type="checkbox" data-k="child" ${I.child ? 'checked' : ''}> Child under 2 years (head 17%, legs 12%)</label>
    <fieldset><legend>A — Extent: % of each region affected</legend><div class="grid4">${S.regionsAdult.map(([k, l]) => `<label>${l}<input type="number" min="0" max="100" inputmode="decimal" data-k="reg.${k}" value="${esc(I.reg?.[k] ?? '')}"></label>`).join('')}</div><label>…or enter total BSA % directly<input type="number" min="0" max="100" inputmode="decimal" data-k="bsaOverride" value="${esc(I.bsaOverride ?? '')}"></label></fieldset>
    <fieldset><legend>B — Intensity (0–3, average representative area)</legend><div class="grid4">${S.items.map(([k, l]) => `<label>${l}${sel('int.' + k, [['0', '0'], ['1', '1 Mild'], ['2', '2 Moderate'], ['3', '3 Severe']], I.int?.[k])}</label>`).join('')}</div></fieldset>
    <fieldset><legend>C — Subjective (last 3 days, 0–10)</legend><label>Pruritus <output id="o_itch">${I.itch ?? 0}</output><input type="range" min="0" max="10" step="0.5" data-k="itch" value="${I.itch ?? 0}"></label><label>Sleeplessness <output id="o_sleep">${I.sleep ?? 0}</output><input type="range" min="0" max="10" step="0.5" data-k="sleep" value="${I.sleep ?? 0}"></label></fieldset>`;
  if (key === 'SALT') body = `<p class="small muted">Percentage of terminal hair loss in each view.</p>` + S.regions.map(([k, l, w]) => `<label>${l} (${w * 100}% of scalp) <output id="o_${k}">${I[k] ?? 0}</output>%<input type="range" min="0" max="100" step="5" data-k="${k}" value="${I[k] ?? 0}"></label>`).join('');
  if (key === 'MASI' || key === 'mMASI') body = S.regions.map(([k, l, w]) => `<fieldset><legend>${l} <small>×${w}</small></legend><div class="grid4"><label>Area${sel(k + '.a', AREA6, I[k]?.a)}</label><label>Darkness${sel(k + '.d', [['0', '0 Absent'], ['1', '1 Slight'], ['2', '2 Mild'], ['3', '3 Marked'], ['4', '4 Severe']], I[k]?.d)}</label>${key === 'MASI' ? `<label>Homogeneity${sel(k + '.h', [['0', '0 Minimal'], ['1', '1 Slight'], ['2', '2 Mild'], ['3', '3 Marked'], ['4', '4 Maximum']], I[k]?.h)}</label>` : ''}</div></fieldset>`).join('');
  if (key === 'VASI') body = `<p class="small muted">1 hand unit (patient's palm + fingers) ≈ 1% BSA.</p>` + S.regions.map(([k, l]) => `<fieldset><legend>${l}</legend><div class="grid2"><label>Hand units<input type="number" step="0.1" min="0" inputmode="decimal" data-k="${k}.hu" value="${esc(I[k]?.hu ?? '')}"></label><label>Depigmentation${sel(k + '.dp', S.depig, I[k]?.dp ?? '100')}</label></div></fieldset>`).join('');
  if (key === 'GAGS') body = S.regions.map(([k, l, f]) => `<label>${l} <small>(factor ${f})</small>${sel(k, S.grades, I[k])}</label>`).join('');
  if (key === 'DLQI') body = `<p class="small muted">Item summaries for quick bedside scoring. For thesis data, administer the official licensed DLQI (validated Hindi/Telugu versions available from Cardiff University).</p>` + S.items.map((t, i) => `<label>${i + 1}. ${t}${sel('q' + i, S.opts, I['q' + i] ?? '0')}</label>`).join('');
  main().innerHTML = `<a class="crumb" href="#/visit/${v.id}">‹ ${esc(v.label)} · ${esc(P(v.pid).uhid)}</a>
  <div class="card scorehead"><div><small>${esc(S.full)}</small><div class="total"><b id="tot">0</b><span>/ ${S.max}</span></div><small id="band"></small><small id="extra"></small></div></div>
  <div class="card form" id="sform">${body}</div>
  <div class="actions sticky">${ex ? `<button class="btn ghost danger" data-act="delscore" data-id="${ex.id}">Delete</button>` : ''}<button class="btn" data-act="savescore">Save ${key}</button></div>`;
  const recalc = () => {
    const inp = readScoreInputs(); const t = S.calc(inp);
    $('#tot').textContent = t; $('#band').textContent = S.band(t) || '';
    const base = baselineScore(v, key); $('#extra').textContent = (key === 'SCORAD' ? 'Objective SCORAD: ' + S.objective(inp) + ' · ' : '') + (base != null && v.label !== 'Baseline' ? 'Change from baseline: ' + (pctImprovement(base, t) ?? '—') + '% improvement' : '');
    $$('input[type=range]').forEach(r => { const o = document.getElementById('o_' + r.dataset.k); if (o) o.textContent = r.value; });
  };
  $('#sform').addEventListener('input', recalc); $('#sform').addEventListener('change', recalc); recalc();
}
function readScoreInputs() {
  const o = {};
  for (const e of $$('#sform [data-k]')) { const path = e.dataset.k.split('.'); let t = o; for (let i = 0; i < path.length - 1; i++) t = t[path[i]] = t[path[i]] || {}; t[path.at(-1)] = e.type === 'checkbox' ? e.checked : e.value; }
  return o;
}
function baselineScore(v, key) { const bv = visitsOf(v.pid).find(x => x.label === 'Baseline') || visitsOf(v.pid)[0]; if (!bv || bv.id === v.id) return null; const s = D.scores.filter(x => x.vid === bv.id && x.scale === key).pop(); return s ? s.total : null; }
ACT.savescore = () => {
  const v = V(ROUTE.id), key = ROUTE.scale, inputs = readScoreInputs(), total = SCORES[key].calc(inputs);
  if (ROUTE.sid) Object.assign(D.scores.find(s => s.id === ROUTE.sid), { inputs, total });
  else D.scores.push({ id: uid(), vid: v.id, pid: v.pid, scale: key, inputs, total, date: v.date });
  Store.save(); toast(key + ' saved: ' + total); go('#/visit/' + v.id);
};
ACT.delscore = el => { const s = D.scores.find(x => x.id === el.dataset.id); D.scores = D.scores.filter(x => x.id !== s.id); Store.save(); go('#/visit/' + s.vid); };

/* ---------- BODY / FACE / MUCOSA / NERVE MAPPER ---------- */
function vMap() {
  const v = V(ROUTE.id); if (!v) return go('#/home');
  const chart = MAPS[ROUTE.q.c] ? ROUTE.q.c : 'body-front', ptype = PIN_TYPES.some(t => t[0] === ROUTE.q.t) ? ROUTE.q.t : 'lesion';
  setTitle('Body map');
  const pins = D.pins.filter(x => x.vid === v.id && x.chart === chart);
  main().innerHTML = `<a class="crumb" href="#/visit/${v.id}">‹ ${esc(v.label)} · ${esc(P(v.pid).uhid)}</a>
  <div class="chips scroll">${Object.entries(MAPS).map(([k, m]) => `<a class="chip${k === chart ? ' on' : ''}" href="#/map/${v.id}?c=${k}&t=${ptype}">${m.label}</a>`).join('')}</div>
  <div class="chips scroll" id="ptypes">${PIN_TYPES.map(([k, l, c]) => `<a class="chip${k === ptype ? ' on' : ''}" href="#/map/${v.id}?c=${chart}&t=${k}"><i class="dot" style="background:${c}"></i>${l}</a>`).join('')}</div>
  <div class="mapwrap"><svg id="map" viewBox="0 0 300 400" class="anat">${MAPS[chart].svg}${pins.map(x => `<g class="pin" data-act="pinsel" data-id="${x.id}"><circle cx="${x.x}" cy="${x.y}" r="7" fill="${pinColor(x.type)}"/><text x="${x.x}" y="${x.y + 3}" class="pn">${pins.indexOf(x) + 1}</text></g>`).join('')}</svg></div>
  <p class="small muted center">Tap the chart to drop a <b>${PIN_TYPES.find(p => p[0] === ptype)[1]}</b> pin. Tap a pin to edit.</p>
  <div class="card">${pins.map((x, i) => `<div class="li"><div><b>${i + 1}. ${esc(PIN_TYPES.find(p => p[0] === x.type)?.[1])}</b><small>${esc(x.note || '')}</small></div><button class="icon" data-act="pindel" data-id="${x.id}">✕</button></div>`).join('') || '<p class="muted small">No pins on this chart.</p>'}</div>`;
  $('#map').addEventListener('click', async e => {
    if (e.target.closest('.pin')) return;
    const svg = $('#map'), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    const note = await uiPrompt('Pin note (optional) — e.g. "4mm punch, active border" or "loss of temperature"', '');
    if (note === null) return;
    D.pins.push({ id: uid(), vid: v.id, chart, x: Math.round(q.x), y: Math.round(q.y), type: ptype, note }); Store.save(); render();
  });
}
ACT.pindel = el => { D.pins = D.pins.filter(x => x.id !== el.dataset.id); Store.save(); render(); };
ACT.pinsel = async el => { const x = D.pins.find(p => p.id === el.dataset.id); const n2 = await uiPrompt('Edit note', x.note || ''); if (n2 !== null) { x.note = n2; Store.save(); render(); } };

/* ---------- WHATSAPP CARE CARDS ---------- */
let WA_SUBS = {};
function vWA() {
  const p = P(ROUTE.id); if (!p) return go('#/patients');
  setTitle('WhatsApp care card');
  const lang = ['en', 'hi', 'te'].includes(ROUTE.q.l) ? ROUTE.q.l : (D.settings.lang || 'en'), tid = WA_TEMPLATES.some(t => t.id === ROUTE.q.t) ? ROUTE.q.t : 'biopsy';
  const T = WA_TEMPLATES.find(t => t.id === tid), custom = (D.templates[tid] || {})[lang];
  const next = D.reminders.filter(r => r.pid === p.id && !r.done).sort((a, b) => a.date.localeCompare(b.date))[0];
  const subs = { name: p.name || 'Patient', date: next ? fmt(next.date) : '____', plan: 'twice daily × 1 week, then once daily × 1 week, then alternate days × 1 week' };
  WA_SUBS = subs;
  const text = (custom || T[lang]).replaceAll('{name}', p.name || 'Patient').replaceAll('{date}', next ? fmt(next.date) : '____').replaceAll('{plan}', 'twice daily × 1 week, then once daily × 1 week, then alternate days × 1 week');
  main().innerHTML = `<a class="crumb" href="#/patient/${p.id}">‹ ${esc(ptLabel(p))}</a>
  ${chips('wl', [['en', 'English'], ['hi', 'हिन्दी'], ['te', 'తెలుగు']], lang)}
  <div class="chips scroll">${WA_TEMPLATES.map(t => `<a class="chip${t.id === tid ? ' on' : ''}" href="#/wa/${p.id}?t=${t.id}&l=${lang}">${t.title}</a>`).join('')}</div>
  <div class="form card"><label>Phone<input id="wa_ph" type="tel" value="${esc(p.phone || '')}" placeholder="10-digit mobile"></label>
  <label>Message (edit freely)<textarea id="wa_txt" rows="12">${esc(text)}</textarea></label>
  <label class="row small"><input type="checkbox" id="wa_savetpl"> Save my edits as the default for this template & language</label>
  <div class="actions"><button class="btn ghost" data-act="wacopy">Copy</button><button class="btn wa" data-act="wasend">Open in WhatsApp</button></div>
  <p class="small muted">Opens a chat via wa.me — the number is not saved to your contacts.</p></div>`;
  $('[data-group="wl"]').addEventListener('click', () => setTimeout(() => go(`#/wa/${p.id}?t=${tid}&l=${getChips('wl')}`)));
}
ACT.wacopy = () => { navigator.clipboard?.writeText(val('wa_txt')).then(() => toast('Copied')); };
ACT.wasend = () => {
  let ph = val('wa_ph').replace(/\D/g, ''); if (ph.length === 11 && ph[0] === '0') ph = ph.slice(1); if (ph.length === 10) ph = '91' + ph;
  if (ph.length < 11) return toast('Enter a valid phone number');
  if ($('#wa_savetpl').checked) { const tid = ROUTE.q.t || 'biopsy', l = ROUTE.q.l || D.settings.lang || 'en'; let raw = val('wa_txt'); for (const k of ['plan', 'date', 'name']) if (WA_SUBS[k] && WA_SUBS[k] !== '____') raw = raw.split(WA_SUBS[k]).join('{' + k + '}'); (D.templates[tid] = D.templates[tid] || {})[l] = raw; }
  const p = P(ROUTE.id); if (p && !p.phone) p.phone = val('wa_ph'); Store.save();
  window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(val('wa_txt')), '_blank');
};

ACT.nudgeoff = () => { D.settings.backupNudgeOff = true; Store.save(); render(); };
