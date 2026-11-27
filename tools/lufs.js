// Integrated loudness (ITU-R BS.1770-4, as EBU R128 uses it) of one channel of samples at any rate:
// K-weighting (the high shelf and high-pass, designed for the given rate as libebur128 does), 400 ms
// blocks every 100 ms, the absolute gate at -70 LUFS and the relative gate 10 LU below. Also the sample
// peak in dBFS. Used by the tests to check the page's own sounds; agrees with ffmpeg's ebur128 to 0.1 LU.
'use strict';
function biquad(x, b, a) {
  const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
function kWeight(x, fs) {
  let K = Math.tan(Math.PI * 1681.974450955533 / fs), Q = 0.7071752369554196;
  const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf = biquad(x, [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]);
  K = Math.tan(Math.PI * 38.13547087602444 / fs); Q = 0.5003270373238773; a0 = 1 + K / Q + K * K;
  return biquad(shelf, [1, -2, 1], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]);
}
function lufs(samples, fs) {
  const y = kWeight(samples, fs), block = Math.round(0.4 * fs), step = Math.round(0.1 * fs), z = [];
  for (let s = 0; s + block <= y.length; s += step) { let e = 0; for (let i = s; i < s + block; i++) e += y[i] * y[i]; z.push(e / block); }
  const L = (m) => -0.691 + 10 * Math.log10(m), mean = (a) => a.reduce((p, q) => p + q, 0) / a.length;
  const abs = z.filter((m) => L(m) > -70);
  if (!abs.length) return { I: -Infinity, peak: -Infinity };
  const rel = L(mean(abs)) - 10, kept = abs.filter((m) => L(m) > rel);
  let pk = 0; for (const v of samples) pk = Math.max(pk, Math.abs(v));
  return { I: L(mean(kept)), peak: 20 * Math.log10(pk) };
}
module.exports = { lufs };
