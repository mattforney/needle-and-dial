const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../src/index.template.html', 'utf8');
const code = html.split('// ==ENGINE==')[1].split('// ==/ENGINE==')[0];
const CAT = JSON.parse(fs.readFileSync(__dirname + '/../dist/catalog.json', 'utf8'));
const api = new Function('CAT', code + '\nreturn { WEEK, EPOCH, STATIONS, parseCatalog, buildStation, makeScheduler, ia, ID, weekOf, excludeFiles, loadSnapshots };')(CAT);
const { WEEK, EPOCH, STATIONS, parseCatalog, buildStation, makeScheduler, ia, ID, weekOf, excludeFiles, loadSnapshots } = api;
const P = parseCatalog(CAT);
let fail = 0; const bad = (m) => { fail++; console.log('FAIL', m); };
// The page script runs in sloppy mode, where a second function with the same name silently replaces
// the first. Parsing it as strict code turns that, and other strict-mode slips, into a failure.
const page = html.split('<script>').pop().split('</script>')[0];
try { new Function('"use strict";\n' + page); } catch (e) { bad('page script: ' + e.message); }
const t0 = Date.now();
const all = {};
for (const S of STATIONS) all[S.key] = buildStation(S, 0, P);
console.log('build all stations (week 0):', Date.now() - t0, 'ms');
for (const S of STATIONS) {
  const segs = all[S.key];
  if (segs[0].s !== 0) bad(S.key + ' first seg not at 0');
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    if (!(g.d > 0)) bad(`${S.key} seg ${i} non-positive d=${g.d}`);
    if (i && Math.abs(segs[i - 1].s + segs[i - 1].d - g.s) > 1e-6) bad(`${S.key} gap/overlap at ${i}`);
    if (g.f && !g.id) bad(`${S.key} media seg without id`);
    if (g.cut && !(g.nd > g.d)) bad(`${S.key} cut seg ${i} not longer than its slot (${g.nd} <= ${g.d})`);
    if (g.k === 'prog' && !g.pi && S.type !== 'music' && g.s % S.grid !== 0) bad(`${S.key} program start off-grid at ${g.s} (${g.s % S.grid})`);
  }
  const last = segs[segs.length - 1];
  if (Math.abs(last.s + last.d - WEEK) > 1e-6) bad(`${S.key} does not end at WEEK: ${last.s + last.d}`);
  // stats
  const by = {}; let maxInt = 0, progs = 0, cuts = 0; const titles = new Map();
  for (const g of segs) { by[g.k] = (by[g.k] || 0) + g.d; if (g.k === 'interval') maxInt = Math.max(maxInt, g.d); if (g.k === 'prog' && !g.pi) { progs++; const k = g.f; titles.set(k, (titles.get(k) || 0) + 1); } if (g.cut) cuts++; }
  const pct = (k) => ((by[k] || 0) / WEEK * 100).toFixed(1) + '%';
  const reps = [...titles.values()]; const maxRep = reps.length ? Math.max(...reps) : 0;
  console.log(`${S.call} ${S.key.padEnd(10)} segs=${String(segs.length).padStart(5)} prog=${pct('prog')} music=${pct('music')} ad=${pct('ad')} poem=${pct('poem')} id=${pct('id')} interval=${pct('interval')} maxInterval=${Math.round(maxInt)}s programs/wk=${progs} uniquePrograms=${titles.size} maxRepeats=${maxRep} cuts=${cuts}`);
}
// No filler runs past a minute: the interval signal is a station's dead air.
const MAX_FILLER = 60;
for (const S of STATIONS) for (const w of [0, 1]) for (const g of w ? buildStation(S, 1, P) : all[S.key]) if (g.k === 'interval' && g.d > MAX_FILLER) bad(`${S.key} week ${w}: ${Math.round(g.d)} s of interval signal at ${Math.round(g.s)} s (limit ${MAX_FILLER} s)`);
// determinism
for (const S of STATIONS) { const a = JSON.stringify(buildStation(S, 0, P)), b = JSON.stringify(all[S.key]); if (a !== b) bad(S.key + ' not deterministic'); }
// week-to-week variety
for (const S of STATIONS) { const w1 = buildStation(S, 1, P); const same = w1.length === all[S.key].length && w1.every((g, i) => g.f === all[S.key][i].f); if (same) bad(S.key + ' week 1 identical to week 0'); }
// scheduler API at a few instants
const SCH = makeScheduler(P);
const now = Date.UTC(2026, 10, 25, 5, 40) / 1000;
for (const S of STATIONS) { const c = SCH.at(S, now); const up = SCH.upcoming(S, now, 3); const cur = SCH.current(S, now); if (!(c.off >= 0 && c.off < c.seg.d)) bad(S.key + ' bad offset'); if (up.length !== 3 || up.some((u, i) => i && u.at <= up[i - 1].at)) bad(S.key + ' upcoming not increasing'); console.log(`${S.call}: now=[${c.seg.k}] ${c.seg.t || ''} (+${Math.round(c.off)}s/${Math.round(c.seg.d)}s); next ${up.map(u => new Date(u.at * 1000).toISOString().slice(11, 16) + 'Z ' + (u.seg.t || '')).join(' | ')}`); }
// week boundary continuity
for (const S of STATIONS) { const b = EPOCH + WEEK; const c1 = SCH.at(S, b - 0.5), c2 = SCH.at(S, b + 0.5); if (c1.week + 1 !== c2.week || c2.seg.s !== 0) bad(S.key + ' week boundary'); }
// Snapshots: every frozen week builds a clean schedule for that week.
const audit = (label, S, segs) => {
  if (segs[0].s !== 0) bad(label + ' first seg not at 0');
  for (let i = 0; i < segs.length; i++) { const g = segs[i]; if (!(g.d > 0)) bad(`${label} seg ${i} non-positive d`); if (i && Math.abs(segs[i - 1].s + segs[i - 1].d - g.s) > 1e-6) bad(`${label} gap/overlap at ${i}`); if (g.k === 'interval' && g.d > MAX_FILLER) bad(`${label}: ${Math.round(g.d)} s of interval signal`); if (g.k === 'prog' && !g.pi && S.type !== 'music' && g.s % S.grid !== 0) bad(`${label} program off-grid at ${g.s}`); }
  const last = segs[segs.length - 1]; if (Math.abs(last.s + last.d - WEEK) > 1e-6) bad(label + ' does not end at WEEK');
};
const snapDir = __dirname + '/../snapshots';
const snaps = fs.existsSync(snapDir) ? fs.readdirSync(snapDir).filter((n) => n.endsWith('.json')).sort() : [];
for (const n of snaps) {
  const s = JSON.parse(fs.readFileSync(snapDir + '/' + n, 'utf8'));
  const w = weekOf(s.from);
  if (n !== s.from + '.json') bad(`${n} says it starts ${s.from}`);
  if (!Number.isInteger(w)) { bad(`${n}: ${s.from} is not a schedule Monday`); continue; }
  const Ps = excludeFiles(parseCatalog(s.catalog), s.exclude);
  for (const S of STATIONS) audit(`${n} ${S.key}`, S, buildStation(S, w, Ps));
  console.log(`snapshot ${s.from} (week ${w}): ${s.exclude.length} files held out`);
}
// Holding files out: they never air, emptied series and shows drop away, and the week stays whole.
{
  const P2 = parseCatalog(CAT), gone = P2.whodunit[0].eps.map((e) => e.id + '/' + e.f).concat(P2.shows[0].items.slice(0, 2).map((x) => x.id + '/' + x.f));
  excludeFiles(P2, gone);
  if (P2.whodunit.length !== P.whodunit.length - 1) bad('excludeFiles: a series with every episode held out should drop away');
  if (P2.shows[0].items.length !== P.shows[0].items.length - 2) bad('excludeFiles: held-out tracks should leave the rest of the show');
  if (P2.vault.some((x) => gone.includes(x.id + '/' + x.f))) bad('excludeFiles: held-out tracks still in the vault pool');
  for (const S of STATIONS) { const segs = buildStation(S, 0, P2); audit('excluded ' + S.key, S, segs); if (segs.some((g) => g.f && gone.includes(g.id + '/' + g.f))) bad(`excludeFiles: ${S.key} still plays a held-out file`); }
  const two = makeScheduler((w) => (w < 1 ? P : P2)), t1 = EPOCH + WEEK + 3600;
  if (JSON.stringify(two.forWeek(STATIONS[0], 0)) !== JSON.stringify(all[STATIONS[0].key])) bad('makeScheduler: week 0 should use its own catalog');
  if (two.forWeek(STATIONS[0], 1).some((g) => g.f && gone.includes(g.id + '/' + g.f))) bad('makeScheduler: week 1 should use the later catalog');
  if (!two.at(STATIONS[0], t1).seg) bad('makeScheduler over two catalogs: no segment');
}
// The page's form: a later snapshot listing only changed stations takes the rest from the one before.
{
  const full = { from: '2026-11-23', exclude: [], catalog: CAT }, later = { from: '2026-11-30', exclude: [], partial: true, catalog: { tapers: { k: 'tapers', s: CAT.tapers.s.slice(1) } } };
  const [a, b] = api.loadSnapshots([full, later]);
  if (a.week !== 0 || b.week !== 1) bad('loadSnapshots: weeks');
  if (b.P.shows.length !== a.P.shows.length - 1 || b.P.whodunit.length !== a.P.whodunit.length) bad('loadSnapshots: a partial snapshot should change only the stations it lists');
}
// URL sanity
console.log(ia(P.works[0].items[0].id, P.works[0].items[0].f));
console.log(ia(P.g78[0].id, P.g78[0].f));
console.log(fail ? `${fail} FAILURES` : 'ALL CHECKS PASSED');
process.exitCode = fail ? 1 : 0;
