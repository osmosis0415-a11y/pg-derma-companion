/* ===== Core: utils, IndexedDB, AES-GCM vault, store, exports ===== */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2));
const ymd = d => { d = new Date(d); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const today = () => ymd(new Date());
const addDays = (s, k) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + k); return ymd(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = s => { if (!s) return ''; const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); };
const toast = (m, ms = 2200) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); };
const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const anchorDownload = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); };
/* On phones, the share sheet is the reliable way to save to Files / Drive / WhatsApp; desktop downloads directly. */
async function download(blob, name) {
  if (isMobile && navigator.canShare) {
    const f = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  }
  anchorDownload(blob, name);
}

/* ---------- IndexedDB ---------- */
const IDB = {
  db: null,
  open() { return new Promise((res, rej) => { const r = indexedDB.open('pgderma', 1); r.onupgradeneeded = () => { const d = r.result; ['meta', 'kv', 'photos'].forEach(s => d.objectStoreNames.contains(s) || d.createObjectStore(s)); }; r.onsuccess = () => { this.db = r.result; res(); }; r.onerror = () => rej(r.error); }); },
  tx(store, mode, fn) { return new Promise((res, rej) => { const t = this.db.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); },
  get(s, k) { return this.tx(s, 'readonly', o => o.get(k)); },
  put(s, k, v) { return this.tx(s, 'readwrite', o => o.put(v, k)); },
  del(s, k) { return this.tx(s, 'readwrite', o => o.delete(k)); },
  keys(s) { return this.tx(s, 'readonly', o => o.getAllKeys()); },
  clear(s) { return this.tx(s, 'readwrite', o => o.clear()); }
};

/* ---------- AES-256-GCM vault (key derived from PIN with PBKDF2-SHA256) ---------- */
const ITER = 310000;
const Vault = {
  key: null,
  async derive(pin, salt, iter = ITER) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async enc(buf, key = this.key) { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv, data: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf) }; },
  async dec(o, key = this.key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: o.iv }, key, o.data); },
  async encJSON(x, key) { return this.enc(new TextEncoder().encode(JSON.stringify(x)), key); },
  async decJSON(o, key) { return JSON.parse(new TextDecoder().decode(await this.dec(o, key))); },
  async setup(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    this.key = await this.derive(pin, salt);
    await IDB.put('meta', 'auth', { salt, iter: ITER, check: await this.encJSON('PGDERMA-OK') });
  },
  async unlock(pin) {
    const a = await IDB.get('meta', 'auth');
    const k = await this.derive(pin, a.salt, a.iter || ITER);
    try { if ((await this.decJSON(a.check, k)) !== 'PGDERMA-OK') return false; } catch (e) { return false; }
    this.key = k; return true;
  },
  async changePin(oldPin, newPin) {
    if (!(await this.unlock(oldPin))) return false;
    const oldKey = this.key;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const nk = await this.derive(newPin, salt);
    for (const k of await IDB.keys('photos')) { const o = await IDB.get('photos', k); const plain = await this.dec(o, oldKey); await IDB.put('photos', k, await this.enc(plain, nk)); }
    const drt = await IDB.get('kv', 'drt').catch(() => null); if (drt) await IDB.put('kv', 'drt', await this.enc(await this.dec(drt, oldKey), nk));
    this.key = nk;
    await IDB.put('meta', 'auth', { salt, iter: ITER, check: await this.encJSON('PGDERMA-OK') });
    await Store.flush();
    return true;
  }
};

