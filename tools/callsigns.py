#!/usr/bin/env python3
"""Are the stations' call letters still fictional?

Checks every call sign the page uses (the `call:` entries in src/index.template.html), and any extra
candidates listed in tools/callsign_candidates.txt or passed with --extra, against the FCC's own
records of US broadcast stations: AM, FM, low-power FM, full-power, Class A and low-power TV.

Sources, each used if it can be reached:
  cdbs   the CDBS public database file facility.zip (every facility the FCC has records for,
         including deleted ones, whose call signs carry a leading D)
  lms    the Licensing and Management System's public database dump (the same records, kept in LMS
         since the radio services moved there), searched table by table for the call sign
  query  the FCC's AM, FM and TV Query tools, asked one call sign at a time

A call sign is "in use" when any source shows a station holding it now (licensed, built under a
construction permit, or applied for), with or without a suffix: KRKT-FM uses KRKT. It is "free" when
no source shows one; a deleted station that once held it is noted. With no source reachable the
answer is "unknown" and the check fails rather than pass on no evidence.

  python3 tools/callsigns.py                 # the page's call signs; exits 1 if any is in use
  python3 tools/callsigns.py --extra WABC,KXYZ
  python3 tools/callsigns.py --sources cdbs,query --json out.json
"""
import argparse, io, json, os, re, sys, time, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'needle-and-dial call-sign check (https://github.com/mattforney/needle-and-dial)'
CALL = re.compile(r'^[KW][A-Z]{3}$')
CDBS_URLS = [
    'https://transition.fcc.gov/ftp/Bureaus/MB/Databases/cdbs/facility.zip',
    'https://transition.fcc.gov/Bureaus/MB/Databases/cdbs/facility.zip',
    'https://www.fcc.gov/ftp/Bureaus/MB/Databases/cdbs/facility.zip',
]
LMS_URLS = ['https://enterpriseefiling.fcc.gov/dataentry/api/download/dbfile/Current_LMS_Dump.zip']
QUERY = {'AM': 'amq', 'FM': 'fmq', 'TV': 'tvq'}
QUERY_HOSTS = ['https://transition.fcc.gov', 'https://www.fcc.gov']
# CDBS facility table, in the order of the public file's documentation.
FAC = ['comm_city', 'comm_state', 'eeo_rpt_ind', 'fac_address1', 'fac_address2', 'fac_callsign', 'fac_channel',
       'fac_city', 'fac_country', 'fac_frequency', 'fac_service', 'fac_state', 'fac_status_date', 'fac_type',
       'facility_id', 'lic_expiration_date', 'fac_status', 'fac_zip1', 'fac_zip2', 'station_type',
       'assoc_facility_id', 'callsign_eff_date', 'tsid_ntsc', 'tsid_dtv', 'digital_status', 'sat_tv',
       'network_affil', 'nielsen_dma', 'tv_virtual_channel', 'last_change_date']
# Known stations the parser must find where they are, or the column order has changed.
KNOWN = [('WHOD', 'FM', 'AL'), ('KTPR', 'FM', 'TX'), ('KFRE', 'DT', 'CA')]


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def page_calls():
    src = open(os.path.join(ROOT, 'src', 'index.template.html'), encoding='utf-8').read()
    return re.findall(r"\bcall: '([KW][A-Z]{3})'", src)


def file_calls(path):
    if not os.path.exists(path):
        return []
    out = []
    for line in open(path, encoding='utf-8'):
        line = line.split('#', 1)[0]
        out += [w for w in re.split(r'[\s,]+', line.upper()) if w]
    return out


def base_of(cs):
    """KRKT-FM -> ('KRKT', False); DWGRM -> ('WGRM', True); NEW or a translator -> (None, False)."""
    cs = (cs or '').strip().upper()
    b = cs.split('-', 1)[0]
    if len(b) == 5 and b[0] == 'D' and CALL.match(b[1:]):
        return b[1:], True
    return (b, False) if CALL.match(b) else (None, False)


def fetch(url, timeout=120):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def head(url):
    req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return int(r.headers.get('Content-Length') or 0)


def first_ok(urls, what):
    for u in urls:
        try:
            t = time.time()
            b = fetch(u, timeout=600)
            log(f'{what}: {len(b) / 1e6:.1f} MB from {u} in {time.time() - t:.0f} s')
            return u, b
        except Exception as e:  # noqa: BLE001 - report and try the next mirror
            log(f'{what}: {u} failed: {e}')
    return None, None


