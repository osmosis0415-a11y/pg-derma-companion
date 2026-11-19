// PG Derma Companion — site monitor (runs in GitHub Actions every 30 minutes).
// Checks the live site, the deploy, the Apps Script helpers and Firebase.
// Writes monitor-result.json: { ok, problems:[...], warnings:[...], stale, liveBuild, mainSha }.
// Never sends or reads any user data.
import fs from 'node:fs';

const SITE = process.env.SITE_URL || 'https://osmosis0415-a11y.github.io/pg-derma-companion/';
const REPO = process.env.GITHUB_REPOSITORY || 'osmosis0415-a11y/pg-derma-companion';
const MAIN_SHA = (process.env.MAIN_SHA || '').slice(0, 7);
const GH = process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {};

const src = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const cfg = src('web/src/firebase-config.js');
const bot = src('tools/admin-bot.gs');
const TOKEN_HELPER = (cfg.match(/DRIVE_TOKEN_HELPER\s*=\s*'([^']+)'/) || [])[1];
const BOT_URL = (bot.match(/BOT_EXEC_URL\s*=\s*'([^']+)'/) || [])[1];
const API_KEY = (cfg.match(/apiKey:\s*"([^"]+)"/) || [])[1];
const PROJECT = (cfg.match(/projectId:\s*"([^"]+)"/) || [])[1];

const problems = [], warnings = [];
const bad = (m) => { problems.push(m); console.log('❌ ' + m); };
const warn = (m) => { warnings.push(m); console.log('⚠️ ' + m); };
const good = (m) => console.log('✅ ' + m);

async function get(url, opts = {}, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(25000), ...opts });
      const text = await r.text();
      if (r.status < 500) return { status: r.status, text };
      last = { status: r.status, text };
    } catch (e) { last = { status: 0, text: String(e.message || e) }; }
    await new Promise((s) => setTimeout(s, 4000 * (i + 1)));
  }
  return last;
}

// Deploy state first: during (or just after) a deploy, GitHub's CDN can briefly serve mixed builds.
const runsRes = await get(`https://api.github.com/repos/${REPO}/actions/runs?branch=main&per_page=20`, { headers: { Accept: 'application/vnd.github+json', ...GH } });
const runList = runsRes.status === 200 ? (JSON.parse(runsRes.text).workflow_runs || []) : [];
const latestPages = runList.find((r) => r.path.endsWith('pages.yml'));
const deploying = !!latestPages && (latestPages.status !== 'completed' || Date.now() - Date.parse(latestPages.updated_at) < 15 * 60000);
const mismatch = (m) => (deploying ? warn(m + ' (a deploy just ran — rechecking next time)') : bad(m));

const result = { ok: true, problems, warnings, stale: false, liveBuild: '', mainSha: MAIN_SHA, checkedAt: new Date().toISOString() };

// 1. Live app page
const home = await get(SITE + '?monitor=' + Date.now());
if (home.status !== 200) bad(`Live site returned HTTP ${home.status} (${SITE})`);
else {
  const v = (home.text.match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1];
  if (!v || v === '__BUILD__') bad('Live page loaded but has no build version — the build step may be broken.');
  else {
    result.liveBuild = v; good('Live site up, build ' + v);
    if (!/<title>[^<]*PG Derma/i.test(home.text)) bad('Live page does not look like the PG Derma app (title missing).');
    if (home.text.length < 100000) bad(`Live page is suspiciously small (${home.text.length} bytes) — the bundle may be truncated.`);
    const liveSha = v.split('-').pop();
    if (MAIN_SHA && liveSha !== MAIN_SHA) { result.stale = true; warn(`Live build ${liveSha} is not the latest main commit ${MAIN_SHA}.`); }
  }
}