/* ---------- In-memory store, persisted encrypted ---------- */
let D = null;
const EMPTY_DB = () => ({
  v: 1,
  settings: { name: '', residencyStart: '', unit: '', lang: 'en', lockMin: 15, procTargets: {}, sampleCase: 30, sampleControl: 30 },
  patients: [], visits: [], scores: [], pins: [], photos: [], logbook: [], inv: [], reminders: [],
  formulary: [], templates: {}, checks: {},
  thesis: null, study: null, studyCloud: [], community: null
});
const Store = {
  _t: null,
  async load() { const o = await IDB.get('kv', 'db'); D = o ? await Vault.decJSON(o) : EMPTY_DB(); const e = EMPTY_DB(); for (const k in e) if (D[k] === undefined) D[k] = e[k]; for (const k in e.settings) if (D.settings[k] === undefined) D.settings[k] = e.settings[k]; },
  save() { clearTimeout(this._t); this._t = setTimeout(() => this.flush(), 300); },
  async flush() { clearTimeout(this._t); if (!D || !Vault.key) return; await IDB.put('kv', 'db', await Vault.encJSON(D)); if (typeof Sync !== 'undefined' && !Sync.quiet && Sync.on()) Sync.schedule(); }
};
const P = id => D.patients.find(p => p.id === id);
const V = id => D.visits.find(v => v.id === id);
const visitsOf = pid => D.visits.filter(v => v.pid === pid).sort((a, b) => a.date.localeCompare(b.date));
const photosOf = pid => D.photos.filter(p => p.pid === pid).sort((a, b) => a.at.localeCompare(b.at));
const ptLabel = p => p ? (p.uhid + (p.name ? ' · ' + p.name : '')) : '—';
const residencyYear = dateStr => {
  const s = D.settings.residencyStart; if (!s) return 'JR1';
  const m = (new Date(dateStr) - new Date(s)) / (365.25 * 864e5);
  return m < 1 ? 'JR1' : m < 2 ? 'JR2' : 'JR3';
};

/* ---------- Photos: resize (strips EXIF), encrypt, cache ---------- */
const urlCache = new Map();
async function loadBitmap(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch (e) { return await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); }); }
}
function canvasFrom(img, maxSide) {
  const w0 = img.width || img.videoWidth, h0 = img.height || img.videoHeight;
  const s = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
}
const toBlob = (c, q = 0.88) => new Promise(r => c.toBlob(r, 'image/jpeg', q));
async function savePhoto(source, meta) {
  const full = canvasFrom(source, 2400), thumb = canvasFrom(source, 360);
  const id = uid();
  const fb = await toBlob(full), tb = await toBlob(thumb, 0.8);
  await IDB.put('photos', id, await Vault.enc(await fb.arrayBuffer()));
  await IDB.put('photos', id + '_t', await Vault.enc(await tb.arrayBuffer()));
  const rec = Object.assign({ id, at: new Date().toISOString(), w: full.width, h: full.height, deid: false, cat: 'Clinical', site: '' }, meta);
  D.photos.push(rec); Store.save(); return rec;
}
async function photoURL(id, thumb) {
  const k = thumb ? id + '_t' : id;
  if (urlCache.has(k)) return urlCache.get(k);
  const o = await IDB.get('photos', k); if (!o) return '';
  const url = URL.createObjectURL(new Blob([await Vault.dec(o)], { type: 'image/jpeg' }));
  urlCache.set(k, url); return url;
}
async function photoBlob(id) { const o = await IDB.get('photos', id); return new Blob([await Vault.dec(o)], { type: 'image/jpeg' }); }
async function deletePhoto(id) { await IDB.del('photos', id); await IDB.del('photos', id + '_t'); D.photos = D.photos.filter(p => p.id !== id); for (const k of [id, id + '_t']) { if (urlCache.has(k)) { URL.revokeObjectURL(urlCache.get(k)); urlCache.delete(k); } } Store.save(); }
async function hydrateImgs(root = document) { for (const im of $$('img[data-pid]', root)) { im.src = await photoURL(im.dataset.pid, im.dataset.thumb === '1'); } }

/* ---------- Encrypted backup (.pgbak) — binary container, memory-friendly ----------
   Layout: "PGBK1" | uint32 LE header length | header JSON | raw ciphertext blobs (in header order).
   Everything stays AES-GCM encrypted with the PIN-derived key; the PIN is needed to restore. */
