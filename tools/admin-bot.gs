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
 *   1. Run setup() from the editor and click Allow. It creates the 1-minute trigger and a secret link key.
 *   2. Deploy -> New deployment -> Web app -> Execute as: Me, Who has access: Anyone. Then run sendTest().
 *   Optional Telegram: Script properties TG_TOKEN = <token from @BotFather>; send any message to your bot,
 *   then run telegramSetup() to capture your chat id.
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
function webUrl_() { return ScriptApp.getService().getUrl() || ''; }
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
function checkNew() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return;
  try {
    var seen = JSON.parse(props_().getProperty('NOTIFIED') || '[]');
    var pending = listByStatus_('pending');
    var fresh = pending.filter(function (p) { return seen.indexOf(p.uid) < 0; });
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
function setup() {
  key_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'checkNew') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkNew').timeBased().everyMinutes(1).create();
  // Start fresh, so anyone already waiting gets one email now.
  props_().setProperty('NOTIFIED', '[]');
  Logger.log('Pending now: ' + listByStatus_('pending').length + '. Trigger set (every minute). Web app URL: ' + (webUrl_() || 'deploy the web app next'));
  if (webUrl_()) sendTest();
}
function sendTest() {
  if (!webUrl_()) throw new Error('Deploy the web app first (Deploy -> New deployment -> Web app).');
  MailApp.sendEmail({ to: admin_(), subject: 'PG Derma bot is connected', htmlBody: '<p>The approval bot is set up. You will get an email like this whenever someone signs in and waits for approval.</p><p><a href="' + dashLink_() + '">See all pending sign-ups</a></p>', name: 'PG Derma bot' });
  checkNew();
}
function telegramSetup() {
  var r = tg_('getUpdates', {});
  if (!r || !r.ok) throw new Error('Set TG_TOKEN in Script properties first (from @BotFather), then message your bot.');
  var m = (r.result || []).map(function (u) { return u.message || u.channel_post; }).filter(Boolean).pop();
  if (!m) throw new Error('Send any message to your bot in Telegram, then run this again.');
  props_().setProperty('TG_CHAT', String(m.chat.id));
  tg_('sendMessage', { chat_id: m.chat.id, text: '✅ PG Derma bot connected. New sign-ups will appear here with Approve / Reject buttons.' });
}

/* =====================================================================================
 * STUDY CONTENT BOT + DAILY STUDY REMINDERS
 * makeContent()  — daily ~6 am IST: asks Gemini (free tier, key in Script property GEMINI_KEY) to draft
 *                  dermatology PG items (MCQs, flashcards, spot cases, one-liners) on a rotating topic.
 *                  Drafts are saved to Firestore content/{id} with status "draft" — nobody sees them until
 *                  the admin approves (email buttons or the app's Admin → Content tab).
 * nudge()        — hourly: emails residents who switched on a reminder and haven't met today's goal.
 * Run setupStudy() once from the editor after adding GEMINI_KEY.
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
  var model = props_().getProperty('GEMINI_MODEL') || 'gemini-2.5-flash';
  var call = function (m) {
    return UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-goog-api-key': key },
      payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } }) });
  };
  var r = call(model);
  if (r.getResponseCode() === 404) { // model retired — pick the newest stable "flash" model that can generate content
    var list = JSON.parse(UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true }).getContentText()).models || [];
    var pick = list.filter(function (m) { return /flash/.test(m.name) && !/lite|preview|exp|image|tts|live|audio/.test(m.name) && (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; }).map(function (m) { return m.name.replace('models/', ''); }).sort().pop();
    if (!pick) throw new Error('No Gemini flash model available');
    props_().setProperty('GEMINI_MODEL', pick); model = pick; r = call(pick);
  }
  if (r.getResponseCode() >= 300) throw new Error('Gemini ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
  var j = JSON.parse(r.getContentText()), t = (((j.candidates || [])[0] || {}).content || {}).parts;
  return { model: model, text: (t || []).map(function (p) { return p.text || ''; }).join('') };
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

function makeContent(topicOverride) {
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
function nudge() {
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

function setupStudy() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (['makeContent', 'nudge'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('makeContent').timeBased().everyDays(1).atHour(6).create();
  ScriptApp.newTrigger('nudge').timeBased().everyHours(1).create();
  Logger.log('Study triggers set: makeContent daily ~6 am IST, nudge hourly.');
  if (props_().getProperty('GEMINI_KEY')) Logger.log('Drafted now: ' + makeContent()); else Logger.log('Add GEMINI_KEY in Script properties, then run makeContent() to test.');
}
