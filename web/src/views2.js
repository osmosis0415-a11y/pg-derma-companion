/* ===== Photo studio, investigations, calendar, logbook, thesis, analytics, formulary, settings ===== */
let camStream = null, camFacing = 'environment';
const stopCam = () => { if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; } };

/* ---------- CAMERA with ghost overlay ---------- */
async function vCam() {
  const v = V(ROUTE.id); if (!v) return go('#/home'); const p = P(v.pid);
  setTitle('Capture · ' + p.uhid);
  const prev = photosOf(p.id).filter(x => x.vid !== v.id);
  const ghostId = ROUTE.q.g ?? (prev.find(x => x.baseline) || prev[0])?.id ?? '';
  main().innerHTML = `<a class="crumb" href="#/visit/${v.id}">‹ ${esc(v.label)}</a>
  ${chips('c_cat', PHOTO_CATS, ROUTE.q.cat || 'Clinical', false, 'scroll')}
  <div class="camwrap"><video id="cv" playsinline muted autoplay></video>${ghostId ? `<img id="ghost" data-pid="${ghostId}" alt="">` : ''}<div class="grid3x3"></div></div>
  <div class="camctl">
    <label class="small">Ghost<input id="gop" type="range" min="0" max="0.8" step="0.05" value="${ghostId ? 0.35 : 0}"></label>
    <button class="shutter" data-act="snap" aria-label="Capture"></button>
    <button class="icon" data-act="flip" aria-label="Switch camera">🔄</button>
  </div>
  <div class="form card"><label>Body site<input id="c_site" list="sites" placeholder="e.g. Right forearm extensor"><datalist id="sites">${['Face', 'Scalp', 'Forehead', 'Right cheek', 'Left cheek', 'Trunk – front', 'Back', 'Right forearm', 'Left forearm', 'Right leg', 'Left leg', 'Palms', 'Soles', 'Nails', 'Oral mucosa', 'Genitalia'].map(s => `<option value="${s}">`).join('')}</datalist></label>
  ${prev.length ? `<label>Ghost overlay from<select id="c_ghost">${optList([['', 'None'], ...prev.map(x => [x.id, fmt(x.at) + ' · ' + x.cat + (x.site ? ' · ' + x.site : '')])], ghostId)}</select></label>` : ''}
  <label class="btn ghost filebtn">📁 Use phone camera / gallery instead<input id="c_file" type="file" accept="image/*" capture="environment" multiple hidden></label>
  <p class="small muted">Photos are saved only inside this app's encrypted vault — never to your gallery. (If you use the phone camera button, some phones also keep a copy in the gallery.)</p>
  <a class="btn" href="#/visit/${v.id}">Done</a></div>`;
  hydrateImgs();
  $('#gop').addEventListener('input', e => { const g = $('#ghost'); if (g) g.style.opacity = e.target.value; });
  if ($('#ghost')) $('#ghost').style.opacity = 0.35;
  $('#c_ghost')?.addEventListener('change', e => go(`#/cam/${v.id}?g=${e.target.value}&cat=${encodeURIComponent(getChips('c_cat'))}`));
  $('#c_file').addEventListener('change', async e => { if (!D) return toast('App locked — unlock and try again'); for (const f of e.target.files) { await savePhoto(await loadBitmap(f), { pid: p.id, vid: v.id, cat: getChips('c_cat'), site: val('c_site') }); } toast(e.target.files.length + ' photo(s) saved to vault'); });
  try {
    stopCam();
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: camFacing, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
    $('#cv').srcObject = camStream;
  } catch (e) { $('.camwrap').innerHTML = `<div class="empty"><div>Live camera unavailable</div><small>${esc(e.name || '')} — use the phone camera button below.</small></div>`; }
}
ACT.flip = () => { camFacing = camFacing === 'environment' ? 'user' : 'environment'; render(); };
ACT.snap = async () => {
  const vid = $('#cv'); if (!vid || !vid.videoWidth) return toast('Camera not ready');
  const v = V(ROUTE.id);
  const c = document.createElement('canvas'); c.width = vid.videoWidth; c.height = vid.videoHeight; c.getContext('2d').drawImage(vid, 0, 0);
  $('.camwrap').classList.add('flash'); setTimeout(() => $('.camwrap')?.classList.remove('flash'), 180);
  await savePhoto(c, { pid: v.pid, vid: v.id, cat: getChips('c_cat'), site: val('c_site') });
  toast('Saved to encrypted vault');
};

/* ---------- VAULT ---------- */
function vVault() {
  setTitle('Photo vault', !!ROUTE.q.pid);
  const cat = ROUTE.q.cat || '', bk = ROUTE.q.b || '';
  const list = D.photos.filter(x => (!ROUTE.q.pid || x.pid === ROUTE.q.pid) && (!cat || x.cat === cat) && (!bk || (P(x.pid)?.buckets || []).includes(bk)) && (!ROUTE.q.deid || x.deid)).sort((a, b) => b.at.localeCompare(a.at));
  const qs = o => '#/vault?' + new URLSearchParams(Object.assign({}, ROUTE.q, o)).toString();
  main().innerHTML = `<div class="chips scroll">${[['', 'All'], ...PHOTO_CATS.map(c => [c, c])].map(([k, l]) => `<a class="chip${k === cat ? ' on' : ''}" href="${qs({ cat: k })}">${l}</a>`).join('')}</div>
  <div class="chips scroll">${[['', 'Any bucket'], ...BUCKETS.filter(b => b !== 'Routine').map(b => [b, b])].map(([k, l]) => `<a class="chip${k === bk ? ' on' : ''}" href="${qs({ b: k })}">${l}</a>`).join('')}<a class="chip${ROUTE.q.deid ? ' on' : ''}" href="${qs({ deid: ROUTE.q.deid ? '' : '1' })}">De-identified only</a></div>
  <p class="small muted">${list.length} photo(s) · encrypted on this device</p>
  <div class="gallery">${list.map(x => `<a href="#/photo/${x.id}"><img data-pid="${x.id}" data-thumb="1" alt=""><small>${esc(P(x.pid)?.uhid || '')} · ${esc(x.cat)}${x.deid ? ' · 🛡️' : ''}</small></a>`).join('') || empty('No photos yet', 'Capture from any visit')}</div>`;
  hydrateImgs();
}

/* ---------- PHOTO DETAIL ---------- */
function vPhoto() {
  const x = D.photos.find(p => p.id === ROUTE.id); if (!x) return go('#/vault'); const p = P(x.pid);
  setTitle(x.cat);
  main().innerHTML = `<div class="photo"><img data-pid="${x.id}" alt=""></div>
  <div class="card form"><p class="small"><b>${esc(ptLabel(p))}</b> · ${fmt(x.at)} ${x.deid ? '· <span class="tag">De-identified</span>' : ''}</p>
  <div class="grid2"><label>Category<select id="ph_cat">${optList(PHOTO_CATS, x.cat)}</select></label><label>Body site<input id="ph_site" value="${esc(x.site || '')}"></label></div>
  <label class="row small"><input type="checkbox" id="ph_base" ${x.baseline ? 'checked' : ''}> Use as baseline (ghost overlay default)</label>
  <label>Caption / notes<input id="ph_note" value="${esc(x.note || '')}"></label>
  <button class="btn sm" data-act="phsave">Save details</button></div>
  <div class="btnrow wrap">
    <a class="btn" href="#/deid/${x.id}">🛡️ Conference mode</a>
    <a class="btn ghost" href="#/compare/${x.pid}?a=${x.id}">Compare</a>
    <button class="btn ghost" data-act="phshare">Share</button>
    <button class="btn ghost" data-act="phdl">Download</button>
    ${x.vid ? `<a class="btn ghost" href="#/visit/${x.vid}">Visit</a>` : ''}
    <button class="btn ghost danger" data-act="phdel">Delete</button>
  </div>
  ${!x.deid ? '<p class="small warn">This photo is identifiable. Use Conference mode before sharing outside the clinical team.</p>' : ''}`;
  hydrateImgs();
}
ACT.phsave = () => { const x = D.photos.find(p => p.id === ROUTE.id); if ($('#ph_base').checked) D.photos.filter(o => o.pid === x.pid).forEach(o => o.baseline = false); Object.assign(x, { cat: val('ph_cat'), site: val('ph_site'), note: val('ph_note'), baseline: $('#ph_base').checked }); Store.save(); toast('Saved'); };
async function shareBlob(blob, name) {
  const f = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  download(blob, name);
}
ACT.phshare = async () => { const x = D.photos.find(p => p.id === ROUTE.id); if (!x.deid && !(await uiConfirm('This photo is NOT de-identified. Share anyway?'))) return; shareBlob(await photoBlob(x.id), (x.deid ? 'case-' : 'photo-') + x.id.slice(0, 6) + '.jpg'); };
ACT.phdl = async () => { const x = D.photos.find(p => p.id === ROUTE.id); download(await photoBlob(x.id), 'photo-' + x.id.slice(0, 6) + '.jpg'); };
ACT.phdel = async () => { if (!(await uiConfirm('Delete this photo permanently?'))) return; const x = D.photos.find(p => p.id === ROUTE.id); await deletePhoto(x.id); history.back(); };

