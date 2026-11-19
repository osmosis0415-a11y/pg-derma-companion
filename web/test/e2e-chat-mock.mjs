import fs from 'fs';
const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const ws = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend={}, errs=[]; ws.onmessage=m=>{const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]} if(d.method==='Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description);};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
const ev=async e=>{const r=(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result; if(r.exceptionDetails) errs.push('EVAL: '+r.exceptionDetails.exception?.description); return r.result?.value};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const chk=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const shot=async n=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/'+n+'.png',Buffer.from(r.result.data,'base64'))};
await send('Runtime.enable'); await send('Page.enable'); await send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'FIREBASE_CONFIG',{get(){return null},set(){}})"});
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
await send('Page.navigate',{url:'http://localhost:8765/'}); await sleep(1200);
await ev(`$('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2000);
// in-memory Firestore mock
await ev(`(()=>{
 const store=new Map(), subs=[];
 const key=p=>p.join('/');
 const notify=()=>subs.forEach(s=>s.fire());
 const f={
  serverTimestamp:()=>Date.now()+(window.__tick=(window.__tick||0)+1), doc:(db,...p)=>({p}), collection:(db,...p)=>({p,c:true}),
  where:(fld,op,v)=>({fld,op,v}), orderBy:(fld,dir)=>({ob:fld,dir}), limit:n=>({lim:n}), query:(c,...m)=>({p:c.p,m}),
  setDoc:async(d,v)=>{store.set(key(d.p),JSON.parse(JSON.stringify(v)));notify()},
  addDoc:async(c,v)=>{const k=key(c.p)+'/'+Math.random().toString(36).slice(2,8);store.set(k,JSON.parse(JSON.stringify(v)));notify();return{id:k}},
  getDoc:async d=>({exists:()=>store.has(key(d.p)),data:()=>store.get(key(d.p))}),
  deleteDoc:async d=>{store.delete(key(d.p));notify()},
  onSnapshot:(q,cb)=>{const pre=key(q.p)+'/';const s={fire(){let docs=[...store.entries()].filter(([k])=>k.startsWith(pre)&&!k.slice(pre.length).includes('/')).map(([k,v])=>({id:k.slice(pre.length),data:()=>v}));for(const m of (q.m||[])){if(m.op==='>=')docs=docs.filter(d=>d.data()[m.fld]>=m.v);if(m.ob){const v=d=>d.data()[m.ob];docs.sort((a,b)=>(v(a)>v(b)?1:v(a)<v(b)?-1:0)*(m.dir==='desc'?-1:1))}if(m.lim)docs=docs.slice(0,m.lim)}cb({docs})}};subs.push(s);s.fire();return()=>{subs.splice(subs.indexOf(s),1)}},
  signOut:async()=>{Cloud.user=null},
 };
 window.__store=store;
 D.settings.fbConfig={apiKey:'x',projectId:'demo'};
 Cloud.init=function(){this.f=f;this.db={};if(!this.user)this.user={uid:'u1',email:'a@x.com',displayName:'Sriram'};return Promise.resolve()};
})()`);

await ev(`location.hash='#/batch'`); await sleep(500);
await ev(`$('#b_name').value='Sriram';$('#b_bname').value='DVL PGs 2026';ACT.bcreate()`); await sleep(500);
const code = await ev(`D.batch.id`);
await ev(`location.hash='#/batch?t=chat'`); await sleep(500);
chk('chat tab shows warning + input', await ev(`!!$('.chatwarn') && !!$('#chatin')`));
await ev(`$('#chatin').value='Hi all, seminar slides uploaded';$('#chatform').requestSubmit()`); await sleep(400);
chk('message stored as me', await ev(`[...__store.entries()].some(([k,v])=>k.includes('/messages/')&&v.uid==='u1'&&v.text.startsWith('Hi all')&&v.name==='Sriram'&&typeof v.at==='number')`));
chk('message shown as mine', await ev(`$('.msg.me p').textContent.includes('seminar slides')`));
chk('input cleared', await ev(`$('#chatin').value===''`));
// batchmate replies
await ev(`__store.set('batches/${code}/members/u2',{name:'Priya',year:'JR1'});__store.set('batches/${code}/messages/zz1',{uid:'u2',name:'Priya',text:'Thanks! <b>bold?</b>\\nline2',at:Date.now()+1000});Cloud.f.setDoc(Cloud.f.doc(null,'x','y'),{})`); await sleep(400);
chk('reply shown with name', await ev(`[...document.querySelectorAll('.msg:not(.me)')].some(m=>m.querySelector('b').textContent==='Priya')`));
chk('html escaped + newline', await ev(`(()=>{const p=[...document.querySelectorAll('.msg:not(.me) p')].pop();return p.innerHTML.includes('&lt;b&gt;')&&p.innerHTML.includes('<br>')})()`));
chk('read while open (no unread)', await ev(`Chat.unread()===0`));
// unread badge when on another tab
await ev(`location.hash='#/batch?t=cal'`); await sleep(400);
await ev(`__store.set('batches/${code}/messages/zz2',{uid:'u2',name:'Priya',text:'Journal club moved to 3 pm',at:Date.now()+5000});Cloud.f.setDoc(Cloud.f.doc(null,'x','y'),{})`); await sleep(400);
chk('unread badge = 1', await ev(`Chat.unread()===1 && $('#chatbadge') && $('#chatbadge').textContent==='1'`));
await ev(`location.hash='#/batch?t=chat'`); await sleep(400);
chk('badge clears on open', await ev(`Chat.unread()===0`));
// PHI warning: cancel keeps text
await ev(`window.confirm=()=>false; $('#chatin').value='Pt UHID 2024-01421 call 9876543210'; $('#chatform').requestSubmit()`); await sleep(300);
chk('PHI prompt blocks on cancel', await ev(`$('#chatin').value.includes('9876543210') && ![...__store.values()].some(v=>v.text&&v.text.includes('9876543210'))`));
await ev(`window.confirm=()=>true; $('#chatform').requestSubmit()`); await sleep(300);
chk('PHI sent after confirm', await ev(`[...__store.values()].some(v=>v.text&&v.text.includes('9876543210'))`));
// delete own message
const own = await ev(`$('.msg.me [data-act=chatdel]').dataset.id`);
await ev(`window.confirm=()=>true; $('.msg.me [data-act=chatdel]').click()`); await sleep(300);
chk('own message deleted', await ev(`![...__store.keys()].some(k=>k.endsWith('/messages/${own}'))`));
chk('hash unchanged after delete click', await ev(`location.hash==='#/batch?t=chat'`));
chk('others messages have no delete for non-admin', await ev(`(()=>{D.batch.admin=false;paintChatList(true);return !document.querySelector('.msg:not(.me) [data-act=chatdel]')})()`));
await shot('chat');
chk('send bar visible above nav', await ev(`(()=>{const b=$('#chatform').getBoundingClientRect(),n=$('.nav.bottom').getBoundingClientRect();return b.bottom<=n.top+1 && b.top>0})()`));
console.log('ERRORS', JSON.stringify(errs)); process.exit(0);