def src_cdbs(calls):
    url, blob = first_ok(CDBS_URLS, 'cdbs')
    if not blob:
        return None
    z = zipfile.ZipFile(io.BytesIO(blob))
    name = next(n for n in z.namelist() if n.lower().endswith('.dat'))
    want, hits, newest, rows = set(calls), {c: [] for c in calls}, '', 0
    known = {k: [] for k, _, _ in KNOWN}
    with z.open(name) as f:
        for raw in io.TextIOWrapper(f, encoding='latin-1'):
            v = raw.rstrip('\r\n').split('|')
            if len(v) < len(FAC):
                continue
            rows += 1
            r = dict(zip(FAC, (x.strip() for x in v)))
            newest = max(newest, r['last_change_date'][:10] if re.match(r'\d{4}-\d\d-\d\d', r['last_change_date']) else '')
            b, deleted = base_of(r['fac_callsign'])
            if b in known and not deleted:
                known[b].append((r['fac_service'], r['comm_state']))
            if b in want:
                hits[b].append({
                    'call': r['fac_callsign'], 'service': r['fac_service'], 'status': r['fac_status'],
                    'deleted': deleted, 'city': r['comm_city'].title(), 'state': r['comm_state'],
                    'facility': r['facility_id'], 'changed': r['last_change_date'][:10],
                })
    bad = [k for k, svc, st in KNOWN if (svc, st) not in known[k]]
    if bad:
        log(f'cdbs: the column order looks wrong (did not find {bad} where expected: {known}); not using it')
        return None
    log(f'cdbs: {rows} facilities, newest change {newest or "unknown"}')
    return {'name': 'cdbs', 'url': url, 'rows': rows, 'newest': newest, 'hits': hits}


def src_lms(calls):
    url = LMS_URLS[0]
    try:
        size = head(url)
        log(f'lms: {url} is {size / 1e6:.0f} MB')
        if size > 4e9:
            log('lms: too large to fetch here; skipped')
            return None
    except Exception as e:  # noqa: BLE001
        log(f'lms: {url} failed: {e}')
        return None
    url, blob = first_ok([url], 'lms')
    if not blob:
        return None
    z = zipfile.ZipFile(io.BytesIO(blob))
    names = z.namelist()
    log('lms: tables: ' + ', '.join(sorted(os.path.basename(n) for n in names)))
    token = re.compile(r'(?:^|\|)(D?(' + '|'.join(sorted(set(calls))) + r'))(?:-[A-Z0-9]{1,3})?(?=\||$)')
    hits, tables = {c: [] for c in calls}, {}
    for n in names:
        low = os.path.basename(n).lower()
        if not (low.endswith('.dat') or low.endswith('.txt') or low.endswith('.csv')):
            continue
        if not re.search(r'facil|call', low):
            continue
        with z.open(n) as f:
            header = None
            for i, raw in enumerate(io.TextIOWrapper(f, encoding='latin-1')):
                line = raw.rstrip('\r\n')
                if i == 0 and re.search(r'call', line, re.I) and not re.search(r'\|[KW][A-Z]{3}\b', line):
                    header = line.split('|')
                    tables[low] = header
                    continue
                for m in token.finditer(line):
                    c = m.group(2)
                    if len(hits[c]) < 12:
                        hits[c].append({'table': low, 'deleted': m.group(1).startswith('D') and len(m.group(1)) == 5,
                                        'row': (dict(zip(header, line.split('|'))) if header else line[:400])})
    return {'name': 'lms', 'url': url, 'tables': tables, 'hits': hits}


