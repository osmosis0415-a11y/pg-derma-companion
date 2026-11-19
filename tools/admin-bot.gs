/**
 * PG Derma Companion — Admin approval bot (Google Apps Script).
 *
 * Every minute it looks for new sign-ups waiting in Firestore approvals/{uid} (status "pending")
 * and sends the admin an email (and, optionally, a Telegram message) with one-tap
 * Approve / Reject buttons. Tapping a button opens a small confirm page; nothing changes
 * until "Confirm" is pressed (so link scanners can't approve anyone).
 *
 * It runs as the admin's own Google account, which owns the Firebase project, so it talks to
 * Firestore through the REST API with the admin's OAuth token. It never reads patient data
 * (there is none in Firestore).
 *
 * Setup (once):
 *   1. Run setup_() from the editor and click Allow. It creates the 1-minute trigger and a secret link key.
 *   2. Deploy -> New deployment -> Web app -> Execute as: Me, Who has access: Anyone. Then run sendTest_().
 *   Optional Telegram: Script properties TG_TOKEN = <token from @BotFather>; send any message to your bot,
 *   then run telegramSetup_() to capture your chat id.
 */
var PROJECT = 'pg-derma-companion';
var FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';
var APP_URL = 'https://osmosis0415-a11y.github.io/pg-derma-companion/';

function props_() { return PropertiesService.getScriptProperties(); }
function admin_() { return Session.getEffectiveUser().getEmail(); }
function key_() {
  var k = props_().getProperty('LINK_KEY');
  if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); props_().setProperty('LINK_KEY', k); }
  return k;
}
function sig_(uid, act) {
  var raw = Utilities.computeHmacSha256Signature(uid + '|' + act, key_());
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}
function eq_(a, b) { // constant-time compare
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
// Always use the public /exec address in emails. getUrl() returns the editor-only /dev address when a function runs from the editor.
var BOT_EXEC_URL = 'https://script.google.com/macros/s/AKfycbzvLDQYZp0q9WDDP1t0eZs1YcsgNLhoQmtcohepwokDeMRgeM4jWAqeD7wUvvtjyjJ_/exec';
function webUrl_() { var u = props_().getProperty('WEB_URL') || ScriptApp.getService().getUrl() || ''; return /\/exec$/.test(u) ? u : BOT_EXEC_URL; }
function link_(uid, act) { return webUrl_() + '?a=' + act + '&u=' + encodeURIComponent(uid) + '&s=' + sig_(uid, act); }
function dashLink_() { return webUrl_() + '?a=list&s=' + sig_('*', 'list'); }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* ---------- Firestore REST ---------- */
function fs_(method, path, body) {
  var o = { method: method, muteHttpExceptions: true, contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  if (body) o.payload = JSON.stringify(body);
  var r = UrlFetchApp.fetch(FS + path, o), c = r.getResponseCode(), t = r.getContentText();
  if (c >= 300) throw new Error('Firestore ' + c + ': ' + t.slice(0, 300));
  return t ? JSON.parse(t) : {};
}
function val_(f) { if (!f) return ''; return f.stringValue != null ? f.stringValue : f.timestampValue != null ? f.timestampValue : ''; }
function rowOf_(doc) {
  var f = doc.fields || {};
  return { uid: doc.name.split('/').pop(), email: val_(f.email), name: val_(f.name), status: val_(f.status), requestedAt: val_(f.requestedAt) };
}
function listByStatus_(status) {
  var res = fs_('post', ':runQuery', { structuredQuery: { from: [{ collectionId: 'approvals' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: status } } }, limit: 200 } });
  return (res || []).filter(function (x) { return x.document; }).map(function (x) { return rowOf_(x.document); });
}
function getUser_(uid) { return rowOf_(fs_('get', '/approvals/' + encodeURIComponent(uid))); }
function setStatus_(uid, status) {
  var q = '?updateMask.fieldPaths=status&updateMask.fieldPaths=decidedAt&updateMask.fieldPaths=decidedBy&currentDocument.exists=true';
  fs_('patch', '/approvals/' + encodeURIComponent(uid) + q, { fields: { status: { stringValue: status }, decidedAt: { timestampValue: new Date().toISOString() }, decidedBy: { stringValue: admin_() } } });
}

/* ---------- Notifications ---------- */
function checkNew_() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return;
  try {
    var seen = JSON.parse(props_().getProperty('NOTIFIED') || '[]');
    var pending = listByStatus_('pending');
    var fresh = pending.filter(function (p) { return seen.indexOf(p.uid) < 0; });
    try { pushOut_(); } catch (e) { Logger.log('push: ' + e); }
    try { digestTick_(); } catch (e) { Logger.log('digest: ' + e); }
    if (!fresh.length) return;
    notifyEmail_(fresh, pending.length);
    notifyTelegram_(fresh);
    seen = seen.concat(fresh.map(function (p) { return p.uid; })).slice(-500);
    props_().setProperty('NOTIFIED', JSON.stringify(seen));
  } finally { lock.releaseLock(); }
}

function notifyEmail_(fresh, totalPending) {
  var btn = function (href, label, bg) { return '<a href="' + href + '" style="display:inline-block;padding:10px 18px;margin:4px 6px 4px 0;border-radius:8px;background:' + bg + ';color:#fff;text-decoration:none;font-weight:600">' + label + '</a>'; };
  var rows = fresh.map(function (p) {
    return '<div style="border:1px solid #e3e3e3;border-radius:10px;padding:12px 14px;margin:10px 0">' +
      '<div style="font-size:16px;font-weight:600">' + esc_(p.name || '(no name)') + '</div>' +
      '<div style="color:#555">' + esc_(p.email) + '</div>' +
      '<div style="margin-top:8px">' + btn(link_(p.uid, 'approve'), '✓ Approve', '#1a7f4b') + btn(link_(p.uid, 'reject'), '✕ Reject', '#b3261e') + '</div></div>';
  }).join('');
  var html = '<div style="font-family:Arial,sans-serif;max-width:520px">' +
    '<p>' + fresh.length + ' new sign-up' + (fresh.length > 1 ? 's' : '') + ' waiting for approval on <b>PG Derma Companion</b>' +
    (totalPending > fresh.length ? ' (' + totalPending + ' pending in total)' : '') + '.</p>' + rows +
    '<p style="color:#777;font-size:12px">Each button opens a confirm page. ' +
    '<a href="' + dashLink_() + '">See all pending</a> · <a href="' + APP_URL + '#/admin">Open the app</a></p></div>';
  MailApp.sendEmail({ to: admin_(), subject: 'PG Derma: ' + fresh.map(function (p) { return p.name || p.email; }).join(', ') + ' wants access', htmlBody: html, name: 'PG Derma bot' });
}

