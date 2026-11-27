// Tests the rules that turn loudness measurements into catalog/levels.json (tools/levels.js).
//   node tools/test_levels.js
const { derive, gainFor, review } = require('./levels.js');
let fail = 0;
const eq = (got, want, what) => { if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log(`FAIL ${what}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); } };

// Gain toward -20 LUFS: down without limit; up while the true peak stays under -1 dBTP, plus 6 dB the
// limiter takes (none with limit 0).
eq(gainFor(-30, -15), 10, 'a quiet file with headroom comes up all the way');
eq(gainFor(-30, -5, 0), 4, 'without the limiter, a quiet file comes up only as far as its peak allows');
eq(gainFor(-30, -5), 10, 'with it, 6 dB further');
eq(gainFor(-40, -5), 10, 'but no further than 6 dB past the headroom');
eq(gainFor(-30, 0, 0), 0, 'without the limiter, a quiet file already peaking at full scale stays put');
eq(gainFor(-12, 2), -8, 'a loud file goes down all the way');
eq(gainFor(null, -3), 0, 'no loudness, no gain');
eq(gainFor(-75, -40), 0, 'silence, no gain');

// Trims: silence below -50 dBFS, keeping 0.3 s at each end.
const m = { id: 'i', f: 'a.mp3', d: 100, dur: 100, lead_silent: 2, tail_silent: 3, I: -25, TP: -10, gap_silent: 0 };
eq(derive(m), [5, 1.7, 97.3], 'a single file: its own gain, both ends trimmed');
eq(derive(Object.assign({}, m, { I: -30, TP: -5 })), [10, 1.7, 97.3, 4], 'a gain that needs the limiter carries the gain without it');
eq(derive(Object.assign({}, m, { lead_silent: 0.2, tail_silent: 0 })), [5, 0, 100], 'less than 0.3 s of silence: nothing cut');
// A program in parts: its gain for every part, trimmed only at its very start and end.
eq(derive(m, { gain: -2, gain0: -2, first: true, last: false }), [-2, 1.7, 100], 'first part: start trimmed, end as recorded');
eq(derive(m, { gain: 7, gain0: 3, first: true, last: false }), [7, 1.7, 100, 3], 'a program whose gain needs the limiter: both gains on every part');
eq(derive(m, { gain: -2, gain0: -2, first: false, last: false }), [-2, 0, 100], 'middle part: both ends as recorded');
eq(derive(m, { gain: -2, gain0: -2, first: false, last: true }), [-2, 0, 97.3], 'last part: end trimmed');
eq(derive(Object.assign({}, m, { dur: 10, lead_silent: 6, tail_silent: 3 })), null, 'almost all silence: no entry');
eq(derive(Object.assign({}, m, { error: 'HTTP 404' })), null, 'not measured: no entry');

// Files worth a listen.
eq(review(Object.assign({}, m, { TP: 8 }), [0, 0, 1]), ['true peak +8 dBTP'], 'peaks far over full scale');
eq(review(Object.assign({}, m, { dur: 80 }), [0, 0, 1]), ['plays 80 s, catalog says 100 s'], 'a length far from the catalog');
eq(review(m, [0, 0, 1]), [], 'a clean file');

// The weekly job measures again what failed last time, and files whose Archive copy changed length.
const { prune } = require('./loudness_survey.js');
const store = () => ({ files: [{ id: 'a', f: '1.mp3', I: -20 }, { id: 'a', f: '2.mp3', error: 'HTTP 503' }, { id: 'b', f: '3.mp3', I: -18 }] });
let st = store(); eq([prune(st, {}), st.files.length], [0, 3], 'nothing asked: nothing measured again');
st = store(); eq([prune(st, { retryErrors: true }), st.files.map((x) => x.f)], [1, ['1.mp3', '3.mp3']], 'retry-errors drops the failed one');
st = store(); eq([prune(st, { redo: new Set(['b/3.mp3']) }), st.files.map((x) => x.f)], [1, ['1.mp3', '2.mp3']], 'redo drops the changed one');

console.log(fail ? `${fail} LEVELS TEST FAILURES` : 'ALL LEVELS TESTS PASSED');
process.exitCode = fail ? 1 : 0;
