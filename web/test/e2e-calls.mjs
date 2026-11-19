// Two tabs = two batchmates. Real WebRTC (fake camera/mic) signalled through a shared Firestore stand-in.
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
const A = await page(t1), B = await page(t2);
// A creates the vault + batch
await A.send('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(1500);
await A.ev(`localStorage.removeItem('fsmock'); $('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2000);
await A.ev(`__installFsMock('uA','a@x.com','Sriram')`);
await A.ev(`location.hash='#/batch'`); await sleep(500);
await A.ev(`$('#b_name').value='Sriram';$('#b_bname').value='Call test';ACT.bcreate()`); await sleep(800);
const code = await A.ev(`D.batch.id`);
// B unlocks the same device vault (same origin) and joins as a different user
await B.send('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(1500);
await B.ev(`$('#pin')&&($('#pin').value='1234',$('#unlock').click())`); await sleep(2000);
await B.ev(`__installFsMock('uB','b@x.com','Priya'); D.batch=null`);
await B.ev(`location.hash='#/batch?join=${code}'`); await sleep(500);
await B.ev(`$('#b_name').value='Priya';ACT.bjoin()`); await sleep(1200);
chk('both in batch', (await A.ev(`D.batch.id`)) === code && (await B.ev(`D.batch&&D.batch.id`)) === code);
// permission: calls are off until the admin enables them
await A.ev(`location.hash='#/batch?t=mem'`); await sleep(1500);
chk('no call buttons without admin permission', await A.ev(`!document.querySelector('[data-act=bcall]') && $('#bpane').textContent.includes('switched on by the admin')`));
await A.ev(`Calls.call('uB','Priya',false)`); await sleep(300);
chk('calling blocked without permission', await A.ev(`!Calls.cur`));
const grant = uid => `(()=>{const o=JSON.parse(localStorage.fsmock||'{}');o['approvals/'+'${uid}']={email:'x',status:'approved',calls:true};localStorage.fsmock=JSON.stringify(o);new BroadcastChannel('fsmock').postMessage(1)})()`;
await A.ev(grant('uA')); await A.ev(grant('uB')); await sleep(2500);
chk('A now allowed', await A.ev(`Calls.allowed`)); chk('B now allowed', await B.ev(`Calls.allowed`));

await A.ev(`paintBatch()`); await sleep(200);
chk('A sees Priya online', await A.ev(`Calls.isOnline('uB')`));
chk('call buttons enabled', await A.ev(`!!document.querySelector('[data-act=bcall][data-id=uB]:not([disabled])')`));
await shot(A, 'call-members');
// A video-calls B
await A.ev(`document.querySelector('[data-act=bcall][data-id=uB][data-v="1"]').click()`); await sleep(2500);
chk('A shows ringing', (await A.ev(`$('#cstat')&&$('#cstat').textContent`)) === 'Ringing…');
chk('B shows incoming', (await B.ev(`$('#cstat')&&$('#cstat').textContent`) || '').includes('Incoming video call'));
await shot(B, 'call-incoming');
await B.ev(`document.querySelector('[data-call=accept-video]').click()`);
let live = false; for (let i = 0; i < 30 && !live; i++) { await sleep(500); live = (await A.ev(`Calls.cur&&Calls.cur.status`)) === 'live' && (await B.ev(`Calls.cur&&Calls.cur.status`)) === 'live'; }
chk('call connected both sides', live);
await sleep(2500);
const frames = async P => P.ev(`(async()=>{const s=await Calls.cur.pc.getStats();let v=0,a=0;s.forEach(r=>{if(r.type==='inbound-rtp'&&r.kind==='video')v=r.framesDecoded||0;if(r.type==='inbound-rtp'&&r.kind==='audio')a=r.packetsReceived||0});return [v,a]})()`);
const fa = await frames(A), fb = await frames(B);
chk('A receives video+audio ' + fa, fa[0] > 5 && fa[1] > 5); chk('B receives video+audio ' + fb, fb[0] > 5 && fb[1] > 5);
chk('timer running', /\d+:\d\d/.test(await A.ev(`$('#ctime').textContent`)));
await shot(A, 'call-live');
// mute toggles audio track
await A.ev(`document.querySelector('[data-call=mute]').click()`); await sleep(200);
chk('mute disables mic', await A.ev(`Calls.cur.local.getAudioTracks().every(t=>!t.enabled)`));
// B hangs up
await B.ev(`document.querySelector('[data-call=end]').click()`); await sleep(1500);
chk('call ended both sides', !(await A.ev(`!!Calls.cur`)) && !(await B.ev(`!!Calls.cur`)) && !(await A.ev(`!!$('#callui')`)));
chk('A camera released', await A.ev(`!document.querySelector('video')`));
// decline flow (voice)
await A.ev(`document.querySelector('[data-act=bcall][data-id=uB][data-v="0"]').click()`); await sleep(2000);
chk('B rings for voice call', (await B.ev(`$('#cstat')&&$('#cstat').textContent`) || '').includes('Incoming voice call'));
await B.ev(`document.querySelector('[data-call=decline]').click()`); await sleep(1500);
chk('decline ends caller side', !(await A.ev(`!!Calls.cur`)));
// offline user cannot be called
await B.ev(`Calls.stop(); (()=>{const o=JSON.parse(localStorage.fsmock);o['batches/${code}/presence/uB'].at=Date.now()-600000;localStorage.fsmock=JSON.stringify(o);new BroadcastChannel('fsmock').postMessage(1)})()`); await sleep(1200);
await A.ev(`paintBatch()`); await sleep(200);
chk('offline user shows disabled call buttons', await A.ev(`!!document.querySelector('[data-act=bcall][data-id=uB][disabled]') && !Calls.isOnline('uB')`));
const errs = [...A.errs, ...B.errs].filter(e => e && !/getComputedStyle/.test(e));
console.log('ERRORS', JSON.stringify(errs).slice(0, 800));
process.exit(0);
