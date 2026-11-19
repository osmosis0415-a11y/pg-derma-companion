// Unit test for the study content bot + reminders in tools/admin-bot.gs (Apps Script APIs mocked).
const crypto = require('crypto'), fs = require('fs');
const P = { GEMINI_KEY: 'k' }, sent = [], store = {}; let n = 0, geminiCalls = [], modelList = null;
const val = v => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) };
const plain = x => 'stringValue' in x ? x.stringValue : 'integerValue' in x ? +x.integerValue : 'booleanValue' in x ? x.booleanValue : 'timestampValue' in x ? x.timestampValue : 'arrayValue' in x ? (x.arrayValue.values || []).map(plain) : null;
const docOf = (coll, id) => { const f = {}; for (const [k, v] of Object.entries(store[coll + '/' + id])) f[k] = val(v); return { name: 'projects/p/databases/(default)/documents/' + coll + '/' + id, fields: f }; };
const resp = (c, b) => ({ getResponseCode: () => c, getContentText: () => typeof b === 'string' ? b : JSON.stringify(b) });
let geminiText = JSON.stringify({ items: [
  { t: 'mcq', top: 'Pemphigus', q: 'Q1?', o: ['a', 'b', 'c', 'd'], a: 1, x: 'because', r: 'Rook' },
  { t: 'mcq', top: 'Pemphigus', q: 'bad', o: ['a', 'b'], a: 5, x: '' },
  { t: 'card', top: 'Pemphigus', f: 'front', b: 'back' },
  { t: 'spot', top: 'Pemphigus', v: 'vignette', dx: 'PV', x: 'why' },
  { t: 'pearl', top: 'Pemphigus', p: '<b>one</b>' },
  { t: 'evil', p: 'x' }] });
