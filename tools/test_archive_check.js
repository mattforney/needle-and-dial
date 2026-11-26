// Offline tests for the Archive check: a fake archive.org stands in for every kind of answer the
// real one gives (checked against live responses on 25 Nov 2026), so no network is needed.
//   node tools/test_archive_check.js
'use strict';
const { seconds, loadCatalog, checkAll, report } = require('./archive_check.js');

let fail = 0;
const eq = (got, want, what) => { if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`FAIL ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const ok = (cond, what) => { if (!cond) { fail++; console.log('FAIL ' + what); } };

// Lengths come as seconds or clock time.
eq([seconds('06:21'), seconds('1758.29'), seconds('1:02:03'), seconds('1773'), seconds(''), seconds('abc'), seconds(null)], [381, 1758.29, 3723, 1773, null, null, null], 'seconds()');

const mk = (id, f, d) => ({ key: id + '/' + f, id, f, d, t: f.replace('.mp3', ''), a: '', pool: 'test', stations: new Set(['WTST']), url: `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(f)}`, catalog: 'catalog/test.json' });
const files = [
  mk('good', 'a.mp3', 100), mk('good', 'b.mp3', 100),
  mk('gone', 'x.mp3', 50), mk('dark', 'y.mp3', 50),
  mk('partial', 'here.mp3', 60), mk('partial', 'missing.mp3', 60), mk('partial', 'priv.mp3', 60),
  mk('longer', 'l.mp3', 100), mk('close', 'c.mp3', 100),
  mk('restricted', 'r.mp3', 200), mk('approved', 'p.mp3', 200),
  mk('dl', 'f403.mp3', 10), mk('dl', 'f404.mp3', 10), mk('dl', 'f503.mp3', 10), mk('dl', 'f500once.mp3', 10),
  mk('meta503', 'm.mp3', 10), mk('metathrow', 'n.mp3', 10), mk('pipe', 'a|b.mp3', 10),
];
const META = {
  good: { metadata: {}, files: [{ name: 'a.mp3', length: '100' }, { name: 'b.mp3', length: '01:40' }] },
  gone: {}, // what the metadata API returns for an item that doesn't exist
  dark: { is_dark: true },
  partial: { metadata: {}, files: [{ name: 'here.mp3', length: '60' }, { name: 'priv.mp3', length: '60', private: 'true' }] },
  longer: { metadata: {}, files: [{ name: 'l.mp3', length: '130' }] },
  close: { metadata: {}, files: [{ name: 'c.mp3', length: '101.5' }] },
  restricted: { metadata: { 'access-restricted-item': 'true', title: 'A Concert | Live' }, files: [{ name: 'r.mp3', length: '03:20' }] },
  approved: { metadata: { 'access-restricted-item': 'true' }, files: [{ name: 'p.mp3', length: '200' }] },
  dl: { metadata: {}, files: ['f403.mp3', 'f404.mp3', 'f503.mp3', 'f500once.mp3'].map((name) => ({ name, length: '10' })) },
  pipe: { metadata: {}, files: [] }, // a missing file whose name needs escaping in the report
};
const resp = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body });
function fakeArchive() {
  const calls = [];
  let once = 0;
  const fetch = async (url, init) => {
    calls.push(init.method + ' ' + url);
    if (!String(init.headers['User-Agent']).startsWith('NeedleAndDial-ArchiveCheck/')) throw new Error('request without our user agent');
    const m = /^https:\/\/archive\.org\/metadata\/(.+)$/.exec(url);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (id === 'meta503') return resp(503, null);
      if (id === 'metathrow') { const e = new TypeError('fetch failed'); e.cause = { code: 'ECONNRESET' }; throw e; }
      return resp(200, META[id]);
    }
    const f = decodeURIComponent(url.split('/').pop());
    if (f === 'f403.mp3') return resp(403);
    if (f === 'f404.mp3') return resp(404);
    if (f === 'f503.mp3') return resp(503);
    if (f === 'f500once.mp3') return resp(once++ ? 200 : 500);
    return resp(200);
  };
  return { fetch, calls };
}

(async () => {
  const A = fakeArchive();
  const s = await checkAll(files, { fetch: A.fetch, sleep: async () => {}, delay: 0, approvals: { approved: 'kept for the test' } });
  const st = Object.fromEntries(s.results.map((r) => [r.key, r.status]).sort());
  eq(st, Object.fromEntries(Object.entries({
    'good/a.mp3': 'ok', 'good/b.mp3': 'ok', 'gone/x.mp3': 'gone', 'dark/y.mp3': 'gone',
    'partial/here.mp3': 'ok', 'partial/missing.mp3': 'missing', 'partial/priv.mp3': 'refused',
    'longer/l.mp3': 'length', 'close/c.mp3': 'ok', 'restricted/r.mp3': 'ok', 'approved/p.mp3': 'ok',
    'dl/f403.mp3': 'refused', 'dl/f404.mp3': 'missing', 'dl/f503.mp3': 'unchecked', 'dl/f500once.mp3': 'ok',
    'meta503/m.mp3': 'unchecked', 'metathrow/n.mp3': 'unchecked', 'pipe/a|b.mp3': 'missing',
  }).sort()), 'status of every file');
  const note = (k) => s.results.find((r) => r.key === k).note;
  ok(/dark/.test(note('dark/y.mp3')), 'a dark item says so');
  ok(/1:40 on the Archive|2:10 on the Archive/.test(note('longer/l.mp3')), 'length note gives both lengths: ' + note('longer/l.mp3'));
  ok(/ECONNRESET/.test(note('metathrow/n.mp3')), 'network errors keep their code');
  eq([s.files, s.ok, s.broken, s.lengthChanged, s.unchecked, s.problems], [18, 7, 7, 1, 3, 9], 'totals: files, ok, broken, length, unchecked, problems');
  eq(s.pending.map((x) => x.id), ['restricted'], 'unapproved stream-only items wait for review');
  eq(s.streamOnly.filter((x) => x.approved).map((x) => x.id), ['approved'], 'approved stream-only items are not problems');
  // Requests: no download probe for files the metadata already rules out; retries for transient errors.
  const n = (re) => A.calls.filter((c) => re.test(c)).length;
  eq([n(/HEAD .*missing\.mp3$/), n(/HEAD .*priv\.mp3$/), n(/HEAD .*\/gone\//), n(/HEAD .*\/dark\//)], [0, 0, 0, 0], 'no download probe after a metadata verdict');
  eq([n(/HEAD .*f503\.mp3$/), n(/HEAD .*f500once\.mp3$/), n(/GET .*meta503$/), n(/GET .*metathrow$/)], [3, 2, 3, 3], 'tries per transient failure');
  // The fingerprint follows the problem list, not the run: same problems, same hash; approve one, new hash.
  const again = await checkAll(files, { fetch: fakeArchive().fetch, sleep: async () => {}, delay: 0, approvals: { approved: 'kept for the test' } });
  eq(again.hash, s.hash, 'hash is stable across runs');
  const moved = await checkAll(files, { fetch: fakeArchive().fetch, sleep: async () => {}, delay: 0, approvals: { approved: 'x', restricted: 'y' } });
  ok(moved.hash !== s.hash && moved.pending.length === 0, 'approving an item changes the hash and clears it from review');
  const md = report(s, new Date(Date.UTC(2026, 10, 29, 14, 30)), 'https://example.test/run');
  for (const h of ['## Archive check, Sun, Nov 29, 2026', '### Needs fixing', '### Length changed', '### Stream-only, waiting for your review', "### Couldn't check this week", `<!-- archive-check:${s.hash} -->`, '[run log](https://example.test/run)', 'a\\|b.mp3', '[A Concert \\| Live](https://archive.org/details/restricted)'])
    ok(md.includes(h), 'report has ' + JSON.stringify(h));
  const clean = report(await checkAll(files.slice(0, 2), { fetch: fakeArchive().fetch, sleep: async () => {}, delay: 0 }));
  ok(clean.includes('Every file is where the catalog expects it.') && !clean.includes('###'), 'a clean run says so and has no sections');

  // The real catalog: every file found, placed on a station and in a catalog file.
  const real = loadCatalog();
  const items = new Set(real.map((x) => x.id)).size;
  ok(real.length > 1000 && items > 150, `real catalog enumerates (${real.length} files, ${items} items)`);
  eq(real.filter((x) => !x.stations.size).map((x) => x.key), [], 'every file is on some station');
  eq(real.filter((x) => !x.catalog).map((x) => x.key), [], 'every file is found in a catalog file');
  eq(real.filter((x) => !(x.d > 0)).map((x) => x.key), [], 'every file has a length');
  console.log(`${real.length} files in ${items} items; first: ${real[0].url}`);

  console.log(fail ? `${fail} FAILURES` : 'ALL ARCHIVE-CHECK TESTS PASSED');
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
