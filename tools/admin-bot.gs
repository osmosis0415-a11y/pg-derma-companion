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

/* ---------- Setup helpers (run from the editor) ---------- */
function setup() {
  key_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'checkNew') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkNew').timeBased().everyMinutes(1).create();
  // Start fresh, so anyone already waiting gets one email now.
  props_().setProperty('NOTIFIED', '[]');
  Logger.log('Pending now: ' + listByStatus_('pending').length + '. Trigger set (every minute). Web app URL: ' + (webUrl_() || 'deploy the web app next'));
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
