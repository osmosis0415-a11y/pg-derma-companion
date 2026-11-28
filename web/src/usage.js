/* ===== account-linked usage heartbeat + admin analytics maths =====
   Once a day (per local day, per account) the app writes usage/{uid} with NUMBERS ONLY: how many patients,
   visits, photos, logbook entries and thesis cases; which screens were opened (counts); app version; platform;
   storage used. Never names, emails, UHIDs, diagnoses, notes, free text or photos. OPT-IN: nothing is sent until the
   user says yes (Today card or Settings → Privacy: D.settings.usageShare === true AND usageShareUid === the signed-in uid). Turning it off deletes the doc
   (retried when back online). The doc is linked to the account (usage/{uid}); only the admin can read it (firestore.rules).
   The pure functions below (no DOM, no Firebase) also drive Admin → Analytics / Storage / Health and are unit-tested in Node. */

/* Heartbeat switch. false = no usage writes, no local counters, no Today card, no Settings toggle (W-1 ships without it;
   the heartbeat waits on PR #25). Usage.clearLocal() still runs on sign-out / erase to remove keys left by test builds. */
const USAGE_ENABLED = false;
const USAGE_KEYS = ['day', 'v', 'plat', 'inst', 'dept', 'yr', 'n', 'feat', 'lsMB', 'drv', 'lastSync', 'syncFail', 'at'];
const USAGE_FEAT_MAX = 30;          // the usage/{uid} rule ships with the heartbeat PR (#25)
const USAGE_N_KEYS = ['patients', 'visits', 'photos', 'logbook', 'scores', 'thesis'];
/* Screen names that may be counted in feat — the first segment of every route in app.js ROUTES (the heartbeat PR's rule uses the same list). */
const USAGE_ROUTES = ['home', 'patients', 'patient', 'add', 'visit', 'score', 'map', 'wa', 'cam', 'vault', 'photo', 'deid', 'compare', 'inv', 'cal', 'logbook', 'logadd', 'targets', 'thesis', 'thesis-setup', 'analytics', 'formulary', 'checklists', 'more', 'settings', 'batch', 'admin', 'study', 'feed', 'community', 'notifs', 'dms', 'dm', 'story-new', 'people', 'flist', 'compose', 'post', 'u', 'study-run', 'study-set', 'journal'];
/* BUILD from web/build.py: 'YYYY.MM.DD-HHMM' plus '-<git short sha>' when git is available. Same pattern as firestore.rules. */
const USAGE_VER_RE = /^[0-9]{4}[.][0-9]{2}[.][0-9]{2}-[0-9]{4}(-[0-9a-f]{4,40})?$/;
/* A version is usable only if it has the build shape, is a real UTC date/time and is not more than 2 days in the future. */
function usageVerOk(v, now = Date.now()) {
  v = String(v || ''); if (!USAGE_VER_RE.test(v)) return false;
  const Y = +v.slice(0, 4), M = +v.slice(5, 7), Dd = +v.slice(8, 10), h = +v.slice(11, 13), mi = +v.slice(13, 15), t = Date.UTC(Y, M - 1, Dd, h, mi), d = new Date(t);
  return d.getUTCFullYear() === Y && d.getUTCMonth() === M - 1 && d.getUTCDate() === Dd && h < 24 && mi < 60 && t <= now + 2 * 864e5;
}
const usageDay = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const usageInt = x => Math.max(0, Math.floor(+x || 0));
const usageNum = (x, dp = 1) => { const p = Math.pow(10, dp); return Math.round((+x || 0) * p) / p; };
function usagePlat(ua) {
  ua = String(ua || '');
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && /mobile/i.test(ua))) return 'ios';
  if (/windows|macintosh|mac os x|linux|cros/i.test(ua)) return 'desktop';
  return 'other';
}
/* Residency year label from the start date in Settings ('' when not set — the admin then falls back to the sign-up year). */
function usageYr(settings, day) {
  const s = settings && settings.residencyStart; if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const y = (Date.parse(day) - Date.parse(s)) / (365.25 * 864e5);
  return !(y >= 0) ? 'JR1' : y < 1 ? 'JR1' : y < 2 ? 'JR2' : y < 3 ? 'JR3' : 'SR';
}
/* Builds the heartbeat document. D = the decrypted app data; env = { day, v, ua, inst, lsMB, feat, drv, ts }.
   Every value is a number, a boolean, a whitelisted label or the server timestamp. */
