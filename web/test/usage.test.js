// Node unit tests for web/src/usage.js (usage heartbeat payload + admin analytics maths) and the usage/system rules.
const fs = require('fs'), path = require('path');
const U = require('../src/usage.js');
let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n); };

// ---------- usagePayload ----------
const D = {
  settings: { name: 'Dr Secret Name', inst: 'Secret College', residencyStart: '2025-06-01', fbConfig: { apiKey: 'k' } },
  patients: [{ id: 'p1', uhid: 'UH-2026-1001', name: 'Ravi Kumar', dx: 'Vitiligo', studyId: 'T001' }, { id: 'p2', uhid: 'UH-2', name: 'Asha', notes: 'free text' }],
  visits: [{ id: 'v1', notes: 'itchy rash' }, { id: 'v2' }, { id: 'v3' }], photos: [{ id: 'ph1' }], logbook: [{ id: 'l1', proc: 'Biopsy' }, { id: 'l2' }],
  scores: [{ id: 's1' }], thesis: { title: 'Secret thesis title' }, sync: { on: true, last: '2026-11-27T10:00:00.000Z', fail: 2, email: 'me@gmail.com' }
};
const env = { day: '2026-11-28', v: '2026.11.28-0500-abc1234', ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/131 Mobile', inst: true, lsMB: 12.345,
  feat: { home: 3, patient: 2, 'Bad Key!': 9, 'ravi@x.com': 1, study: 0 }, drv: { appMB: 54.321, usedGB: 13.456, totalGB: 15, extra: 1 }, ts: 'TS' };
