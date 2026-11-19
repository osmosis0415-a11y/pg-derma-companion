// Study tab: daily set, MCQ/flashcard/spot/pearl flows, spaced repetition, streak, settings, cloud content merge.
import fs from 'fs';
const MOCK = fs.readFileSync(new URL('./fs-shared-mock.js', import.meta.url), 'utf8');
const DLG = fs.readFileSync(new URL('./dlg-auto.js', import.meta.url), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const chk = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
const t = (await (await fetch('http://127.0.0.1:9333/json')).json()).find(t => t.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}, errs = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result; if (r.exceptionDetails) errs.push('EVAL: ' + (r.exceptionDetails.exception?.description || '').slice(0, 300)); return r.result?.value; };
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('/tmp/' + n + '.png', Buffer.from(r.result.data, 'base64')); };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(window,'FIREBASE_CONFIG',{get(){return null},set(){}});" + DLG + MOCK });
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(1500);
await ev(`$('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2000);
chk('bank loaded', (await ev(`STUDY_BANK.length`)) >= 150);
chk('bank ids unique', await ev(`new Set(STUDY_BANK.map(x=>x.id)).size===STUDY_BANK.length`));
chk('every MCQ answer index valid', await ev(`STUDY_BANK.filter(x=>x.t==='mcq').every(x=>x.o.length>=3&&x.a>=0&&x.a<x.o.length&&x.x)`));
chk('Study tab in bottom bar', await ev(`!!document.querySelector('.nav.bottom a[href="#/study"]')`));
await ev(`location.hash='#/study'`); await sleep(600);
chk('hub shows start button', (await ev(`$('[data-act=studygo][data-m=daily]').textContent`)).includes("Start today"));
chk('hub has 6 modes and topics', (await ev(`$$('.modes a').length`)) === 6 && (await ev(`$$('.topics a').length`)) > 8);
await shot('study-hub');
// settings: goal 5
await ev(`location.hash='#/study-set'`); await sleep(400);
await ev(`document.querySelector('[data-group=sgoal] [data-v="5"]')?document.querySelector('[data-group=sgoal] [data-v="5"]').click():[...document.querySelectorAll('[data-group=sgoal] .chip')][0].click()`); await sleep(100);
await ev(`ACT.studysetsave()`); await sleep(400);
chk('goal saved as 5', (await ev(`D.study.goal`)) === 5);
// daily set
await ev(`$('[data-act=studygo][data-m=daily]').click()`); await sleep(400);
chk('session started on run page', (await ev(`location.hash`)) === '#/study-run' && (await ev(`Study.sess.items.length`)) >= 5);
let guard = 0, sawMcq = false, sawCard = false;
while ((await ev(`!!(Study.sess && Study.sess.i < Study.sess.items.length)`)) && guard++ < 40) {
  const ty = await ev(`Study.sess.items[Study.sess.i].t`);
  if (ty === 'mcq') { if (!sawMcq) { await ev(`$$('.opt')[0].click()`); await sleep(150); sawMcq = true; chk('MCQ reveals explanation', await ev(`!!$('.expl')&&$$('.opt.right').length===1`)); await shot('study-mcq'); } else { await ev(`$$('.opt')[Study.sess.items[Study.sess.i].a].click()`); await sleep(100); } await ev(`$('[data-act=studynext]').click()`); }
  else if (ty === 'card') { await ev(`$('[data-act=studyreveal]').click()`); await sleep(100); if (!sawCard) { sawCard = true; await shot('study-card'); } await ev(`$('[data-act=studygrade][data-q="4"]').click()`); }
  else if (ty === 'spot') { await ev(`$('#spotguess').value='test';$('[data-act=studyreveal]').click()`); await sleep(100); await ev(`$('[data-act=studyspot][data-ok="1"]').click()`); }
  else { await ev(`$('[data-act=studynext]').click()`); }
  await sleep(150);
}
chk('done screen shown', (await ev(`$('.donecard')&&$('.donecard').textContent`) || '').includes('Streak extended'));
await shot('study-done');
chk('streak is 1', (await ev(`Study.streakNow()`)) === 1 && (await ev(`D.study.last===today()`)));
chk('items marked seen', (await ev(`Object.keys(D.study.seen).length`)) >= 5);
// SRS math
chk('SRS: good on new card due tomorrow', await ev(`(()=>{const x=STUDY_BANK.find(y=>y.id==='c040');delete D.study.srs.c040;Study.grade(x,4);return D.study.srs.c040.due===addDays(today(),1)})()`));
chk('SRS: again → due today', await ev(`(()=>{const x=STUDY_BANK.find(y=>y.id==='c040');Study.grade(x,0);return D.study.srs.c040.due===today()&&D.study.srs.c040.n===0})()`));
chk('SRS: interval grows', await ev(`(()=>{const x=STUDY_BANK.find(y=>y.id==='c039');delete D.study.srs.c039;Study.grade(x,4);Study.grade(x,4);Study.grade(x,4);return D.study.srs.c039.iv>=6})()`));
// streak continuity
chk('streak continues from yesterday', await ev(`(()=>{D.study.last=addDays(today(),-1);D.study.streak=4;D.study.done[today()]=0;const x=STUDY_BANK.find(y=>y.t==='pearl');for(let i=0;i<5;i++)Study.touch(x,true);return D.study.streak===5&&D.study.best>=5})()`));
chk('streak resets after a missed day', await ev(`(()=>{D.study.last=addDays(today(),-3);D.study.streak=9;D.study.done[today()]=0;const x=STUDY_BANK.find(y=>y.t==='pearl');for(let i=0;i<5;i++)Study.touch(x,true);return D.study.streak===1})()`));
// Today card
await ev(`location.hash='#/home'`); await sleep(500);
chk('Today shows study card', (await ev(`$('.studyhome')&&$('.studyhome').textContent`) || '').includes('streak'));
await shot('study-today');
// mistakes + saved
await ev(`D.study.ans.m001=0; location.hash='#/study'`); await sleep(400);
await ev(`$('[data-act=studygo][data-m=wrong]').click()`); await sleep(300);
chk('mistakes mode includes wrong MCQ', await ev(`Study.sess.items.some(x=>x.id==='m001')`));
await ev(`$('[data-act=studysave]').click()`); await sleep(200);
chk('save toggles', await ev(`Object.keys(D.study.saved).length===1`));
await ev(`ACT.studyquit()`); await sleep(300);
// cloud content merge (approved bot items)
await ev(`__installFsMock('uS','s@x.com','Res')`);
await ev(`(()=>{const o={};o['content/k1']={status:'live',t:'mcq',top:'Leprosy',q:'Bot Q?',o:['a','b','c','d'],a:2,x:'because'};o['content/k2']={status:'draft',t:'pearl',top:'Acne',p:'not yet'};localStorage.fsmock=JSON.stringify(o)})()`);
await ev(`Cloud.init().then(()=>Study.pull())`); await sleep(500);
chk('only live cloud items merged', await ev(`D.studyCloud.length===1 && Study.all().some(x=>x.id==='x_k1') && !Study.all().some(x=>x.p==='not yet')`));
chk('reminder summary pushed', await ev(`(D.study.remind={on:true,hour:21},Study.push(),new Promise(r=>setTimeout(()=>r(JSON.parse(localStorage.fsmock)['study/uS']),300))).then(d=>!!d&&d.remind===true&&d.hour===21)`));
// feed
await ev(`location.hash='#/feed'`); await sleep(900);
chk('feed opens full screen with cards', (await ev(`$$('#feedlist .fcard').length`)) >= 12);
await shot('feed-1');
const before = await ev(`Study.doneToday()`);
await ev(`(()=>{const c=[...$$('#feedlist .fcard')].find(c=>c.querySelector('.fopt'));c.scrollIntoView();c.querySelector('.fopt').click()})()`); await sleep(400);
chk('feed MCQ answer reveals + counts', (await ev(`Study.doneToday()`)) === before + 1 && await ev(`!![...$$('#feedlist .fexp')].find(e=>!e.hidden)`));
await shot('feed-mcq');
await ev(`$('#feedlist').scrollTop=$('#feedlist').scrollHeight`); await sleep(900);
chk('infinite: more cards load at the end', (await ev(`$$('#feedlist .fcard').length`)) >= 22);
chk('checkpoint card appears', (await ev(`$$('.t-check').length`)) >= 1);
await ev(`(()=>{const c=$$('#feedlist .fcard[data-id]')[1];c.querySelector('[data-fsave]').click()})()`); await sleep(200);
chk('save from feed', await ev(`Object.keys(D.study.saved).length>=2`));
await ev(`$('[data-fclose]').click()`); await sleep(600);
chk('feed closes', await ev(`!$('#feedui') && !document.body.classList.contains('feedon')`));
// admin content review
await ev(`Cloud.user=null; __installFsMock('uAdm','sriramdeverashetty@gmail.com','Sriram'); (()=>{const o=JSON.parse(localStorage.fsmock);o['content/d1']={status:'draft',t:'mcq',top:'Acne',q:'Draft Q?',o:['a','b','c','d'],a:0,x:'exp',tag:'t1'};o['content/d2']={status:'draft',t:'pearl',top:'Acne',p:'Draft pearl'};localStorage.fsmock=JSON.stringify(o)})()`);
await ev(`Cloud.init().then(()=>{location.hash='#/admin?t=content'})`); await sleep(1200);
chk('admin content tab lists drafts', (await ev(`$$('.citem').length`)) === 3 && (await ev(`$('#clist').textContent`)).includes('3 waiting'));
await shot('admin-content');
await ev(`document.querySelector('[data-act=cedit][data-id=d1]').click()`); await sleep(300);
await ev(`$('#ce_q').value='Edited Q?'; $('#ce_a').value='C'; document.querySelector('[data-act=csave][data-pub="1"]').click()`); await sleep(800);
chk('edit + publish saved', await ev(`(()=>{const d=JSON.parse(localStorage.fsmock)['content/d1'];return d.status==='live'&&d.q==='Edited Q?'&&d.a===2})()`));
await ev(`document.querySelector('[data-act=cdel][data-id=d2]').click()`); await sleep(800);
chk('discard via in-app dialog', await ev(`!JSON.parse(localStorage.fsmock)['content/d2']`));
console.log('ERRORS', JSON.stringify(errs.filter(e => e && !/getComputedStyle/.test(e))).slice(0, 800));
process.exit(0);