function usagePayload(D, env) {
  D = D || {}; env = env || {}; const s = D.settings || {}, sy = D.sync || {}, len = a => usageInt(Array.isArray(a) ? a.length : 0);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(env.day || '') ? env.day : usageDay();
  const o = {
    day, v: USAGE_VER_RE.test(String(env.v || '')) ? String(env.v) : '', plat: usagePlat(env.ua), inst: !!env.inst,
    dept: /^[a-z]{2,20}$/.test(s.dept || '') ? s.dept : 'derma', yr: usageYr(s, day),
    n: { patients: len(D.patients), visits: len(D.visits), photos: len(D.photos), logbook: len(D.logbook), scores: len(D.scores),
      thesis: usageInt((D.patients || []).filter(p => p && p.studyId).length) },
    lsMB: usageNum(env.lsMB, 1),
    lastSync: sy.on && sy.last && Date.parse(sy.last) ? Date.parse(sy.last) : null,
    syncFail: usageInt(sy.fail),
    at: env.ts === undefined ? null : env.ts
  };
  const feat = {}; let k = 0;
  for (const [key, c] of Object.entries(env.feat || {})) { if (k >= USAGE_FEAT_MAX) break; if (USAGE_ROUTES.includes(key) && usageInt(c) > 0) { feat[key] = usageInt(c); k++; } }
  if (k) o.feat = feat;
  const dv = env.drv;
  if (dv && sy.on) { const d = {}; for (const x of ['appMB', 'usedGB', 'totalGB']) if (dv[x] != null && isFinite(+dv[x])) d[x] = usageNum(dv[x], x === 'appMB' ? 1 : 2); if (Object.keys(d).length) o.drv = d; }
  return o;
}
/* Only after an explicit opt-in (share === true), and at most one write per account per local day. prev = what this device last sent ({day, uid}). */
function usageShouldSend(prev, day, uid, share) { return share === true && !!uid && !(prev && prev.day === day && prev.uid === uid); }

