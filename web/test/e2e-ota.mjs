import {execSync} from 'child_process';
const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const ws = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend={}; ws.onmessage=m=>{const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]}};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result.result?.value;
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const chk=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await send('Page.enable'); await send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'FIREBASE_CONFIG',{get(){return null},set(){}})"}); await send('Page.navigate',{url:'http://localhost:8765/'}); await sleep(2000);
await ev(`$('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2500);
await send('Page.reload'); await sleep(2500);
const v1 = await ev(`APP_VERSION`); chk('SW controlling page', await ev(`!!navigator.serviceWorker.controller`));
execSync('sleep 61; python3 /home/claude/pg-derma-companion/web/build.py');   // new build stamp
await ev(`navigator.serviceWorker.getRegistration().then(r=>r.update())`); await sleep(4000);
chk('update bar shown', await ev(`!$('#updbar').hidden`));
await ev(`$('#updbar').click()`); await sleep(4000);
const v2 = await ev(`APP_VERSION`); chk('new version loaded '+v1+' -> '+v2, v1 !== v2);
chk('still unlocked after OTA update', await ev(`!!D && $('#lock').hidden`));
process.exit(0);
