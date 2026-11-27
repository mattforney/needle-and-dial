"""Builds the site into dist/.

dist/index.html  the page, with the schedule snapshots it needs inlined: the one on air this
                 week and any already drafted for later weeks (see tools/snapshot.py)
dist/catalog.json the catalog as it stands in catalog/, which the tools and checks read

ND_NOW=2026-12-01T12:00Z overrides the build's idea of now, for testing week changes.
--debug also writes dist/index-debug.html, with the event log on unless the address says
?debug=0, for testing on a phone, where adding ?debug=1 to the address is awkward.
--preview also writes dist/preview.html: the same weeks with catalog/levels.json applied to all of
them, as it stands, and a banner with a switch for the limiter, for listening to levels before they
go on air (they do so only with a new week's snapshot; see tools/snapshot.py).
"""
import datetime
import hashlib
import json
import os
import subprocess
import sys

from ndlib import ROOT, catalog_levels, head_catalog, in_effect, load_snapshots, week_date, week_index

cat = head_catalog()
blob = json.dumps(cat, ensure_ascii=False, separators=(',', ':'))
(ROOT / 'dist').mkdir(exist_ok=True)
(ROOT / 'dist' / 'catalog.json').write_text(blob, encoding='utf-8')

now = datetime.datetime.fromisoformat(os.environ['ND_NOW'].replace('Z', '+00:00')) if os.environ.get('ND_NOW') else datetime.datetime.now(datetime.timezone.utc)
k = week_index(now)
snaps = load_snapshots()
# This week's snapshot and any drafted for later weeks. With no snapshots at all (a fresh
# clone), the catalog itself stands in, from the first week.
cur = in_effect(snaps, k)
page = [cur] + [s for w, s in snaps if w > k and s is not cur] if snaps else [{'from': week_date(0), 'exclude': [], 'catalog': cat}]


def build_id():
    # Short commit plus build time, shown in the debug log; '+' means src/, catalog/ or snapshots/ had uncommitted changes.
    try:
        git = lambda *a: subprocess.run(['git', *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
        sha, dirty = git('rev-parse', '--short', 'HEAD'), git('status', '--porcelain', '--', 'src', 'catalog', 'snapshots')
    except Exception:
        sha, dirty = 'nogit', ''
    return f"{sha}{'+' if dirty else ''} {datetime.datetime.now(datetime.timezone.utc):%Y-%m-%d %H:%M}Z"


tpl = (ROOT / 'src' / 'index.template.html').read_text(encoding='utf-8')
assert tpl.count('__CATALOG__') == 1 and tpl.count('__BUILD__') == 1 and tpl.count('__DEBUG__') == 1 and tpl.count('__PREVIEW__') == 1
# Later snapshots go on the page as just the stations, and the items' levels, that differ from the one
# before; an item whose levels went away is listed as null.
def changed_levels(a, b):
    la, lb = a.get('levels') or {}, b.get('levels') or {}
    return {k: lb.get(k) for k in sorted(set(la) | set(lb)) if la.get(k) != lb.get(k)}


def inline_for(weeks):
    slim = [weeks[0]] + [dict({'from': b['from'], 'exclude': b['exclude'], 'partial': True, 'catalog': {k: v for k, v in b['catalog'].items() if a['catalog'].get(k) != v}}, **({'levels': changed_levels(a, b)} if changed_levels(a, b) else {})) for a, b in zip(weeks, weeks[1:])]
    return json.dumps(slim, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')


html = tpl.replace('__CATALOG__', inline_for(page)).replace('__BUILD__', build_id())
(ROOT / 'dist' / 'index.html').write_text(html.replace('__DEBUG__', 'false').replace('__PREVIEW__', 'null'), encoding='utf-8')
if '--debug' in sys.argv[1:]:
    (ROOT / 'dist' / 'index-debug.html').write_text(html.replace('__DEBUG__', 'true').replace('__PREVIEW__', 'null'), encoding='utf-8')
if '--preview' in sys.argv[1:]:
    lv_path = ROOT / 'catalog' / 'levels.json'
    weeks = [dict(s, levels=catalog_levels(s['catalog'])) for s in page]
    made = json.loads(lv_path.read_text(encoding='utf-8')).get('made') or ''
    when = datetime.date.fromisoformat(made).strftime('%-d %b') if made else ''
    note = (f"The new levels (catalog/levels.json{' of ' + when if when else ''}) on this week's schedule. Trims change some lengths, so it "
            "won't match the live site minute for minute. Use Chrome or Firefox on a computer: an iPhone can't set levels.")
    pv = tpl.replace('__CATALOG__', inline_for(weeks)).replace('__BUILD__', build_id() + ' preview').replace('__DEBUG__', 'false')
    (ROOT / 'dist' / 'preview.html').write_text(pv.replace('__PREVIEW__', json.dumps({'note': note}, ensure_ascii=False).replace('</', '<\\/')), encoding='utf-8')
    print('preview: levels for', sum(len(v) for s in weeks for v in (s.get('levels') or {}).values()), 'files in', ', '.join(s['from'] for s in weeks))
print('catalog bytes', len(blob.encode()), 'sha256', hashlib.sha256(blob.encode()).hexdigest()[:16])
print('week', k, '(' + week_date(k) + '); snapshots on the page:', ', '.join(s['from'] for s in page))
print('html bytes', len(html.encode()))
