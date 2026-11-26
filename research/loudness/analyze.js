// Turns the survey's results.json into the figures the design decisions need:
//   1. how far apart files are: overall, within each pool, within one Archive item vs between items
//   2. the jumps a listener hears: the level change at each change of recording, weighted by how often
//      each kind of change happens in a real week of each station's schedule
//   3. how much quiet sits at the ends of files, and dead air in the middle
//   4. what a target level costs: how many files would need a boost they don't have the headroom for
//   5. whether the catalog's durations match the files (the schedule is built on them)
//
//   node research/loudness/analyze.js [research/loudness/results.json]   (needs dist/catalog.json)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const res = JSON.parse(fs.readFileSync(process.argv[2] || path.join(__dirname, 'results.json'), 'utf8'));
const ok = res.files.filter((x) => !x.error && x.I != null && x.I > -70);
// Results measured before the tool's fix: where 25 dB below the program fell under -50 dBFS, "quiet" must equal "silent".
for (const x of ok) if (x.prog != null && x.prog - 25 < -50) { x.lead_quiet = x.lead_silent; x.tail_quiet = x.tail_silent; }
// A file sampled under two pools (KTPR's vault tracks are concert tracks) counts once.
const seenFile = new Set(), dupes = ok.filter((x) => { const k = x.id + '/' + x.f; if (seenFile.has(k)) return true; seenFile.add(k); return false; });
for (const x of dupes) ok.splice(ok.indexOf(x), 1);
const failed = res.files.filter((x) => x.error);

const q = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const f1 = (x) => (x == null || !isFinite(x) ? '–' : (Math.round(x * 10) / 10).toFixed(1));
const pct = (n, d) => (d ? Math.round((100 * n) / d) + '%' : '–');
const by = (a, k) => a.reduce((m, x) => (m.get(k(x)) || m.set(k(x), []).get(k(x))).push(x) && m, new Map());
const out = [];
const say = (s = '') => out.push(s);

// ---- the engine and this week's schedule, for which recordings follow which
const html = fs.readFileSync(path.join(ROOT, 'src/index.template.html'), 'utf8');
const code = html.split('// ==ENGINE==')[1].split('// ==/ENGINE==')[0];
const CAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/catalog.json'), 'utf8'));
const api = new Function('CAT', code + '\nreturn { STATIONS, parseCatalog, buildStation };')(CAT);
const P = api.parseCatalog(CAT), poolOf = new Map();
for (const pool of Object.keys(P)) { const vis = new Set(); const walk = (o) => { if (!o || typeof o !== 'object' || vis.has(o)) return; vis.add(o); if (Array.isArray(o)) return o.forEach(walk); if (typeof o.id === 'string' && typeof o.f === 'string' && !poolOf.has(o.id + '/' + o.f)) poolOf.set(o.id + '/' + o.f, pool); Object.values(o).forEach(walk); }; walk(P[pool]); }

say(`# Loudness survey: findings`);
say();
say(`${ok.length} files measured${dupes.length ? ` (${dupes.length} more were sampled twice, under two pools, and measured the same both times)` : ''}${failed.length ? `; ${failed.length} failed (${[...new Set(failed.map((x) => x.error.split(':')[0]))].join(', ')})` : ''}. Measured ${res.started ? res.started.slice(0, 10) : ''} with ${res.ffmpeg || 'ffmpeg'}.`);
say();

// ---- 1. spread
const I = ok.map((x) => x.I);
say(`## 1. How far apart files are`);
say();
say(`All files: median ${f1(q(I, 0.5))} LUFS; middle half ${f1(q(I, 0.25))} to ${f1(q(I, 0.75))} (${f1(q(I, 0.75) - q(I, 0.25))} LU wide); middle 90% ${f1(q(I, 0.05))} to ${f1(q(I, 0.95))} (${f1(q(I, 0.95) - q(I, 0.05))} LU); lowest ${f1(Math.min(...I))}, highest ${f1(Math.max(...I))}.`);
say();
say('| Pool | Files | Median LUFS | Middle half | Lowest to highest | Loudness range (median LU) | True peak, highest (dBTP) | Format |');
say('|---|---|---|---|---|---|---|---|');
const pools = [...by(ok, (x) => x.pool).entries()].sort((a, b) => q(a[1].map((x) => x.I), 0.5) - q(b[1].map((x) => x.I), 0.5));
for (const [p, r] of pools) {
  const v = r.map((x) => x.I), fmt = [...by(r, (x) => `${x.codec || '?'} ${x.channels === 1 ? 'mono' : x.channels === 2 ? 'stereo' : (x.channels || '?') + 'ch'} ${x.kbps || '?'}k`).entries()].sort((a, b) => b[1].length - a[1].length).map(([k, a]) => (a.length > 1 ? `${k} ×${a.length}` : k)).slice(0, 2).join(', ');
  say(`| ${p} | ${r.length} | ${f1(q(v, 0.5))} | ${f1(q(v, 0.25))} to ${f1(q(v, 0.75))} | ${f1(Math.min(...v))} to ${f1(Math.max(...v))} | ${f1(q(r.map((x) => x.LRA), 0.5))} | ${f1(Math.max(...r.map((x) => x.TP)))} | ${fmt} |`);
}
say();
// within an Archive item vs between items: pairs of files from the same item, against pairs from different items of the same pool
const within = [], between = [];
for (const [, r] of pools) for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) (r[i].id === r[j].id ? within : between).push(Math.abs(r[i].I - r[j].I));
say(`Two files from the same Archive item differ by a median ${f1(q(within, 0.5))} LU (${within.length} pairs; 90th percentile ${f1(q(within, 0.9))}); two from different items of the same pool by ${f1(q(between, 0.5))} LU (${between.length} pairs; 90th percentile ${f1(q(between, 0.9))}).`);
say();

