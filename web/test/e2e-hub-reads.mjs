// Batch hub read budget (issue #16 part 5): cold open may read a lot, a warm reopen must read <= 20 documents.
// Counts reads like Firestore bills them: every document delivered by getDoc/getDocs/onSnapshot (listeners: only
// new/changed documents after the first snapshot), plus 1 per empty query. Uses the shared Firestore stand-in.
// Ports: HTTP_PORT (default 8765, serves dist/) and CDP_PORT (default 9333, Chrome --remote-debugging-port).
import fs from 'fs';
const HTTP = process.env.HTTP_PORT || 8765, CDP = process.env.CDP_PORT || 9333;
const MOCK = fs.readFileSync(new URL('./fs-shared-mock.js', import.meta.url), 'utf8');
const DLG = fs.readFileSync(new URL('./dlg-auto.js', import.meta.url), 'utf8');
// Page-side instrumentation: wraps the mock's read calls to count documents, adds '<' / '>' filters (the shared mock
// only knows ==, >=, array-contains) and can simulate a revoked membership (window.__deny).
const INST = `(()=>{ window.__reads = 0; window.__deny = 0;
 const cmp = (c, x) => c.op === '<' ? x < c.v : x > c.v;
 const inst = f => { const g = Object.assign({}, f);
  const split = q => { const m = (q && q.m) || [], lt = m.filter(x => x.op === '<' || x.op === '>'); if (!lt.length) return null; return { lt, rest: m.filter(x => !lt.includes(x) && !x.lim), lim: (m.find(x => x.lim) || {}).lim }; };
  g.getDoc = async r => { const s = await f.getDoc(r); __reads++; return s; };
  g.getDocs = async q => { const sp = split(q); let s;
   if (sp) { s = await f.getDocs(Object.assign({}, q, { m: sp.rest })); let docs = s.docs.filter(d => sp.lt.every(c => cmp(c, d.data()[c.fld]))); if (sp.lim) docs = docs.slice(0, sp.lim); s = { docs, size: docs.length }; }
   else s = await f.getDocs(q);
   __reads += s.docs.length || 1; return s; };
  g.onSnapshot = (q, cb, e) => {
   if (window.__deny && q.p && q.p[0] === 'batches') { setTimeout(() => e && e({ code: 'permission-denied' }), 0); return () => {}; }
   let first = true, prev = new Map();
   return f.onSnapshot(q, s => {
    if (q.c) { let n = 0; const cur = new Map(); for (const d of s.docs) { const j = JSON.stringify(d.data()); cur.set(d.id, j); if (prev.get(d.id) !== j) n++; } if (first && !n) n = 1; prev = cur; __reads += n; }
    else __reads++;
    first = false; return cb(s); }, e); };
  return g; };
 const oi = window.__installFsMock;
 window.__installFsMock = (...a) => { oi(...a); const ci = Cloud.init; Cloud.init = function () { const r = ci.call(this); this.f = inst(this.f); return r; }; };
})();`;
const sleep = ms => new Promise(r => setTimeout(r, ms)); let fails = 0; const chk = (n, c) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const t = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(x => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(), errs = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const cb = pend.get(d.id); pend.delete(d.id); cb(d); } if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result; if (r.exceptionDetails) errs.push('EVAL: ' + (r.exceptionDetails.exception?.description || '').slice(0, 300)); return r.result?.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(window,'FIREBASE_CONFIG',{get(){return null},set(){}});" + DLG + MOCK + INST });
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

