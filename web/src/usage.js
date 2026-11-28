/* ===== Anonymous usage heartbeat + admin analytics maths =====
   Once a day (per local day, per account) the app writes usage/{uid} with NUMBERS ONLY: how many patients,
   visits, photos, logbook entries and thesis cases; which screens were opened (counts); app version; platform;
   storage used. Never names, emails, UHIDs, diagnoses, notes, free text or photos. Settings → Privacy turns it off
   (and deletes the doc). Only the admin can read these docs (firestore.rules).
   The pure functions below (no DOM, no Firebase) also drive Admin → Analytics / Storage / Health and are unit-tested in Node. */

const USAGE_KEYS = ['day', 'v', 'plat', 'inst', 'dept', 'yr', 'n', 'feat', 'lsMB', 'drv', 'lastSync', 'syncFail', 'at'];
const USAGE_FEAT_MAX = 30;          // matches firestore.rules feat.size() <= 30
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
    day, v: String(env.v || '?').replace(/[^\w.\-+]/g, '').slice(0, 40) || '?', plat: usagePlat(env.ua), inst: !!env.inst,
    dept: /^[a-z]{2,20}$/.test(s.dept || '') ? s.dept : 'derma', yr: usageYr(s, day),
    n: { patients: len(D.patients), visits: len(D.visits), photos: len(D.photos), logbook: len(D.logbook), scores: len(D.scores),
      thesis: usageInt((D.patients || []).filter(p => p && p.studyId).length) },
    lsMB: usageNum(env.lsMB, 1),
    lastSync: sy.on && sy.last && Date.parse(sy.last) ? Date.parse(sy.last) : null,
    syncFail: usageInt(sy.fail),
    at: env.ts === undefined ? null : env.ts
  };
  const feat = {}; let k = 0;
  for (const [key, c] of Object.entries(env.feat || {})) { if (k >= USAGE_FEAT_MAX) break; if (/^[a-z][a-z-]{0,19}$/.test(key) && usageInt(c) > 0) { feat[key] = usageInt(c); k++; } }
  if (k) o.feat = feat;
  const dv = env.drv;
  if (dv && sy.on) { const d = {}; for (const x of ['appMB', 'usedGB', 'totalGB']) if (dv[x] != null && isFinite(+dv[x])) d[x] = usageNum(dv[x], x === 'appMB' ? 1 : 2); if (Object.keys(d).length) o.drv = d; }
  return o;
}
/* At most one write per account per local day. prev = what this device last sent ({day, uid}). */
function usageShouldSend(prev, day, uid) { return !!uid && !(prev && prev.day === day && prev.uid === uid); }

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
function versionAdoption(docs, build) {
  const vs = (docs || []).map(d => String(d.v || '')).filter(Boolean); let latest = String(build || '');
  for (const v of vs) if (v > latest) latest = v;
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
  on() { return !!(D && D.settings && D.settings.usageShare !== false); },
  _get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  _set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  /* Screen opens since the last heartbeat (route names only, never ids or query strings). */
  track() {
    try {
      const path = (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
      if (typeof ROUTES === 'undefined' || !ROUTES.some(r => r[0].test(path))) return;
      const k = path.split('/')[0]; if (!/^[a-z][a-z-]{0,19}$/.test(k)) return;
      const f = this._get('pgd_feat') || {}; if (!(k in f) && Object.keys(f).length >= USAGE_FEAT_MAX) return;
      f[k] = (f[k] || 0) + 1; this._set('pgd_feat', f);
    } catch (e) {}
  },
  start(ms = 8000) { clearTimeout(this._t); this._t = setTimeout(() => this.beat(), ms); },
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
      const u = await this.ready(); if (!u) return false;
      const day = usageDay(); if (!usageShouldSend(this._get('pgd_usage'), day, u.uid)) return false;
      let lsMB = 0; try { const e = await navigator.storage.estimate(); lsMB = (e.usage || 0) / 1048576; } catch (e) {}
      const f = Cloud.f, feat = this._get('pgd_feat') || {};
      const doc = usagePayload(D, { day, v: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?', ua: navigator.userAgent, inst: !!(matchMedia('(display-mode: standalone)').matches || navigator.standalone),
        lsMB, feat, drv: await this.driveInfo(), ts: f.serverTimestamp() });
      if (!this.on()) return false;
      await f.setDoc(f.doc(Cloud.db, 'usage', u.uid), doc);
      this._set('pgd_usage', { day, uid: u.uid });
      const now = this._get('pgd_feat') || {}; for (const k of Object.keys(feat)) { now[k] = (now[k] || 0) - feat[k]; if (now[k] <= 0) delete now[k]; } this._set('pgd_feat', now);
      return true;
    } catch (e) { return false; }
  },
  async remove() {
    try { localStorage.removeItem('pgd_usage'); localStorage.removeItem('pgd_feat'); } catch (e) {}
    if (!Cloud.cfg() || !navigator.onLine) return;
    try { await Cloud.init(); if (Cloud.user) await Cloud.f.deleteDoc(Cloud.f.doc(Cloud.db, 'usage', Cloud.user.uid)); } catch (e) {}
  }
};
if (typeof addEventListener !== 'undefined' && typeof document !== 'undefined') {
  addEventListener('hashchange', () => Usage.track());
  addEventListener('online', () => { if (typeof D !== 'undefined' && D) Usage.start(3000); });
}
if (typeof ACT !== 'undefined') ACT.usageshare = async el => {
  D.settings.usageShare = !!el.checked; Store.save();
  if (el.checked) { toast('Thanks — anonymous counts will be sent once a day'); Usage.start(1500); }
  else { await Usage.remove(); toast('Usage sharing off — your usage record was deleted'); }
};
if (typeof module !== 'undefined') module.exports = { USAGE_KEYS, usageDay, usagePlat, usageYr, usagePayload, usageShouldSend, weekBuckets, activeCounts, activeSince, gauge, crashFree, versionAdoption, syncHealth, countBy, sumMaps, FS_AVG_BYTES, FS_FREE, FS_PER_USER, sizeEstimate, dailyOps, healthLight, BOT_STALE_MS, GAUGE_WARN, GAUGE_BAD };
