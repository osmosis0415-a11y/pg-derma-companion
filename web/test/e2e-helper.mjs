import { readFileSync as __rf } from 'fs';
const __DLG = __rf(new URL('./dlg-auto.js', import.meta.url), 'utf8');
const mk = async port => {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
  let id=0; const pend={}, errs=[]; ws.onmessage=m=>{const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]} if(d.method==='Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description);};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async e=>{const r=(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result; if(r.exceptionDetails) errs.push('EVAL: '+(r.exceptionDetails.exception?.description||'').slice(0,300)); return r.result?.value};
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'FIREBASE_CONFIG',{get(){return null},set(){}})"+';'+__DLG}); return {send,ev,errs};
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const chk=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const A = await mk(9333);
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

const HELPER = `(()=>{ window.DRIVE_TOKEN_HELPER='https://script.google.com/macros/s/TEST/exec'; window.__ex=0; window.__rf=0;
 google.accounts.oauth2.initCodeClient = cfg => ({ requestCode(){ setTimeout(()=>cfg.callback({code:'CODE1', scope:cfg.scope}),20) } });
 const f2 = window.fetch; window.fetch = async (url,o={}) => { if (String(url).startsWith('https://script.google.com/')) { const b=JSON.parse(o.body);
   if (b.action==='exchange') { __ex++; return new Response(JSON.stringify({access_token:'AT-ex',expires_in:3599,refresh_token:'RT-secret-123'})); }
   if (b.action==='refresh') { __rf++; return new Response(JSON.stringify(b.refresh_token==='RT-secret-123'?{access_token:'AT-rf'+__rf,expires_in:3599}:{error:'invalid_grant'})); } }
   if (String(url).startsWith('https://oauth2.googleapis.com/revoke')) { window.__revoked=1; return new Response(''); }
   return f2(url,o); }; })()`;
await A.send('Page.navigate',{url:'http://localhost:8765/'}); await sleep(1500);
await A.ev(`$('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2500);
await A.ev(MOCK); await A.ev(HELPER);
await A.ev(`D.patients.push({id:'p1',uhid:'A-1',name:'Asha',buckets:['Routine']}); location.hash='#/settings'`); await sleep(500);
await A.ev(`ACT.driveconnect()`); await sleep(3000);
chk('code exchanged via helper', await A.ev(`__ex===1 && Drive.token==='AT-ex'`));
for (let i=0;i<12 && !(await A.ev(`Sync.state==='ok'`));i++) await sleep(500);
chk('synced', await A.ev(`Sync.state==='ok'`));
chk('refresh token stored encrypted', await A.ev(`IDB.get('kv','drt').then(x=>!!x && !JSON.stringify([...new Uint8Array(x.data)]).includes('RT-secret'))`));
await A.ev(`(async()=>{ Drive.exp=0; await IDB.del('meta','dtoken'); D.patients.push({id:'p2',uhid:'A-2',buckets:['Routine']}); Sync.quiet=true; await Store.flush(); Sync.quiet=false; await Sync.run(); })()`); await sleep(2000);
chk('expired token renewed silently (no reconnect bar)', await A.ev(`__rf===1 && Sync.state==='ok' && $('#drivebar').hidden`));
await A.ev(`(async()=>{ Drive.token='stale'; Drive.exp=Date.now()+99999; window.__s401=1; const f3=window.fetch; window.fetch=async(u,o)=>{ if(window.__s401 && String(u).includes('/drive/v3/files') ){ window.__s401=0; return new Response('',{status:401}); } return f3(u,o); }; await Drive.list(); })()`); await sleep(500);
chk('401 recovered via refresh + retry', await A.ev(`__rf===2 && Drive.token.startsWith('AT-rf')`));
await A.send('Page.reload'); await sleep(2500); await A.ev(MOCK); await A.ev(HELPER);
await A.ev(`(async()=>{ Drive.token=null; Drive.exp=0; await IDB.del('meta','dtoken'); await Sync.run(); })()`); await sleep(2000);
chk('after refresh of page: renews silently', await A.ev(`__rf>=1 && Sync.state==='ok'`));
await A.ev(`(async()=>{ await IDB.put('kv','drt', await Vault.encJSON('RT-bad')); Drive.token=null; Drive.exp=0; await IDB.del('meta','dtoken'); await Sync.run(); })()`); await sleep(1500);
chk('revoked refresh token -> falls back to reconnect bar', await A.ev(`Sync.state==='reconnect' && !$('#drivebar').hidden`));
await A.ev(`(async()=>{ await IDB.put('kv','drt', await Vault.encJSON('RT-secret-123')); window.__dlgDefault=true; await ACT.syncoff(); })()`); await sleep(800);
chk('turning off revokes & deletes refresh token', await A.ev(`window.__revoked===1 && IDB.get('kv','drt').then(x=>!x)`));
console.log('ERRORS', JSON.stringify(A.errs)); process.exit(0);
