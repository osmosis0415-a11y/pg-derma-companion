import fs from 'fs';
const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const ws = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0; const pend={}; const errs=[];
ws.onmessage=m=>{const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]}
 if(d.method==='Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text);
 if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error') errs.push('console: '+d.params.args.map(a=>a.value||a.description).join(' '));};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true}); if(r.result.exceptionDetails) errs.push('EVAL '+expr.slice(0,60)+': '+(r.result.exceptionDetails.exception?.description||'')); return r.result.result?.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const shot=async(n)=>{const r=await send('Page.captureScreenshot',{format:'png'}); fs.writeFileSync('/tmp/shots/'+n+'.png',Buffer.from(r.result.data,'base64'));};
fs.mkdirSync('/tmp/shots',{recursive:true});
await send('Runtime.enable'); await send('Page.enable'); await send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'FIREBASE_CONFIG',{get(){return null},set(){}})"});
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
await send('Page.navigate',{url:'http://localhost:8765/'}); await sleep(1500);
await shot('01-lock');
await ev(`document.getElementById('pin').value='1234';document.getElementById('pin2').value='1234';document.getElementById('unlock').click()`); await sleep(2500);
await shot('02-home');
// thesis setup with vitiligo preset
await ev(`location.hash='#/thesis-setup?preset=vitiligo'`); await sleep(400); await ev(`document.getElementById('t_scale').value='VASI'; ACT.tsave()`); await sleep(400);
// quick add
await ev(`location.hash='#/add'`); await sleep(400); await shot('03-add');
await ev(`$('#q_uhid').value='2026-1001';$('#q_name').value='Ravi';$('#q_age').value='28';$('#q_phone').value='9876543210';
 $('[data-group=q_sex] [data-v=M]').click();$('[data-group=q_fst] [data-v=IV]').click();$('[data-group=q_dxfav] [data-v=Vitiligo]').click();
 $('[data-group=q_bk] [data-v="Thesis Case"]').click();$('[data-group=q_fu] [data-v="28"]').click();$('[data-act=qasave][data-then=open]').click()`); await sleep(600);
await shot('04-visit');
const vid = await ev(`ROUTE.id`);
await ev(`location.hash='#/score/${vid}/VASI'`); await sleep(400);
await ev(`const s=$('#sform');s.querySelector('[data-k="hands.hu"]').value='2';s.querySelector('[data-k="hands.dp"]').value='75';s.dispatchEvent(new Event('input'));`); await sleep(200);
await shot('05-score'); console.log('VASI shown', await ev(`$('#tot').textContent`));
await ev(`ACT.savescore()`); await sleep(400);
await ev(`location.hash='#/map/${vid}?c=face'`); await sleep(400); await shot('06-map');
// add a photo via canvas
await ev(`(async()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='#c9a';x.fillRect(0,0,800,600);x.fillStyle='#fff';x.beginPath();x.arc(400,300,120,0,7);x.fill();await savePhoto(c,{pid:V('${vid}').pid,vid:'${vid}',cat:'Clinical'});await savePhoto(c,{pid:V('${vid}').pid,vid:'${vid}',cat:'Dermoscopy'});})()`); await sleep(500);
await ev(`location.hash='#/vault'`); await sleep(800); await shot('07-vault');
const phid = await ev(`D.photos[0].id`);
await ev(`location.hash='#/deid/${phid}'`); await sleep(800); await ev(`deid.rects.push({x:100,y:100,w:300,h:80,t:'bar'},{x:450,y:300,w:200,h:150,t:'blur'});drawDeid();`); await shot('08-deid');
await ev(`ACT.dsave()`); await sleep(800);
await ev(`location.hash='#/compare/'+D.photos[0].pid`); await sleep(800); await shot('09-compare');
await ev(`location.hash='#/logadd?vid=${vid}'`); await sleep(400); await ev(`ACT.logsave(document.querySelector('[data-act=logsave]'))`); await sleep(400);
await ev(`location.hash='#/logbook'`); await sleep(400); await shot('10-logbook');
await ev(`ACT.invadd({dataset:{pid:V('${vid}').pid,vid:'${vid}'}})`); await sleep(300); await ev(`ACT.invsave(document.querySelector('[data-act=invsave]'))`); await sleep(300);
await ev(`location.hash='#/inv'`); await sleep(300); await shot('11-inv');
await ev(`location.hash='#/thesis'`); await sleep(400); await shot('12-thesis');
await ev(`location.hash='#/cal'`); await sleep(300); await shot('13-cal');
await ev(`location.hash='#/analytics'`); await sleep(300); await shot('14-analytics');
await ev(`location.hash='#/formulary?w=20'`); await sleep(300); await shot('15-formulary');
await ev(`location.hash='#/formulary?t=iso&w=60'`); await sleep(300);
await ev(`location.hash='#/formulary?t=comp'`); await sleep(300);
await ev(`location.hash='#/formulary?t=ftu'`); await sleep(300);
await ev(`location.hash='#/formulary?t=ligno'`); await sleep(300);
await ev(`location.hash='#/checklists'`); await sleep(300); await shot('16-check');
await ev(`location.hash='#/wa/'+V('${vid}').pid+'?l=te&t=scabies'`); await sleep(300); await shot('17-wa');
await ev(`location.hash='#/patient/'+V('${vid}').pid`); await sleep(500); await shot('18-patient');
await ev(`location.hash='#/settings'`); await sleep(300);
// exports: capture blobs
const x = await ev(`(async()=>{const {rows,dict,ael}=thesisRows(true);const b=makeXLSX([['Data',rows],['Data dictionary',dict],['Adverse events',ael]]);const l=makeXLSX([['Logbook',logRows()],['Summary',logSummary()]]);const ab=async b=>btoa(String.fromCharCode(...new Uint8Array(await b.arrayBuffer())));return {t:await ab(b),l:await ab(l),rows}})()`);
fs.writeFileSync('/tmp/thesis.xlsx',Buffer.from(x.t,'base64'));fs.writeFileSync('/tmp/log.xlsx',Buffer.from(x.l,'base64'));console.log(JSON.stringify(x.rows));
// persistence: lock & unlock
await ev(`lockApp()`); await sleep(500); await ev(`$('#pin').value='9999';$('#unlock').click()`); await sleep(1500); console.log('wrong pin msg:', await ev(`$('#lerr').textContent`));
await ev(`$('#pin').value='1234';$('#unlock').click()`); await sleep(1500); console.log('after unlock patients:', await ev(`D.patients.length+' '+D.photos.length`));
// tablet
await send('Emulation.setDeviceMetricsOverride',{width:1180,height:820,deviceScaleFactor:1,mobile:false}); await ev(`location.hash='#/patient/'+D.patients[0].id`); await sleep(800); await shot('19-tablet');

