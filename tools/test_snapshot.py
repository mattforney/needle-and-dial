"""Tests for the weekly snapshot tool, in a scratch folder: python3 tools/test_snapshot.py"""
import contextlib
import io
import json
import os
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ndlib  # noqa: E402
import snapshot  # noqa: E402

fails = []


def check(cond, what):
    if not cond:
        fails.append(what)
        print('FAIL', what)


# Week arithmetic: Mondays 00:00 Central from EPOCH.
check(ndlib.date_week('2026-11-23') == 0 and ndlib.date_week('2026-11-30') == 1 and ndlib.week_date(5) == '2026-12-28', 'week dates')
try:
    ndlib.date_week('2026-11-24')
    check(False, 'a Tuesday is not a schedule Monday')
except ValueError:
    pass
check(ndlib.in_effect([(0, 'a'), (2, 'b')], 1) == 'a' and ndlib.in_effect([(0, 'a'), (2, 'b')], 2) == 'b' and ndlib.in_effect([(3, 'c')], 1) == 'c' and ndlib.in_effect([], 1) is None, 'in_effect')

# What an Archive check holds out: broken files and unapproved stream-only items, nothing else.
with tempfile.TemporaryDirectory() as tmp:
    report = pathlib.Path(tmp, 'check.json')
    report.write_text(json.dumps({'pending': ['so'], 'results': [
        {'id': 'a', 'f': '1.mp3', 'status': 'ok'}, {'id': 'a', 'f': '2.mp3', 'status': 'gone'}, {'id': 'a', 'f': '3.mp3', 'status': 'missing'},
        {'id': 'b', 'f': '1.mp3', 'status': 'refused'}, {'id': 'b', 'f': '2.mp3', 'status': 'failed'}, {'id': 'b', 'f': '3.mp3', 'status': 'length'},
        {'id': 'c', 'f': '1.mp3', 'status': 'unchecked'}, {'id': 'so', 'f': 'x.mp3', 'status': 'ok'}]}))
    check(snapshot.exclusions(report) == ['a/2.mp3', 'a/3.mp3', 'b/1.mp3', 'b/2.mp3', 'so/x.mp3'], 'exclusions: ' + repr(snapshot.exclusions(report)))

# The tool end to end, against a scratch snapshots/ folder and a stand-in catalog, levels table and hold list.
cat = {'one': {'k': 1}}
LEVELS, HELD = {}, []
snapshot.catalog_levels = lambda c: json.loads(json.dumps(LEVELS))
snapshot.held = lambda: list(HELD)
with tempfile.TemporaryDirectory() as tmp:
    snapshot.SNAPSHOTS = ndlib.SNAPSHOTS = pathlib.Path(tmp, 'snapshots')
    snapshot.head_catalog = lambda: json.loads(json.dumps(cat))

    def run(*args, now='2026-11-26T12:00Z'):
        os.environ['ND_NOW'] = now
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            snapshot.main(list(args))
        return out.getvalue().strip()

    files = lambda: sorted(p.name for p in snapshot.SNAPSHOTS.glob('*.json'))
    check(run() == 'snapshots/2026-11-30.json' and files() == ['2026-11-30.json'], 'first run drafts next week')
    check(json.loads(pathlib.Path(tmp, 'snapshots/2026-11-30.json').read_text()) == {'from': '2026-11-30', 'exclude': [], 'catalog': cat}, 'the draft parses and holds the catalog')
    check(run() == '' and files() == ['2026-11-30.json'], 'a second run with nothing new writes nothing')
    report = pathlib.Path(tmp, 'check.json')
    report.write_text(json.dumps({'pending': [], 'results': [{'id': 'a', 'f': '1.mp3', 'status': 'gone'}]}))
    check(run('--exclude-from', str(report)) == 'snapshots/2026-11-30.json' and ndlib.load_snapshots()[0][1]['exclude'] == ['a/1.mp3'], 'a new finding updates the draft')
    # A week later the draft is on air. If the following week would schedule the same way, no new file.
    check(run('--exclude-from', str(report), now='2026-12-03T12:00Z') == '' and files() == ['2026-11-30.json'], 'an unchanged week needs no file')
    cat['one']['k'] = 2
    check(run(now='2026-12-03T12:00Z') == 'snapshots/2026-12-07.json', 'a catalog change drafts the next week')
    cat['one']['k'] = 1
    report.write_text(json.dumps({'pending': [], 'results': [{'id': 'a', 'f': '1.mp3', 'status': 'gone'}]}))
    check(run('--exclude-from', str(report), now='2026-12-03T12:00Z') == 'removed snapshots/2026-12-07.json' and files() == ['2026-11-30.json'], 'a draft that matches the week before is removed')
    try:
        with contextlib.redirect_stderr(io.StringIO()):
            run('--week', '2026-11-30', now='2026-12-03T12:00Z')
        check(False, 'a week on air is fixed')
    except SystemExit:
        pass
    check(ndlib.dump_snapshot({'from': 'x', 'exclude': [], 'catalog': {'a': 1, 'b': {'c': '|'}}}).count('\n') == 4, 'one station per line')

