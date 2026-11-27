#!/usr/bin/env node
// The limiter on real recordings. The files that lean on it most go one at a time through the
// browser's own limiter (Chrome's DynamicsCompressorNode, rendered offline) with the gain the levels
// table gives them, at the page's settings and at a few others for comparison.
//
//   node tools/limiter_check.js pick [OUT]       the files that lean on the limiter most, from each pool
//       (catalog/levels.json and catalog/measurements.json); default research/loudness/limiter/files.json
//   node tools/limiter_check.js run LIST OUT     downloads, decodes and limits each listed file; files
//       already in OUT are skipped, so it resumes
//   node tools/limiter_check.js selftest         the same on synthetic recordings whose answers are known
//   node tools/limiter_check.js report OUT       a summary, as Markdown
//   node tools/limiter_check.js clips LIST DIR [N] [SECS]   for listening: in each listed file, the N spots
//       of SECS seconds (default 3 of 12) where the limiter works hardest, each as two 16-bit WAVs: a, the
//       file at its gain without the limiter (as the station plays it with the limiter off), and b, with
//       the limiter, turned back down by the difference between the gains. The two are then at the same
//       level, so anything heard in b and not in a is the limiter's doing. DIR/clips.json lists them.
//
// archive.org can't be reached from every machine, so the run happens on GitHub's servers (the Limiter
// check workflow, on its own branch). Needs ffmpeg and Chrome (CHROME_PATH, default /usr/bin/google-chrome).
//
// Each file is decoded at 48 kHz from its skip point to its end point (its first 30 minutes at most) and
// limited in 60 s pieces, each with the 2 s before it so the limiter has settled by the piece's start
// (it starts each time with its gain near nothing, as it does when the page's audio starts).
// What the limiter does is read exactly: beside the recording runs a second channel holding a constant
// far too quiet to sway it, and the limiter's gain comes out on that channel. (Chrome's limiter acts on
// whichever channel is loudest at each instant, so a stereo file goes in as that channel, and the gain
// read off then applies to both.) For each file and setting:
//   gr1, gr3, gr6  the share of the program the limiter takes more than 1, 3 and 6 dB off
//   grMax          the most it takes off, dB
//   peak           the highest sample it lets out, dBFS
//   dI             the loudness it costs, LU: the program's loudness (BS.1770) with the limiter, against
//                  the same gain without it. This counts the peaks it takes down, which in a crackly 78
//                  are mostly clicks, so it can be large while the music loses little; hence
//   dBed           what the rest loses, dB: the energy of the samples more than 6 dB under the threshold,
//                  with the limiter against without, which is the music around the peaks being ducked
//   worst          where it works hardest: the 3 s with the most gain reduction on average, from the
//                  start of the file
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { download, ia } = require('./loudness_survey.js');
const { lufs, kCoeffs } = require('./lufs.js');

const ROOT = path.join(__dirname, '..');
const RATE = 48000, PRE = 2 * RATE, PIECE = 60 * RATE, MAXSECS = 1800, PROBE = 1e-5;
const r1 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
const r4 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10000) / 10000);
const db = (v) => 20 * Math.log10(v);

// The page's limiter, read from the page itself, and the settings it is compared with.
function pageLimiter() {
  const m = fs.readFileSync(path.join(ROOT, 'src', 'index.template.html'), 'utf8').match(/const LIMITER = (\{[^}]*\});/);
  if (!m) throw new Error('no LIMITER in src/index.template.html');
  return Function('return ' + m[1])();
}
const makeupDb = (L) => -0.6 * (L.threshold - L.threshold / L.ratio); // as the page: the spec's makeup gain, with no knee
function settings() {
  const page = pageLimiter(), alt = [['release 0.05 s', { release: 0.05 }], ['release 0.2 s', { release: 0.2 }], ['threshold -1 dBFS', { threshold: -1 }]];
  const all = [['page', page], ...alt.map(([n, o]) => [n, Object.assign({}, page, o)])];
  return all.filter(([, c], i) => i === 0 || JSON.stringify(c) !== JSON.stringify(page)).map(([name, c]) => Object.assign({ name }, c, { makeup: makeupDb(c) }));
}

