import json, statistics, re
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

exec(open('stations.py', encoding='utf-8').read())
raw = json.load(open('ia_audio_survey_raw.json', encoding='utf-8'))
rdj = json.load(open('readiness_raw.json', encoding='utf-8'))
ex = json.load(open('extras.json', encoding='utf-8'))
cols = json.load(open('collections_classified.json', encoding='utf-8'))
RD, RESTR, G = rdj['rd'], ex['restricted'], ex['global']
SP = raw['specials']
DET = 'https://archive.org/details/'
AS_DATE = '25 Nov 2026'

HEAD_FILL = PatternFill('solid', fgColor='F3F3F3')
TITLE_FONT = Font(bold=True, size=13)
BOLD = Font(bold=True)
WRAP = Alignment(wrap_text=True, vertical='top')
TOP = Alignment(vertical='top')
LINK_FONT = Font(color='1155CC', underline='single')

def sheet(wb, name, title, headers, rows, widths, wrap_cols=(), links=None, first=False, note=None):
    ws = wb.active if first else wb.create_sheet()
    ws.title = name
    ws['A1'] = title; ws['A1'].font = TITLE_FONT
    r0 = 2
    if note:
        ws['A2'] = note; ws['A2'].alignment = Alignment(wrap_text=False)
        r0 = 4  # empty row between the note and the table header
    for j, h in enumerate(headers, 1):
        c = ws.cell(row=r0, column=j, value=h); c.font = BOLD; c.fill = HEAD_FILL; c.alignment = WRAP
    for i, row in enumerate(rows, r0 + 1):
        for j, v in enumerate(row, 1):
            c = ws.cell(row=i, column=j, value=v)
            c.alignment = WRAP if (j - 1) in wrap_cols else TOP
            if isinstance(v, int) and not isinstance(v, bool): c.number_format = '#,##0'
            if isinstance(v, float): c.number_format = '0%'
        if links:
            for j, url in links(i - r0 - 1).items():
                if url:
                    c = ws.cell(row=i, column=j); c.hyperlink = url; c.font = LINK_FONT
    for j, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(j)].width = w
    ws.freeze_panes = ws.cell(row=r0 + 1, column=1)
    return ws, r0

def fmt_len(h):
    if h is None: return ''
    m = h * 60
    if m < 1.5: return f'{round(m * 60)} sec'
    if m < 90: return f'{round(m)} min'
    return f'{h:.1f} hr'

def sig2(x):
    if x <= 0: return '0'
    if x < 10: return f'{x:.0f}'
    p = 10 ** (len(str(int(x))) - 2)
    return f'{int(round(x / p) * p):,}'