// ---- 2. jumps at each change of recording, from a real week of each station
// Each change from one recording to the next (station IDs between them skipped) is a kind: the two pools, and whether
// both files come from the same Archive item (a concert's next track, a work's next movement). Its expected jump is
// over every pair of measured files that could make that change: different items for a change between items, the
// same item for a change within one. A pool sampled one file per item can't show changes within an item: unmeasured.
const T = -20, HEAD = -1;
const level = { now: (x) => x.I, pool: (x) => x.I - poolMed.get(x.cpool), file: (x) => { let g = T - x.I; if (g > 0) g = Math.max(0, Math.min(g, HEAD - x.TP)); return x.I + g; } };
// The schedule's pools, by the catalog (a vault track belongs to its concert), not the sample's labels.
for (const x of ok) x.cpool = poolOf.get(x.id + '/' + x.f) || x.pool;
const cpools = [...by(ok, (x) => x.cpool).entries()];
const poolMed = new Map(cpools.map(([p, r]) => [p, q(r.map((x) => x.I), 0.5)]));
const poolFiles = new Map(cpools);
const unmeasured = new Map();
function pairsFor(a, b, same) {
  const A = poolFiles.get(a) || [], B = poolFiles.get(b) || [], out = [];
  for (const x of A) for (const y of B) if (x !== y && (same ? x.id === y.id : x.id !== y.id)) out.push([x, y]);
  return out;
}
say(`## 2. The jumps a listener hears`);
say();
say(`Each change from one recording to the next in a week of each station's schedule (station IDs between them skipped), with the level change expected from the measured files that could make it: now, with one gain per pool, and with one gain per file aiming at ${T} LUFS but boosting no file past ${HEAD} dBTP true peak (no limiter).`);
say();
say('| Station | Changes a week | Measured | Median jump now (LU) | Over 3 LU now | Over 6 LU now | Over 3 LU, gain per pool | Over 3 LU, gain per file | Biggest kinds of change now (median jump) |');
say('|---|---|---|---|---|---|---|---|---|');
const jumpStats = {};
for (const S of api.STATIONS) {
  const segs = api.buildStation(S, 0, P).filter((g) => g.f), kinds = new Map();
  for (let i = 1; i < segs.length; i++) {
    const x = segs[i - 1], y = segs[i], a = poolOf.get(x.id + '/' + x.f), b = poolOf.get(y.id + '/' + y.f);
    if (!a || !b) continue;
    const k = a + (x.id === y.id ? ' → same item' : ' → ' + b);
    const v = kinds.get(k) || { a, b, same: x.id === y.id, n: 0 }; v.n++; kinds.set(k, v);
  }
  const total = [...kinds.values()].reduce((s, v) => s + v.n, 0), W = {}, per = [];
  let measured = 0;
  for (const mode of Object.keys(level)) W[mode] = [];
  for (const [k, v] of kinds) {
    const pairs = pairsFor(v.a, v.b, v.same);
    if (!pairs.length) { unmeasured.set(S.call, (unmeasured.get(S.call) || []).concat(`${k} ×${v.n}`)); continue; }
    measured += v.n;
    for (const mode of Object.keys(level)) for (const [x, y] of pairs) W[mode].push([Math.abs(level[mode](x) - level[mode](y)), v.n / pairs.length]);
    per.push([k, v.n, q(pairs.map(([x, y]) => Math.abs(x.I - y.I)), 0.5)]);
  }
  const share = (mode, th) => { const t = W[mode].reduce((s, [, w]) => s + w, 0); return t ? W[mode].reduce((s, [d, w]) => s + (d > th ? w : 0), 0) / t : NaN; };
  const med = (mode) => { const s = W[mode].slice().sort((p, r) => p[0] - r[0]), t = s.reduce((a, [, w]) => a + w, 0); let c = 0; for (const [d, w] of s) { c += w; if (c >= t / 2) return d; } return NaN; };
  jumpStats[S.call] = { now3: share('now', 3), now6: share('now', 6), pool3: share('pool', 3), file3: share('file', 3), med: med('now') };
  const top = per.sort((p, r) => r[1] - p[1]).slice(0, 3).map(([k, n, m]) => `${k} ×${n} (${f1(m)})`).join('; ');
  say(`| ${S.call} | ${total} | ${pct(measured, total)} | ${f1(med('now'))} | ${pct(Math.round(share('now', 3) * 1000), 1000)} | ${pct(Math.round(share('now', 6) * 1000), 1000)} | ${pct(Math.round(share('pool', 3) * 1000), 1000)} | ${pct(Math.round(share('file', 3) * 1000), 1000)} | ${top || '–'} |`);
}
say();
const sharing = ok.filter((x, i) => ok.some((y, j) => j !== i && y.id === x.id)).length;
say(`A change within one Archive item (a concert's next track, a work's next movement) is measured from pairs of sampled files from the same item; ${sharing} sampled files share an item with another. Left out for want of such a pair: ${[...unmeasured].map(([c, k]) => `${c} ${k.join(', ')}`).join('; ') || 'nothing'}.`);
say();