# Levels and the hold list in drafts: carried, compared, and written one Archive item per line.
with tempfile.TemporaryDirectory() as tmp:
    snapshot.SNAPSHOTS = ndlib.SNAPSHOTS = pathlib.Path(tmp, 'snapshots')
    snapshot.head_catalog = lambda: {'one': {'i': 'item-a', 'e': ['x.mp3|60']}}
    LEVELS.update({'item-a': {'x.mp3': [-2.5, 0.4, 59.1]}})
    HELD.extend(['item-b/held.mp3'])
    report = pathlib.Path(tmp, 'check.json')
    report.write_text(json.dumps({'pending': [], 'results': [{'id': 'item-a', 'f': 'gone.mp3', 'status': 'gone'}]}))
    check(run('--exclude-from', str(report)) == 'snapshots/2026-11-30.json', 'a draft with levels and held files')
    d = json.loads(pathlib.Path(tmp, 'snapshots/2026-11-30.json').read_text())
    check(d.get('levels') == {'item-a': {'x.mp3': [-2.5, 0.4, 59.1]}}, 'the draft carries the levels: ' + repr(d.get('levels')))
    check(d['exclude'] == ['item-a/gone.mp3', 'item-b/held.mp3'], 'held files join what the Archive check holds out: ' + repr(d['exclude']))
    check(run('--exclude-from', str(report)) == '', 'unchanged levels write nothing')
    LEVELS['item-a']['x.mp3'] = [-3.0, 0.4, 59.1]
    check(run('--exclude-from', str(report)) == 'snapshots/2026-11-30.json', 'changed levels update the draft')
    text = ndlib.dump_snapshot({'from': 'x', 'exclude': [], 'catalog': {'a': 1}, 'levels': {'i1': {'f': [1, 2, 3]}, 'i2': {'g': [0, 0, 9]}}})
    check(json.loads(text)['levels']['i2'] == {'g': [0, 0, 9]} and text.count('\n') == 6, 'levels one item per line, and the file still parses')
    # The real helpers, on scratch files: levels only for items the catalog plays; the hold list's files.
    lv = pathlib.Path(tmp, 'levels.json')
    lv.write_text(json.dumps({'items': {'item-a': {'x.mp3': [1, 0, 9]}, 'item-z': {'y.mp3': [1, 0, 9]}}}))
    check(ndlib.catalog_levels({'one': {'i': 'item-a', 'e': ['x.mp3|60']}}, lv) == {'item-a': {'x.mp3': [1, 0, 9]}}, 'catalog_levels keeps only the items the catalog plays')
    check(ndlib.catalog_levels({}, pathlib.Path(tmp, 'none.json')) == {}, 'no levels table, no levels')
    hp = pathlib.Path(tmp, 'held.json')
    hp.write_text(json.dumps({'files': {'b/2.mp3': 'damaged', 'a/1.mp3': 'upheld report'}}))
    check(ndlib.held(hp) == ['a/1.mp3', 'b/2.mp3'] and ndlib.held(pathlib.Path(tmp, 'none.json')) == [], 'held reads the hold list')

print(f'{len(fails)} FAILURES' if fails else 'ALL SNAPSHOT TESTS PASSED')
sys.exit(1 if fails else 0)
