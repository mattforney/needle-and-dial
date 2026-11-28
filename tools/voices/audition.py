#!/usr/bin/env python3
"""Voice audition: every English Kokoro voice reads every station's lines.

Kokoro is an open text-to-speech model (Apache-2.0, 82M parameters). Its weights and voices come from
Hugging Face, so this runs in a GitHub Action (.github/workflows/voices.yml), not in the page.

For each voice it renders, one after another with a pause between them:
  - the lineup line, the same for every voice, for comparing voices with each other
  - for each station, its legal ID (from the `say` text on the page) and a program introduction
    built from something in its catalog
and writes one MP3 per voice, a manifest with where each line sits in it, and the phonemes Kokoro
read each line as, so the call letters' pronunciation can be checked without listening.

  python3 tools/voices/audition.py OUT_DIR [--voices af_heart,am_michael] [--shard 0/4] [--speed 1.0]
"""
import argparse, json, os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SR = 24000
GAP = 0.6  # seconds of silence between lines
LINEUP = "Good evening. You're tuned to Needle and Dial: ten stations, and every one of them on the air right now."
# A program introduction per station, from what its catalog plays.
INTROS = {
    'whodunit': 'And now: Yours Truly, Johnny Dollar.',
    'midnight': 'And now... Suspense.',
    'rocket': 'And now, X Minus One.',
    'saddle': 'And now, Gunsmoke.',
    'laugh': 'And now, The Jack Benny Program.',
    'gramophone': "Here's Reed Miller, with Afterwards, from nineteen fourteen.",
    'storytime': 'And now, The Black Cat, by Edgar Allan Poe.',
    'nocturne': "Next, Bach's Goldberg Variations, played by Shelley Katz.",
    'freeform': 'Coming up, Riding Alone for Thousands of Miles, with Brick City Love Song.',
    'tapers': 'From the Live Music Archive: the Grateful Dead, at Barton Hall, Cornell University, May eighth, nineteen seventy-seven.',
}
# English voices in Kokoro v1.0, used if VOICES.md can't be read.
FALLBACK = ('af_heart af_alloy af_aoede af_bella af_jessica af_kore af_nicole af_nova af_river af_sarah af_sky '
            'am_adam am_echo am_eric am_fenrir am_liam am_michael am_onyx am_puck am_santa '
            'bf_alice bf_emma bf_isabella bf_lily bm_daniel bm_fable bm_george bm_lewis').split()


def log(*a):
    print(*a, flush=True)


def stations():
    src = open(os.path.join(ROOT, 'src', 'index.template.html'), encoding='utf-8').read()
    out = []
    for m in re.finditer(r"\{ key: '(\w+)', band: '(AM|FM)', f: ([\d.]+), call: '([A-Z]{4})', name: '([^']+)', fmt: '([^']+)'.*?say: '([^']+)'", src):
        key, band, f, call, name, fmt, say = m.groups()
        out.append({'key': key, 'band': band, 'f': f, 'call': call, 'name': name, 'fmt': fmt, 'say': say})
    if len(out) != 10:
        sys.exit(f'expected 10 stations on the page, found {len(out)}')
    return out


def spoken(text):
    """Call letters ("W H O X") and "F M" as Kokoro's phonemizer (misaki) should read them. Spaced capitals
    come out as letter names, all but A, which in mid-run reads as the article ("W H A H": a schwa), so A
    gets its letter's sound written out. And a period straight after a letter reads as an initial's,
    with no stop, so a space goes before it: "W H O X . Whodunit." pauses where the page's text does."""
    def say(m):
        letters = ' '.join('[A](/\u02c8A/)' if c == 'A' else c for c in m.group(1).split())
        return letters + (' .' if m.group(2) else '')
    return re.sub(r'\b([A-Z](?: [A-Z])+)\b(\.)?', say, text)