/* ---------- DE-IDENTIFICATION (Conference mode) ---------- */
let deid = null;
async function vDeid() {
  const x = D.photos.find(p => p.id === ROUTE.id); if (!x) return go('#/vault');
  setTitle('Conference mode');
  main().innerHTML = `<p class="small muted">Drag on the image to place a mask. Re-encoding strips all metadata (EXIF, GPS, timestamps); no UHID or name is ever burned into images.</p>
  ${chips('dtool', [['bar', '⬛ Eye bar'], ['blur', '▦ Pixelate'], ['blackbox', '■ Black box']], 'bar')}
  <div class="deidwrap"><canvas id="dc"></canvas></div>
  <div class="btnrow wrap"><button class="btn ghost" data-act="dauto">🤖 Auto-detect faces</button><button class="btn ghost" data-act="dundo">Undo</button>
  <button class="btn" data-act="dsave">Save de-identified copy</button><button class="btn ghost" data-act="dshare">Save & share</button></div>`;
  const img = await loadBitmap(await photoBlob(x.id));
  const c = $('#dc'); c.width = img.width; c.height = img.height;
  deid = { img, rects: [], c, ctx: c.getContext('2d') };
  drawDeid();
  let st = null;
  const pos = e => { const r = c.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * c.width / r.width, y: (t.clientY - r.top) * c.height / r.height }; };
  const down = e => { e.preventDefault(); c.setPointerCapture?.(e.pointerId); st = pos(e); };
  const move = e => { if (!st) return; e.preventDefault(); const q = pos(e); drawDeid({ x: Math.min(st.x, q.x), y: Math.min(st.y, q.y), w: Math.abs(q.x - st.x), h: Math.abs(q.y - st.y), t: getChips('dtool') }); deid.last = q; };
  const up = () => { if (st && deid.last) { const q = deid.last; const r = { x: Math.min(st.x, q.x), y: Math.min(st.y, q.y), w: Math.abs(q.x - st.x), h: Math.abs(q.y - st.y), t: getChips('dtool') }; if (r.w > 8 && r.h > 8) deid.rects.push(r); } st = null; deid.last = null; drawDeid(); };
  c.addEventListener('pointerdown', down); c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
}
function pixelate(ctx, r) {
  const s = Math.max(8, Math.round(Math.min(r.w, r.h) / 8));
  const tmp = document.createElement('canvas'); tmp.width = Math.max(1, Math.round(r.w / s)); tmp.height = Math.max(1, Math.round(r.h / s));
  tmp.getContext('2d').drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, tmp.width, tmp.height);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, r.x, r.y, r.w, r.h); ctx.imageSmoothingEnabled = true;
}
function drawDeid(preview) {
  const { ctx, img, rects } = deid; ctx.drawImage(img, 0, 0);
  for (const r of [...rects, ...(preview ? [preview] : [])]) { if (r.t === 'blur') pixelate(ctx, r); else { ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h); } }
}
ACT.dundo = () => { deid.rects.pop(); drawDeid(); };
ACT.dauto = async () => {
  if (!('FaceDetector' in window)) return toast('Auto face detection is not available in this browser — drag to place eye bars manually', 3500);
  try {
    const faces = await new FaceDetector({ fastMode: true, maxDetectedFaces: 10 }).detect(deid.c);
    if (!faces.length) return toast('No faces found');
    for (const f of faces) { const b = f.boundingBox; const eyes = (f.landmarks || []).filter(l => l.type === 'eye'); if (eyes.length >= 2) { const ys = eyes.flatMap(e => e.locations.map(p => p.y)); const y = Math.min(...ys); deid.rects.push({ x: b.x - b.width * 0.05, y: y - b.height * 0.12, w: b.width * 1.1, h: b.height * 0.24, t: 'bar' }); } else deid.rects.push({ x: b.x, y: b.y + b.height * 0.25, w: b.width, h: b.height * 0.22, t: 'bar' }); }
    drawDeid(); toast(faces.length + ' face(s) masked — check before sharing');
  } catch (e) { toast('Face detection failed — mask manually'); }
};
async function saveDeid() {
  const x = D.photos.find(p => p.id === ROUTE.id);
  if (!deid.rects.length && !(await uiConfirm('No masks added. Save a metadata-stripped copy anyway?'))) return null;
  drawDeid();
  const rec = await savePhoto(deid.c, { pid: x.pid, vid: x.vid, cat: x.cat, site: x.site, deid: true, src: x.id, note: 'De-identified copy' });
  return rec;
}
ACT.dsave = async () => { const r = await saveDeid(); if (r) { toast('De-identified copy saved'); go('#/photo/' + r.id); } };
ACT.dshare = async () => { const r = await saveDeid(); if (r) shareBlob(await photoBlob(r.id), 'case-' + r.id.slice(0, 6) + '.jpg'); };

/* ---------- COMPARE (slider + side-by-side) ---------- */
function vCompare() {
  const p = P(ROUTE.id); if (!p) return go('#/vault');
  const ph = photosOf(p.id); if (ph.length < 1) return go('#/patient/' + p.id);
  const a = ROUTE.q.a || (ph.find(x => x.baseline) || ph[0]).id, b = ROUTE.q.b || ph.at(-1).id, mode = ROUTE.q.m || 'slider';
  const lbl = x => fmt(x.at) + ' · ' + x.cat + (x.site ? ' · ' + x.site : '') + (x.vid ? ' · ' + (V(x.vid)?.label || '') : '');
  setTitle('Compare · ' + p.uhid);
  const qs = o => '#/compare/' + p.id + '?' + new URLSearchParams(Object.assign({ a, b, m: mode }, o));
  main().innerHTML = `<div class="grid2 form"><label>Before<select id="ca">${optList(ph.map(x => [x.id, lbl(x)]), a)}</select></label><label>After<select id="cb">${optList(ph.map(x => [x.id, lbl(x)]), b)}</select></label></div>
  <div class="chips"><a class="chip${mode === 'slider' ? ' on' : ''}" href="${qs({ m: 'slider' })}">Slider</a><a class="chip${mode === 'side' ? ' on' : ''}" href="${qs({ m: 'side' })}">Side by side</a></div>
  ${mode === 'slider' ? `<div class="cmp" id="cmp"><div class="zoomer"><img data-pid="${a}" alt=""><div class="clip" id="clip"><img data-pid="${b}" alt=""></div></div><div class="handle" id="hdl"></div></div><input type="range" id="cr" min="0" max="100" value="50">`
    : `<div class="side" id="cmp"><div class="zoomer"><img data-pid="${a}" alt=""></div><div class="zoomer"><img data-pid="${b}" alt=""></div></div>`}
  <label class="small">Zoom (synchronised)<input type="range" id="cz" min="1" max="4" step="0.1" value="1"></label>
  <p class="small muted">Drag inside the image to pan both views together.</p>`;
  hydrateImgs();
  $('#ca').onchange = e => go(qs({ a: e.target.value })); $('#cb').onchange = e => go(qs({ b: e.target.value }));
  let z = 1, px = 0, py = 0;
  const apply = () => $$('#cmp .zoomer').forEach(el => el.style.transform = `scale(${z}) translate(${px}px,${py}px)`);
  $('#cz').oninput = e => { z = +e.target.value; apply(); };
  if ($('#cr')) $('#cr').oninput = e => { $('#clip').style.clipPath = `inset(0 0 0 ${e.target.value}%)`; $('#hdl').style.left = e.target.value + '%'; };
  if ($('#clip')) $('#clip').style.clipPath = 'inset(0 0 0 50%)';
  let drag = null; const cmp = $('#cmp');
  cmp.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, px, py }; cmp.setPointerCapture(e.pointerId); });
  cmp.addEventListener('pointermove', e => { if (!drag || z === 1) return; px = drag.px + (e.clientX - drag.x) / z; py = drag.py + (e.clientY - drag.y) / z; apply(); });
  cmp.addEventListener('pointerup', () => drag = null);
}

