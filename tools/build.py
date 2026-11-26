import json, pathlib, hashlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
ORDER = ['ads', 'gramophone', 'whodunit', 'midnight', 'rocket', 'saddle', 'laugh', 'storytime', 'tapers', 'freeform', 'nocturne']

cat = {k: json.loads((ROOT / 'catalog' / f'{k}.json').read_text(encoding='utf-8')) for k in ORDER}
blob = json.dumps(cat, ensure_ascii=False, separators=(',', ':'))
(ROOT / 'dist').mkdir(exist_ok=True)
(ROOT / 'dist' / 'catalog.json').write_text(blob, encoding='utf-8')

tpl = (ROOT / 'src' / 'index.template.html').read_text(encoding='utf-8')
assert tpl.count('__CATALOG__') == 1
html = tpl.replace('__CATALOG__', blob.replace('</', '<\\/'))
(ROOT / 'dist' / 'index.html').write_text(html, encoding='utf-8')
print('catalog bytes', len(blob.encode()), 'sha256', hashlib.sha256(blob.encode()).hexdigest()[:16])
print('html bytes', len(html.encode()))
