// Loudness survey: how loud each sampled catalog file is (EBU R128) and how much quiet sits at each
// end, to scope level matching and trims before building them (roadmap: "Loudness and trims").
//
//   node tools/loudness_survey.js pick              writes research/loudness/sample.json (needs dist/catalog.json)
//   node tools/loudness_survey.js pick all [OUT]    every file in the catalog (default research/loudness/all.json)
//   node tools/loudness_survey.js selftest          measures synthetic files whose answers are known
//   node tools/loudness_survey.js measure LIST OUT [--max N] [--retry-errors] [--redo-from CHECK.json]
//       downloads each listed file once, one at a time, and measures it; files already in OUT are skipped,
//       so it resumes. --retry-errors measures again the ones that failed; --redo-from, the ones an Archive
//       check (dist/archive-check.json) found changed in length. OUT is rewritten only if something changed.
//   node tools/loudness_survey.js report OUT        prints a summary by pool, as Markdown
//
// archive.org can't be reached from every machine, so the weekly Archive check workflow runs measure on
// GitHub's servers, into catalog/measurements.json. Needs ffmpeg (with libmp3lame for the self-test).
//
// Every measurement is of the audio as the page plays it: through a 20 Hz high-pass (second order,
// Butterworth, as the page's), which takes out any DC offset or rumble below hearing. Without it, a
// recording sitting off zero shows peaks it doesn't play and no silence at its ends (hp: 20 in a record).
// Per file: integrated loudness (LUFS), loudness range (LU) and true peak (dBTP) from ffmpeg's ebur128
// filter; then, from the audio in 100 ms blocks (48 kHz, full bandwidth; the average power of its one or
// two channels as RMS in dBFS, so a full-scale sine is -3 dB), the quiet stretch at each end, two ways:
//   silent: blocks below -50 dBFS (digital silence, quiet tape hiss)
//   quiet:  blocks more than 25 dB below the file's program level (the median of its blocks above
//           -50 dBFS), or silent, whichever threshold is higher; this also catches needle noise and
//           room tone well above -50 dBFS
// A stretch ends where at least 3 of 5 blocks in a row are louder, so a lone click doesn't end it.
// Also the longest silent stretch between the two ends (dead air in the middle).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const ROOT = path.join(__dirname, '..');
const RATE = 48000, HP = 20;
const SILENT = -50, QUIET = 25;
const UA = 'needle-and-dial loudness survey (+https://github.com/mattforney/needle-and-dial)';
const ia = (id, file) => 'https://archive.org/download/' + encodeURIComponent(id) + '/' + file.split('/').map(encodeURIComponent).join('/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10) / 10);

// ---- one file
function probe(file) {
  const s = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,channels,sample_rate,bit_rate', '-of', 'json', file]).toString()).streams[0] || {};
  return { codec: s.codec_name || null, channels: +s.channels || null, rate: +s.sample_rate || null, kbps: s.bit_rate ? Math.round(s.bit_rate / 1000) : null };
}
function measure(file) {
  return new Promise((resolve, reject) => {
    const info = probe(file), CH = info.channels === 1 ? 1 : 2, BLOCK = (RATE / 10) * CH; // mono stays mono: ffmpeg's upmix would lower each channel 3 dB
    const ff = spawn('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-filter_complex', `[0:a:0]highpass=f=${HP}:poles=2,asplit=2[a][b];[a]ebur128=peak=true:framelog=quiet[x]`,
      '-map', '[x]', '-f', 'null', '-', '-map', '[b]', '-ac', String(CH), '-ar', String(RATE), '-f', 's16le', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const ms = []; let acc = 0, n = 0, carry = null, err = '';
    ff.stdout.on('data', (buf) => {
      if (carry) { buf = Buffer.concat([carry, buf]); carry = null; }
      const even = buf.length & ~1;
      if (even < buf.length) carry = buf.subarray(even);
      for (let i = 0; i < even; i += 2) { const s = buf.readInt16LE(i); acc += s * s; if (++n === BLOCK) { ms.push(acc / BLOCK); acc = 0; n = 0; } }
    });
    ff.stderr.on('data', (d) => { err += d; if (err.length > 2e6) err = err.slice(-2e5); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      const at = err.lastIndexOf('Summary:');
      if (code !== 0 || at < 0) return reject(new Error('ffmpeg: ' + err.trim().split('\n').slice(-2).join(' ').slice(0, 300)));
      if (n >= BLOCK / 2) ms.push(acc / n);
      const sum = err.slice(at), num = (re) => { const m = re.exec(sum); return m && m[1] !== '-inf' ? +m[1] : null; };
      const db = ms.map((x) => (x > 0 ? 10 * Math.log10(x / 32768 / 32768) : -120));
      resolve(Object.assign(info, { I: num(/\bI:\s+(-inf|-?[\d.]+) LUFS/), LRA: num(/\bLRA:\s+(-inf|-?[\d.]+) LU\b/), TP: num(/\bPeak:\s+(-inf|-?[\d.]+) dBFS/) }, ends(db), { hp: HP }));
    });
  });
}

// Quiet at each end of a file, from its 100 ms block levels in dBFS.
function ends(db) {
  const dur = db.length / 10, loud = db.filter((x) => x > SILENT).sort((a, b) => a - b);
  const prog = loud.length ? loud[Math.floor(loud.length / 2)] : null;
  const span = (th) => {
    const on = db.map((x) => x > th), count = (i, j) => { let k = 0; for (let x = Math.max(0, i); x < Math.min(on.length, j); x++) k += on[x]; return k; };
    let a = 0; while (a < on.length && !(on[a] && count(a, a + 5) >= 3)) a++;
    let b = on.length - 1; while (b >= 0 && !(on[b] && count(b - 4, b + 1) >= 3)) b--;
    return a > b ? null : [a, b];
  };
  const s = span(SILENT), q = prog == null ? null : span(Math.max(SILENT, prog - QUIET)); // never stricter than silent
  let gap = 0;
  if (s) for (let i = s[0], run = 0; i <= s[1]; i++) { run = db[i] > SILENT ? 0 : run + 1; gap = Math.max(gap, run); }
  return {
    dur: r1(dur), prog: r1(prog),
    lead_silent: s ? r1(s[0] / 10) : r1(dur), tail_silent: s ? r1(dur - (s[1] + 1) / 10) : 0,
    lead_quiet: q ? r1(q[0] / 10) : r1(dur), tail_quiet: q ? r1(dur - (q[1] + 1) / 10) : 0,
    gap_silent: r1(gap / 10),
  };
}

// ---- the sample: about ten files a pool, spread over the pool's Archive items, the same every time
const PER = { ads: 8, g78: 12, poems: 6, chopin: 6, shows: 11, vault: 11 };
function pick(all, dest) {
  const html = fs.readFileSync(path.join(ROOT, 'src/index.template.html'), 'utf8');
  const code = html.split('// ==ENGINE==')[1].split('// ==/ENGINE==')[0];
  const CAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/catalog.json'), 'utf8'));
  const api = new Function('CAT', code + '\nreturn { parseCatalog, rng };')(CAT);
  const P = api.parseCatalog(CAT), rand = api.rng(20261126), files = [], pools = {};
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  for (const pool of Object.keys(P).sort()) {
    const seen = new Map(), vis = new Set();
    const walk = (o) => { if (!o || typeof o !== 'object' || vis.has(o)) return; vis.add(o); if (Array.isArray(o)) return o.forEach(walk); if (typeof o.id === 'string' && typeof o.f === 'string' && !seen.has(o.id + '/' + o.f)) seen.set(o.id + '/' + o.f, o); Object.values(o).forEach(walk); };
    walk(P[pool]);
    const byItem = new Map();
    for (const o of [...seen.values()].sort((x, y) => (x.id + '/' + x.f < y.id + '/' + y.f ? -1 : 1))) { if (!byItem.has(o.id)) byItem.set(o.id, []); byItem.get(o.id).push(o); }
    if (all) { // every file, once, under the first pool it appears in
      let n = 0;
      for (const o of [...byItem.values()].flat()) if (!files.some((x) => x.id === o.id && x.f === o.f)) { files.push({ pool, id: o.id, f: o.f, d: o.d, t: o.t || '' }); n++; }
      pools[pool] = { files: seen.size, items: byItem.size, listed: n };
      continue;
    }
    const items = shuffle([...byItem.keys()]).map((id) => shuffle(byItem.get(id).slice()));
    const want = Math.min(PER[pool] || 10, seen.size), got = [];
    for (let k = 0; got.length < want; k++) { const list = items[k % items.length]; if (list.length) got.push(list.pop()); }
    for (const o of got) files.push({ pool, id: o.id, f: o.f, d: o.d, t: o.t || '' });
    pools[pool] = { files: seen.size, items: byItem.size, sampled: got.length };
  }
  const out = dest ? path.resolve(dest) : path.join(ROOT, all ? 'research/loudness/all.json' : 'research/loudness/sample.json');
  fs.writeFileSync(out, JSON.stringify({ made: new Date().toISOString().slice(0, 10), seed: 20261126, pools, files }, null, 1) + '\n');
  console.log(`${files.length} files from ${Object.keys(pools).length} pools, ${Math.round(files.reduce((s, x) => s + (x.d || 0), 0) / 3600)} hours of audio → ${path.relative(ROOT, out)}`);
}

// ---- download, one at a time
async function download(url, to) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(300000) });
      if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(to));
      return fs.statSync(to).size;
    } catch (e) {
      if (attempt >= 3 || (e.status && e.status < 500 && e.status !== 429)) throw e;
      await sleep(attempt * 15000);
    }
  }
}

