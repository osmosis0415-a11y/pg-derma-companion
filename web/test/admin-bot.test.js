const crypto=require('crypto'),fs=require('fs');
const P={};const sent=[];const db={u1:{email:'a@x.com',name:'Asha',status:'pending'},u2:{email:'b@x.com',name:'Bo',status:'approved'}};let fetches=[];
const g={PropertiesService:{getScriptProperties:()=>({getProperty:k=>P[k]??null,setProperty:(k,v)=>P[k]=v})},
Session:{getEffectiveUser:()=>({getEmail:()=>'admin@x.com'})},
Utilities:{getUuid:()=>crypto.randomUUID(),computeHmacSha256Signature:(m,k)=>[...crypto.createHmac('sha256',k).update(m).digest()],base64EncodeWebSafe:b=>Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_')},
ScriptApp:{getService:()=>({getUrl:()=>'https://w/exec'}),getOAuthToken:()=>'T',getProjectTriggers:()=>[],newTrigger:()=>({timeBased:()=>({everyMinutes:()=>({create:()=>1})})})},
LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
MailApp:{sendEmail:o=>sent.push(o)},Logger:{log:()=>{}},
HtmlService:{createHtmlOutput:h=>({h,setTitle(){return this},setXFrameOptionsMode(){return this}}),XFrameOptionsMode:{DEFAULT:1}},
UrlFetchApp:{fetch:(url,o)=>{fetches.push([o.method,url]);const doc=(id)=>({name:'projects/p/databases/(default)/documents/approvals/'+id,fields:{email:{stringValue:db[id].email},name:{stringValue:db[id].name},status:{stringValue:db[id].status}}});
 let body;
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