function tg_(method, payload) {
  var t = props_().getProperty('TG_TOKEN'); if (!t) return null;
  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + t + '/' + method, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions: true });
  return JSON.parse(r.getContentText());
}
function notifyTelegram_(fresh) {
  var chat = props_().getProperty('TG_CHAT'); if (!chat || !props_().getProperty('TG_TOKEN')) return;
  fresh.forEach(function (p) {
    tg_('sendMessage', { chat_id: chat, text: '🆕 New sign-up\n' + (p.name || '(no name)') + '\n' + p.email,
      reply_markup: { inline_keyboard: [[{ text: '✓ Approve', url: link_(p.uid, 'approve') }, { text: '✕ Reject', url: link_(p.uid, 'reject') }]] } });
  });
}

/* ---------- Web app (confirm pages) ---------- */
function page_(title, body) {
  return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font-family:Arial,sans-serif;max-width:480px;margin:28px auto;padding:0 16px;color:#1d1d1f}' +
    '.card{border:1px solid #e3e3e3;border-radius:12px;padding:16px;margin:12px 0}' +
    'button,.b{font-size:16px;padding:12px 20px;border:0;border-radius:10px;color:#fff;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block;margin:4px 6px 4px 0}' +
    '.ok{background:#1a7f4b}.no{background:#b3261e}.muted{color:#666;font-size:13px}</style>' + body)
    .setTitle(title).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function doGet(e) {
  var p = (e && e.parameter) || {}, a = p.a, u = p.u || '', s = p.s || '';
  if (a === 'list') {
    if (!eq_(s, sig_('*', 'list'))) return page_('PG Derma', '<p>Link not valid.</p>');
    var list = listByStatus_('pending');
    var rows = list.map(function (x) {
      return '<div class="card"><b>' + esc_(x.name || '(no name)') + '</b><div class="muted">' + esc_(x.email) + '</div>' +
        '<a class="b ok" href="' + link_(x.uid, 'approve') + '" target="_top">Approve</a><a class="b no" href="' + link_(x.uid, 'reject') + '" target="_top">Reject</a></div>';
    }).join('');
    return page_('Pending sign-ups', '<h2>Pending sign-ups (' + list.length + ')</h2>' + (rows || '<p>Nobody is waiting. 🎉</p>'));
  }
  if (a === 'capprove' || a === 'creject' || a === 'capproveall') return contentPage_(u, a, s);
  if (a !== 'approve' && a !== 'reject') return page_('PG Derma bot', '<p>PG Derma approval bot is running.</p>');
  if (!u || !eq_(s, sig_(u, a))) return page_('PG Derma', '<p>Link not valid.</p>');
  var x; try { x = getUser_(u); } catch (err) { return page_('PG Derma', '<p>That request no longer exists.</p>'); }
  var verb = a === 'approve' ? 'Approve' : 'Reject';
  var body = '<h2>' + verb + ' access?</h2><div class="card"><b>' + esc_(x.name || '(no name)') + '</b><div class="muted">' + esc_(x.email) + '</div>' +
    '<div class="muted">Current status: ' + esc_(x.status) + '</div></div>' +
    '<div id="act"><button class="' + (a === 'approve' ? 'ok' : 'no') + '" onclick="go()">Confirm: ' + verb + '</button></div><p id="msg" class="muted"></p>' +
    '<script>function go(){document.getElementById("act").innerHTML="Saving…";google.script.run' +
    '.withSuccessHandler(function(m){document.getElementById("act").innerHTML="<b>"+m+"</b>"})' +
    '.withFailureHandler(function(e){document.getElementById("act").innerHTML="Failed: "+e.message})' +
    '.decide(' + JSON.stringify(u) + ',' + JSON.stringify(a) + ',' + JSON.stringify(s) + ')}</script>';
  return page_(verb + ' — PG Derma', body);
}

function decide(uid, act, s) {
  if ((act !== 'approve' && act !== 'reject') || !eq_(String(s), sig_(String(uid), act))) throw new Error('Link not valid');
  setStatus_(uid, act === 'approve' ? 'approved' : 'rejected');
  var x = getUser_(uid);
  return (act === 'approve' ? '✓ Approved ' : '✕ Rejected ') + (x.name || x.email) + '. Their app updates within seconds.';
}

function contentPage_(u, a, s) {
  if (!u || !eq_(s, sig_(u, a))) return page_('PG Derma', '<p>Link not valid.</p>');
  var head = '', verb = a === 'creject' ? 'Discard' : 'Publish';
  if (a === 'capproveall') { var n = query_('content', 'tag', 'EQUAL', u).filter(function (c) { return c.status === 'draft'; }).length; head = '<h2>Publish ' + n + ' drafted items?</h2><p class="muted">They appear in every resident\'s Study tab.</p>'; }
  else { var o; try { o = docObj_(fs_('get', '/content/' + encodeURIComponent(u))); } catch (e) { return page_('PG Derma', '<p>That item no longer exists.</p>'); }
    head = '<h2>' + verb + ' this item?</h2><div class="card">' + itemHtml_(o) + '<div class="muted">Status: ' + esc_(o.status) + '</div></div>'; }
  return page_(verb + ' — PG Derma', head + '<div id="act"><button class="' + (a === 'creject' ? 'no' : 'ok') + '" onclick="go()">Confirm: ' + verb + '</button></div>' +
    '<script>function go(){document.getElementById("act").innerHTML="Saving…";google.script.run.withSuccessHandler(function(m){document.getElementById("act").innerHTML="<b>"+m+"</b>"})' +
    '.withFailureHandler(function(e){document.getElementById("act").innerHTML="Failed: "+e.message}).cdecide(' + JSON.stringify(u) + ',' + JSON.stringify(a) + ',' + JSON.stringify(s) + ')}</script>');
}

/* ---------- Setup helpers (run from the editor) ---------- */
function setup_() {
  key_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'checkNew') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkNew').timeBased().everyMinutes(1).create();
  // Start fresh, so anyone already waiting gets one email now.
  props_().setProperty('NOTIFIED', '[]');
  Logger.log('Pending now: ' + listByStatus_('pending').length + '. Trigger set (every minute). Web app URL: ' + (webUrl_() || 'deploy the web app next'));
  if (webUrl_()) sendTest_();
}
function sendTest_() {
  if (!webUrl_()) throw new Error('Deploy the web app first (Deploy -> New deployment -> Web app).');
  MailApp.sendEmail({ to: admin_(), subject: 'PG Derma bot is connected', htmlBody: '<p>The approval bot is set up. You will get an email like this whenever someone signs in and waits for approval.</p><p><a href="' + dashLink_() + '">See all pending sign-ups</a></p>', name: 'PG Derma bot' });
  checkNew_();
}
function telegramSetup_() {
  var r = tg_('getUpdates', {});
  if (!r || !r.ok) throw new Error('Set TG_TOKEN in Script properties first (from @BotFather), then message your bot.');
  var m = (r.result || []).map(function (u) { return u.message || u.channel_post; }).filter(Boolean).pop();
  if (!m) throw new Error('Send any message to your bot in Telegram, then run this again.');
  props_().setProperty('TG_CHAT', String(m.chat.id));
  tg_('sendMessage', { chat_id: m.chat.id, text: '✅ PG Derma bot connected. New sign-ups will appear here with Approve / Reject buttons.' });
}