// BS.1770 integrated loudness of audio fed in pieces: the K-weighting filters keep their state between
// pieces, and 100 ms sub-blocks add up to the 400 ms blocks the gates work on.
class Meter {
  constructor(ch) { this.ch = ch; this.k = kCoeffs(RATE); this.st = new Float64Array(ch * 8); this.sub = Math.round(0.1 * RATE); this.e = 0; this.n = 0; this.subs = []; }
  // frames [from, to) of interleaved x, times g, times env[i - from] if env is given
  feed(x, from, to, g, env) {
    const ch = this.ch, st = this.st, sub = this.sub, [[sb, sa], [hb, ha]] = this.k;
    let e = this.e, n = this.n;
    for (let i = from; i < to; i++) {
      const k = env ? g * env[i - from] : g;
      for (let c = 0; c < ch; c++) {
        const o = c * 8, v = x[i * ch + c] * k;
        const s = sb[0] * v + sb[1] * st[o] + sb[2] * st[o + 1] - sa[1] * st[o + 2] - sa[2] * st[o + 3];
        st[o + 1] = st[o]; st[o] = v; st[o + 3] = st[o + 2]; st[o + 2] = s;
        const h = hb[0] * s + hb[1] * st[o + 4] + hb[2] * st[o + 5] - ha[1] * st[o + 6] - ha[2] * st[o + 7];
        st[o + 5] = st[o + 4]; st[o + 4] = s; st[o + 7] = st[o + 6]; st[o + 6] = h;
        e += h * h;
      }
      if (++n === sub) { this.subs.push(e); e = 0; n = 0; }
    }
    this.e = e; this.n = n;
  }
  I() {
    const s = this.subs, z = [], L = (m) => -0.691 + 10 * Math.log10(m), mean = (a) => a.reduce((p, q) => p + q, 0) / a.length;
    for (let j = 0; j + 4 <= s.length; j++) z.push((s[j] + s[j + 1] + s[j + 2] + s[j + 3]) / (4 * this.sub));
    const abs = z.filter((m) => L(m) > -70);
    if (!abs.length) return null;
    const rel = L(mean(abs)) - 10;
    return L(mean(abs.filter((m) => L(m) > rel)));
  }
}

// ---- the browser side: a page that limits what it is given and sums up what the limiter did, at every
// sample; it posts back the limiter's gain at every 8th, which is ample for the loudness meters (the
// gain moves no faster than its 1 ms attack), since posting it all back takes far longer than the rest.
const STEP = 8;
const PAGE = `<!doctype html><meta charset="utf-8"><title>limiter check</title><script>
const limiter = (ctx, c) => { const l = ctx.createDynamicsCompressor(); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) l[k].value = c[k]; const b = ctx.createGain(); b.gain.value = Math.pow(10, -c.makeup / 20); l.connect(b); return [l, b]; };
// Frames of two channels from /in (the recording, then the constant) through each setting's limiter.
// The program is frames [a, a + n) of the input, coming out lag frames later.
window.limit = async (frames, cfgs, a, n, lag, probe) => {
  const x = new Float32Array(await (await fetch('/in')).arrayBuffer()), ctx = new OfflineAudioContext(cfgs.length, frames, ${RATE});
  const buf = ctx.createBuffer(2, frames, ${RATE}); buf.copyToChannel(x.subarray(0, frames), 0); buf.copyToChannel(x.subarray(frames, 2 * frames), 1);
  const src = ctx.createBufferSource(), merge = ctx.createChannelMerger(cfgs.length); src.buffer = buf;
  cfgs.forEach((c, k) => { const [l, b] = limiter(ctx, c), split = ctx.createChannelSplitter(2); src.connect(l); b.connect(split); split.connect(merge, 1, k); });
  merge.connect(ctx.destination); src.start();
  const out = await ctx.startRendering(), D = Math.floor(n / ${STEP}) + 1, envs = new Float32Array(cfgs.length * D), SUB = ${RATE} / 10;
  const L1 = Math.pow(10, -1 / 20), L3 = Math.pow(10, -3 / 20), L6 = Math.pow(10, -6 / 20);
  const stats = cfgs.map((c, k) => {
    const y = out.getChannelData(k), bed = Math.pow(10, (c.threshold - 6) / 20), o = { c1: 0, c3: 0, c6: 0, min: 1, peak: 0, bIn: 0, bOut: 0, sub: [], subMax: [] };
    let acc = 0, m = 0, mn = 1;
    for (let j = 0; j < n; j++) {
      const e = y[a + lag + j] / probe, xm = Math.abs(x[a + j]), v = xm * e;
      if (e < L1) { o.c1++; if (e < L3) { o.c3++; if (e < L6) o.c6++; } }
      if (e < o.min) o.min = e;
      if (e < mn) mn = e;
      if (v > o.peak) o.peak = v;
      if (xm < bed) { o.bIn += xm * xm; o.bOut += v * v; }
      if (e < 0.99999) acc -= 20 * Math.log10(e);
      if (++m === SUB || j === n - 1) { o.sub.push(acc / m); o.subMax.push(mn < 1 ? -20 * Math.log10(mn) : 0); acc = 0; m = 0; mn = 1; }
      if (j % ${STEP} === 0) envs[k * D + j / ${STEP}] = e;
    }
    envs[k * D + D - 1] = y[Math.min(a + lag + n, frames - 1)] / probe;
    return o;
  });
  await fetch('/out', { method: 'POST', body: envs });
  return stats;
};
// Frames of ch channels from /in through the limiter; the limited audio back to /out.
window.clip = async (frames, ch, c) => {
  const x = new Float32Array(await (await fetch('/in')).arrayBuffer()), ctx = new OfflineAudioContext(ch, frames, ${RATE}), buf = ctx.createBuffer(ch, frames, ${RATE});
  for (let k = 0; k < ch; k++) buf.copyToChannel(x.subarray(k * frames, (k + 1) * frames), k);
  const src = ctx.createBufferSource(), [l, b] = limiter(ctx, c); src.buffer = buf; src.connect(l); b.connect(ctx.destination); src.start();
  const out = await ctx.startRendering(), body = new Float32Array(ch * frames);
  for (let k = 0; k < ch; k++) body.set(out.getChannelData(k), k * frames);
  await fetch('/out', { method: 'POST', body });
  return true;
};
// The limiter's delay: where an impulse well under its threshold comes out. Half a second in, since
// Chrome's limiter starts with its gain near nothing and takes about its release time to come up.
window.lag = async (c) => {
  const at = ${RATE} / 2, n = at + 4096, ctx = new OfflineAudioContext(1, n, ${RATE}), buf = ctx.createBuffer(1, n, ${RATE}); buf.getChannelData(0)[at] = 0.1;
  const src = ctx.createBufferSource(), [l, b] = limiter(ctx, c); src.buffer = buf; src.connect(l); b.connect(ctx.destination); src.start();
  const y = (await ctx.startRendering()).getChannelData(0); let k = at; for (let i = at; i < y.length; i++) if (Math.abs(y[i]) > Math.abs(y[k])) k = i;
  return { lag: k - at, gain: y[k] / 0.1 };
};
</script>`;

