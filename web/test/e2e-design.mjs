// Designs: admin picks Bento / Glass home, X or Instagram feed, micro-learning deck; previews on own phone; deploys to everyone; rolls back.
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
// admin opens Designs, picks Bento, previews on own phone only
await A.ev(`location.hash='#/admin?t=design'`); await sleep(1500);
chk('Designs tab lists three home options', await A.ev(`$$('[data-act=designpick][data-k=home]').length===3`));
chk('deploy disabled when nothing changed', await A.ev(`$('[data-act=designdeploy]').disabled`));
await A.ev(`$('[data-act=designpick][data-k=home][data-v=bento]').click()`); await sleep(300);
chk('deploy enabled after a change', await A.ev(`!$('[data-act=designdeploy]').disabled`));
await A.ev(`$('[data-act=designpreview]').click()`); await sleep(1200);
chk('admin preview shows Bento home', await A.ev(`document.body.classList.contains('home-bento') && !!$('#bcar') && $$('#bcar .bslide').length>=2`));
await shot(A, 'design-bento');
await B.ev(`AppCfg.load().then(()=>{location.hash='#/home'})`); await sleep(1200);
chk('preview is not seen by others', await B.ev(`!document.body.classList.contains('home-bento') && !!$('.ahero')`));
// carousel dot switches card
await A.ev(`$$('#bcar [data-bdot]')[1].click()`); await sleep(200);
chk('carousel dot switches card', await A.ev(`$$('#bcar .bslide')[1].classList.contains('on')`));
// deploy Bento + micro deck to everyone
await A.ev(`location.hash='#/admin?t=design'`); await sleep(1200);
await A.ev(`$('[data-act=designpick][data-k=deck][data-v=micro]').click()`); await sleep(300);
await A.ev(`$('[data-act=designdeploy]').click()`); await sleep(1500);
chk('config saved with history', await A.ev(`(()=>{const c=JSON.parse(localStorage.fsmock)['config/app'];return c.design.home==='bento'&&c.design.deck==='micro'&&c.designHistory.length===1})()`));
chk('live card shows new design', await A.ev(`$('.dlive').textContent.includes('Bento home') && $('.dlive').textContent.includes('Micro-learning deck')`));
await B.ev(`AppCfg.load().then(()=>{location.hash='#/home'})`); await sleep(1500);
chk('everyone gets Bento home', await B.ev(`document.body.classList.contains('home-bento') && !!$('#bcar')`));
await B.ev(`location.hash='#/feed'`); await sleep(1500);
chk('everyone gets micro-learning deck', await B.ev(`document.body.classList.contains('deck-micro') && $$('#feedlist .fcard').length>0`));
await shot(B, 'design-micro');
await B.ev(`Feed.close(); location.hash='#/home'`); await sleep(800);
// deploy Glass, then roll back to Bento
await A.ev(`location.hash='#/admin?t=design'`); await sleep(1200);
await A.ev(`$('[data-act=designpick][data-k=home][data-v=glass]').click()`); await sleep(300);
await A.ev(`$('[data-act=designdeploy]').click()`); await sleep(1500);
await B.ev(`AppCfg.load().then(()=>{render()})`); await sleep(1200);
chk('everyone gets Glass home', await B.ev(`document.body.classList.contains('home-glass') && document.body.classList.contains('onhome')`));
await shot(B, 'design-glass');
chk('history has two deploys + rollback button', await A.ev(`$$('[data-act=designrollback]').length===1`));
await A.ev(`$('[data-act=designrollback]').click()`); await sleep(1500);
await B.ev(`AppCfg.load().then(()=>{render()})`); await sleep(1000);
chk('rollback returns everyone to Bento', await B.ev(`document.body.classList.contains('home-bento') && !document.body.classList.contains('home-glass')`));
chk('glass off on other pages', await B.ev(`(location.hash='#/patients', new Promise(r=>setTimeout(()=>r(!document.body.classList.contains('onhome')),400)))`));
const errs = [...A.errs, ...B.errs].filter(e => e && !/getComputedStyle/.test(e));
console.log('ERRORS', JSON.stringify(errs));
process.exit(0);