# ---------------- Station ideas
SOURCES = {
 'conelrad': 'keyword search across all audio (no dedicated collection)', 'mission': 'nasaaudiocollection',
 'wartime': 'wwIIarchive-audio, armedforcesradioservice, oldtimeradio (news and war titles)', 'gavel': 'uscourtsoralarguments',
 'topofhour': 'nprtopofthehour, VOANewscasts, cbsradio-podcasts, bbc-world-service-newshour, pris-the-world, freespeechradionews',
 'timemachine': 'radio (534 "Radio-…" station collections)', 'nightwatch': 'artbellshows, plus Coast to Coast AM uploads',
 'classictalk': 'title, creator and subject searches for named hosts', 'listener': 'radio4all_net, wings-radio, freespeechradionews, kpfa_podcasts, pacifica_radio_archives, other_minds, afropop_worldwide',
 'airchecks': 'airchecks, airchecks-misc, layfayette-radio, kornradio, kornamradio, wfmuaircheck',
 'collegeradio': 'wuvtfm, kcsb-radio, kfjc-fm, whpk-radio, weftarchive, kwvaarchive, collegeradio, middlebury-college-radio',
 'phone': 'phonephreaking, prankcallarchive, contra-recordings',
 'worldband': 'shortwavearchives, shortwave-airchecks, shortwave-radio-audio-archive, echo-of-moscow, radio-ceylon, radio-free-europe-afghan, voaourworld, voa-music-time-in-africa, wavescan, dx-extra',
 'numbers': 'irdial (The Conet Project), pirateradioairchecks, numbers-station tags', 'pyongyang': 'vokarchive', 'hamshack': 'dlarc, dlarc-podcasts',
 'scanner': 'scanner_recordings, dis-perse-dispatch', 'worldradio': 'radio programs (excluding live captures) tagged with a language other than English',
 'esperanto': 'radio programs tagged Esperanto', 'horspiel': 'germanradio, radioaufnahmen, radio-drama tags in other languages',
 'vnstories': 'audiobook_viet, truyenaudioarchive, goc-truyen-audio', 'gospelradio': 'oldtimeradio items with religious tags, named programs',
 'sacred78': '78rpm, 1925 or earlier, sacred tags', 'sermons': 'audio_sermons, sermonindex', 'quran': 'audio_islamic',
 'mandatory': 'industry-archives-audio, educationalfilmstrips, filmstrip_archive, instructional tags', 'languagelab': 'FSI, Linguaphone and Learning English titles and tags',
 'shoppers': 'attentionkmartshoppers, gapmusic, Muzak and beautiful-music tags', 'lecturehall': 'naropa, noamchomskyaudioconservatory, longnow',
 'oralhistory': 'californiarevealed, sfstatelaborarchives, csusacramento, huntingtonlibrary, wyoming_state_archives, manzanar, oaklandhistoryroom, oral-history tags',
 'poetry': 'librivoxaudio (poetry), audiolibrary, pocket-fields', 'audiodrama': 'worldsofadventure, quality-radio-productions, cragglive, zenq-sounds, audio-drama tags',
 'cylinders': 'edison-recordings, cylindertransfer, cylinder tags', 'jukebox': '78rpm items tagged "National Jukebox" (Library of Congress)',
 'opera78': '78rpm, 1925 or earlier, opera and voice tags', 'dance78': '78rpm, 1925 or earlier, dance and jazz tags',
 'ethnic78': '78rpm, 1925 or earlier, language and origin tags', 'comedy78': '78rpm, 1925 or earlier, comedy and novelty tags',
 'holiday': '78rpm Christmas sides, LibriVox Christmas titles', 'lma': 'etree (Live Music Archive)', 'jamendo': 'jamendo-albums',
 'netlabels': 'netlabels, freemusicarchive', 'soundscape': 'radio-aporee-maps, hamiltonbioacousticsfieldrecordings',
 'fieldtrip': 'helenhartnessflanders, lomaxky, uclaethnomusicologyarchive, arabandalusian, charlesdebevec', 'mallsoft': 'vaporwave, vapor-vault',
 'podcasts': 'podcasts, podcasts_mirror and related mirrors'}
EXAMPLE = {'conelrad': ('otr_civildefensewithorsonwelles', 'Civil Defense with Orson Welles (1956)'),
           'classictalk': ('JeanShepherd1965Pt1', 'Jean Shepherd, 1965 shows (part 1)'),
           'mandatory': ('U.S._Armed_Forces_Institute_Basic_Radio_Code_ca1942', 'U.S. Armed Forces Institute Basic Radio Code (ca. 1942)'),
           'hamshack': ('WD8LQB_Morse_Code_Learning_Podcast', 'WD8LQB Morse Code Learning Podcast'),
           'sermons': ('sermonindex', 'SermonIndex collection'), 'jukebox': None}
# language-facet based pools
lra = dict((k, v) for k, v in SP['langRadioArchival']['langs'])
non_en = sum(v for k, v in lra.items() if not re.match(r'(?i)^(english|handwritten english|eng)', k))
FACET_N = {'worldradio': non_en, 'esperanto': lra.get('Esperanto', 0)}

