import fs from 'fs';
const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const ws = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend={}, errs=[]; ws.onmessage=m=>{const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]} if(d.method==='Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description);};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
const ev=async e=>{const r=(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result; if(r.exceptionDetails) errs.push('EVAL: '+r.exceptionDetails.exception?.description); return r.result?.value};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const chk=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const shot=async n=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/'+n+'.png',Buffer.from(r.result.data,'base64'))};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
await send('Page.navigate',{url:'http://localhost:8765/'}); await sleep(1200);
await ev(`$('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2000);
// in-memory Firestore mock
await ev(`(()=>{
 const store=new Map(), subs=[];
 const key=p=>p.join('/');
 const notify=()=>subs.forEach(s=>s.fire());
 const f={
  serverTimestamp:()=>'TS', doc:(db,...p)=>({p}), collection:(db,...p)=>({p,c:true}),
  where:(fld,op,v)=>({fld,op,v}), orderBy:(fld)=>({ob:fld}), query:(c,...m)=>({p:c.p,m}),
  setDoc:async(d,v)=>{store.set(key(d.p),JSON.parse(JSON.stringify(v)));notify()},
  addDoc:async(c,v)=>{const k=key(c.p)+'/'+Math.random().toString(36).slice(2,8);store.set(k,JSON.parse(JSON.stringify(v)));notify();return{id:k}},
  getDoc:async d=>({exists:()=>store.has(key(d.p)),data:()=>store.get(key(d.p))}),
  deleteDoc:async d=>{store.delete(key(d.p));notify()},
  onSnapshot:(q,cb)=>{const pre=key(q.p)+'/';const s={fire(){let docs=[...store.entries()].filter(([k])=>k.startsWith(pre)&&!k.slice(pre.length).includes('/')).map(([k,v])=>({id:k.slice(pre.length),data:()=>v}));for(const m of (q.m||[])){if(m.op==='>=')docs=docs.filter(d=>d.data()[m.fld]>=m.v);if(m.ob)docs.sort((a,b)=>String(a.data()[m.ob]).localeCompare(String(b.data()[m.ob])))}cb({docs})}};subs.push(s);s.fire();return()=>{subs.splice(subs.indexOf(s),1)}},
  signOut:async()=>{Cloud.user=null},
 };
 window.__store=store;
 D.settings.fbConfig={apiKey:'x',projectId:'demo'};
 Cloud.init=function(){this.f=f;this.db={};if(!this.user)this.user={uid:'u1',email:'a@x.com',displayName:'Sriram'};return Promise.resolve()};
})()`);
await ev(`location.hash='#/batch'`); await sleep(500); await shot('b1-join');
chk('join screen', await ev(`!!$('#b_code')`));
await ev(`$('#b_name').value='Sriram';$('#b_bname').value='DVL PGs 2026';ACT.bcreate()`); await sleep(500);
const code = await ev(`D.batch&&D.batch.id`); chk('batch created '+code, /^DVL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code||''));
// add event repeating 4 weeks
await ev(`ACT.bevadd()`); await sleep(200); await ev(`$('#ev_t').value='Journal club';$('#ev_r').value='4';$('#ev_tm').value='14:00';ACT.bevsave()`); await sleep(500);
chk('4 events synced', await ev(`D.batch.events.length===4`)); await shot('b2-cal');
chk('home shows batch event', await ev(`dueItems(1).some(i=>i.kind==='batch')`));
// log some procedures for u1 and share
await ev(`D.logbook.push({id:'l1',proc:'Punch biopsy',cat:'Biopsy',role:'Performed',year:'JR1',date:'2026-11-19'},{id:'l2',proc:'Punch biopsy',cat:'Biopsy',role:'Performed',year:'JR1',date:'2026-11-19'},{id:'l3',proc:'KOH mount',cat:'Bedside test',role:'Observed',year:'JR1',date:'2026-11-19'})`);
await ev(`location.hash='#/batch?t=log'`); await sleep(400);
await ev(`(()=>{const c=$('[data-act=bshare]');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}))})()`); await sleep(400);
chk('stats published', await ev(`__store.has('batches/'+D.batch.id+'/logstats/u1')`));
// second user joins and shares
await ev(`__store.set('batches/'+D.batch.id+'/members/u2',{name:'Batchmate',year:'JR1'});__store.set('batches/'+D.batch.id+'/logstats/u2',{counts:{'Punch biopsy':{JR1:{P:6,A:0,O:0}}}});Cloud.f.setDoc(Cloud.f.doc(null,'x','y'),{})`); await sleep(300);
await ev(`location.hash='#/batch?t=log&y=JR1&r=P'`); await sleep(500); await shot('b3-log');
const txt = await ev(`$('#bpane').textContent`); chk('comparison avg 4 top 6', /you\s*2\s*· avg 4 · median 4 · top 6/.test(txt.replace(/\s+/g,' ')));
await ev(`location.hash='#/batch?t=mem'`); await sleep(400); chk('members listed', (await ev(`$('#bpane').textContent`)).includes('Batchmate'));
// join flow for another user with invite code
await ev(`ACT.bleave=ACT.bleave; window.confirm=()=>true; ACT.bleave()`); await sleep(400); chk('left batch', await ev(`D.batch===null && !__store.has('batches/${code}/members/u1')`));
await ev(`location.hash='#/batch?join=${code}'`); await sleep(400); chk('code prefilled', (await ev(`$('#b_code').value`))===code);
await ev(`ACT.bjoin()`); await sleep(400); chk('rejoined', await ev(`D.batch && D.batch.id==='${code}'`));
await ev(`$('#b_code')||1`);
// bad code
await ev(`D.batch=null; location.hash='#/batch'`); await sleep(400); await ev(`$('#b_code').value='DVL-ZZZZ-ZZZZ';ACT.bjoin()`); await sleep(300); chk('bad code rejected', await ev(`D.batch===null`));
// setup screen when no config
await ev(`delete D.settings.fbConfig; window.FIREBASE_CONFIG=null; Cloud.ready=null; location.hash='#/home'; location.hash='#/batch'`); await sleep(400);
await ev(`$('#fbcfg').value='const firebaseConfig = {\\n  apiKey: \"AIza\",\\n  authDomain: \"x.firebaseapp.com\",\\n  projectId: \"pgx\",\\n  appId: \"1:2:web:3\",\\n};'; ACT.fbcfgsave()`); chk('config pasted from JS object', await ev(`D.settings.fbConfig&&D.settings.fbConfig.projectId==='pgx'`));
console.log('ERRORS', JSON.stringify(errs)); process.exit(0);