async function exportBackup() {
  await Store.flush();
  const auth = await IDB.get('meta', 'auth');
  const entries = [], parts = [];
  const add = (store, k, o) => { entries.push({ s: store, k, iv: b64(o.iv), n: o.data.byteLength }); parts.push(o.data); };
  add('kv', 'db', await IDB.get('kv', 'db'));
  for (const k of await IDB.keys('photos')) add('photos', k, await IDB.get('photos', k));
  const header = new TextEncoder().encode(JSON.stringify({ app: 'pg-derma-companion', v: 2, created: new Date().toISOString(), auth: { salt: b64(auth.salt), iter: auth.iter, check: { iv: b64(auth.check.iv), data: b64(auth.check.data) } }, entries }));
  const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, header.length, true);
  await download(new Blob([new TextEncoder().encode('PGBK1'), len, header, ...parts], { type: 'application/octet-stream' }), 'pgderma-backup-' + today() + '.pgbak');
  D.settings.lastBackup = new Date().toISOString(); Store.save();
}
async function importBackup(file) {
  const magic = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (magic !== 'PGBK1') throw new Error('Not a PG Derma backup file');
  const hl = new DataView(await file.slice(5, 9).arrayBuffer()).getUint32(0, true);
  let h; try { h = JSON.parse(new TextDecoder().decode(await file.slice(9, 9 + hl).arrayBuffer())); } catch (e) { throw new Error('Backup file is incomplete or damaged'); }
  let off = 9 + hl; const total = h.entries.reduce((a, e) => a + e.n, 0);
  if (off + total !== file.size) throw new Error('Backup file is incomplete or damaged');
  /* verify the database blob decrypts structure-wise before wiping anything */
  if (!h.entries.length || h.entries[0].k !== 'db') throw new Error('Backup has no database');
  await IDB.clear('photos'); await IDB.clear('kv');
  await IDB.put('meta', 'auth', { salt: unb64(h.auth.salt), iter: h.auth.iter, check: { iv: unb64(h.auth.check.iv), data: unb64(h.auth.check.data).buffer } });
  for (const e of h.entries) { const data = await file.slice(off, off + e.n).arrayBuffer(); off += e.n; await IDB.put(e.s, e.k, { iv: unb64(e.iv), data }); }
}

/* ---------- Minimal XLSX writer (stored ZIP + SpreadsheetML, no dependencies) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
  for (const [name, str] of files) {
    const nb = enc.encode(name), data = typeof str === 'string' ? enc.encode(str) : str, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
const xesc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function sheetXML(rows) {
  const body = rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => {
    const ref = colName(ci) + (ri + 1), st = ri === 0 ? ' s="1"' : '';
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>';
    return '<c r="' + ref + '" t="inlineStr"' + st + '><is><t xml:space="preserve">' + xesc(v) + '</t></is></c>';
  }).join('') + '</row>').join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>' + body + '</sheetData></worksheet>';
}
function makeXLSX(sheets) { /* sheets: [[name, rows[][]], ...] */
  const n = sheets.length;
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => '<sheet name="' + xesc(s[0].slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ...sheets.map((s, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', sheetXML(s[1])])
  ];
  const b = zip(files);
  return new Blob([b], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const toCSV = rows => rows.map(r => r.map(v => { v = v ?? ''; v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n');

/* ---------- Calendar (.ics) ---------- */
function makeICS(events) {
  const dt = s => s.replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PG Derma Companion//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', 'UID:' + e.id + '@pgderma', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z');
    if (e.time) { const t = e.time.replace(':', '') + '00'; lines.push('DTSTART:' + dt(e.date) + 'T' + t, 'DURATION:PT15M'); }
    else lines.push('DTSTART;VALUE=DATE:' + dt(e.date), 'DTEND;VALUE=DATE:' + dt(addDays(e.date, 1)));
    lines.push('SUMMARY:' + e.title.replace(/[,;]/g, ' '), 'DESCRIPTION:' + (e.desc || '').replace(/\n/g, '\\n').replace(/[,;]/g, ' '),
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new Blob([lines.join('\r\n')], { type: 'text/calendar' });
}

/* ---------- Voice-to-text ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function dictate(target, btn) {
  if (!SR) { toast('Voice input not supported in this browser'); return; }
  const r = new SR(); r.lang = 'en-IN'; r.interimResults = false;
  btn.classList.add('rec');
  r.onresult = e => { const t = e.results[0][0].transcript; target.value = (target.value ? target.value + ' ' : '') + t; target.dispatchEvent(new Event('input')); };
  r.onend = () => btn.classList.remove('rec'); r.onerror = () => { btn.classList.remove('rec'); toast('Voice input stopped'); };
  r.start();
}
