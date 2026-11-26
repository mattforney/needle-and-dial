// Playback test: does the radio keep going across program changes with the screen locked?
//
// It drives the built page in headless Chrome and imitates a phone browser that is strict
// about background audio (the Brave-on-Android failure): a player may only start if a tap
// started it before, and with the screen locked nothing new may start unless something is
// already playing. Archive.org audio is replaced by generated WAV files of the right length,
// and the page clock is moved to just before a change of record on WGRM.
//
//   node tools/test_playback.js [path/to/index.html]
//   ND_LOG=1 prints each page's debug log; ND_QS=audio=direct adds to the page's query string;
//   ND_ONLY=<part of a check's name> runs just the checks that match.
//
// Needs Chrome (CHROME_PATH, or /usr/bin/google-chrome) and playwright-core.
const fs = require('fs');
const path = require('path');
let pw;
try { pw = require('playwright-core'); } catch (e) { pw = require('playwright'); }

const htmlPath = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(__dirname, '..', 'dist', 'index.html');
const HTML = fs.readFileSync(htmlPath, 'utf8');
const code = HTML.split('// ==ENGINE==')[1].split('// ==/ENGINE==')[0];
const INLINE = JSON.parse(HTML.split('<script id="catalog" type="application/json">')[1].split('</script>')[0]);
const snapshotted = Array.isArray(INLINE); // pages built before weekly snapshots inline one catalog
const api = new Function('CAT', code + `\nreturn { STATIONS, parseCatalog, makeScheduler, ia${snapshotted ? ', loadSnapshots, schedulerFor' : ''} };`)(null);
const SCH = snapshotted ? api.schedulerFor(api.loadSnapshots(INLINE)) : api.makeScheduler(api.parseCatalog(INLINE));
const S = api.STATIONS.find((s) => s.key === 'gramophone');
const PRESET = api.STATIONS.indexOf(S);
const url = (seg) => api.ia(seg.id, seg.f);

// ---- the moments to test
const next = (c) => SCH.at(S, c.start + c.seg.d + 0.01);
function find(from, pred) {
  let c = SCH.at(S, from);
  for (let k = 0; k < 5000; k++) { const n1 = next(c), n2 = next(n1); if (pred(c, n1, n2)) return { c, n1, n2 }; c = n1; }
  throw new Error('pattern not found');
}
const media = (x) => !!x.seg.f;
const from = Date.now() / 1000 + 300;
const a = find(from, (c, n1) => media(c) && !c.seg.cut && c.seg.d > 60 && media(n1) && n1.seg.d > 60);
const b = find(from, (c, n1, n2) => media(c) && n1.seg.k === 'id' && media(n2) && n2.seg.d > 40);
const end = (x) => x.start + x.seg.d;
const isClip = (p) => p.src.startsWith('blob:');
const playingUrl = (u, minT = 1) => (ps) => ps.some((p) => p.src === u && p.t > minT) || 'expected ' + decodeURIComponent(u.split('/').pop()).slice(0, 40) + ' to be playing';
const playingLoop = (ps) => ps.some((p) => isClip(p) && p.loop && p.carrier) || 'expected the carrier on a looping clip';

const SCEN = [
  { name: 'record to record', at: end(a.c), first: a.c, checks: [[a.n1.start + 5, playingUrl(url(a.n1.seg))]] },
  { name: 'record, station ID, record', at: end(b.c), first: b.c,
    checks: [[b.n1.start + 4, (ps) => ps.some((p) => p.carrier && isClip(p) && !p.loop) || 'expected the ID clip on the carrier'], [b.n2.start + 5, playingUrl(url(b.n2.seg))]] },
  { name: 'record shorter than its slot', at: end(a.c), first: a.c, len: { [url(a.c.seg)]: a.c.seg.d - 6 },
    checks: [[end(a.c) - 3, playingLoop], [a.n1.start + 5, playingUrl(url(a.n1.seg))]] },
  { name: 'next record fails to load once', at: end(a.c), first: a.c, failOnce: [url(a.n1.seg)],
    checks: [[a.n1.start + 4, playingLoop], [a.n1.start + 14, playingUrl(url(a.n1.seg), 8)]] },
];