def grades():
    """Kokoro's own notes on each voice (VOICES.md on Hugging Face): traits and overall grade."""
    try:
        from huggingface_hub import hf_hub_download
        md = open(hf_hub_download('hexgrad/Kokoro-82M', 'VOICES.md'), encoding='utf-8').read()
    except Exception as e:  # noqa: BLE001
        log(f'VOICES.md not read: {e}')
        return {}
    out = {}
    for line in md.splitlines():
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if not cells or not re.search(r'\b[ab][fm]_\w+', cells[0]):
            continue
        name = re.search(r'\b([ab][fm]_\w+)', cells[0]).group(1)
        grade = next((re.sub(r'[*_`]', '', c) for c in reversed(cells) if re.fullmatch(r'\**[A-F][+-]?\**', c)), '')
        traits = re.sub(r'[*_`]', '', cells[1]) if len(cells) > 1 else ''
        out[name] = {'grade': grade, 'traits': traits}
    log(f'VOICES.md: {len(out)} English voices with notes')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--voices', default='')
    ap.add_argument('--speed', type=float, default=1.0)
    ap.add_argument('--shard', default='0/1', help='render every nth voice from the ith: 1/4 is the 2nd, 6th, ...')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    st = stations()
    lines = [{'id': 'lineup', 'station': None, 'kind': 'lineup', 'text': LINEUP}]
    for S in st:
        lines.append({'id': S['key'] + ':id', 'station': S['key'], 'kind': 'id', 'text': S['say']})
        lines.append({'id': S['key'] + ':intro', 'station': S['key'], 'kind': 'intro', 'text': INTROS[S['key']]})
    notes = grades()
    voices = [v for v in (a.voices.split(',') if a.voices else sorted(set(notes) | set(FALLBACK))) if v]
    i, n = (int(x) for x in a.shard.split('/'))
    voices = voices[i::n]
    log(f'{len(voices)} voices × {len(lines)} lines: {", ".join(voices)}')
    for L in lines[:3]:
        log(f"  {L['id']}: {spoken(L['text'])}")

    pipes, phon, manifest = {}, {}, {'stations': st, 'lines': lines, 'voices': [], 'gap': GAP, 'speed': a.speed}
    t0 = time.time()
    for v in voices:
        try:
            render(v, lines, pipes, phon, manifest, notes, a, KPipeline, np, sf)
        except Exception as e:  # noqa: BLE001 - a voice Kokoro doesn't have: say so and go on
            log(f'{v}: not rendered: {e}')
    finish(a, i, manifest, phon, t0)


def render(v, lines, pipes, phon, manifest, notes, a, KPipeline, np, sf):
    """One voice: every line, one after another with a pause between, to one MP3."""
    lang = v[0]
    if lang not in pipes:
        pipes[lang] = KPipeline(lang_code=lang, repo_id='hexgrad/Kokoro-82M')
    pipe, chunks, segs, t, tv = pipes[lang], [], [], 0.0, time.time()
    for L in lines:
        parts, ps = [], []
        for r in pipe(spoken(L['text']), voice=v, speed=a.speed):
            if r.audio is not None:
                parts.append(r.audio.detach().cpu().numpy() if hasattr(r.audio, 'detach') else np.asarray(r.audio))
            ps.append(r.phonemes)
        audio = np.concatenate(parts) if parts else np.zeros(1, dtype=np.float32)
        segs.append([round(t, 3), round(t + len(audio) / SR, 3)])
        chunks += [audio, np.zeros(int(GAP * SR), dtype=np.float32)]
        t += len(audio) / SR + GAP
        if L['kind'] != 'intro':
            phon.setdefault(L['id'], {})[v] = ' '.join(ps)
    wav = os.path.join(a.out, v + '.wav')
    sf.write(wav, np.concatenate([np.zeros(int(0.3 * SR), dtype=np.float32)] + chunks), SR)
    segs = [[round(s + 0.3, 3), round(e + 0.3, 3)] for s, e in segs]
    mp3 = os.path.join(a.out, v + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', mp3], check=True)
    os.remove(wav)
    manifest['voices'].append({'id': v, 'accent': {'a': 'American', 'b': 'British'}[lang], 'gender': {'f': 'female', 'm': 'male'}[v[1]],
                               'grade': notes.get(v, {}).get('grade', ''), 'traits': notes.get(v, {}).get('traits', ''),
                               'file': v + '.mp3', 'segments': segs, 'length': round(t + 0.3, 2)})
    log(f'{v}: {t:.0f} s of speech in {time.time() - tv:.0f} s')


def finish(a, i, manifest, phon, t0):
    with open(os.path.join(a.out, f'manifest-{i}.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    with open(os.path.join(a.out, f'phonemes-{i}.txt'), 'w', encoding='utf-8') as f:
        for lid, by in phon.items():
            f.write(f'## {lid}\n')
            for v, p in by.items():
                f.write(f'{v}\t{p}\n')
    log(f'done in {time.time() - t0:.0f} s')
    # The call letters as one voice read them, for a check by eye; every voice's are in phonemes-*.txt.
    for lid, by in phon.items():
        if lid.endswith(':id'):
            log(f"{lid}: {next(iter(by.values()))}")


if __name__ == '__main__':
    main()