// ---- 3. quiet at the ends
say(`## 3. Quiet at the ends, and dead air`);
say();
say('*Silent*: below −50 dBFS. *Quiet*: more than 25 dB below the file\'s own program level (also catches needle noise and room tone).');
say();
say('| Pool | Files | Quiet lead-in: median / longest (s) | Quiet tail: median / longest (s) | Files with over 2 s quiet at an end | Silent lead-in + tail, median (s) | Longest dead air mid-file (s) |');
say('|---|---|---|---|---|---|---|');
for (const [p, r] of pools) {
  say(`| ${p} | ${r.length} | ${f1(q(r.map((x) => x.lead_quiet), 0.5))} / ${f1(Math.max(...r.map((x) => x.lead_quiet)))} | ${f1(q(r.map((x) => x.tail_quiet), 0.5))} / ${f1(Math.max(...r.map((x) => x.tail_quiet)))} | ${r.filter((x) => x.lead_quiet > 2 || x.tail_quiet > 2).length} | ${f1(q(r.map((x) => x.lead_silent + x.tail_silent), 0.5))} | ${f1(Math.max(...r.map((x) => x.gap_silent)))} |`);
}
const ends = ok.map((x) => x.lead_quiet + x.tail_quiet);
say();
say(`Across all files, quiet at the two ends adds up to a median ${f1(q(ends, 0.5))} s a file (90th percentile ${f1(q(ends, 0.9))} s; ${ok.filter((x) => x.lead_quiet + x.tail_quiet > 5).length} files over 5 s). Mid-file dead air over 5 s: ${ok.filter((x) => x.gap_silent > 5).map((x) => `${x.pool} ${x.f.slice(0, 50)} (${x.gap_silent} s)`).join('; ') || 'none'}.`);
say();

// ---- 4. what a target level costs
say(`## 4. Choosing a target level`);
say();
say('Gain needed to reach each target, and how many files would end up with true peaks over −1 dBTP (so would need a limiter, or less gain).');
say();
say('| Target (LUFS) | Files turned down | Turned up | Would peak over −1 dBTP | Median change (LU) | Largest boost needed (LU) | Short of target with boost capped at the headroom: files, median shortfall (LU) |');
say('|---|---|---|---|---|---|---|');
for (const T of [-16, -18, -20, -23]) {
  const g = ok.map((x) => T - x.I), over = ok.filter((x) => T - x.I > -1 - x.TP), short = ok.map((x) => (T - x.I > 0 ? T - x.I - Math.max(0, Math.min(T - x.I, -1 - x.TP)) : 0)).filter((d) => d > 0.5);
  say(`| ${T} | ${g.filter((x) => x < -0.5).length} | ${g.filter((x) => x > 0.5).length} | ${over.length} | ${f1(q(g.map(Math.abs), 0.5))} | ${f1(Math.max(...g))} | ${short.length}, ${f1(q(short, 0.5))} |`);
}
say();

// ---- 5. durations
const dd = ok.filter((x) => x.d).map((x) => ({ x, diff: x.dur - x.d }));
const off = dd.filter(({ diff }) => Math.abs(diff) > 2);
say(`## 5. Catalog durations against the files`);
say();
say(`The schedule is built on the catalog's durations. Decoded length minus catalog length: median ${f1(q(dd.map((v) => v.diff), 0.5))} s; ${off.length} of ${dd.length} files differ by more than 2 s${off.length ? ': ' + off.slice(0, 8).map(({ x, diff }) => `${x.pool} ${x.f.slice(0, 40)} (${diff > 0 ? '+' : ''}${f1(diff)} s)`).join('; ') + (off.length > 8 ? '; …' : '') : ''}.`);
console.log(out.join('\n'));