/* =====================================================================================
 * STUDY CONTENT BOT + DAILY STUDY REMINDERS
 * makeContent_()  — daily ~6 am IST: asks Gemini (free tier, key in Script property GEMINI_KEY) to draft
 *                  dermatology PG items (MCQs, flashcards, spot cases, one-liners) on a rotating topic.
 *                  Drafts are saved to Firestore content/{id} with status "draft" — nobody sees them until
 *                  the admin approves (email buttons or the app's Admin → Content tab).
 * nudge_()        — hourly: emails residents who switched on a reminder and haven't met today's goal.
 * Run setupStudy_() once from the editor after adding GEMINI_KEY.
 * ===================================================================================== */
var STUDY_TOPICS = [
  'Leprosy: classification, MDT, reactions', 'Psoriasis and psoriatic arthritis', 'Lichen planus and lichenoid disorders',
  'Pemphigus group', 'Pemphigoid group and dermatitis herpetiformis', 'Dermatophytoses and Indian recalcitrant tinea',
  'Superficial and deep fungal infections', 'Bacterial and mycobacterial (non-leprosy) skin infections', 'Viral infections of skin',
  'Scabies, pediculosis and arthropod reactions', 'Syphilis', 'Chancroid, donovanosis, LGV, genital herpes and HIV dermatology',
  'Cutaneous adverse drug reactions (SJS/TEN, DRESS, FDE, AGEP)', 'Acne, rosacea and hidradenitis', 'Vitiligo and hypopigmentary disorders',
  'Melasma and hyperpigmentary disorders', 'Atopic, contact and other eczemas', 'Urticaria and angioedema', 'Hair disorders',
  'Nail disorders', 'Lupus erythematosus, dermatomyositis and scleroderma', 'Vasculitis and neutrophilic dermatoses',
  'Panniculitis and granulomatous disorders (sarcoidosis, granuloma annulare)', 'Genodermatoses and ichthyoses', 'Pediatric dermatology',
  'Benign and malignant skin tumours (BCC, SCC, melanoma)', 'Cutaneous lymphoma and mastocytosis', 'Nutritional and metabolic dermatoses, porphyrias',
  'Dermatopathology basics and special stains', 'Dermatosurgery, lasers, peels and cosmetology', 'Phototherapy and systemic therapy (MTX, cyclosporine, biologics, JAK inhibitors)',
  'Pregnancy dermatoses and oral mucosal diseases'
];

/* ---- Firestore value <-> JS ---- */
function toFs_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs_) } };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'object') { var f = {}; Object.keys(v).forEach(function (k) { f[k] = toFs_(v[k]); }); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
function fromFs_(x) {
  if (!x) return null;
  if ('stringValue' in x) return x.stringValue; if ('integerValue' in x) return +x.integerValue; if ('doubleValue' in x) return x.doubleValue;
  if ('booleanValue' in x) return x.booleanValue; if ('timestampValue' in x) return x.timestampValue; if ('nullValue' in x) return null;
  if ('arrayValue' in x) return (x.arrayValue.values || []).map(fromFs_);
  if ('mapValue' in x) { var o = {}; var f = x.mapValue.fields || {}; Object.keys(f).forEach(function (k) { o[k] = fromFs_(f[k]); }); return o; }
  return null;
}
function docObj_(doc) { var o = { id: doc.name.split('/').pop() }; var f = doc.fields || {}; Object.keys(f).forEach(function (k) { o[k] = fromFs_(f[k]); }); return o; }
function query_(coll, field, op, value, limit) {
  var q = { structuredQuery: { from: [{ collectionId: coll }], limit: limit || 300 } };
  if (field) q.structuredQuery.where = { fieldFilter: { field: { fieldPath: field }, op: op, value: toFs_(value) } };
  return (fs_('post', ':runQuery', q) || []).filter(function (x) { return x.document; }).map(function (x) { return docObj_(x.document); });
}

/* ---- Gemini ---- */
function gemini_(prompt) {
  var key = props_().getProperty('GEMINI_KEY'); if (!key) throw new Error('Add Script property GEMINI_KEY (free key from aistudio.google.com).');
  var call = function (m) {
    return UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-goog-api-key': key },
      payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } }) });
  };
  // Try the model that worked last time, then every other text "flash" model (newest first) until one is free and answers.
  var first = props_().getProperty('GEMINI_MODEL') || 'gemini-2.5-flash', tried = [], r = null, lastErr = '', busy = {};
  var list = null, candidates = function () {
    if (!list) {
      var j = JSON.parse(UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true }).getContentText());
      var num = function (n) { var m = n.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
      list = (j.models || []).filter(function (m) { return /flash/.test(m.name) && !/preview|exp|image|tts|live|audio|thinking|embed/.test(m.name) && (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; })
        .map(function (m) { return m.name.replace('models/', ''); })
        .sort(function (a, b) { return (num(b) - num(a)) || ((/lite/.test(a) ? 1 : 0) - (/lite/.test(b) ? 1 : 0)) || a.length - b.length; });
    }
    return list;
  };
  var queue = [first];
  while (queue.length && tried.length < 8) {
    var m = queue.shift(); if (tried.indexOf(m) >= 0) continue; tried.push(m);
    r = call(m); var code = r.getResponseCode();
    if (code < 300) { props_().setProperty('GEMINI_MODEL', m); var j2 = JSON.parse(r.getContentText()), t = (((j2.candidates || [])[0] || {}).content || {}).parts; return { model: m, text: (t || []).map(function (p) { return p.text || ''; }).join('') }; }
    lastErr = m + ' → ' + code + ': ' + r.getContentText().slice(0, 200);
    if (code >= 500 && tried.filter(function (x) { return x === m; }).length === 1 && !busy[m]) { busy[m] = 1; Utilities.sleep(4000); tried.pop(); queue.unshift(m); continue; } // busy: retry once
    if (code === 404 || code === 429 || code === 403 || code === 400 || code >= 500) { if (!queue.length) queue = candidates().filter(function (x) { return tried.indexOf(x) < 0; }); continue; }
    break;
  }
  throw new Error('Gemini: no free model answered. Last: ' + lastErr);
}
function clip_(s, n) { s = String(s == null ? '' : s).trim(); return s.length > n ? s.slice(0, n) : s; }
function cleanItem_(x, topic) {
  if (!x || typeof x !== 'object') return null;
  var o = { t: x.t, top: clip_(x.top || topic.split(':')[0], 40) };
  if (x.t === 'mcq') {
    o.q = clip_(x.q, 600); o.o = (x.o || []).map(function (s) { return clip_(s, 200); }).filter(String).slice(0, 5); o.a = parseInt(x.a, 10); o.x = clip_(x.x, 900); o.r = clip_(x.r, 160);
    if (!o.q || o.o.length < 4 || !(o.a >= 0 && o.a < o.o.length) || !o.x) return null;
  } else if (x.t === 'card') { o.f = clip_(x.f, 300); o.b = clip_(x.b, 1200); if (!o.f || !o.b) return null; }
  else if (x.t === 'spot') { o.v = clip_(x.v, 900); o.dx = clip_(x.dx, 200); o.x = clip_(x.x, 900); if (!o.v || !o.dx) return null; }
  else if (x.t === 'pearl') { o.p = clip_(x.p, 400); if (!o.p) return null; }
  else return null;
  return o;
}

