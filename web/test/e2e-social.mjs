// Social: profile photo, follow, notifications, DMs, story poll/quiz, admin layout switch.
import fs from 'fs';
const MOCK = fs.readFileSync(new URL('./fs-shared-mock.js', import.meta.url), 'utf8');
const DLG = fs.readFileSync(new URL('./dlg-auto.js', import.meta.url), 'utf8');
const base = 'http://127.0.0.1:9335';
const sleep = ms => new Promise(r => setTimeout(r, ms)); const chk = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
const page = async target => {
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}, errs = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result; if (r.exceptionDetails) errs.push('EVAL: ' + (r.exceptionDetails.exception?.description || '').slice(0, 300)); return r.result?.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(window,'FIREBASE_CONFIG',{get(){return null},set(){}});" + DLG + MOCK });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  return { send, ev, errs };
};
const shot = async (P, n) => { await P.send('Page.bringToFront'); const r = await P.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('/tmp/' + n + '.png', Buffer.from(r.result.data, 'base64')); };
const t1 = (await (await fetch(base + '/json')).json()).find(t => t.type === 'page');
const t2 = await (await fetch(base + '/json/new?about:blank', { method: 'PUT' })).json();
const A = await page(t1), B = await page(t2);
await A.send('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(1500);
await A.ev(`localStorage.removeItem('fsmock'); $('#pin').value='1234';$('#pin2').value='1234';$('#unlock').click()`); await sleep(2000);
await A.ev(`D.settings.name='Sriram'; __installFsMock('uA','sriramdeverashetty@gmail.com','Sriram'); Cloud.init(); (()=>{const o=JSON.parse(localStorage.fsmock||'{}');o['config/app']={layout:'insta'};localStorage.fsmock=JSON.stringify(o)})(); AppCfg.layout='insta'; localStorage.setItem('pgd_layout','insta'); AppCfg.apply()`); await sleep(300);
await B.send('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(1500);
await B.ev(`$('#pin')&&($('#pin').value='1234',$('#unlock').click())`); await sleep(2000);
await B.ev(`D.settings.name='Priya Rao'; __installFsMock('uB','priya@x.com','Priya Rao'); Cloud.init()`); await sleep(300);
// profile photo
await A.ev(`(async()=>{const c=document.createElement('canvas');c.width=c.height=300;const x=c.getContext('2d');x.fillStyle='#0B7A75';x.fillRect(0,0,300,300);const b=await new Promise(r=>c.toBlob(r,'image/jpeg'));const u=await squareAvatar(b);Comm.st().photo=u;Comm.pushProfile();})()`); await sleep(800);
chk('avatar saved small', await A.ev(`Comm.st().photo.startsWith('data:image/jpeg') && Comm.st().photo.length<60000`));
await A.ev(`location.hash='#/community'`); await sleep(1500);
await A.ev(`$('#c_text')||0; location.hash='#/compose'`); await sleep(500);
await A.ev(`$('#c_text').value='Classic case of lichen planus with Wickham striae — oral involvement too.'; $('#c_ok').checked=true; $('[data-act=cpost]').click()`); await sleep(1500);
await B.ev(`location.hash='#/community'`); await sleep(2000);
await B.ev(`Prof.load(true)`); await sleep(800);
chk('other user sees profile photo on post', await B.ev(`!!document.querySelector('.cpost .pav img')`));
// follow
await B.ev(`location.hash='#/u/uA'`); await sleep(1500);
chk('profile shows Follow and Message', await B.ev(`!!document.querySelector('[data-act=follow]') && !!document.querySelector('[data-act=dmopen]')`));
await B.ev(`document.querySelector('[data-act=follow]').click()`); await sleep(1500);
chk('following saved + counts update', await B.ev(`Follow.has('uA') && $('.uprof').textContent.includes('1followers')`) || await B.ev(`Follow.has('uA') && /1\s*followers/.test($('.uprof .pstats').innerText.replace(/\n/g,''))`));
await shot(B, 'soc-profile');
await B.ev(`location.hash='#/community?k=following'`); await sleep(1200);
chk('Following feed shows followed person\'s post', (await B.ev(`$$('#plist .cpost').length`)) === 1);
// notifications
await A.ev(`Social.start()`); await sleep(1500);
chk('follow notification arrives', await A.ev(`Notif.list.some(n=>n.type==='follow'&&n.from==='uB')`));
chk('heart badge shows unread', await A.ev(`render(), new Promise(r=>setTimeout(()=>r(($('[data-nbadge]')||{}).textContent),400))`).then(v => v === '1'));
await A.ev(`location.hash='#/notifs'`); await sleep(1200);
chk('notifications page lists it with Follow back', (await A.ev(`$('main').textContent`)).includes('started following you') && await A.ev(`!!document.querySelector('[data-act=follow][data-id=uB]')`));
await shot(A, 'soc-notifs');
await sleep(600);
chk('opening marks read', await A.ev(`Notif.list.every(n=>n.read)`));
// like → notif
const pid = await B.ev(`Comm.posts[0].id`);
await B.ev(`location.hash='#/community'`); await sleep(1000);
await B.ev(`$('[data-act=plike]').click()`); await sleep(1500);
chk('like notifies author', await A.ev(`Notif.list.some(n=>n.type==='like'&&n.ref==='${pid}')`));
// DMs
await B.ev(`location.hash='#/u/uA'`); await sleep(1200);
await B.ev(`document.querySelector('[data-act=dmopen]').click()`); await sleep(1200);
await B.ev(`$('#dm_text').value='Hi sir, can I share a case for the seminar?'; $('[data-act=dmsend]').click()`); await sleep(1800);
chk('DM shows in sender thread', (await B.ev(`$('#dmlist').textContent`)).includes('share a case'));
await A.ev(`location.hash='#/dms'`); await sleep(1500);
chk('inbox shows unread conversation', (await A.ev(`$$('.dmrow.unread').length`)) === 1);
await A.ev(`$('.dmrow').click()`); await sleep(1500);
chk('recipient reads message', (await A.ev(`$('#dmlist').textContent`)).includes('share a case'));
await A.ev(`$('#dm_text').value='Sure, send it here.'; $('[data-act=dmsend]').click()`); await sleep(1500);
chk('reply delivered + unread cleared', (await B.ev(`$('#dmlist').textContent`)).includes('send it here') && await A.ev(`DM.unread()===0`));
await shot(B, 'soc-dm');
// story poll + quiz
await A.ev(`location.hash='#/story-new?k=quiz'`); await sleep(700);
await A.ev(`$('#st_text').value='Spot diagnosis: violaceous flat-topped papules on wrists?'; $('#st_o0').value='Psoriasis'; $('#st_o1').value='Lichen planus'; $('#st_o2').value='Prurigo'; document.querySelector('input[name=st_ans][value="1"]').checked=true; $('[data-act=stpost]').click()`); await sleep(1800);
chk('quiz story created', await A.ev(`Stories.list.some(s=>s.kind==='quiz'&&s.ans===1)`));
await B.ev(`Stories.load()`); await sleep(500);
await B.ev(`location.hash='#/community'`); await sleep(1500);
chk('story ring shows for poster', await B.ev(`!!document.querySelector('#stories .story[data-uid=uA]')`));
await B.ev(`document.querySelector('#stories .story[data-uid=uA]').click()`); await sleep(1200);
chk('quiz options in viewer', (await B.ev(`$$('#storyui .sopt').length`)) === 3);
await shot(B, 'soc-quiz');
await B.ev(`$$('#storyui .sopt')[1].click()`); await sleep(1500);
chk('answer shows result', (await B.ev(`$('#storyui').textContent`)).includes('You got it'));
await B.ev(`$('#storyui [data-sclose]').click()`); await sleep(300);
chk('vote notifies story owner', await A.ev(`new Promise(r=>setTimeout(()=>r(Notif.list.some(n=>n.type==='vote')),1200))`));
// people search
await B.ev(`location.hash='#/people'`); await sleep(1500);
chk('people page suggests residents', (await B.ev(`$$('#presults .prow').length`)) >= 1);
await B.ev(`$('#pq').value='srir'; $('#pq').dispatchEvent(new Event('input'))`); await sleep(600);
chk('search by name finds Sriram', (await B.ev(`$('#presults').textContent`)).includes('Sriram'));
await B.ev(`$('#pq').value='zzzz'; $('#pq').dispatchEvent(new Event('input'))`); await sleep(600);
chk('no-match message', (await B.ev(`$('#presults').textContent`)).includes('No one found'));
await shot(B, 'soc-people');
await B.ev(`location.hash='#/flist/uA?l=followers'`); await sleep(1500);
chk('followers list shows follower', (await B.ev(`$('#flist').textContent`)).includes('Priya'));
// admin layout switch
await A.ev(`location.hash='#/admin'`); await sleep(1200);
await A.ev(`document.querySelector('[data-act=setlayout][data-l=twitter]').click()`); await sleep(1000);
await B.ev(`AppCfg.load().then(()=>{location.hash='#/community?k=new'})`); await sleep(1500);
chk('Twitter-style timeline for everyone', await B.ev(`document.body.classList.contains('lay-twitter') && $$('.tweet').length>=1`));
await shot(B, 'soc-twitter');
await A.ev(`document.querySelector('[data-act=setlayout][data-l=insta]').click()`); await sleep(800);
await B.ev(`AppCfg.load()`); await sleep(500);
chk('back to Instagram style', await B.ev(`!document.body.classList.contains('lay-twitter')`));
chk('Twitter is the default when admin has not chosen', await B.ev(`(()=>{const o=JSON.parse(localStorage.fsmock);delete o['config/app'];localStorage.fsmock=JSON.stringify(o)})(), AppCfg.load().then(()=>AppCfg.layout==='twitter')`));
const errs = [...A.errs, ...B.errs].filter(e => e && !/getComputedStyle/.test(e));
console.log('ERRORS', JSON.stringify(errs).slice(0, 900));
process.exit(0);
