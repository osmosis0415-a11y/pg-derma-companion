/**
 * PG Derma Companion — Google Drive token helper (Google Apps Script web app).
 *
 * Why: browsers only get 1-hour Google Drive access. Exchanging the sign-in code for a
 * long-lived *refresh token* needs the OAuth client secret, which must never live in the web app.
 * This tiny helper keeps the secret in Script Properties and does only two things:
 *   exchange: authorization code  -> access token (+ refresh token)
 *   refresh:  refresh token        -> new access token
 * It stores nothing, logs nothing and never sees any Drive data.
 *
 * Setup: Project Settings -> Script properties:
 *   CLIENT_ID     = <OAuth web client id>
 *   CLIENT_SECRET = <OAuth web client secret>
 * Deploy -> New deployment -> Web app -> Execute as: Me, Who has access: Anyone.
 *
 * Calls (optional): also hands out short-lived Cloudflare TURN relay passes so batch calls connect
 * across any network. Only signed-in, admin-approved app users get one (checked with their Firebase
 * ID token) whom the admin has also allowed to call. Script properties:
 *   TURN_KEY_ID     = <Cloudflare Realtime TURN key ID>
 *   TURN_API_TOKEN  = <that key's API token>
 *   (or, card-free: TURN_URLS = relay address(es), TURN_USERNAME, TURN_PASSWORD from e.g. ExpressTURN)
 *   FIREBASE_API_KEY, FIREBASE_PROJECT = the web app's public Firebase config values
 */
function turnPass_(b, p) {
  var keyId = p.getProperty('TURN_KEY_ID'), tok = p.getProperty('TURN_API_TOKEN');
  // Card-free alternative (e.g. ExpressTURN free 1 TB/month): a fixed relay login, handed only to approved users.
  var sUrls = p.getProperty('TURN_URLS'), sUser = p.getProperty('TURN_USERNAME'), sPass = p.getProperty('TURN_PASSWORD');
  if ((!keyId || !tok) && !(sUrls && sUser && sPass)) return { error: 'turn_not_configured' };
  var apiKey = p.getProperty('FIREBASE_API_KEY'), proj = p.getProperty('FIREBASE_PROJECT');
  if (typeof b.idToken !== 'string' || b.idToken.length > 4000) return { error: 'bad_request' };
  // 1. Is this a real, signed-in user of our Firebase project?
  var lr = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(apiKey),
    { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: b.idToken }), muteHttpExceptions: true });
  var u = (JSON.parse(lr.getContentText()).users || [])[0];
  if (!u || !u.emailVerified) return { error: 'not_signed_in' };
  // 2. Has the admin approved them? (Read their own approval record with their own token.)
  var ar = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + proj + '/databases/(default)/documents/approvals/' + encodeURIComponent(u.localId),
    { headers: { Authorization: 'Bearer ' + b.idToken }, muteHttpExceptions: true });
  var ad = JSON.parse(ar.getContentText()), st = ad.fields && ad.fields.status && ad.fields.status.stringValue;
  var calls = ad.fields && ad.fields.calls && ad.fields.calls.booleanValue === true;
  var isAdmin = String(u.email || '').toLowerCase() === 'sriramdeverashetty@gmail.com';
  if (!isAdmin && (st !== 'approved' || !calls)) return { error: 'calls_not_allowed' };
  // 3a. Fixed relay login (card-free providers).
  if (sUrls && sUser && sPass && (!keyId || !tok)) {
    var urls = sUrls.split(/[\s,]+/).filter(String).map(function (x) { return /^turns?:/.test(x) ? x : 'turn:' + x; });
    return { iceServers: [{ urls: urls, username: sUser, credential: sPass }], ttl: 21600 };
  }
  // 3b. Cloudflare: mint a 6-hour relay pass.
  var cr = UrlFetchApp.fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + keyId + '/credentials/generate-ice-servers',
    { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + tok }, payload: JSON.stringify({ ttl: 21600 }), muteHttpExceptions: true });
  if (cr.getResponseCode() >= 300) return { error: 'turn_error', code: cr.getResponseCode() };
  var j = JSON.parse(cr.getContentText()), ice = j.iceServers;
  if (ice && !Array.isArray(ice)) ice = [ice];
  return { iceServers: ice || [], ttl: 21600 };
}
function doPost(e) {
  var out;
  try {
    var b = JSON.parse(e.postData.contents);
    var p = PropertiesService.getScriptProperties();
    if (b.action === 'turn') return ContentService.createTextOutput(JSON.stringify(turnPass_(b, p))).setMimeType(ContentService.MimeType.JSON);
    var form = { client_id: p.getProperty('CLIENT_ID'), client_secret: p.getProperty('CLIENT_SECRET') };
    if (!form.client_id || !form.client_secret) throw new Error('Helper not configured');
    if (b.action === 'exchange' && typeof b.code === 'string' && b.code.length < 1000) {
      form.code = b.code; form.grant_type = 'authorization_code'; form.redirect_uri = 'postmessage';
    } else if (b.action === 'refresh' && typeof b.refresh_token === 'string' && b.refresh_token.length < 1000) {
      form.refresh_token = b.refresh_token; form.grant_type = 'refresh_token';
    } else {
      throw new Error('Bad request');
    }
    var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', payload: form, muteHttpExceptions: true });
    var j = JSON.parse(r.getContentText());
    out = { access_token: j.access_token, expires_in: j.expires_in, refresh_token: j.refresh_token, scope: j.scope, error: j.error, error_description: j.error_description };
  } catch (err) {
    out = { error: 'helper_error', error_description: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'pg-derma-drive-token-helper', turn: !!(PropertiesService.getScriptProperties().getProperty('TURN_KEY_ID') || PropertiesService.getScriptProperties().getProperty('TURN_USERNAME')) })).setMimeType(ContentService.MimeType.JSON);
}
