"""Shared by build.py and snapshot.py: the station catalog and the weekly snapshot files.

The schedule's weeks start Monday 00:00 US Central Standard Time (06:00 UTC), counted from
EPOCH; keep EPOCH and WEEK in step with the engine in src/index.template.html.
"""
import datetime
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
ORDER = ['ads', 'gramophone', 'whodunit', 'midnight', 'rocket', 'saddle', 'laugh', 'storytime', 'tapers', 'freeform', 'nocturne']
EPOCH = datetime.datetime(2026, 11, 23, 6, tzinfo=datetime.timezone.utc)
WEEK = datetime.timedelta(days=7)
SNAPSHOTS = ROOT / 'snapshots'


def head_catalog():
    """The catalog as it stands in catalog/, one entry per station file."""
    return {k: json.loads((ROOT / 'catalog' / f'{k}.json').read_text(encoding='utf-8')) for k in ORDER}


def week_index(when):
    """Schedule week (0 = the week of EPOCH) containing a datetime."""
    return (when - EPOCH) // WEEK


def week_date(k):
    """The Monday a schedule week starts, as YYYY-MM-DD."""
    return (EPOCH + k * WEEK).strftime('%Y-%m-%d')


def date_week(text):
    """Schedule week for a YYYY-MM-DD Monday; ValueError for any other date."""
    d = datetime.datetime.strptime(text, '%Y-%m-%d').replace(hour=6, tzinfo=datetime.timezone.utc)
    if (d - EPOCH) % WEEK:
        raise ValueError(f'{text} is not a Monday that starts a schedule week')
    return (d - EPOCH) // WEEK


def load_snapshots():
    """[(week, snapshot)] for every snapshots/YYYY-MM-DD.json, oldest first."""
    out = []
    for p in sorted(SNAPSHOTS.glob('*.json')):
        snap = json.loads(p.read_text(encoding='utf-8'))
        if snap.get('from') != p.stem:
            raise ValueError(f'{p.name} says it starts {snap.get("from")}')
        out.append((date_week(p.stem), snap))
    return out


def in_effect(snaps, k):
    """The snapshot that schedules week k: the latest one starting at or before it."""
    before = [s for w, s in snaps if w <= k]
    return before[-1] if before else (snaps[0][1] if snaps else None)


def dump_snapshot(snap):
    """One station per line, and one Archive item's levels per line, so a diff shows what changed."""
    cat = snap['catalog']
    lines = [json.dumps({'from': snap['from'], 'exclude': snap['exclude']}, ensure_ascii=False, separators=(',', ':'))[:-1] + ',"catalog":{']
    lines += [json.dumps(k, ensure_ascii=False) + ':' + json.dumps(cat[k], ensure_ascii=False, separators=(',', ':')) + (',' if i < len(cat) - 1 else '') for i, k in enumerate(cat)]
    out = '\n'.join(lines) + '\n}'
    lv = snap.get('levels')
    if lv:
        ids = sorted(lv)
        out += ',"levels":{\n' + '\n'.join(json.dumps(i, ensure_ascii=False) + ':' + json.dumps(lv[i], ensure_ascii=False, separators=(',', ':')) + (',' if n < len(ids) - 1 else '') for n, i in enumerate(ids)) + '\n}'
    return out + '}\n'


def catalog_levels(cat, path=None):
    """The rows of catalog/levels.json (tools/levels.js) for the Archive items this catalog plays."""
    p = path or ROOT / 'catalog' / 'levels.json'
    if not p.exists():
        return {}
    items = json.loads(p.read_text(encoding='utf-8'))['items']
    text = json.dumps(cat, ensure_ascii=False)
    return {i: items[i] for i in sorted(items) if json.dumps(i, ensure_ascii=False)[1:-1] in text}


def held(path=None):
    """Files kept off the air by hand (catalog/review/held.json): an upheld report, a damaged file."""
    p = path or ROOT / 'catalog' / 'review' / 'held.json'
    return sorted(json.loads(p.read_text(encoding='utf-8'))['files']) if p.exists() else []