function makeContent_(topicOverride) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return;
  try {
    var day = Math.floor(Date.now() / 864e5), topic = (typeof topicOverride === 'string' && topicOverride) || STUDY_TOPICS[day % STUDY_TOPICS.length];
    var recent = query_('content', null, null, null, 300).filter(function (c) { return c.top && topic.toLowerCase().indexOf(String(c.top).toLowerCase().split(' ')[0]) >= 0; })
      .map(function (c) { return c.q || c.f || c.p || c.dx || ''; }).slice(-40);
    var prompt = 'You are a senior dermatology professor in India writing revision material for MD Dermatology, Venereology & Leprosy residents ' +
      '(university theory exams and the national exit exam). Topic today: "' + topic + '".\n' +
      'Write 5 MCQs, 4 flashcards, 2 spot-diagnosis clinical vignettes and 5 high-yield one-liners.\n' +
      'Rules: only well-established facts found in Rook\'s Textbook of Dermatology, Fitzpatrick\'s Dermatology, Bolognia, IADVL Textbook or current WHO/NACO/BAD/AAD guidelines; ' +
      'no controversial or uncertain claims; Indian clinical context where relevant (skin of colour, common Indian presentations, Indian guidelines); ' +
      'one unambiguous correct option per MCQ with 4 options; explanations 2–4 sentences saying why the answer is right and the key distractor is wrong; ' +
      'give a short reference area in "r" (e.g. "Rook — Pemphigus"); no patient names; British spelling; plain text only, no markdown.\n' +
      (recent.length ? 'Do NOT repeat these existing items: ' + JSON.stringify(recent) + '\n' : '') +
      'Return JSON exactly as {"items":[{"t":"mcq","top":"<short topic>","q":"","o":["","","",""],"a":0,"x":"","r":""},{"t":"card","top":"","f":"<front>","b":"<back, may use \\n>"},' +
      '{"t":"spot","top":"","v":"<vignette>","dx":"<diagnosis>","x":"<why + next step>"},{"t":"pearl","top":"","p":"<one line>"}]}';
    var g = gemini_(prompt), parsed;
    try { parsed = JSON.parse(g.text); } catch (e) { var m = g.text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { items: [] }; }
    var tag = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd-HHmm'), saved = [];
    (parsed.items || []).slice(0, 24).forEach(function (raw) {
      var o = cleanItem_(raw, topic); if (!o) return;
      o.status = 'draft'; o.src = 'ai'; o.model = g.model; o.tag = tag; o.topic = topic; o.createdAt = new Date();
      var f = {}; Object.keys(o).forEach(function (k) { f[k] = toFs_(o[k]); });
      var d = fs_('post', '/content', { fields: f }); o.id = d.name.split('/').pop(); saved.push(o);
    });
    if (saved.length) emailDrafts_(saved, topic, tag);
    Logger.log('Drafted ' + saved.length + ' items on ' + topic + ' with ' + g.model);
    return saved.length;
  } finally { lock.releaseLock(); }
}

function itemHtml_(o) {
  var b = '';
  if (o.t === 'mcq') b = '<b>' + esc_(o.q) + '</b><ol type="A" style="margin:6px 0">' + o.o.map(function (x, i) { return '<li' + (i === o.a ? ' style="color:#1a7f4b;font-weight:600"' : '') + '>' + esc_(x) + '</li>'; }).join('') + '</ol><div style="color:#444">' + esc_(o.x) + '</div><div style="color:#888;font-size:12px">' + esc_(o.r || '') + '</div>';
  else if (o.t === 'card') b = '<b>' + esc_(o.f) + '</b><div style="white-space:pre-line;color:#444;margin-top:4px">' + esc_(o.b) + '</div>';
  else if (o.t === 'spot') b = '<div>' + esc_(o.v) + '</div><b style="display:block;margin-top:4px">→ ' + esc_(o.dx) + '</b><div style="color:#444">' + esc_(o.x || '') + '</div>';
  else b = '<div>' + esc_(o.p) + '</div>';
  return b;
}
function emailDrafts_(items, topic, tag) {
  var btn = function (href, label, bg) { return '<a href="' + href + '" style="display:inline-block;padding:6px 12px;margin:6px 6px 0 0;border-radius:8px;background:' + bg + ';color:#fff;text-decoration:none;font-weight:600;font-size:13px">' + label + '</a>'; };
  var names = { mcq: 'MCQ', card: 'Flashcard', spot: 'Spot diagnosis', pearl: 'One-liner' };
  var rows = items.map(function (o) {
    return '<div style="border:1px solid #e3e3e3;border-radius:10px;padding:10px 12px;margin:10px 0"><div style="font-size:11px;color:#0f766e;font-weight:700;text-transform:uppercase">' + names[o.t] + ' · ' + esc_(o.top) + '</div>' + itemHtml_(o) +
      '<div>' + btn(link_(o.id, 'capprove'), '✓ Publish', '#1a7f4b') + btn(link_(o.id, 'creject'), '✕ Discard', '#b3261e') + '</div></div>';
  }).join('');
  var html = '<div style="font-family:Arial,sans-serif;max-width:600px"><p><b>' + items.length + ' new study items</b> drafted on <b>' + esc_(topic) + '</b>. Check each for accuracy — nothing is shown to residents until you publish it.</p>' +
    btn(link_(tag, 'capproveall'), '✓ Publish all ' + items.length, '#0f766e') + rows +
    '<p style="color:#777;font-size:12px">You can also edit before publishing in the app: <a href="' + APP_URL + '#/admin?t=content">Admin → Content</a>. AI drafts can contain errors.</p></div>';
  MailApp.sendEmail({ to: admin_(), subject: 'PG Derma: ' + items.length + ' study items to review — ' + topic, htmlBody: html, name: 'PG Derma bot' });
}
function cdecide(id, act, s) {
  if (['capprove', 'creject', 'capproveall'].indexOf(act) < 0 || !eq_(String(s), sig_(String(id), act))) throw new Error('Link not valid');
  var publish = function (docId) { fs_('patch', '/content/' + encodeURIComponent(docId) + '?updateMask.fieldPaths=status&updateMask.fieldPaths=approvedAt&currentDocument.exists=true', { fields: { status: { stringValue: 'live' }, approvedAt: { timestampValue: new Date().toISOString() } } }); };
  if (act === 'capproveall') { var list = query_('content', 'tag', 'EQUAL', id).filter(function (c) { return c.status === 'draft'; }); list.forEach(function (c) { publish(c.id); }); return '✓ Published ' + list.length + ' items. They appear in residents\' Study tab.'; }
  if (act === 'capprove') { publish(id); return '✓ Published. It appears in residents\' Study tab.'; }
  fs_('delete', '/content/' + encodeURIComponent(id)); return '✕ Discarded.';
}

