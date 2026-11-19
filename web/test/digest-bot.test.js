// Unit test for the journal digest bot in tools/admin-bot.gs (PubMed, Europe PMC, Wikimedia, Gemini and Firestore mocked).
const crypto = require('crypto'), fs = require('fs');
const P = { GEMINI_KEY: 'k' }, sent = [], store = {}, urls = []; let n = 0;
const val = v => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) };
const plain = x => 'stringValue' in x ? x.stringValue : 'integerValue' in x ? +x.integerValue : 'booleanValue' in x ? x.booleanValue : 'timestampValue' in x ? x.timestampValue : 'arrayValue' in x ? (x.arrayValue.values || []).map(plain) : null;
const docOf = (coll, id) => { const f = {}; for (const [k, v] of Object.entries(store[coll + '/' + id])) f[k] = val(v); return { name: 'projects/p/databases/(default)/documents/' + coll + '/' + id, fields: f }; };
const resp = (c, b) => ({ getResponseCode: () => c, getContentText: () => typeof b === 'string' ? b : JSON.stringify(b) });

const art = (pmid, journal, pmc, extra = '') => `<PubmedArticle><MedlineCitation><PMID Version="1">${pmid}</PMID><Article><Journal><JournalIssue><PubDate><Year>2026</Year></PubDate></JournalIssue><Title>Full ${journal}</Title><ISOAbbreviation>${journal}</ISOAbbreviation></Journal>
<ArticleTitle>Trial ${pmid} of <i>drug</i> in vitiligo</ArticleTitle><Abstract><AbstractText Label="METHODS">120 patients randomised.</AbstractText><AbstractText Label="RESULTS">Repigmentation 45% vs 20% (p&lt;0.01).</AbstractText></Abstract>
<AuthorList><Author><LastName>Rao</LastName><Initials>K</Initials></Author><Author><LastName>Shah</LastName><Initials>P</Initials></Author><Author><LastName>Iyer</LastName><Initials>S</Initials></Author><Author><LastName>Das</LastName><Initials>A</Initials></Author></AuthorList>
<PublicationTypeList><PublicationType>Journal Article</PublicationType><PublicationType>Randomized Controlled Trial</PublicationType></PublicationTypeList>${extra}</Article></MedlineCitation>
<PubmedData><ArticleIdList><ArticleId IdType="pubmed">${pmid}</ArticleId><ArticleId IdType="doi">10.1/x${pmid}</ArticleId>${pmc ? `<ArticleId IdType="pmc">${pmc}</ArticleId>` : ''}</ArticleIdList></PubmedData></PubmedArticle>`;
const ARTS = { 111: art(111, 'Br J Dermatol', 'PMC900'), 222: art(222, 'Indian J Dermatol Venereol Leprol', 'PMC800'), 333: art(333, 'JAMA Dermatol', ''), 444: art(444, 'Clin Exp Dermatol', '') };
let geminiText = id => JSON.stringify({ ok: true, h: 'Headline ' + id, s: 'Summary in own words', k: ['Point one', 'Point two', 'Point three'], w: 'Practice line', lvl: 'Randomised controlled trial', top: 'Vitiligo', img: 'vitiligo' });

