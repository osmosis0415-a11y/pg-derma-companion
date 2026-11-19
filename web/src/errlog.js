/* ===== Crash / error reporting =====
   Sends JavaScript errors to the admin (Firestore "errors"), never patient data:
   messages are cut short and scrubbed of emails, long numbers (UHIDs/phones) and quoted text,
   routes are reduced to their shape (#/visit/:id), and nothing from the patient database is attached. */
const ErrLog = {
  q: [], sent: 0, seen: {},
  scrub(s, n) {
    return String(s || '')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
      .replace(/"[^"]{3,}"|'[^']{3,}'|`[^`]{3,}`/g, '<text>')
      .replace(/\b[A-Z0-9-]*\d{4,}[A-Z0-9-]*\b/gi, '<num>')
      .slice(0, n);
  },
  capture(type, msg, stack) {
    try {
      if (this.sent + this.q.length >= 20) return;                     // per session cap
      const key = type + '|' + String(msg).slice(0, 80);
      if (this.seen[key] && Date.now() - this.seen[key] < 5 * 60000) return; // de-duplicate
      this.seen[key] = Date.now();
      this.q.push({
        type: String(type).slice(0, 20), msg: this.scrub(msg, 300),
        stack: this.scrub(String(stack || '').split('\n').slice(0, 6).join('\n'), 900),
        route: (location.hash.split('?')[0] || '#/').replace(/\/[\w-]{6,}/g, '/:id').slice(0, 60),
        version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?', ua: navigator.userAgent.slice(0, 160), at: new Date().toISOString()
      });
      setTimeout(() => this.flush(), 2000);
    } catch (e) {}
  },
  async flush() {
    if (!this.q.length || !navigator.onLine || typeof Gate === 'undefined' || !Gate.cached || !Cloud.cfg()) return;
    try {
      await Cloud.init(); if (!Cloud.user) return;
      const f = Cloud.f;
      while (this.q.length) { const e = this.q.shift(); await f.addDoc(f.collection(Cloud.db, 'errors'), Object.assign(e, { uid: Cloud.user.uid, createdAt: f.serverTimestamp() })); this.sent++; }
    } catch (e) {}
  }
};
addEventListener('error', e => { if (e.message) ErrLog.capture('error', e.message, e.error && e.error.stack); });
addEventListener('unhandledrejection', e => { const r = e.reason || {}; ErrLog.capture('promise', r.message || String(r), r.stack); });
addEventListener('online', () => ErrLog.flush());
