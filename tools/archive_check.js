#!/usr/bin/env node
// Weekly Archive check. Confirms that every file the stations play still exists on the
// Internet Archive, still downloads, hasn't turned stream-only and still has the length the
// catalog expects. It only reports: nothing in the catalog changes.
//
//   node tools/archive_check.js [--items id1,id2] [--limit N] [--concurrency 2] [--delay 600]
//
// Needs dist/catalog.json (python3 tools/build.py first) and network access to archive.org.
// Writes dist/archive-check.json and dist/archive-check.md. Exit code 0 when the check ran,
// whatever it found; 2 when too much of the Archive couldn't be reached to trust the result.
//
// Per item: one request to the metadata API (does the item exist, is it stream-only, is each
// file still listed, private, and how long). Per file: one HEAD request on the download URL,
// the one the radio plays, following the Archive's redirect to the server that holds it.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const UA = 'NeedleAndDial-ArchiveCheck/1.0 (+https://github.com/mattforney/needle-and-dial)';
const APPROVALS = 'catalog/review/stream-only.json';
const UNHEALTHY = 0.25; // more than this share unchecked: the run can't be trusted

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The Archive gives lengths as seconds ("1758.29") or clock time ("06:21", "1:02:03").
function seconds(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (s.includes(':')) { const n = s.split(':').reduce((a, p) => a * 60 + parseFloat(p), 0); return Number.isFinite(n) ? n : null; }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
const clock = (sec) => { const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`; };
const lengthOff = (meta, cat) => Math.abs(meta - cat) > Math.max(3, cat * 0.02);

// Every distinct file in the catalog, with who plays it and where it is listed.
function loadCatalog(root = ROOT) {
  const html = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
  const code = html.split('// ==ENGINE==')[1].split('// ==/ENGINE==')[0];
  const CAT = JSON.parse(fs.readFileSync(path.join(root, 'dist/catalog.json'), 'utf8'));
  const api = new Function('CAT', code + '\nreturn { STATIONS, parseCatalog, buildStation, ia };')(CAT);
  const P = api.parseCatalog(CAT);
  const files = new Map(), seen = new Set();
  const walk = (o, pool, series) => {
    if (!o || typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) { o.forEach((x) => walk(x, pool, series)); return; }
    if (typeof o.series === 'string') series = o.series;
    if (typeof o.id === 'string' && typeof o.f === 'string') {
      const key = o.id + '/' + o.f;
      if (!files.has(key)) files.set(key, { key, id: o.id, f: o.f, d: o.d, t: o.t || o.f, a: o.a || series || '', pool, stations: new Set(), url: api.ia(o.id, o.f) });
    }
    for (const v of Object.values(o)) walk(v, pool, series);
  };
  for (const [pool, v] of Object.entries(P)) walk(v, pool, '');
  // Who plays what: four weeks of every station's schedule.
  const byPool = {};
  for (const S of api.STATIONS) for (let w = 0; w < 4; w++) for (const g of api.buildStation(S, w, P)) {
    const x = g.f && files.get(g.id + '/' + g.f);
    if (!x) continue;
    x.stations.add(S.call); (byPool[x.pool] = byPool[x.pool] || new Set()).add(S.call);
    if (!x.a && g.a) x.a = g.a;
  }
  for (const x of files.values()) if (!x.stations.size && byPool[x.pool]) x.stations = new Set(byPool[x.pool]);
  const sources = fs.readdirSync(path.join(root, 'catalog')).filter((n) => n.endsWith('.json')).map((n) => [n, fs.readFileSync(path.join(root, 'catalog', n), 'utf8')]);
  // An identifier sits in a catalog as a JSON string of its own or at the start of a '|'-separated entry.
  for (const x of files.values()) { const hit = sources.find(([, text]) => text.includes(`"${x.id}"`) || text.includes(`"${x.id}|`)); x.catalog = hit ? 'catalog/' + hit[0] : ''; }
  return [...files.values()];
}

// GET or HEAD with retries for the Archive's transient failures (timeouts, 429, 5xx).
// Returns the Response, or { transient: true, why } after the last try.
async function request(url, method, o) {
  let why = '', wait = 0;
  for (let i = 0; i < o.tries; i++) {
    if (i) await o.sleep(wait || o.backoff[Math.min(i - 1, o.backoff.length - 1)]);
    wait = 0;
    try {
      const r = await o.fetch(url, { method, redirect: 'follow', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(o.timeout) });
      if (r.status === 429 || r.status >= 500) { why = 'HTTP ' + r.status; const ra = +(r.headers.get('retry-after') || 0); if (ra > 0) wait = Math.min(ra, 120) * 1000; continue; }
      return r;
    } catch (e) { why = e && e.name === 'TimeoutError' ? 'timed out' : String((e && e.cause && e.cause.code) || (e && e.message) || e); }
  }
  return { transient: true, why };
}

// One item: its metadata, then a download probe for each of its files the catalog uses.
async function checkItem(id, files, o) {
  const out = { id, restricted: false, results: [] };
  const res = (x, status, note) => out.results.push({ key: x.key, status, note });
  const r = await request('https://archive.org/metadata/' + encodeURIComponent(id), 'GET', o);
  if (r.transient) { files.forEach((x) => res(x, 'unchecked', 'metadata: ' + r.why)); return out; }
  let meta = null;
  try { meta = r.ok ? await r.json() : null; } catch (e) { meta = null; }
  if (!r.ok) { files.forEach((x) => res(x, 'failed', `metadata: HTTP ${r.status}`)); return out; }
  if (!meta || !meta.metadata || !Array.isArray(meta.files)) { files.forEach((x) => res(x, 'gone', meta && meta.is_dark ? 'item withdrawn (dark)' : 'item no longer exists')); return out; }
  out.restricted = String(meta.metadata['access-restricted-item']).toLowerCase() === 'true';
  const byName = new Map(meta.files.map((m) => [String(m.name).normalize('NFC'), m]));
  for (const x of files) {
    const m = byName.get(x.f.normalize('NFC'));
    if (!m) { res(x, 'missing', 'file no longer in the item'); continue; }
    if (String(m.private).toLowerCase() === 'true') { res(x, 'refused', 'file is private'); continue; }
    await o.sleep(o.delay);
    const h = await request(x.url, 'HEAD', o);
    if (h.transient) { res(x, 'unchecked', 'download: ' + h.why); continue; }
    if (h.status === 403 || h.status === 401) { res(x, 'refused', `download refused (HTTP ${h.status})`); continue; }
    if (h.status === 404 || h.status === 410) { res(x, 'missing', `download not found (HTTP ${h.status})`); continue; }
    if (!h.ok) { res(x, 'failed', `download: HTTP ${h.status}`); continue; }
    const len = seconds(m.length);
    if (len != null && x.d && lengthOff(len, x.d)) { res(x, 'length', `${clock(len)} on the Archive, ${clock(x.d)} in the catalog`); continue; }
    res(x, 'ok', '');
  }
  return out;
}

async function checkAll(files, opts = {}) {
  const o = { fetch: globalThis.fetch, sleep, concurrency: 2, delay: 600, tries: 3, backoff: [5000, 20000], timeout: 30000, ...opts };
  const byItem = new Map();
  for (const x of files) { if (!byItem.has(x.id)) byItem.set(x.id, []); byItem.get(x.id).push(x); }
  const ids = [...byItem.keys()], items = [];
  let next = 0;
  const worker = async () => { while (next < ids.length) { const id = ids[next++]; items.push(await checkItem(id, byItem.get(id), o)); if (o.progress) o.progress(items.length, ids.length); await o.sleep(o.delay); } };
  await Promise.all(Array.from({ length: Math.min(o.concurrency, ids.length) }, worker));
  return summarize(files, items, o.approvals || {});
}

const PROBLEM = new Set(['gone', 'missing', 'refused', 'failed', 'length']);
function summarize(files, items, approvals) {
  const fileByKey = new Map(files.map((x) => [x.key, x]));
  const results = items.flatMap((it) => it.results.map((r) => ({ ...r, file: fileByKey.get(r.key) })));
  const count = (s) => results.filter((r) => r.status === s).length;
  const streamOnly = items.filter((it) => it.restricted).map((it) => ({ id: it.id, approved: approvals[it.id] || '', files: files.filter((x) => x.id === it.id) }));
  const pending = streamOnly.filter((s) => !s.approved);
  const problems = results.filter((r) => PROBLEM.has(r.status));
  const keys = [...problems.map((r) => r.status + ' ' + r.key), ...pending.map((s) => 'stream-only ' + s.id)].sort();
  return {
    files: files.length, items: items.length, ok: count('ok'), unchecked: count('unchecked'),
    broken: problems.filter((r) => r.status !== 'length').length, lengthChanged: count('length'),
    problems: problems.length + pending.length,
    hash: crypto.createHash('sha1').update(keys.join('\n')).digest('hex').slice(0, 12),
    results, streamOnly, pending,
  };
}

// ---- report
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/\n/g, ' ');
const who = (x) => { const s = [...x.stations].sort(); return s.length > 3 ? `${s.length} stations` : s.join(', ') || x.pool; };
const label = (x) => esc(x.a && !x.t.startsWith(x.a) ? `${x.a}: ${x.t}` : x.t);
const link = (x) => `[${esc(x.f.split('/').pop())}](https://archive.org/details/${encodeURIComponent(x.id)})`;
const plural = (n, one, many = one + 's') => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
function table(rows, head, cells, cap = 60) {
  const sorted = rows.slice().sort((p, q) => who(p.file).localeCompare(who(q.file)) || label(p.file).localeCompare(label(q.file)));
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...sorted.slice(0, cap).map((r) => `| ${cells(r).join(' | ')} |`)];
  if (sorted.length > cap) lines.push('', `…and ${sorted.length - cap} more; the run's log lists every one.`);
  return lines.join('\n');
}
function report(s, when = new Date(), run = '') {
  const day = when.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const out = [`## Archive check, ${day}`, ''];
  const parts = [`${s.ok.toLocaleString('en-US')} fine`];
  if (s.broken) parts.push(`${s.broken} ${s.broken === 1 ? 'needs' : 'need'} fixing`);
  if (s.lengthChanged) parts.push(`${s.lengthChanged} changed length`);
  if (s.unchecked) parts.push(`${s.unchecked} couldn't be checked`);
  out.push(`Checked ${plural(s.files, 'file')} in ${plural(s.items, 'Archive item')}: ${parts.join(', ')}.` + (s.pending.length ? ` ${plural(s.pending.length, 'item needs', 'items need')} your stream-only review.` : ''));
  const broken = s.results.filter((r) => PROBLEM.has(r.status) && r.status !== 'length');
  if (broken.length) out.push('', '### Needs fixing', '', 'The radio fills these slots with the interval signal and a "technical difficulties" notice. Replace or remove each entry in the catalog file named.', '',
    table(broken, ['Station', 'Title', 'File', 'Problem', 'Catalog'], (r) => [who(r.file), label(r.file), link(r.file), r.note, '`' + r.file.catalog + '`']));
  const len = s.results.filter((r) => r.status === 'length');
  if (len.length) out.push('', '### Length changed', '', "The schedule uses the catalog's length, so these end early (the interval signal fills the rest) or get cut off. Update the length in the catalog, or check the new file.", '',
    table(len, ['Station', 'Title', 'File', 'Lengths'], (r) => [who(r.file), label(r.file), link(r.file), r.note]));
  if (s.pending.length) out.push('', '### Stream-only, waiting for your review', '', `The Archive streams these items but offers no download. To keep one, add its identifier to \`${APPROVALS}\` with a one-line reason; otherwise replace it.`, '',
    ['| Station | Item | Files |', '|---|---|---|', ...s.pending.map((p) => `| ${who({ stations: new Set(p.files.flatMap((x) => [...x.stations])), pool: p.files[0].pool })} | [${esc(p.id)}](https://archive.org/details/${encodeURIComponent(p.id)}) | ${p.files.length} |`)].join('\n'));
  const approved = s.streamOnly.filter((x) => x.approved);
  if (approved.length) out.push('', `Stream-only items you approved: ${approved.map((x) => `\`${x.id}\``).join(', ')}.`);
  const unchecked = s.results.filter((r) => r.status === 'unchecked');
  if (unchecked.length) out.push('', "### Couldn't check this week", '', 'Archive errors or timeouts, not necessarily broken files. They are checked again next week.', '',
    table(unchecked, ['Station', 'Title', 'File', 'Error'], (r) => [who(r.file), label(r.file), link(r.file), esc(r.note)], 20));
  if (!s.problems && !s.unchecked) out.push('', 'Every file is where the catalog expects it.');
  out.push('', `<sub>Weekly Archive check${run ? ` · [run log](${run})` : ''}</sub>`, `<!-- archive-check:${s.hash} -->`);
  return out.join('\n');
}

function args(argv) {
  const a = { items: '', limit: 0, concurrency: 2, delay: 600 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, ''), v = argv[i + 1];
    if (k in a) { a[k] = typeof a[k] === 'number' ? +v : String(v || ''); i++; }
  }
  return a;
}

async function main() {
  const a = args(process.argv.slice(2));
  let files = loadCatalog();
  const only = a.items.split(',').map((x) => x.trim()).filter(Boolean);
  if (only.length) files = files.filter((x) => only.includes(x.id));
  if (a.limit) { const keep = new Set([...new Set(files.map((x) => x.id))].slice(0, a.limit)); files = files.filter((x) => keep.has(x.id)); }
  if (!files.length) throw new Error('nothing to check');
  let approvals = {};
  try { approvals = JSON.parse(fs.readFileSync(path.join(ROOT, APPROVALS), 'utf8')); } catch (e) {}
  const t0 = Date.now();
  console.log(`Checking ${files.length} files in ${new Set(files.map((x) => x.id)).size} Archive items…`);
  const s = await checkAll(files, { concurrency: a.concurrency, delay: a.delay, approvals, progress: (n, of) => { if (n % 20 === 0 || n === of) console.log(`  ${n}/${of} items`); } });
  const env = process.env, run = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : '';
  const md = report(s, new Date(), run);
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'dist/archive-check.md'), md + '\n');
  fs.writeFileSync(path.join(ROOT, 'dist/archive-check.json'), JSON.stringify({ ...s, results: s.results.map((r) => ({ status: r.status, note: r.note, id: r.file.id, f: r.file.f, stations: [...r.file.stations], catalog: r.file.catalog })), streamOnly: s.streamOnly.map((x) => ({ id: x.id, approved: x.approved, files: x.files.length })), pending: s.pending.map((x) => x.id) }, null, 1));
  for (const r of s.results) if (r.status !== 'ok') console.log(`  ${r.status.padEnd(9)} ${r.file.id}/${r.file.f}: ${r.note}`);
  console.log(`Done in ${Math.round((Date.now() - t0) / 1000)} s: ${s.ok} ok, ${s.broken} broken, ${s.lengthChanged} length changed, ${s.pending.length} stream-only to review, ${s.unchecked} unchecked.`);
  const title = s.problems ? `Archive check: ${plural(s.problems, 'thing', 'things')} to look at` : 'Archive check: all clear';
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `problems=${s.problems}\nhash=${s.hash}\nfiles=${s.files}\ntitle=${title}\n`);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, md + '\n');
  if (s.unchecked > s.files * UNHEALTHY) { console.error(`${s.unchecked} of ${s.files} files couldn't be checked; the Archive may be down. Not reporting.`); process.exitCode = 2; }
}

module.exports = { seconds, lengthOff, loadCatalog, checkItem, checkAll, summarize, report, UA };
if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });
