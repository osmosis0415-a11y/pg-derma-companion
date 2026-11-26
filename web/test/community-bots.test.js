// Unit test for the labelled community bots in tools/admin-bot.gs (Apps Script APIs mocked, clock controlled).
const fs = require('fs');
const P = { GEMINI_KEY: 'k' }, store = {}; let n = 0, NOW = Date.parse('2026-11-26T15:30:00Z'); // 9 pm IST, a Thursday
const RealDate = Date;
class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
const val = v => v === null || v === undefined ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } } : { stringValue: String(v) };
const plain = x => 'stringValue' in x ? x.stringValue : 'integerValue' in x ? +x.integerValue : 'booleanValue' in x ? x.booleanValue : 'timestampValue' in x ? x.timestampValue : 'nullValue' in x ? null
  : 'arrayValue' in x ? (x.arrayValue.values || []).map(plain) : 'mapValue' in x ? Object.fromEntries(Object.entries(x.mapValue.fields || {}).map(([k, y]) => [k, plain(y)])) : null;
const docOf = (path) => { const f = {}; for (const [k, v] of Object.entries(store[path])) f[k] = val(v); return { name: 'projects/p/databases/(default)/documents/' + path, fields: f }; };
const resp = (c, b) => ({ getResponseCode: () => c, getContentText: () => typeof b === 'string' ? b : JSON.stringify(b) });
const prompts = [], triggers = [];
const answerFor = p => {
  if (/Case of the Day/.test(p)) return { text: 'A 30-year-old man with an itchy annular plaque. What is your diagnosis, and what would you do next? Reply below — answer at 6 pm.', answer: 'Tinea corporis — KOH shows septate hyphae.', tags: ['tinea', 'Fungal Infections!', 'x', 'y'] };
  if (/teach juniors/.test(p)) return { text: 'Steps: 1. Scrape the active edge…\nSource: IADVL Textbook', tags: ['koh'] };
  if (/research-methods mentor/.test(p)) return { text: 'Use PICO. What is your question?', tags: ['pico'] };
  if (/journal club/.test(p)) return { text: '1. Was allocation concealed? 2. … 3. …', tags: ['psoriasis'] };
  if (/resident asked this/.test(p)) return { text: 'Generally, start with … discuss with your faculty.' };
  return {};
};
const g = {
  Date: FakeDate,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => P[k] ?? null, setProperty: (k, v) => P[k] = v }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'admin@x.com' }), getActiveUser: () => ({ getEmail: () => (globalThis.__ACTIVE ?? 'admin@x.com') }) },
  Utilities: { sleep: () => {}, formatDate: (d, tz, f) => { const s = new RealDate(d.getTime() + 5.5 * 36e5).toISOString(); return f === 'yyyy-MM-dd' ? s.slice(0, 10) : f.includes("'T'") ? s.slice(0, 19) : s; } },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://w/exec' }), getOAuthToken: () => 'T', getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: h => ({ timeBased: () => ({ everyMinutes: n => ({ create: () => { triggers.push([h, n]); return 1; } }), everyHours: () => ({ create: () => 1 }) }) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  MailApp: { sendEmail: () => {} }, Logger: { log: () => {} },
  UrlFetchApp: { fetch: (url, o = {}) => {
    if (url.includes('generativelanguage')) { const p = JSON.parse(o.payload).contents[0].parts[0].text; prompts.push(p); return resp(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(answerFor(p)) }] } }] }); }
    const path = url.split('/documents')[1];
    if (path === ':runQuery') { const q = JSON.parse(o.payload).structuredQuery, coll = q.from[0].collectionId, w = q.where && q.where.fieldFilter;
      const keys = Object.keys(store).filter(k => k.split('/').length === 2 && k.startsWith(coll + '/')).filter(k => !w || store[k][w.field.fieldPath] === plain(w.value));
      return resp(200, keys.length ? keys.map(k => ({ document: docOf(k) })) : [{ readTime: 'x' }]); }
    const clean = decodeURIComponent(path.split('?')[0]).replace(/^\//, '');
    if (o.method === 'post') { const nid = 'd' + (++n), obj = {}; for (const [k, v] of Object.entries(JSON.parse(o.payload).fields)) obj[k] = plain(v); store[clean + '/' + nid] = obj; return resp(200, { name: '.../' + clean + '/' + nid }); }
    if (o.method === 'patch') { const masked = path.includes('updateMask'); if (!store[clean] || !masked) store[clean] = masked ? (store[clean] || {}) : {}; for (const [k, v] of Object.entries(JSON.parse(o.payload).fields)) store[clean][k] = plain(v); return resp(200, docOf(clean)); }
    if (!store[clean]) return resp(404, 'nf');
    return resp(200, docOf(clean));
  } }
};
const src = fs.readFileSync(require('path').join(__dirname, '../../tools/admin-bot.gs'), 'utf8');
const B = new Function(...Object.keys(g), src + ';return {setupBots,botsTick};')(...Object.values(g));
const ok = (name, c) => { console.log((c ? 'PASS ' : 'FAIL ') + name); if (!c) process.exitCode = 1; };
const posts = () => Object.entries(store).filter(([k]) => /^posts\/[^/]+$/.test(k)).map(([k, v]) => Object.assign({ id: k.split('/')[1] }, v));
const iso = msAgo => new RealDate(NOW - msAgo).toISOString();