// 2. Supporting files
for (const f of ['sw.js', 'manifest.webmanifest', 'admin.html', 'icon-192.png', 'icon-512.png', 'icon.svg']) {
  const r = await get(SITE + f + '?monitor=' + Date.now());
  if (r.status !== 200) { bad(`${f} returned HTTP ${r.status}`); continue; }
  if (f === 'manifest.webmanifest') { try { JSON.parse(r.text); } catch { bad('manifest.webmanifest is not valid JSON (install-to-home-screen would break).'); continue; } }
  if (f === 'sw.js' && result.liveBuild && !r.text.includes(result.liveBuild)) mismatch('sw.js build does not match index.html — phones may be stuck on an old offline copy.');
  if (f === 'admin.html' && !/apiKey/.test(r.text)) bad('admin.html is missing the Firebase config.');
  good(f + ' OK');
}

// 3. Apps Script helpers (Drive token helper + approval bot)
for (const [name, url] of [['Drive token helper', TOKEN_HELPER], ['Approval bot', BOT_URL]]) {
  if (!url) { warn(`${name} URL not found in the repo.`); continue; }
  const r = await get(url);
  if (r.status !== 200) bad(`${name} returned HTTP ${r.status} — ${name === 'Approval bot' ? 'approval emails/buttons' : 'silent Google Drive renewal'} will fail.`);
  else if (/Page not found|unable to open the file/i.test(r.text)) bad(`${name} deployment no longer exists (Page not found).`);
  else if (/authori[sz]ation is required|needs your permission/i.test(r.text)) bad(`${name} needs re-authorisation in Apps Script.`);
  else good(name + ' OK');
}
if (TOKEN_HELPER) {
  const r = await get(TOKEN_HELPER, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'refresh', refresh_token: 'monitor-probe' }) });
  if (r.status !== 200) bad(`Drive token helper POST returned HTTP ${r.status}.`);
  else if (/invalid_client|unauthorized_client/i.test(r.text)) bad('Drive token helper: Google rejected the OAuth client secret — Drive sync renewal is broken.');
  else good('Drive token helper answers token requests');
}

// 4. Firebase (sign-in + Firestore reachable for this project)
if (API_KEY && PROJECT) {
  const a = await get(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/config?key=${API_KEY}`);
  const b = await get(`https://${PROJECT}.firebaseapp.com/__/auth/handler`);
  if (b.status !== 200) bad(`Firebase sign-in handler returned HTTP ${b.status} — Google sign-in will fail.`); else good('Firebase sign-in handler OK');
  if (a.status === 400 && /API_KEY_INVALID|API key not valid/i.test(a.text)) bad('Firebase API key is invalid.');
  const f = await get(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/system/monitor?key=${API_KEY}`);
  if (f.status >= 500 || f.status === 0) bad(`Firestore unreachable (HTTP ${f.status}).`);
  else if (/has not been used|is disabled|PROJECT_NOT_FOUND|SERVICE_DISABLED/i.test(f.text)) bad('Firestore API is disabled or the project is missing.');
  else if (/RESOURCE_EXHAUSTED|Quota exceeded/i.test(f.text)) bad('Firestore free daily quota is exhausted — sign-ins and the batch hub will fail until it resets (midnight US Pacific).');
  else good(`Firestore reachable (HTTP ${f.status}, rules answering)`);
}

// 5. Recent deploys and CI
if (runsRes.status === 200) {
  const list = runList;
  const last = (wf) => list.find((r) => r.path.endsWith(wf) && r.status === 'completed');
  const pages = last('pages.yml');
  if (pages && pages.conclusion !== 'success') bad(`Last deploy (${pages.head_sha.slice(0, 7)}) failed: ${pages.html_url}`);
  else if (pages) good('Last deploy succeeded');
  const fl = last('flutter.yml');
  if (fl && fl.conclusion !== 'success') warn(`Android APK build failed: ${fl.html_url}`);
} else warn(`Could not read GitHub Actions (HTTP ${runsRes.status}).`);

result.deploying = deploying;
result.ok = problems.length === 0;
fs.writeFileSync('monitor-result.json', JSON.stringify(result, null, 2));
console.log(result.ok ? '\nALL CORE CHECKS PASSED' : `\n${problems.length} PROBLEM(S)`);
