const mk = async port => {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
  let id=0; const pend={}, errs=[]; ws.onmessage=m=>{const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]} if(d.method==='Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description); if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error') errs.push('console: '+d.params.args.map(a=>a.value||a.description).join(' ').slice(0,200));};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async e=>{const r=(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result; if(r.exceptionDetails) errs.push('EVAL: '+(r.exceptionDetails.exception?.description||'').slice(0,300)); return r.result?.value};
  await send('Runtime.enable'); await send('Page.enable'); return {send,ev,errs};
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const chk=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const A = await mk(9333), B = await mk(9334);
const MOCK = `(()=>{ if(window.__mockInstalled) return; window.__mockInstalled=1;
 const store = window.__store = new Map(JSON.parse(sessionStorage.getItem('mockstore')||'[]')); const subs=[];
 const persist=()=>sessionStorage.setItem('mockstore',JSON.stringify([...store]));
 const key=p=>p.join('/'); const fire=k=>subs.filter(s=>s.k===k).forEach(s=>s.cb({data:()=>store.get(k),exists:()=>store.has(k)}));
 const f={ serverTimestamp:()=>'TS', doc:(db,...p)=>({p}), collection:(db,...p)=>({p}), where:()=>({}), orderBy:()=>({}), query:(c)=>c,
  setDoc:async(d,v)=>{store.set(key(d.p),JSON.parse(JSON.stringify(v)));persist();fire(key(d.p))},
  getDoc:async d=>({exists:()=>store.has(key(d.p)),data:()=>store.get(key(d.p))}),
  deleteDoc:async d=>{store.delete(key(d.p));persist()},
  writeBatch:()=>{const ops=[];return{set:(d,v)=>ops.push([d,v]),commit:async()=>{for(const[d,v]of ops)store.set(key(d.p),JSON.parse(JSON.stringify(v)));persist()}}},
  onSnapshot:(d,cb)=>{const s={k:key(d.p),cb};subs.push(s);return()=>subs.splice(subs.indexOf(s),1)},
  signOut:async()=>{}, GoogleAuthProvider:function(){}, signInWithPopup:async()=>{}, signInWithEmailAndPassword:async()=>{},
 };
 Cloud.init=function(){this.f=f;this.db={};this.ready=Promise.resolve();this.user={uid:'U1',email:'sriram@example.com'};return this.ready};
})()`;
// ---------- Device A ----------
await A.send('Page.navigate',{url:'http://localhost:8765/'}); await sleep(1500);
await A.ev(`$('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2500);
chk('A unlocked', await A.ev(`!!D`));
// refresh persistence
await A.send('Page.reload'); await sleep(2500);
chk('refresh keeps app unlocked', await A.ev(`!!D && $('#lock').hidden && !$('#app').hidden`));
chk('default auto-lock 15 min', await A.ev(`D.settings.lockMin===15`));
// expired session locks
await A.ev(`(async()=>{const s=await IDB.get('meta','session'); s.last=Date.now()-16*60000; await IDB.put('meta','session',s)})()`);
await A.send('Page.reload'); await sleep(2000);
chk('expired session shows lock', await A.ev(`!D && !$('#lock').hidden`));
await A.ev(`$('#pin').value='1234';$('#unlock').click()`); await sleep(2500);
// data on A
await A.ev(MOCK);
await A.ev(`(async()=>{D.patients.push({id:'p1',uhid:'A-1',name:'Asha',buckets:['Routine']},{id:'p2',uhid:'A-2',buckets:['Routine']});D.visits.push({id:'v1',pid:'p1',date:'2026-11-19',label:'First visit',dx:['Psoriasis']});
 const c=document.createElement('canvas');c.width=400;c.height=300;c.getContext('2d').fillRect(0,0,50,50);await savePhoto(c,{pid:'p1',vid:'v1',cat:'Clinical'}); await Store.flush();})()`);
await A.ev(`location.hash='#/settings'`); await sleep(500);
chk('settings shows turn-on', await A.ev(`!!$('[data-act=syncon]')`));
await A.ev(`ACT.syncon()`); await sleep(2500);
chk('A pushed manifest', await A.ev(`__store.has('users/U1') && __store.has('users/U1/blobs/db')`));
chk('A uploaded photo', await A.ev(`[...__store.keys()].some(k=>k.startsWith('users/U1/blobs/p_'))`));
chk('A status ok', await A.ev(`Sync.state==='ok'`));
chk('cloud copy is ciphertext', await A.ev(`!JSON.stringify([...__store.values()]).includes('Asha')`));
const storeJSON = await A.ev(`sessionStorage.getItem('mockstore')`);
// ---------- Device B: restore from cloud on a fresh phone ----------
await B.send('Page.navigate',{url:'http://localhost:8765/'}); await sleep(1500);
await B.ev(`sessionStorage.setItem('mockstore', ${JSON.stringify(storeJSON)})`); await B.ev(MOCK);
chk('restore button on fresh device', await B.ev(`!!$('#restorebtn')`));
await B.ev(`restoreFlow()`); await sleep(800);
await B.ev(`$('#pin').value='9999'; $('#rgo').click()`); await sleep(1500);
chk('wrong PIN rejected', (await B.ev(`$('#lerr').textContent`))==='Incorrect PIN');
await B.ev(`$('#pin').value='1234'; $('#rgo').click()`); await sleep(3500);
chk('B restored patients', await B.ev(`D && D.patients.length===2 && P('p1').name==='Asha'`));
chk('B downloaded photo', await B.ev(`IDB.keys('photos').then(k=>k.length===2)`));
chk('B photo decrypts', await B.ev(`photoURL(D.photos[0].id).then(u=>u.startsWith('blob:'))`));
// ---------- concurrent edits & merge ----------
await B.ev(`P('p1').name='Asha K'; D.patients=D.patients.filter(p=>p.id!=='p2'); D.logbook.push({id:'lB',proc:'KOH mount',role:'Performed',year:'JR1',date:'2026-11-19'}); Store.flush()`); await sleep(5000);
const store2 = await B.ev(`sessionStorage.getItem('mockstore')`);
await A.ev(`(async()=>{ D.patients.push({id:'p3',uhid:'A-3',buckets:['Routine']}); D.visits.find(v=>v.id==='v1').notes='plaque on elbows'; await Store.flush(); Sync.stop(); window.__store.clear(); for (const [k,v] of JSON.parse(${JSON.stringify(store2)})) window.__store.set(k,v); await Sync.run(); })()`); await sleep(3000);
chk('A merged: name from B', await A.ev(`P('p1').name==='Asha K'`));
chk('A merged: deletion from B', await A.ev(`!P('p2')`));
chk('A merged: own new patient kept', await A.ev(`!!P('p3')`));
chk('A merged: own visit edit kept', await A.ev(`V('v1').notes==='plaque on elbows'`));
chk('A merged: logbook from B', await A.ev(`D.logbook.some(l=>l.id==='lB')`));
// photo deletion propagates
await A.ev(`(async()=>{ await deletePhoto(D.photos[0].id); await Store.flush(); await Sync.run(); })()`); await sleep(2500);
chk('remote photo blobs deleted', await A.ev(`![...__store.keys()].some(k=>k.includes('/blobs/p_')||k.includes('/blobs/t_'))`));
// PIN change re-uploads with new salt
await A.ev(`window.prompt=(()=>{const a=['1234','4321','4321'];return ()=>a.shift()})(); ACT.chpin()`); await sleep(6000);
chk('cloud manifest has new salt', await A.ev(`(async()=>__store.get('users/U1').salt===b64((await IDB.get('meta','auth')).salt))()`));
chk('session survives PIN change', await A.ev(`IDB.get('meta','session').then(s=>!!s)`));
// lock clears session
await A.ev(`lockApp()`); await sleep(500); chk('lock clears session', await A.ev(`IDB.get('meta','session').then(s=>!s)`));
console.log('ERRORS A', JSON.stringify(A.errs)); console.log('ERRORS B', JSON.stringify(B.errs)); process.exit(0);