/* ---------- Analytics maths (admin) ---------- */
const dayNum = s => Math.floor(Date.parse(String(s || '').slice(0, 10) + 'T00:00:00Z') / 864e5);
/* Sign-ups per week: n rolling 7-day buckets ending at `now` (oldest first). times = ms timestamps. */
function weekBuckets(times, now, n = 12) {
  const W = 7 * 864e5, out = [];
  for (let i = n - 1; i >= 0; i--) { const end = now - i * W, start = end - W; out.push({ start, n: (times || []).filter(t => t > start && t <= end).length }); }
  return out;
}
/* Active users from heartbeat days: today = sent today, d7 = within the last 7 days (incl. today), d30 = last 30. */
function activeCounts(docs, today) {
  const t = dayNum(today), r = { today: 0, d7: 0, d30: 0 };
  for (const d of docs || []) { const a = t - dayNum(d.day); if (!(a >= 0)) continue; if (a === 0) r.today++; if (a < 7) r.d7++; if (a < 30) r.d30++; }
  return r;
}
const activeSince = (docs, today, days) => (docs || []).filter(d => { const a = dayNum(today) - dayNum(d.day); return a >= 0 && a < days; });
/* Gauge: share of a free-tier limit. warn at >= 70 %, bad at >= 90 %. */
const GAUGE_WARN = 70, GAUGE_BAD = 90;
function gauge(v, max) { const pct = max > 0 ? Math.round((+v || 0) / max * 1000) / 10 : 0; return { v: +v || 0, max, pct, level: pct >= GAUGE_BAD ? 'bad' : pct >= GAUGE_WARN ? 'warn' : 'ok' }; }
/* Crash-free users: active users with no error report in the window / active users (null when nobody is active). */
function crashFree(activeUids, errorUids) { const a = new Set(activeUids || []), e = new Set(errorUids || []); if (!a.size) return null; let bad = 0; for (const u of a) if (e.has(u)) bad++; return Math.round((a.size - bad) / a.size * 1000) / 10; }
/* Version adoption: latest = the larger of this build and the newest version seen (build strings sort by date). */
function versionAdoption(docs, build, now = Date.now()) {
  const vs = (docs || []).map(d => String(d.v || '')).filter(Boolean); let latest = usageVerOk(build, now) ? String(build) : '';
  for (const v of vs) if (usageVerOk(v, now) && v > latest) latest = v;
  return { latest, pct: vs.length ? Math.round(vs.filter(v => v === latest).length / vs.length * 1000) / 10 : null };
}
/* Sync health: of active users who use Drive sync (lastSync set), % synced in the last 24 h. */
function syncHealth(docs, now) { const s = (docs || []).filter(d => d.lastSync != null); if (!s.length) return null; return Math.round(s.filter(d => now - d.lastSync <= 864e5).length / s.length * 1000) / 10; }
function countBy(list, fn) { const o = {}; for (const x of list || []) { const k = fn(x); if (k == null || k === '') continue; o[k] = (o[k] || 0) + 1; } return o; }
function sumMaps(list) { const o = {}; for (const m of list || []) for (const [k, v] of Object.entries(m || {})) o[k] = (o[k] || 0) + (+v || 0); return o; }
/* Rough average stored size per document (bytes, incl. index overhead) — order-of-magnitude estimates. */
const FS_AVG_BYTES = { approvals: 600, usage: 500, errors: 1400, posts: 6000, profiles: 2500, content: 1500, digest: 4000, batches: 300, dms: 400, notifs: 400, stories: 20000, study: 400, follows: 200, reports: 300 };
const FS_FREE = { bytes: 1073741824, reads: 50000, writes: 20000 };
/* Per active user per day (rough): feed + community + study reads, a handful of writes. */
const FS_PER_USER = { reads: 300, writes: 25 };
function sizeEstimate(counts) { let b = 0; for (const [k, n] of Object.entries(counts || {})) b += (+n || 0) * (FS_AVG_BYTES[k] || 1000); return b; }
function dailyOps(activeUsers) { const a = +activeUsers || 0; return { reads: a * FS_PER_USER.reads, writes: a * FS_PER_USER.writes }; }
/* Traffic light. Inputs may be null (= no data, ignored).
   red    : crash-free < 90 %, bot heartbeat stale (> 10 min) or not ok, sync health < 50 %, any free-tier gauge >= 90 %, last CI run failed
   yellow : crash-free < 98 %, < 50 % of active users on the latest version, sync health < 80 %, any gauge >= 70 %, bot never reported
   green  : otherwise */
const BOT_STALE_MS = 10 * 60000;
function healthLight(m) {
  m = m || {}; const red = [], yel = [];
  if (m.crashFree != null) { if (m.crashFree < 90) red.push('crash-free users ' + m.crashFree + '%'); else if (m.crashFree < 98) yel.push('crash-free users ' + m.crashFree + '%'); }
  if (m.latestPct != null && m.latestPct < 50) yel.push(m.latestPct + '% on the latest version');
  if (m.syncPct != null) { if (m.syncPct < 50) red.push('only ' + m.syncPct + '% synced in 24 h'); else if (m.syncPct < 80) yel.push(m.syncPct + '% synced in 24 h'); }
  if (m.bot === undefined) {} else if (!m.bot || !m.bot.lastRun) yel.push('approval bot never reported');
  else if (m.bot.ok === false) red.push('approval bot reported an error');
  else if ((m.now || Date.now()) - m.bot.lastRun > BOT_STALE_MS) red.push('approval bot silent for over 10 min');
  for (const g of m.gauges || []) { if (!g) continue; if (g.level === 'bad') red.push((g.name || 'quota') + ' at ' + g.pct + '%'); else if (g.level === 'warn') yel.push((g.name || 'quota') + ' at ' + g.pct + '%'); }
  if (m.ci === 'failure') red.push('last GitHub Actions run failed');
  return { light: red.length ? 'red' : yel.length ? 'yellow' : 'green', reasons: red.concat(yel) };
}