/* ---------- INVESTIGATIONS (Kanban) ---------- */
const INV_COLS = [['sent', 'Sample sent'], ['traced', 'Report traced'], ['done', 'Correlated']];
function vInv() {
  setTitle('Investigations', false, `<button class="icon" data-act="invadd">＋</button>`);
  const col = ROUTE.q.c || 'sent';
  const card = i => { const p = P(i.pid), due = addDays(i.sent, INV_DAYS[i.type] ?? 5), late = i.status === 'sent' && due < today();
    return `<div class="kcard${late ? ' late' : ''}"><div class="row between"><b>${esc(i.type)}</b>${i.status === 'sent' ? dueBadge(due) : ''}</div>
    <small><a href="#/patient/${i.pid}">${esc(ptLabel(p))}</a> · sent ${fmt(i.sent)}${i.site ? ' · ' + esc(i.site) : ''}</small>
    ${i.type === 'Slit skin smear' && (i.bi != null || i.mi) ? `<small>BI ${i.bi ?? '—'} · MI ${esc(i.mi || '—')}%</small>` : ''}
    ${i.result ? `<p class="small">${esc(i.result)}</p>` : ''}
    <div class="btnrow"><button class="btn xs ghost" data-act="invedit" data-id="${i.id}">Edit</button>${i.status !== 'done' ? `<button class="btn xs" data-act="invnext" data-id="${i.id}">${i.status === 'sent' ? 'Mark traced ›' : 'Correlated ✓'}</button>` : ''}</div></div>`; };
  main().innerHTML = `<div class="chips kt">${INV_COLS.map(([k, l]) => `<a class="chip${k === col ? ' on' : ''}" href="#/inv?c=${k}">${l} (${D.inv.filter(i => i.status === k).length})</a>`).join('')}</div>
  <div class="kanban">${INV_COLS.map(([k, l]) => `<div class="kcol${k === col ? ' cur' : ''}"><h4>${l}</h4>${D.inv.filter(i => i.status === k).sort((a, b) => a.sent.localeCompare(b.sent)).map(card).join('') || '<p class="muted small">Empty</p>'}</div>`).join('')}</div>`;
}
function invForm(i, pid, vid) {
  const ssi = ['R ear lobe', 'L ear lobe', 'Forehead', 'Lesion 1', 'Lesion 2', 'Lesion 3'];
  return `<h3>${i ? 'Edit' : 'New'} investigation</h3><div class="form">
  ${pid ? `<p class="small"><b>${esc(ptLabel(P(pid)))}</b></p>` : `<label>Patient UHID<input id="i_uhid" list="uhids"><datalist id="uhids">${D.patients.map(p => `<option value="${esc(p.uhid)}">`).join('')}</datalist></label>`}
  <label>Type<select id="i_type">${optList(INV_TYPES, i?.type || 'Skin biopsy (HPE)')}</select></label>
  <div class="grid2"><label>Sent on<input id="i_sent" type="date" value="${esc(i?.sent || today())}"></label><label>Site / lab no.<input id="i_site" value="${esc(i?.site || '')}"></label></div>
  <fieldset id="i_sss" ${i?.type === 'Slit skin smear' ? '' : 'hidden'}><legend>Slit skin smear grading (0–6+)</legend><div class="grid3">${ssi.map((s, k) => `<label>${s}<input type="number" min="0" max="6" class="ssi" value="${esc(i?.sss?.[k] ?? '')}"></label>`).join('')}</div><label>Morphological index (%)<input id="i_mi" type="number" value="${esc(i?.mi ?? '')}"></label></fieldset>
  <label>Result / report<textarea id="i_res" rows="3">${esc(i?.result || '')}</textarea></label>
  <div class="actions">${i ? `<button class="btn ghost danger" data-act="invdel" data-id="${i.id}">Delete</button>` : ''}<button class="btn ghost" data-act="closesheet">Cancel</button><button class="btn" data-act="invsave" data-id="${i?.id || ''}" data-pid="${pid || ''}" data-vid="${vid || ''}">Save</button></div></div>`;
}
ACT.invadd = el => { openSheet(invForm(null, el.dataset.pid, el.dataset.vid)); $('#i_type').onchange = e => $('#i_sss').hidden = e.target.value !== 'Slit skin smear'; };
ACT.invedit = el => { const i = D.inv.find(x => x.id === el.dataset.id); openSheet(invForm(i, i.pid, i.vid)); $('#i_type').onchange = e => $('#i_sss').hidden = e.target.value !== 'Slit skin smear'; };
ACT.invsave = el => {
  let pid = el.dataset.pid;
  if (!pid) { const u = val('i_uhid').toLowerCase(); const p = D.patients.find(x => x.uhid.toLowerCase() === u); if (!p) return toast('Patient UHID not found'); pid = p.id; }
  const sss = $$('.ssi').map(e => e.value);
  const data = { pid, vid: el.dataset.vid || null, type: val('i_type'), sent: val('i_sent') || today(), site: val('i_site'), result: val('i_res'), sss, bi: val('i_type') === 'Slit skin smear' ? biCalc(sss) : null, mi: val('i_mi') };
  if (el.dataset.id) Object.assign(D.inv.find(x => x.id === el.dataset.id), data); else D.inv.push(Object.assign({ id: uid(), status: 'sent' }, data));
  Store.save(); closeSheet(); render();
};
ACT.invnext = async el => { const i = D.inv.find(x => x.id === el.dataset.id); if (i.status === 'sent') { i.status = 'traced'; i.traced = today(); } else { if (!i.result) { const r = await uiPrompt('Final report / correlation summary'); if (r) i.result = r; } i.status = 'done'; i.done = today(); const v = i.vid && V(i.vid); if (v && i.type === 'Skin biopsy (HPE)' && !v.finalDx && i.result) v.finalDx = i.result; } Store.save(); render(); };
ACT.invdel = el => { D.inv = D.inv.filter(x => x.id !== el.dataset.id); Store.save(); closeSheet(); render(); };

/* ---------- CALENDAR / REMINDERS ---------- */
function vCal() {
  setTitle('Follow-ups', false, `<button class="icon" data-act="remadd">＋</button>`);
  const t = today(), all = dueItems(3650);
  const groups = [['Overdue', x => x.date < t], ['Today', x => x.date === t], ['Next 7 days', x => x.date > t && x.date <= addDays(t, 7)], ['Later', x => x.date > addDays(t, 7)]];
  main().innerHTML = `<div class="btnrow"><button class="btn sm ghost" data-act="icsall">📅 Add all to phone calendar (.ics)</button><button class="btn sm ghost" data-act="notify">🔔 Enable alerts</button></div>
  ${groups.map(([g, f]) => { const l = all.filter(f); return l.length ? `<h4 class="gh">${g}</h4>${l.map(i => `<div class="li due ${i.kind}"><a href="${i.href}"><b>${esc(i.title)}</b><small>${fmt(i.date)} · ${esc(i.sub)}</small></a>${i.kind === 'rem' ? `<button class="icon" data-act="remdone" data-id="${i.id}" title="Done">✓</button>` : ''}</div>`).join('')}` : ''; }).join('') || empty('No upcoming follow-ups')}
  ${D.reminders.some(r => r.done) ? `<details><summary class="small muted">Completed (${D.reminders.filter(r => r.done).length})</summary>${D.reminders.filter(r => r.done).map(r => `<div class="li"><small>${fmt(r.date)} · ${esc(r.type)} · ${esc(ptLabel(P(r.pid)))}</small><button class="icon" data-act="remundo" data-id="${r.id}">↺</button></div>`).join('')}</details>` : ''}`;
}
ACT.remadd = el => openSheet(`<h3>New reminder</h3><div class="form">
  ${el.dataset.pid ? `<p class="small"><b>${esc(ptLabel(P(el.dataset.pid)))}</b></p>` : `<label>Patient UHID (optional)<input id="r_uhid" list="uhids2"><datalist id="uhids2">${D.patients.map(p => `<option value="${esc(p.uhid)}">`).join('')}</datalist></label>`}
  <label>Type${chips('r_type', REMINDER_TYPES, 'Review visit')}</label>
  <div class="grid2"><label>Date<input id="r_date" type="date" value="${addDays(today(), 7)}"></label><label>Time (optional)<input id="r_time" type="time"></label></div>
  <label>Note<input id="r_note" placeholder="e.g. NB-UVB session 12, suture removal face"></label>
  <label class="row small"><input type="checkbox" id="r_ics" checked> Also add to phone calendar (.ics)</label>
  <div class="actions"><button class="btn ghost" data-act="closesheet">Cancel</button><button class="btn" data-act="remsave" data-pid="${el.dataset.pid || ''}">Save</button></div></div>`);
