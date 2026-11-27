const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../src/index.template.html', 'utf8');
const code = html.split('// ==ENGINE==')[1].split('// ==/ENGINE==')[0];
const CAT = JSON.parse(fs.readFileSync(__dirname + '/../dist/catalog.json', 'utf8'));
const api = new Function('CAT', code + '\nreturn { WEEK, EPOCH, STATIONS, parseCatalog, buildStation, makeScheduler, ia, ID, HOUR, canStart, fillerFor, weekOf, excludeFiles, loadSnapshots, applyLevels };')(CAT);
const { WEEK, EPOCH, STATIONS, parseCatalog, buildStation, makeScheduler, ia, ID, HOUR, canStart, fillerFor, weekOf, excludeFiles, loadSnapshots, applyLevels } = api;
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
// Hour clocks, the schedule half of Gate B. Every top of the hour has the legal ID, at :00 exactly
// or, inside a program longer than an hour, in the break between its items nearest the hour, and
// there are no legal IDs anywhere else. Every program starts right after a station break on a
// minute its station's clock allows for its length (canStart), and only programs longer than an
// hour run through a top of the hour. Nothing is faded out to make a break.
const fmtT = (s) => { const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = Math.round(s % 60); return `${'MTWTFSS'[d]} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };
function clockAudit(label, S, segs, stats) {
  const fails = [], progs = [];
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].k !== 'prog' || segs[i].pi !== 0) continue;
    const p = { i0: i, start: segs[i].s, d: 0, ids: [], bounds: [] };
    let j = i;
    let prev = null; // natural breaks: between items, but not after a track that runs into the next
    for (; j < segs.length && (j === i || segs[j].pi > 0 || segs[j].pi === -1); j++) { if (segs[j].pi === -1) p.ids.push(j); else { p.d += segs[j].d; if (j > i && !/>\s*$/.test(prev.t || '')) p.bounds.push(segs[j].s); prev = segs[j]; } }
    p.i1 = j; p.end = segs[j - 1].s + segs[j - 1].d; p.long = p.d > HOUR - ID || !!S.longForm; p.through = Math.floor((p.start - ID) / HOUR) !== Math.floor((p.end - 1) / HOUR); progs.push(p); i = j - 1;
  }
  const inLong = (s) => progs.find((p) => p.long && p.start < s && s < p.end);
  const legal = new Set(), worst = { dev: 0, at: 0 };
  for (let h = 0; h < WEEK / HOUR; h++) {
    const H = h * HOUR, exact = segs.findIndex((g) => g.k === 'id' && g.s === H);
    if (exact >= 0) { legal.add(exact); continue; }
    const p = inLong(H);
    if (!p) { fails.push(`no legal ID at ${fmtT(H)}`); continue; }
    const j = p.ids.reduce((b, k) => (b < 0 || Math.abs(segs[k].s - H) < Math.abs(segs[b].s - H) ? k : b), -1);
    if (j < 0) { fails.push(`no legal ID in the program running through ${fmtT(H)}`); continue; }
    const x = segs[j].s, dev = Math.abs(x - H), closer = p.bounds.filter((b) => b !== x && b !== x + ID && Math.abs(b - H) + ID < dev);
    const before = segs[j - 1]; if (before && before.pi > 0 && /\s*>\s*$/.test(before.t || '') && segs[j + 1] && segs[j + 1].pi > 0) fails.push(`legal ID at ${fmtT(x)} cuts into a segue`);
    if (closer.length) fails.push(`legal ID for ${fmtT(H)} at ${fmtT(x)}, but a break at ${fmtT(closer[0])} is nearer`);
    legal.add(j); if (dev > worst.dev) Object.assign(worst, { dev, at: H });
  }
  segs.forEach((g, i) => { if (g.k === 'id' && !legal.has(i)) fails.push(`legal ID away from the top of the hour at ${fmtT(g.s)}`); });
  for (const p of progs) {
    const br = segs[p.i0 - 1];
    if (!br || (br.k !== 'id' && br.k !== 'imaging') || br.d !== ID) fails.push(`program at ${fmtT(p.start)} has no station break before it`);
    if (!canStart(S, p.d, p.start - ID)) fails.push(`${Math.round(p.d / 60)}-minute program starts at ${fmtT(p.start)}`);
    if (!p.long && Math.floor((p.start - ID) / HOUR) !== Math.floor((p.end - 1) / HOUR)) fails.push(`program at ${fmtT(p.start)} runs through the top of the hour`);
  }
  segs.forEach((g, i) => {
    if (g.k === 'imaging' && !(segs[i + 1] && segs[i + 1].pi === 0)) fails.push(`station break at ${fmtT(g.s)} without a program after it`);
    if (g.cut) fails.push(`faded out at ${fmtT(g.s)}`);
    if (g.f && Math.floor(g.s / HOUR) !== Math.floor((g.s + g.d - 1e-6) / HOUR) && !inLong(g.s + g.d / 2)) fails.push(`${g.k} at ${fmtT(g.s)} runs through the top of the hour`);
  });
  if (stats) {
    // the longest run of filler between two programs, and how much of the week is filler
    let run = 0, longest = 0, filler = 0;
    for (const g of segs) { const f = g.k === 'ad' || g.k === 'poem' || g.k === 'interval' || (g.k === 'music' && S.type !== 'music'); if (f) { run += g.d; filler += g.d; longest = Math.max(longest, run); } else if (g.k === 'prog' || g.k === 'music') run = 0; }
    const ints = segs.filter((g) => g.k === 'interval').map((g) => g.d);
    Object.assign(stats, { programs: progs.length, long: progs.filter((p) => p.through).length, filler: filler / WEEK, longest, worstID: worst, intervals: ints.length, maxInterval: Math.max(0, ...ints), imaging: segs.filter((g) => g.k === 'imaging').length });
  }
  for (const f of fails.slice(0, 5)) bad(`${label}: ${f}`);
  if (fails.length > 5) bad(`${label}: ${fails.length - 5} more`);
  return fails.length;
}
for (const S of STATIONS) {
  const st = {};
  clockAudit(`${S.key} week 0`, S, all[S.key], st);
  clockAudit(`${S.key} week 1`, S, buildStation(S, 1, P));
  console.log(`clock ${S.call}: ${String(st.programs).padStart(4)} programs${st.long ? ` (${st.long} through the hour; legal ID at most ${Math.round(st.worstID.dev / 60)} min from the hour)` : ''}, filler ${(st.filler * 100).toFixed(1)}% of the week, longest filler run ${Math.round(st.longest / 60)} min, ${st.imaging} station breaks, interval signal ${st.intervals}× (longest ${Math.round(st.maxInterval)} s)`);
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
// between(): every start in a stretch, in order, across a week boundary, each with its program's end.
for (const S of STATIONS) {
  const from = EPOCH + WEEK - 3 * 3600, to = EPOCH + WEEK + 3 * 3600, list = SCH.between(S, from, to);
  if (!list.length) bad(S.key + ' between: nothing listed');
  if (list.some((u, i) => u.at < from || u.at >= to || !(u.end > u.at) || (i && u.at < list[i - 1].end - 1e-6))) bad(S.key + ' between: out of order, out of range, or overlapping');
  if (!list.some((u) => u.at < EPOCH + WEEK) || !list.some((u) => u.at >= EPOCH + WEEK)) bad(S.key + ' between: should list both weeks');
  const up = SCH.upcoming(S, from, 3).filter((u) => u.at < to);
  if (up.some((u, i) => !list[i] || Math.abs(u.at - list[i].at) > 1e-6)) bad(S.key + ' between: disagrees with upcoming');
}
// week boundary continuity
for (const S of STATIONS) { const b = EPOCH + WEEK; const c1 = SCH.at(S, b - 0.5), c2 = SCH.at(S, b + 0.5); if (c1.week + 1 !== c2.week || c2.seg.s !== 0) bad(S.key + ' week boundary'); }
// Snapshots: every frozen week builds a clean schedule for that week.
const audit = (label, S, segs) => {
  if (segs[0].s !== 0) bad(label + ' first seg not at 0');
  for (let i = 0; i < segs.length; i++) { const g = segs[i]; if (!(g.d > 0)) bad(`${label} seg ${i} non-positive d`); if (i && Math.abs(segs[i - 1].s + segs[i - 1].d - g.s) > 1e-6) bad(`${label} gap/overlap at ${i}`); if (g.k === 'interval' && g.d > MAX_FILLER) bad(`${label}: ${Math.round(g.d)} s of interval signal`); }
  const last = segs[segs.length - 1]; if (Math.abs(last.s + last.d - WEEK) > 1e-6) bad(label + ' does not end at WEEK');
};
const snapDir = __dirname + '/../snapshots';
const snaps = fs.existsSync(snapDir) ? fs.readdirSync(snapDir).filter((n) => n.endsWith('.json')).sort() : [];
for (const n of snaps) {
  const s = JSON.parse(fs.readFileSync(snapDir + '/' + n, 'utf8'));
  const w = weekOf(s.from);
  if (n !== s.from + '.json') bad(`${n} says it starts ${s.from}`);
  if (!Number.isInteger(w)) { bad(`${n}: ${s.from} is not a schedule Monday`); continue; }
  const Ps = excludeFiles(applyLevels(parseCatalog(s.catalog), s.levels || {}), s.exclude);
  for (const S of STATIONS) { const segs = buildStation(S, w, Ps); audit(`${n} ${S.key}`, S, segs); clockAudit(`${n} ${S.key}`, S, segs); }
  console.log(`snapshot ${s.from} (week ${w}): ${s.exclude.length} files held out, levels for ${Object.values(s.levels || {}).reduce((k, o) => k + Object.keys(o || {}).length, 0)} files`);
}
// Holding files out: they never air, emptied series and shows drop away, and the week stays whole.
{
  const P2 = parseCatalog(CAT), gone = P2.whodunit[0].eps.map((e) => e.id + '/' + e.f).concat(P2.shows[0].items.slice(0, 2).map((x) => x.id + '/' + x.f));
  excludeFiles(P2, gone);
  if (P2.whodunit.length !== P.whodunit.length - 1) bad('excludeFiles: a series with every episode held out should drop away');
  if (P2.shows[0].items.length !== P.shows[0].items.length - 2) bad('excludeFiles: held-out tracks should leave the rest of the show');
  if (P2.vault.some((x) => gone.includes(x.id + '/' + x.f))) bad('excludeFiles: held-out tracks still in the vault pool');
  for (const S of STATIONS) { const segs = buildStation(S, 0, P2); audit('excluded ' + S.key, S, segs); clockAudit('excluded ' + S.key, S, segs); if (segs.some((g) => g.f && gone.includes(g.id + '/' + g.f))) bad(`excludeFiles: ${S.key} still plays a held-out file`); }
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
// Levels (catalog/levels.json): a file with an entry is scheduled for its trimmed length, rounded up to a
// whole second, and carries its skip point and gain; one without plays whole; a bad entry is ignored.
{
  const P3 = parseCatalog(CAT), ep = P3.whodunit[0].eps[0], other = P3.whodunit[0].eps[1], tr = P3.shows[0].items.find((t) => P3.vault.some((v) => v.f === t.f));
  const LV = { [ep.id]: { [ep.f]: [-3.5, 1.2, 1700.4], [other.f]: [2, 9, 9] }, [tr.id]: { [tr.f]: [1.5, 0.4, 200] } };
  const d0 = other.d;
  applyLevels(P3, LV);
  if (ep.d !== 1700 || ep.skip !== 1.2 || ep.gain !== -3.5) bad(`applyLevels: expected d 1700, skip 1.2, gain -3.5, got ${ep.d}, ${ep.skip}, ${ep.gain}`);
  if (other.d !== d0 || other.skip !== undefined) bad('applyLevels: an entry that ends before it starts should be ignored');
  if (P3.whodunit[0].eps[2].skip !== undefined) bad('applyLevels: a file with no entry should play whole');
  const v = P3.vault.find((x) => x.f === tr.f);
  if (tr.d !== 200 || v.d !== 200 || v.gain !== 1.5) bad('applyLevels: a concert track and its vault copy should both take the levels');
  // On the page: a later snapshot lists only the items whose levels change, and null for levels that went away.
  const [a, b, c] = api.loadSnapshots([{ from: '2026-11-23', exclude: [], catalog: CAT, levels: LV }, { from: '2026-11-30', exclude: [], partial: true, catalog: {}, levels: { [tr.id]: null } }, { from: '2026-12-07', exclude: [], partial: true, catalog: {} }]);
  const find = (Px) => Px.whodunit[0].eps.find((x) => x.f === ep.f), tfind = (Px) => Px.shows[0].items.find((x) => x.f === tr.f);
  if (find(a.P).skip !== 1.2 || find(b.P).skip !== 1.2 || find(c.P).skip !== 1.2) bad('loadSnapshots: levels should carry into later partial snapshots');
  if (tfind(a.P).skip !== 0.4 || tfind(b.P).skip !== undefined || tfind(c.P).skip !== undefined) bad('loadSnapshots: levels set to null should go away, and stay gone');
  // The real table: every station, several weeks, audits clean with its trimmed lengths.
  const lvPath = __dirname + '/../catalog/levels.json';
  if (fs.existsSync(lvPath)) {
    const T = JSON.parse(fs.readFileSync(lvPath, 'utf8')), PL = applyLevels(parseCatalog(CAT), T.items);
    let n = 0, cut = 0;
    for (const S of STATIONS) for (const w of [0, 1, 2]) { const segs = buildStation(S, w, PL); audit(`levels ${S.key} week ${w}`, S, segs); clockAudit(`levels ${S.key} week ${w}`, S, segs); }
    const vis = new Set(), seen = new Set(); const walk = (o) => { if (!o || typeof o !== 'object' || vis.has(o)) return; vis.add(o); if (Array.isArray(o)) return o.forEach(walk); if (o.f && o.skip !== undefined && !seen.has(o.id + '/' + o.f)) { seen.add(o.id + '/' + o.f); n++; cut += o.skip; } for (const k of ['eps', 'items']) if (o[k]) walk(o[k]); };
    Object.values(PL).forEach(walk);
    console.log(`levels: ${T.files} files in catalog/levels.json, ${n} in this catalog; every station audits clean over weeks 0–2`);
  }
}
// Filler for a slot whose recording can't play: the station's own, never longer than the gap, close
// to it once the gap is a few minutes, the same for the same seed, and without the files to skip.
for (const S of STATIONS) {
  for (const secs of [90, 300, 900, 1700]) {
    const a = fillerFor(S, P, secs, 7), total = a.reduce((x, it) => x + it.d, 0);
    if (total > secs) bad(`fillerFor ${S.key} ${secs} s: ${Math.round(total)} s of filler`);
    if (secs >= 300 && secs - total > 60) bad(`fillerFor ${S.key} ${secs} s: ${Math.round(secs - total)} s left over`);
    if (JSON.stringify(a) !== JSON.stringify(fillerFor(S, P, secs, 7))) bad(`fillerFor ${S.key}: not the same for the same seed`);
    if (a.some((it) => !it.f || it.k === 'prog')) bad(`fillerFor ${S.key}: something other than filler`);
    const skip = new Set(a.map((it) => ia(it.id, it.f)));
    if (fillerFor(S, P, secs, 7, skip).some((it) => skip.has(ia(it.id, it.f)))) bad(`fillerFor ${S.key}: played a file it was told to skip`);
  }
}
// URL sanity
console.log(ia(P.works[0].items[0].id, P.works[0].items[0].f));
console.log(ia(P.g78[0].id, P.g78[0].f));
console.log(fail ? `${fail} FAILURES` : 'ALL CHECKS PASSED');
process.exitCode = fail ? 1 : 0;