const g = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => P[k] ?? null, setProperty: (k, v) => P[k] = v }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'admin@x.com' }) },
  Utilities: { getUuid: () => crypto.randomUUID(), computeHmacSha256Signature: (m, k) => [...crypto.createHmac('sha256', k).update(m).digest()], base64EncodeWebSafe: b => Buffer.from(b).toString('base64'), formatDate: d => d.toISOString().slice(0, 10) },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://w/exec' }), getOAuthToken: () => 'T', getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create: () => 1 }) }) }) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  MailApp: { sendEmail: o => sent.push(o), getRemainingDailyQuota: () => 90 }, Logger: { log: () => {} },
  HtmlService: { createHtmlOutput: h => ({ h, setTitle() { return this; }, setXFrameOptionsMode() { return this; } }), XFrameOptionsMode: { DEFAULT: 1 } },
  UrlFetchApp: { fetch: (url, o = {}) => {
    urls.push(url);
    if (url.includes('esearch.fcgi')) { const term = decodeURIComponent(url.split('term=')[1]); return resp(200, { esearchresult: { idlist: term.includes('[doi]') ? (term.includes('10.1/x444') ? ['444'] : []) : ['111', '222', '333', '999', '555'] } }); }
    if (url.includes('efetch.fcgi')) { const ids = url.split('id=')[1].split(','); return resp(200, '<PubmedArticleSet>' + ids.map(i => ARTS[i] || '').join('') + '</PubmedArticleSet>'); }
    if (url.includes('europepmc/webservices/rest/search')) return resp(200, { resultList: { result: [{ license: url.includes('PMC900') ? 'cc by' : 'Publisher-specific' }] } });
    if (url.includes('/fullTextXML')) return resp(200, '<article><fig id="f1"><label>Figure 1</label><caption><p>Repigmentation at 24 weeks.</p></caption><graphic xlink:href="bjd-fig1"/></fig></article>');
    if (url.includes('commons.wikimedia.org')) return resp(200, { query: { pages: { 1: { index: 1, title: 'File:Nonfree.jpg', imageinfo: [{ thumburl: 'https://up/nf.jpg', descriptionurl: 'https://c/nf', extmetadata: { LicenseShortName: { value: 'Fair use' } } }] }, 2: { index: 2, title: 'File:Vitiligo.jpg', imageinfo: [{ thumburl: 'https://up/v.jpg', descriptionurl: 'https://c/v', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="x">Dr A</a>' } } }] } } } });
    if (url.includes('generativelanguage')) { const m = JSON.parse(o.payload).contents[0].parts[0].text.match(/Title: Trial (\d+)/); return resp(200, { candidates: [{ content: { parts: [{ text: typeof geminiText === 'function' ? geminiText(m && m[1]) : geminiText }] } }] }); }
    const path = url.split('/documents')[1];
    if (path === ':runQuery') { const q = JSON.parse(o.payload).structuredQuery, coll = q.from[0].collectionId, w = q.where && q.where.fieldFilter;
      const docs = Object.keys(store).filter(k => k.startsWith(coll + '/')).map(k => k.split('/')[1]).filter(id => !w || store[coll + '/' + id][w.field.fieldPath] === plain(w.value));
      return resp(200, docs.length ? docs.map(id => ({ document: docOf(coll, id) })) : [{ readTime: 'x' }]); }
    const [, coll, rawId] = path.split('?')[0].split('/'), id = rawId && decodeURIComponent(rawId);
    if (o.method === 'post') { const nid = 'd' + (++n), obj = {}; for (const [k, v] of Object.entries(JSON.parse(o.payload).fields)) obj[k] = plain(v); store[coll + '/' + nid] = obj; return resp(200, { name: '.../' + coll + '/' + nid }); }
    if (o.method === 'patch') { for (const [k, v] of Object.entries(JSON.parse(o.payload).fields)) store[coll + '/' + id][k] = plain(v); return resp(200, docOf(coll, id)); }
    if (!store[coll + '/' + id]) return resp(404, 'nf');
    return resp(200, docOf(coll, id));
  } }
};
const src = fs.readFileSync(require('path').join(__dirname, '../../tools/admin-bot.gs'), 'utf8');
const B = new Function(...Object.keys(g), src + ';return {makeDigest,digestTick,setupDigest,untag_};')(...Object.values(g));
const ok = (name, c) => { console.log((c ? 'PASS ' : 'FAIL ') + name); if (!c) process.exitCode = 1; };
const posts = () => Object.entries(store).filter(([k]) => k.startsWith('digest/')).map(([k, v]) => Object.assign({ id: k.split('/')[1] }, v));

store['digest/old'] = { status: 'live', pmid: '333', h: 'already have it' };
const made = B.makeDigest(2);
const ds = posts().filter(p => p.id !== 'old');
ok('two drafts written, existing PMID skipped', made === 2 && ds.length === 2 && !ds.some(p => p.pmid === '333'));
ok('Indian journal picked first', ds[0].pmid === '222');
ok('drafts, not live, without auto-publish', ds.every(p => p.status === 'draft' && p.src === 'ai' && p.kind === 'journal'));
ok('citation fields filled', ds.every(p => p.j && p.yr === '2026' && p.au === 'Rao K, Shah P, Iyer S et al.' && /^https:\/\/doi\.org\/10\.1\/x/.test(p.url) && p.k.length === 3));
const cc = ds.find(p => p.pmid === '111'), noLic = ds.find(p => p.pmid === '222');
ok('CC-licensed paper uses its own figure with credit', cc && cc.imgKind === 'paper' && cc.img === 'https://europepmc.org/articles/PMC900/bin/bjd-fig1.jpg' && cc.imgLic === 'CC BY' && cc.imgCap.startsWith('Figure 1') && cc.imgCredit.includes('Br J Dermatol'));
ok('non-open paper never reuses its figure', noLic && !urls.some(u => u.includes('PMC800/fullTextXML')));
ok('falls back to openly licensed Commons image (skips non-free)', noLic.imgKind === 'illustrative' && noLic.img === 'https://up/v.jpg' && noLic.imgLic === 'CC BY-SA 4.0' && noLic.imgCredit === 'Dr A');
ok('review email sent with admin link', sent.length === 1 && sent[0].htmlBody.includes('admin.html#digest') && sent[0].subject.includes('to review'));
ok('html stripped from titles', B.untag_('Trial of <i>drug</i> &amp; p&lt;0.01') === 'Trial of drug & p<0.01');

// auto-publish
store['config/digest'] = { auto: true, perDay: 1 };
ARTS[555] = art(555, 'J Am Acad Dermatol', ''); // not yet seen
const made2 = B.makeDigest();
const live = posts().filter(p => p.status === 'live' && p.id !== 'old');
ok('auto-publish makes posts live with approvedAt', made2 === 1 && live.length === 1 && live[0].approvedAt && sent[1].subject.includes('published'));

// AI says not useful → nothing saved
geminiText = JSON.stringify({ ok: false });
delete store['config/digest'];
ok('rejected by AI → nothing saved', B.makeDigest(3) === 0);

// queue by DOI and by bad PMID, and scheduled publishing
geminiText = id => JSON.stringify({ ok: true, h: 'Queued ' + id, s: 'S', k: ['a'], w: 'w', lvl: 'Review', top: 'Acne', img: '' });
store['digest/q1'] = { status: 'queued', doi: 'https://doi.org/10.1/x444', by: 'admin' };
store['digest/q2'] = { status: 'queued', pmid: '000' };
store['digest/s1'] = { status: 'scheduled', h: 'later', pubAt: new Date(Date.now() - 60000).toISOString() };
store['digest/s2'] = { status: 'scheduled', h: 'future', pubAt: new Date(Date.now() + 864e5).toISOString() };
B.digestTick();
ok('queued DOI written as draft', store['digest/q1'].status === 'draft' && store['digest/q1'].pmid === '444' && store['digest/q1'].h === 'Queued 444' && store['digest/q1'].by === 'admin');
ok('bad PMID marked failed with reason', store['digest/q2'].status === 'failed' && /PubMed/.test(store['digest/q2'].err));
ok('due scheduled post goes live, future one waits', store['digest/s1'].status === 'live' && store['digest/s2'].status === 'scheduled');
ok('setupDigest runs', B.setupDigest() === undefined);
