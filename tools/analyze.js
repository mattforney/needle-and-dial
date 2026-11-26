// Lists every distinct media URL in the parsed catalog and summarizes station breaks.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../src/index.template.html', 'utf8');
const code0 = html.split('// ==ENGINE==')[1].split('// ==/ENGINE==')[0];
const CAT = JSON.parse(fs.readFileSync(__dirname + '/../dist/catalog.json', 'utf8'));
const load = (code) => new Function('CAT', code + '\nreturn { WEEK, STATIONS, parseCatalog, buildStation, ia };')(CAT);
const api = load(code0);
const P = api.parseCatalog(CAT);
const seen = new Map(), vis = new Set();
const walk = (o) => { if (!o || typeof o !== 'object' || vis.has(o)) return; vis.add(o); if (Array.isArray(o)) { o.forEach(walk); return; } if (typeof o.id === 'string' && typeof o.f === 'string') { const u = api.ia(o.id, o.f); if (!seen.has(u)) seen.set(u, o); } Object.values(o).forEach(walk); };
walk(P);
const urls = [...seen.keys()].sort();
console.log('distinct media URLs:', urls.length, '| distinct IA items:', new Set([...seen.values()].map(o => o.id)).size);
console.log('url-list sha256:', require('crypto').createHash('sha256').update(urls.join('\n')).digest('hex'));
fs.writeFileSync(__dirname + '/../dist/urls.txt', urls.join('\n'));
const breaks = (api2, P2, label) => {
  for (const S of api2.STATIONS) {
    if (S.type === 'music') continue;
    const segs = api2.buildStation(S, 0, P2);
    let ads = 0, maxAds = 0, ge3 = 0, nBreaks = 0, inBreak = false;
    const iv = [];
    for (const g of segs) {
      if (g.k === 'interval') iv.push(g.d);
      const filler = g.k !== 'prog' && g.k !== 'id' || (g.k === 'prog' && false);
      if (g.k === 'ad') ads++;
      if (g.k === 'id' && inBreak) { nBreaks++; maxAds = Math.max(maxAds, ads); if (ads >= 3) ge3++; ads = 0; inBreak = false; }
      if (filler) inBreak = true;
    }
    iv.sort((a, b) => b - a);
    console.log(`${label} ${S.call}: breaks=${nBreaks} maxAdsInBreak=${maxAds} breaksWith3+Ads=${ge3} intervals>30s=${iv.filter(d => d > 30).length} >60s=${iv.filter(d => d > 60).length} top=${iv.slice(0, 4).map(Math.round).join(',')}`);
  }
};
breaks(api, P, 'current');