// A live paper in the Journal digest (and a draft that must be ignored)
store['digest/live1'] = { status: 'live', h: 'Methotrexate vs cyclosporine in psoriasis', s: 'An RCT summary.', url: 'https://doi.org/10.1/x', j: 'Br J Dermatol', yr: '2026', approvedAt: iso(864e5) };
store['digest/draft1'] = { status: 'draft', h: 'Unpublished', s: 'x', url: 'https://doi.org/10.1/y' };

let blocked = false; globalThis.__ACTIVE = 'stranger@x.com'; try { B.setupBots(); } catch (e) { blocked = /Not allowed/.test(e.message); } globalThis.__ACTIVE = undefined;
ok('only the owner (or a project trigger) can run setupBots/botsTick', blocked && !Object.keys(store).some(k => k.startsWith('profiles/')));

B.setupBots();
const profs = Object.entries(store).filter(([k]) => k.startsWith('profiles/'));
ok('four bot profiles, each labelled', profs.length === 4 && profs.every(([k, v]) => /^profiles\/bot_/.test(k) && v.bot === true && /Bot$/.test(v.name) && /Automated account/.test(v.bio)));
ok('config/bots created, all on', store['config/bots'] && store['config/bots'].on === true && store['config/bots'].replies === true);
ok('15-minute trigger on the guarded botsTick', triggers.length === 1 && triggers[0][0] === 'botsTick' && triggers[0][1] === 15);
let ps = posts();
ok('setup posts just the first due item (one Gemini call, well inside 6 minutes)', ps.length === 1 && ps[0].uid === 'bot_case' && prompts.length === 1);
B.botsTick(); B.botsTick();
ps = posts();
ok('each tick adds at most one post: SOP, then Journal Club (no Thesis on Thursday)', ps.length === 3 && ps.some(p => p.uid === 'bot_sop') && ps.some(p => p.uid === 'bot_journal') && !ps.some(p => p.uid === 'bot_thesis'));
ok('every bot post labelled (bot:true, name ends Bot, AI footer)', ps.every(p => p.bot === true && /Bot$/.test(p.name) && p.text.includes('AI-generated by a PG Derma bot')));
ok('post fields valid for the app', ps.every(p => ['case', 'question', 'pearl'].includes(p.kind) && p.tags.length <= 3 && p.tags.every(t => /^[a-z0-9]+$/.test(t)) && p.likes === 0 && p.comments === 0 && p.text.length <= 3000));
ok('case answer kept hidden for later', ps.find(p => p.uid === 'bot_case').botAnswer.includes('Tinea') && !ps.find(p => p.uid === 'bot_case').text.includes('septate'));
const jp = ps.find(p => p.uid === 'bot_journal');
ok('journal club uses the live paper with its link, never the draft', jp.text.includes('Methotrexate') && jp.text.includes('https://doi.org/10.1/x') && !prompts.some(p => p.includes('Unpublished')));
ok('prompts forbid inventing data and real patients', prompts.every(p => /Never invent studies/.test(p) && /No real patients/.test(p)));
store['config/bots'].last = {}; const nPrompts = prompts.length; B.botsTick();
ok('a bot that already posted today never posts again, even if its "last" marker was lost', posts().length === 3 && prompts.length === nPrompts && store['config/bots'].last.case === '2026-11-26');

