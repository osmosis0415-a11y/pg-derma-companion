const crypto=require('crypto'),fs=require('fs');
const P={};const sent=[];const db={u1:{email:'a@x.com',name:'Asha',status:'pending'},u2:{email:'b@x.com',name:'Bo',status:'approved'}};let fetches=[];const beats=[];
const g={PropertiesService:{getScriptProperties:()=>({getProperty:k=>P[k]??null,setProperty:(k,v)=>P[k]=v})},
Session:{getEffectiveUser:()=>({getEmail:()=>'admin@x.com'}),getActiveUser:()=>({getEmail:()=>(globalThis.__ACTIVE??'admin@x.com')})},
Utilities:{getUuid:()=>crypto.randomUUID(),computeHmacSha256Signature:(m,k)=>[...crypto.createHmac('sha256',k).update(m).digest()],base64EncodeWebSafe:b=>Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_')},
ScriptApp:{getService:()=>({getUrl:()=>'https://w/exec'}),getOAuthToken:()=>'T',getProjectTriggers:()=>[],newTrigger:()=>({timeBased:()=>({everyMinutes:()=>({create:()=>1})})})},
LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
MailApp:{sendEmail:o=>sent.push(o)},Logger:{log:()=>{}},
HtmlService:{createHtmlOutput:h=>({h,setTitle(){return this},setXFrameOptionsMode(){return this}}),XFrameOptionsMode:{DEFAULT:1}},
UrlFetchApp:{fetch:(url,o)=>{fetches.push([o.method,url]);const doc=(id)=>({name:'projects/p/databases/(default)/documents/approvals/'+id,fields:{email:{stringValue:db[id].email},name:{stringValue:db[id].name},status:{stringValue:db[id].status}}});
 let body;
 if(url.includes('/system/bot')){if(globalThis.__BEATFAIL)return {getResponseCode:()=>500,getContentText:()=>'boom'};beats.push({method:o.method,url,f:JSON.parse(o.payload).fields});return {getResponseCode:()=>200,getContentText:()=>'{}'}}
 if(url.endsWith(':runQuery')){const st=JSON.parse(o.payload).structuredQuery.where.fieldFilter.value.stringValue;body=Object.keys(db).filter(k=>db[k].status===st).map(k=>({document:doc(k)}));if(!body.length)body=[{readTime:'x'}]}
 else {const id=decodeURIComponent(url.split('/approvals/')[1].split('?')[0]); if(o.method==='patch'){db[id].status=JSON.parse(o.payload).fields.status.stringValue} body=doc(id)}
 return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(body)}}}};
const src=fs.readFileSync(require('path').join(__dirname,'../../tools/admin-bot.gs'),'utf8');const f=new Function(...Object.keys(g),src+';return {checkNew,doGet,decide,setup,link_,dashLink_};');const B=f(...Object.values(g));
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
B.setup();ok('setup sends confirmation',sent[0].subject.includes('connected'));sent.shift();B.checkNew();ok('email for new pending',sent.length===1&&sent[0].htmlBody.includes('Asha')&&!sent[0].htmlBody.includes('Bo<'));
B.checkNew();ok('no duplicate email',sent.length===1);
const L=new URL(B.link_('u1','approve'));const q=Object.fromEntries(L.searchParams);
ok('confirm page does not change status',B.doGet({parameter:q}).h.includes('Confirm: Approve')&&db.u1.status==='pending');
ok('bad sig rejected page',B.doGet({parameter:{...q,s:q.s.slice(0,-1)+'A'}}).h.includes('not valid'));
let threw=false;try{B.decide('u1','approve','bad')}catch(e){threw=true}ok('decide rejects bad sig',threw&&db.u1.status==='pending');
threw=false;try{B.decide('u1','reject',q.s)}catch(e){threw=true}ok('approve sig cannot reject',threw);
ok('decide approves',B.decide('u1','approve',q.s).includes('Approved Asha')&&db.u1.status==='approved');
const D=Object.fromEntries(new URL(B.dashLink_()).searchParams);ok('list page',B.doGet({parameter:D}).h.includes('Nobody is waiting'));
ok('list needs key',B.doGet({parameter:{a:'list',s:'x'}}).h.includes('not valid'));
db.u3={email:'c@x.com',name:'<script>',status:'pending'};B.checkNew();ok('escapes html + new one notified',sent.length===2&&sent[1].htmlBody.includes('&lt;script&gt;'));
// Owner-only guard: anonymous web-app visitors (google.script.run) must not reach admin functions.
{ const n0=sent.length; globalThis.__ACTIVE='';
  let blocked=0; for (const fn of ['checkNew','setup']) { try { B[fn](); } catch(e){ if(/Not allowed/.test(e.message)) blocked++; } }
  let fake=false; try { B.checkNew({triggerUid:'guess-123'}); } catch(e){ fake=/Not allowed/.test(e.message); }
  ok('anonymous caller blocked from admin functions', blocked===2 && fake && sent.length===n0);
  globalThis.__ACTIVE=undefined; }
// Bot heartbeat for the app's Admin -> Health tab: system/bot { lastRun, ok, note } after every run.
{ beats.length=0; B.checkNew(); const b=beats[beats.length-1];
  ok('heartbeat written after a run', beats.length===1 && b.method==='patch' && /\/system\/bot\?/.test(b.url));
  ok('heartbeat fields are lastRun/ok/note only', b && Object.keys(b.f).sort().join()==='lastRun,note,ok' && !!b.f.lastRun.timestampValue && b.f.ok.booleanValue===true);
  ok('heartbeat uses update mask (no other fields touched)', b && ['lastRun','ok','note'].every(k=>b.url.includes('updateMask.fieldPaths='+k)));
  const n0=sent.length; db.u4={email:'d@x.com',name:'Dee',status:'pending'}; B.checkNew(); ok('heartbeat also on runs that send email', beats.length===2 && sent.length===n0+1);
  globalThis.__BEATFAIL=1; let thr=false; try { B.checkNew(); } catch(e){ thr=true; } globalThis.__BEATFAIL=0; ok('heartbeat failure never breaks the run', !thr);
  globalThis.__ACTIVE=''; const nb=beats.length; try { B.checkNew(); } catch(e){} globalThis.__ACTIVE=undefined; ok('blocked caller writes no heartbeat', beats.length===nb); }