// Records to measure again: failed ones (retryErrors) and files whose Archive copy changed length (redo, a
// Set of "item/file"). Within one run a file that fails stays failed: no endless retries.
function prune(out, { retryErrors, redo } = {}) {
  const before = out.files.length;
  out.files = out.files.filter((x) => !(retryErrors && x.error) && !(redo && redo.has(x.id + '/' + x.f)));
  return before - out.files.length;
}
const changedLength = (checkPath) => new Set(JSON.parse(fs.readFileSync(checkPath, 'utf8')).results.filter((r) => r.status === 'length').map((r) => r.id + '/' + r.f));
async function survey(samplePath, outPath, { max = Infinity, retryErrors = false, redoFrom = null } = {}) {
  const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8')), existed = fs.existsSync(outPath);
  const out = existed ? JSON.parse(fs.readFileSync(outPath, 'utf8'))
    : { started: new Date().toISOString(), ffmpeg: execFileSync('ffmpeg', ['-version']).toString().split('\n')[0], method: { block_ms: 100, rate: RATE, silent_dbfs: SILENT, quiet_db_below_program: QUIET, highpass_hz: HP }, files: [] };
  const dropped = prune(out, { retryErrors, redo: redoFrom ? changedLength(redoFrom) : null });
  if (dropped) console.log(`measuring ${dropped} again`);
  const done = new Set(out.files.map((x) => x.id + '/' + x.f));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-loud-'));
  let k = 0, n = 0;
  for (const s of sample.files) {
    k++;
    if (done.has(s.id + '/' + s.f)) continue;
    if (n++ >= max) break;
    const file = path.join(tmp, 'a' + (path.extname(s.f).toLowerCase() || '.mp3')), rec = { pool: s.pool, id: s.id, f: s.f, d: s.d }, t0 = Date.now();
    try {
      rec.bytes = await download(ia(s.id, s.f), file);
      rec.secs_download = r1((Date.now() - t0) / 1000);
      Object.assign(rec, await measure(file));
    } catch (e) { rec.error = String((e && e.message) || e).slice(0, 300); }
    fs.rmSync(file, { force: true });
    out.files.push(rec);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
    console.log(`${String(k).padStart(3)}/${sample.files.length} ${s.pool.padEnd(9)} ${rec.error ? 'ERROR ' + rec.error : `${rec.I} LUFS, lead ${rec.lead_quiet} s, tail ${rec.tail_quiet} s`}  ${s.f.slice(0, 60)}`);
    await sleep(1000);
  }
  const have = new Set(out.files.map((x) => x.id + '/' + x.f)), left = sample.files.filter((s) => !have.has(s.id + '/' + s.f)).length;
  if (n || dropped || !existed) { if (!left) out.finished = new Date().toISOString(); fs.writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n'); }
  console.log(`${Math.min(n, sample.files.length)} measured this run; ${out.files.length} in all (${out.files.filter((x) => x.error).length} failed), ${left} left`);
}

// ---- summary by pool
const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
function report(outPath) {
  const res = JSON.parse(fs.readFileSync(outPath, 'utf8')), ok = res.files.filter((x) => !x.error && x.I != null);
  const pools = [...new Set(res.files.map((x) => x.pool))].sort();
  const f = (x) => (x == null ? '–' : x.toFixed(1));
  const lines = ['| Pool | Files | Median LUFS | Middle half | Lowest to highest | Quiet lead-in over 2 s | Quiet tail over 2 s | Longest lead-in / tail (s) | Highest true peak |', '|---|---|---|---|---|---|---|---|---|'];
  for (const p of pools) {
    const r = ok.filter((x) => x.pool === p), I = r.map((x) => x.I);
    lines.push(`| ${p} | ${r.length}${res.files.some((x) => x.pool === p && x.error) ? ' (' + res.files.filter((x) => x.pool === p && x.error).length + ' failed)' : ''} | ${f(q(I, 0.5))} | ${f(q(I, 0.25))} to ${f(q(I, 0.75))} | ${f(Math.min(...I))} to ${f(Math.max(...I))} | ${r.filter((x) => x.lead_quiet > 2).length} | ${r.filter((x) => x.tail_quiet > 2).length} | ${f(Math.max(...r.map((x) => x.lead_quiet)))} / ${f(Math.max(...r.map((x) => x.tail_quiet)))} | ${f(Math.max(...r.map((x) => x.TP)))} |`);
  }
  const I = ok.map((x) => x.I);
  lines.push('', `${ok.length} files measured, ${res.files.length - ok.length} failed. All files: median ${f(q(I, 0.5))} LUFS, middle half ${f(q(I, 0.25))} to ${f(q(I, 0.75))}, lowest ${f(Math.min(...I))}, highest ${f(Math.max(...I))}.`);
  console.log(lines.join('\n'));
}

// ---- self-test: synthetic files with known answers, through MP3 as the catalog mostly is
async function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-loud-test-'));
  const tone = (a) => `${a}*sin(2*PI*997*t)`, noise = (rms) => `${(rms * Math.sqrt(3)).toFixed(6)}*(2*random(0)-1)`; // uniform noise: RMS = amplitude / √3
  const cases = [ // [name, expression, seconds, expected values with tolerances, codec]
    ['steady tone at -20 dBFS peak', tone(0.1), 20, { I: [-23.0, 0.2], prog: [-23.0, 0.2], lead_silent: [0, 0.05], tail_silent: [0, 0.05], gap_silent: [0, 0.05] }],
    ['digital silence at both ends', `if(between(t,3,13),${tone(0.1)},0)`, 18, { lead_silent: [3, 0.1], tail_silent: [5, 0.1], lead_quiet: [3, 0.1], tail_quiet: [5, 0.1] }],
    ['hiss below -50 dBFS at both ends', `if(between(t,4,14),${tone(0.1)},${noise(0.001)})`, 16, { lead_silent: [4, 0.1], tail_silent: [2, 0.1] }],
    ['needle noise above -50 dBFS but far below the program', `if(between(t,4,14),${tone(0.5)},${noise(0.0056)})`, 17, { lead_silent: [0, 0.05], tail_silent: [0, 0.05], gap_silent: [0, 0.05], lead_quiet: [4, 0.1], tail_quiet: [3, 0.1] }],
    ['a click in a silent lead-in', `if(between(t,1.5,1.51),0.5,if(gte(t,3),${tone(0.1)},0))`, 10, { lead_silent: [3, 0.1] }],
    ['eight seconds of dead air in the middle', `if(between(t,5,13),0,${tone(0.1)})`, 18, { gap_silent: [8, 0.1], lead_silent: [0, 0.05], tail_silent: [0, 0.05] }],
    ['steady tone in stereo', tone(0.1), 10, { I: [-20.0, 0.2], prog: [-23.0, 0.2], lead_silent: [0, 0.05] }, 'stereo'],
    ['silence at both ends, through MP3', `if(between(t,3,13),${tone(0.1)},0)`, 18, { I: [-23.6, 0.6], lead_silent: [3, 0.15], tail_silent: [5, 0.25] }, 'mp3'],
    // A third of full scale below zero (faded in over 1 s, so the high-pass makes no click), then a tone: the
    // peak, the program level and the silent lead-in are the tone's and the lead-in's, not the offset's.
    ['a tone riding a DC offset', `-0.33*min(t,1)+if(gte(t,4),${tone(0.1)},0)`, 14, { TP: [-20.0, 0.3], prog: [-23.0, 0.3], lead_silent: [4, 0.15] }],
  ];
  let bad = 0;
  for (const [name, expr, d, want, codec] of cases) {
    const file = path.join(tmp, codec === 'mp3' ? 'case.mp3' : 'case.wav'), src = codec === 'stereo' ? `${expr}|${expr}` : expr;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc='${src}':s=44100:d=${d}`, ...(codec === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '128k'] : ['-c:a', 'pcm_s16le']), file]);
    const r = await measure(file), miss = Object.entries(want).filter(([k, [v, tol]]) => !(Math.abs(r[k] - v) <= tol));
    if (miss.length) bad++;
    console.log(`${miss.length ? 'FAIL' : 'PASS'}  ${name}${miss.length ? ': ' + miss.map(([k, [v]]) => `${k} ${r[k]}, expected ${v}`).join('; ') : ''}`);
  }
  console.log(bad ? `${bad} of ${cases.length} self-tests failed` : `all ${cases.length} self-tests passed`);
  process.exitCode = bad ? 1 : 0;
}

module.exports = { measure, ends, ia, prune, download };
if (require.main !== module) return;
const [cmd, ...args] = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const run = { pick: () => pick(args[0] === 'all', args[0] === 'all' ? args[1] : args[0]), selftest: () => selftest(), report: () => report(args[0]),
  measure: () => survey(args[0], args[1], { max: opt('--max') ? +opt('--max') : Infinity, retryErrors: args.includes('--retry-errors'), redoFrom: opt('--redo-from') }) }[cmd];
if (!run) { console.error('usage: node tools/loudness_survey.js pick | selftest | measure SAMPLE OUT | report OUT'); process.exitCode = 2; }
else Promise.resolve(run()).catch((e) => { console.error(e); process.exitCode = 1; });
