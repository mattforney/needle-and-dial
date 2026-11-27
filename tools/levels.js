// Turns the loudness measurements (tools/loudness_survey.js measure) into catalog/levels.json, the
// per-file table that weekly snapshots carry and the page applies:
//
//   gain   dB toward -20 LUFS integrated loudness. Turning down has no limit; turning up stops 6 dB
//          past where the file's true peak would reach -1 dBTP, the page's limiter taking those peaks.
//          Where that differs, a fourth number is the gain without the limiter (its headroom alone),
//          which the page uses when the limiter is off (?limiter=0, or direct audio).
//   skip   seconds of silence (below -50 dBFS) cut from the start, keeping 0.3 s of it
//   out    where the file ends on air, cutting all but 0.3 s of trailing silence
//
// Only silence is cut, not merely quiet passages, so a soft intro or a pianissimo opening is never
// trimmed. A program in parts (a work's movements, a concert's tracks, played in order) keeps its own
// dynamics: one gain for the whole of it, from its parts' loudness together (as an album mode would),
// and silence cut only at its very start and end, so the pauses between movements stay as recorded.
// A file with no measurement plays as before. Also lists files worth a listen: peaks well over full
// scale (damage, or heavy clipping), a length far from the catalog's, long dead air inside.
//
//   node tools/levels.js [catalog/measurements.json [catalog/levels.json]]    (needs dist/catalog.json)
'use strict';
const fs = require('fs');
const path = require('path');

const TARGET = -20, PEAK = -1, PAD = 0.3, LIMIT = 6;
const r1 = (x) => Math.round(x * 10) / 10;

// The gain to bring loudness I toward the target, turning up only until true peak TP passes PEAK by
// `limit` dB (0: no limiter, so not past PEAK at all).
function gainFor(I, TP, limit = LIMIT) {
  if (I == null || !(I > -70)) return 0;
  let g = TARGET - I;
  if (g > 0) g = Math.max(0, Math.min(g, Math.max(0, PEAK - (TP == null ? 0 : TP)) + limit));
  return r1(g) || 0;
}
const entry = (g, g0, skip, out) => (g0 === g ? [g, r1(skip), r1(out)] : [g, r1(skip), r1(out), g0]);
// One file's entry. part: { gain, first, last } when the file is one part of a program in parts.
function derive(m, part) {
  if (m.error || m.dur == null || m.lead_silent == null) return null;
  const head = !part || part.first, tail = !part || part.last;
  const skip = head ? Math.floor(Math.max(0, m.lead_silent - PAD) * 10) / 10 : 0;
  const out = tail ? Math.min(m.dur, Math.ceil((m.dur - Math.max(0, m.tail_silent - PAD)) * 10) / 10) : r1(m.dur);
  if (out - skip < 5) return null; // all but silent: leave it alone and list it
  return part ? entry(part.gain, part.gain0, skip, out) : entry(gainFor(m.I, m.TP), gainFor(m.I, m.TP, 0), skip, out);
}
// Programs in parts, from the catalog: each work's movements (Nocturne) and each concert's tracks (KTPR).
function programs(meas) {
  const root = path.join(__dirname, '..'), html = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
  const code = html.split('// ==ENGINE==')[1].split('// ==/ENGINE==')[0], CAT = JSON.parse(fs.readFileSync(path.join(root, 'dist/catalog.json'), 'utf8'));
  const P = new Function('CAT', code + '\nreturn { parseCatalog };')(CAT).parseCatalog(CAT), byKey = new Map(meas.map((m) => [m.id + '/' + m.f, m])), parts = new Map();
  for (const prog of [...P.works, ...P.shows]) {
    const ms = prog.items.map((it) => byKey.get(it.id + '/' + it.f)).filter((m) => m && !m.error && m.I != null && m.I > -70 && m.dur > 0);
    if (prog.items.length < 2 || !ms.length) continue;
    // loudness of the parts together: their energy, weighted by length
    const I = 10 * Math.log10(ms.reduce((s, m) => s + m.dur * Math.pow(10, m.I / 10), 0) / ms.reduce((s, m) => s + m.dur, 0));
    const TP = Math.max(...ms.map((m) => (m.TP == null ? 0 : m.TP))), gain = gainFor(I, TP), gain0 = gainFor(I, TP, 0);
    prog.items.forEach((it, i) => parts.set(it.id + '/' + it.f, { gain, gain0, first: i === 0, last: i === prog.items.length - 1 }));
  }
  return parts;
}

function review(m, v) {
  const why = [];
  if (m.error) why.push('not measured: ' + m.error);
  else {
    if (!v) why.push('almost all silence');
    if (m.TP > 3) why.push(`true peak +${m.TP} dBTP`);
    if (m.d && Math.abs(m.dur - m.d) > 10) why.push(`plays ${r1(m.dur)} s, catalog says ${m.d} s`);
    if (m.gap_silent > 5) why.push(`${m.gap_silent} s of dead air inside`);
    if (m.lead_silent > 10 || m.tail_silent > 10) why.push(`${r1(m.lead_silent)} s silent at the start, ${r1(m.tail_silent)} s at the end`);
  }
  return why;
}

// One Archive item per line, so a diff shows which items changed.
function dump(t) {
  const ids = Object.keys(t.items).sort();
  const head = JSON.stringify({ made: t.made, target: t.target, peak: t.peak, limit: t.limit, pad: t.pad, files: t.files }).slice(0, -1);
  return head + ',"items":{\n' + ids.map((id, i) => JSON.stringify(id) + ':' + JSON.stringify(t.items[id]) + (i < ids.length - 1 ? ',' : '')).join('\n') + '\n}}\n';
}

function main([src = path.join(__dirname, '..', 'catalog', 'measurements.json'), dest = path.join(__dirname, '..', 'catalog', 'levels.json')]) {
  const meas = JSON.parse(fs.readFileSync(src, 'utf8')).files, parts = programs(meas), items = {}, listen = [];
  let n = 0;
  for (const m of meas) {
    const v = derive(m, parts.get(m.id + '/' + m.f)), why = review(m, v);
    if (why.length) listen.push(`${m.id}/${m.f}: ${why.join('; ')}`);
    if (!v) continue;
    (items[m.id] = items[m.id] || {})[m.f] = v; n++;
  }
  for (const id of Object.keys(items)) items[id] = Object.fromEntries(Object.entries(items[id]).sort(([a], [b]) => (a < b ? -1 : 1)));
  const t = { made: new Date().toISOString().slice(0, 10), target: TARGET, peak: PEAK, limit: LIMIT, pad: PAD, files: n, items };
  const old = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, 'utf8')) : null, same = old && JSON.stringify(old.items) === JSON.stringify(items) && old.limit === LIMIT;
  if (same) t.made = old.made; // nothing new: leave the file as it was
  if (!same) fs.writeFileSync(dest, dump(t));
  const all = Object.values(items).flatMap((o) => Object.values(o));
  const cut = all.reduce((s, [, skip, out], i) => s + skip, 0);
  console.log(`${n} files → ${path.relative(process.cwd(), dest)}${same ? ', unchanged' : ''} (${parts.size} parts of programs share their program’s gain); gains ${Math.min(...all.map((v) => v[0]))} to +${Math.max(...all.map((v) => v[0]))} dB, ${all.filter((v) => v.length > 3).length} of them leaning on the limiter; ${all.filter((v) => v[1] > 0).length} start trimmed (${Math.round(cut)} s in all)`);
  if (listen.length) console.log(`Worth a listen (${listen.length}):\n  ` + listen.join('\n  '));
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { derive, gainFor, review, dump, TARGET, PEAK, PAD, LIMIT };