// Replies to residents' unanswered questions (only in runs that made no post; one per run)
store['posts/q1'] = { uid: 'uRes', name: 'Dr Priya', kind: 'question', text: 'How do you counsel for isotretinoin?', comments: 0, likes: 0, createdAt: iso(2 * 36e5) };
store['posts/q2'] = { uid: 'uRes', name: 'Dr Priya', kind: 'question', text: 'Old question', comments: 0, likes: 0, createdAt: iso(72 * 36e5) };
store['posts/q3'] = { uid: 'uRes2', name: 'Dr Ravi', kind: 'question', text: 'Already answered', comments: 2, likes: 0, createdAt: iso(3 * 36e5) };
store['posts/q4'] = { uid: 'uRes3', name: 'Dr Asha', kind: 'question', text: 'Too fresh', comments: 0, likes: 0, createdAt: iso(10 * 6e4) };
store['posts/q6'] = { uid: 'uRes4', name: 'Dr Meena', kind: 'question', text: 'Second open question', comments: 0, likes: 0, createdAt: iso(5 * 36e5) };
B.botsTick();
const answered = ['q1', 'q6'].filter(q => Object.keys(store).some(k => k.startsWith('threads/p_' + q + '/c/')));
ok('one reply per run', answered.length === 1);
B.botsTick();
const th = Object.entries(store).filter(([k]) => k.startsWith('threads/p_q1/c/'));
ok('bot answers each open question once, labelled', th.length === 1 && th[0][1].uid === 'bot_sop' && th[0][1].bot === true && th[0][1].text.includes('AI-generated') && Object.keys(store).some(k => k.startsWith('threads/p_q6/c/')));
ok('post comment count and botReplied updated', store['posts/q1'].comments === 1 && store['posts/q1'].botReplied === true);
ok('asker gets a notification from the bot', Object.values(store).some(v => v.to === 'uRes' && v.from === 'bot_sop' && v.type === 'comment' && v.ref === 'q1'));
ok('old, answered and too-fresh questions left alone', !Object.keys(store).some(k => /^threads\/p_q[234]\//.test(k)));
B.botsTick();
ok('never answers the same question twice', Object.keys(store).filter(k => k.startsWith('threads/p_q1/c/')).length === 1);

// Case of the Day answer is revealed in the thread after 8 hours
const cp = posts().find(p => p.uid === 'bot_case'); store['posts/' + cp.id].createdAt = iso(9 * 36e5);
B.botsTick();
ok('case answer revealed in the thread', Object.entries(store).some(([k, v]) => k.startsWith('threads/p_' + cp.id + '/c/') && v.text.startsWith('Answer: Tinea')) && store['posts/' + cp.id].botRevealed === true);

// Next day (Friday 9 pm): admin switches
NOW = Date.parse('2026-11-27T15:30:00Z');
store['config/bots'] = Object.assign(store['config/bots'], { on: false });
const prev = posts().length;
store['posts/q5'] = { uid: 'uRes', name: 'Dr Priya', kind: 'question', text: 'Paused question', comments: 0, likes: 0, createdAt: iso(2 * 36e5) };
B.botsTick();
ok('all bots paused → nothing posted or replied', posts().length === prev + 1 && !Object.keys(store).some(k => k.startsWith('threads/p_q5/')));
store['config/bots'] = Object.assign(store['config/bots'], { on: true, sop: false, replies: false });
for (let r = 0; r < 5; r++) B.botsTick();
ok('SOP bot off → no SOP post; replies off → no answer; case and Friday thesis still post', posts().filter(p => p.uid === 'bot_sop').length === 1 && posts().filter(p => p.uid === 'bot_case').length === 2 && posts().filter(p => p.uid === 'bot_thesis').length === 1 && !Object.keys(store).some(k => k.startsWith('threads/p_q5/')));

// Before the posting hours nothing is posted
NOW = Date.parse('2026-11-28T00:30:00Z'); // 6 am IST Saturday
const before6 = posts().length; B.botsTick();
ok('nothing posts before 9 am IST', posts().length === before6);
