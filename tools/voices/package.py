#!/usr/bin/env python3
"""Records each station's announcements (tools/voices/scripts.txt) in its chosen Kokoro voice.

One MP3 per line, levelled to the programs' loudness (-20 LUFS, peaks under -2 dBTP) so an ID sits at
the same level as what's around it, and a manifest with each line's text, kind, file and length. Runs in
a GitHub Action (.github/workflows/voice-package.yml), which can reach Kokoro's weights on Hugging Face.

  python3 tools/voices/package.py OUT_DIR [--only whodunit,tapers] [--speed 1.0]
  python3 tools/voices/package.py --check     # read and check the scripts only, no rendering
"""
import argparse, json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from audition import SR, log, spoken, stations  # noqa: E402

LUFS, PEAK = -20.0, -2.0
PAD = 0.15  # seconds of silence kept before and after each recording


def read_scripts(path=os.path.join(HERE, 'scripts.txt')):
    """Blocks of lines per station, checked against the rules at the top of scripts.txt: a known station
    and voice; every line giving the station's name and frequency; every legal ID also giving the call
    letters followed straight away by the city of license."""
    by_key = {S['key']: S for S in stations()}
    city, out, cur, problems, pron = None, [], None, [], {}
    for n, raw in enumerate(open(path, encoding='utf-8'), 1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('city:'):  # before the first station, the default; in a station's block, its own
            if cur:
                cur['city'] = line.split(':', 1)[1].strip()
            else:
                city = line.split(':', 1)[1].strip()
        elif line.startswith('pron:'):
            m = re.fullmatch(r"pron:\s*([\w'\u2019-]+)\s+/([^/]+)/", line)
            if m:
                pron[m.group(1)] = m.group(2)
            else:
                problems.append(f'line {n}: "{line}" should be "pron: Word /phonemes/"')
        elif line.startswith('== '):
            parts = line[3:].split()
            if len(parts) < 3 or parts[0] not in by_key or not re.fullmatch(r'[ab][fm]_\w+', parts[1]):
                problems.append(f'line {n}: "{line}" should be "== station-key voice frequency"')
                cur = None
                continue
            cur = {'station': by_key[parts[0]], 'voice': parts[1], 'freq': ' '.join(parts[2:]), 'lines': []}
            out.append(cur)
        elif cur and re.match(r'(legal|sweeper):', line):
            kind, text = (x.strip() for x in line.split(':', 1))
            cur['lines'].append({'kind': kind, 'text': text})
        else:
            problems.append(f'line {n}: not a station, a legal ID or a sweeper: "{line}"')
    if not city:
        problems.append('no "city:" line')
    for b in out:
        b.setdefault('city', city)
        S, k = b['station'], {'legal': 0, 'sweeper': 0}
        name = S['name'].replace('\u2019', "'")
        for L in b['lines']:
            k[L['kind']] += 1
            L['id'] = f"{L['kind']}-{k[L['kind']]}"
            where = f"{S['key']} {L['id']}"
            if L['kind'] == 'legal' and not re.search(rf"\b{S['call']} {re.escape(b['city'] or '')}\b", L['text']):
                problems.append(f"{where}: a legal ID needs \"{S['call']} {b['city']}\", the call letters followed by the city")
            if name not in L['text'].replace('\u2019', "'"):
                problems.append(f"{where}: no station name (\"{name}\")")
            if b['freq'].lower() not in L['text'].lower():
                problems.append(f"{where}: no frequency (\"{b['freq']}\")")
        if not k['legal']:
            problems.append(f"{S['key']}: no legal ID")
    read_scripts.pron = pron
    return city, out, problems


def say(text, call, pron=None):
    """The text as the voice should read it: words with a set pronunciation (the scripts' "pron:" lines)
    in Kokoro's markup for one, and the call letters spelled out, as on the page's own IDs."""
    for word, ph in (pron or {}).items():
        text = re.sub(rf"(?<![\w\[])({re.escape(word)})(?![\w\]])", rf"[\1](/{ph}/)", text)
    return spoken(re.sub(rf'\b{call}\b', ' '.join(call), text))


def level(wav, mp3):
    """Two-pass loudness normalisation to LUFS, as one fixed gain (linear), then MP3."""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', f'loudnorm=I={LUFS}:TP={PEAK}:LRA=11:print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True, check=True)
    m = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
    af = (f"loudnorm=I={LUFS}:TP={PEAK}:LRA=11:linear=true:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
          f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']},aresample={SR}")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-af', af, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '96k', mp3], check=True)
    return float(m['input_i'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out', nargs='?')
    ap.add_argument('--only', default='')
    ap.add_argument('--speed', type=float, default=1.0)
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    city, blocks, problems = read_scripts()
    for b in blocks:
        log(f"{b['station']['call']} {b['city']}, {b['station']['name']}, {b['voice']}: {len(b['lines'])} lines")
    if problems:
        sys.exit('\n'.join(['scripts.txt:'] + problems))
    if a.check:
        return
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline
    only = set(filter(None, a.only.split(',')))
    pipes, manifest, t0 = {}, {'city': city, 'lufs': LUFS, 'speed': a.speed, 'stations': []}, time.time()
    for b in blocks:
        S, v = b['station'], b['voice']
        if only and S['key'] not in only:
            continue
        lang = v[0]
        if lang not in pipes:
            pipes[lang] = KPipeline(lang_code=lang, repo_id='hexgrad/Kokoro-82M')
        os.makedirs(os.path.join(a.out, S['key']), exist_ok=True)
        clips = []
        for L in b['lines']:
            parts, ps = [], []
            for r in pipes[lang](say(L['text'], S['call'], read_scripts.pron), voice=v, speed=a.speed):
                if r.audio is not None:
                    parts.append(r.audio.detach().cpu().numpy() if hasattr(r.audio, 'detach') else np.asarray(r.audio))
                ps.append(r.phonemes)
            pad = np.zeros(int(PAD * SR), dtype=np.float32)
            audio = np.concatenate([pad, *parts, pad])
            wav, rel = os.path.join(a.out, S['key'], L['id'] + '.wav'), f"{S['key']}/{L['id']}.mp3"
            sf.write(wav, audio, SR)
            raw = level(wav, os.path.join(a.out, rel))
            os.remove(wav)
            clips.append({**L, 'file': rel, 'seconds': round(len(audio) / SR, 2), 'raw_lufs': round(raw, 1), 'phonemes': ' '.join(ps)})
            log(f"  {S['call']} {L['id']}: {len(audio) / SR:.1f} s, {raw:.1f} LUFS before levelling · {' '.join(ps)}")
        manifest['stations'].append({'key': S['key'], 'call': S['call'], 'name': S['name'], 'band': S['band'], 'f': S['f'], 'fmt': S['fmt'], 'voice': v, 'freq': b['freq'], 'city': b['city'], 'clips': clips})
    with open(os.path.join(a.out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    log(f'done in {time.time() - t0:.0f} s')


if __name__ == '__main__':
    main()