// ---- fake archive.org: a quiet tone of the right length for each file
const WAVS = new Map();
function wavFor(sc, u) {
  const sec = (sc.len && sc.len[u]) || [a.c, a.n1, b.c, b.n2].filter((x) => url(x.seg) === u).map((x) => x.seg.nd || x.seg.d)[0] || 240;
  if (WAVS.has(u + '|' + sec)) return WAVS.get(u + '|' + sec);
  const sr = 8000, n = Math.round(sec * sr), buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr, 28);
  buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34); buf.write('data', 36); buf.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) buf[44 + i] = 128 + Math.round(20 * Math.sin(2 * Math.PI * 440 * i / sr));
  WAVS.set(u + '|' + sec, buf);
  return buf;
}

// ---- runs in the page before its own scripts
function init({ offset, strict, timers }) {
  const realNow = Date.now.bind(Date);
  Date.now = () => realNow() + offset;
  window.__SKY_TEST_MUTE__ = true;
  let hidden = false;
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  window.__lock = (h = true) => { hidden = h; document.dispatchEvent(new Event('visibilitychange')); };
  // Background timers: 'slow' fires at most once a second (what Chrome does), 'off' never fires.
  const SI = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...args) => { let last = 0; return SI(() => { if (hidden) { const t = performance.now(); if (timers === 'off' || t - last < 1000) return; last = t; } fn(...args); }, ms); };
  const T = (window.__T = { players: new Set(), refused: [] });
  let tapUntil = 0;
  const started = new WeakSet();
  for (const ev of ['pointerdown', 'keydown', 'click']) addEventListener(ev, (e) => { if (e.isTrusted) tapUntil = performance.now() + 5000; }, true);
  const playing = () => [...T.players].some((m) => !m.paused && !m.ended);
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    T.players.add(this);
    const tap = performance.now() < tapUntil;
    let why = '';
    if (strict && !tap && !started.has(this)) why = 'this player was never started by a tap';
    else if (strict && !tap && hidden && !playing()) why = 'screen locked and nothing else playing';
    if (why) { T.refused.push({ why, src: (this.currentSrc || this.src).slice(-70), at: Date.now() / 1000 }); return Promise.reject(new DOMException('simulated: ' + why, 'NotAllowedError')); }
    if (tap) started.add(this);
    return play.call(this);
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageNow = (page) => page.evaluate(() => Date.now() / 1000);
async function until(page, t) { for (;;) { if ((await pageNow(page)) >= t) return; await sleep(200); } }
const players = (page) => page.evaluate(() => [...window.__T.players].filter((m) => !m.paused && !m.ended).map((m) => ({ src: m.currentSrc, t: m.currentTime, loop: m.loop, carrier: !!(window.SKY && window.SKY.A && window.SKY.A.el === m) })));

async function open(browser, sc, opt) {
  const ctx = await browser.newContext(opt.ua ? { userAgent: opt.ua } : {});
  const failed = new Set();
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route('http://nd.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await ctx.route('https://archive.org/download/**', async (route) => {
    if (sc.slow && sc.slow.test(route.request().url())) await sleep(2500); // a slow network keeps the file loading
    const req = route.request(), u = req.url(), h = { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'access-control-allow-origin': '*' };
    if (req.method() === 'GET' && sc.failOnce && sc.failOnce.includes(u) && !failed.has(u)) { failed.add(u); return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'not found' }); }
    const buf = wavFor(sc, u);
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { ...h, 'content-length': String(buf.length) }, body: '' });
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers()['range'] || '');
    if (!m) return route.fulfill({ status: 200, headers: h, body: buf });
    // At most 512 KB an answer, as some servers do: the player asks again as it needs more. Sending whole
    // files through the test browser's control channel slowed every other check down.
    const s = m[1] ? +m[1] : 0, e = Math.min(m[2] ? +m[2] : Infinity, buf.length - 1, s + 524287);
    return route.fulfill({ status: 206, headers: { ...h, 'content-range': `bytes ${s}-${e}/${buf.length}` }, body: buf.subarray(s, e + 1) });
  });
  await ctx.addInitScript(init, { offset: Math.round((sc.at - (sc.lead || 14)) * 1000 - Date.now()), strict: opt.strict, timers: opt.timers });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://nd.test/?debug=1' + (process.env.ND_QS ? '&' + process.env.ND_QS : ''));
  await page.click(`#presets button[data-i="${PRESET}"]`);
  const firstUrl = url(sc.first.seg);
  let started = false;
  for (let i = 0; i < 40 && !started; i++) { started = (await players(page)).some((p) => p.src === firstUrl && p.t > 0.2); if (!started) await sleep(200); }
  return { ctx, page, errors, started };
}
async function finish(t, name, problems) {
  const res = await t.page.evaluate(() => ({ refused: window.__T.refused, log: window.SKY && window.SKY.log ? window.SKY.log() : '' }));
  await t.ctx.close();
  if (!t.started) problems.unshift('first record never started');
  for (const x of res.refused) problems.push(`refused: ${x.why} (${x.src})`);
  for (const e of t.errors) problems.push('page error: ' + e);
  return { name, ok: !problems.length, problems, log: res.log };
}

