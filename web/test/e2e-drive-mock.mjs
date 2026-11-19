import { readFileSync as __rf } from 'fs';
const __DLG = __rf(new URL('./dlg-auto.js', import.meta.url), 'utf8');
const mk = async port => {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
  let id=0; const pend={}, errs=[]; ws.onmessage=m=>{const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]} if(d.method==='Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description); if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error') errs.push('console: '+d.params.args.map(a=>a.value||a.description).join(' ').slice(0,200));};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async e=>{const r=(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result; if(r.exceptionDetails) errs.push('EVAL: '+(r.exceptionDetails.exception?.description||'').slice(0,300)); return r.result?.value};
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'FIREBASE_CONFIG',{get(){return null},set(){}});Object.defineProperty(window,'DRIVE_TOKEN_HELPER',{get(){return ''},set(){}})"+';'+__DLG}); return {send,ev,errs};
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const chk=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const A = await mk(9333), B = await mk(9334);
const MOCK = `(()=>{ if(window.__mock) return; window.__mock=1;
 const files = window.__files = new Map(JSON.parse(sessionStorage.getItem('drv')||'[]').map(([id,f])=>[id,{name:f.name,b:Uint8Array.from(atob(f.b),c=>c.charCodeAt(0))}]));
 const persist=()=>sessionStorage.setItem('drv',JSON.stringify([...files].map(([id,f])=>[id,{name:f.name,b:btoa(String.fromCharCode(...f.b))}])));
 window.__grants=0; window.__consent=true;
 window.google={accounts:{oauth2:{initTokenClient:cfg=>({callback:null,error_callback:null,requestAccessToken(o){window.__grants++; setTimeout(()=>window.__consent?this.callback({access_token:'tok'+window.__grants,expires_in:3600,scope:cfg.scope}):this.callback({error:'access_denied'}),20)}}),hasGrantedAllScopes:(r,s)=>r.scope===s,revoke:()=>{}}}};
 const real=window.fetch.bind(window); let n=Object.keys(files).length+100;
 const toBytes=async b=> b instanceof Uint8Array? b : b instanceof Blob? new Uint8Array(await b.arrayBuffer()) : new Uint8Array(b);
 window.fetch=async(url,o={})=>{ if(!String(url).startsWith('https://www.googleapis.com/')) return real(url,o);
  if(!(o.headers||{}).Authorization) return new Response('',{status:401});
  const u=new URL(url), p=u.pathname, J=x=>new Response(JSON.stringify(x),{status:200,headers:{'content-type':'application/json'}});
  if(p==='/drive/v3/about') return J({user:{emailAddress:'sriram@gmail.com'},storageQuota:{limit:'16106127360',usage:String([...files.values()].reduce((a,f)=>a+f.b.length,0))}});
  if(p==='/drive/v3/files' && (o.method||'GET')==='GET') return J({files:[...files].map(([id,f])=>({id,name:f.name}))});
  if(p==='/upload/drive/v3/files' && o.method==='POST'){ const meta=JSON.parse(await o.body.get('metadata').text()); const id='f'+(n++); files.set(id,{name:meta.name,b:await toBytes(o.body.get('file'))}); persist(); return J({id}); }
  let m=p.match(/^\\/upload\\/drive\\/v3\\/files\\/(\\w+)$/); if(m && o.method==='PATCH'){ files.get(m[1]).b=await toBytes(o.body); persist(); return J({id:m[1]}); }
  m=p.match(/^\\/drive\\/v3\\/files\\/(\\w+)$/);
  if(m && o.method==='DELETE'){ files.delete(m[1]); persist(); return new Response(null,{status:204}); }
  if(m && u.searchParams.get('alt')==='media'){ const f=files.get(m[1]); return f? new Response(f.b,{status:200}) : new Response('',{status:404}); }
  return new Response('unhandled '+p,{status:500}); };
})()`;
// ---------- Device A ----------
await A.send('Page.navigate',{url:'http://localhost:8765/'}); await sleep(1500);
await A.ev(`$('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2500);
await A.ev(MOCK);
await A.ev(`(async()=>{D.patients.push({id:'p1',uhid:'A-1',name:'Asha',buckets:['Routine']},{id:'p2',uhid:'A-2',buckets:['Routine']});D.visits.push({id:'v1',pid:'p1',date:'2026-11-19',label:'First visit',dx:['Psoriasis']});
 const c=document.createElement('canvas');c.width=400;c.height=300;c.getContext('2d').fillRect(0,0,50,50);await savePhoto(c,{pid:'p1',vid:'v1',cat:'Clinical'}); await Store.flush();})()`);
await A.ev(`location.hash='#/settings'`); await sleep(500);
chk('settings shows Connect Google Drive', await A.ev(`!!$('#synccard [data-act=driveconnect]')`));
await A.ev(`__consent=false; ACT.driveconnect()`); await sleep(500); chk('denied consent handled', await A.ev(`$('#toast').textContent.includes('not allowed') && !(D.sync&&D.sync.on)`));
await A.ev(`__consent=true; ACT.driveconnect()`); await sleep(3000);
chk('connected & email shown', await A.ev(`D.sync.on && D.sync.email==='sriram@gmail.com'`));
chk('manifest + db + photo in Drive', await A.ev(`(()=>{const n=[...__files.values()].map(f=>f.name);return n.includes('manifest.json')&&n.includes('db.bin')&&n.some(x=>x.startsWith('p_'))&&n.some(x=>x.startsWith('t_'))})()`));
chk('Drive files are ciphertext', await A.ev(`![...__files.values()].filter(f=>f.name!=='manifest.json').some(f=>new TextDecoder().decode(f.b).includes('Asha'))`));
chk('manifest has no patient data', await A.ev(`!new TextDecoder().decode([...__files.values()].find(f=>f.name==='manifest.json').b).includes('Asha')`));
await sleep(4000); console.log('state after wait:', await A.ev(`Sync.state+' | '+Sync.msg`)); chk('status ok', await A.ev(`Sync.state==='ok'`));
chk('quota shown', await A.ev(`new Promise(r=>setTimeout(()=>r($('#drivequota').textContent.includes('GB')),500))`));
// token expiry -> reconnect bar
await A.ev(`(async()=>{Drive.exp=0; await IDB.del('meta','dtoken'); await Sync.run();})()`); await sleep(300);
chk('expired token shows reconnect bar', await A.ev(`Sync.state==='reconnect' && !$('#drivebar').hidden`));
await A.ev(`$('#drivebar').click()`); await sleep(2500);
chk('reconnect via bar restores sync', await A.ev(`Sync.state==='ok' && $('#drivebar').hidden`));
// refresh keeps token
await A.send('Page.reload'); await sleep(2500); await A.ev(MOCK); await A.ev(`Sync.run()`); await sleep(2000);
chk('after refresh: unlocked & synced with saved token', await A.ev(`!!D && Sync.state==='ok'`));
const drv = await A.ev(`sessionStorage.getItem('drv')`);
// ---------- Device B: restore ----------
await B.send('Page.navigate',{url:'http://localhost:8765/'}); await sleep(1500);
await B.ev(`sessionStorage.setItem('drv', ${JSON.stringify(drv)})`); await B.ev(MOCK);
chk('restore-from-Drive button', (await B.ev(`$('#restorebtn').textContent`)).includes('Google Drive'));
await B.ev(`restoreFlow()`); await sleep(300); await B.ev(`$('#rg').click()`); await sleep(1500);
await B.ev(`$('#pin').value='9999'; $('#rgo').click()`); await sleep(1500);
chk('wrong PIN rejected', (await B.ev(`$('#lerr').textContent`))==='Incorrect PIN');
await B.ev(`$('#pin').value='1234'; $('#rgo').click()`); await sleep(4000);
chk('B restored records', await B.ev(`D && D.patients.length===2 && P('p1').name==='Asha'`));
chk('B downloaded photo', await B.ev(`IDB.keys('photos').then(k=>k.length===2)`));
chk('B photo decrypts', await B.ev(`photoURL(D.photos[0].id).then(u=>u.startsWith('blob:'))`));
// concurrent edits
await B.ev(`P('p1').name='Asha K'; D.patients=D.patients.filter(p=>p.id!=='p2'); D.logbook.push({id:'lB',proc:'KOH mount',role:'Performed',year:'JR1',date:'2026-11-19'}); Store.flush()`); await sleep(6000);
const drv2 = await B.ev(`sessionStorage.getItem('drv')`);
await A.ev(`(async()=>{ D.patients.push({id:'p3',uhid:'A-3',buckets:['Routine']}); V('v1').notes='plaque on elbows'; Sync.quiet=true; await Store.flush(); Sync.quiet=false;
  __files.clear(); for (const [id,f] of JSON.parse(${JSON.stringify(drv2)})) __files.set(id,{name:f.name,b:Uint8Array.from(atob(f.b),c=>c.charCodeAt(0))}); Drive.files=null; await Sync.run(); })()`); await sleep(3000);
chk('merge: name from B', await A.ev(`P('p1').name==='Asha K'`));
chk('merge: deletion from B', await A.ev(`!P('p2')`));
chk('merge: A new patient kept', await A.ev(`!!P('p3')`));
chk('merge: A visit edit kept', await A.ev(`V('v1').notes==='plaque on elbows'`));
chk('merge: logbook from B', await A.ev(`D.logbook.some(l=>l.id==='lB')`));
// photo deletion
await A.ev(`(async()=>{ await deletePhoto(D.photos[0].id); Sync.quiet=true; await Store.flush(); Sync.quiet=false; await Sync.run(); })()`); await sleep(2500);
chk('photo files removed from Drive', await A.ev(`![...__files.values()].some(f=>/^[pt]_/.test(f.name))`));
// PIN change
await A.ev(`window.__dlgQueue=['1234','4321','4321']; ACT.chpin()`); await sleep(6000);
chk('Drive manifest has new salt', await A.ev(`(async()=>JSON.parse(new TextDecoder().decode([...__files.values()].find(f=>f.name==='manifest.json').b)).salt===b64((await IDB.get('meta','auth')).salt))()`));
// wipe
await A.ev(`window.__dlgDefault='DELETE'; ACT.drivewipe()`); await sleep(2000);
chk('Drive backup deleted, sync off', await A.ev(`__files.size===0 && D.sync.on===false`));
console.log('ERRORS A', JSON.stringify(A.errs)); console.log('ERRORS B', JSON.stringify(B.errs)); process.exit(0);
