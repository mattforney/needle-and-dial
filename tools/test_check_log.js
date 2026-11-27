// Tests for tools/check_log.js on a real iPhone log and on made-up two-hour logs, good and bad.
const fs = require('fs');
const path = require('path');
const { check } = require('./check_log');

let fail = 0;
const expect = (name, cond, r) => { if (!cond) { fail++; console.log('FAIL', name); if (r) console.log(r.report.split('\n').map((l) => '     | ' + l).join('\n')); } };

// A made-up Brave-on-Android session: power on, tune in, lock, a record every `every` seconds that
// starts `wait` seconds after its change, a heartbeat every 30 s, then unlock. `edit` can change
// the timed events before they're written out.
function synth({ start = 14 * 3600 + 30 * 60, hours = 2.02, every = 180, wait = 0.8, edit } = {}) {
  const ev = [], at = (t, msg, bg = true) => ev.push({ t, msg, bg });
  const ua = 'Mozilla/5.0 (Linux; Android 14; moto g power 5G - 2024) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  let t = start;
  at(t, 'page loaded · build 44a2955 2026-11-26 08:04Z · ' + ua, false); at(t + 0.1, 'browser is Brave', false);
  at(t + 5, 'audio through Web Audio, with keep-alive', false); at(t + 5.1, '→ silence (power on)', false); at(t + 5.11, 'power on', false); at(t + 5.2, 'playing silence', false);
  at(t + 6, 'tuned to WGRM 1340 AM', false); at(t + 6.01, '→ WGRM music “Song 0” at 30 of 200 s, aiming 3.0 s ahead', false); at(t + 6.9, 'playing media after 0.9 s, 0.4 s ahead of the schedule', false);
  const lock = t + 10, unlock = lock + hours * 3600;
  at(lock, 'page hidden');
  for (let k = 1, c = lock + 60; c < unlock - 30; k++, c += every) { at(c, `→ WGRM music “Song ${k}” at 0 of ${every} s`); at(c + 0.1, 'buffering'); at(c + wait, 'playing media'); }
  for (let b = lock + 30; b < unlock; b += 30) at(b, `still here: media at ${((b - lock) % every).toFixed(1)} s, playing, ready 4, keep-alive on, engine running, ticks 1/2`);
  at(unlock, 'page visible', false);
  const evs = edit ? edit(ev) || ev : ev;
  evs.sort((a, b) => a.t - b.t);
  const clock = (s) => { s = ((s % 86400) + 86400) % 86400; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60), ms = Math.round((s % 1) * 1000) % 1000; return [h, m, x].map((v) => String(v).padStart(2, '0')).join(':') + '.' + String(ms).padStart(3, '0'); };
  return ['Needle & Dial 44a2955 2026-11-26 08:04Z', ua, ...evs.map((e) => `${clock(e.t)} ${e.bg ? '[bg] ' : ''}${e.msg}`)].join('\n');
}
const changeAt = (ev, k) => ev.find((e) => e.msg.startsWith(`→ WGRM music “Song ${k}”`));
const lineAfter = (ev, e, re) => ev.filter((x) => x.t > e.t && re.test(x.msg)).sort((a, b) => a.t - b.t)[0];