const BID = 'DVL-HUBT-0001';
await send('Page.navigate', { url: `http://localhost:${HTTP}/` }); await sleep(1500);
await ev(`localStorage.removeItem('fsmock'); $('#pin').value='1234';$('#pin2')&&($('#pin2').value='1234');$('#unlock').click()`); await sleep(2500);
// seed: 15 members, 15 logstats, 30 events, 150 messages
await ev(`(()=>{ const o = {}, B = 'batches/${BID}', now = Date.now(), day = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
 o[B] = { name: 'Hub test batch', createdBy: 'u2', admins: ['u2'], createdAt: now - 9e8 };
 for (let i = 1; i <= 15; i++) { o[B + '/members/u' + i] = { name: i === 1 ? 'Sriram' : 'Member ' + i, year: 'JR1', joinedAt: now - 8e8 + i }; o[B + '/logstats/u' + i] = { counts: { 'Punch biopsy': { JR1: { P: i, A: 0, O: 0 } } }, updatedAt: now - 7e8 }; }
 for (let i = 0; i < 30; i++) o[B + '/events/e' + i] = { title: 'Seminar ' + i, type: 'Seminar', date: day(-20 + 2 * i), time: '', presenter: '', venue: '', notes: '', createdBy: 'u2', createdAt: now - 6e8 + i * 1000 };
 for (let i = 0; i < 150; i++) o[B + '/messages/m' + String(i).padStart(3, '0')] = { uid: 'u' + (2 + i % 4), name: 'Member ' + (2 + i % 4), text: 'seed message ' + i, at: now - (200 - i) * 60000 };
 localStorage.fsmock = JSON.stringify(o); })()`);
await ev(`__installFsMock('u1','a@x.com','Sriram'); D.settings.name='Sriram'; D.batch = { id: '${BID}', name: 'Hub test batch', events: [], members: [], stats: [], shareStats: false, admin: false }; Store.save()`);
const put = (k, v) => ev(`(()=>{ const o = JSON.parse(localStorage.fsmock); o['batches/${BID}/${k}'] = ${v}; localStorage.fsmock = JSON.stringify(o); new BroadcastChannel('fsmock').postMessage(1); })()`);
const del = k => ev(`(()=>{ const o = JSON.parse(localStorage.fsmock); delete o['batches/${BID}/${k}']; localStorage.fsmock = JSON.stringify(o); new BroadcastChannel('fsmock').postMessage(1); })()`);
const open = async (tab, ms = 1500) => { await ev(`location.hash='#/home'`); await sleep(500); await ev(`__reads=0; location.hash='#/batch?t=${tab}'`); await sleep(ms); return ev(`__reads`); };
const texts = () => ev(`[...document.querySelectorAll('#chatlist .msg p')].map(p=>p.textContent)`);