async function browser() {
  let IN = null, OUT = null;
  const server = http.createServer((req, res) => {
    if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); }
    if (req.url === '/in') { res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(Buffer.from(IN.buffer, IN.byteOffset, IN.byteLength)); }
    if (req.url === '/out' && req.method === 'POST') {
      const parts = []; req.on('data', (d) => parts.push(d));
      req.on('end', () => { const b = Buffer.concat(parts); OUT = new Float32Array(b.byteLength / 4); new Uint8Array(OUT.buffer).set(b); res.end('ok'); });
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let chrome, page;
  try {
    chrome = await require('playwright-core').chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--mute-audio'] });
    page = await chrome.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
  } catch (e) { server.close(); if (chrome) await chrome.close(); throw e; }
  return {
    limit: async (input, frames, cfgs, a, n, lag) => { IN = input; OUT = null; const stats = await page.evaluate((v) => window.limit(...v), [frames, cfgs, a, n, lag, PROBE]); return { stats, envs: OUT }; },
    lag: (c) => page.evaluate((x) => window.lag(x), c),
    clip: async (input, frames, ch, c) => { IN = input; OUT = null; await page.evaluate((v) => window.clip(...v), [frames, ch, c]); return OUT; },
    close: async () => { await chrome.close(); server.close(); },
  };
}

// ---- one file: decode, limit piece by piece, gather what the limiter did
function channels(file) {
  const s = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'json', file]).toString()).streams[0] || {};
  return s.channels === 1 ? 1 : 2;
}
// The program of a file (from its skip point, at most MAXSECS), decoded at RATE into raw interleaved floats,
// and read back a stretch at a time: frames [a, b), zeros outside it.
function decode(file, it) {
  const CH = channels(file), raw = file + '.f32', from = it.skip || 0, secs = Math.min((it.out || Infinity) - from, MAXSECS);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-ss', String(from), ...(isFinite(secs) ? ['-t', String(secs)] : []), '-ac', String(CH), '-ar', String(RATE), '-f', 'f32le', raw]);
  const N = Math.floor(fs.statSync(raw).size / (4 * CH)), fd = fs.openSync(raw, 'r');
  const read = (a, b) => {
    const x = new Float32Array((b - a) * CH), lo = Math.max(0, a), hi = Math.min(N, b);
    if (hi > lo) { const buf = Buffer.alloc((hi - lo) * CH * 4); fs.readSync(fd, buf, 0, buf.length, lo * CH * 4); new Uint8Array(x.buffer, (lo - a) * CH * 4, buf.length).set(buf); }
    return x;
  };
  return { CH, N, from, read, close: () => { fs.closeSync(fd); fs.rmSync(raw, { force: true }); } };
}
async function limitFile(B, cfgs, LAG, file, it, D = null) {
  const own = !D; D = D || decode(file, it);
  const { CH, N, from, read } = D, g = Math.pow(10, it.gain / 20), K = cfgs.length;
  const inM = new Meter(CH), st = cfgs.map(() => ({ m: new Meter(CH), c1: 0, c3: 0, c6: 0, min: 1, peak: 0, bIn: 0, bOut: 0, sub: [], subMax: [] }));
  for (let s = 0; s < N; s += PIECE) {
    const L = Math.min(PIECE, N - s), F = PRE + L + LAG, x = read(s - PRE, s + L + LAG), input = new Float32Array(2 * F);
    for (let i = 0; i < F; i++) { let v = x[i * CH]; if (CH === 2) { const w = x[i * 2 + 1]; if (Math.abs(w) > Math.abs(v)) v = w; } input[i] = v * g; input[F + i] = PROBE; }
    const { stats, envs } = await B.limit(input, F, cfgs, PRE, L, LAG), body = x.subarray(PRE * CH, (PRE + L) * CH), D = Math.floor(L / STEP) + 1;
    inM.feed(body, 0, L, g, null);
    for (let k = 0; k < K; k++) {
      const o = st[k], p = stats[k], env = new Float32Array(L);
      for (const f of ['c1', 'c3', 'c6', 'bIn', 'bOut']) o[f] += p[f];
      o.min = Math.min(o.min, p.min); o.peak = Math.max(o.peak, p.peak); for (const v of p.sub) o.sub.push(v); for (const v of p.subMax) o.subMax.push(v);
      for (let j = 0; j < L; j++) { const i = Math.floor(j / STEP), t = (j % STEP) / STEP, e0 = envs[k * D + i], e1 = envs[k * D + Math.min(i + 1, D - 1)]; env[j] = e0 + (e1 - e0) * t; }
      o.m.feed(body, 0, L, g, env);
    }
  }
  if (own) D.close();
  const Iin = inM.I(), res = { channels: CH, secs: r1(N / RATE), I_in: r2(Iin), limits: {} };
  Object.defineProperty(res, 'subs', { value: st.map((o) => ({ sub: o.sub, subMax: o.subMax })) }); // for clips; not saved
  cfgs.forEach((c, k) => {
    const o = st[k], W = 30; let best = -1, at = 0, sum = 0;
    for (let j = 0; j < o.sub.length; j++) { sum += o.sub[j] - (j >= W ? o.sub[j - W] : 0); if (j >= W - 1 && sum > best) { best = sum; at = j - W + 1; } }
    const Iout = o.m.I();
    res.limits[c.name] = { gr1: r4(o.c1 / N), gr3: r4(o.c3 / N), gr6: r4(o.c6 / N), grMax: r2(o.min < 1 ? -db(o.min) : 0), peak: r2(o.peak > 0 ? db(o.peak) : -Infinity), I_out: r2(Iout), dI: r2(Iout != null && Iin != null ? Iout - Iin : null), dBed: r2(o.bIn > 0 ? 10 * Math.log10(o.bOut / o.bIn) : null), worst: best > 0 ? { at: r1(from + at / 10), gr: r2(best / W) } : null };
  });
  return res;
}

