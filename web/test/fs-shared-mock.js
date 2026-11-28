// Test-only Firestore stand-in shared between tabs of one browser (localStorage + BroadcastChannel),
// so two "phones" can signal a real WebRTC call to each other. Installed with window.__installFsMock(uid, email, name).
window.__installFsMock = (uid, email, name) => {
  const KEY = 'fsmock', bc = new BroadcastChannel('fsmock'), subs = new Set(); let autoId = 0;
  const load = () => JSON.parse(localStorage.getItem(KEY) || '{}'), save = o => localStorage.setItem(KEY, JSON.stringify(o));
  const fire = () => subs.forEach(s => { try { s(); } catch (e) {} });
  bc.onmessage = fire; addEventListener('storage', e => { if (e.key === KEY) fire(); });
  const changed = () => { bc.postMessage(1); setTimeout(fire, 0); };
  const pathOf = (base, parts) => (base && base.p ? base.p : []).concat(parts.flatMap(x => String(x).split('/')).filter(Boolean));
  const docRef = p => ({ p, id: p[p.length - 1], path: p.join('/') });
  const resolve = (cur, v) => { if (v && typeof v === 'object' && '__inc' in v) return (typeof cur === 'number' ? cur : 0) + v.__inc; return v; };
  // Tabs are separate processes: serialise read-modify-write with a cross-tab Web Lock so bursts (e.g. ICE candidates) aren't lost.
  const locked = fn => navigator.locks ? navigator.locks.request('fsmock', () => fn()) : Promise.resolve(fn());
  const writeNow = (p, data, merge) => { const o = load(), k = p.join('/'), prev = merge ? (o[k] || {}) : {}; const nx = JSON.parse(JSON.stringify(prev)); for (const [a, b] of Object.entries(data)) { if (merge && a.includes('.')) { const ks = a.split('.'); let o = nx; for (const k of ks.slice(0, -1)) o = o[k] = (o[k] && typeof o[k] === 'object') ? o[k] : {}; const last = ks[ks.length - 1]; o[last] = resolve(o[last], b); } else nx[a] = (b && typeof b === 'object' && b.__au) ? [...new Set([...(prev[a] || []), ...b.__au])] : resolve(prev[a], b); } o[k] = JSON.parse(JSON.stringify(nx)); save(o); changed(); };
  const write = (p, data, merge) => locked(() => writeNow(p, data, merge));
  const snapDoc = (k, v) => ({ id: k.split('/').pop(), ref: docRef(k.split('/')), exists: () => v !== undefined, data: () => v });
  const listDocs = q => { const pre = q.p.join('/') + '/', o = load(); let docs = Object.keys(o).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(k => snapDoc(k, o[k]));
    for (const m of q.m || []) { if (m.op === '==') docs = docs.filter(d => d.data()[m.fld] === m.v); if (m.op === 'array-contains') docs = docs.filter(d => (d.data()[m.fld] || []).includes(m.v)); if (m.op === '>=') docs = docs.filter(d => d.data()[m.fld] >= m.v); if (m.op === '>') docs = docs.filter(d => d.data()[m.fld] > m.v); if (m.op === '<') docs = docs.filter(d => d.data()[m.fld] < m.v); if (m.op === '<=') docs = docs.filter(d => d.data()[m.fld] <= m.v);
      if (m.ob) { const v = d => m.ob.split('.').reduce((o, k) => o == null ? undefined : o[k], d.data()); docs = docs.filter(d => v(d) !== undefined); docs.sort((a, b) => (v(a) > v(b) ? 1 : v(a) < v(b) ? -1 : 0) * (m.dir === 'desc' ? -1 : 1)); } if (m.lim) docs = docs.slice(0, m.lim); }
    return docs; };
  const f = {
    serverTimestamp: () => Date.now(), increment: n => ({ __inc: n }), arrayUnion: (...v) => ({ __au: v }),
    doc: (base, ...parts) => { if (base && base.c && !parts.length) return docRef(base.p.concat('auto' + Date.now().toString(36) + (autoId++) + Math.random().toString(36).slice(2, 6))); return docRef(pathOf(base, parts)); },
    collection: (base, ...parts) => ({ p: pathOf(base, parts), c: true }),
    where: (fld, op, v) => ({ fld, op, v }), orderBy: (fld, dir) => ({ ob: fld, dir }), limit: n => ({ lim: n }), query: (c, ...m) => ({ p: c.p, m, c: true }),
    setDoc: async (r, v, o) => write(r.p, v, o && o.merge), updateDoc: async (r, v) => write(r.p, v, true),
    addDoc: async (c, v) => { const r = f.doc(c); await write(r.p, v); return r; },
    getDoc: async r => { const o = load(), k = r.p.join('/'); return snapDoc(k, o[k]); },
    getDocs: async q => { const docs = listDocs(q); return { docs, size: docs.length }; },
    getCountFromServer: async q => { const n = listDocs(q).length; return { data: () => ({ count: n }) }; },
    deleteDoc: async r => locked(() => { const o = load(); delete o[r.p.join('/')]; save(o); changed(); }),
    writeBatch: () => { const ops = []; return { delete: r => ops.push(r), commit: async () => locked(() => { const o = load(); ops.forEach(r => delete o[r.p.join('/')]); save(o); changed(); }) }; },
    onSnapshot: (q, cb) => {
      let prevIds = new Set(), last = '';
      const run = () => {
        if (q.c) { const docs = listDocs(q), ids = new Set(docs.map(d => d.id)), sig = JSON.stringify(docs.map(d => [d.id, d.data()])); if (sig === last) return; last = sig;
          const changes = docs.filter(d => !prevIds.has(d.id)).map(d => ({ type: 'added', doc: d })); prevIds = ids; cb({ docs, size: docs.length, docChanges: () => changes }); }
        else { const o = load(), k = q.p.join('/'), sig = JSON.stringify(o[k]); if (sig === last) return; last = sig; cb(snapDoc(k, o[k])); }
      };
      subs.add(run); setTimeout(run, 0); return () => subs.delete(run);
    },
    signOut: async () => {}
  };
  D.settings.fbConfig = { apiKey: 'x', projectId: 'demo' };
  Cloud.init = function () { this.f = f; this.db = {}; if (!this.user) this.user = { uid, email, displayName: name, emailVerified: true, getIdToken: async () => 'tok-' + uid }; return Promise.resolve(); };
  Cloud.user = null; Cloud.ready = null;
  window.DRIVE_TOKEN_HELPER = '';
};