// The real thing: a friend's iPhone, locked a second after tuning, for half a minute.
{
  const r = check(fs.readFileSync(path.join(__dirname, 'fixtures', 'iphone-lock-restart.log'), 'utf8'));
  expect('iPhone log: fails on time and changes', !r.ok && /short of 2 h/.test(r.report) && /no program changed/.test(r.report), r);
  expect('iPhone log: the restart is timed', /paused as the screen locked while loading: sound back after 1\.9 s/.test(r.report), r);
  expect('iPhone log: device', /build 1f08420 · iPhone, Safari/.test(r.report), r);
  expect('iPhone log: buffering after the restart is part of it', !/mid-program/.test(r.report), r);
}
// A clean two hours.
{
  const r = check(synth());
  expect('clean: passes', r.ok && /PASS/.test(r.report) && r.changes >= 40, r);
  expect('clean: names the device and the tune-in', /Android, Brave/.test(r.report) && /Tune-ins: 1, loading in 0\.9 s; furthest from the schedule 0\.4 s ahead/.test(r.report), r);
  expect('clean: all changes started', /all started: median 0\.8 s/.test(r.report), r);
}
// Past midnight.
{
  const r = check(synth({ start: 23 * 3600 + 30 * 60 }));
  expect('past midnight: still two hours', r.ok && r.stretch.dur > 7200, r);
}
// Record timing (builds from 27 Nov on): each record's start against its start point, and the heartbeat's
// distance from the schedule.
const timed = (from, lag = 0.1, beat = lag) => (ev) => {
  let k = 0;
  for (const e of ev) {
    if (e.msg === 'playing media') { const f = typeof from === 'function' ? from(++k) : from; e.msg = `playing media from ${f.from.toFixed(1)} s (start point ${f.sp.toFixed(1)} s), ${Math.abs(f.lag ?? lag).toFixed(1)} s ${(f.lag ?? lag) >= 0 ? 'behind' : 'ahead of'} the schedule`; e.k = k; }
  }
  for (const e of ev) if (/^still here: media at/.test(e.msg)) { const b = typeof beat === 'function' ? beat(e) : beat; e.msg = e.msg.replace(/(media at [\d.]+ s)/, `$1, ${Math.abs(b).toFixed(1)} s ${b >= 0 ? 'behind' : 'ahead of'} the schedule`); }
};
{
  const r = check(synth({ edit: timed({ from: 2.4, sp: 2.4 }) }));
  expect('timing: clean', r.ok && r.timing && r.timing.ok && /Record timing: PASS/.test(r.report), r);
  expect('timing: starts on time', /Record starts\s+\d+ at their slot: \d+ on time from their start point$/m.test(r.report), r);
  expect('timing: start points taken', /Start points\s+\d+ records began past a silent lead-in: all taken/.test(r.report) && /Mid-record\s+within 0\.5 s of the schedule/.test(r.report), r);
}
{
  const r = check(synth({ edit: timed((k) => (k % 3 ? { from: 2.4, sp: 2.4 } : { from: 4.6, sp: 2.4, lag: 0 })) }));
  expect('timing: jumps ahead are counted, not failed', r.timing.ok && /\d+ jumped ahead to keep the schedule, skipping 1\.9 s of the opening$/m.test(r.report), r);
}
{
  const r = check(synth({ edit: timed((k) => (k === 5 ? { from: 0, sp: 2.4, lag: 2.4 } : { from: 2.4, sp: 2.4 }), 0.1, (e) => (e.t > 14 * 3600 + 30 * 60 + 10 + 60 + 4 * 180 && e.t < 14 * 3600 + 30 * 60 + 10 + 60 + 5 * 180 ? 2.4 : 0.1)) }));
  expect('timing: a missed start point fails', !r.timing.ok && /Record timing: FAIL/.test(r.report) && /Song 5” started at 0\.0 s, before its 2\.4 s start point/.test(r.report), r);
  expect('timing: running behind fails', /Song 5” was 2\.4 s behind the schedule, so it loses about that much of its ending/.test(r.report) && r.ok, r);
}
{
  const r = check(synth());
  expect('timing: older logs have no verdict', r.timing === null && !/Record timing/.test(r.report), r);
}
// Weeks with a load gap: a late record finishing past its slot is counted, running behind mid-record
// is not a failure, and a record cut with some of it unplayed is.
{
  const gapLine = (ev) => { ev.push({ t: 14 * 3600 + 30 * 60 + 0.5, msg: 'schedule: this week has a 2 s load gap before each recording', bg: false }); };
  const late = (ev) => { gapLine(ev); timed((k) => (k === 5 ? { from: 2.4, sp: 2.4, lag: 0.7 } : { from: 2.4, sp: 2.4, lag: -1.8 }), -1.8, (e) => (e.t > 14 * 3600 + 30 * 60 + 10 + 60 + 4 * 180 && e.t < 14 * 3600 + 30 * 60 + 10 + 60 + 5 * 180 ? 1.7 : -1.8))(ev);
    const c6 = changeAt(ev, 6); ev.push({ t: c6.t - 0.01, msg: 'letting it finish: 0.6 s to go, past its slot', bg: true }); };
  let r = check(synth({ edit: late }));
  expect('gap: a late finish is counted, behind mid-record is fine', r.timing.ok && /Late finishes\s+1 record finished past its slot, by up to 0\.6 s/.test(r.report) && /Mid-record\s+furthest 1\.7 s behind/.test(r.report), r);
  r = check(synth({ edit: (ev) => { late(ev); const c9 = changeAt(ev, 9); ev.push({ t: c9.t - 0.01, msg: 'cut WGRM music “Song 8” with 2.2 s of it unplayed', bg: true }); } }));
  expect('gap: a cut record fails', !r.timing.ok && /Song 8” was cut with 2\.2 s of it unplayed/.test(r.report), r);
}
// A false end on Safari, loaded again (build from 27 Nov on): counted, and not a failure.
{
  const r = check(synth({}).replace(/\n(\d\d:\d\d:\d\d\.\d{3}) \[bg\] still here/, (m, t) => `\n${t} [bg] file reported ended at 9.1 of 34 s; loading it again${m}`));
  expect('false end: counted', r.ok && /1 file reported ended early \(loaded again\)/.test(r.report), r);
}
// Too short.
{
  const r = check(synth({ hours: 1.5 }));
  expect('short: fails', !r.ok && /locked for 1 h 30 min, short of 2 h/.test(r.report), r);
}
// A record that never starts.
{
  const r = check(synth({ edit: (ev) => { const c = changeAt(ev, 7); return ev.filter((e) => e !== lineAfter(ev, c, /^playing media$/)); } }));
  expect('never started: fails', !r.ok && /Song 7” never started/.test(r.report), r);
}
// A slow start.
{
  const r = check(synth({ edit: (ev) => { const c = changeAt(ev, 9); lineAfter(ev, c, /^playing media$/).t = c.t + 15; } }));
  expect('slow start: fails', !r.ok && /Song 9” took 15\.0 s to start/.test(r.report), r);
}
// A refusal that leaves 40 s of silence.
{
  const r = check(synth({ edit: (ev) => { const c = changeAt(ev, 12); ev.push({ t: c.t + 20, msg: 'play refused (restart): NotAllowedError', bg: true }, { t: c.t + 60, msg: 'playing again', bg: true }); } }));
  expect('long stop: fails', !r.ok && /the browser refused to play, silent for 40\.0 s/.test(r.report), r);
}
// A quick recovery is fine.
{
  const r = check(synth({ edit: (ev) => { const c = changeAt(ev, 12); ev.push({ t: c.t + 20, msg: 'carrier was stopped; restarting it', bg: true }, { t: c.t + 21.5, msg: 'playing again', bg: true }); } }));
  expect('quick stop: passes and is listed', r.ok && /found the player stopped: sound back after 1\.5 s/.test(r.report), r);
}
// Five minutes without a heartbeat.
{
  const r = check(synth({ edit: (ev) => { const c = changeAt(ev, 20); return ev.filter((e) => !(/^still here/.test(e.msg) && e.t > c.t && e.t < c.t + 300)); } }));
  expect('heartbeat gap: fails', !r.ok && /no sign of the page for 5 min/.test(r.report), r);
}
// A paused player at a heartbeat.
{
  const r = check(synth({ edit: (ev) => { const b = ev.find((e) => /^still here/.test(e.msg) && e.t > changeAt(ev, 15).t); b.msg = b.msg.replace('playing, ready 4', 'PAUSED, ready 4'); } }));
  expect('paused heartbeat: fails', !r.ok && /heartbeat found the player paused/.test(r.report), r);
}
// Buffering mid-record, timed by newer builds.
{
  const r = check(synth({ edit: (ev) => { const c = changeAt(ev, 5); ev.push({ t: c.t + 60, msg: 'buffering', bg: true }, { t: c.t + 72.5, msg: 'back after 12.5 s of buffering', bg: true }); } }));
  expect('long buffering: fails', !r.ok && /buffered for 12\.5 s/.test(r.report) && /Buffering        1 time mid-program, longest 12\.5 s/.test(r.report), r);
  const q = check(synth({ edit: (ev) => { const c = changeAt(ev, 5); ev.push({ t: c.t + 60, msg: 'buffering', bg: true }, { t: c.t + 63, msg: 'back after 3.0 s of buffering', bg: true }); } }));
  expect('short buffering: passes', q.ok && /longest 3\.0 s/.test(q.report), q);
}
// Power off while locked ends the stretch.
{
  const r = check(synth({ edit: (ev) => { ev.push({ t: changeAt(ev, 10).t + 30, msg: 'power off', bg: true }); } }));
  expect('power off: the stretch ends there', !r.ok && /short of 2 h/.test(r.report) && r.stretch.dur < 3600, r);
}
// The same log pasted through a chat app: a header on each message, lines cut between messages.
{
  const clean = synth(), lines = clean.split('\n'), out = [];
  let msg = '[11/26/2026 2:31 PM] Matt Forney: ';
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (i % 53 === 0) out.push(msg + L); // a message starting on a whole line
    else if (i % 47 === 0) { const cut = 3 + (i % 11); out.push(L.slice(0, cut)); out.push(msg + L.slice(cut)); } // one cut mid-line
    else out.push(L);
  }
  const a = check(clean), b = check(out.join('\n'));
  expect('chat paste: same verdict and counts', b.ok === a.ok && b.changes === a.changes && Math.abs(b.stretch.dur - a.stretch.dur) < 1e-6, b);
  const cutAtSpace = clean.replace('\n' + clean.split('\n').find((l) => /\[bg\] still here/.test(l)), (m) => m.replace(' [bg]', '\n[11/26/2026 2:31 PM] Matt Forney: [bg]'));
  expect('chat paste: a cut at the space after the time', check(cutAtSpace).ok, check(cutAtSpace));
}
// The screen lighting up for a few seconds doesn't end the run; a long look does, and so does a reload.
{
  const blip = (secs, also = []) => synth({ edit: (ev) => { const c = changeAt(ev, 20); ev.forEach((e) => { if (e.t > c.t + 30 && e.t < c.t + 30 + secs) e.bg = false; }); ev.push({ t: c.t + 30, msg: 'page visible', bg: false }, ...also.map((m, k) => ({ t: c.t + 30.5 + k * 0.1, msg: m, bg: false })), { t: c.t + 30 + secs, msg: 'page hidden', bg: true }); } });
  const r = check(blip(9.5));
  expect('short wake: passes and is listed', r.ok && /Screen woke      1 time: \d\d:\d\d:\d\d for 9\.5 s; longest stretch without a wake 1 h/.test(r.report), r);
  const q = check(blip(300));
  expect('long wake: ends the run', !q.ok && /short of 2 h/.test(q.report), q);
  const w = check(blip(9.5, ['page loaded · build 44a2955 2026-11-26 08:05Z · x', 'power on']));
  expect('reload during a wake: ends the run', !w.ok && /short of 2 h/.test(w.report), w);
}
// Nothing to read.
{
  const r = check('hello\nthere');
  expect('unreadable', r.unreadable === true);
}
console.log(fail ? `${fail} LOG-CHECK TESTS FAILED` : 'ALL LOG-CHECK TESTS PASSED');
process.exitCode = fail ? 1 : 0;
