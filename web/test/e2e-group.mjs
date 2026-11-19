// Three tabs = three batchmates in a group video call (mesh WebRTC, fake camera/mic, shared Firestore stand-in).
import fs from 'fs';
const MOCK = fs.readFileSync(new URL('./fs-shared-mock.js', import.meta.url), 'utf8');
const DLG = fs.readFileSync(new URL('./dlg-auto.js', import.meta.url), 'utf8');
const base = 'http://127.0.0.1:9335';
const sleep = ms => new Promise(r => setTimeout(r, ms)); const chk = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
const page = async target => {
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}, errs = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result; if (r.exceptionDetails) errs.push('EVAL: ' + (r.exceptionDetails.exception?.description || '').slice(0, 300)); return r.result?.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(window,'FIREBASE_CONFIG',{get(){return null},set(){}});" + DLG + MOCK });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  return { send, ev, errs };
};
const shot = async (P, n) => { const r = await P.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('/tmp/' + n + '.png', Buffer.from(r.result.data, 'base64')); };
const t1 = (await (await fetch(base + '/json')).json()).find(t => t.type === 'page');
const t2 = await (await fetch(base + '/json/new?about:blank', { method: 'PUT' })).json();
const t3 = await (await fetch(base + '/json/new?about:blank', { method: 'PUT' })).json();
const A = await page(t1), B = await page(t2), C = await page(t3);
await A.send('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(1500);
await A.ev(`localStorage.removeItem('fsmock'); $('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2000);
await A.ev(`__installFsMock('uA','a@x.com','Sriram')`);
await A.ev(`location.hash='#/batch'`); await sleep(500);
await A.ev(`$('#b_name').value='Sriram';$('#b_bname').value='Group test';ACT.bcreate()`); await sleep(800);
const code = await A.ev(`D.batch.id`);
for (const [P, uid, nm] of [[B, 'uB', 'Priya'], [C, 'uC', 'Kiran']]) {
  await P.send('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(1500);
  await P.ev(`$('#pin')&&($('#pin').value='1234',$('#unlock').click())`); await sleep(2000);
  await P.ev(`__installFsMock('${uid}','${uid}@x.com','${nm}'); D.batch=null`);
  await P.ev(`location.hash='#/batch?join=${code}'`); await sleep(500);
  await P.ev(`$('#b_name').value='${nm}';ACT.bjoin()`); await sleep(1200);
}
chk('three in batch', (await B.ev(`D.batch&&D.batch.id`)) === code && (await C.ev(`D.batch&&D.batch.id`)) === code);
await A.ev(`location.hash='#/batch?t=mem'`); await sleep(1200);
chk('no group call card without permission', await A.ev(`!document.querySelector('[data-act=gcall]')`));
await A.ev(`Group.startRoom(['uB','uC'], true)`); await sleep(300);
chk('group call blocked without permission', await A.ev(`!Group.room`));
const grant = uid => `(()=>{const o=JSON.parse(localStorage.fsmock||'{}');o['approvals/'+'${uid}']={email:'x',status:'approved',calls:true};localStorage.fsmock=JSON.stringify(o);new BroadcastChannel('fsmock').postMessage(1)})()`;
for (const u of ['uA', 'uB', 'uC']) await A.ev(grant(u));
await sleep(3000);
chk('all allowed', (await A.ev(`Calls.allowed`)) && (await B.ev(`Calls.allowed`)) && (await C.ev(`Calls.allowed`)));
await A.ev(`paintBatch()`); await sleep(200);
chk('group call card enabled', await A.ev(`!!document.querySelector('[data-act=gcall]:not([disabled])')`));
await A.ev(`document.querySelector('[data-act=gcall]').click()`); await sleep(400);
chk('picker lists 2 online', (await A.ev(`$$('.gpick').length`)) === 2);
await shot(A, 'group-picker');
await A.ev(`$$('.gpick').forEach(c=>c.checked=true); document.querySelector('[data-act=gstart][data-v="1"]').click()`); await sleep(2500);
chk('A in room', await A.ev(`!!Group.room`));
chk('B sees invite', (await B.ev(`$('#callui')&&$('#callui').textContent`) || '').includes('Group video call'));
chk('C sees invite', (await C.ev(`$('#callui')&&$('#callui').textContent`) || '').includes('Group video call'));
await shot(B, 'group-invite');
await B.ev(`document.querySelector('[data-g=video]').click()`); await sleep(1500);
await C.ev(`document.querySelector('[data-g=video]').click()`);
const allLive = async () => { for (const P of [A, B, C]) { const n = await P.ev(`Group.room?[...Group.room.conns.values()].filter(c=>c.state==='live').length:0`); if (n !== 2) return false; } return true; };
let ok = false; for (let i = 0; i < 40 && !ok; i++) { await sleep(500); ok = await allLive(); }
chk('full mesh connected (each sees 2 live links)', ok);
await sleep(2500);
const frames = P => P.ev(`(async()=>{const out=[];for(const c of Group.room.conns.values()){const s=await c.pc.getStats();let v=0,a=0;s.forEach(r=>{if(r.type==='inbound-rtp'&&r.kind==='video')v=r.framesDecoded||0;if(r.type==='inbound-rtp'&&r.kind==='audio')a=r.packetsReceived||0});out.push(v>5&&a>5)}return out})()`);
for (const [n, P] of [['A', A], ['B', B], ['C', C]]) { const f = await frames(P); chk(n + ' receives video+audio from both ' + JSON.stringify(f), f.length === 2 && f.every(Boolean)); }
chk('grid shows 3 tiles', (await A.ev(`$$('.g-tile').length`)) === 3);
await shot(A, 'group-live');
await A.ev(`document.querySelector('[data-g=mute]').click()`); await sleep(200);
chk('mute disables mic', await A.ev(`Group.room.local.getAudioTracks().every(t=>!t.enabled)`));
// C leaves; A and B stay connected
await C.ev(`document.querySelector('[data-g=leave]').click()`); await sleep(2500);
chk('C left and released camera', await C.ev(`!Group.room && !document.querySelector('video')`));
chk('A now has 1 link', (await A.ev(`Group.room.conns.size`)) === 1);
chk('grid shrinks to 2', (await A.ev(`$$('.g-tile').length`)) === 2);
// 1:1 call to someone in a group call is refused as busy
chk('1:1 call refused while in group', await A.ev(`(Calls.call('uB','Priya',false), !Calls.cur)`));
// everyone leaves → room ended
await B.ev(`document.querySelector('[data-g=leave]').click()`); await sleep(800);
await A.ev(`document.querySelector('[data-g=leave]').click()`); await sleep(1500);
chk('room marked ended', await A.ev(`Object.entries(JSON.parse(localStorage.fsmock)).some(([k,v])=>/\\/rooms\\/[^/]+$/.test(k)&&v.status==='ended')`));
// cap: at most 3 picks
await A.ev(`paintBatch()`); await sleep(200);
chk('max 4 people enforced in code', (await A.ev(`GROUP_MAX`)) === 4);
// admin delete batch removes rooms
await A.ev(`deleteBatchAll('${code}')`); await sleep(500);
chk('batch delete removes rooms', await A.ev(`!Object.keys(JSON.parse(localStorage.fsmock)).some(k=>k.includes('/rooms/'))`));
const errs = [...A.errs, ...B.errs, ...C.errs].filter(e => e && !/getComputedStyle/.test(e));
console.log('ERRORS', JSON.stringify(errs).slice(0, 800));
process.exit(0);