srows, slinks = [], []
order = ['Strong', 'Promising', 'Possible', 'Caution']
for st in STATIONS:
    k = st['key']; r = RD[k]
    n = FACET_N.get(k, r['n'])
    restr = RESTR.get(k, 0)
    share = (restr / r['n']) if r['n'] and k not in FACET_N else None
    sm = [x for x in r['samples'] if 'secs' in x]
    hrs = [x['secs'] / 3600 for x in sm]
    med = statistics.median(hrs) if hrs else None
    mean = statistics.mean(hrs) if hrs else None
    typical = fmt_len(med) if med else ''
    if k in FACET_N: typical, rough = '', 'plenty (thousands of items)' if n > 10000 else ''
    elif k == 'mission':
        typical, rough = 'about 8 hr (Apollo 11 control-room channels)', 'over 11,000 (Apollo 11 channels alone)'
    elif r['n'] > 10000: rough = 'plenty (over 10,000 items)'
    elif med is not None:
        lo, hi = sig2(r['n'] * med), sig2(r['n'] * mean)
        rough = lo if lo == hi else lo + ' – ' + hi
    else: rough = ''
    if k == 'pyongyang': typical = 'about 30 sec'
    exm = EXAMPLE.get(k, '')
    if exm is None or exm == '':
        t0 = r['top'][0] if r['top'] else None
        exm = (t0['id'], t0['t']) if t0 else ('', '')
    srows.append([st['name'], st['verdict'], st['plays'], n, share if share is not None else '', st['rights'], typical, rough, st['group'], st['dial'], st['note'], SOURCES[k], exm[1], r['q']])
    slinks.append({13: DET + exm[0] if exm[0] else None})
idx = sorted(range(len(srows)), key=lambda i: (order.index(srows[i][1]), STATIONS[i]['group'], srows[i][0]))
srows = [srows[i] for i in idx]; slinks = [slinks[i] for i in idx]

wb = Workbook()
ws, r0 = sheet(wb, 'Station ideas', f'Station ideas for Skywave from the Internet Archive\'s audio (counts as of {AS_DATE})',
      ['Station idea', 'Verdict', 'What it would play', 'Archive items', 'Stream-only share', 'Rights picture', 'Typical item length', 'Rough hours (low – high)', 'Theme', 'Suggested dial spot', 'Notes', 'Main source collections', 'Example item', 'Search used (Archive query)'],
      srows, [26, 11, 52, 12, 11, 44, 14, 20, 26, 28, 60, 44, 40, 60], wrap_cols=(2, 5, 10, 11), links=lambda i: slinks[i], first=True)

# ---------------- Audio map
water = SP['water']
desc = {
 'Live station captures (stream-only, 2016 onward)': ('Hourly recordings of 534 AM and FM stations (news-talk, public, religious, BBC, VOA), 2016 to 2026; the Archive offers them for streaming only', 'radio, radio_asr, Radio-BBC-World-Service, Radio-VOA-Global-English, Radio-KQED-88-5-FM'),
 'Podcasts': ('Mirrored podcast feeds; about half are stream-only', 'podcasts, podcasts_mirror, podcasts_miscellaneous'),
 'Radio programs, station archives & airchecks': ('Old-time radio, station and community-radio archives worldwide, college radio, airchecks', 'radiostationarchives, radioshowarchive, wuvtfm, airchecks, radio24, oldtimeradio'),
 'Religion & spirituality': ('Sermons, Quran recitation, lessons and devotional audio', 'audio_sermons, audio_islamic, sermonindex'),
 'Music (78s, LPs, CC labels, uploads)': ('Digitized 78s and LPs, Creative Commons labels, user music uploads', '78rpm, georgeblood, jamendo-albums, hifidelity, netlabels, vaporwave'),
 'Audiobooks, stories & poetry': ('LibriVox, Vietnamese and Russian audiobooks, podfic', 'audiobook_viet, audio_bookspoetry, truyenaudioarchive, librivoxaudio'),
 'News, public affairs & court audio': ('Court oral arguments, community-radio news exchange, public affairs', 'uscourtsoralarguments, radio4all_net, audio_news'),
 'Field recordings & sound maps': ('Geotagged field recordings', 'radio-aporee-maps'),
 'Amateur radio & communications': ('Amateur-radio audio and podcasts', 'dlarc'),
 'Other Folksoundomy (sorted community uploads)': ('Community uploads the Archive has sorted by subject', 'folksoundomy subcollections'),
 'Community Audio (unsorted uploads)': ('Anyone\'s uploads with no further sorting; every category appears here', 'opensource_audio'),
}
mrows = []
for label, n, _q in water:
    d, c = desc[label]
    mrows.append([label, n, None, d, c])
