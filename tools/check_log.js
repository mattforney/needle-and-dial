#!/usr/bin/env node
// Checks a Needle & Dial debug log against the locked-phone half of Gate B: two hours with the
// screen locked and the radio on, program changes included, every change starting within a few
// seconds, and nothing stopping the sound. Open the site with ?debug=1, run the test, then save
// the text the log's Share or Copy button gives and run:
//
//   node tools/check_log.js log.txt [--hours 2] [--start 10] [--wake 60]
//
// --hours is how long the screen must stay locked, --start how many seconds a program change or a
// recovery may take, --wake the longest the screen may light up (a notification, a glance) without
// ending the locked run; each wake is listed. Prints what happened while locked and a verdict; exit
// code 0 pass, 1 fail, 2 when the file has no log lines. Logs from builds of 27 Nov on also get a
// verdict on record timing: start points missed, or records running well behind the schedule. A log pasted through a chat app, with a
// "[11/26/2026 2:31 PM] Name: " header on each message and lines cut between messages, is fine.
'use strict';
const fs = require('fs');

const LINE = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3}) ?(\[bg\] ?)?(.*)$/;

// A chat app puts a "[date time] Name: " header on each message and may cut a line where one message
// ends: drop the headers, starting a new line only where the next message starts one.
const CHAT = /\r?\n?\[\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4},? \d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp]\.?[Mm]\.?)?\] [^:\n]{1,60}: /g;
const unchat = (text) => String(text).replace(CHAT, (m, at, all) => (/^(\d{2}:\d{2}:\d{2}\.\d{3}|Needle & Dial |Mozilla\/)/.test(all.slice(at + m.length)) ? '\n' : ''));