def src_query(calls):
    hits, ok, host = {c: [] for c in calls}, 0, None
    for h in QUERY_HOSTS:
        try:
            body = fetch(f'{h}/fcc-bin/fmq?call=WHOD&list=4', timeout=60).decode('latin-1')
            if '|WHOD' in body.replace(' ', ''):
                host = h
                break
            log(f'query: {h} answered without the known station WHOD: {body[:300]!r}')
        except Exception as e:  # noqa: BLE001
            log(f'query: {h} failed: {e}')
    if not host:
        return None
    for c in calls:
        for band, tool in QUERY.items():
            try:
                body = fetch(f'{host}/fcc-bin/{tool}?call={c}&list=4', timeout=60).decode('latin-1')
                ok += 1
            except Exception as e:  # noqa: BLE001
                log(f'query: {tool} {c} failed: {e}')
                continue
            for line in body.splitlines():
                v = [x.strip() for x in line.split('|')]
                if len(v) < 3 or not v[1]:
                    continue
                b, deleted = base_of(v[1])
                if b == c:
                    hits[c].append({'call': v[1], 'tool': tool, 'deleted': deleted, 'row': ' | '.join(x for x in v[1:14] if x)})
            time.sleep(0.25)
    log(f'query: {ok} answers from {host}')
    return {'name': 'query', 'url': host + '/fcc-bin/', 'hits': hits}


def verdict(c, sources):
    current, deleted = [], []
    for s in sources:
        for h in s['hits'][c]:
            (deleted if h.get('deleted') else current).append((s['name'], h))
    if current:
        return 'in use', current, deleted
    return 'free', current, deleted


def describe(h):
    if 'service' in h:
        return f"{h['call']} {h['service']} {h['status']} · {h['city']}, {h['state']} (facility {h['facility']})"
    if 'tool' in h:
        return f"{h['tool']}: {h['row'][:160]}"
    row = h['row']
    if isinstance(row, dict):
        keys = [k for k in row if re.search(r'call|service|status|city|state|facility_id|active', k, re.I)]
        return f"{h['table']}: " + ', '.join(f'{k}={row[k]}' for k in keys[:10])
    return f"{h['table']}: {row[:160]}"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--extra', default='', help='more call signs to check, comma-separated')
    ap.add_argument('--candidates', default=os.path.join(ROOT, 'tools', 'callsign_candidates.txt'))
    ap.add_argument('--sources', default='cdbs,lms,query')
    ap.add_argument('--json', help='write the full results here')
    a = ap.parse_args()
    ours = page_calls()
    extra = [c for c in file_calls(a.candidates) + [w.strip().upper() for w in a.extra.split(',') if w.strip()]]
    calls = list(dict.fromkeys(ours + extra))
    badform = [c for c in calls if not CALL.match(c)]
    if badform:
        sys.exit(f'not four-letter K/W call signs: {badform}')
    log(f'checking {len(ours)} call signs from the page and {len(calls) - len(ours)} candidates')
    want = a.sources.split(',')
    sources = [s for s in (
        src_cdbs(calls) if 'cdbs' in want else None,
        src_lms(calls) if 'lms' in want else None,
    ) if s]
    # The query tools are asked only about call signs the bulk files didn't already show in use,
    # and the page's own; one request per tool per call sign.
    if 'query' in want:
        ask = [c for c in calls if c in ours or not sources or verdict(c, sources)[0] == 'free']
        q = src_query(ask)
        if q:
            q['hits'] = {c: q['hits'].get(c, []) for c in calls}
            q['asked'] = ask
            sources.append(q)
    lines = [f"Sources: {', '.join(s['name'] + (' (newest change ' + s['newest'] + ')' if s.get('newest') else '') for s in sources) or 'none reachable'}", '',
             '| Call | On the page | Verdict | Evidence |', '|---|---|---|---|']
    out, used = {}, []
    for c in calls:
        if not sources:
            v, cur, dele = 'unknown', [], []
        else:
            v, cur, dele = verdict(c, sources)
        ev = '; '.join(f'{n}: {describe(h)}' for n, h in cur[:4]) or ('once held by a deleted station: ' + '; '.join(f'{n}: {describe(h)}' for n, h in dele[:2]) if dele else '')
        lines.append(f"| {c} | {'yes' if c in ours else ''} | {v} | {ev} |")
        out[c] = {'page': c in ours, 'verdict': v, 'current': [h for _, h in cur], 'deleted': [h for _, h in dele]}
        if c in ours and v != 'free':
            used.append(c)
    report = '\n'.join(lines)
    print(report)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write('## Call signs\n\n' + report + '\n')
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as f:
            json.dump({'sources': [{k: s[k] for k in s if k != 'hits'} for s in sources], 'calls': out}, f, indent=1, default=str)
    if used:
        log(f'In use by a real station, or not checkable: {", ".join(used)}')
        sys.exit(1)


if __name__ == '__main__':
    main()