/* ---- Daily study reminder emails ---- */
function nudge_() {
  var now = new Date(), hr = +Utilities.formatDate(now, 'Asia/Kolkata', 'H'), day = Utilities.formatDate(now, 'Asia/Kolkata', 'yyyy-MM-dd');
  var sent = JSON.parse(props_().getProperty('NUDGED') || '{}'); if (sent.day !== day) sent = { day: day, ids: [] };
  var people = query_('study', 'remind', 'EQUAL', true, 500);
  people.forEach(function (p) {
    if (+p.hour !== hr || p.last === day || !p.email || sent.ids.indexOf(p.id) >= 0) return;
    if (MailApp.getRemainingDailyQuota() < 5) return;
    var y = Utilities.formatDate(new Date(now.getTime() - 864e5), 'Asia/Kolkata', 'yyyy-MM-dd'), alive = p.last === y && p.streak > 0;
    var subj = alive ? '🔥 Keep your ' + p.streak + '-day streak — today\'s set is waiting' : 'Today\'s dermatology set is ready (' + (p.goal || 10) + ' quick items)';
    var html = '<div style="font-family:Arial,sans-serif;max-width:480px"><p>Hi ' + esc_((p.name || 'Doctor').split(' ')[0]) + ',</p><p>' +
      (alive ? 'You have a <b>' + p.streak + '-day streak</b>. A few minutes now keeps it alive.' : 'A short daily set of MCQs, flashcards and spot diagnoses — about 5 minutes.') + '</p>' +
      '<p><a href="' + APP_URL + '#/study" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#0f766e;color:#fff;text-decoration:none;font-weight:600">Open today\'s set</a></p>' +
      '<p style="color:#888;font-size:12px">You get this because you switched on a daily reminder in PG Derma → Study → Settings. Turn it off there anytime.</p></div>';
    try { MailApp.sendEmail({ to: p.email, subject: subj, htmlBody: html, name: 'PG Derma' }); sent.ids.push(p.id); } catch (e) { Logger.log('nudge failed ' + e); }
  });
  props_().setProperty('NUDGED', JSON.stringify(sent));
}

/* Re-send the review email for every draft still waiting (grouped by batch). */
function resendDrafts_() {
  var drafts = query_('content', 'status', 'EQUAL', 'draft', 500), groups = {};
  drafts.forEach(function (d) { (groups[d.tag] = groups[d.tag] || []).push(d); });
  Object.keys(groups).forEach(function (tag) { emailDrafts_(groups[tag], groups[tag][0].topic || groups[tag][0].top || 'Dermatology', tag); });
  return drafts.length;
}
function setupStudy_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (['makeContent', 'nudge'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('makeContent').timeBased().everyDays(1).atHour(6).create();
  ScriptApp.newTrigger('nudge').timeBased().everyHours(1).create();
  Logger.log('Study triggers set: makeContent daily ~6 am IST, nudge hourly.');
  if (props_().getProperty('GEMINI_KEY')) Logger.log('Drafted now: ' + makeContent_()); else Logger.log('Add GEMINI_KEY in Script properties, then run makeContent_() to test.');
}


/* =====================================================================================
 * PUSH NOTIFICATIONS — runs inside checkNew_() every minute.
 * Residents' apps write notifs/{id} (like, comment, follow, dm, call, vote). This sends each unread one to the
 * person's phones through Firebase Cloud Messaging (free), using the tokens their app saved in pushTokens/{uid}.
 * ===================================================================================== */
var PUSH_TXT = { refer: 'joined PG Derma with your invite', like: 'liked your post', comment: 'commented on your post', follow: 'started following you', dm: 'sent you a message', call: 'is calling you — open PG Derma', vote: 'answered your story' };
function pushUrl_(n) { return n.type === 'refer' ? '#/u/' + n.ref : n.type === 'dm' ? '#/dm/' + n.ref : n.type === 'follow' || n.type === 'call' ? '#/u/' + n.from : n.type === 'vote' ? '#/community' : '#/post/' + n.ref; }
function fcmSend_(token, data) {
  var r = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + PROJECT + '/messages:send', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ message: { token: token, data: data, webpush: { headers: { Urgency: 'high', TTL: '86400' } } } }) });
  return r.getResponseCode() === 200 ? 'ok' : (/UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/.test(r.getContentText()) ? 'gone' : 'err:' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 160));
}
function pushOut_() {
  var list = query_('notifs', 'pushed', 'EQUAL', false, 100); if (!list.length) return 0;
  var tokCache = {}, sent = 0;
  list.forEach(function (n) {
    var mark = function () { fs_('patch', '/notifs/' + encodeURIComponent(n.id) + '?updateMask.fieldPaths=pushed&currentDocument.exists=true', { fields: { pushed: { booleanValue: true } } }); };
    var age = Date.now() - Date.parse(n.at || 0);
    if (n.read || !n.to || !(age < 864e5)) { try { mark(); } catch (e) {} return; }
    if (!(n.to in tokCache)) { try { tokCache[n.to] = (docObj_(fs_('get', '/pushTokens/' + encodeURIComponent(n.to))).tokens || []); } catch (e) { tokCache[n.to] = []; } }
    var toks = tokCache[n.to], keep = [];
    var data = { title: String(n.fromName || 'PG Derma'), body: (PUSH_TXT[n.type] || '') + (n.text ? (n.type === 'call' ? '' : ': ' + n.text) : ''), url: APP_URL + pushUrl_(n), tag: n.type + ':' + (n.ref || n.from) };
    toks.forEach(function (t) { var res = fcmSend_(t, data); if (res !== 'gone') keep.push(t); if (res === 'ok') sent++; else if (res !== 'gone') Logger.log('FCM ' + res); });
    if (keep.length !== toks.length) { tokCache[n.to] = keep; try { fs_('patch', '/pushTokens/' + encodeURIComponent(n.to) + '?updateMask.fieldPaths=tokens', { fields: { tokens: toFs_(keep) } }); } catch (e) {} }
    try { mark(); } catch (e) {}
  });
  return sent;
}