// Lines in order, with times in seconds that keep counting past midnight.
function parse(text) {
  const lines = [], header = {};
  let day = 0, prev = -Infinity;
  for (const raw of unchat(text).split(/\r?\n/)) {
    const line = raw.trim(), m = LINE.exec(line);
    if (!m) {
      if (/^Needle & Dial /.test(line)) header.build = line.slice('Needle & Dial '.length).trim();
      else if (/^Mozilla\//.test(line)) header.ua = line;
      continue;
    }
    let t = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 + day;
    if (t < prev - 1) { day += 86400; t += 86400; }
    prev = t;
    lines.push({ t, bg: !!m[5], msg: m[6], at: line.slice(0, 8) });
  }
  return { header, lines };
}

// Things that stop the sound, or nearly do, and what the page says when they happen.
const STOPS = [
  [/^paused by the phone or browser/, 'paused by the phone or browser'],
  [/^paused as the screen locked while loading/, 'paused as the screen locked while loading'],
  [/^carrier was stopped/, 'found the player stopped'],
  [/^couldn't restart/, 'could not restart with the screen locked'],
  [/^play refused/, 'the browser refused to play'],
  [/^load error/, 'a file failed to load'],
  [/^audio failed to start/, 'audio failed to start'],
];
const WARNINGS = [
  [/^keep-alive (paused from outside|refused)/, 'the silent keep-alive player stopped'],
  [/^page frozen by the browser/, 'the browser froze the page'],
];
const SOUND = /^(playing |playing again$)/; // a segment starting, or playback coming back

const fmtDur = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? (m ? `${h} h ${m} min` : `${h} h`) : m ? `${m} min ${x} s` : `${x} s`; };
const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
const what = (msg) => msg.replace(/^→ /, '').replace(/ at \d+ of \d+ s.*$/, '').replace(/, aiming .*$/, '');

function device(header, lines) {
  const ua = header.ua || (lines.find((L) => /^page loaded/.test(L.msg)) || { msg: '' }).msg;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad|Macintosh.*Mobile/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'unknown device';
  const brave = lines.some((L) => L.msg === 'browser is Brave');
  const browser = brave ? 'Brave' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'unknown browser';
  return `${os}, ${browser}`;
}

// Record timing over a stretch of the log (the locked run, or the whole log when the screen never locked):
// report lines go into out; returns what failed.
function recordTiming(seg, lines, out) {
  // Where each record started and how it kept to the schedule (builds from 27 Nov on). A record that
  // loads slowly at its slot jumps ahead to keep the schedule, skipping that much of its opening past
  // the 0.3 s the levels leave before the first sound; one that runs behind loses as much of its ending;
  // a start point that doesn't take plays the silent lead-in the levels cut.
  const PAD = 0.3, recs = [], starts = [];
  let rec = null;
  for (const L of seg) {
    if (L.msg.startsWith('→ ')) { rec = { L, name: what(L.msg), beats: [] }; recs.push(rec); continue; }
    const m = /^playing media from ([\d.]+) s \(start point ([\d.]+) s\), ([\d.]+) s (behind|ahead of) the schedule/.exec(L.msg);
    if (m && rec && rec.from == null) { starts.push(Object.assign(rec, { from: +m[1], sp: +m[2], lag: (m[4] === 'behind' ? 1 : -1) * +m[3], skipped: Math.max(0, +m[1] - +m[2] - PAD) })); continue; }
    const h = /^still here: media at [\d.]+ s, ([\d.]+) s (behind|ahead of) the schedule, playing, ready [34]/.exec(L.msg);
    if (h && rec) rec.beats.push({ at: L.at, lag: (h[2] === 'behind' ? 1 : -1) * +h[1] });
  }
  const timing = [];
  if (starts.length) {
    const jumped = starts.filter((r) => r.skipped > 0.2), late = starts.filter((r) => r.skipped <= 0.2 && r.lag > 0.5), sk = jumped.map((r) => r.skipped).sort((a, b) => a - b);
    const onTime = starts.length - jumped.length - late.length, withSp = starts.filter((r) => r.sp >= 0.1), missed = starts.filter((r) => r.from < r.sp - 0.3);
    out.push(`  Record starts    ${starts.length} at their slot: ${onTime} on time from their start point${jumped.length ? `, ${jumped.length} jumped ahead to keep the schedule, skipping ${sk[0].toFixed(1) === sk[sk.length - 1].toFixed(1) ? sk[0].toFixed(1) + ' s' : `${sk[0].toFixed(1)}–${sk[sk.length - 1].toFixed(1)} s`} of the opening${sk[0].toFixed(1) === sk[sk.length - 1].toFixed(1) ? '' : ` (median ${sk[sk.length >> 1].toFixed(1)} s)`}` : ''}${late.length ? `, ${late.length} started behind it (up to ${Math.max(...late.map((r) => r.lag)).toFixed(1)} s)` : ''}`);
    if (withSp.length) out.push(`  Start points     ${n(withSp.length, 'record', 'records')} began past a silent lead-in: ${missed.length ? `${missed.length} missed it` : withSp.length > 1 ? 'all taken' : 'taken'}`);
    for (const r of missed) timing.push(`${r.L.at} ${r.name} started at ${r.from.toFixed(1)} s, before its ${r.sp.toFixed(1)} s start point`);
  }
  // From the week of 30 Nov each recording has a load gap before it. A late one finishes past its slot
  // (up to 4 s; later than that it is cut), and the next item waits for it: a station break or ID, which
  // keeps to the clock, catches up, but the next recording's gap takes up the delay only when the delay
  // and the recording's load fit in it together. Otherwise that recording starts behind too.
  const gap = lines.some((L) => /^schedule: this week has a [\d.]+ s load gap/.test(L.msg));
  const lagged = recs.filter((r) => r.beats.length);
  if (lagged.length) {
    const worst = lagged.map((r) => ({ r, b: r.beats.reduce((a, b) => (b.lag > a.lag ? b : a)) })).reduce((a, b) => (b.b.lag > a.b.lag ? b : a));
    out.push(`  Mid-record       ${worst.b.lag > 0.5 ? `furthest ${worst.b.lag.toFixed(1)} s behind the schedule, at ${worst.b.at} (${worst.r.name})${gap && worst.b.lag > 2 ? '; a record is cut once it runs 4 s past its slot' : ''}` : 'within 0.5 s of the schedule'}`);
    if (!gap) for (const r of lagged) { const b = r.beats.reduce((a, x) => (x.lag > a.lag ? x : a)); if (b.lag > 1.5) timing.push(`${b.at} ${r.name} was ${b.lag.toFixed(1)} s behind the schedule, so it loses about that much of its ending`); }
  }
  // Each late finish, and what came after it: a recording (how far behind it started) or a break.
  const late = [];
  seg.forEach((L, i) => {
    const m = /^letting it finish: ([\d.]+) s to go/.exec(L.msg);
    if (!m) return;
    let next = null, lag = null;
    for (let j = i + 1; j < seg.length; j++) {
      const M = seg[j].msg;
      if (!next) { if (M.startsWith('→ ')) next = M; continue; }
      if (M.startsWith('→ ')) break;
      const p = /^playing media from [\d.]+ s \(start point [\d.]+ s\), ([\d.]+) s (behind|ahead of) the schedule/.exec(M);
      if (p) { lag = (p[2] === 'behind' ? 1 : -1) * +p[1]; break; }
    }
    late.push({ by: +m[1], next, lag });
  });
  if (late.length) {
    const media = (x) => x.next && /^→ \S+ (music|prog|poem|filler|ad)\b/.test(x.next);
    const groups = [
      [late.filter((x) => x.lag != null && x.lag > 0.5), (k) => `the next record started behind too (up to ${Math.max(...k.map((x) => x.lag)).toFixed(1)} s)`],
      [late.filter((x) => x.lag != null && x.lag <= 0.5), () => 'the next gap took up the delay'],
      [late.filter((x) => x.lag == null && x.next && !media(x)), () => 'a station break caught up'],
      [late.filter((x) => x.lag == null && (!x.next || media(x))), () => 'the log ends before the next one starts'],
    ].filter(([k]) => k.length);
    const after = groups.length === 1 ? groups[0][1](groups[0][0]) : groups.map(([k, say]) => `after ${k.length}, ${say(k)}`).join('; ');
    out.push(`  Late finishes    ${n(late.length, 'record', 'records')} finished past ${late.length === 1 ? 'its' : 'their'} slot, by up to ${Math.max(...late.map((x) => x.by)).toFixed(1)} s; ${after}`);
  }
  for (const L of seg) { const m = /^cut (.+) with ([\d.]+) s of it unplayed/.exec(L.msg); if (m) timing.push(`${L.at} ${m[1]} was cut with ${(+m[2]).toFixed(1)} s of it unplayed`); }
  return { timing, starts, lagged, timed: starts.length > 0 || lagged.length > 0 || timing.length > 0 };
}

function check(text, opt = {}) {
  const need = (opt.hours ?? 2) * 3600, slow = opt.start ?? 10, quiet = opt.quiet ?? 75, wake = opt.wake ?? 60;
  const { header, lines } = parse(text);
  if (!lines.length) return { ok: false, unreadable: true, report: 'No log lines found. Save the text from the log’s Share or Copy button.' };

  // Stretches with the screen locked and the radio on: from the first such line to the first line
  // that isn't (the page logs "page visible" when it's unlocked).
  const stretches = [];
  let on = false, cur = null;
  lines.forEach((L, i) => {
    if (/^page loaded/.test(L.msg)) on = false;
    if (L.msg === 'power on') on = true;
    if (L.msg === 'power off') on = false;
    const locked = L.bg && on;
    if (locked && !cur) cur = { i0: i, from: L.t };
    if (!locked && cur) { Object.assign(cur, { i1: i, to: L.t }); stretches.push(cur); cur = null; }
  });
  if (cur) stretches.push(Object.assign(cur, { i1: lines.length, to: lines[lines.length - 1].t, open: true }));
  // A short wake (the screen lighting up for a notification or a glance) doesn't end a locked run,
  // unless the page reloaded or the radio was switched off in it.
  const runs = [];
  for (const st of stretches) {
    const r = runs[runs.length - 1], gap = r ? st.from - r.to : Infinity;
    const broken = r && lines.slice(r.i1, st.i0).some((L) => /^page loaded|^power off$/.test(L.msg));
    if (r && gap <= wake && !broken) { r.wakes.push({ at: lines[r.i1].at, dur: gap }); r.longest = Math.max(r.longest, st.to - st.from); Object.assign(r, { i1: st.i1, to: st.to, open: st.open }); }
    else runs.push(Object.assign({}, st, { wakes: [], longest: st.to - st.from }));
  }
  const builds = [...new Set(lines.filter((L) => /^page loaded/.test(L.msg)).map((L) => (/build (\S+)/.exec(L.msg) || [])[1]).filter(Boolean))];
  const out = [`Log from ${builds.length ? 'build ' + builds.join(', ') : header.build ? 'build ' + header.build.split(' ')[0] : 'an unknown build'} · ${device(header, lines)}`];

  // Tune-ins anywhere in the log: how close to the schedule each one started (builds from 26 Nov on).
  const tunes = lines.map((L) => /^playing media after ([\d.]+) s, ([\d.]+) s (behind|ahead of) the schedule/.exec(L.msg)).filter(Boolean).map((m) => ({ load: +m[1], off: (m[3] === 'behind' ? 1 : -1) * +m[2] }));
  if (tunes.length) {
    const worst = tunes.reduce((w, x) => (Math.abs(x.off) > Math.abs(w.off) ? x : w));
    const lo = Math.min(...tunes.map((x) => x.load)).toFixed(1), hi = Math.max(...tunes.map((x) => x.load)).toFixed(1);
    out.push(`Tune-ins: ${tunes.length}, loading in ${lo === hi ? lo : lo + '–' + hi} s; furthest from the schedule ${Math.abs(worst.off).toFixed(1)} s ${worst.off >= 0 ? 'behind' : 'ahead'}`);
  }

  if (!stretches.length) {
    // A desktop run, or a phone that stayed awake: nothing for Gate B, but the record timing still counts.
    out.push('The screen was never locked with the radio on, so this log says nothing about Gate B.');
    const on = lines.findIndex((L) => L.msg === 'power on'), T = recordTiming(on >= 0 ? lines.slice(on) : lines, lines, out);
    out.push('', 'Gate B, locked phone: not tested');
    if (T.timed) out.push('', `Record timing: ${T.timing.length ? 'FAIL' : 'PASS'}`, ...T.timing.map((p) => '  - ' + p));
    return { ok: false, report: out.join('\n'), problems: ['never locked'], timing: T.timed ? { ok: !T.timing.length, problems: T.timing, starts: T.starts.length } : null };
  }
  const S = runs.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a));
  const dur = S.to - S.from, inS = lines.slice(S.i0, S.i1), end = lines[S.i1];
  out.push(`Locked with the radio on: ${lines[S.i0].at} → ${end ? end.at : lines[lines.length - 1].at}, ${fmtDur(dur)}${runs.length > 1 ? ` (the longest of ${runs.length} locked runs)` : ''}${S.open ? ', and still locked when the log ends' : ''}`);
  if (S.wakes.length) out.push(`  Screen woke      ${n(S.wakes.length, 'time', 'times')}: ${S.wakes.map((w) => `${w.at} for ${w.dur.toFixed(1)} s`).join(', ')}; longest stretch without a wake ${fmtDur(S.longest)}`);

  const problems = [], notes = [];
  const nextSound = (i, until) => { for (let j = i + 1; j < S.i1 && lines[j].t <= until; j++) if (SOUND.test(lines[j].msg)) return lines[j]; return null; };

  // Program changes: each "→" should reach "playing" before the next one.
  const changes = [];
  for (let i = S.i0; i < S.i1; i++) {
    if (!lines[i].msg.startsWith('→ ')) continue;
    let j = i + 1; while (j < S.i1 && !lines[j].msg.startsWith('→ ') && !SOUND.test(lines[j].msg)) j++;
    const L = lines[i], got = j < S.i1 && SOUND.test(lines[j].msg) ? lines[j] : null;
    if (got) changes.push({ L, wait: got.t - L.t });
    else if (j < S.i1 && lines[j].t - L.t < 3) continue; // passed straight on to the next one
    else if (S.to - L.t < slow) continue; // unlocked while it was starting
    else { changes.push({ L, wait: Infinity }); problems.push(`${L.at} ${what(L.msg)} never started`); }
  }
  const started = changes.filter((c) => c.wait < Infinity).map((c) => c.wait).sort((a, b) => a - b);
  if (!changes.length) problems.push('no program changed while the screen was locked');
  else {
    const slowest = changes.filter((c) => c.wait < Infinity).reduce((a, b) => (b.wait > a.wait ? b : a), { wait: -1 });
    out.push(`  Program changes  ${changes.length}${started.length === changes.length ? ', all started' : `, ${started.length} started`}${started.length ? `: median ${started[started.length >> 1].toFixed(1)} s, slowest ${slowest.wait.toFixed(1)} s at ${slowest.L.at} (${what(slowest.L.msg)})` : ''}`);
    for (const c of changes) if (c.wait < Infinity && c.wait > slow) problems.push(`${c.L.at} ${what(c.L.msg)} took ${c.wait.toFixed(1)} s to start`);
  }

  // Stops, and how long until sound came back.
  const stops = [];
  for (let i = S.i0; i < S.i1; i++) {
    const hit = STOPS.find(([re]) => re.test(lines[i].msg));
    if (!hit) continue;
    const back = nextSound(i, S.to), gap = back ? back.t - lines[i].t : Infinity;
    stops.push(`${lines[i].at} ${hit[1]}: ${back ? `sound back after ${gap.toFixed(1)} s` : 'no sound again before the screen was unlocked'}`);
    if (gap > slow) problems.push(`${lines[i].at} ${hit[1]}, ${back ? `silent for ${gap.toFixed(1)} s` : 'and the sound never came back while locked'}`);
  }
  out.push(`  Stops            ${stops.length ? stops.join('; ') : 'none'}`);
  for (let i = S.i0; i < S.i1; i++) { const hit = WARNINGS.find(([re]) => re.test(lines[i].msg)); if (hit) notes.push(`${lines[i].at} ${hit[1]}`); }

  // Buffering in the middle of something (not just after a change), and how it ended.
  const mid = [];
  for (let i = S.i0; i < S.i1; i++) {
    if (lines[i].msg !== 'buffering') continue;
    // part of a change or a recovery unless something was playing since
    let k = i - 1; while (k >= 0 && !lines[k].msg.startsWith('→ ') && !SOUND.test(lines[k].msg) && !STOPS.some(([re]) => re.test(lines[k].msg))) k--;
    if (k < 0 || !SOUND.test(lines[k].msg)) continue;
    let j = i + 1; while (j < S.i1 && !/^back after ([\d.]+) s of buffering/.test(lines[j].msg) && !/^still here/.test(lines[j].msg) && !lines[j].msg.startsWith('→ ')) j++;
    const L = lines[j], m = L && /^back after ([\d.]+) s of buffering/.exec(L.msg);
    if (m) { mid.push(+m[1]); if (+m[1] > slow) problems.push(`${lines[i].at} buffered for ${(+m[1]).toFixed(1)} s`); }
    else if (L && /^still here: .*, playing, ready [34]/.test(L.msg)) mid.push(null);
    else if (L && /^still here/.test(L.msg)) { mid.push(null); problems.push(`${lines[i].at} buffering, and at ${L.at} the player still wasn't playing`); }
    else mid.push(null);
  }
  if (mid.length) { const known = mid.filter((x) => x !== null); out.push(`  Buffering        ${n(mid.length, 'time', 'times')} mid-program${known.length ? `, longest ${Math.max(...known).toFixed(1)} s` : ''}${known.length < mid.length ? ` (${known.length ? `${mid.length - known.length} ` : ''}not timed: this build doesn’t log when buffering ends)` : ''}`); }

  // Heartbeat: the page logs "still here" every 30 s while it runs.
  const beats = inS.filter((L) => /^still here/.test(L.msg));
  const marks = [S.from, ...beats.map((L) => L.t), S.to];
  let longest = 0, at = null;
  for (let i = 1; i < marks.length; i++) if (marks[i] - marks[i - 1] > longest) { longest = marks[i] - marks[i - 1]; at = marks[i - 1]; }
  const atClock = (t) => { const L = lines.find((x) => x.t >= t); return L ? L.at : ''; };
  out.push(`  Heartbeat        ${n(beats.length, 'line', 'lines')} over the stretch; longest gap ${fmtDur(longest)}`);
  if (longest > quiet) problems.push(`no sign of the page for ${fmtDur(longest)} from ${atClock(at)} (it may have been suspended)`);
  for (const L of beats) {
    if (/, PAUSED, /.test(L.msg)) problems.push(`${L.at} the heartbeat found the player paused`);
    else if (/keep-alive PAUSED/.test(L.msg)) notes.push(`${L.at} the heartbeat found the keep-alive paused`);
  }

  const { timing, starts, lagged, timed } = recordTiming(inS, lines, out);

  const count = (re) => inS.filter((L) => re.test(L.msg)).length;
  const other = [[/^network stalled/, 'network stall', 'network stalls'], [/^file (ended before|is shorter than) its slot/, 'file ran short of its slot (filled)', 'files ran short of their slot (filled)'], [/^file reported ended at /, 'file reported ended early (loaded again)', 'files reported ended early (loaded again)'], [/^resync/, 'resync', 'resyncs'], [/^scheduler was asleep/, 'scheduler nap', 'scheduler naps'], [/^trying the recording again/, 'retry', 'retries']].map(([re, one, many]) => [count(re), one, many]).filter(([k]) => k).map(([k, one, many]) => n(k, one, many));
  if (other.length) out.push(`  Also             ${other.join(', ')}`);
  for (const n of notes) out.push(`  Note             ${n}`);

  if (dur < need) problems.unshift(`locked for ${fmtDur(dur)}, short of ${fmtDur(need)}`);
  const ok = !problems.length;
  out.push('', `Gate B, locked phone: ${ok ? 'PASS' : 'FAIL'}`, ...problems.map((p) => '  - ' + p));
  if (timed) out.push('', `Record timing: ${timing.length ? 'FAIL' : 'PASS'}`, ...timing.map((p) => '  - ' + p));
  return { ok, report: out.join('\n'), problems, timing: timed ? { ok: !timing.length, problems: timing, starts: starts.length } : null, stretch: { from: S.from, to: S.to, dur, wakes: S.wakes.length, longest: S.longest }, changes: changes.length, stops: stops.length };
}

module.exports = { parse, check };

if (require.main === module) {
  const args = process.argv.slice(2), opt = {};
  for (let i = 0; i < args.length; i++) if (args[i] === '--hours') opt.hours = +args[++i]; else if (args[i] === '--start') opt.start = +args[++i]; else if (args[i] === '--wake') opt.wake = +args[++i]; else opt.file = args[i];
  const text = opt.file ? fs.readFileSync(opt.file, 'utf8') : fs.readFileSync(0, 'utf8');
  const r = check(text, opt);
  console.log(r.report);
  process.exitCode = r.unreadable ? 2 : r.ok && (!r.timing || r.timing.ok) ? 0 : 1;
}