const p = U.usagePayload(D, env), js = JSON.stringify(p);
ok('only whitelisted top-level keys', Object.keys(p).every(k => U.USAGE_KEYS.includes(k)));
ok('no names, emails, UHIDs, diagnoses, notes or thesis text', !/Ravi|Asha|Secret|UH-|Vitiligo|itchy|free text|Biopsy|gmail|apiKey/.test(js));
ok('counts are integers', Object.values(p.n).every(Number.isInteger) && p.n.patients === 2 && p.n.visits === 3 && p.n.photos === 1 && p.n.logbook === 2 && p.n.thesis === 1 && p.n.scores === 1);
ok('n map has <= 8 keys', Object.keys(p.n).length <= 8);
const strs = []; const walk = (o, k) => { if (typeof o === 'string') strs.push(k); else if (o && typeof o === 'object') for (const [a, b] of Object.entries(o)) walk(b, (k ? k + '.' : '') + a); };
walk(Object.assign({}, p, { at: null }), '');
ok('strings only in day/v/plat/dept/yr', strs.every(k => ['day', 'v', 'plat', 'dept', 'yr'].includes(k)));
ok('platform + installed + dept + year', p.plat === 'android' && p.inst === true && p.dept === 'derma' && p.yr === 'JR2' && p.day === '2026-11-28');
ok('version kept', p.v === '2026.11.28-0500-abc1234');
ok('feat keeps only route-like keys with positive int counts', JSON.stringify(p.feat) === '{"home":3,"patient":2}');
ok('lsMB rounded number', p.lsMB === 12.3);
ok('drive only appMB/usedGB/totalGB', JSON.stringify(Object.keys(p.drv)) === '["appMB","usedGB","totalGB"]' && p.drv.appMB === 54.3);
ok('lastSync ms + syncFail int', p.lastSync === Date.parse('2026-11-27T10:00:00.000Z') && p.syncFail === 2 && p.at === 'TS');
const p2 = U.usagePayload({ settings: {} }, { day: '2026-11-28', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile', drv: { appMB: 1 } });
ok('empty data: zeros, no drive when sync off, lastSync null', p2.n.patients === 0 && !p2.drv && p2.lastSync === null && p2.syncFail === 0 && p2.plat === 'ios' && p2.yr === '' && !p2.feat);
ok('platform detection', U.usagePlat('Mozilla/5.0 (Windows NT 10.0; Win64)') === 'desktop' && U.usagePlat('') === 'other');
const many = {}; for (const r of U.USAGE_ROUTES) many[r] = 1;
ok('feat capped at 30 keys', Object.keys(U.usagePayload(D, Object.assign({}, env, { feat: many })).feat).length === 30);
ok('version string: only the build shape is sent, anything else becomes empty', U.usagePayload(D, Object.assign({}, env, { v: '<script>alert(1)</script>' })).v === '' && U.usagePayload(D, Object.assign({}, env, { v: '__BUILD__' })).v === '' && U.usagePayload(D, Object.assign({}, env, { v: '2026.11.28-0542' })).v === '2026.11.28-0542');

// ---------- once-per-day throttle ----------
ok('send when never sent (opted in)', U.usageShouldSend(null, '2026-11-28', 'u1', true));
ok('skip second send same day', !U.usageShouldSend({ day: '2026-11-28', uid: 'u1' }, '2026-11-28', 'u1', true));
ok('send next day', U.usageShouldSend({ day: '2026-11-27', uid: 'u1' }, '2026-11-28', 'u1', true));
ok('send for a different account on this device', U.usageShouldSend({ day: '2026-11-28', uid: 'u1' }, '2026-11-28', 'u2', true));
ok('never without uid', !U.usageShouldSend(null, '2026-11-28', '', true));
ok('opt-in: never when usageShare is undefined or false', !U.usageShouldSend(null, '2026-11-28', 'u1', undefined) && !U.usageShouldSend(null, '2026-11-28', 'u1', false) && !U.usageShouldSend(null, '2026-11-28', 'u1', 'yes'));
ok('local day format', /^\d{4}-\d{2}-\d{2}$/.test(U.usageDay()));
// Heartbeat is switched off for this release (USAGE_ENABLED = false): nothing is sent, counted, asked or shown.
globalThis.__cloudCalls = 0;
// Like the browser's Storage: stored keys are the object's own enumerable properties (Object.keys(localStorage)).
const __ls = {}; for (const [k, fn] of Object.entries({ getItem: k => (k in __ls ? __ls[k] : null), setItem: (k, v) => { __ls[k] = String(v); }, removeItem: k => { delete __ls[k]; } })) Object.defineProperty(__ls, k, { value: fn });
globalThis.localStorage = __ls;
globalThis.location = { hash: '#/patients' }; globalThis.ROUTES = [[/^patients$/]];
globalThis.Gate = { enabled: () => true, cached: { uid: 'u1', status: 'approved' } };
globalThis.Cloud = { init: async () => { globalThis.__cloudCalls++; }, cfg: () => ({}), user: { uid: 'u1' }, f: { setDoc: async () => { globalThis.__cloudCalls++; }, deleteDoc: async () => { globalThis.__cloudCalls++; } } };
globalThis.D = { settings: { usageShare: true, usageShareUid: 'u1' } };
ok('USAGE_ENABLED is false', U.USAGE_ENABLED === false);
const beatUndef = U.Usage.beat();
ok('disabled: Usage.on() false even with consent stored', U.Usage.on() === false);
ok('disabled: no Today card (askable false)', U.Usage.askable() === false);
U.Usage.start(1); ok('disabled: start() schedules nothing', U.Usage._t === null);
U.Usage.track(); ok('disabled: track() keeps no local counters', Object.keys(__ls).length === 0);
const shareP = U.Usage.setShare(true);
for (const k of ['pgd_feat:u1', 'pgd_usage:u1', 'pgd_usage', 'pgd_other']) __ls.setItem(k, '{}');
U.Usage.clearLocal(); ok('clearLocal still removes leftover counters (and nothing else)', Object.keys(__ls).join() === 'pgd_other');
// Feature keys must be real routes (app.js ROUTES first segments).
const appSrc = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const routeHeads = [...new Set([...appSrc.slice(0, appSrc.indexOf('function render')).matchAll(/\[\/\^([a-z][a-z-]*)/g)].map(m => m[1]))];
ok('USAGE_ROUTES = route names in app.js ROUTES', JSON.stringify([...routeHeads].sort()) === JSON.stringify([...U.USAGE_ROUTES].sort()));
ok('feat drops non-route keys', JSON.stringify(U.usagePayload(D, { day: '2026-11-28', feat: { home: 1, ravi: 2, 'patient-x': 3 } }).feat) === '{"home":1}');

// ---------- analytics maths ----------
const now = Date.parse('2026-11-28T12:00:00Z'), W = 7 * 864e5;
const wb = U.weekBuckets([now - 1000, now - 2000, now - W - 1000, now - 11 * W - 5, now - 12 * W - 5], now, 12);
ok('12 week buckets, oldest first', wb.length === 12 && wb[11].n === 2 && wb[10].n === 1 && wb[0].n === 1 && wb.reduce((a, b) => a + b.n, 0) === 4);
const docs = [{ id: 'a', day: '2026-11-28' }, { id: 'b', day: '2026-11-27' }, { id: 'c', day: '2026-11-22' }, { id: 'd', day: '2026-11-21' }, { id: 'e', day: '2026-10-30' }, { id: 'f', day: '2026-10-29' }, { id: 'g', day: 'junk' }, { id: 'h', day: '2026-11-29' }];
const ac = U.activeCounts(docs, '2026-11-28');
ok('active today / 7d / 30d', ac.today === 1 && ac.d7 === 3 && ac.d30 === 5);
ok('activeSince', U.activeSince(docs, '2026-11-28', 7).map(x => x.id).join() === 'a,b,c');
ok('gauge ok < 70', U.gauge(69, 100).level === 'ok');
ok('gauge warn >= 70', U.gauge(70, 100).level === 'warn' && U.gauge(89.9, 100).level === 'warn');
ok('gauge bad >= 90', U.gauge(90, 100).level === 'bad' && U.gauge(45000, 50000).pct === 90);
ok('crash-free %', U.crashFree(['a', 'b', 'c', 'd'], ['b', 'zz']) === 75 && U.crashFree([], ['a']) === null && U.crashFree(['a'], []) === 100);
const va = U.versionAdoption([{ v: '2026.11.20-0100-aaaa' }, { v: '2026.11.28-0500-bbbb' }, { v: '2026.11.28-0500-bbbb' }, { v: '2026.11.01-0100-cccc' }], '2026.11.25-0000-ffff', now);
ok('version adoption: latest = max seen, % on it', va.latest === '2026.11.28-0500-bbbb' && va.pct === 50);
ok('version adoption: build newer than all', U.versionAdoption([{ v: '2026.01.01-0000-aaaa' }], '2026.11.28-0000-bbbb', now).pct === 0);
ok('version adoption: ignores junk versions when picking latest', (() => { const r = U.versionAdoption([{ v: '2026.11.28-0500-bbbb' }, { v: 'zzz-hacked' }, { v: '9999' }, { v: '?' }], '?', now); return r.latest === '2026.11.28-0500-bbbb' && r.pct === 25; })());
// QA repro: forged stamps must not become "latest".
const G = '2026.11.28-0542-2652c19', qnow = Date.parse('2026-11-28T06:00:00Z');
ok('impossible date 2026.99.99-9999 ignored (66.7% stays on the real build)', (r => r.latest === G && r.pct === 66.7)(U.versionAdoption([{ v: G }, { v: G }, { v: '2026.99.99-9999' }], G, qnow)));
ok('trailing junk 9999.12.31-2359<script> ignored', (r => r.latest === G && r.pct === 66.7)(U.versionAdoption([{ v: G }, { v: G }, { v: '9999.12.31-2359<script>' }], G, qnow)));
ok('far-future 2030 stamp ignored (> now + 2 days)', (r => r.latest === G)(U.versionAdoption([{ v: G }, { v: '2030.01.01-0000-abcd' }], G, qnow)));
ok('stamp within 2 days ahead (clock skew) accepted', (r => r.latest === '2026.11.29-0100-abcd')(U.versionAdoption([{ v: G }, { v: '2026.11.29-0100-abcd' }], G, qnow)));
// Decision: '-abc' is not a git short sha (hex, 4+ chars) — build.py never produces it and the rules reject it, so it is ignored.
ok("'2026.11.28-0542-abc' ignored; latest stays the real build at 50%", (r => r.latest === G && r.pct === 50)(U.versionAdoption([{ v: G }, { v: G }, { v: '2026.11.28-0542-abc' }, { v: '2026.11.28-0542-abc' }], G, qnow)));
ok('usageVerOk: no-git build shape accepted, garbage rejected', U.usageVerOk('2026.11.28-0542', qnow) && U.usageVerOk(G, qnow) && !U.usageVerOk('2026.02.30-1200', qnow) && !U.usageVerOk('2026.11.28-2460', qnow) && !U.usageVerOk('__BUILD__', qnow));
const buildPy = fs.readFileSync(path.join(__dirname, '../build.py'), 'utf8');
ok('build.py BUILD shape matches USAGE_VER_RE', buildPy.includes("strftime('%Y.%m.%d-%H%M')") && buildPy.includes("['git','rev-parse','--short','HEAD']"));
ok('sync health', U.syncHealth([{ lastSync: now - 1000 }, { lastSync: now - 3 * 864e5 }, { lastSync: null }], now) === 50 && U.syncHealth([{ lastSync: null }], now) === null);
ok('countBy / sumMaps', JSON.stringify(U.countBy([{ p: 'a' }, { p: 'a' }, { p: 'b' }, {}], x => x.p)) === '{"a":2,"b":1}' && JSON.stringify(U.sumMaps([{ x: 1 }, { x: 2, y: 3 }, null])) === '{"x":3,"y":3}');
ok('size estimate uses documented averages', U.sizeEstimate({ posts: 10, usage: 2, unknown: 1 }) === 10 * U.FS_AVG_BYTES.posts + 2 * U.FS_AVG_BYTES.usage + 1000);
ok('daily ops from active users', JSON.stringify(U.dailyOps(10)) === JSON.stringify({ reads: 10 * U.FS_PER_USER.reads, writes: 10 * U.FS_PER_USER.writes }));

// ---------- healthLight ----------
const fresh = { lastRun: now - 60000, ok: true };
ok('green when all fine', U.healthLight({ now, crashFree: 100, latestPct: 90, syncPct: 95, bot: fresh, gauges: [U.gauge(10, 100)] }).light === 'green');
ok('green with no data', U.healthLight({}).light === 'green');
ok('missing usage data is unknown, not a problem (zero usage docs)', (() => { const z = U.versionAdoption([], '2026.11.28-0542-2652c19', now); const h = U.healthLight({ now, crashFree: U.crashFree([], []), latestPct: z.pct, syncPct: U.syncHealth([], now), bot: fresh, gauges: [U.gauge(0, 50000)] }); return z.pct === null && h.light === 'green' && h.reasons.length === 0; })());
ok('yellow: crash-free 95', U.healthLight({ now, crashFree: 95, bot: fresh }).light === 'yellow');
ok('red: crash-free 85', U.healthLight({ now, crashFree: 85, bot: fresh }).light === 'red');
ok('yellow: few on latest', U.healthLight({ now, latestPct: 40, bot: fresh }).light === 'yellow');
ok('red: bot stale > 10 min', U.healthLight({ now, bot: { lastRun: now - 11 * 60000, ok: true } }).light === 'red');
ok('red: bot not ok', U.healthLight({ now, bot: { lastRun: now, ok: false } }).light === 'red');
ok('yellow: bot never reported', U.healthLight({ now, bot: null }).light === 'yellow');
ok('yellow/red: gauges', U.healthLight({ gauges: [U.gauge(75, 100)] }).light === 'yellow' && U.healthLight({ gauges: [U.gauge(95, 100)] }).light === 'red');
ok('red: sync < 50, yellow: sync < 80', U.healthLight({ syncPct: 40 }).light === 'red' && U.healthLight({ syncPct: 70 }).light === 'yellow');
ok('red: CI failure', U.healthLight({ ci: 'failure' }).light === 'red');
ok('reasons listed', U.healthLight({ crashFree: 85, latestPct: 10 }).reasons.length === 2);

// ---------- firestore.rules (string-level) ----------
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
const block = (name) => { const i = rules.indexOf('match /' + name + '/'); let d = 0, j = rules.indexOf(' {', i) + 1; for (let k = j; k < rules.length; k++) { if (rules[k] === '{') d++; if (rules[k] === '}' && --d === 0) return rules.slice(i, k + 1); } return ''; };
const ub = block('usage'), sb = block('system');
ok('usage: read is admin only', /allow read: if isAdminUser\(\);/.test(ub) && (ub.match(/allow read/g) || []).length === 1);
ok('usage: relay branch limited to month ids', ub.includes("allow create, update: if approved() && m.matches('^[0-9]{4}-[0-9]{2}$') && request.resource.data.keys().hasOnly(['relayMB', 'relayCalls', 'updatedAt'])\n        && request.resource.data.relayMB is int && request.resource.data.relayCalls is int;"));
ok('usage: no owner write branch (heartbeat not shipped)', !/m == request\.auth\.uid/.test(ub) && !/ukeys|froutes|fint|featOk/.test(ub) && (ub.match(/allow create, update/g) || []).length === 1);
ok('usage: delete is admin only', /allow delete: if isAdminUser\(\);/.test(ub) && (ub.match(/allow delete/g) || []).length === 1);
ok('system comment: bot bypasses rules via OAuth/REST', rules.includes('bypasses security rules; this rule only limits writes from app clients'));
ok('client yr values are the documented labels', ['2026-11-28', '2025-01-01', '2024-01-01', '2023-01-01', '2020-01-01'].every(st => ['', 'JR1', 'JR2', 'JR3', 'SR'].includes(U.usageYr({ residencyStart: st }, '2026-11-28'))) && U.usageYr({}, '2026-11-28') === '');
ok('payload n keys', JSON.stringify(Object.keys(p.n)) === JSON.stringify(U.USAGE_N_KEYS));
ok('system: admin-only read, admin-only typed write', /allow read: if isAdminUser\(\);/.test(sb) && sb.includes("allow write: if isAdminUser() && request.resource.data.keys().hasOnly(['lastRun', 'ok', 'note'])") && sb.includes('request.resource.data.ok is bool && request.resource.data.lastRun is timestamp') && sb.includes("shortStr(request.resource.data.note, 60)") && !/approved\(\)|signedIn\(\)/.test(sb));

Promise.all([beatUndef, shareP]).then(([r, sh]) => { ok('disabled: beat()/setShare() write nothing (no Firebase calls)', r === false && sh === false && globalThis.__cloudCalls === 0);
    console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0); });