async function run(listPath, outPath, { local = false } = {}) {
  const list = JSON.parse(fs.readFileSync(listPath, 'utf8')), cfgs = settings(), existed = fs.existsSync(outPath);
  const out = existed ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : { started: new Date().toISOString(), settings: cfgs, files: [] };
  if (JSON.stringify(out.settings) !== JSON.stringify(cfgs)) throw new Error(`${outPath} was made with other settings: start a new one`);
  const done = new Set(out.files.map((x) => x.id + '/' + x.f)), todo = list.files.filter((x) => !done.has(x.id + '/' + x.f));
  if (!todo.length) { console.log('nothing left to limit'); return out; }
  const B = await browser(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-limit-'));
  try {
    const L = await B.lag(cfgs[0]), LAG = L.lag;
    if (!(LAG >= 0 && LAG < 2048 && Math.abs(L.gain - 1) < 0.01)) throw new Error(`the limiter's delay looks wrong: ${JSON.stringify(L)}`);
    out.lag_frames = LAG; out.chrome = await (async () => { try { return execFileSync(process.env.CHROME_PATH || '/usr/bin/google-chrome', ['--version']).toString().trim(); } catch (e) { return null; } })();
    let k = 0;
    for (const it of todo) {
      k++;
      const rec = { pool: it.pool, id: it.id, f: it.f, gain: it.gain, gain0: it.gain0, skip: it.skip, out: it.out, I: it.I, TP: it.TP }, t0 = Date.now();
      const file = it.path || path.join(tmp, 'a' + (path.extname(it.f).toLowerCase() || '.mp3'));
      try {
        if (!it.path) rec.bytes = await download(ia(it.id, it.f), file);
        Object.assign(rec, await limitFile(B, cfgs, LAG, file, it));
        rec.secs_taken = r1((Date.now() - t0) / 1000);
      } catch (e) { rec.error = String((e && e.message) || e).slice(0, 300); }
      if (!it.path) fs.rmSync(file, { force: true });
      out.files.push(rec);
      if (!local) fs.writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
      const p = rec.limits && rec.limits.page;
      console.log(`${String(k).padStart(3)}/${todo.length} ${String(it.pool).padEnd(9)} ${rec.error ? 'ERROR ' + rec.error : `+${it.gain} dB (+${it.gain0} without): over 1 dB ${(100 * p.gr1).toFixed(2)}% of the time, over 3 dB ${(100 * p.gr3).toFixed(2)}%, at most ${p.grMax} dB, peak ${p.peak} dBFS, costs ${p.dI} LU (${p.dBed} dB under the peaks)`}  ${String(it.f).slice(0, 50)}`);
    }
  } finally { await B.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  out.finished = new Date().toISOString();
  if (!local) fs.writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
  return out;
}

// ---- the files to check: per pool, the ones whose gain leans on the limiter most
const QUOTA = { g78: 12, stories: 8, poems: 8, works: 8, chopin: 3, midnight: 2, rocket: 2, saddle: 2, whodunit: 2, laugh: 1, shows: 1, free: 1 };
function pick(outPath = path.join(ROOT, 'research', 'loudness', 'limiter', 'files.json')) {
  const M = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'measurements.json'), 'utf8')).files.filter((x) => !x.error);
  const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'levels.json'), 'utf8')).items, files = [];
  for (const pool of [...new Set(M.map((x) => x.pool))].sort()) {
    const lean = M.filter((x) => x.pool === pool).map((x) => ({ x, v: T[x.id] && T[x.id][x.f] })).filter((o) => o.v && o.v.length === 4);
    lean.sort((a, b) => b.v[0] - b.v[3] - (a.v[0] - a.v[3]) || b.v[0] - a.v[0] || (a.x.id + a.x.f < b.x.id + b.x.f ? -1 : 1));
    for (const { x, v } of lean.slice(0, QUOTA[pool] || 1)) files.push({ pool, id: x.id, f: x.f, gain: v[0], skip: v[1], out: v[2], gain0: v[3], I: x.I, TP: x.TP, dur: x.dur });
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ made: new Date().toISOString().slice(0, 10), method: 'per pool, the files whose gain leans on the limiter most (gain with it less gain without it), then the quietest', quota: QUOTA, files }, null, 1) + '\n');
  console.log(`${files.length} files → ${path.relative(ROOT, outPath)}: ` + Object.entries(files.reduce((a, x) => ((a[x.pool] = (a[x.pool] || 0) + 1), a), {})).map(([p, n]) => p + ' ' + n).join(', '));
}