/* ---------- Runtime (browser only) ---------- */
const Usage = {
  _t: null,
  /* Consent belongs to the account that gave it (usageShareUid). */
  on() { if (!USAGE_ENABLED) return false; const u = this._uid(); return !!(D && D.settings && D.settings.usageShare === true && u && D.settings.usageShareUid === u); },
  /* Ask once per account (Today card) until that account picks Yes or Not now. */
  askable() { if (!USAGE_ENABLED) return false; const u = this._uid(); return !!(D && D.settings && u && D.settings.usageShareUid !== u && typeof Gate !== 'undefined' && Gate.enabled() && Gate.cached && Gate.cached.status === 'approved'); },
  _uid() { return (typeof Gate !== 'undefined' && Gate.cached && Gate.cached.uid) || (typeof Cloud !== 'undefined' && Cloud.user && Cloud.user.uid) || ''; },
  _get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  _set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  /* Local counters are per account: pgd_feat:<uid>, pgd_usage:<uid>. */
  clearLocal(uid) { try { for (const k of Object.keys(localStorage)) if (/^pgd_(feat|usage)(:|$)/.test(k) && (!uid || k.endsWith(':' + uid))) localStorage.removeItem(k); } catch (e) {} },
  /* Screen opens since the last heartbeat (route names only, never ids or query strings). Only while sharing is on. */
  track() {
    try {
      const uid = this._uid(); if (!this.on() || !uid) return;
      const path = (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
      if (typeof ROUTES === 'undefined' || !ROUTES.some(r => r[0].test(path))) return;
      const k = path.split('/')[0]; if (!USAGE_ROUTES.includes(k)) return;
      const f = this._get('pgd_feat:' + uid) || {}; if (!(k in f) && Object.keys(f).length >= USAGE_FEAT_MAX) return;
      f[k] = (f[k] || 0) + 1; this._set('pgd_feat:' + uid, f);
    } catch (e) {}
  },
  /* Retries a pending delete (even with sharing off), then sends today's heartbeat if sharing is on. */
  start(ms = 8000) { if (!USAGE_ENABLED) return; clearTimeout(this._t); this._t = setTimeout(async () => { if (D && D.settings && D.settings.usageDel) await this.remove(); this.beat(); }, ms); },
  async ready() {
    if (!D || !this.on() || !navigator.onLine || typeof Gate === 'undefined' || !Gate.enabled() || !Gate.cached || Gate.cached.status !== 'approved') return null;
    await Cloud.init(); const u = Cloud.user; if (!u || (Gate.cached.uid && Gate.cached.uid !== u.uid)) return null;
    return u;
  },
  async driveInfo() {
    if (!(D.sync && D.sync.on) || !Drive.valid()) return null;
    const o = {};
    try { const a = await Drive.about(); const q = a.storageQuota || {}; if (q.usage) o.usedGB = +q.usage / 1073741824; if (q.limit) o.totalGB = +q.limit / 1073741824; } catch (e) {}
    try { let b = 0, pt = ''; do { const j = await (await Drive.api('drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(size)' + (pt ? '&pageToken=' + encodeURIComponent(pt) : ''))).json(); for (const f of j.files || []) b += +f.size || 0; pt = j.nextPageToken; } while (pt); o.appMB = b / 1048576; } catch (e) {}
    return Object.keys(o).length ? o : null;
  },
  async beat() {
    try {
      if (!this.on()) return false;
      const u = await this.ready(); if (!u) return false;
      const day = usageDay(), kU = 'pgd_usage:' + u.uid, kF = 'pgd_feat:' + u.uid;
      if (!usageShouldSend(this._get(kU), day, u.uid, this.on())) return false;
      let lsMB = 0; try { const e = await navigator.storage.estimate(); lsMB = (e.usage || 0) / 1048576; } catch (e) {}
      const f = Cloud.f, feat = this._get(kF) || {};
      const doc = usagePayload(D, { day, v: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?', ua: navigator.userAgent, inst: !!(matchMedia('(display-mode: standalone)').matches || navigator.standalone),
        lsMB, feat, drv: await this.driveInfo(), ts: f.serverTimestamp() });
      if (!this.on() || D.settings.usageDel === u.uid) return false;
      await f.setDoc(f.doc(Cloud.db, 'usage', u.uid), doc);
      this._set(kU, { day, uid: u.uid });
      const now = this._get(kF) || {}; for (const k of Object.keys(feat)) { now[k] = (now[k] || 0) - feat[k]; if (now[k] <= 0) delete now[k]; } this._set(kF, now);
      return true;
    } catch (e) { return false; }
  },
  /* Deletes usage/<D.settings.usageDel>. The pending uid stays set until the delete really succeeded (retried by start()/online),
     and the delete only runs while that same account is signed in. */
  async remove() {
    if (!USAGE_ENABLED) { this.clearLocal(); return true; }
    if (!D || !D.settings.usageDel) return true;
    const want = String(D.settings.usageDel); this.clearLocal(want);
    if (!Cloud.cfg() || !navigator.onLine) return false;
    try {
      await Cloud.init(); if (!Cloud.user || Cloud.user.uid !== want) return false;
      await Cloud.f.deleteDoc(Cloud.f.doc(Cloud.db, 'usage', want));
      if (D && D.settings.usageDel === want) { D.settings.usageDel = false; Store.save(); }
      return true;
    } catch (e) { return false; }
  },
  async setShare(on) {
    if (!USAGE_ENABLED) return false;
    const u = this._uid(); if (!u) return false;
    D.settings.usageShare = !!on; D.settings.usageShareUid = u;
    if (on) { if (D.settings.usageDel === u) D.settings.usageDel = false; Store.save(); Usage.start(500); return true; }
    D.settings.usageDel = u; Store.save();
    return this.remove();
  }
};
const USAGE_LABEL = 'Share daily usage counts with the admin (linked to your account)';
const USAGE_DESC = 'Linked to your account. Once a day, sends the app admin: how many patients, visits, photos, logbook entries, scores and thesis cases you have (numbers only); which screens you opened (counts); app version; Android/iOS/desktop and whether the app is installed; department and residency year; storage used on this device; and, if Drive backup is on, your backup size, Google Drive used and total space, when you last synced and how many syncs failed. Used only to improve the app and spot sync or storage problems. Never names, UHIDs, diagnoses, notes or photos. Kept until you turn this off, which deletes it.';
/* One-time question on Today (until the user picks Yes or Not now). */
function usageAskHTML() {
  if (!USAGE_ENABLED || !Usage.askable()) return '';
  return `<div class="card usageask" id="usageask"><b>${esc('Help improve the app? Share daily usage counts with the admin (linked to your account).')}</b><p class="small muted">${esc(USAGE_DESC)}</p>
    <div class="btnrow"><button class="btn sm" data-act="usageyes">Yes, share</button><button class="btn sm ghost" data-act="usageno">Not now</button></div></div>`;
}
if (typeof addEventListener !== 'undefined' && typeof document !== 'undefined') {
  addEventListener('hashchange', () => Usage.track());
  addEventListener('online', () => { if (typeof D !== 'undefined' && D) Usage.start(3000); });
}
if (typeof ACT !== 'undefined') {
  const offMsg = ok => toast(ok ? 'Usage sharing off — your usage record was deleted' : 'Usage sharing off — your usage record will be deleted when you\'re back online', 3500);
  ACT.usageshare = async el => {
    if (el.checked) { await Usage.setShare(true); toast('Thanks — usage counts will be sent once a day'); }
    else offMsg(await Usage.setShare(false));
  };
  ACT.usageyes = async () => { $('#usageask')?.remove(); await Usage.setShare(true); toast('Thanks — usage counts will be sent once a day'); };
  ACT.usageno = async () => { $('#usageask')?.remove(); const u = Usage._uid(); if (!u) return; D.settings.usageShare = false; D.settings.usageShareUid = u; Store.save(); };
}
if (typeof module !== 'undefined') module.exports = { USAGE_ENABLED, Usage, USAGE_ROUTES, USAGE_VER_RE, usageVerOk, USAGE_N_KEYS, USAGE_LABEL, USAGE_DESC, USAGE_KEYS, usageDay, usagePlat, usageYr, usagePayload, usageShouldSend, weekBuckets, activeCounts, activeSince, gauge, crashFree, versionAdoption, syncHealth, countBy, sumMaps, FS_AVG_BYTES, FS_FREE, FS_PER_USER, sizeEstimate, dailyOps, healthLight, BOT_STALE_MS, GAUGE_WARN, GAUGE_BAD };
