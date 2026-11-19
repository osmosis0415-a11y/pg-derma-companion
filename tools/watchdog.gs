/**
 * PG Derma Companion — Watchdog (second file in the "PG Derma approval bot" Apps Script project).
 *
 * Hourly, independent of GitHub and Claude:
 *  - checks the live site loads with a real build, and the Drive token helper answers;
 *  - checks the GitHub site monitor is still running (GitHub pauses schedules after 60 idle days)
 *    and whether it has an open "site-down" issue;
 *  - self-heals the approval bot: recreates its every-minute trigger if it has gone missing.
 * Emails the admin only when the state changes (broken / recovered), plus a reminder every 12 h while broken.
 * Setup: run installWatchdog() once from the editor.
 */
var WD_SITE = 'https://osmosis0415-a11y.github.io/pg-derma-companion/';
var WD_REPO = 'osmosis0415-a11y/pg-derma-companion';
var WD_TOKEN_HELPER = 'https://script.google.com/macros/s/AKfycbxbRc1lnIR6cE91QWQT3qT9ifdSL6xtr6M3W581TcIVr6Fb2AYwgqCPvOMkkJW1prrD/exec';

function wdFetch_(url, opt) {
  for (var i = 0; i < 3; i++) {
    try {
      var r = UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'pg-derma-watchdog' } }, opt || {}));
      if (r.getResponseCode() < 500) return r;
    } catch (e) { if (i === 2) return { getResponseCode: function () { return 0; }, getContentText: function () { return String(e); } }; }
    Utilities.sleep(3000 * (i + 1));
  }
  return r;
}

function watchdog() {
  var problems = [], notes = [];
  // 1. Live site
  var s = wdFetch_(WD_SITE + '?wd=' + Date.now());
  var v = s.getResponseCode() === 200 ? (s.getContentText().match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1] : '';
  if (s.getResponseCode() !== 200) problems.push('The app website is down (HTTP ' + s.getResponseCode() + ').');
  else if (!v || v === '__BUILD__') problems.push('The app website loads but its build is broken (no version).');
  // 2. Drive token helper
  var t = wdFetch_(WD_TOKEN_HELPER);
  if (t.getResponseCode() !== 200 || /Page not found/i.test(t.getContentText())) problems.push('The Google Drive token helper is not answering (HTTP ' + t.getResponseCode() + ') — Drive sync renewal will fail.');
  // 3. Approval bot trigger (self-heal)
  var hasTrigger = ScriptApp.getProjectTriggers().some(function (x) { return x.getHandlerFunction() === 'checkNew'; });
  if (!hasTrigger) {
    try { ScriptApp.newTrigger('checkNew').timeBased().everyMinutes(1).create(); notes.push('The approval bot\'s timer had stopped — I restarted it.'); }
    catch (e) { problems.push('The approval bot\'s timer is missing and could not be restarted: ' + e.message); }
  }
  // 4. GitHub site monitor alive + open alerts
  var gh = wdFetch_('https://api.github.com/repos/' + WD_REPO + '/actions/workflows/site-monitor.yml/runs?per_page=1', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'pg-derma-watchdog' } });
  if (gh.getResponseCode() === 200) {
    var run = (JSON.parse(gh.getContentText()).workflow_runs || [])[0];
    var ageH = run ? (Date.now() - new Date(run.created_at).getTime()) / 3600000 : 99;
    if (ageH > 3) problems.push('The GitHub site monitor has not run for ' + Math.round(ageH) + ' h. Open https://github.com/' + WD_REPO + '/actions/workflows/site-monitor.yml and click "Enable workflow" if GitHub paused it.');
  }
  var iss = wdFetch_('https://api.github.com/repos/' + WD_REPO + '/issues?labels=site-down&state=open', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'pg-derma-watchdog' } });
  if (iss.getResponseCode() === 200) JSON.parse(iss.getContentText()).forEach(function (i) { problems.push('GitHub monitor reports a problem: ' + i.html_url); });

  // State change → email
  var p = PropertiesService.getScriptProperties();
  var prev = p.getProperty('WD_STATE') || 'ok', last = Number(p.getProperty('WD_LAST_MAIL') || 0);
  var state = problems.length ? 'broken' : 'ok';
  var due = state === 'broken' && (prev !== 'broken' || Date.now() - last > 12 * 3600000);
  p.setProperty('WD_STATE', state); p.setProperty('WD_LAST_RUN', new Date().toISOString()); p.setProperty('WD_LAST_BUILD', v || '');
  var esc = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  if (due || (state === 'ok' && prev === 'broken') || notes.length) {
    var subj = state === 'broken' ? '🔴 PG Derma site needs attention' : (prev === 'broken' ? '🟢 PG Derma site recovered' : 'ℹ️ PG Derma watchdog fixed something');
    var html = '<h3>' + esc(subj) + '</h3>' + (problems.length ? '<ul>' + problems.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p>All checks pass. Live build: ' + esc(v) + '</p>') +
      (notes.length ? '<p><b>Auto-fixed:</b> ' + notes.map(esc).join(' ') + '</p>' : '') +
      '<p style="color:#666">Code problems are picked up by the daily Claude health check. To ask now, open your PG Derma chat in Claude and say "fix the site".</p>';
    MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: subj, htmlBody: html, name: 'PG Derma watchdog' });
    if (state === 'broken') p.setProperty('WD_LAST_MAIL', String(Date.now()));
  }
  Logger.log(state + ' · build ' + v + ' · ' + problems.join(' | ') + (notes.length ? ' · fixed: ' + notes.join(' ') : ''));
  return { state: state, build: v, problems: problems, fixed: notes };
}

function installWatchdog() {
  ScriptApp.getProjectTriggers().forEach(function (x) { if (x.getHandlerFunction() === 'watchdog') ScriptApp.deleteTrigger(x); });
  ScriptApp.newTrigger('watchdog').timeBased().everyHours(1).create();
  Logger.log(JSON.stringify(watchdog()));
}
