const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const ws = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend={}, errs=[]; ws.onmessage=m=>{const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]} if(d.method==='Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description);};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
const ev=async e=>{const r=(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result; if(r.exceptionDetails) errs.push('EVAL '+r.exceptionDetails.exception?.description); return r.result?.value};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const chk=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await send('Runtime.enable'); await send('Page.navigate',{url:'http://localhost:8765/'}); await sleep(1500);
await ev(`$('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2500);
await ev(`(()=>{ const store=window.__store=new Map(); const key=p=>p.join('/'); window.__verified=false; window.__sent=0; window.__deleted=false;
 const mkUser=e=>({uid:'U1',email:e,get emailVerified(){return window.__verified},providerData:[{providerId:'password'}],reload:async()=>{},getIdToken:async()=>'t'});
 const auth={currentUser:null};
 const f={ serverTimestamp:()=>'TS', doc:(db,...p)=>({p,ref:{p}}), collection:(db,...p)=>({p}), where:()=>({}),orderBy:()=>({}),query:c=>c,
  createUserWithEmailAndPassword:async(a,e,p)=>{auth.currentUser=mkUser(e)}, signInWithEmailAndPassword:async(a,e,p)=>{auth.currentUser=mkUser(e)},
  sendEmailVerification:async()=>{window.__sent++}, sendPasswordResetEmail:async()=>{window.__reset=1}, signOut:async()=>{auth.currentUser=null},
  deleteUser:async()=>{window.__deleted=true},
  setDoc:async(d,v)=>store.set(key(d.p),JSON.parse(JSON.stringify(v))), getDoc:async d=>({exists:()=>store.has(key(d.p)),data:()=>store.get(key(d.p))}),
  deleteDoc:async d=>store.delete(key(d.p||d.ref.p)),
  getDocs:async c=>{const pre=key(c.p)+'/';return{docs:[...store.keys()].filter(k=>k.startsWith(pre)&&!k.slice(pre.length).includes('/')).map(k=>({id:k.slice(pre.length),ref:{p:k.split('/')},data:()=>store.get(k)}))}},
  writeBatch:()=>{const o=[];return{set:(d,v)=>o.push([d,v]),commit:async()=>o.forEach(([d,v])=>store.set(key(d.p),JSON.parse(JSON.stringify(v))))}},
  onSnapshot:()=>()=>{} };
 Cloud.init=function(){this.f=f;this.auth=auth;this.db={};this.ready=Promise.resolve();return this.ready}; Cloud.user=null; })()`);
await ev(`location.hash='#/batch'`); await sleep(500);
await ev(`$('#b_email').value='doc@x.com';$('#b_pw').value='secret1';ACT.esignup()`); await sleep(600);
chk('verification email sent on signup', await ev(`__sent===1`));
chk('batch hub shows verify card', await ev(`!!$('[data-act=vcheck]') && !$('#b_code')`));
await ev(`ACT.vresend()`); await sleep(200); chk('resend works', await ev(`__sent===2`));
await ev(`ACT.vcheck()`); await sleep(300); chk('not verified stays', await ev(`!!$('[data-act=vcheck]')`));
await ev(`__verified=true; ACT.vcheck()`); await sleep(500); chk('verified → batch join screen', await ev(`!!$('#b_code')`));
await ev(`location.hash='#/settings'`); await sleep(500);
chk('settings: Drive card + batch account card', await ev(`!!$('#synccard [data-act=driveconnect]') && $('#synccard').textContent.includes('Batch hub account') && $('#synccard').textContent.includes('verified')`));
await ev(`ACT.acctpw()`); await sleep(200); chk('change password email', await ev(`__reset===1`));
await ev(`window.prompt=()=> 'DELETE'; ACT.acctdel()`); await sleep(800);
chk('batch account deleted, local data kept', await ev(`__deleted===true && !!D && Cloud.user===null`));
await ev(`location.hash='#/batch'`); await sleep(400); await ev(`$('#b_email').value='doc@x.com';$('#b_pw').value='secret1';ACT.esignin()`); await sleep(400);
await ev(`location.hash='#/settings'`); await sleep(400); await ev(`ACT.acctsignout()`); await sleep(400); chk('sign out works', await ev(`Cloud.user===null`));
console.log('ERRORS', JSON.stringify(errs)); process.exit(0);