// cold
const cold = await open('chat');
chk('cold: newest 100 messages shown', (await ev(`Chat.msgs.length`)) === 100 && (await texts()).includes('seed message 149') && !(await texts()).includes('seed message 49'));
chk('cold: events, members, stats cached in D.batch', await ev(`D.batch.events.length===30 && D.batch.members.length===15 && D.batch.stats.length===15 && D.batch.hc.msgs.length===100`));
// warm, same session
const warm = await open('chat');
chk(`warm reopen reads ${warm} <= 20`, warm <= 20);
const warmCal = await open('cal');
chk(`warm calendar tab reads ${warmCal} <= 20`, warmCal <= 20 && (await ev(`$('#bpane').textContent.includes('Seminar 29')`)));
// warm after a full page reload: cache comes back from the encrypted vault
await ev(`location.hash='#/home'`); await sleep(300); await ev(`Store.flush()`); await sleep(300);
await send('Page.reload'); await sleep(2000);
await ev(`$('#pin')&&($('#pin').value='1234',$('#unlock').click())`); await sleep(2500);
await ev(`__installFsMock('u1','a@x.com','Sriram')`);
chk('message cache not in plain localStorage', await ev(`Object.keys(localStorage).filter(k=>k!=='fsmock').every(k=>!String(localStorage.getItem(k)).includes('seed message'))`));
const warmReload = await open('chat');
chk(`warm reopen after reload reads ${warmReload} <= 20`, warmReload <= 20 && (await ev(`Chat.msgs.length`)) === 100);
// another member posts while the hub is closed
await ev(`location.hash='#/home'`); await sleep(300);
await put('messages/zz1', `{ uid: 'u3', name: 'Member 3', text: 'fresh from member 3 <b>x</b>', at: Date.now() }`);
const rNew = await open('chat');
chk(`new message from another member appears after reopen (reads ${rNew})`, (await texts()).includes('fresh from member 3 <b>x</b>') && rNew <= 20);
chk('message text escaped', await ev(`!document.querySelector('#chatlist .msg p b')`));
// ...and while it is open
await put('messages/zz2', `{ uid: 'u4', name: 'Member 4', text: 'live hello', at: Date.now() + 1 }`); await sleep(500);
chk('live message appears while open', (await texts()).includes('live hello'));
// own message: send, then delete -> gone at once for the deleter
await ev(`$('#chatin').value='my temp msg'; $('#chatform').requestSubmit()`); await sleep(700);
chk('own message shown', (await texts()).includes('my temp msg'));
await ev(`window.__dlgDefault=true; [...document.querySelectorAll('.msg.me')].find(m=>m.textContent.includes('my temp msg')).querySelector('[data-act=chatdel]').click()`); await sleep(600);
chk('deleted message disappears for the deleter', !(await texts()).includes('my temp msg') && (await ev(`!D.batch.hc.msgs.some(m=>m.text==='my temp msg') && !Object.values(JSON.parse(localStorage.fsmock)).some(v=>v.text==='my temp msg')`)));
// load older
await ev(`__reads=0; $('[data-act=chatolder]').click()`); await sleep(800);
const rOld = await ev(`__reads`);
chk(`load older fetches the 50 before the oldest (reads ${rOld})`, (await ev(`Chat.msgs.length`)) === 152 && (await texts()).includes('seed message 0') && rOld === 50);
await ev(`$('[data-act=chatolder]').click()`); await sleep(500);
chk('no more older: button gone', await ev(`!$('[data-act=chatolder]')`));
// someone else deletes an older message: shown until the daily full refresh, then gone
await del('messages/m120');
await open('chat');
const stillThere = (await texts()).includes('seed message 120');
await ev(`D.batch.hc.full.msg = 0`);
const rFull = await open('chat');
chk(`other member's delete reflected on daily refresh (reads ${rFull}, before refresh shown: ${stillThere})`, !(await texts()).includes('seed message 120'));
// events: new one by someone else shows on warm reopen; a deleted one goes on the daily refresh
await put('events/enew', `{ title: 'Grand rounds new', type: 'Seminar', date: new Date().toISOString().slice(0,10), createdBy: 'u2', createdAt: Date.now() }`);
const rEv = await open('cal');
chk(`new event appears on warm reopen (reads ${rEv})`, (await ev(`$('#bpane').textContent.includes('Grand rounds new')`)) && rEv <= 20);
await del('events/e29'); await ev(`D.batch.hc.full.ev = 0`);
await open('cal');
chk('deleted event gone after daily refresh', await ev(`!$('#bpane').textContent.includes('Seminar 29') && !D.batch.events.some(e=>e.id==='e29')`));
// unread badge from the calendar tab
await put('messages/zz3', `{ uid: 'u5', name: 'Member 5', text: 'badge me', at: Date.now() + 5 }`); await sleep(600);
chk('unread badge on another tab', await ev(`$('#chatbadge') && $('#chatbadge').textContent==='1'`));
// members tab listens live
await open('mem');
chk('members tab lists members', await ev(`$('#bpane').textContent.includes('Member 15')`));
await put('members/u16', `{ name: 'Member Sixteen', year: 'JR2', joinedAt: Date.now() }`); await sleep(500);
chk('new member appears live on members tab', await ev(`$('#bpane').textContent.includes('Member Sixteen')`));
// revoked membership
await ev(`location.hash='#/home'`); await sleep(300); await ev(`window.__deny=1; location.hash='#/batch?t=chat'`); await sleep(800);
chk('permission-denied drops the batch', await ev(`D.batch===null`));
console.log(`READS cold=${cold} warm=${warm} warmCal=${warmCal} warmAfterReload=${warmReload}`);
console.log('ERRORS', JSON.stringify(errs)); process.exit(fails ? 1 : 0);
