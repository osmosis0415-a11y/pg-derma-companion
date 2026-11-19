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
 */
function doPost(e) {
  var out;
  try {
    var b = JSON.parse(e.postData.contents);
    var p = PropertiesService.getScriptProperties();
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
  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'pg-derma-drive-token-helper' })).setMimeType(ContentService.MimeType.JSON);
}
