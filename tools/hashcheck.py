import json, hashlib, sys, pathlib
expected = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
for p in sorted((pathlib.Path(__file__).resolve().parent.parent / 'catalog').glob('*.json')):
    obj = json.loads(p.read_text(encoding='utf-8'))
    s = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    h = hashlib.sha256(s.encode('utf-8')).hexdigest()
    exp = expected.get(p.stem)
    status = '' if exp is None else ('OK' if exp == h else 'MISMATCH')
    print(f"{p.stem:10s} {len(s):6d}B {h[:16]} {status}")