/* =====================================================================================
 * JOURNAL DIGEST — new dermatology papers, summarised in our own words, with an openly licensed picture.
 * makeDigest_()  — daily ~7 am IST: searches PubMed for new reviews, trials, meta-analyses and guidelines in
 *                 dermatology journals (Indian journals included), reads each abstract, asks Gemini for an
 *                 ORIGINAL summary (never the abstract copied), and saves it to Firestore digest/{id}.
 *                 Status "draft" (admin publishes in the admin page → Journal digest), or "live" straight away
 *                 if the admin switched on Auto-publish there (config/digest.auto).
 * digestTick_()  — every minute (inside checkNew): writes posts the admin queued by PMID/DOI, and publishes
 *                 scheduled posts whose time has come.
 * Pictures: a figure from the paper ONLY when the paper is open access under a Creative Commons licence
 *           (checked with Europe PMC), otherwise an openly licensed illustrative image from Wikimedia Commons,
 *           otherwise none. Every picture keeps its credit, licence and source link.
 * Run setupDigest_() once from the editor.
 * ===================================================================================== */
var DIGEST_JOURNALS = ['J Am Acad Dermatol', 'Br J Dermatol', 'JAMA Dermatol', 'J Eur Acad Dermatol Venereol', 'J Invest Dermatol',
  'Am J Clin Dermatol', 'Clin Exp Dermatol', 'Indian J Dermatol Venereol Leprol', 'Indian Dermatol Online J', 'Indian J Dermatol',
  'Indian J Sex Transm Dis AIDS', 'Lepr Rev', 'Pediatr Dermatol', 'Dermatol Surg', 'J Cosmet Dermatol'];
var INDIAN_JOURNALS = /indian|lepr/i;
var EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
var EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/';
var COMMONS_OFF = false; // Wikimedia sometimes rate-limits Google's servers; then skip it for the rest of the run (admin can add a picture from the admin page)
var DIGEST_KEYS = ['status', 'kind', 'h', 's', 'k', 'w', 'lvl', 'top', 'j', 'au', 'yr', 'pmid', 'doi', 'url', 'pt', 'img', 'imgCap', 'imgCredit', 'imgLic', 'imgSrc', 'imgKind', 'src', 'model', 'createdAt', 'approvedAt', 'pubAt', 'err', 'by'];

function get_(url) {
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'PGDermaDigest/1.0 (non-commercial education)' } });
  if (r.getResponseCode() >= 300) throw new Error('HTTP ' + r.getResponseCode() + ' ' + url.split('?')[0]);
  return r.getContentText();
}
function untag_(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); })
    .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
