"""Renders the now-vs-proposed trim clips listed in manifest.json (run in GitHub Actions, which can
reach the Archive). Each file is decoded from its start through the page's 20 Hz high-pass, so the
filter has settled before any clip begins, then cut, given its on-air gain (Android and desktop) and
limited to -1 dBFS, and written as MP3 to clips/NN-end-a.mp3 and so on. results.json records each
file's length as decoded, its DC offset, and each clip's length.

    python3 research/loudness/remeasure/clips/render.py
"""
import json, os, re, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'audio')


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def fetch(url, dest):
    for k in range(4):
        r = run(['curl', '-sSL', '--fail', '-m', '900', '-o', dest, url])
        if r.returncode == 0 and os.path.getsize(dest) > 0:
            return True
        time.sleep(5 * (k + 1))
    return False


def length(path):
    r = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path])
    try:
        return round(float(r.stdout.strip()), 2)
    except ValueError:
        return None


def dc(path):
    r = run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'astats=measure_overall=DC_offset:measure_perchannel=none', '-f', 'null', '-'])
    m = re.search(r'DC offset:\s*(-?[\d.]+)', r.stderr)
    return float(m.group(1)) if m else None


def clip(src, a, b, gain, dest):
    af = f'highpass=f=20:poles=2,atrim=start={a}:end={b},asetpts=PTS-STARTPTS,volume={gain}dB,alimiter=limit=0.891:attack=1:release=100:level=false'
    r = run(['ffmpeg', '-hide_banner', '-v', 'error', '-y', '-i', src, '-map', '0:a:0', '-map_metadata', '-1', '-af', af, '-c:a', 'libmp3lame', '-q:a', '5', dest])  # audio only: some files carry cover art
    if r.returncode:
        print(r.stderr[-400:], file=sys.stderr)
        return None
    return length(dest)


def main():
    man = json.load(open(os.path.join(HERE, 'manifest.json'), encoding='utf-8'))
    os.makedirs(OUT, exist_ok=True)
    res = {'rendered': time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime()), 'items': []}
    with tempfile.TemporaryDirectory() as tmp:
        for it in man['items']:
            src = os.path.join(tmp, 'src' + os.path.splitext(it['f'])[1])
            row = {'n': it['n'], 'id': it['id'], 'f': it['f'], 'clips': []}
            if not fetch(it['url'], src):
                row['error'] = 'download failed'
                res['items'].append(row)
                print(f"{it['n']:2d} download failed: {it['f']}", flush=True)
                continue
            row['decoded'] = length(src)
            row['dc'] = dc(src)
            for c in it['clips']:
                got = {}
                for v in ('a', 'b'):
                    name = f"{it['n']:02d}-{c['end']}-{v}.mp3"
                    got[v] = {'file': 'audio/' + name, 'secs': clip(src, c[v][0], c[v][1], it['gain'], os.path.join(OUT, name))}
                row['clips'].append({'end': c['end'], **got})
            res['items'].append(row)
            print(f"{it['n']:2d} {it['f'][:60]}: {row['decoded']} s, DC {row['dc']}", flush=True)
            os.remove(src)
    json.dump(res, open(os.path.join(HERE, 'results.json'), 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