const g = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => P[k] ?? null, setProperty: (k, v) => P[k] = v }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'admin@x.com' }) },
  Utilities: { getUuid: () => crypto.randomUUID(), computeHmacSha256Signature: (m, k) => [...crypto.createHmac('sha256', k).update(m).digest()], base64EncodeWebSafe: b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    formatDate: (d, tz, f) => { const s = new Date(d.getTime() + 5.5 * 36e5).toISOString(); return f === 'H' ? String(+s.slice(11, 13)) : f === 'yyyy-MM-dd' ? s.slice(0, 10) : s.slice(0, 10) + '-' + s.slice(11, 13) + s.slice(14, 16); } },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://w/exec' }), getOAuthToken: () => 'T', getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => 1 }), everyDays: () => ({ atHour: () => ({ create: () => 1 }) }), everyHours: () => ({ create: () => 1 }) }) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  MailApp: { sendEmail: o => sent.push(o), getRemainingDailyQuota: () => 90 }, Logger: { log: () => {} },
  HtmlService: { createHtmlOutput: h => ({ h, setTitle() { return this; }, setXFrameOptionsMode() { return this; } }), XFrameOptionsMode: { DEFAULT: 1 } },
  UrlFetchApp: { fetch: (url, o = {}) => {
    if (url.includes('generativelanguage')) {
      if (url.includes('/models?')) return resp(200, { models: modelList });
      geminiCalls.push(url); if (url.includes('gemini-2.5-flash:') && modelList) return resp(404, 'gone'); if (url.includes('gemini-omni-9.5-flash:')) return resp(429, 'quota 0');
      return resp(200, { candidates: [{ content: { parts: [{ text: geminiText }] } }] });
    }
    const path = url.split('/documents')[1];
    if (path === ':runQuery') { const q = JSON.parse(o.payload).structuredQuery, coll = q.from[0].collectionId, w = q.where && q.where.fieldFilter;
      const docs = Object.keys(store).filter(k => k.startsWith(coll + '/')).map(k => k.split('/')[1]).filter(id => !w || store[coll + '/' + id][w.field.fieldPath] === plain(w.value));
      return resp(200, docs.length ? docs.map(id => ({ document: docOf(coll, id) })) : [{ readTime: 'x' }]); }
    const [, coll, rawId] = path.split('?')[0].split('/'), id = rawId && decodeURIComponent(rawId);
    if (o.method === 'post') { const nid = 'd' + (++n), obj = {}; for (const [k, v] of Object.entries(JSON.parse(o.payload).fields)) obj[k] = plain(v); store[coll + '/' + nid] = obj; return resp(200, { name: '.../' + coll + '/' + nid }); }
    if (o.method === 'patch') { for (const [k, v] of Object.entries(JSON.parse(o.payload).fields)) store[coll + '/' + id][k] = plain(v); return resp(200, docOf(coll, id)); }
    if (o.method === 'delete') { delete store[coll + '/' + id]; return resp(200, {}); }
    if (!store[coll + '/' + id]) return resp(404, 'nf');
    return resp(200, docOf(coll, id));
  } }
};
const src = fs.readFileSync(require('path').join(__dirname, '../../tools/admin-bot.gs'), 'utf8');
const B = new Function(...Object.keys(g), src + ';return {makeContent,doGet,cdecide,nudge,link_,setupStudy};')(...Object.values(g));
const ok = (name, c) => console.log((c ? 'PASS ' : 'FAIL ') + name);
const made = B.makeContent('Pemphigus group');
const items = Object.entries(store).filter(([k]) => k.startsWith('content/'));
ok('valid items saved, invalid dropped', made === 4 && items.length === 4);
ok('all saved as drafts from ai', items.every(([, v]) => v.status === 'draft' && v.src === 'ai' && v.tag));
ok('review email sent to admin', sent.length === 1 && sent[0].to === 'admin@x.com' && sent[0].htmlBody.includes('Publish all 4'));
ok('email escapes html', sent[0].htmlBody.includes('&lt;b&gt;one') && !sent[0].htmlBody.includes('<b>one'));
ok('gemini key sent in header, not URL', geminiCalls.every(u => !u.includes('key=')));
const [mcqId] = items.find(([, v]) => v.t === 'mcq')[0].split('/').slice(1);
const L = Object.fromEntries(new URL(B.link_(mcqId, 'capprove')).searchParams);
ok('confirm page does not publish', B.doGet({ parameter: L }).h.includes('Confirm: Publish') && store['content/' + mcqId].status === 'draft');
ok('bad signature refused', B.doGet({ parameter: { ...L, s: 'x' } }).h.includes('not valid'));
let threw = false; try { B.cdecide(mcqId, 'capprove', 'bad'); } catch (e) { threw = true; } ok('cdecide rejects bad sig', threw);
threw = false; try { B.cdecide(mcqId, 'creject', L.s); } catch (e) { threw = true; } ok('publish sig cannot discard', threw);
ok('publish one', B.cdecide(mcqId, 'capprove', L.s).includes('Published') && store['content/' + mcqId].status === 'live');
const pearl = items.find(([, v]) => v.t === 'pearl')[0].split('/')[1];
ok('discard deletes', B.cdecide(pearl, 'creject', Object.fromEntries(new URL(B.link_(pearl, 'creject')).searchParams).s).includes('Discarded') && !store['content/' + pearl]);
const tag = store['content/' + mcqId].tag, A = Object.fromEntries(new URL(B.link_(tag, 'capproveall')).searchParams);
ok('publish-all page counts drafts', B.doGet({ parameter: A }).h.includes('Publish 2 drafted'));
ok('publish all', B.cdecide(tag, 'capproveall', A.s).includes('Published 2') && Object.entries(store).filter(([k, v]) => k.startsWith('content/') && v.status === 'live').length === 3);
// retired model → falls back to listed flash model
modelList = [{ name: 'models/gemini-omni-9.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-9.0-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-9.0-flash-lite', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-9.0-flash-preview', supportedGenerationMethods: ['generateContent'] }];
geminiCalls = []; B.makeContent('Psoriasis');
ok('skips no-quota (429) model, falls back to next free flash model', P.GEMINI_MODEL === 'gemini-9.0-flash' && geminiCalls.some(u => u.includes('gemini-9.0-flash:')));
// nudges
const hr = +new Date(Date.now() + 5.5 * 36e5).toISOString().slice(11, 13), today = new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 10), yest = new Date(Date.now() + 5.5 * 36e5 - 864e5).toISOString().slice(0, 10);
store['study/a'] = { remind: true, hour: hr, last: yest, streak: 6, email: 'a@x.com', name: 'Asha K', goal: 10 };
store['study/b'] = { remind: true, hour: hr, last: today, streak: 2, email: 'b@x.com', name: 'Bo' };
store['study/c'] = { remind: true, hour: (hr + 3) % 24, last: '', streak: 0, email: 'c@x.com', name: 'Cy' };
store['study/d'] = { remind: false, hour: hr, last: '', streak: 0, email: 'd@x.com', name: 'Di' };
sent.length = 0; B.nudge();
ok('nudges only due, not-yet-studied, opted-in', sent.length === 1 && sent[0].to === 'a@x.com' && sent[0].subject.includes('6-day streak'));
B.nudge(); ok('no duplicate nudge same day', sent.length === 1);