rem = SP['remainder']
mrows.append(['Everything else', rem['n'], None, 'Smaller personal and institutional collections, audio pulled from video, AI-generated audio', ', '.join(x[0] for x in rem['cols'][:6])])
ws, r0 = sheet(wb, 'Audio map', f'Where the {sum(r[1] for r in mrows):,} audio items live: each item counted once (as of {AS_DATE})', ['Part of the catalog', 'Items', 'Share', 'What is in it', 'Biggest collections'],
      mrows, [44, 13, 9, 70, 60], wrap_cols=(3, 4))
first, last = r0 + 1, r0 + len(mrows)
for i in range(first, last + 1):
    ws.cell(row=i, column=3, value=f'=B{i}/B{last + 1}').number_format = '0.0%'
ws.cell(row=last + 1, column=1, value='All audio items').font = BOLD
c = ws.cell(row=last + 1, column=2, value=f'=SUM(B{first}:B{last})'); c.number_format = '#,##0'; c.font = BOLD
ws.cell(row=last + 1, column=3, value=f'=B{last + 1}/B{last + 1}').number_format = '0.0%'
ws.cell(row=last + 3, column=1, value='Separately: Live Music Archive concerts (their own media type)')
ws.cell(row=last + 3, column=2, value=G['etree']).number_format = '#,##0'
cut0 = last + 6
ws.cell(row=cut0 - 1, column=1, value='Other ways to slice all audio').font = TITLE_FONT
for j, h in enumerate(['Slice', 'Items', 'Share'], 1):
    cc = ws.cell(row=cut0, column=j, value=h); cc.font = BOLD; cc.fill = HEAD_FILL
cuts = [('Dated 1925 or earlier (public domain if a US recording)', G['y1925']), ('Dated 1926–1972', G['y1926_72']), ('Dated 1973–1999', G['y1973_99']), ('Dated 2000 or later', G['y2000p']),
        ('No date', G['total'] - G['y1925'] - G['y1926_72'] - G['y1973_99'] - G['y2000p']), ('Creative Commons license (any)', G['cc']), ('…of which CC0 or public-domain mark', G['ccpd']),
        ('Stream-only on the Archive (access-restricted)', G['restricted']), ('Has a language tag', G['withLang'])]
for i, (lab, v) in enumerate(cuts, cut0 + 1):
    ws.cell(row=i, column=1, value=lab); ws.cell(row=i, column=2, value=v).number_format = '#,##0'
    ws.cell(row=i, column=3, value=f'=B{i}/{G["total"]}').number_format = '0.0%'
ws.cell(row=cut0 + len(cuts) + 1, column=1, value=f'Slices are of all {G["total"]:,} audio items; dates come from the Archive\'s year field, which for uploads is sometimes the upload year.')

# ---------------- Formats
GROUPS = {'gov': 'Government & civil defense', 'talk': 'Talk, news & public radio', 'intl': 'International & shortwave', 'rel': 'Religion', 'eph': 'Instructional & ephemeral',
          'spoken': 'Spoken word', 'music': 'Music', 'sound': 'Sound & place', 'pod': 'Podcasts & community uploads'}
