const mk = async port => {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
  let id=0; const pend={}, errs=[]; ws.onmessage=m=>{const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]} if(d.method==='Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description);};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
  const ev=async e=>{const r=(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result; if(r.exceptionDetails) errs.push('EVAL: '+(r.exceptionDetails.exception?.description||'').slice(0,300)); return r.result?.value};
  await send('Runtime.enable'); await send('Page.enable'); return {send,ev,errs};
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const chk=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const MOCK = email => `(()=>{ const st = window.__fs = window.__fs || new Map(); const subs=[]; const key=p=>p.join('/');
 const fire=()=>subs.forEach(s=>s.fire());
 const f={ serverTimestamp:()=>({seconds:Math.floor(Date.now()/1000)}), doc:(db,...p)=>({p}), collection:(db,...p)=>({p,c:1}),
  GoogleAuthProvider:function(){this.setCustomParameters=()=>{}},
  signInWithPopup:async()=>{ auth.currentUser={uid:'U-'+${JSON.stringify(email)},email:${JSON.stringify(email)},displayName:'Dr Test',photoURL:'',emailVerified:true}; },
  signInWithRedirect:async()=>{}, signOut:async()=>{auth.currentUser=null; Cloud.user=null},
  getDoc:async d=>({exists:()=>st.has(key(d.p)),data:()=>st.get(key(d.p))}),
  setDoc:async(d,v)=>{st.set(key(d.p),JSON.parse(JSON.stringify(v)));fire()},
  updateDoc:async(d,v)=>{st.set(key(d.p),Object.assign({},st.get(key(d.p)),JSON.parse(JSON.stringify(v))));fire()},
  onSnapshot:(q,cb)=>{const k=key(q.p);const s={fire(){ if(q.c){cb({docs:[...st.keys()].filter(x=>x.startsWith(k+'/')&&!x.slice(k.length+1).includes('/')).map(x=>({id:x.slice(k.length+1),data:()=>st.get(x)}))})} else cb({data:()=>st.get(k)}) }};subs.push(s);s.fire();return()=>subs.splice(subs.indexOf(s),1)} };
 const auth=window.__auth=window.__auth||{currentUser:null};
 Cloud.init=function(){this.f=f;this.auth=auth;this.db={};this.user=auth.currentUser;this.ready=Promise.resolve();return this.ready}; })()`;
// ---------- Resident (non-admin) ----------
const R = await mk(9333);
await R.send('Page.navigate',{url:'http://localhost:8765/'}); await sleep(2500);
chk('gate blocks app before sign-in (no PIN screen)', await R.ev(`!document.getElementById('pin') && $('#app').hidden`));
await R.ev(MOCK('resident@gmail.com')); await R.ev(`Gate.screen()`); await sleep(400);
chk('Google sign-in button only', await R.ev(`!!$('#gsign') && !document.querySelector('input[type=email]')`));
await R.ev(`$('#gsign').click()`); await sleep(800);
chk('pending screen after sign-in', (await R.ev(`$('#lock').textContent`)).includes('Waiting for approval'));
chk('request filed as pending', await R.ev(`__fs.get('approvals/U-resident@gmail.com').status==='pending' && __fs.get('approvals/U-resident@gmail.com').email==='resident@gmail.com'`));
chk('WhatsApp ask button', await R.ev(`$('#lock a.btn.wa').href.includes('wa.me')`));
// admin rejects then approves (simulate decisions arriving live)
await R.ev(`Cloud.f.updateDoc({p:['approvals','U-resident@gmail.com']},{status:'rejected'})`); await sleep(300);
chk('rejected screen live', (await R.ev(`$('#lock').textContent`)).includes('not approved'));
await R.ev(`Cloud.f.updateDoc({p:['approvals','U-resident@gmail.com']},{status:'approved'})`); await sleep(1200);
chk('approval opens PIN setup', await R.ev(`!!document.getElementById('pin2')`));
await R.ev(`$('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2500);
chk('app usable after approval', await R.ev(`!!D && !$('#app').hidden`));
await R.ev(`location.hash='#/settings'`); await sleep(500);
chk('account card shows Google email, no admin link', await R.ev(`$('#synccard').textContent.includes('resident@gmail.com') && !$('#synccard a[href="#/admin"]')`));
chk('non-admin has no admin tile', await R.ev(`(location.hash='#/more', new Promise(r=>setTimeout(()=>r(!$('a.tile[href="#/admin"]')),300)))`));
await R.send('Page.reload'); await sleep(2500);
chk('approved user: refresh goes straight in (offline-capable cache)', await R.ev(`!!D && !$('#app').hidden`));
// revoke
await R.ev(MOCK('resident@gmail.com')); await R.ev(`Cloud.init(); Cloud.user=__auth.currentUser={uid:'U-resident@gmail.com',email:'resident@gmail.com',emailVerified:true}; __fs.set('approvals/U-resident@gmail.com',{status:'pending'}); Cloud.f.updateDoc({p:['approvals','U-resident@gmail.com']},{status:'rejected'})`);
await R.ev(`Gate.recheck()`); await sleep(1200);
chk('revoked user locked out', (await R.ev(`$('#lock').textContent`)).includes('removed by the admin') && await R.ev(`!D && IDB.get('meta','gate').then(g=>!g)`));
// ---------- Admin ----------
const Ad = await mk(9334);
await Ad.send('Page.navigate',{url:'http://localhost:8765/'}); await sleep(2500);
await Ad.ev(MOCK('sriramdeverashetty@gmail.com'));
await Ad.ev(`__fs.set('approvals/U-a',{email:'a@gmail.com',name:'Batchmate A',status:'pending',requestedAt:{seconds:1763500000}}); __fs.set('approvals/U-b',{email:'b@gmail.com',name:'Batchmate B',status:'approved',requestedAt:{seconds:1763400000}})`);
await Ad.ev(`Gate.screen()`); await sleep(300); await Ad.ev(`$('#gsign').click()`); await sleep(1200);
chk('admin auto-approved (no request filed)', await Ad.ev(`!!document.getElementById('pin2') && !__fs.has('approvals/U-sriramdeverashetty@gmail.com')`));
await Ad.ev(`$('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2500);
await Ad.ev(`location.hash='#/more'`); await sleep(300); chk('admin tile visible', await Ad.ev(`!!$('a.tile[href="#/admin"]')`));
await Ad.ev(`location.hash='#/admin'`); await sleep(600);
chk('admin sees pending request', (await Ad.ev(`$('#alist').textContent`)).includes('a@gmail.com'));
chk('pending count badge', (await Ad.ev(`$('#cnt_pending').textContent`))==='1');
await Ad.ev(`$('[data-act=adminset][data-s=approved]').click()`); await sleep(500);
chk('approve updates status + decidedBy', await Ad.ev(`__fs.get('approvals/U-a').status==='approved' && __fs.get('approvals/U-a').decidedBy==='sriramdeverashetty@gmail.com'`));
await Ad.ev(`location.hash='#/admin?t=approved'`); await sleep(500);
chk('approved list shows both', await Ad.ev(`$('#alist').textContent.includes('a@gmail.com') && $('#alist').textContent.includes('b@gmail.com')`));
await Ad.ev(`window.confirm=()=>true; [...document.querySelectorAll('[data-act=adminset]')].find(b=>b.textContent==='Revoke').click()`); await sleep(400);
chk('revoke works', await Ad.ev(`[...__fs.values()].filter(x=>x.status==='rejected').length===1`));
console.log('ERRORS R', JSON.stringify(R.errs)); console.log('ERRORS A', JSON.stringify(Ad.errs)); process.exit(0);