async function run(browser, sc, opt) {
  const t = await open(browser, sc, opt);
  if (opt.lock) await t.page.evaluate(() => window.__lock());
  const problems = [];
  for (const [at, check] of sc.checks) { await until(t.page, at); const r = check(await players(t.page)); if (r !== true) problems.push(`at ${(at - sc.at).toFixed(0)} s: ${r}`); }
  return finish(t, `${sc.name} · ${opt.label}`, problems);
}

// Things a listener does with the screen on: tune away and back, get paused by the phone, power off and on.
async function handling(browser) {
  const sc = { at: end(a.c), first: a.c, lead: 40 };
  const t = await open(browser, sc, { strict: true, timers: 'slow' });
  const { page } = t, problems = [];
  const state = () => page.evaluate(() => { const A = window.SKY.A; return { src: A.el.currentSrc, t: A.el.currentTime, paused: A.el.paused, held: A.held, card: document.querySelector('#card').textContent }; });
  await page.evaluate(() => { window.__emptied = 0; window.SKY.A.el.addEventListener('emptied', () => window.__emptied++); });
  const s0 = await state();
  await page.evaluate(() => window.SKY.sweepTo('AM', 1300, 1));
  await sleep(2500);
  await page.evaluate(() => window.SKY.sweepTo('AM', 1340, 1));
  await sleep(1200);
  const s1 = await state();
  if (s1.src !== s0.src || s1.t < s0.t + 2 || (await page.evaluate(() => window.__emptied))) problems.push('tuning away and back reloaded the record');
  await page.evaluate(() => window.SKY.A.el.pause()); // what a phone call or the notification does
  await sleep(700);
  const s2 = await state();
  if (!s2.held || !/Tap anywhere/.test(s2.card)) problems.push('an outside pause was not shown as paused');
  await page.mouse.click(10, 10);
  await sleep(800);
  const s3 = await state();
  if (s3.paused || s3.held) problems.push('a tap did not resume after an outside pause');
  await page.click('#power'); await sleep(400);
  if (!(await state()).paused) problems.push('power off did not stop the carrier');
  await page.click('#power'); await sleep(2500);
  const s4 = await state();
  if (s4.paused || s4.src !== s0.src) problems.push('power on did not return to the record');
  return finish(t, 'tune away and back, outside pause, power off and on', problems);
}

// iPhone pauses a station that is still loading when the screen locks (seen 25 and 26 Nov). With
// the keep-alive still playing, the page should start it again by itself, without an unlock.
const WHOD = api.STATIONS.find((s) => s.call === 'WHOD');
// The iPhone from the 26 Nov tests: the page should pick direct audio and the keep-alive by itself.
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1';
async function lockWhileLoading(browser, ua) {
  const name = 'paused while loading at lock time, restarted' + (ua ? ' · iPhone' : '');
  const sc = { at: end(a.c), first: a.c, lead: 40, slow: /OTRR_|whodunit/i, len: {} };
  for (let t = sc.at - 45; t < sc.at + 5; t++) { const c = SCH.at(WHOD, t); if (media(c)) sc.len[url(c.seg)] = c.seg.nd || c.seg.d; }
  const t = await open(browser, sc, { strict: true, timers: 'slow', ua });
  const { page } = t, problems = [];
  await page.evaluate(() => window.SKY.sweepTo('AM', 640, 1)); // tune to WHOD with the screen on
  let u = '';
  for (let i = 0; i < 30 && !u; i++) { await sleep(100); u = await page.evaluate(() => (window.SKY.A.kind === 'media' && window.SKY.TUNED && window.SKY.TUNED.call === 'WHOD' ? window.SKY.A.src : '')); }
  if (!u) { problems.push('WHOD never started loading'); return finish(t, name, problems); }
  await sleep(800);
  // lock, and pause the station the way iOS does when the file hasn't started playing yet
  const loading = await page.evaluate(() => { const el = window.SKY.A.el, r = el.readyState; window.__lock(); el.pause(); return r < 3; });
  if (!loading) problems.push('the file had already loaded, so this checked nothing');
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { await sleep(200); ok = await page.evaluate((u) => { const A = window.SKY.A; return A.src === u && A.shown === u && !A.el.paused && A.el.readyState >= 3; }, u); }
  const s = await page.evaluate(() => ({ held: window.SKY.A.held, log: window.SKY.log() }));
  if (!ok) problems.push('WHOD did not start playing again with the screen locked');
  if (s.held) problems.push('the page gave up and held the station');
  if (!/paused as the screen locked while loading; restarting/.test(s.log)) problems.push('no restart in the log');
  if (ua && !/audio direct, with keep-alive/.test(s.log)) problems.push('expected direct audio with the keep-alive on iPhone');
  return finish(t, name, problems);
}

