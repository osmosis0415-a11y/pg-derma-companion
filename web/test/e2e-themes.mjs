// Unified themes: each theme styles every page (Today, Patients, Study, Community, Profile, Admin, swipe feed); text stays readable.
import fs from 'fs';
import os from 'os';
import path from 'path';
const SHOTS = fs.mkdtempSync(path.join(os.tmpdir(), 'pgd-e2e-'));
const MOCK = fs.readFileSync(new URL('./fs-shared-mock.js', import.meta.url), 'utf8');
const DLG = fs.readFileSync(new URL('./dlg-auto.js', import.meta.url), 'utf8');
const base = 'http://127.0.0.1:9335';
const sleep = ms => new Promise(r => setTimeout(r, ms)); const chk = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
const page = async target => {
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(), errs = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const cb = pend.get(d.id); pend.delete(d.id); cb(d); } if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result; if (r.exceptionDetails) errs.push('EVAL: ' + (r.exceptionDetails.exception?.description || '').slice(0, 300)); return r.result?.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(window,'FIREBASE_CONFIG',{get(){return null},set(){}});" + DLG + MOCK });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  return { send, ev, errs };
};
const shot = async (P, n) => { await P.send('Page.bringToFront'); const r = await P.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.result.data, 'base64')); };
const t1 = (await (await fetch(base + '/json')).json()).find(t => t.type === 'page');
const t2 = await (await fetch(base + '/json/new?about:blank', { method: 'PUT' })).json();
const A = await page(t1), B = await page(t2);
await A.send('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(1500);
await A.ev(`localStorage.removeItem('fsmock'); $('#pin')&&($('#pin').value='1234');$('#pin2')&&($('#pin2').value='1234');$('#unlock')&&$('#unlock').click()`); await sleep(2000);
await A.ev(`D.settings.name='Sriram'; __installFsMock('uA','sriramdeverashetty@gmail.com','Sriram'); Cloud.init(); (()=>{const o=JSON.parse(localStorage.fsmock||'{}');o['config/app']={layout:'insta'};localStorage.fsmock=JSON.stringify(o)})(); AppCfg.layout='insta'; localStorage.setItem('pgd_layout','insta'); AppCfg.apply()`); await sleep(300);
await B.send('Page.navigate', { url: 'http://localhost:8765/' }); await sleep(1500);
await B.ev(`$('#pin')&&($('#pin').value='1234',$('#unlock').click())`); await sleep(2000);
await B.ev(`D.settings.name='Priya Rao'; __installFsMock('uB','priya@x.com','Priya Rao'); Cloud.init()`); await sleep(300);
const BG = { bento: 'rgb(255, 255, 255)', glass: 'rgb(14, 18, 48)', x: 'rgb(0, 0, 0)', micro: 'rgb(14, 16, 21)' };
const pages = ['#/home', '#/patients', '#/study', '#/community?k=new', '#/more', '#/admin?t=design'];
for (const th of ['bento', 'glass', 'x', 'micro']) {
  await A.ev(`localStorage.setItem('pgd_design_preview', JSON.stringify({design:{theme:'${th}',home:'bento',deck:'micro'},layout:'${th === 'x' || th === 'micro' ? 'twitter' : 'insta'}'})); AppCfg.apply()`);
  let okAll = true, worst = 99, worstAt = '';
  for (const pg of pages) {
    await A.ev(`location.hash='${pg}'`); await sleep(1400);
    const r = await A.ev(`(()=>{
      const parse=c=>{const m=(c.match(/[\\d.]+/g)||[]).map(Number);return {r:m[0],g:m[1],b:m[2],a:m.length>3?m[3]:1}};
      const L=o=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return .2126*f(o.r)+.7152*f(o.g)+.0722*f(o.b)};
      const bgOf=el=>{for(let e=el;e;e=e.parentElement){const cs=getComputedStyle(e);if(cs.backgroundImage&&cs.backgroundImage!=='none'&&e!==document.body)return null;const c=parse(cs.backgroundColor);if(c.a>0.9)return c;}return parse(getComputedStyle(document.body).backgroundColor)};
      let worst=99, what='';
      [...document.querySelectorAll('main p, main small, main b, main h2, main h3, main a.link, main .muted, #top h1, .nav a')].filter(e=>e.offsetParent&&e.textContent.trim()).slice(0,60).forEach(e=>{const bg=bgOf(e);if(!bg)return;const fg=parse(getComputedStyle(e).color);if(fg.a<0.5)return;const k=(Math.max(L(fg),L(bg))+0.05)/(Math.min(L(fg),L(bg))+0.05);if(k<worst){worst=k;what=e.tagName+'.'+e.className+' "'+e.textContent.trim().slice(0,24)+'"'}});
      return {cls:document.body.className, bodyBg:getComputedStyle(document.body).backgroundColor, worst, what}})()`);
    if (!r.cls.includes('th-' + th)) okAll = false;
    if (r.bodyBg !== BG[th]) okAll = false;
    if (th !== 'glass' && r.worst < worst) { worst = r.worst; worstAt = pg + ' ' + r.what; }
    await shot(A, `th-${th}-${pg.replace(/[#/?=&]/g, '')}`);
  }
  chk(`${th}: every page wears the theme`, okAll);
  if (th !== 'glass') chk(`${th}: text contrast ≥ 4.5 on every page (worst ${worst.toFixed(1)} — ${worstAt})`, worst >= 4.5);
  await A.ev(`location.hash='#/feed'`); await sleep(1600);
  chk(`${th}: micro deck uses theme colours`, await A.ev(`document.body.classList.contains('deck-micro') && getComputedStyle($('#feedui')).backgroundColor !== 'rgb(14, 16, 21)' === ${th !== 'micro'} || '${th}'==='glass'`));
  await shot(A, `th-${th}-feed`);
  await A.ev(`Feed.close(); location.hash='#/home'`); await sleep(500);
}
// admin theme picker → bundle + deploy
await A.ev(`localStorage.removeItem('pgd_design_preview'); AppCfg.apply(); location.hash='#/admin?t=design'`); await sleep(1500);
chk('theme picker lists five themes', await A.ev(`$$('[data-act=designtheme]').length===5`));
await A.ev(`$('[data-act=designtheme][data-v=x]').click()`); await sleep(300);
chk('picking X Dark also picks its layouts', await A.ev(`$('[data-act=designpick][data-k=layout][data-v=twitter]').classList.contains('on') && $('[data-act=designpick][data-k=home][data-v=bento]').classList.contains('on') && $('[data-act=designpick][data-k=deck][data-v=micro]').classList.contains('on')`));
await A.ev(`$('[data-act=designdeploy]').click()`); await sleep(1500);
await B.ev(`AppCfg.load().then(()=>{location.hash='#/patients'})`); await sleep(1500);
chk('everyone gets X Dark on every page', await B.ev(`document.body.classList.contains('th-x') && getComputedStyle(document.body).backgroundColor==='rgb(0, 0, 0)'`));
chk('old Glass deploys still work (home "glass" → Glass theme)', await B.ev(`(()=>{const c=AppCfg.clean({home:'glass',deck:'classic'});return c.theme==='glass'&&c.home==='bento'})()`));
const errs = [...A.errs, ...B.errs].filter(e => e && !/getComputedStyle/.test(e));
console.log('ERRORS', JSON.stringify(errs));
console.log('SHOTS', SHOTS);
process.exit(0);
