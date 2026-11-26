import datetime, hashlib, json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ORDER = ['ads', 'gramophone', 'whodunit', 'midnight', 'rocket', 'saddle', 'laugh', 'storytime', 'tapers', 'freeform', 'nocturne']

cat = {k: json.loads((ROOT / 'catalog' / f'{k}.json').read_text(encoding='utf-8')) for k in ORDER}
blob = json.dumps(cat, ensure_ascii=False, separators=(',', ':'))
(ROOT / 'dist').mkdir(exist_ok=True)
(ROOT / 'dist' / 'catalog.json').write_text(blob, encoding='utf-8')


def build_id():
    # Short commit plus build time, shown in the debug log; '+' means src/ or catalog/ had uncommitted changes.
    try:
        git = lambda *a: subprocess.run(['git', *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
        sha, dirty = git('rev-parse', '--short', 'HEAD'), git('status', '--porcelain', '--', 'src', 'catalog')
    except Exception:
        sha, dirty = 'nogit', ''
    return f"{sha}{'+' if dirty else ''} {datetime.datetime.now(datetime.timezone.utc):%Y-%m-%d %H:%M}Z"


tpl = (ROOT / 'src' / 'index.template.html').read_text(encoding='utf-8')
assert tpl.count('__CATALOG__') == 1 and tpl.count('__BUILD__') == 1 and tpl.count('__DEBUG__') == 1
html = tpl.replace('__CATALOG__', blob.replace('</', '<\\/')).replace('__BUILD__', build_id())
(ROOT / 'dist' / 'index.html').write_text(html.replace('__DEBUG__', 'false'), encoding='utf-8')
# --debug also writes dist/index-debug.html, with the event log on unless the address says ?debug=0:
# for testing on a phone, where adding ?debug=1 to the address is awkward.
if '--debug' in sys.argv[1:]:
    (ROOT / 'dist' / 'index-debug.html').write_text(html.replace('__DEBUG__', 'true'), encoding='utf-8')
print('catalog bytes', len(blob.encode()), 'sha256', hashlib.sha256(blob.encode()).hexdigest()[:16])
print('html bytes', len(html.encode()))