UMB = {'radioprograms', 'radio', 'radio_asr', 'podcasts', 'podcasts_mirror', 'podcasts_mirror_bobarchives', 'podcasts_mirror_godane', 'podcasts_miscellaneous', 'opensource_audio', 'folksoundomy', 'audio_music', 'audio_religion', 'stream_only'}
frows, flinks = [], []
for p in raw['probeDefs']:
    x = raw['probes'][p[1]]; e = x['era']
    topc = ', '.join(f'{c0} ({n0:,})' for c0, n0, _t in x['cols'] if c0 not in UMB)[:400]
    t0 = x['top'][0] if x['top'] else None
    frows.append([GROUPS[x['g']], x['label'], x['total'], x['total'] - x['streamOnly'], x['cc'], e['pre1926'], e['y1926_46'] + e['y1947_72'], e['y1973_99'], e['y2000p'], e['noYear'], topc, t0['t'] if t0 else '', x['q']])
    flinks.append({12: DET + t0['id'] if t0 else None})
sheet(wb, 'Formats', f'How much of each format the Archive holds: keyword searches of tags and titles (as of {AS_DATE})',
      ['Theme', 'Format searched', 'Items matching', 'Excluding live station captures', 'Creative Commons', 'Dated 1925 or earlier', 'Dated 1926–1972', 'Dated 1973–1999', 'Dated 2000 on', 'Undated', 'Where they cluster (collection, items)', 'Most-downloaded match', 'Search used (Archive query)'],
      frows, [24, 40, 12, 14, 12, 11, 11, 11, 11, 11, 70, 44, 70], wrap_cols=(10,), links=lambda i: flinks[i],
      note='Matches overlap and include noise (e.g. "opera" also finds "The Phantom of the Opera" audiobooks), so read these as upper bounds; the Station ideas sheet uses tighter searches.')

# ---------------- Collections
CAT_ORDER = ['Radio: old-time radio & vintage shows', 'Radio: talk & public radio', 'Radio: airchecks, jingles & DJ shows', 'Radio: international, shortwave & amateur',
             'Radio: station & program archives', 'Radio: live station captures (stream-only)', 'News & newscasts', 'Government, courts & public records', 'Religion & spirituality',
             'Spoken word: audiobooks & stories', 'Spoken word: lectures, oral history & readings', 'Instructional & ephemeral', 'Music: 78s & cylinders', 'Music: LPs & digitized records',
             'Music: live concerts', 'Music: Creative Commons & netlabels', 'Music: other uploads & genre collections', 'Field recordings & soundscapes', 'Podcasts',
             'Audio from video, TV & games', 'Umbrella & community-upload collections', 'Other / unclassified']
crow, clinks = [], []
for o in sorted(cols, key=lambda o: (CAT_ORDER.index(o['cat']), -o['n'], o['id'].lower())):
    how = 'size ranking' if o['src'] == 'facet' else ('theme search: ' + o['src'].split(':', 1)[1].replace('_', ' ') if o['src'].startswith('theme:') else 'stream-only station list')
    crow.append([o['cat'], o['id'], o['t'], o['n'], ', '.join(o['parents']), how])
    clinks.append({2: DET + o['id']})
sheet(wb, 'Collections', f'Every audio collection found: {len(crow):,} collections, sorted by category and size (as of {AS_DATE})',
      ['Category', 'Collection ID', 'Title', 'Audio items', 'Parent collections', 'How it was found'],
      crow, [40, 34, 50, 12, 44, 26], links=lambda i: clinks[i],
      note='Includes every collection holding at least about 1,300 audio items, plus smaller ones found by theme searches and the full list of live-capture stations. An item can sit in several collections, so the counts overlap.')