// ---------- extended checks ----------
const chk=(name,cond)=>console.log((cond?'PASS ':'FAIL ')+name);
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
await ev(`window.__dl=[];download=async(b,n)=>{window.__dl.push({n,b})};`);
// enter key in quick add must not reload
await ev(`location.hash='#/add'`); await sleep(300);
await ev(`window.__mark=1; const i=$('#q_uhid'); i.value='X1'; i.form.requestSubmit ? i.form.requestSubmit() : i.form.submit();`); await sleep(500);
chk('enter does not reload', await ev(`window.__mark===1 && !!D`));
// thesis auto-enrol: patient with bucket before thesis exists (simulate)
await ev(`D.patients.push({id:'pz',uhid:'Z9',buckets:['Thesis Control'],created:'2026-11-01T00:00:00Z'}); location.hash='#/thesis-setup'`); await sleep(300); await ev(`ACT.tsave()`); await sleep(300);
chk('auto-enrol control', await ev(`P('pz').arm==='Control' && P('pz').studyId==='T002'`));
// WA template save keeps placeholders
const pid = await ev(`D.patients.find(p=>p.uhid==='2026-1001').id`);
await ev(`location.hash='#/wa/${pid}?t=followup&l=en'`); await sleep(300);
await ev(`$('#wa_savetpl').checked=true; window.open=()=>{}; ACT.wasend()`); await sleep(200);
chk('template keeps {name}', await ev(`D.templates.followup.en.includes('{name}') && !D.templates.followup.en.includes('Ravi')`));
// phone normalisation
await ev(`$('#wa_ph').value='09876543210'; window.__u=''; window.open=u=>window.__u=u; ACT.wasend()`); chk('phone 0-prefix', (await ev(`window.__u`)).startsWith('https://wa.me/919876543210'));
// all score calculators render & save
const vid2 = await ev(`D.visits[0].id`);
for (const k of ['PASI','EASI','SCORAD','SALT','MASI','mMASI','VASI','GAGS','DLQI']) { await ev(`location.hash='#/score/${vid2}/${k}'`); await sleep(250); await ev(`ACT.savescore()`); await sleep(150); }
chk('9 scores saved', await ev(`D.scores.length>=10`));
// edit existing score
const sid = await ev(`D.scores.find(s=>s.scale==='PASI').id`); await ev(`location.hash='#/score/${vid2}/PASI/${sid}'`); await sleep(300);
await ev(`(()=>{const s=$('#sform');s.querySelector('[data-k="trunk.e"]').value='3';s.querySelector('[data-k="trunk.i"]').value='3';s.querySelector('[data-k="trunk.s"]').value='3';s.querySelector('[data-k="trunk.a"]').value='3';ACT.savescore()})()`); await sleep(200);
chk('PASI edit = 8.1', await ev(`D.scores.find(s=>s.id==='${sid}').total===8.1`));
// map pins on every chart
await ev(`window.prompt=()=> 'note'`);
for (const c of ['body-front','body-back','face','scalp','oral','genital','hands','nerves']) { await ev(`location.hash='#/map/${vid2}?c=${c}&t=biopsy'`); await sleep(200); await ev(`(()=>{const r=$('#map').getBoundingClientRect();$('#map').dispatchEvent(new MouseEvent('click',{clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true}))})()`); await sleep(150); }
chk('8 pins', await ev(`D.pins.length===8`)); await shot('20-nerves');
// bad route params
await ev(`location.hash='#/map/${vid2}?c=bogus&t=bogus'`); await sleep(200); await ev(`location.hash='#/wa/${pid}?l=xx&t=yy'`); await sleep(200);
// investigations flow with SSS
await ev(`ACT.invadd({dataset:{pid:'${pid}'}})`); await sleep(200);
await ev(`(()=>{$('#i_type').value='Slit skin smear';$('#i_type').onchange({target:$('#i_type')});const s=$$('.ssi');s[0].value='2';s[1].value='3';s[2].value='4';ACT.invsave($('[data-act=invsave]'))})()`); await sleep(200);
chk('BI = 3', await ev(`D.inv.at(-1).bi===3`));
await ev(`window.prompt=()=> 'BT Hansen, BI 3+'; ACT.invnext({dataset:{id:D.inv.at(-1).id}}); ACT.invnext({dataset:{id:D.inv.at(-1).id}})`); await sleep(200);
chk('inv correlated', await ev(`D.inv.at(-1).status==='done'`));
// reminders + ics
await ev(`ACT.remadd({dataset:{pid:'${pid}'}})`); await sleep(200); await ev(`$('#r_time').value='10:30';ACT.remsave($('[data-act=remsave]'))`); await sleep(300);
chk('ics generated', await ev(`window.__dl.some(d=>d.n==='reminder.ics')`));
await ev(`ACT.icsall()`); chk('ics all', await ev(`window.__dl.some(d=>d.n==='pg-derma-followups.ics')`));
const ics = await ev(`window.__dl.find(d=>d.n==='reminder.ics').b.text()`); chk('ics valid', ics.includes('BEGIN:VEVENT') && ics.includes('T103000'));
// logbook export + recent pick custom
await ev(`location.hash='#/logadd'`); await sleep(200); await ev(`$('#l_proc').value='__other';$('#l_other').value='Leech therapy';ACT.logsave($('[data-act=logsave]'))`); await sleep(300);
await ev(`location.hash='#/logadd'`); await sleep(200); await ev(`ACT.lpick({dataset:{v:'Leech therapy'}})`); chk('recent custom proc', await ev(`$('#l_proc').value==='__other' && $('#l_other').value==='Leech therapy'`));
await ev(`location.hash='#/logbook'`); await sleep(200); await ev(`ACT.logxlsx()`); await sleep(200);
await ev(`ACT.logpdf=ACT.logpdf; window.print=()=>{}; ACT.logpdf()`); chk('print html', await ev(`$('#print').innerHTML.includes('Leech therapy')`));
// thesis exports
await ev(`location.hash='#/thesis'`); await sleep(300); await ev(`ACT.thxlsx(); ACT.thcsv()`); await sleep(300);
chk('thesis files', await ev(`window.__dl.some(d=>d.n.startsWith('thesis-data')&&d.n.endsWith('.xlsx')) && window.__dl.some(d=>d.n.endsWith('.csv'))`));
const tx = await ev(`(async()=>{const d=window.__dl.find(d=>d.n.startsWith('thesis-data')&&d.n.endsWith('.xlsx'));const u=new Uint8Array(await d.b.arrayBuffer());let s='';for(const c of u)s+=String.fromCharCode(c);return btoa(s)})()`);
fs.writeFileSync('/tmp/thesis2.xlsx',Buffer.from(tx,'base64'));
// AE + CRF save
await ev(`location.hash='#/visit/${vid2}'`); await sleep(300);
await ev(`ACT.aeadd({dataset:{id:'${vid2}'}})`); await sleep(150); await ev(`$('#ae_ev').value='Burning';ACT.aesave({dataset:{id:'${vid2}'}})`); await sleep(300);
await ev(`$('[data-group=crf_Koebner] [data-v="1"]').click(); $('#crf_Repig_pct').value='20'; ACT.savecrf({dataset:{id:'${vid2}'}})`);
chk('CRF saved', await ev(`V('${vid2}').crf.Koebner==='1' && V('${vid2}').crf.Repig_pct==='20' && V('${vid2}').ae.length===1`));
// formulary tabs & drug add
for (const t of ['drugs','iso','ftu','comp','ligno']) { await ev(`location.hash='#/formulary?t=${t}&w=25'`); await sleep(150); }
chk('comp result', await ev(`(location.hash='#/formulary?t=comp', new Promise(r=>setTimeout(()=>r($('#cres').textContent),200)))`).then(t=>/Hydroquinone/.test(t)));
await ev(`location.hash='#/formulary'`); await sleep(200); await ev(`ACT.drugadd()`); await sleep(100); await ev(`$('#d_name').value='Test drug';$('#d_k0').value='2';ACT.drugsave($('[data-act=drugsave]'))`); await sleep(200);
chk('custom drug', await ev(`D.formulary.some(d=>d.name==='Test drug')`));
// checklists
await ev(`location.hash='#/checklists?k=4'`); await sleep(200); await ev(`$$('[data-act=chk]').forEach(c=>{c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}))})`); chk('checklist', await ev(`D.checks['Chemical peel'].filter(Boolean).length===9`));
// patient edit + compare side mode
await ev(`ACT.editpt({dataset:{id:'${pid}'}})`); await sleep(150); await ev(`$('#e_name').value='Ravi K';ACT.savept({dataset:{id:'${pid}'}})`); chk('edit pt', await ev(`P('${pid}').name==='Ravi K'`));
await ev(`location.hash='#/compare/${pid}?m=side'`); await sleep(400);
// settings save
await ev(`location.hash='#/settings'`); await sleep(200); await ev(`$('#s_name').value='Sriram';$('#s_start').value='2025-11-01';ACT.ssave()`);
chk('residency year', await ev(`residencyYear('2026-11-19')==='JR2'`));
// backup roundtrip
const before = await ev(`JSON.stringify({p:D.patients.length,v:D.visits.length,ph:D.photos.length,s:D.scores.length})`);
await ev(`exportBackup()`); await sleep(800);
chk('backup file', await ev(`window.__dl.some(d=>d.n.endsWith('.pgbak'))`));
await ev(`window.__bk=window.__dl.find(d=>d.n.endsWith('.pgbak')).b; window.confirm=()=>true;`);
// wipe then restore
await ev(`(async()=>{await IDB.clear('photos');await IDB.clear('kv');await IDB.clear('meta');})()`);
await ev(`(async()=>{await importBackup(new File([window.__bk],'b.pgbak'));})()`); await sleep(300);
await ev(`lockApp(true)`); await sleep(400); await ev(`$('#pin').value='1234';$('#unlock').click()`); await sleep(2000);
const after = await ev(`JSON.stringify({p:D.patients.length,v:D.visits.length,ph:D.photos.length,s:D.scores.length})`);
chk('restore identical '+after, before===after);
chk('photo decrypts after restore', await ev(`photoURL(D.photos[0].id).then(u=>u.startsWith('blob:'))`));
// corrupt backup rejected
const bad = await ev(`importBackup(new File([window.__bk.slice(0,100)],'x')).then(()=> 'accepted', e=>e.message)`); chk('truncated backup rejected: '+bad, bad!=='accepted');
// change PIN
await ev(`window.prompt=(()=>{const a=['1234','5678','5678'];return ()=>a.shift()})(); ACT.chpin()`); await sleep(3000);
await ev(`lockApp()`); await sleep(300); await ev(`$('#pin').value='5678';$('#unlock').click()`); await sleep(2000);
chk('new PIN works', await ev(`!!D && D.photos.length>0`));
chk('photo decrypts after PIN change', await ev(`photoURL(D.photos[0].id).then(u=>u.startsWith('blob:'))`));
// delete visit & patient cascade
await ev(`window.confirm=()=>true; ACT.delpt({dataset:{id:'${pid}'}})`); await sleep(800);
chk('cascade delete', await ev(`!D.patients.some(p=>p.id==='${pid}') && !D.photos.some(x=>x.pid==='${pid}') && !D.scores.length`));
chk('photo blobs gone', await ev(`IDB.keys('photos').then(k=>k.length===0)`));

console.log('ERRORS', JSON.stringify(errs,null,1)); process.exit(0);
