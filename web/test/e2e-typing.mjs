const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const ws = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend={}; ws.onmessage=m=>{const d=JSON.parse(m.data); if(d.id&&pend[d.id]){pend[d.id](d);delete pend[d.id]}};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result.result?.value;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
await send('Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'});
await send('Page.enable'); await send('Page.navigate',{url:'http://localhost:8765/'}); await sleep(1500);
console.log('lock html present:', await ev(`!!document.getElementById('pin')`), 'active:', await ev(`document.activeElement && document.activeElement.id`));
const r = await ev(`(()=>{const b=document.getElementById('pin').getBoundingClientRect();const el=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return {x:b.x+b.width/2,y:b.y+b.height/2,hit:el&&(el.id||el.tagName)}})()`); console.log(r);
await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x,y:r.y}]}); await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await sleep(300);
for (const ch of '1234') { await send('Input.dispatchKeyEvent',{type:'keyDown',key:ch,text:ch}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:ch}); }
await sleep(300); console.log('pin value after typing:', JSON.stringify(await ev(`document.getElementById('pin').value`)));
await sleep(4000); console.log('pin value 4s later:', JSON.stringify(await ev(`document.getElementById('pin') && document.getElementById('pin').value`)), 'lock re-rendered?', await ev(`document.activeElement && document.activeElement.id`));
// confirm field + Enter submits
await send('Runtime.evaluate',{expression:"document.getElementById('pin2').focus()"});
for (const ch of '1234') { await send('Input.dispatchKeyEvent',{type:'keyDown',key:ch,text:ch}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:ch}); }
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
await sleep(3000); console.log('unlocked via typing + Enter:', await ev(`!!D && !document.getElementById('app').hidden`));
// quick add typing works too
await ev(`location.hash='#/add'`); await sleep(400); await ev(`document.getElementById('q_uhid').focus()`);
for (const ch of 'A12') { await send('Input.dispatchKeyEvent',{type:'keyDown',key:ch,text:ch}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:ch}); }
console.log('UHID typed:', await ev(`document.getElementById('q_uhid').value`));
process.exit(0);
