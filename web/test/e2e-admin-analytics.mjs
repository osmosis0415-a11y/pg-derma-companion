// Admin → Analytics / Storage / Health tabs (issue #16). The usage heartbeat is switched off in this release (USAGE_ENABLED = false).
// Needs: python3 -m http.server 8765 -d dist  and  Chrome with --remote-debugging-port=9333 (fresh profile).
import fs from 'fs';
import os from 'os';
import path from 'path';
const SHOTS = fs.mkdtempSync(path.join(os.tmpdir(), 'pgd-e2e-'));
const MOCK = fs.readFileSync(new URL('./fs-shared-mock.js', import.meta.url), 'utf8');
const DLG = fs.readFileSync(new URL('./dlg-auto.js', import.meta.url), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms)); let fails = 0; const chk = (n, c) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const t = (await (await fetch('http://127.0.0.1:9333/json')).json()).find(t => t.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(), errs = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const cb = pend.get(d.id); pend.delete(d.id); cb(d); }
  if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push('console: ' + d.params.args.map(a => a.value || a.description).join(' ')); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result; if (r.exceptionDetails) errs.push('EVAL: ' + (r.exceptionDetails.exception?.description || '').slice(0, 300)); return r.result?.value; };
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.result.data, 'base64')); };
// No real network: GitHub Actions API is stubbed; every other non-local request is recorded.
const NET = `(()=>{ window.__net=[]; const real=window.fetch.bind(window); window.fetch=async(u,o)=>{ const s=String(u);
  if(s.startsWith('https://api.github.com/')){ window.__gh=(window.__gh||0)+1; window.__ghOpts=o; if(window.__ghFail) return new Response('',{status:503});
    return new Response(JSON.stringify({workflow_runs:[{name:'Deploy to GitHub Pages',head_branch:'main',event:'push',status:'completed',conclusion:'success',created_at:new Date(Date.now()-3600e3).toISOString()},{name:'PR checks',head_branch:'w-1',event:'pull_request',status:'completed',conclusion:'success',created_at:new Date(Date.now()-7200e3).toISOString()}]}),{status:200,headers:{'content-type':'application/json'}}); }
  if(!s.startsWith(location.origin)) window.__net.push(s); return real(u,o); }; })();`;
