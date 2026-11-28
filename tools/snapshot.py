"""Drafts the frozen catalog for a coming schedule week.

Each week's schedule is built from a frozen copy of the catalog, so changes made during a week
(by hand, or files the Archive check drops) reach the air only when the next week starts.
snapshots/YYYY-MM-DD.json holds the catalog in effect from that Monday, 00:00 Central; a week
with no file of its own keeps the one before. A snapshot is a draft until its Monday arrives,
and fixed after that.

    python3 tools/snapshot.py                         # next week, from catalog/
    python3 tools/snapshot.py --exclude-from dist/archive-check.json
    python3 tools/snapshot.py --week 2026-12-07       # a later Monday

--exclude-from holds out what the latest Archive check found broken (gone, missing, refused,
failed) and stream-only items not yet approved; files that only changed length or couldn't be
checked stay in. Files in catalog/review/held.json are always held out. The draft carries the
per-file levels from catalog/levels.json (gain, and silence cut from each end) for the items it
plays, the load gap before each recording (ndlib.GAP) and, from the week of 7 Dec 2026, the longer
station break (ndlib.BREAK). Writes nothing when the draft matches the snapshot already in effect for
that week. Prints the file it wrote, or nothing.
"""
import argparse
import datetime
import json
import os
import sys

from ndlib import GAP, SNAPSHOTS, break_for, catalog_levels, date_week, dump_snapshot, head_catalog, held, in_effect, load_snapshots, week_date, week_index

HOLD = {'gone', 'missing', 'refused', 'failed'}


def exclusions(path):
    check = json.loads(open(path, encoding='utf-8').read())
    pending = set(check.get('pending', []))
    keys = {r['id'] + '/' + r['f'] for r in check['results'] if r['status'] in HOLD or r['id'] in pending}
    return sorted(keys)


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--week', help='the Monday (YYYY-MM-DD) the snapshot starts; default: next week')
    ap.add_argument('--exclude-from', help="an Archive check's dist/archive-check.json")
    a = ap.parse_args(argv)
    env = os.environ.get('ND_NOW')  # for tests, as in build.py
    now = week_index(datetime.datetime.fromisoformat(env.replace('Z', '+00:00')) if env else datetime.datetime.now(datetime.timezone.utc))
    k = date_week(a.week) if a.week else now + 1
    if k <= now:
        sys.exit(f'{week_date(k)} has started; a snapshot on air is fixed.')
    cat = head_catalog()
    draft = {'from': week_date(k), 'exclude': sorted(set(exclusions(a.exclude_from) if a.exclude_from else []) | set(held())), 'gap': GAP, 'brk': break_for(k), 'catalog': cat, 'levels': catalog_levels(cat)}
    snaps = load_snapshots()
    prior = in_effect([(w, s) for w, s in snaps if w < k], k)  # what week k gets without a file of its own
    existing = next((s for w, s in snaps if w == k), None)
    same = lambda s: bool(s) and s['exclude'] == draft['exclude'] and s.get('gap', 0) == draft['gap'] and s.get('brk', 0) == draft['brk'] and s['catalog'] == draft['catalog'] and s.get('levels', {}) == draft['levels']
    out = SNAPSHOTS / f"{draft['from']}.json"
    if same(prior):
        # The week would schedule exactly as the one before it: no file needed, and an older draft would only differ.
        if existing:
            out.unlink()
            print(f'removed {out.relative_to(SNAPSHOTS.parent)}')
        return
    if same(existing):
        return
    SNAPSHOTS.mkdir(exist_ok=True)
    out.write_text(dump_snapshot(draft), encoding='utf-8')
    print(out.relative_to(SNAPSHOTS.parent))


if __name__ == '__main__':
    main(sys.argv[1:])