ACT.remsave = el => {
  let pid = el.dataset.pid || null;
  if (!pid && val('r_uhid')) { const p = D.patients.find(x => x.uhid.toLowerCase() === val('r_uhid').toLowerCase()); if (!p) return toast('UHID not found'); pid = p.id; }
  const r = { id: uid(), pid, type: getChips('r_type', $('#sheet')), date: val('r_date') || today(), time: val('r_time'), note: val('r_note'), done: false };
  D.reminders.push(r); Store.save();
  if ($('#r_ics').checked) download(makeICS([{ id: r.id, date: r.date, time: r.time, title: r.type + (pid ? ' – ' + P(pid).uhid : ''), desc: r.note }]), 'reminder.ics');
  closeSheet(); render();
};
ACT.remdone = el => { const r = D.reminders.find(x => x.id === el.dataset.id); r.done = true; Store.save(); render(); };
ACT.remundo = el => { const r = D.reminders.find(x => x.id === el.dataset.id); r.done = false; Store.save(); render(); };
ACT.icsall = () => { const ev = dueItems(365).filter(i => i.date >= today()).map((i, k) => ({ id: 'pg' + k + i.date, date: i.date, title: i.title + ' – ' + i.sub.split(' · ')[0], desc: i.sub })); if (!ev.length) return toast('Nothing upcoming'); download(makeICS(ev), 'pg-derma-followups.ics'); };
ACT.notify = async () => { if (!('Notification' in window)) return toast('Notifications not supported'); const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Alerts on — shown when the app is opened' : 'Permission denied'); if (r === 'granted') checkNotify(true); };
function checkNotify(force) { if (!('Notification' in window) || Notification.permission !== 'granted' || !D) return; const key = 'n' + today(); if (!force && D.settings.lastNotify === key) return; const n = dueItems(0).length; if (n) { const body = n + ' item(s) due today'; (navigator.serviceWorker?.ready || Promise.reject()).then(r => r.showNotification('PG Derma', { body, icon: 'icon-192.png' })).catch(() => { try { new Notification('PG Derma', { body }); } catch (e) {} }); } D.settings.lastNotify = key; Store.save(); }

/* ---------- NMC LOGBOOK ---------- */
const procTarget = name => +(D.settings.procTargets[name] ?? (PROCEDURES.find(p => p[0] === name) || [, , 0])[2]);
function vLogbook() {
  setTitle('NMC E-Logbook', false, `<a class="icon" href="#/logadd">＋</a>`);
  const yr = ROUTE.q.y || '', role = ROUTE.q.r || '', cat = ROUTE.q.c || '';
  const qs = o => '#/logbook?' + new URLSearchParams(Object.assign({}, ROUTE.q, o));
  const list = D.logbook.filter(l => (!yr || l.year === yr) && (!role || l.role === role) && (!cat || l.cat === cat)).sort((a, b) => b.date.localeCompare(a.date));
  const cnt = y => D.logbook.filter(l => l.year === y).length;
  main().innerHTML = `<div class="stats">${['JR1', 'JR2', 'JR3'].map(y => `<a href="${qs({ y: yr === y ? '' : y })}" class="stat${yr === y ? ' on' : ''}"><b>${cnt(y)}</b><small>${y}</small></a>`).join('')}</div>
  ${chips('lr', [['', 'All roles'], ...ROLES.map(r => [r, r])], role)}
  <div class="chips scroll">${[['', 'All categories'], ...[...new Set(PROCEDURES.map(p => p[1]))].map(c => [c, c])].map(([k, l]) => `<a class="chip${k === cat ? ' on' : ''}" href="${qs({ c: k })}">${l}</a>`).join('')}</div>
  <div class="btnrow wrap"><button class="btn sm" data-act="logxlsx">⬇ Excel</button><button class="btn sm ghost" data-act="logpdf">🖨 PDF (print)</button><a class="btn sm ghost" href="#/targets">🎯 Targets</a></div>
  <div class="list">${list.map(l => `<a class="li" href="#/logadd?id=${l.id}"><div><b>${esc(l.proc)}</b><small>${fmt(l.date)} · ${esc(l.role)} · ${esc(l.year)}${l.pid ? ' · ' + esc(P(l.pid)?.uhid || '') : ''}${l.supervisor ? ' · ' + esc(l.supervisor) : ''}</small></div><span class="badge ${l.role === 'Performed' ? 'green' : ''}">${l.role[0]}</span></a>`).join('') || empty('No logbook entries', 'Log procedures from any visit or tap ＋')}</div>`;
  $('[data-group="lr"]').addEventListener('click', () => setTimeout(() => go(qs({ r: getChips('lr') }))));
}
function vLogAdd() {
  const ex = ROUTE.q.id ? D.logbook.find(l => l.id === ROUTE.q.id) : null, v = ROUTE.q.vid ? V(ROUTE.q.vid) : (ex?.vid ? V(ex.vid) : null);
  const p = v ? P(v.pid) : ex?.pid ? P(ex.pid) : null;
  setTitle(ex ? 'Edit entry' : 'Log procedure');
  const recent = [...new Set(D.logbook.slice(-30).map(l => l.proc))].slice(-8);
  main().innerHTML = `<div class="form card">
  ${p ? `<p class="small"><b>${esc(ptLabel(p))}</b>${v ? ' · ' + esc(v.label) : ''}</p>` : `<label>Patient UHID (optional)<input id="l_uhid" list="uhids3" value=""><datalist id="uhids3">${D.patients.map(x => `<option value="${esc(x.uhid)}">`).join('')}</datalist></label>`}
  ${recent.length ? `<label>Recent</label><div class="chips">${recent.map(r => `<button type="button" class="chip" data-act="lpick" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div>` : ''}
  <label>Procedure<select id="l_proc">${[...new Set(PROCEDURES.map(p => p[1]))].map(c => `<optgroup label="${c}">${PROCEDURES.filter(p => p[1] === c).map(p => `<option${ex?.proc === p[0] ? ' selected' : ''}>${esc(p[0])}</option>`).join('')}</optgroup>`).join('')}<option value="__other"${ex && !PROCEDURES.some(p => p[0] === ex.proc) ? ' selected' : ''}>Other…</option></select></label>
  <input id="l_other" placeholder="Procedure name" value="${ex && !PROCEDURES.some(p => p[0] === ex.proc) ? esc(ex.proc) : ''}" ${ex && !PROCEDURES.some(p => p[0] === ex.proc) ? '' : 'hidden'}>
  <label>Role${chips('l_role', ROLES, ex?.role || 'Performed')}</label>
  <div class="grid2"><label>Date<input id="l_date" type="date" value="${esc(ex?.date || v?.date || today())}"></label><label>Residency year<select id="l_year">${optList(['JR1', 'JR2', 'JR3'], ex?.year || residencyYear(ex?.date || today()))}</select></label></div>
  <label>Indication / diagnosis<input id="l_ind" value="${esc(ex?.indication || (v?.dx || []).join(', '))}"></label>
  <div class="grid2"><label>Site<input id="l_site" value="${esc(ex?.site || '')}"></label><label>Supervisor<input id="l_sup" value="${esc(ex?.supervisor || D.settings.lastSup || '')}"></label></div>
  <label>Notes / complications<input id="l_notes" value="${esc(ex?.notes || '')}"></label>
  <div class="actions">${ex ? `<button class="btn ghost danger" data-act="logdel" data-id="${ex.id}">Delete</button>` : ''}<button class="btn" data-act="logsave" data-id="${ex?.id || ''}" data-vid="${v?.id || ''}" data-pid="${p?.id || ''}">Save</button></div></div>`;
  $('#l_proc').onchange = e => $('#l_other').hidden = e.target.value !== '__other';
  $('#l_date').onchange = e => $('#l_year').value = residencyYear(e.target.value);
}
ACT.lpick = el => { const s = $('#l_proc'), v = el.dataset.v; if ([...s.options].some(o => o.value === v)) { s.value = v; $('#l_other').hidden = true; } else { s.value = '__other'; $('#l_other').hidden = false; $('#l_other').value = v; } };
ACT.logsave = el => {
  let pid = el.dataset.pid || null;
  if (!pid && val('l_uhid')) { const p = D.patients.find(x => x.uhid.toLowerCase() === val('l_uhid').toLowerCase()); if (p) pid = p.id; }
  const proc = val('l_proc') === '__other' ? val('l_other') : val('l_proc'); if (!proc) return toast('Choose a procedure');
  const data = { proc, cat: (PROCEDURES.find(p => p[0] === proc) || [, 'Other'])[1], role: getChips('l_role'), date: val('l_date'), year: val('l_year'), indication: val('l_ind'), site: val('l_site'), supervisor: val('l_sup'), notes: val('l_notes'), pid, vid: el.dataset.vid || null };
  D.settings.lastSup = data.supervisor;
  if (el.dataset.id) Object.assign(D.logbook.find(l => l.id === el.dataset.id), data); else D.logbook.push(Object.assign({ id: uid() }, data));
  Store.save(); toast('Logged'); history.back();
};
ACT.logdel = async el => { if (!(await uiConfirm('Delete entry?'))) return; D.logbook = D.logbook.filter(l => l.id !== el.dataset.id); Store.save(); history.back(); };
function vTargets() {
  setTitle('Logbook targets');
  main().innerHTML = `<p class="small muted">Defaults are placeholders. Set these to your department's / university's minimum requirements for the full residency.</p>
  <div class="form card">${[...new Set(PROCEDURES.map(p => p[1]))].map(c => `<fieldset><legend>${c}</legend>${PROCEDURES.filter(p => p[1] === c).map(p => `<label class="row between">${esc(p[0])}<input class="tgt" data-p="${esc(p[0])}" type="number" min="0" value="${procTarget(p[0])}" style="width:80px"></label>`).join('')}</fieldset>`).join('')}
  <button class="btn" data-act="tgtsave">Save targets</button></div>`;
}
ACT.tgtsave = () => { $$('.tgt').forEach(e => D.settings.procTargets[e.dataset.p] = +e.value); Store.save(); toast('Targets saved'); history.back(); };
function logRows() {
  const rows = [['S.No', 'Date', 'Residency year', 'Procedure', 'Category', 'Role', 'Patient UHID', 'Indication / diagnosis', 'Site', 'Supervisor', 'Notes', 'Faculty signature']];
  D.logbook.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((l, i) => rows.push([i + 1, l.date, l.year, l.proc, l.cat, l.role, P(l.pid)?.uhid || '', l.indication || '', l.site || '', l.supervisor || '', l.notes || '', '']));
  return rows;
}
function logSummary() {
  const rows = [['Procedure', 'Category', 'Target', ...['JR1', 'JR2', 'JR3'].flatMap(y => [y + ' P', y + ' A', y + ' O']), 'Total performed', '% of target']];
  const names = [...new Set([...PROCEDURES.map(p => p[0]), ...D.logbook.map(l => l.proc)])];
  for (const nm of names) { const L = D.logbook.filter(l => l.proc === nm); if (!L.length && !procTarget(nm)) continue; const perf = L.filter(l => l.role === 'Performed').length, t = procTarget(nm);
    rows.push([nm, (PROCEDURES.find(p => p[0] === nm) || [, 'Other'])[1], t, ...['JR1', 'JR2', 'JR3'].flatMap(y => ROLES.map(r => L.filter(l => l.year === y && l.role === r).length)), perf, t ? Math.round(perf / t * 100) : '']); }
  return rows;
}
ACT.logxlsx = () => download(makeXLSX([['Logbook', logRows()], ['Summary', logSummary()]]), 'NMC-logbook-' + today() + '.xlsx');
ACT.logpdf = () => {
  const s = D.settings;
  const sec = y => { const L = D.logbook.filter(l => l.year === y).sort((a, b) => a.date.localeCompare(b.date)); return L.length ? `<h2>${y}</h2><table><thead><tr><th>#</th><th>Date</th><th>Procedure</th><th>Role</th><th>UHID</th><th>Indication</th><th>Supervisor</th><th>Sign</th></tr></thead><tbody>${L.map((l, i) => `<tr><td>${i + 1}</td><td>${fmt(l.date)}</td><td>${esc(l.proc)}</td><td>${esc(l.role)}</td><td>${esc(P(l.pid)?.uhid || '')}</td><td>${esc(l.indication || '')}</td><td>${esc(l.supervisor || '')}</td><td></td></tr>`).join('')}</tbody></table><div class="sig"><span>Unit Head</span><span>PG Guide</span><span>HOD, DVL</span></div>` : ''; };
  $('#print').innerHTML = `<h1>PG Procedure Logbook — MD Dermatology, Venereology & Leprosy</h1><p><b>Resident:</b> Dr. ${esc(s.name || '________')} &nbsp; <b>Unit:</b> ${esc(s.unit || '____')} &nbsp; <b>Institution:</b> ${esc(s.inst || '________')} &nbsp; <b>Residency start:</b> ${esc(fmt(s.residencyStart) || '____')}</p>${['JR1', 'JR2', 'JR3'].map(sec).join('')}<h2>Summary</h2><table>${logSummary().map((r, i) => `<tr>${r.map(c => i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}</table>`;
  window.print();
};

/* ---------- THESIS ---------- */
function vThesisSetup() {
  setTitle('Thesis CRF builder');
  const T = D.thesis || THESIS_PRESETS[ROUTE.q.preset || 'blank'];
  const cfg = ROUTE.q.preset ? THESIS_PRESETS[ROUTE.q.preset] : T;
  main().innerHTML = `<p class="small muted">Start from a preset, then edit. You can change this later without losing data.</p>
  <div class="chips scroll">${Object.keys(THESIS_PRESETS).map(k => `<a class="chip${ROUTE.q.preset === k ? ' on' : ''}" href="#/thesis-setup?preset=${k}">${k[0].toUpperCase() + k.slice(1)}</a>`).join('')}</div>
  <div class="form card">
  <label>Thesis title<textarea id="t_title" rows="2">${esc(cfg.title)}</textarea></label>
  <div class="grid2"><label>Primary outcome scale<select id="t_scale">${optList([['', '—'], ...Object.keys(SCORES)], cfg.scale)}</select></label>
  <label>Visit weeks (comma-separated, 0 = baseline)<input id="t_weeks" value="${esc(cfg.weeks.join(', '))}"></label></div>
  <div class="grid2"><label>Group A label<input id="t_ga" value="${esc(cfg.groupA || 'Case / Intervention')}"></label><label>Group B label<input id="t_gb" value="${esc(cfg.groupB || 'Control / Comparator')}"></label></div>
  <div class="grid2"><label>Target sample — Group A<input id="t_na" type="number" value="${D.settings.sampleCase}"></label><label>Target sample — Group B<input id="t_nb" type="number" value="${D.settings.sampleControl}"></label></div>
  <label>Blinding<select id="t_blind">${optList(['Open label', 'Single blind', 'Double blind', 'Observer blind'], cfg.blinding || 'Open label')}</select></label>
  <h3>Custom variables</h3><div id="t_vars">${cfg.vars.map(varRow).join('')}</div>
  <button class="btn sm ghost" data-act="tvadd">+ Add variable</button>
  <div class="actions"><button class="btn" data-act="tsave">Save thesis setup</button></div></div>`;
}
const varRow = x => `<div class="varrow"><input class="v_name" placeholder="SPSS_name" value="${esc(x.name)}"><input class="v_label" placeholder="Label" value="${esc(x.label)}"><select class="v_type">${optList([['number', 'Number'], ['text', 'Text'], ['yesno', 'Yes/No'], ['select', 'Choice']], x.type)}</select><input class="v_opts" placeholder="Options a,b,c" value="${esc(x.options || '')}"><select class="v_scope">${optList([['visit', 'Every visit'], ['baseline', 'Baseline only']], x.scope)}</select><button class="icon" data-act="tvdel">✕</button></div>`;
ACT.tvadd = () => $('#t_vars').insertAdjacentHTML('beforeend', varRow({ name: '', label: '', type: 'number', scope: 'visit' }));
ACT.tvdel = el => el.closest('.varrow').remove();
ACT.tsave = () => {
  const weeks = [...new Set(val('t_weeks').split(',').map(s => parseInt(s)).filter(n => !isNaN(n) && n >= 0))].sort((a, b) => a - b);
  if (!weeks.includes(0)) weeks.unshift(0);
  const vars = $$('.varrow').map(r => ({ name: $('.v_name', r).value.trim().replace(/[^A-Za-z0-9_]/g, '_'), label: $('.v_label', r).value.trim(), type: $('.v_type', r).value, options: $('.v_opts', r).value.trim(), scope: $('.v_scope', r).value })).filter(x => x.name);
  D.thesis = { title: val('t_title'), scale: val('t_scale'), weeks, groupA: val('t_ga'), groupB: val('t_gb'), blinding: val('t_blind'), vars };
  D.settings.sampleCase = +val('t_na') || 0; D.settings.sampleControl = +val('t_nb') || 0;
  for (const p of D.patients) if (!p.arm && ((p.buckets || []).includes('Thesis Case') || (p.buckets || []).includes('Thesis Control'))) { p.arm = p.buckets.includes('Thesis Case') ? 'Case' : 'Control'; p.enrolled = (p.created || new Date().toISOString()).slice(0, 10); p.studyId = nextStudyId(); }
  Store.save(); toast('Thesis setup saved'); go('#/thesis');
};
function vThesis() {
  if (!D.thesis) return go('#/thesis-setup');
  const T = D.thesis; setTitle('Thesis tracker', false, `<a class="icon" href="#/thesis-setup">⚙️</a>`);
  const pts = D.patients.filter(p => p.arm), A = pts.filter(p => p.arm === 'Case'), B = pts.filter(p => p.arm === 'Control');
  const act = l => l.filter(p => !p.dropout).length;
  const overdue = pts.filter(p => !p.dropout).flatMap(p => thesisSchedule(p).filter(s => !s.visit && s.due < today()).map(s => ({ p, s })));
  const gauge = (n, t, l) => `<div class="gauge"><div class="row between"><b>${l}</b><span>${n}/${t}</span></div><div class="bar"><i style="width:${t ? Math.min(100, n / t * 100) : 0}%"></i></div></div>`;
  const lastLabel = wkLabel(T.weeks.at(-1));
  main().innerHTML = `<div class="card"><h3>${esc(T.title || 'Untitled thesis')}</h3><p class="small muted">${esc(T.scale || 'No primary scale')} · visits ${T.weeks.map(wkLabel).join(', ')} · ${esc(T.blinding || '')}</p>
  ${gauge(act(A), D.settings.sampleCase, 'Group A — ' + esc(T.groupA))}${gauge(act(B), D.settings.sampleControl, 'Group B — ' + esc(T.groupB))}
  <p class="small">Completed ${lastLabel}: <b>${pts.filter(p => thesisSchedule(p).at(-1)?.visit).length}</b> · Dropouts: <b>${pts.filter(p => p.dropout).length}</b></p></div>
  ${overdue.length ? `<div class="card"><h3>Overdue follow-ups (${overdue.length})</h3>${overdue.map(({ p, s }) => `<a class="li" href="#/patient/${p.id}"><div><b>${esc(p.studyId || '')} · ${esc(s.label)}</b><small>${esc(ptLabel(p))} · due ${fmt(s.due)}</small></div>${dueBadge(s.due)}</a>`).join('')}</div>` : ''}
  <div class="btnrow wrap"><button class="btn" data-act="thxlsx">⬇ SPSS-ready Excel</button><button class="btn ghost" data-act="thcsv">⬇ CSV</button><label class="row small"><input type="checkbox" id="th_uhid"> include UHID</label></div>
  <div class="card"><h3>Enrolled (${pts.length})</h3>${pts.map(p => { const sc = thesisSchedule(p); const done = sc.filter(s => s.visit).length; return `<a class="li" href="#/patient/${p.id}"><div><b>${esc(p.studyId || '—')}</b> <span class="tag">${esc(p.arm)}</span>${p.dropout ? ' <span class="badge red">Dropout</span>' : ''}<small>${esc(ptLabel(p))} · enrolled ${fmt(p.enrolled)}</small></div><small>${done}/${sc.length}</small></a>`; }).join('') || empty('No patients enrolled', 'Tag “Thesis Case” or “Thesis Control” during Quick add')}</div>`;
}
function thesisRows(withUHID) {
  const T = D.thesis, labels = T.weeks.map(wkLabel), scale = T.scale;
  const code = (x, v) => { if (v === undefined || v === null || v === '') return ''; if (x.type === 'number') return isNaN(+v) ? v : +v; if (x.type === 'yesno') return +v; if (x.type === 'select') { const o = x.options.split(',').map(s => s.trim()); return o.every(s => !isNaN(+s)) ? +v : o.indexOf(v) + 1 || ''; } return v; };
  const baseVars = T.vars.filter(x => x.scope === 'baseline'), visVars = T.vars.filter(x => x.scope === 'visit');
  const head = ['Study_ID', ...(withUHID ? ['UHID'] : []), 'Group', 'Age', 'Sex', 'FST', 'Enrol_date', ...baseVars.map(x => x.name)];
  for (const l of labels) { if (scale) head.push(scale + '_' + l); for (const x of visVars) head.push(x.name + '_' + l); }
  if (scale) for (const l of labels.slice(1)) head.push('Pct_Improve_' + l);
  head.push('AE_any', 'AE_count', 'AE_severe', 'Dropout', 'Visits_completed');
  const rows = [head];
  for (const p of D.patients.filter(p => p.arm).sort((a, b) => (a.studyId || '').localeCompare(b.studyId || ''))) {
    const sc = thesisSchedule(p), bv = sc[0]?.visit;
    const r = [p.studyId || '', ...(withUHID ? [p.uhid] : []), p.arm === 'Case' ? 1 : 2, (p.age === '' || p.age == null || isNaN(+p.age)) ? '' : +p.age, { M: 1, F: 2, O: 3 }[p.sex] || '', FST.indexOf(p.fst) + 1 || '', p.enrolled || '', ...baseVars.map(x => code(x, bv?.crf?.[x.name]))];
    const sv = {};
    for (const s of sc) { const st = s.visit ? D.scores.filter(z => z.vid === s.visit.id && z.scale === scale).pop() : null; sv[s.label] = st ? st.total : ''; if (scale) r.push(sv[s.label]); for (const x of visVars) r.push(code(x, s.visit?.crf?.[x.name])); }
    if (scale) for (const l of labels.slice(1)) r.push(sv.Baseline !== '' && sv[l] !== '' && sv[l] !== undefined ? pctImprovement(sv.Baseline, sv[l]) : '');
    const ae = sc.flatMap(s => s.visit?.ae || []);
    r.push(ae.length ? 1 : 0, ae.length, ae.filter(a => a.sev === 'Severe').length, p.dropout ? 1 : 0, sc.filter(s => s.visit).length);
    rows.push(r);
  }
  const dict = [['Variable', 'Label', 'Type', 'Coding / values'], ['Study_ID', 'Participant study ID', 'String', ''], ...(withUHID ? [['UHID', 'Hospital UHID (identifiable — remove before sharing)', 'String', '']] : []), ['Group', 'Study arm', 'Nominal', `1 = ${T.groupA}; 2 = ${T.groupB}`], ['Age', 'Age (years)', 'Scale', ''], ['Sex', 'Sex', 'Nominal', '1 = Male; 2 = Female; 3 = Other'], ['FST', 'Fitzpatrick skin type', 'Ordinal', '1–6 = Type I–VI'], ['Enrol_date', 'Enrolment date', 'Date (YYYY-MM-DD)', '']];
  const desc = x => x.type === 'yesno' ? '1 = Yes; 0 = No' : x.type === 'select' ? (x.options.split(',').every(s => !isNaN(+s.trim())) ? 'Numeric as entered: ' + x.options : x.options.split(',').map((s, i) => (i + 1) + ' = ' + s.trim()).join('; ')) : '';
  const typ = x => x.type === 'number' ? 'Scale' : x.type === 'text' ? 'String' : 'Nominal';
  for (const x of baseVars) dict.push([x.name, x.label + ' (baseline)', typ(x), desc(x)]);
  for (const l of labels) { if (scale) dict.push([scale + '_' + l, scale + ' total at ' + l, 'Scale', '']); for (const x of visVars) dict.push([x.name + '_' + l, x.label + ' at ' + l, typ(x), desc(x)]); }
  if (scale) for (const l of labels.slice(1)) dict.push(['Pct_Improve_' + l, `% improvement in ${scale} from Baseline to ${l}`, 'Scale', '(Baseline − ' + l + ') / Baseline × 100']);
  dict.push(['AE_any', 'Any adverse event', 'Nominal', '1 = Yes; 0 = No'], ['AE_count', 'Number of adverse events', 'Scale', ''], ['AE_severe', 'Number of severe AEs', 'Scale', ''], ['Dropout', 'Dropout / lost to follow-up', 'Nominal', '1 = Yes; 0 = No'], ['Visits_completed', 'Scheduled visits completed', 'Scale', '']);
  const ael = [['Study_ID', 'Visit', 'Date', 'Event', 'Severity', 'Causality', 'Action']];
  for (const p of D.patients.filter(p => p.arm)) for (const s of thesisSchedule(p)) for (const a of s.visit?.ae || []) ael.push([p.studyId, s.label, a.date, a.event, a.sev, a.cause, a.action || '']);
  return { rows, dict, ael };
}
ACT.thxlsx = () => { const { rows, dict, ael } = thesisRows($('#th_uhid').checked); download(makeXLSX([['Data', rows], ['Data dictionary', dict], ['Adverse events', ael]]), 'thesis-data-' + today() + '.xlsx'); };
ACT.thcsv = () => { const { rows } = thesisRows($('#th_uhid').checked); download(new Blob([toCSV(rows)], { type: 'text/csv' }), 'thesis-data-' + today() + '.csv'); };

/* ---------- ANALYTICS ---------- */
function vAnalytics() {
  setTitle('Analytics', false);
  const yr = ROUTE.q.y || residencyYear(new Date());
  const L = D.logbook.filter(l => l.year === yr && l.role === 'Performed');
  const procs = PROCEDURES.map(p => [p[0], L.filter(l => l.proc === p[0]).length, Math.ceil(procTarget(p[0]) / 3)]).filter(x => x[1] || x[2]).sort((a, b) => b[1] / Math.max(1, b[2]) - a[1] / Math.max(1, a[2]));
  const mix = { D: 0, V: 0, L: 0, A: 0 }; for (const v of D.visits) for (const d of (v.dx || [])) mix[dxCategory(d)]++;
  const tot = Object.values(mix).reduce((a, b) => a + b, 0) || 1;
  const colors = { D: 'var(--acc)', V: '#db2777', L: '#d97706', A: '#7c3aed' };
  let acc = 0; const donut = Object.entries(mix).map(([k, n]) => { const s = acc / tot * 100; acc += n; return `<circle r="15.9" cx="20" cy="20" fill="none" stroke="${colors[k]}" stroke-width="7" stroke-dasharray="${n / tot * 100} ${100 - n / tot * 100}" stroke-dashoffset="${25 - s}"/>`; }).join('');
  const months = []; for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(ymd(d).slice(0, 7)); }
  const mv = months.map(m => D.visits.filter(v => v.date.startsWith(m)).length), mx = Math.max(1, ...mv);
  const A = D.patients.filter(p => p.arm === 'Case' && !p.dropout).length, B = D.patients.filter(p => p.arm === 'Control' && !p.dropout).length;
  main().innerHTML = `${chips('ay', ['JR1', 'JR2', 'JR3'], yr)}
  <div class="card"><h3>Logbook quota — ${yr} (performed vs yearly share of target)</h3>${procs.slice(0, 20).map(([nm, n, t]) => `<div class="hbar"><span>${esc(nm)}</span><div class="bar"><i style="width:${t ? Math.min(100, n / t * 100) : 100}%" class="${t && n >= t ? 'ok' : ''}"></i></div><b>${n}/${t}</b></div>`).join('') || '<p class="muted">No targets set</p>'}</div>
  <div class="card"><h3>Thesis recruitment</h3>${D.thesis ? `<div class="hbar"><span>Group A</span><div class="bar"><i style="width:${Math.min(100, A / Math.max(1, D.settings.sampleCase) * 100)}%"></i></div><b>${A}/${D.settings.sampleCase}</b></div><div class="hbar"><span>Group B</span><div class="bar"><i style="width:${Math.min(100, B / Math.max(1, D.settings.sampleControl) * 100)}%"></i></div><b>${B}/${D.settings.sampleControl}</b></div><p class="small">Overdue follow-ups: <b>${D.patients.filter(p => p.arm && !p.dropout).flatMap(p => thesisSchedule(p).filter(s => !s.visit && s.due < today())).length}</b></p>` : '<p class="muted">Thesis not set up</p>'}</div>
  <div class="card"><h3>Case mix</h3><div class="donutrow"><svg viewBox="0 0 40 40" class="donut">${donut}</svg><div>${Object.entries(mix).map(([k, n]) => `<div class="leg"><i style="background:${colors[k]}"></i>${DX_CAT[k]} <b>${n}</b> <small>(${Math.round(n / tot * 100)}%)</small></div>`).join('')}</div></div></div>
  <div class="card"><h3>Visits — last 6 months</h3><div class="cols">${months.map((m, i) => `<div><i style="height:${mv[i] / mx * 100}%"></i><b>${mv[i]}</b><small>${MON[+m.slice(5) - 1]}</small></div>`).join('')}</div></div>
  <div class="card"><h3>Academic buckets</h3>${BUCKETS.map(b => `<div class="hbar"><span>${b}</span><div class="bar"><i style="width:${D.patients.length ? D.patients.filter(p => (p.buckets || []).includes(b)).length / D.patients.length * 100 : 0}%"></i></div><b>${D.patients.filter(p => (p.buckets || []).includes(b)).length}</b></div>`).join('')}</div>`;
  $('[data-group="ay"]').addEventListener('click', () => setTimeout(() => go('#/analytics?y=' + getChips('ay'))));
}

/* ---------- FORMULARY & CALCULATORS ---------- */
function vFormulary() {
  setTitle('Formulary', false);
  const tab = ROUTE.q.t || 'drugs', w = +(ROUTE.q.w || D.settings.lastWt || 0);
  const tabs = [['drugs', '💊 Drugs'], ['iso', 'Isotretinoin'], ['ftu', 'FTU'], ['comp', 'Compounding'], ['ligno', 'Lignocaine']];
  let body = '';
  if (tab === 'drugs') {
    const all = [...FORMULARY_SEED.filter(d => !D.formulary.some(c => c.id === d.id)), ...D.formulary];
    body = `<div class="grid2"><label>Patient weight (kg)<input id="fw" type="number" inputmode="decimal" value="${w || ''}"></label><label>Search<input id="fs" type="search" placeholder="drug or class"></label></div>
    <p class="warn small">Personal quick reference — verify every dose against current guidelines, the product label and the patient's renal/hepatic status before prescribing.</p>
    <div id="dl">${all.map(d => drugCard(d, w)).join('')}</div><button class="btn ghost sm" data-act="drugadd">+ Add / override a drug</button>`;
  }
  if (tab === 'iso') body = `<div class="form card"><div class="grid2"><label>Weight (kg)<input id="iw" type="number" value="${w || ''}"></label><label>Daily dose (mg)<input id="id" type="number" value="20"></label></div>
    <div class="grid2"><label>Already taken (mg total)<input id="ig" type="number" value="0"></label><label>Target (mg/kg)<select id="it">${optList([['120', '120'], ['135', '135'], ['150', '150']], '120')}</select></label></div>
    <div class="result" id="ires"></div><p class="small muted">Tip: estimate “already taken” as daily dose × days. Track pregnancy tests and lipids monthly.</p></div>`;
  if (tab === 'ftu') body = `<div class="card"><h3>Adults <small>(1 FTU ≈ 0.5 g)</small></h3><table class="tbl"><tr><th>Area</th><th>FTU</th><th>Grams</th></tr>${FTU_ADULT.map(([a, f]) => `<tr><td>${a}</td><td>${f}</td><td>${f / 2}</td></tr>`).join('')}<tr><th>Whole body</th><th>≈ 40</th><th>≈ 20 g / application</th></tr></table>
    <svg viewBox="0 0 300 120" class="ftu"><rect x="30" y="50" width="200" height="34" rx="17" class="fing"/><rect x="30" y="50" width="70" height="34" rx="0" class="cream"/><line x1="100" y1="44" x2="100" y2="92" stroke-dasharray="3 3"/><text x="65" y="40" class="zl">1 FTU</text><text x="160" y="110" class="zl">Distal phalanx crease → fingertip</text></svg></div>
    <div class="card"><h3>Children (FTU per application)</h3><table class="tbl"><tr><th>Age</th>${FTU_CHILD.cols.map(c => `<th>${c}</th>`).join('')}</tr>${FTU_CHILD.rows.map(([a, r]) => `<tr><td>${a}</td>${r.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</table></div>
    <div class="form card"><h3>Tube calculator</h3><div class="grid2"><label>FTU per application<input id="ff" type="number" value="4"></label><label>Applications/day<input id="fa" type="number" value="2"></label></div><label>Days<input id="fd" type="number" value="14"></label><div class="result" id="fres"></div></div>`;
  if (tab === 'comp') body = `<div class="form card"><label>Formula<select id="cf">${optList(COMPOUNDS.map((c, i) => [i, c.name]), ROUTE.q.f || 0)}</select></label><label>Total quantity (g)<input id="cq" type="number" value="30"></label><div class="result" id="cres"></div>
    <p class="small muted">Custom: <input id="cc" placeholder="e.g. Salicylic acid 3, Clobetasol 0.05" style="width:100%"></p></div>`;
  if (tab === 'ligno') body = `<div class="form card"><label>Weight (kg)<input id="lw" type="number" value="${w || 60}"></label><div class="result" id="lres"></div>
    <p class="small muted">Max 4.5 mg/kg plain (≤300 mg); 7 mg/kg with adrenaline (≤500 mg). 1% = 10 mg/mL, 2% = 20 mg/mL. Avoid adrenaline in digital blocks only if vascular compromise is a concern; use plain for nail surgery per local protocol.</p></div>`;
  main().innerHTML = `<div class="chips scroll">${tabs.map(([k, l]) => `<a class="chip${k === tab ? ' on' : ''}" href="#/formulary?t=${k}&w=${w || ''}">${l}</a>`).join('')}</div>${body}`;
  if (tab === 'drugs') {
    const f = () => { const ww = +val('fw'), s = val('fs').toLowerCase(); D.settings.lastWt = ww; $('#dl').innerHTML = [...FORMULARY_SEED.filter(d => !D.formulary.some(c => c.id === d.id)), ...D.formulary].filter(d => !s || (d.name + ' ' + d.cls).toLowerCase().includes(s)).map(d => drugCard(d, ww)).join(''); };
    $('#fw').oninput = f; $('#fs').oninput = f;
  }
  if (tab === 'iso') { const f = () => { const r = isoCalc(+val('iw'), +val('id'), +val('ig'), +val('it')); $('#ires').innerHTML = +val('iw') ? `Current dose: <b>${Math.round(+val('id') / +val('iw') * 100) / 100} mg/kg/day</b><br>Target cumulative: <b>${r.target} mg</b><br>Remaining: <b>${r.remaining} mg</b> ≈ <b>${r.days ?? '—'} days</b> (${r.days ? Math.round(r.days / 30 * 10) / 10 : '—'} months) at current dose` : 'Enter weight'; }; ['iw', 'id', 'ig', 'it'].forEach(i => $('#' + i).oninput = f); f(); }
  if (tab === 'ftu') { const f = () => { const g = +val('ff') * 0.5 * +val('fa') * +val('fd'); $('#fres').innerHTML = `Needs ≈ <b>${r1(g)} g</b> → ${Math.ceil(g / 15)} × 15 g or ${Math.ceil(g / 30)} × 30 g tubes`; }; ['ff', 'fa', 'fd'].forEach(i => $('#' + i).oninput = f); f(); }
  if (tab === 'comp') { const f = () => { const q = +val('cq'); let parts = COMPOUNDS[+val('cf')].parts, base = COMPOUNDS[+val('cf')].base; if (val('cc')) { parts = val('cc').split(',').map(s => { const m = s.trim().match(/^(.*?)\s+([\d.]+)%?$/); return m ? [m[1], +m[2]] : null; }).filter(Boolean); base = 'Base'; } const sum = parts.reduce((a, p) => a + p[1], 0); $('#cres').innerHTML = `<table class="tbl">${parts.map(([n, p]) => `<tr><td>${esc(n)} ${p}%</td><td><b>${q * p / 100 >= 1 ? Math.round(q * p) / 100 + ' g' : Math.round(q * p * 10) + ' mg'}</b></td></tr>`).join('')}<tr><td>${esc(base)} q.s.</td><td><b>${r1(q - q * sum / 100)} g</b></td></tr></table>`; }; ['cf', 'cq', 'cc'].forEach(i => $('#' + i).oninput = f); f(); }
  if (tab === 'ligno') { const f = () => { const r = lignoCalc(+val('lw')); $('#lres').innerHTML = `<table class="tbl"><tr><th></th><th>Max mg</th><th>1% (mL)</th><th>2% (mL)</th></tr><tr><td>Plain</td><td>${r.plain}</td><td>${r.plain1}</td><td>${r.plain2}</td></tr><tr><td>With adrenaline</td><td>${r.adr}</td><td>${r.adr1}</td><td>${r.adr2}</td></tr></table>`; }; $('#lw').oninput = f; f(); }
}
function drugCard(d, w) {
  let calc = '';
  if (w && d.kg) { const lo = d.kg[0] * w, hi = d.kg[1] * w, cap = d.max; const f = x => cap ? Math.min(x, cap) : x; calc = `<div class="calc">${w} kg → <b>${r1(f(lo))}${d.kg[0] !== d.kg[1] ? '–' + r1(f(hi)) : ''} ${d.per.includes('MU') ? 'MU' : 'mg'}</b> <small>(${d.kg.join('–')} ${esc(d.per)}${cap ? ', max ' + cap : ''})</small></div>`; }
  if (w && d.bands) { const b = d.bands.find(([a, z]) => w >= a && w < z); if (b) calc = `<div class="calc">${w} kg → <b>${b[2]}</b></div>`; }
  return `<details class="drug"><summary><b>${esc(d.name)}</b> <small>${esc(d.cls)}</small>${calc}</summary>
  <p><b>Adult:</b> ${esc(d.adult)}</p>${d.peds ? `<p><b>Paediatric:</b> ${esc(d.peds)}</p>` : d.kg ? `<p><b>Weight-based:</b> ${d.kg.join('–')} ${esc(d.per)}${d.max ? ' (max ' + d.max + ')' : ''}</p>` : ''}
  ${d.notes ? `<p><b>Notes:</b> ${esc(d.notes)}</p>` : ''}${d.monitor ? `<p><b>Monitor:</b> ${esc(d.monitor)}</p>` : ''}<button class="btn xs ghost" data-act="drugedit" data-id="${d.id}">Edit</button></details>`;
}
const drugForm = d => `<h3>${d ? 'Edit' : 'Add'} drug</h3><div class="form"><label>Name<input id="d_name" value="${esc(d?.name || '')}"></label><label>Class<input id="d_cls" value="${esc(d?.cls || '')}"></label>
<label>Adult dose<input id="d_adult" value="${esc(d?.adult || '')}"></label><label>Paediatric dose<input id="d_peds" value="${esc(d?.peds || '')}"></label>
<div class="grid3"><label>mg/kg min<input id="d_k0" type="number" step="any" value="${d?.kg?.[0] ?? ''}"></label><label>mg/kg max<input id="d_k1" type="number" step="any" value="${d?.kg?.[1] ?? ''}"></label><label>Max dose<input id="d_max" type="number" step="any" value="${d?.max ?? ''}"></label></div>
<label>Per (unit)<input id="d_per" value="${esc(d?.per || 'mg/kg/day')}"></label><label>Notes<textarea id="d_notes">${esc(d?.notes || '')}</textarea></label><label>Monitoring<input id="d_mon" value="${esc(d?.monitor || '')}"></label>
<div class="actions">${d && D.formulary.some(x => x.id === d.id) ? `<button class="btn ghost danger" data-act="drugdel" data-id="${d.id}">${FORMULARY_SEED.some(x => x.id === d.id) ? 'Reset' : 'Delete'}</button>` : ''}<button class="btn ghost" data-act="closesheet">Cancel</button><button class="btn" data-act="drugsave" data-id="${d?.id || ''}">Save</button></div></div>`;
ACT.drugadd = () => openSheet(drugForm(null));
ACT.drugedit = el => openSheet(drugForm(D.formulary.find(x => x.id === el.dataset.id) || FORMULARY_SEED.find(x => x.id === el.dataset.id)));
ACT.drugsave = el => { const id = el.dataset.id || uid(); const k0 = val('d_k0'), k1 = val('d_k1'); const d = { id, name: val('d_name'), cls: val('d_cls'), adult: val('d_adult'), peds: val('d_peds'), kg: k0 !== '' ? [+k0, k1 !== '' ? +k1 : +k0] : null, max: val('d_max') !== '' ? +val('d_max') : null, per: val('d_per'), notes: val('d_notes'), monitor: val('d_mon') }; if (!d.name) return toast('Name required'); D.formulary = D.formulary.filter(x => x.id !== id).concat(d); Store.save(); closeSheet(); render(); };
ACT.drugdel = el => { D.formulary = D.formulary.filter(x => x.id !== el.dataset.id); Store.save(); closeSheet(); render(); };

/* ---------- OT CHECKLISTS ---------- */
function vChecklists() {
  setTitle('Minor OT checklists', false);
  const k = +(ROUTE.q.k || 0), C = CHECKLISTS[k], st = D.checks[C.name] || [];
  main().innerHTML = `<div class="chips scroll">${CHECKLISTS.map((c, i) => `<a class="chip${i === k ? ' on' : ''}" href="#/checklists?k=${i}">${c.name}</a>`).join('')}</div>
  <div class="card"><div class="row between"><h3>${C.name}</h3><span class="badge ${st.filter(Boolean).length === C.items.length ? 'green' : ''}">${st.filter(Boolean).length}/${C.items.length}</span></div>
  ${C.items.map((it, i) => `<label class="check"><input type="checkbox" data-act="chk" data-i="${i}" ${st[i] ? 'checked' : ''}> <span>${esc(it)}</span></label>`).join('')}
  <div class="btnrow"><button class="btn sm ghost" data-act="chkreset">Reset for next case</button><a class="btn sm" href="#/formulary?t=ligno">Lignocaine limits</a></div></div>`;
}
ACT.chk = el => { const C = CHECKLISTS[+(ROUTE.q.k || 0)]; const st = D.checks[C.name] = D.checks[C.name] || []; st[+el.dataset.i] = el.checked; Store.save(); const n = st.filter(Boolean).length; $('.badge').textContent = n + '/' + C.items.length; if (n === C.items.length) toast('Tray ready ✓'); };
ACT.chkreset = () => { delete D.checks[CHECKLISTS[+(ROUTE.q.k || 0)].name]; Store.save(); render(); };

/* ---------- MORE & SETTINGS ---------- */
/* ---------- PROFILE (Instagram-style; replaces "More") ---------- */
function vMore() {
  const s = D.settings, name = s.name || 'Your profile', yr = residencyYear(new Date());
  setTitle(name, false, `<button class="icon" data-act="lock" aria-label="Lock app">${ic('lock')}</button><a class="icon" href="#/settings" aria-label="Settings">${ic('menu')}</a>`);
  const perf = D.logbook.filter(l => l.role === 'Performed').length;
  const t = [['#/batch', 'users', 'Batch'], ['#/journal', 'news', 'Journal'], ['#/logbook', 'book', 'Logbook'], ['#/thesis', 'grad', 'Thesis'], ['#/inv', 'flask', 'Reports'], ['#/cal', 'calendar', 'Follow-ups'], ['#/analytics', 'chart', 'Analytics'], ['#/formulary', 'pill', 'Formulary'], ['#/checklists', 'check', 'OT lists'], ['#/settings', 'settings', 'Settings']];
  if (amAdmin()) t.unshift(['#/admin', 'shield', 'Admin']);
  const ph = [...D.photos].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  main().innerHTML = `${inviteCardHTML()}<section class="prof">
    <div class="phead"><div class="pbig hot">${esc(initials(s.name || 'PG'))}</div>
      <div class="pstats"><a href="#/patients"><b>${D.patients.length}</b><small>patients</small></a><a href="#/vault"><b>${D.photos.length}</b><small>photos</small></a><a href="#/logbook"><b>${perf}</b><small>procedures</small></a></div></div>
    <div class="pbio"><b>${esc(s.name ? 'Dr. ' + s.name : 'Add your name in Settings')}</b><span>MD Dermatology, Venereology & Leprosy · ${esc(yr)}</span>${s.inst || s.unit ? `<span class="muted">${esc([s.inst, s.unit].filter(Boolean).join(' · '))}</span>` : ''}</div>
    <div class="pbtns"><a class="btn ghost sm" href="#/settings">Edit profile</a><a class="btn ghost sm" href="#/batch">Batch hub</a></div>
    <div class="highlights">${t.map(([h, i, l]) => `<a class="tile hl" href="${h}"><span class="sav">${ic(i)}</span><span>${l}</span></a>`).join('')}</div>
    <div class="ptabs"><span class="on" aria-label="Photos">${ic('grid')}</span></div>
    <div class="pgrid">${ph.length ? ph.map(x => `<a href="#/photo/${x.id}"><img data-pid="${x.id}" data-thumb="1" alt=""></a>`).join('') : `<p class="muted small center" style="grid-column:1/-1;padding:24px 0">Your clinical photos appear here — encrypted, only on your devices and your Drive.</p>`}</div>
  </section>`;
  hydrateImgs();
}
function vSettings() {
  setTitle('Settings', false);
  const s = D.settings;
  main().innerHTML = `<div id="synccard">${syncCardHTML()}</div><div class="form card"><h3>Profile</h3>
  <label>Your name<input id="s_name" value="${esc(s.name)}"></label><label>Institution<input id="s_inst" value="${esc(s.inst || '')}"></label>
  <div class="grid2"><label>Unit<input id="s_unit" value="${esc(s.unit)}"></label><label>Residency start date<input id="s_start" type="date" value="${esc(s.residencyStart)}"></label></div>
  <label>Default patient language${chips('s_lang', [['en', 'English'], ['hi', 'हिन्दी'], ['te', 'తెలుగు']], s.lang)}</label>
  <label>Auto-lock after inactivity (a refresh keeps you signed in until then)<select id="s_lock">${optList([['3', '3 minutes'], ['5', '5 minutes'], ['15', '15 minutes'], ['30', '30 minutes'], ['60', '1 hour'], ['240', '4 hours'], ['720', '12 hours']], String(s.lockMin))}</select></label>
  <button class="btn sm" data-act="ssave">Save</button></div>
  <div class="form card"><h3>Community profile</h3><p class="small muted">Shown to other residents on your profile and the leaderboard.</p>
  <label>College<input id="s_col" maxlength="80" value="${esc((D.community || {}).college || s.inst || '')}"></label><label>Short bio<textarea id="s_bio" rows="2" maxlength="200">${esc((D.community || {}).bio || '')}</textarea></label>
  <label class="row"><input type="checkbox" id="s_board" ${(D.community || {}).board === false ? '' : 'checked'}> <span>Show me on the leaderboard</span></label><button class="btn sm" data-act="scsave">Save</button></div>
  <div class="card"><h3>Backup & restore</h3><p class="small muted">Backups stay encrypted with your PIN. Save the .pgbak file to Google Drive / iCloud / email. Last backup: <b>${s.lastBackup ? fmt(s.lastBackup) : 'never'}</b></p>
  <div class="btnrow wrap"><button class="btn" data-act="backup">⬇ Export encrypted backup</button><label class="btn ghost filebtn">⬆ Restore<input type="file" id="restore" accept=".pgbak,application/octet-stream,application/json" hidden></label></div></div>
  <div class="card"><h3>Security</h3><button class="btn sm ghost" data-act="chpin">Change PIN</button> <button class="btn sm ghost" data-act="lock">Lock now</button>
  <p class="small muted">Data is encrypted with AES-256-GCM using a key derived from your PIN (PBKDF2, 310k iterations). The PIN is never stored. <b>If you forget it, data cannot be recovered</b> — keep backups.</p></div>
  <div class="card"><h3>Batch hub</h3><p class="small muted">Shared batch calendar and anonymous logbook comparison (Firebase). ${D.batch ? 'Member of <b>' + esc(D.batch.name) + '</b>.' : 'Not joined.'}</p><a class="btn sm ghost" href="#/batch">Open batch hub</a> ${D.settings.fbConfig ? '<button class="btn sm ghost" data-act="fbcfgclear">Remove custom Firebase config</button>' : ''}</div>
  <div class="card"><h3>Install on your phone</h3><p class="small">Android (Chrome): ⋮ menu → <b>Install app</b> / Add to Home screen.<br>iPhone / iPad (Safari): Share → <b>Add to Home Screen</b>.<br>Once installed, the app works fully offline.</p></div>
  <div class="card"><h3>Danger zone</h3><button class="btn sm danger" data-act="wipe">Erase all data on this device</button></div>
  <p class="small muted center">PG Derma Companion · version ${esc(APP_VERSION)} · <a class="link" href="https://github.com/osmosis0415-a11y/pg-derma-companion/blob/main/CHANGELOG.md" target="_blank" rel="noopener">What's new</a> · storage ${D.photos.length} photos · ${D.patients.length} patients</p>`;
  Drive.loadGis().catch(() => {}); showQuota();
  if (Cloud.cfg() && !Cloud.ready && navigator.onLine) Cloud.init().then(() => { const c = $('#synccard'); if (c && ROUTE.path === 'settings') c.innerHTML = syncCardHTML(); }).catch(() => {});
  $('#restore').onchange = async e => { const f = e.target.files[0]; if (!f || !(await uiConfirm('Restore will REPLACE all data on this device with the backup. Continue?'))) return; try { await importBackup(f); toast('Restored — unlock with the backup PIN'); lockApp(true); } catch (er) { alert('Restore failed: ' + er.message); } };
}
ACT.scsave = () => { const c = Comm.st(); c.college = val('s_col'); c.bio = $('#s_bio').value.trim().slice(0, 200); c.board = $('#s_board').checked; Store.save(); Comm.pushProfile(); toast('Saved'); };
ACT.ssave = () => { Object.assign(D.settings, { name: val('s_name'), inst: val('s_inst'), unit: val('s_unit'), residencyStart: val('s_start'), lang: getChips('s_lang'), lockMin: Math.max(1, +val('s_lock') || 15) }); Store.save(); Session.save(); toast('Saved'); };
ACT.backup = () => exportBackup().then(() => toast('Backup downloaded'));
ACT.chpin = async () => { const o = await uiPrompt('Current PIN', '', { type: 'password', ok: 'Next' }); if (!o) return; const n1 = await uiPrompt('New PIN (min 4 characters)', '', { type: 'password', ok: 'Next' }); if (!n1 || n1.length < 4) return toast('PIN too short'); if ((await uiPrompt('Confirm new PIN', '', { type: 'password', ok: 'Change PIN' })) !== n1) return toast('PINs do not match'); toast('Re-encrypting…', 6000); const ok = await Vault.changePin(o, n1); toast(ok ? 'PIN changed' : 'Current PIN incorrect'); if (ok) { await Session.save(); if (Sync.on()) { await IDB.put('kv', 'psynced', []); Sync.forcePush = true; Sync.run(); toast('PIN changed — re-uploading your encrypted cloud copy. Use the new PIN on your other devices.', 5000); } } };
ACT.wipe = async () => { if (!(await uiType('Delete ALL patient data and photos on this device? This cannot be undone.', 'ERASE'))) return; await IDB.clear('photos'); await IDB.clear('kv'); await IDB.clear('meta'); location.reload(); };