await send('Runtime.enable'); await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(window,'FIREBASE_CONFIG',{get(){return null},set(){}});" + DLG + MOCK + NET });
await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(1500);
await ev(`$('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2000);
chk('app unlocked', await ev(`!!D && !$('#app').hidden`));

// ---------- Resident: heartbeat is OFF ----------
const SPY = `(()=>{ window.__w=[]; Cloud.init(); const f=Cloud.f; if(!f.__spy){ f.__spy=1; const s=f.setDoc, d=f.deleteDoc, a=f.addDoc; f.setDoc=async(r,v,o)=>{ __w.push({p:r.path}); return s(r,v,o); }; f.addDoc=async(c,v)=>{ __w.push({p:c.p.join('/')+'/*'}); return a(c,v); }; f.deleteDoc=async r=>{ __w.push({p:r.path,del:1}); return d(r); }; } })()`;
await ev(`__installFsMock('uRes1','res@x.com','Dr Res'); Gate.cached={uid:'uRes1',email:'res@x.com',status:'approved'};`);
await ev(SPY);
// Even with consent and counters left over from a test build, nothing is sent, counted, asked or shown.
await ev(`D.settings.usageShare=true; D.settings.usageShareUid='uRes1'; D.patients.push({id:'p1',uhid:'UH-2026-1001',name:'Ravi Kumar',dx:['Vitiligo'],buckets:['Routine']}); Store.save(); localStorage.setItem('pgd_feat:uRes1','{"home":1}'); localStorage.setItem('pgd_usage:uRes1','{}')`);
chk('USAGE_ENABLED is false in the build', await ev(`USAGE_ENABLED===false && Usage.on()===false`));
for (const h of ['#/patients', '#/patient/p1', '#/vault', '#/study', '#/home']) { await ev(`location.hash='${h}'`); await sleep(250); }
await ev(`Usage.start(50)`); await sleep(1000); await ev(`Usage.beat()`); await ev(`Usage.setShare(true)`); await sleep(1200);
chk('normal user: no usage write at all', (await ev(`__w.filter(x=>x.p.startsWith('usage/')).length`)) === 0 && (await ev(`!Object.keys(JSON.parse(localStorage.fsmock||'{}')).some(k=>k.startsWith('usage/'))`)));
chk('normal user: no local counters kept', await ev(`localStorage.getItem('pgd_feat:uRes1')==='{"home":1}' && Object.keys(localStorage).filter(k=>/^pgd_(feat|usage)/.test(k)).length===2`));
chk('normal user: no Today opt-in card', await ev(`location.hash==='#/home' && !$('#usageask') && !$('#main').textContent.includes('Share daily usage counts')`));
await ev(`location.hash='#/settings'`); await sleep(500);
chk('normal user: no Settings usage toggle', await ev(`!$('#s_usage') && !$('#main').textContent.includes('usage counts')`));
chk('no external network', (await ev(`__net.length`)) === 0);

// ---------- Admin: Analytics / Storage / Health ----------
await ev(`Cloud.user=null; __installFsMock('uAdm','sriramdeverashetty@gmail.com','Sriram'); Gate.cached={uid:'uAdm',email:'sriramdeverashetty@gmail.com',status:'approved'};
(()=>{ const o={}, now=Date.now(), day=n=>usageDay(now-n*864e5), wk=7*864e5;
  o['approvals/uA']={email:'a@x.com',name:'A',status:'approved',year:'JR1',requestedAt:{seconds:Math.floor((now-2*864e5)/1000)}};
  o['approvals/uB']={email:'b@x.com',name:'B',status:'approved',year:'JR3',requestedAt:{seconds:Math.floor((now-3*864e5)/1000)}};
  o['approvals/uC']={email:'c@x.com',name:'C',status:'pending',requestedAt:{seconds:Math.floor((now-1*wk-864e5)/1000)}};
  o['approvals/uD']={email:'d@x.com',name:'D',status:'rejected',requestedAt:{seconds:Math.floor((now-5*wk)/1000)}};
  o['approvals/uE']={email:'e@x.com',name:'E',status:'approved',requestedAt:{seconds:Math.floor((now-20*wk)/1000)}};
  const V=APP_VERSION, OLD='2026.01.01-0000-old';
  o['usage/uA']={day:day(0),v:V,plat:'android',inst:true,dept:'derma',yr:'JR1',n:{patients:4},feat:{home:3,study:5},lsMB:20,drv:{appMB:40,usedGB:14.5,totalGB:15},lastSync:now-3600e3,syncFail:0,at:now};
  o['usage/uB']={day:day(0),v:V,plat:'ios',inst:false,dept:'derma',yr:'',n:{patients:1},feat:{study:2},lsMB:10,drv:{appMB:20,usedGB:2,totalGB:15},lastSync:now-9*864e5,syncFail:3,at:now};
  o['usage/uE']={day:day(3),v:OLD,plat:'desktop',inst:false,dept:'derma',yr:'JR2',n:{patients:0},lsMB:5,lastSync:null,syncFail:0,at:now};
  o['usage/uF']={day:day(20),v:OLD,plat:'android',inst:true,dept:'derma',yr:'JR3',n:{},lsMB:1,lastSync:null,syncFail:0,at:now};
  o['usage/'+new Date().toISOString().slice(0,7)]={relayMB:12,relayCalls:2,updatedAt:now};
  o['errors/e1']={type:'error',msg:'<img src=x onerror=window.__xss=1> boom',version:V,uid:'uB',createdAt:now-3600e3,route:'#/',stack:'',ua:'',at:''};
  o['errors/e2']={type:'error',msg:'TypeError: x is undefined',version:OLD,uid:'uE',createdAt:now-3*864e5,route:'#/',stack:'',ua:'',at:''};
  o['errors/e3']={type:'error',msg:'TypeError: x is undefined',version:OLD,uid:'uZ',createdAt:now-30*864e5,route:'#/',stack:'',ua:'',at:''};
  o['system/bot']={lastRun:now-60e3,ok:true};
  o['batches/DVL-AAAA-BBBB']={name:'<img src=x onerror=window.__xss=1>DVL 2026',createdBy:'uA',admins:['uA']};
  o['batches/DVL-AAAA-BBBB/members/uA']={name:'A',year:'JR1'}; o['batches/DVL-AAAA-BBBB/members/uB']={name:'B',year:'JR3'};
  o['batches/DVL-AAAA-BBBB/messages/m1']={uid:'uA',name:'A',text:'hi',at:now-864e5}; o['batches/DVL-AAAA-BBBB/messages/m2']={uid:'uA',name:'A',text:'old',at:now-10*864e5};
  for (let i=0;i<3;i++) o['posts/p'+i]={uid:'uA',text:'x'.repeat(20)};
  localStorage.fsmock=JSON.stringify(o); adminCache=null; })()`);
// Start with ZERO usage docs (only the monthly relay doc), as in this release.
await ev(`(()=>{ const o=JSON.parse(localStorage.fsmock); window.__usageSeed={}; for (const k of Object.keys(o)) if (k.startsWith('usage/u')) { __usageSeed[k]=o[k]; delete o[k]; } localStorage.fsmock=JSON.stringify(o); adminCache=null; })()`);
const NEEDS = 'Needs the usage counts update (coming in a later update)';
await ev(`location.hash='#/admin?t=analytics'`); await sleep(1500);
const an0 = await ev(`$('#aan').textContent`);
chk('no usage: analytics approvals counts', await ev(`(()=>{const s=$$('#aan .card')[1].querySelectorAll('.stat b');return s[0].textContent==='3'&&s[1].textContent==='1'&&s[2].textContent==='1'})()`));
chk('no usage: sign-up chart still drawn', (await ev(`$$('#aan svg.abars rect').length`)) === 12);
chk('no usage: by year from approved accounts', an0.includes('approved accounts, from sign-up') && an0.includes('JR1') && an0.includes('JR3') && an0.includes('unknown'));
chk('no usage: active/dept/platform/features say "needs update"', (await ev(`$$('#aan .needs-usage').length`)) === 4 && an0.includes(NEEDS));
chk('no usage: batches still counted', await ev(`(()=>{const r=$('#abatch tr:nth-child(2)'); return !!r && r.children[1].textContent==='2' && r.children[2].textContent==='1'})()`));
chk('no usage: compact light green (missing data is not a problem)', await ev(`$('#hlight').dataset.light==='green'`));
await ev(`location.hash='#/admin?t=storage'`); await sleep(1500);
const st0 = await ev(`$('#ast').textContent`);
chk('no usage: Firestore counts', await ev(`$('#ast [data-c=approvals]').textContent==='5' && $('#ast [data-c=posts]').textContent==='3' && $('#ast [data-c=usage]').textContent==='1'`));
chk('no usage: gauges, reads/writes estimated from approved users', (await ev(`$$('#ast .gauge').length`)) === 3 && st0.includes('3 × 300, estimate from approved users') && st0.includes('3 × 25, estimate from approved users'));
chk('no usage: Drive + on-device say "needs update"', (await ev(`$$('#ast .needs-usage').length`)) === 2);
await ev(`location.hash='#/admin?t=health'`); await sleep(1800);
const hx0 = await ev(`$('#ahl').textContent`);
chk('no usage: errors 24h / 7d still shown', await ev(`(()=>{const s=$$('#ahl .card')[1].querySelectorAll('.stat b');return s.length===2&&s[0].textContent==='1'&&s[1].textContent==='2'})()`) && hx0.includes('TypeError: x is undefined'));
chk('no usage: crash-free + versions say "needs update", no 0%', (await ev(`$$('#ahl .needs-usage').length`)) === 2 && !/\b0%/.test(hx0) && !hx0.includes('—%'));
chk('no usage: bot + GitHub still work', await ev(`$('#botst').dataset.bad==='0'`) && hx0.includes('Deploy to GitHub Pages'));
chk('no usage: health light green', await ev(`$('#hlight').dataset.light==='green' && $('#hlight').textContent.includes('🟢')`));
await shot('admin-health-nousage');
// Then with usage docs (what the tabs show once the heartbeat ships).
await ev(`(()=>{ const o=JSON.parse(localStorage.fsmock); Object.assign(o, __usageSeed); localStorage.fsmock=JSON.stringify(o); adminCache=null; })()`);
await ev(`location.hash='#/admin?t=analytics'`); await sleep(1500);
const an = await ev(`$('#aan').textContent`);
chk('analytics: tabs present', await ev(`['analytics','storage','health'].every(k=>!!document.querySelector('a.chip[href="#/admin?t='+k+'"]'))`));
chk('analytics: approval counts', await ev(`(()=>{const s=$$('#aan .card')[1].querySelectorAll('.stat b');return s[0].textContent==='3'&&s[1].textContent==='1'&&s[2].textContent==='1'})()`));
chk('analytics: active today / 7d / 30d', await ev(`(()=>{const s=$$('#aan .card')[2].querySelectorAll('.stat b');return s[0].textContent==='2'&&s[1].textContent==='3'&&s[2].textContent==='4'})()`));
chk('analytics: sign-up bar chart (12 weeks)', (await ev(`$$('#aan svg.abars rect').length`)) === 12 && (await ev(`[...$$('#aan svg.abars rect')].slice(-1)[0].getAttribute('height')>0`)));
chk('analytics: year falls back to sign-up year', an.includes('JR1') && an.includes('JR3') && an.includes('JR2'));
chk('analytics: platforms, installed vs browser, features', an.includes('android') && an.includes('ios') && an.includes('installed') && an.includes('browser') && an.includes('study'));
chk('analytics: compact traffic light', await ev(`!!$('#aan #hlight') && ['green','yellow','red'].includes($('#hlight').dataset.light)`));
chk('analytics: batch members + messages this week (count queries)', await ev(`(()=>{const r=$('#abatch tr:nth-child(2)'); return !!r && r.children[1].textContent==='2' && r.children[2].textContent==='1'})()`));
await shot('admin-analytics');
await ev(`location.hash='#/admin?t=storage'`); await sleep(1500);
chk('storage: doc counts per collection', await ev(`$('#ast [data-c=approvals]').textContent==='5' && $('#ast [data-c=posts]').textContent==='3' && $('#ast [data-c=usage]').textContent==='5' && $('#ast [data-c=batches]').textContent==='1'`));
chk('storage: gauges vs free tier', (await ev(`$$('#ast .gauge').length`)) === 3 && await ev(`$$('#ast .gauge').every(g=>['ok','warn','bad'].includes(g.dataset.level))`));
const stx = await ev(`$('#ast').textContent`);
chk('storage: Drive full + not-synced lists show uid prefix + year only', stx.includes('uA') && stx.includes('uB') && !stx.includes('a@x.com') && !stx.includes('b@x.com') && /Drive over 90% full \(1\)/.test(stx) && /Not synced for 7\+ days \(1\)/.test(stx));
chk('storage: total / average backup', stx.includes('30.0 MB') && stx.includes('0.06 GB'));
await shot('admin-storage');
await ev(`location.hash='#/admin?t=health'`); await sleep(1800);
const hx = await ev(`$('#ahl').textContent`);
chk('health: errors 24h / 7d', await ev(`(()=>{const s=$$('#ahl .card')[1].querySelectorAll('.stat b');return s[0].textContent==='1'&&s[1].textContent==='2'})()`));
chk('health: crash-free users (3 active, 2 with errors -> 33.3%)', hx.includes('33.3%'));
chk('health: latest version adoption (2 of 3)', hx.includes('66.7%'));
chk('health: sync health (1 of 2 sync users in 24 h)', hx.includes('50%'));
chk('health: bot heartbeat fresh', await ev(`$('#botst').dataset.bad==='0' && $('#botst').textContent.includes('Last run')`));
chk('health: GitHub runs shown (stubbed)', hx.includes('Deploy to GitHub Pages') && hx.includes('PR checks') && (await ev(`window.__gh>=1 && window.__ghOpts.credentials==='omit'`)));
chk('health: traffic light red (crash-free < 90%)', await ev(`$('#hlight').dataset.light==='red' && $('#hlight').textContent.includes('🔴') && $('#hlight').textContent.includes('crash-free')`));
await shot('admin-health');
await ev(`(()=>{const o=JSON.parse(localStorage.fsmock); delete o['system/bot']; localStorage.fsmock=JSON.stringify(o); adminCache=null; window.__ghFail=1; render();})()`); await sleep(1500);
chk('health: bot "never" when missing', await ev(`$('#botst').dataset.bad==='0' && $('#botst').dataset.never==='1' && $('#botst').textContent.includes('🟡') && $('#botst').textContent.includes('never')`));
chk('health: GitHub failure handled', (await ev(`$('#ghruns').textContent`)).includes('Could not reach GitHub'));
await ev(`(()=>{const o=JSON.parse(localStorage.fsmock); o['system/bot']={lastRun:Date.now()-30*60e3,ok:true}; for(const k of ['errors/e1','errors/e2']) delete o[k]; localStorage.fsmock=JSON.stringify(o); adminCache=null; render();})()`); await sleep(1500);
chk('health: stale bot (> 10 min) turns it red', await ev(`$('#botst').dataset.bad==='1' && $('#hlight').dataset.light==='red' && $('#hlight').textContent.includes('bot')`));
chk('no HTML injection from stored strings', await ev(`window.__xss===undefined && !document.querySelector('#main img[src=x]')`));
chk('fits a 360 px screen', await ev(`document.documentElement.scrollWidth<=362`));
chk('no other external requests', (await ev(`__net.length`)) === 0);
// Non-admin sees nothing
await ev(`Cloud.user=null; __installFsMock('uRes1','res@x.com','Dr Res'); Gate.cached={uid:'uRes1',email:'res@x.com',status:'approved'}; location.hash='#/admin?t=analytics'`); await sleep(600);
chk('non-admin: admin tabs blocked', (await ev(`$('#main').textContent`)).includes('Admins only'));
// Erase all data on this device: no usage sentence, no usage delete, but leftover counters are cleaned.
await ev(`sessionStorage.dlgText=''; new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.classList&&n.classList.contains('dlg'))sessionStorage.dlgText=(sessionStorage.dlgText||'')+n.textContent}).observe(document,{childList:true,subtree:true}); localStorage.setItem('pgd_feat:uRes1','{}'); window.__dlgDefault=true; ACT.wipe(); 1`); await sleep(400);
chk('erase: no usage sentence while disabled', await ev(`(sessionStorage.dlgText||'').includes('Delete ALL patient data') && !sessionStorage.dlgText.includes('usage record')`));
await sleep(2600);
chk('erase cleaned leftover usage counters, sent nothing', await ev(`!Object.keys(localStorage).some(k=>/^pgd_(feat|usage)/.test(k)) && !Object.keys(JSON.parse(localStorage.fsmock||'{}')).some(k=>k.startsWith('usage/uRes'))`));
chk('no console errors', errs.length === 0);
if (errs.length) console.log('ERRORS', JSON.stringify(errs, null, 1));
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
