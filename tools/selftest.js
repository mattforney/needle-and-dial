// Runs the page's audio self-test (?selftest=1) in another browser engine and prints what it found:
//   node tools/selftest.js firefox|webkit|chromium [dist/index.html]
// Exit code 0 when every check passes. Needs playwright-core and that browser
// (npx playwright-core install firefox webkit). CI runs the same checks in Chrome (tools/test_playback.js).
const fs = require('fs'), path = require('path');
const pw = require('playwright-core');
const engine = process.argv[2] || 'firefox', file = process.argv[3] || path.join(__dirname, '..', 'dist', 'index.html');
const html = fs.readFileSync(file, 'utf8');
(async () => {
  const browser = await pw[engine].launch(), ctx = await browser.newContext();
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|archive\.org/, (r) => r.abort());
  await ctx.route('http://nd.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://nd.test/?selftest=1');
  await page.waitForSelector('#selftest li, #stRun:has-text("could not run")', { timeout: 60000 });
  const lines = await page.$$eval('#selftest li', (x) => x.map((l) => l.textContent.replace(/^(PASS|FAIL)/, '$1  ')));
  console.log(`${engine} ${browser.version()}: ${await page.textContent('#stRun')}`);
  for (const l of lines) console.log('  ' + l);
  for (const e of errors) console.log('  page error: ' + e);
  await browser.close();
  process.exitCode = lines.length && lines.every((l) => l.startsWith('PASS')) && !errors.length ? 0 : 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