// ---- self-test: synthetic recordings whose answers are known
function wav(file, ch, secs, fn) { // 32-bit float WAV at 48 kHz; fn(t, c) gives each sample
  const n = Math.round(secs * RATE), data = Buffer.alloc(n * ch * 4), h = Buffer.alloc(44);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) data.writeFloatLE(fn(i / RATE, c, i), (i * ch + c) * 4);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(ch, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * ch * 4, 28); h.writeUInt16LE(ch * 4, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
async function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-limit-test-')), cfg = settings()[0], T = cfg.threshold, sin = (f, t) => Math.sin(2 * Math.PI * f * t);
  const click = (t) => { const p = t % 1 - 0.5; return p >= 0 && p < 0.001 ? Math.sin(Math.PI * p / 0.001) * ((Math.floor(p * RATE) % 2) ? 1 : -1) : 0; };
  const over = (dB) => dB * (1 - 1 / cfg.ratio); // the steady reduction for a tone dB over the threshold
  const cases = [ // name, channels, seconds, sample function, the file's levels, expected values [value, tolerance] or checks
    ['tone well under the threshold', 1, 20, (t) => 0.1 * sin(1000, t), { gain: 6 }, { gr1: [0, 0], grMax: [0, 0.05], peak: [-14, 0.05], dI: [0, 0.02] }],
    ['tone 4 dB over the threshold', 1, 20, (t) => 0.1 * sin(1000, t), { gain: 20 + T + 4 }, { gr3: [1, 0.02], gr6: [0, 0], grMax: [over(4), 0.2], peak: (v) => v > T - 0.2 && v < T + 0.75, dI: [-over(4), 0.2] }],
    ['stereo, the same tone on the left only', 2, 20, (t, c) => (c ? 0 : 0.1 * sin(1000, t)), { gain: 20 + T + 4 }, { gr3: [1, 0.02], grMax: [over(4), 0.2], dI: [-over(4), 0.2] }],
    ['clicks 7 dB over the threshold, on quiet music', 1, 20, (t) => 0.03 * sin(440, t) + 0.56 * click(t), { gain: 10 }, { peak: (v) => v < 0 && v > T - 0.5, gr1: (v) => v > 0.01 && v < 0.12, gr6: (v) => v < 0.01, dBed: (v) => v > -0.3 && v <= 0 }],
    ['skip and end points', 1, 14, (t) => (t < 2 || t > 12 ? 0 : 0.1 * sin(1000, t)), { gain: 0, skip: 2, out: 12 }, { secs: [10, 0.05], gr1: [0, 0] }],
  ];
  const list = { files: cases.map(([name, ch, secs, fn, lv], i) => { const p = path.join(tmp, `case${i}.wav`); wav(p, ch, secs, fn); return Object.assign({ pool: 'test', id: 'case' + i, f: name, path: p, gain0: lv.gain, skip: 0, out: secs }, lv); }) };
  const listPath = path.join(tmp, 'list.json'); fs.writeFileSync(listPath, JSON.stringify(list));
  const out = await run(listPath, path.join(tmp, 'out.json'), { local: true });
  let bad = 0;
  // The input loudness the meter reads, against tools/lufs.js on the same samples.
  const x0 = new Float32Array(20 * RATE); for (let i = 0; i < x0.length; i++) x0[i] = 0.1 * Math.pow(10, 6 / 20) * sin(1000, i / RATE);
  const want0 = lufs(x0, RATE).I, got0 = out.files[0].I_in;
  if (!(Math.abs(got0 - want0) < 0.02)) { bad++; console.log(`FAIL meter: ${got0} LUFS, tools/lufs.js says ${want0.toFixed(2)}`); } else console.log(`ok   meter: ${got0} LUFS, as tools/lufs.js`);
  if (out.lag_frames !== Math.round(0.006 * RATE)) console.log(`note: the limiter's delay is ${out.lag_frames} frames, not the 6 ms expected`);
  cases.forEach(([name, , , , , want], i) => {
    const r = out.files[i], p = r.error ? null : Object.assign({ secs: r.secs }, r.limits.page), probs = [];
    if (!p) probs.push(r.error);
    else for (const [k, w] of Object.entries(want)) { const v = p[k]; if (typeof w === 'function' ? !w(v) : !(Math.abs(v - w[0]) <= w[1] + 1e-9)) probs.push(`${k} ${v}, expected ${typeof w === 'function' ? w.toString().replace(/^\(v\) => /, '') : w[0] + ' ± ' + w[1]}`); }
    if (probs.length) bad++;
    console.log(`${probs.length ? 'FAIL' : 'ok  '} ${name}${probs.length ? ': ' + probs.join('; ') : ''}  ${p ? JSON.stringify({ gr1: p.gr1, gr3: p.gr3, gr6: p.gr6, grMax: p.grMax, peak: p.peak, dI: p.dI, dBed: p.dBed }) : ''}`);
  });
  // Clips: the clicks file at +10 dB with the limiter and +3 dB without. Its clips should have the music
  // at the same level either way and the clicks lower with the limiter.
  const cdir = path.join(tmp, 'clips'), ci = list.files[3], cl = path.join(tmp, 'clips.json');
  fs.writeFileSync(cl, JSON.stringify({ files: [Object.assign({}, ci, { gain0: 3 })] }));
  const idx = await clips(cl, cdir, 2, 4), sp = idx.files[0].spots, pcm = (f) => { const b = fs.readFileSync(path.join(cdir, f)); const x = new Float32Array((b.length - 44) / 2); for (let i = 0; i < x.length; i++) x[i] = b.readInt16LE(44 + 2 * i) / 32767; return x; };
  const probs = [];
  if (sp.length !== 2) probs.push(`${sp.length} spots, expected 2`);
  for (const p of sp) {
    const A = pcm(p.a), Bc = pcm(p.b), rms = (x, a0, n) => { let e = 0; for (let i = a0; i < a0 + n; i++) e += x[i] * x[i]; return Math.sqrt(e / n); }, pk = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    if (A.length !== 4 * RATE || Bc.length !== A.length) probs.push(`clip lengths ${A.length} and ${Bc.length}, expected ${4 * RATE}`);
    // the music just before each click (0.5 s into each second of the file, so at whole seconds plus 0.5 from the clip's start, less its offset)
    const off = Math.round(((0.5 - (p.at % 1)) + 1) % 1 * RATE), quiet = Math.max(0, off - Math.round(0.2 * RATE)), dbBed = 20 * Math.log10(rms(Bc, quiet, Math.round(0.15 * RATE)) / rms(A, quiet, Math.round(0.15 * RATE)));
    if (!(Math.abs(dbBed) < 0.3)) probs.push(`at ${p.at} s the music is ${dbBed.toFixed(2)} dB apart between the clips`);
    if (!(pk(Bc) < pk(A) * 0.8)) probs.push(`at ${p.at} s the clicks are no lower with the limiter: peaks ${pk(A).toFixed(3)} and ${pk(Bc).toFixed(3)}`);
  }
  if (probs.length) bad++;
  console.log(`${probs.length ? 'FAIL' : 'ok  '} clips: the music level-matched, the clicks lower with the limiter${probs.length ? ': ' + probs.join('; ') : ''}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad ? `${bad} self-tests failed` : `all ${cases.length + 2} self-tests passed`);
  process.exitCode = bad ? 1 : 0;
}

// ---- clips for listening: where the limiter works hardest, without it and with it, at the same level
function wav16(file, x, ch) { // 16-bit PCM WAV at RATE from interleaved floats
  const data = Buffer.alloc(x.length * 2), h = Buffer.alloc(44);
  for (let i = 0; i < x.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), i * 2);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(ch, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * ch * 2, 28); h.writeUInt16LE(ch * 2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
async function clips(listPath, outDir, N = 3, SECS = 12) {
  const list = JSON.parse(fs.readFileSync(listPath, 'utf8')), cfg = settings()[0], W = SECS * 10, L = SECS * RATE, EDGE = Math.round(0.01 * RATE);
  fs.mkdirSync(outDir, { recursive: true });
  const B = await browser(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-clips-')), index = { made: new Date().toISOString(), setting: cfg, secs: SECS, files: [] };
  try {
    const LAG = (await B.lag(cfg)).lag;
    for (const [i, it] of list.files.entries()) {
      const file = it.path || path.join(tmp, 'a' + (path.extname(it.f).toLowerCase() || '.mp3'));
      if (!it.path) await download(ia(it.id, it.f), file);
      const D = decode(file, it), res = await limitFile(B, [cfg], LAG, file, it, D), { sub, subMax } = res.subs[0];
      // The spots: most 0.1 s blocks with more than 3 dB off, then the most reduction overall; none overlapping.
      const score = (j) => { let s = 0; for (let k = j; k < j + W; k++) s += (subMax[k] >= 3 ? 1000 : 0) + sub[k]; return s; };
      const cand = []; for (let j = 0; j + W <= sub.length; j += 5) cand.push([score(j), j]);
      cand.sort((a, b) => b[0] - a[0]);
      const picks = []; for (const [s, j] of cand) { if (s <= 0 || picks.length >= N) break; if (picks.every((p) => Math.abs(p - j) >= W)) picks.push(j); }
      picks.sort((a, b) => a - b);
      const CH = D.CH, g = Math.pow(10, it.gain / 20), g0 = Math.pow(10, it.gain0 / 20), back = Math.pow(10, (it.gain0 - it.gain) / 20);
      const rec = { pool: it.pool, id: it.id, f: it.f, title: it.title || null, gain: it.gain, gain0: it.gain0, channels: CH, gr1: res.limits.page.gr1, spots: [] };
      for (const [k, j] of picks.entries()) {
        const start = j * RATE / 10, F = PRE + L + LAG, x = D.read(start - PRE, start + L + LAG), input = new Float32Array(CH * F);
        for (let n = 0; n < F; n++) for (let c = 0; c < CH; c++) input[c * F + n] = x[n * CH + c] * g;
        const out = await B.clip(input, F, CH, cfg), a = new Float32Array(L * CH), b = new Float32Array(L * CH);
        for (let n = 0; n < L; n++) {
          const fade = Math.min(1, n / EDGE, (L - 1 - n) / EDGE); // 10 ms in and out, so the clip's own edges don't click
          for (let c = 0; c < CH; c++) { a[n * CH + c] = x[(PRE + n) * CH + c] * g0 * fade; b[n * CH + c] = out[c * F + PRE + LAG + n] * back * fade; }
        }
        const name = `${i + 1}-${k + 1}`;
        wav16(path.join(outDir, name + 'a.wav'), a, CH); wav16(path.join(outDir, name + 'b.wav'), b, CH);
        let mx = 0, o3 = 0; for (let q = j; q < j + W; q++) { mx = Math.max(mx, subMax[q]); if (subMax[q] >= 3) o3++; }
        rec.spots.push({ at: r1(D.from + j / 10), a: name + 'a.wav', b: name + 'b.wav', grMax: r1(mx), over3: o3 });
      }
      D.close(); if (!it.path) fs.rmSync(file, { force: true });
      index.files.push(rec);
      console.log(`${it.f}: ${rec.spots.map((p) => `${Math.floor(p.at / 60)}:${String(Math.floor(p.at % 60)).padStart(2, '0')} (up to ${p.grMax} dB, ${p.over3} × 0.1 s over 3 dB)`).join('; ') || 'nowhere it works'}`);
    }
  } finally { await B.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  fs.writeFileSync(path.join(outDir, 'clips.json'), JSON.stringify(index, null, 1) + '\n');
  return index;
}

// ---- summary
const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
function report(outPath) {
  const res = JSON.parse(fs.readFileSync(outPath, 'utf8')), ok = res.files.filter((x) => !x.error), names = res.settings.map((c) => c.name);
  const pc = (x) => (x == null ? '–' : (100 * x).toFixed(x < 0.001 ? 3 : x < 0.1 ? 2 : 1) + '%'), f1 = (x) => (x == null ? '–' : x.toFixed(1)), f2 = (x) => (x == null ? '–' : x.toFixed(2));
  const hours = ok.reduce((a, x) => a + x.secs, 0) / 3600, P = res.settings[0];
  const L = [`${ok.length} files (${hours.toFixed(1)} hours) through Chrome's limiter${res.chrome ? ' (' + res.chrome + ')' : ''}, ${res.files.length - ok.length} failed. The page's setting: threshold ${P.threshold} dBFS, ratio ${P.ratio}, attack ${P.attack} s, release ${P.release} s, ${P.makeup.toFixed(2)} dB of the browser's makeup gain taken back out.`, ''];
  L.push('Across the files, for each setting (median, and the worst file):', '', '| Setting | Over 1 dB reduction | Over 3 dB | Over 6 dB | Most taken off | Highest sample out | Loudness cost |', '|---|---|---|---|---|---|---|');
  for (const n of names) {
    const v = (k) => ok.map((x) => x.limits[n][k]).filter((y) => y != null);
    L.push(`| ${n} | ${pc(q(v('gr1'), 0.5))}, ${pc(Math.max(...v('gr1')))} | ${pc(q(v('gr3'), 0.5))}, ${pc(Math.max(...v('gr3')))} | ${pc(q(v('gr6'), 0.5))}, ${pc(Math.max(...v('gr6')))} | ${f1(q(v('grMax'), 0.5))} dB, ${f1(Math.max(...v('grMax')))} dB | ${f2(q(v('peak'), 0.5))}, ${f2(Math.max(...v('peak')))} dBFS | ${f2(q(v('dI'), 0.5))}, ${f2(Math.min(...v('dI')))} LU |`);
  }
  L.push('', "By pool, at the page's setting (median; the worst file in brackets). Comes out at: the program's loudness with the limiter, against the -20 LUFS aimed for, and without the limiter at its lower gain:", '', '| Pool | Files | Leans on it by | Over 1 dB | Over 3 dB | Loudness cost | Comes out at | Without the limiter |', '|---|---|---|---|---|---|---|---|');
  for (const pool of [...new Set(ok.map((x) => x.pool))].sort()) {
    const r = ok.filter((x) => x.pool === pool), v = (k) => r.map((x) => x.limits.page[k]);
    const at = r.map((x) => x.I_in + x.limits.page.dI), w0 = r.map((x) => x.I_in - x.gain + x.gain0);
    L.push(`| ${pool} | ${r.length} | ${f1(q(r.map((x) => x.gain - x.gain0), 0.5))} dB | ${pc(q(v('gr1'), 0.5))} (${pc(Math.max(...v('gr1')))}) | ${pc(q(v('gr3'), 0.5))} (${pc(Math.max(...v('gr3')))}) | ${f2(q(v('dI'), 0.5))} (${f2(Math.min(...v('dI')))}) LU | ${f1(q(at, 0.5))} (${f1(Math.min(...at))}) LUFS | ${f1(q(w0, 0.5))} (${f1(Math.min(...w0))}) LUFS |`);
  }
  L.push('', "Each file, at the page's setting:", '', '| Pool | File | Gain (without) | Over 1 dB | Over 3 dB | Most | Peak out | Cost | Works hardest at |', '|---|---|---|---|---|---|---|---|---|');
  const t = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  for (const x of ok.slice().sort((a, b) => (a.pool < b.pool ? -1 : a.pool > b.pool ? 1 : b.limits.page.gr1 - a.limits.page.gr1))) {
    const p = x.limits.page;
    L.push(`| ${x.pool} | [${x.f.split('/').pop().replace(/\|/g, '/').slice(0, 48)}](${ia(x.id, x.f)}) | +${x.gain} (+${x.gain0}) dB | ${pc(p.gr1)} | ${pc(p.gr3)} | ${f1(p.grMax)} dB | ${f2(p.peak)} dBFS | ${f2(p.dI)} LU | ${p.worst ? t(p.worst.at) + ', ' + f1(p.worst.gr) + ' dB' : '–'} |`);
  }
  for (const x of res.files.filter((y) => y.error)) L.push(`| ${x.pool} | ${x.f.split('/').pop()} | failed: ${x.error} |||||||`);
  console.log(L.join('\n'));
}

module.exports = { Meter, settings, makeupDb, pageLimiter };
if (require.main !== module) return;
const [cmd, ...args] = process.argv.slice(2);
const cli = { pick: () => pick(args[0]), run: () => run(args[0], args[1]), selftest: () => selftest(), report: () => report(args[0]), clips: () => clips(args[0], args[1], +(args[2] || 3), +(args[3] || 12)) }[cmd];
if (!cli) { console.error('usage: node tools/limiter_check.js pick [OUT] | run LIST OUT | selftest | report OUT | clips LIST DIR [N] [SECS]'); process.exitCode = 2; }
else Promise.resolve(cli()).catch((e) => { console.error(e); process.exitCode = 1; });