function tagAll_(xml, tag) { var re = new RegExp('<' + tag + '(\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'g'), out = [], m; while ((m = re.exec(xml))) out.push({ attr: m[1] || '', body: m[2] }); return out; }
function tag1_(xml, tag) { var a = tagAll_(xml, tag); return a.length ? a[0].body : ''; }

/* ---- PubMed ---- */
function pubmedSearch_(term, days, max) {
  var u = EUTILS + 'esearch.fcgi?db=pubmed&retmode=json&sort=pub_date&retmax=' + (max || 40) + (days ? '&datetype=edat&reldate=' + days : '') + '&term=' + encodeURIComponent(term);
  return ((JSON.parse(get_(u)).esearchresult || {}).idlist || []).map(String);
}
function pubmedFetch_(pmids) {
  if (!pmids.length) return [];
  var xml = get_(EUTILS + 'efetch.fcgi?db=pubmed&retmode=xml&id=' + pmids.join(','));
  return tagAll_(xml, 'PubmedArticle').map(function (a) {
    var x = a.body, ids = {};
    tagAll_(tag1_(x, 'ArticleIdList'), 'ArticleId').forEach(function (i) { var t = (i.attr.match(/IdType="([^"]+)"/) || [])[1]; if (t) ids[t] = untag_(i.body); });
    var abs = tagAll_(x, 'AbstractText').map(function (p) { var l = (p.attr.match(/Label="([^"]+)"/) || [])[1]; return (l ? l + ': ' : '') + untag_(p.body); }).join('\n');
    var authors = tagAll_(x, 'Author').map(function (au) { var ln = untag_(tag1_(au.body, 'LastName')), ini = untag_(tag1_(au.body, 'Initials')); return ln ? ln + (ini ? ' ' + ini : '') : untag_(tag1_(au.body, 'CollectiveName')); }).filter(String);
    var ji = tag1_(x, 'JournalIssue'), yr = untag_(tag1_(tag1_(ji, 'PubDate'), 'Year')) || (untag_(tag1_(tag1_(ji, 'PubDate'), 'MedlineDate')).match(/\d{4}/) || [''])[0];
    return { pmid: untag_(tag1_(x, 'PMID')), title: untag_(tag1_(x, 'ArticleTitle')), abs: abs, j: untag_(tag1_(x, 'ISOAbbreviation')) || untag_(tag1_(x, 'Title')),
      yr: yr, au: authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : ''), doi: ids.doi || '', pmc: ids.pmc || '',
      pt: tagAll_(x, 'PublicationType').map(function (p) { return untag_(p.body); }).filter(function (t) { return t !== 'Journal Article'; }).slice(0, 4) };
  }).filter(function (a) { return a.pmid && a.title; });
}

/* ---- Pictures: open-licence only ---- */
function paperFigure_(pmc) {
  if (!pmc) return null;
  var r = (JSON.parse(get_(EPMC + 'search?format=json&resultType=core&query=' + encodeURIComponent('PMCID:' + pmc))).resultList || {}).result || [];
  var lic = String((r[0] || {}).license || '').toLowerCase();
  if (!/^cc/.test(lic)) return null; // not openly licensed → never reuse its figures
  var xml = get_(EPMC + pmc + '/fullTextXML'), figs = tagAll_(xml, 'fig');
  for (var i = 0; i < figs.length; i++) {
    var href = (figs[i].body.match(/<graphic[^>]*xlink:href="([^"]+)"/) || [])[1]; if (!href) continue;
    var label = untag_(tag1_(figs[i].body, 'label')), cap = untag_(tag1_(figs[i].body, 'caption'));
    return { img: 'https://europepmc.org/articles/' + pmc + '/bin/' + href + (/\.(jpe?g|png|gif)$/i.test(href) ? '' : '.jpg'),
      imgCap: clip_((label ? label + '. ' : '') + cap, 300), imgLic: lic.toUpperCase(),
      imgSrc: 'https://europepmc.org/article/PMC/' + pmc.replace(/^PMC/, ''), imgKind: 'paper' };
  }
  return null;
}
function commonsImage_(q) {
  if (!q) return null;
  var u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=900&gsrsearch=' + encodeURIComponent(q + ' skin filetype:bitmap');
  var pages = (JSON.parse(get_(u)).query || {}).pages || {};
  var list = Object.keys(pages).map(function (k) { return pages[k]; }).sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
  for (var i = 0; i < list.length; i++) {
    var ii = (list[i].imageinfo || [])[0]; if (!ii) continue; var md = ii.extmetadata || {}, v = function (k) { return untag_((md[k] || {}).value || ''); };
    var lic = v('LicenseShortName');
    if (!/^(CC|Public domain|PD)/i.test(lic)) continue; // openly licensed only
    return { img: ii.thumburl || ii.url, imgCap: clip_(v('ImageDescription') || String(list[i].title || '').replace(/^File:/, ''), 300), imgCredit: clip_(v('Artist') || v('Credit') || 'Wikimedia Commons', 160),
      imgLic: clip_(lic, 60), imgSrc: ii.descriptionurl || '', imgKind: 'illustrative' };
  }
  return null;
}

/* ---- Writing one post ---- */
function digestPrompt_(a) {
  return 'You write a short "journal watch" post for Indian MD Dermatology, Venereology & Leprosy residents.\n' +
    'Use ONLY the facts in this PubMed record. Never add facts, numbers or claims that are not in it. Copy every number exactly as given.\n' +
    'Write in your OWN words — do not copy sentences from the abstract. British spelling, plain text, no markdown.\n' +
    'Title: ' + a.title + '\nJournal: ' + a.j + ' (' + a.yr + ')\nPublication type: ' + (a.pt.join(', ') || 'Article') + '\nAbstract:\n' + clip_(a.abs, 6000) + '\n\n' +
    'Return JSON exactly as {"ok":true,"h":"<headline, max 90 characters>","s":"<summary, 60-110 words: question, how it was studied, main findings>",' +
    '"k":["<3 or 4 key points, each one sentence>"],"w":"<1-2 sentences: what this means for a dermatology resident in India; say \'early evidence\' if it is preliminary>",' +
    '"lvl":"<study design, e.g. Randomised controlled trial, Systematic review and meta-analysis, Guideline, Narrative review, Cohort study>",' +
    '"top":"<main topic in 1-3 words, e.g. Psoriasis>","img":"<the main skin disease in 1-3 English words, for an image search, or empty if none>"}\n' +
    'Set "ok":false if the record has no real abstract or is not useful for clinical dermatology training (e.g. purely molecular mouse work, errata, editorials).';
}
function writeDigest_(a, by) {
  var g = gemini_(digestPrompt_(a)), o;
  try { o = JSON.parse(g.text); } catch (e) { var m = g.text.match(/\{[\s\S]*\}/); o = m ? JSON.parse(m[0]) : null; }
  if (!o || o.ok === false || !o.h || !o.s) return null;
  var post = { kind: 'journal', h: clip_(o.h, 120), s: clip_(o.s, 1200), k: (o.k || []).map(function (x) { return clip_(x, 300); }).filter(String).slice(0, 5), w: clip_(o.w, 500),
    lvl: clip_(o.lvl, 60), top: clip_(o.top || 'Dermatology', 40), j: clip_(a.j, 120), au: clip_(a.au, 160), yr: clip_(a.yr, 4), pmid: a.pmid, doi: clip_(a.doi, 120),
    url: a.doi ? 'https://doi.org/' + a.doi : 'https://pubmed.ncbi.nlm.nih.gov/' + a.pmid + '/', pt: a.pt, src: 'ai', model: g.model, by: by || 'bot' };
  var pic = null;
  try { pic = paperFigure_(a.pmc); if (pic) pic.imgCredit = clip_(a.au + ', ' + a.j + ' ' + a.yr, 160); } catch (e) { Logger.log('figure: ' + e); }
  if (!pic && !COMMONS_OFF) { try { pic = commonsImage_(clip_(o.img, 40)); } catch (e) { Logger.log('commons: ' + e); if (/429|403/.test(String(e))) COMMONS_OFF = true; } }
  if (pic) Object.keys(pic).forEach(function (k) { post[k] = pic[k]; });
  return post;
}
function digestFields_(o) { var f = {}; Object.keys(o).forEach(function (k) { if (DIGEST_KEYS.indexOf(k) >= 0 && o[k] !== undefined && o[k] !== '') f[k] = toFs_(o[k]); }); return f; }
function digestCfg_() { try { return docObj_(fs_('get', '/config/digest')); } catch (e) { return {}; } }

function makeDigest_(maxOverride) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return 0;
  try {
    var cfg = digestCfg_(), want = Math.max(1, Math.min(6, +(maxOverride || cfg.perDay || props_().getProperty('DIGEST_PER_DAY') || 3)));
    var have = {}; query_('digest', null, null, null, 1000).forEach(function (d) { if (d.pmid) have[d.pmid] = 1; });
    var term = '(' + DIGEST_JOURNALS.map(function (j) { return '"' + j + '"[ta]'; }).join(' OR ') + ') AND (Review[pt] OR Systematic Review[pt] OR Meta-Analysis[pt] OR Randomized Controlled Trial[pt] OR Guideline[pt] OR Practice Guideline[pt] OR Clinical Trial[pt]) AND hasabstract[text] AND english[la]';
    var ids = pubmedSearch_(term, 21, 60).filter(function (id) { return !have[id]; });
    var arts = pubmedFetch_(ids.slice(0, 30));
    // one Indian paper first when available, then the rest, newest first
    arts.sort(function (x, y) { return (INDIAN_JOURNALS.test(y.j) ? 1 : 0) - (INDIAN_JOURNALS.test(x.j) ? 1 : 0); });
    var auto = cfg.auto === true, saved = [], t0 = Date.now();
    for (var i = 0; i < arts.length && saved.length < want && Date.now() - t0 < 240000; i++) {
      var p; try { p = writeDigest_(arts[i]); } catch (e) { Logger.log('digest write ' + arts[i].pmid + ': ' + e); if (/no free model/.test(String(e))) break; continue; }
      if (!p) continue;
      p.status = auto ? 'live' : 'draft'; p.createdAt = new Date(); if (auto) p.approvedAt = new Date();
      var d = fs_('post', '/digest', { fields: digestFields_(p) }); p.id = d.name.split('/').pop(); saved.push(p);
    }
    if (saved.length) emailDigest_(saved, auto);
    Logger.log('Journal digest: ' + saved.length + ' post(s), auto-publish ' + auto);
    return saved.length;
  } finally { lock.releaseLock(); }
}
function emailDigest_(posts, auto) {
  var rows = posts.map(function (p) {
    return '<div style="border:1px solid #e3e3e3;border-radius:10px;padding:10px 12px;margin:10px 0">' + (p.img ? '<img src="' + esc_(p.img) + '" style="max-width:100%;max-height:200px;border-radius:8px" alt="">' : '') +
      '<div style="font-size:11px;color:#0f766e;font-weight:700;text-transform:uppercase">' + esc_(p.lvl) + ' · ' + esc_(p.top) + '</div><b>' + esc_(p.h) + '</b><div style="color:#444;margin-top:4px">' + esc_(p.s) + '</div>' +
      '<div style="color:#888;font-size:12px">' + esc_(p.j + ' ' + p.yr) + ' · <a href="' + esc_(p.url) + '">paper</a>' + (p.imgLic ? ' · image ' + esc_(p.imgLic) : '') + '</div></div>';
  }).join('');
  MailApp.sendEmail({ to: admin_(), subject: 'PG Derma journal digest: ' + posts.length + (auto ? ' new post(s) published' : ' post(s) to review'), name: 'PG Derma bot',
    htmlBody: '<div style="font-family:Arial,sans-serif;max-width:600px"><p>' + (auto ? 'Auto-publish is on, so these are already live.' : 'Check each against the paper, then publish in the admin page.') + '</p>' +
      '<p><a href="' + APP_URL + 'admin.html#digest" style="display:inline-block;padding:8px 14px;border-radius:8px;background:#0f766e;color:#fff;text-decoration:none;font-weight:600">Open Journal digest</a></p>' + rows +
      '<p style="color:#777;font-size:12px">AI summaries can contain errors — the paper is the source of truth.</p></div>' });
}

/* Posts queued from the admin page (PMID or DOI), and scheduled posts that are due. Runs every minute. */
function digestTick_() {
  var queued = query_('digest', 'status', 'EQUAL', 'queued', 3);
  queued.forEach(function (q) {
    var patch = function (o) { fs_('patch', '/digest/' + encodeURIComponent(q.id) + '?' + Object.keys(o).map(function (k) { return 'updateMask.fieldPaths=' + k; }).join('&') + '&currentDocument.exists=true', { fields: digestFields_(o) }); };
    try {
      var pmid = String(q.pmid || '').replace(/\D/g, '');
      if (!pmid && q.doi) pmid = (pubmedSearch_('"' + String(q.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//, '') + '"[doi]', 0, 1)[0]) || '';
      if (!pmid) return patch({ status: 'failed', err: 'Not found in PubMed. Check the PMID/DOI, or write the post yourself.' });
      var a = pubmedFetch_([pmid])[0]; if (!a) return patch({ status: 'failed', err: 'PubMed returned nothing for PMID ' + pmid });
      if (!a.abs) return patch({ status: 'failed', pmid: pmid, err: 'This paper has no abstract in PubMed, so the bot cannot summarise it safely.' });
      var p = writeDigest_(a, q.by || 'admin'); if (!p) return patch({ status: 'failed', pmid: pmid, err: 'The AI judged it not useful for residents or could not summarise it. Write it yourself if you still want it.' });
      p.status = 'draft'; p.err = ''; patch(p);
    } catch (e) { try { patch({ status: 'failed', err: clip_(String(e.message || e), 300) }); } catch (e2) {} }
  });
  var now = Date.now();
  query_('digest', 'status', 'EQUAL', 'scheduled', 50).forEach(function (d) {
    if (d.pubAt && Date.parse(d.pubAt) <= now) fs_('patch', '/digest/' + encodeURIComponent(d.id) + '?updateMask.fieldPaths=status&updateMask.fieldPaths=approvedAt&currentDocument.exists=true', { fields: { status: { stringValue: 'live' }, approvedAt: { timestampValue: new Date().toISOString() } } });
  });
}
function setupDigest_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'makeDigest') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('makeDigest').timeBased().everyDays(1).atHour(7).create();
  Logger.log('Journal digest trigger set: daily ~7 am IST. Drafted now: ' + makeDigest_());
}

/* ---------- Owner-only guard ----------
 * The web app runs as the admin for anonymous visitors, and HtmlService pages expose every
 * global function without a trailing "_" to google.script.run. So each public entry point
 * (editor buttons + time triggers) checks it is really the owner or a real project trigger.
 * Only doGet, decide and cdecide are meant for visitors (decide/cdecide check an HMAC). */
function owner_(e) {
  var me = Session.getEffectiveUser().getEmail(), who = '';
  try { who = Session.getActiveUser().getEmail(); } catch (x) {}
  if (who && who === me) return;
  if (e && typeof e === 'object' && e.triggerUid) {
    var id = String(e.triggerUid);
    if (ScriptApp.getProjectTriggers().some(function (t) { return t.getUniqueId() === id; })) return;
  }
  throw new Error('Not allowed');
}
function checkNew(e) { owner_(e); return checkNew_.apply(null, arguments); }
function setup(e) { owner_(e); return setup_.apply(null, arguments); }
function sendTest(e) { owner_(e); return sendTest_.apply(null, arguments); }
function telegramSetup(e) { owner_(e); return telegramSetup_.apply(null, arguments); }
function makeContent(e) { owner_(e); return makeContent_.apply(null, arguments); }
function nudge(e) { owner_(e); return nudge_.apply(null, arguments); }
function resendDrafts(e) { owner_(e); return resendDrafts_.apply(null, arguments); }
function setupStudy(e) { owner_(e); return setupStudy_.apply(null, arguments); }
function pushOut(e) { owner_(e); return pushOut_.apply(null, arguments); }
function makeDigest(e) { owner_(e); return makeDigest_.apply(null, arguments); }
function digestTick(e) { owner_(e); return digestTick_.apply(null, arguments); }
function setupDigest(e) { owner_(e); return setupDigest_.apply(null, arguments); }
