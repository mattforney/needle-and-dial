// Turns the loudness measurements (tools/loudness_survey.js measure) into catalog/levels.json, the
// per-file table that weekly snapshots carry and the page applies:
//
//   gain   dB toward -20 LUFS integrated loudness. Turning down has no limit; turning up stops where
//          the file's true peak would pass -1 dBTP, since there's no limiter.
//   skip   seconds of silence (below -50 dBFS) cut from the start, keeping 0.3 s of it
//   out    where the file ends on air, cutting all but 0.3 s of trailing silence
//
// Only silence is cut, not merely quiet passages, so a soft intro or a pianissimo opening is never
// trimmed. A file with no measurement plays as before. Also lists files worth a listen: peaks well
// over full scale (damage, or heavy clipping), a length far from the catalog's, long dead air inside.
//
//   node tools/levels.js MEASUREMENTS.json [catalog/levels.json]
'use strict';
const fs = require('fs');
const path = require('path');

const TARGET = -20, PEAK = -1, PAD = 0.3;
const r1 = (x) => Math.round(x * 10) / 10;

function derive(m) {
  if (m.error || m.dur == null || m.lead_silent == null) return null;
  const skip = Math.floor(Math.max(0, m.lead_silent - PAD) * 10) / 10;
  const out = Math.min(m.dur, Math.ceil((m.dur - Math.max(0, m.tail_silent - PAD)) * 10) / 10);
  if (out - skip < 5) return null; // all but silent: leave it alone and list it
  let gain = 0;
  if (m.I != null && m.I > -70) { gain = TARGET - m.I; if (gain > 0) gain = Math.max(0, Math.min(gain, PEAK - (m.TP == null ? 0 : m.TP))); }
  return [r1(gain) || 0, r1(skip), r1(out)];
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
  const head = JSON.stringify({ made: t.made, target: t.target, peak: t.peak, pad: t.pad, files: t.files }).slice(0, -1);
  return head + ',"items":{\n' + ids.map((id, i) => JSON.stringify(id) + ':' + JSON.stringify(t.items[id]) + (i < ids.length - 1 ? ',' : '')).join('\n') + '\n}}\n';
}

function main([src, dest = path.join(__dirname, '..', 'catalog', 'levels.json')]) {
  if (!src) { console.error('usage: node tools/levels.js MEASUREMENTS.json [catalog/levels.json]'); process.exitCode = 2; return; }
  const meas = JSON.parse(fs.readFileSync(src, 'utf8')).files, items = {}, listen = [];
  let n = 0;
  for (const m of meas) {
    const v = derive(m), why = review(m, v);
    if (why.length) listen.push(`${m.id}/${m.f}: ${why.join('; ')}`);
    if (!v) continue;
    (items[m.id] = items[m.id] || {})[m.f] = v; n++;
  }
  for (const id of Object.keys(items)) items[id] = Object.fromEntries(Object.entries(items[id]).sort(([a], [b]) => (a < b ? -1 : 1)));
  const t = { made: new Date().toISOString().slice(0, 10), target: TARGET, peak: PEAK, pad: PAD, files: n, items };
  fs.writeFileSync(dest, dump(t));
  const all = Object.values(items).flatMap((o) => Object.values(o));
  const cut = all.reduce((s, [, skip, out], i) => s + skip, 0);
  console.log(`${n} files → ${path.relative(process.cwd(), dest)}; gains ${Math.min(...all.map((v) => v[0]))} to +${Math.max(...all.map((v) => v[0]))} dB; ${all.filter((v) => v[1] > 0).length} start trimmed (${Math.round(cut)} s in all)`);
  if (listen.length) console.log(`Worth a listen (${listen.length}):\n  ` + listen.join('\n  '));
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { derive, review, dump, TARGET, PEAK, PAD };
