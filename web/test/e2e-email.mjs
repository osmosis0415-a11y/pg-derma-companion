const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const ws = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend={}, errs=[]; ws.onmessage=m=>{const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]} if(d.method==='Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description);};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
const ev=async e=>{const r=(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result; if(r.exceptionDetails) errs.push('EVAL '+r.exceptionDetails.exception?.description); return r.result?.value};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const chk=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await send('Runtime.enable'); await send('Page.navigate',{url:'http://localhost:8765/'}); await sleep(1500);
await ev(`$('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2500);
await ev(`(()=>{ const users={}; window.__sent=[]; const f={ signInWithEmailAndPassword:async(a,e,p)=>{ if(users[e]!==p){const x=new Error('bad');x.code='auth/invalid-credential';throw x} Cloud.user={uid:'U-'+e,email:e} },
 createUserWithEmailAndPassword:async(a,e,p)=>{ if(users[e]){const x=new Error();x.code='auth/email-already-in-use';throw x} users[e]=p; Cloud.user={uid:'U-'+e,email:e} },
 sendPasswordResetEmail:async(a,e)=>{window.__sent.push(e)}, doc:()=>({}), getDoc:async()=>({data:()=>undefined}) };
 Cloud.init=function(){this.f=f;this.auth={};this.db={};this.ready=Promise.resolve();return this.ready}; Cloud.user=null; })()`);
await ev(`location.hash='#/settings'`); await sleep(500);
chk('email fields shown', await ev(`!!$('#sy_email') && !!$('#sy_pw') && !!$('[data-act=syncemail][data-mode=up]')`));
await ev(`ACT.syncemail({dataset:{mode:'in'}})`); await sleep(300); chk('empty email rejected', await ev(`$('#toast').textContent==='Enter your email'`));
await ev(`$('#sy_email').value='doc@x.com';$('#sy_pw').value='123';ACT.syncemail({dataset:{mode:'up'}})`); await sleep(300); chk('short password rejected', await ev(`$('#toast').textContent.includes('6 characters')`));
await ev(`$('#sy_pw').value='secret1';ACT.syncemail({dataset:{mode:'up'}})`); await sleep(500);
chk('account created & signed in', await ev(`Cloud.user && Cloud.user.email==='doc@x.com' && !!$('[data-act=syncon]')`));
await ev(`Cloud.user=null; $('#synccard').innerHTML=syncCardHTML(); $('#sy_email').value='doc@x.com';$('#sy_pw').value='wrongpw';ACT.syncemail({dataset:{mode:'in'}})`); await sleep(400);
chk('wrong password message', await ev(`$('#toast').textContent==='Wrong email or password'`));
await ev(`$('#sy_pw').value='secret1';ACT.syncemail({dataset:{mode:'in'}})`); await sleep(400); chk('sign in works', await ev(`Cloud.user && !!$('[data-act=syncon]')`));
await ev(`Cloud.user=null; $('#synccard').innerHTML=syncCardHTML(); $('#sy_email').value='doc@x.com'; ACT.syncemail({dataset:{mode:'reset'}})`); await sleep(300);
chk('reset email sent', await ev(`__sent[0]==='doc@x.com'`));
console.log('ERRORS', JSON.stringify(errs)); process.exit(0);
