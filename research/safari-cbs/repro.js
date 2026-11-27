// Plays ads the way the page tunes in mid-item (set src, set currentTime before metadata, play)
// in Playwright's WebKit, and records whether 'ended' fires long before the end.
// node research/safari-cbs/repro.js [reps]   → research/safari-cbs/results-<os>.json
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { webkit } = require('playwright-core');
const DIR = path.join(__dirname, 'files'), REPS = +process.argv[2] || 6;
const FILES = ['OldRadio_Adv--CBS_Radio3.mp3', 'OldRadio_Adv--Camel5.mp3', 'OldRadio_Adv--Blue_Coal1.mp3', 'OldRadio_Adv--Anacin.mp3', 'OldRadio_Adv--Cream_Of_Wheat.mp3', 'OldRadio_Adv--DelMonte_Catsup2.mp3'];
const SEEKS = [0, 3, 6, 9, 15, 25];
const srv = http.createServer((q, r) => {
  const f = path.join(DIR, decodeURIComponent(q.url.split('?')[0].slice(1)));
  if (q.url === '/') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<!doctype html><title>t</title>'); }
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  const b = fs.readFileSync(f), m = /bytes=(\d*)-(\d*)/.exec(q.headers.range || '');
  const h = { 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes', 'access-control-allow-origin': '*' };
  if (!m) { r.writeHead(200, { ...h, 'content-length': b.length }); return r.end(b); }
  const s = +m[1] || 0, e = m[2] ? +m[2] : b.length - 1;
  r.writeHead(206, { ...h, 'content-range': `bytes ${s}-${e}/${b.length}`, 'content-length': e - s + 1 }); r.end(b.subarray(s, e + 1));
});
(async () => {
  await new Promise((ok) => srv.listen(8765, ok));
  const browser = await webkit.launch();
  const out = [];
  for (const host of ['local', 'archive']) for (const f of FILES) for (const seek of SEEKS) for (let k = 0; k < REPS; k++) {
    const ctx = await browser.newContext(), page = await ctx.newPage();
    await page.goto('http://127.0.0.1:8765/');
    const u = host === 'local' ? `http://127.0.0.1:8765/${encodeURIComponent(f)}?r=${k}` : `https://archive.org/download/Old_Radio_Adverts_01/${encodeURIComponent(f)}`;
    const r = await page.evaluate(async ([u, seek]) => {
      const el = new Audio(); el.muted = true; const t0 = performance.now(), ev = [];
      const note = (n) => ev.push([n, +((performance.now() - t0) / 1000).toFixed(2), +el.currentTime.toFixed(2), isFinite(el.duration) ? +el.duration.toFixed(2) : String(el.duration)]);
      for (const n of ['loadedmetadata', 'durationchange', 'seeking', 'seeked', 'playing', 'waiting', 'ended', 'error', 'stalled']) el.addEventListener(n, () => note(n));
      el.src = u; if (seek) try { el.currentTime = seek; } catch (e) { note('seek threw'); }
      el.play().catch((e) => note('play refused ' + e.name));
      await new Promise((ok) => { let p = 0; const iv = setInterval(() => { if (ev.some((x) => x[0] === 'ended' || x[0] === 'error')) { clearInterval(iv); ok(); } if (ev.some((x) => x[0] === 'playing') && ++p > 25) { clearInterval(iv); ok(); } if (performance.now() - t0 > 15000) { clearInterval(iv); ok(); } }, 100); });
      note('done'); return ev;
    }, [u, seek]);
    const end = r.find((x) => x[0] === 'ended'), pl = r.find((x) => x[0] === 'playing');
    const early = !!end && (r.find((x) => x[0] === 'done')[1] < 12) && end[2] < (typeof end[3] === 'number' ? end[3] : 99) - 1;
    out.push({ host, f, seek, k, early, ended: !!end, playing: !!pl, ev: r });
    if (end && end[1] < 10) console.log('EARLY END', host, f, seek, k, JSON.stringify(r));
    await ctx.close();
  }
  await browser.close(); srv.close();
  const sum = {};
  for (const x of out) { const key = `${x.host} ${x.f} @${x.seek}`; sum[key] = sum[key] || { runs: 0, earlyEnded: 0, endedQuick: 0, noPlay: 0 }; sum[key].runs++; if (x.ended && x.ev.find((e) => e[0] === 'ended')[1] < 10) sum[key].endedQuick++; if (!x.playing) sum[key].noPlay++; }
  console.table(sum);
  fs.writeFileSync(path.join(__dirname, `results-${os.platform()}.json`), JSON.stringify({ webkit: browser.version && browser.version(), sum, out }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