# ---------------- Languages
def lang_map(lst): return {k: v for k, v in lst}
la = lang_map(SP['langAll']['langs']); lr = lang_map(SP['langRadioArchival']['langs']); lc = lang_map(SP['langCaptures']['langs'])
lp = lang_map(SP['pods']['language']); lco = lang_map(SP['community']['language'])
names = sorted(set(la) | set(lr), key=lambda k: -(la.get(k, 0)))
lrows = [[k, la.get(k) or '', lr.get(k) or '', lc.get(k) or '', lp.get(k) or '', lco.get(k) or ''] for k in names]
sheet(wb, 'Languages', f'Audio by language tag (only {G["withLang"]:,} of {G["total"]:,} items carry one)',
      ['Language tag', 'All audio', 'Radio programs (not captures)', 'Live station captures', 'Podcasts', 'Community Audio uploads'],
      lrows, [26, 13, 16, 14, 12, 14],
      note='Tags are as the Archive stores them ("Vi" is probably Vietnamese). Blank means the language was not among the top tags for that column.')

# ---------------- Public-domain 78s
DROP = {'78rpm', '78 rpm', '78-rpm', 'digital preservation', 'disc recording', 'library of congress', 'national jukebox', 'acoustic recording', 'lp'}
prow = [[k, v] for k, v in SP['pd78']['subj'] if k.lower() not in DROP][:70]
arow = SP['pd78']['creators'][:40]
ws, r0 = sheet(wb, 'Public-domain 78s', f'The {SP["pd78"]["total"]:,} 78 rpm sides dated 1925 or earlier: tags and artists',
      ['Tag on the record', 'Sides'], prow, [34, 10],
      note='These sides are public domain in the US. One side can carry several tags. "ethnic characterizations" marks minstrel and dialect material.')
ws.cell(row=r0, column=5, value='Artist').font = BOLD; ws.cell(row=r0, column=5).fill = HEAD_FILL
ws.cell(row=r0, column=6, value='Sides').font = BOLD; ws.cell(row=r0, column=6).fill = HEAD_FILL
for i, (a, v) in enumerate(arow, r0 + 1):
    ws.cell(row=i, column=5, value=a); ws.cell(row=i, column=6, value=v).number_format = '#,##0'
ws.column_dimensions['C'].width = 3; ws.column_dimensions['D'].width = 3; ws.column_dimensions['E'].width = 32; ws.column_dimensions['F'].width = 10

# ---------------- Live captures
def hint(t):
    tl = t.lower()
    if 'bbc' in tl: return 'BBC'
    if 'voa' in tl or 'voice of america' in tl: return 'Voice of America'
    if re.search(r'npr|public radio|kqed|wnpr|kpcc|kpbs|wabe|kcfr|kalw|krcc|kazu|wual|woub|wlrh', tl): return 'Public radio'
    if re.search(r'catholic|christian|bible|faith|gospel|family|moody|salem|grace|church|bott|relevant|joy|life|praise|word|hope|k-love|air1', tl): return 'Religious'
    if re.search(r'news|talk|patriot|answer|fox', tl): return 'News / talk'
    if re.search(r'sport|espn|fan\b|ticket', tl): return 'Sports'
    if re.search(r'\bla\b|radio [a-z]+ \d|poderosa|buena|mejor|familia|tropical|romántica|caliente|mega|exitos|éxitos|ke buena|que buena', tl): return 'Spanish-language'
    return ''
cap = sorted(SP['stations'], key=lambda x: -x[1])
def from_id(sid):
    m = re.match(r'Radio-(.+?)-(\d+(?:-\d+)?)-(AM|FM)(.*)$', sid)
    if not m: return sid.replace('Radio-', '').replace('-', ' ')
    call, freq, band, rest = m.groups()
    return f"{call.replace('-', ' ')} {freq.replace('-', '.')} {band}{rest.replace('-', ' ')}"
caprows = [[sid, t or from_id(sid) + ' (name read from the collection ID)', n, hint(t or '')] for sid, n, t in cap]
sheet(wb, 'Live captures', f'The {len(caprows)} stations in the Archive\'s stream-only radio captures, 2016 to 2026',
      ['Station collection', 'Station (as titled on the Archive)', 'Hour-long recordings', 'Format hint (only where the station\'s name says)'],
      caprows, [36, 60, 14, 22], links=lambda i: {1: DET + caprows[i][0]},
      note='Every item here is stream-only on the Archive. Files did load directly in a test, but playing them in Skywave would sidestep that restriction.')