// Clock sync: the page should adopt the server's time when the device is clearly off, and not otherwise.
// slowMs holds the page's time check that long before the server stamps its answer: a slow uplink, or a busy server.
async function clockSync(browser, skewMs, slowMs = 0) {
  const ctx = await browser.newContext();
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|archive\.org/, (r) => r.abort());
  await ctx.route('http://nd.test/**', async (r) => {
    if (slowMs && r.request().method() === 'HEAD') await sleep(slowMs);
    return r.fulfill({ status: 200, contentType: 'text/html', headers: { date: new Date(Date.now() + skewMs).toUTCString() }, body: HTML });
  });
  const page = await ctx.newPage();
  await page.goto('http://nd.test/?debug=1');
  let c = null;
  for (let i = 0; i < 20 + slowMs / 150 && !c; i++) { await sleep(150); c = await page.evaluate(() => (window.SKY && window.SKY.clock.checked ? { off: window.SKY.clock.off, rtt: window.SKY.clock.rtt } : null)); }
  await ctx.close();
  // The page's estimate is good to within 0.5 s plus half the round trip it measured.
  const want = Math.abs(skewMs) > 2000;
  const ok = !!c && (want ? Math.abs(c.off - skewMs) <= 501 + c.rtt / 2 : c.off === 0);
  return { name: `clock sync, server ${skewMs / 1000} s from the device${slowMs ? ', slow round trip' : ''}`, ok, problems: ok ? [] : [c ? `clock offset ${c.off} ms (round trip ${c.rtt} ms)` : 'no clock check'], log: '' };
}

(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const OPTS = [
    { label: 'unlocked', lock: false, strict: false, timers: 'slow' },
    { label: 'locked, strict browser', lock: true, strict: true, timers: 'slow' },
    { label: 'locked, strict browser, no timers', lock: true, strict: true, timers: 'off' },
  ];
  const jobs = [], only = (process.env.ND_ONLY || '').toLowerCase(), want = (n) => n.toLowerCase().includes(only);
  for (const sc of SCEN) for (const opt of OPTS) if ((opt.lock || sc === SCEN[0] || sc === SCEN[1]) && want(sc.name + ' · ' + opt.label)) jobs.push(run(browser, sc, opt));
  const extra = [['tune away and back, outside pause, power off and on', () => handling(browser)], ['paused while loading at lock time, restarted', () => lockWhileLoading(browser)], ['paused while loading at lock time, restarted · iPhone', () => lockWhileLoading(browser, IPHONE)],
    ['clock sync, server 90 s', () => clockSync(browser, 90000)], ['clock sync, server -45 s', () => clockSync(browser, -45000)], ['clock sync, server 0.8 s', () => clockSync(browser, 800)], ['clock sync, server 0.8 s from the device, slow round trip', () => clockSync(browser, 800, 4000)]];
  if (!process.argv.includes('--old')) for (const [n, f] of extra) if (want(n)) jobs.push(f());
  const results = await Promise.all(jobs);
  await browser.close();
  let fail = 0;
  for (const r of results) {
    if (!r.ok) fail++;
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
    for (const p of r.problems) console.log('      ' + p);
    if ((process.env.ND_LOG || !r.ok) && r.log) console.log(r.log.split('\n').slice(process.env.ND_LOG ? 0 : -20).map((l) => '      | ' + l).join('\n'));
  }
  console.log(fail ? `${fail} of ${results.length} playback checks failed` : `all ${results.length} playback checks passed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