# ---------------- Method
mrows2 = [
 ['What this is', 'A survey of every audio item in the Internet Archive\'s search index, organized to find material for new Skywave stations. Nothing was listened to; it works from the catalog\'s own metadata.'],
 ['When', f'All counts were taken on {AS_DATE}, over about an hour, through the Archive\'s public search and metadata APIs. The catalog grows daily (the audio total rose by about 50 items during the survey), so counts drift.'],
 ['Scope', f'{G["total"]:,} items of media type "audio", plus {G["etree"]:,} Live Music Archive concerts, which the Archive files under their own media type.'],
 ['Audio map', 'Each item counted once, in the first matching part of the list (top to bottom), so the parts add up to the total. The order decides where overlapping items land: a podcast that is also a radio show counts as a podcast.'],
 ['Formats', 'Keyword searches of each item\'s subject tags and title (some also its description). Matches overlap and include noise, so treat them as upper bounds.'],
 ['Collections', 'Every collection holding at least about 1,300 audio items, from the search index\'s category counts, plus smaller collections found by searching collection descriptions for each theme, plus all 534 live-capture stations. Categories were assigned by rules and hand corrections; the counts for smaller collections can be off by a few hundred.'],
 ['Station ideas', 'Each idea has a tighter search (last column) whose count, share of stream-only items and rights signals were measured. Typical item length is the median of five randomly chosen items; for pools over 10,000 items the five come from the first 10,000 in identifier order, so treat it as a rough guide.'],
 ['Rough hours', 'Shown only for pools under 10,000 items: items × median sampled length (low) to items × mean sampled length (high). With five samples, read it as an order of magnitude.'],
 ['Stream-only', 'The Archive marks some items "access-restricted": it streams them on its own site but offers no download. In a test, files of such items still loaded and decoded when requested directly, but using them in Skywave would sidestep the Archive\'s restriction.'],
 ['Rights', 'US-centric and not legal advice. US recordings published in 1925 or earlier are public domain. Under the 2018 Music Modernization Act, recordings published 1923–1946 are protected for 100 years and 1947–1956 for 110 years; unpublished and later pre-1972 recordings until 15 February 2067. US-government works (NASA, VOA, FSI, federal courts) are generally public domain. Creative Commons licenses vary, and many forbid commercial use.'],
 ['Languages', f'Only {G["withLang"]:,} of {G["total"]:,} audio items carry a language tag, and tags mix names and codes, so language counts understate non-English audio.'],
 ['Verdict: Strong', 'Enough material for a 24-hour station without obvious repeats, files that play directly, and clean or low-risk rights (public domain, US government, Creative Commons, or shared by its makers).'],
 ['Verdict: Promising', 'Plenty of material, but rights unverified or mixed, or some curation needed. The current old-time-radio stations are on this footing.'],
 ['Verdict: Possible', 'Thin or scattered; better as a segment, interval feature or part-time block.'],
 ['Verdict: Caution', 'Playable, but stream-only on the Archive or carrying privacy or rights problems worth settling first.'],
]
sheet(wb, 'Method', 'How the survey was done, and what limits it', ['Topic', 'Note'], mrows2, [22, 120], wrap_cols=(1,))

wb.save('skywave_ia_audio_survey.xlsx')
cells = sum(ws.max_row * ws.max_column for ws in wb.worksheets)
print('saved; sheets:', [ws.title for ws in wb.worksheets], 'approx cells:', cells, 'station rows', len(srows), 'collections', len(crow), 'formats', len(frows), 'langs', len(lrows), 'captures', len(caprows))
print('links:', sum(1 for l in slinks if l.get(13)) + sum(1 for l in flinks if l.get(12)) + len(clinks) + len(caprows))
print('verdicts:', {v: sum(1 for r in srows if r[1] == v) for v in order})
print('non-English radio-program items (tag-based):', non_en, '| Esperanto:', FACET_N['esperanto'])
