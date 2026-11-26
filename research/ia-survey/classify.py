import json, re
from collections import Counter
d = json.load(open('ia_audio_survey_raw.json', encoding='utf-8'))
meta = d['meta']; S = d['specials']
cols = {c['id']: {'id': c['id'], 'n': c['n'], 't': c['t'] or (meta.get(c['id'], {}).get('t') or ''), 'src': 'facet'} for c in d['cols']}
for theme, items in d['cf']['found'].items():
    for x in items:
        n = d['cf']['counts'].get(x['id'], 0)
        if n > 0 and not x['id'].startswith('fav-'):
            if x['id'] not in cols: cols[x['id']] = {'id': x['id'], 'n': n, 't': x['t'], 'src': 'theme:' + theme}
            cols[x['id']].setdefault('theme', theme)
for sid, n, t in S['stations']:
    if sid not in cols: cols[sid] = {'id': sid, 'n': n, 't': t, 'src': 'captures'}
for sid, n, t in S['captureOtherCols']:
    if sid not in cols and not sid.startswith('fav-'): cols[sid] = {'id': sid, 'n': n, 't': t, 'src': 'captures'}
K = {
 'CAP': 'Radio: live station captures (stream-only)', 'ARCH': 'Radio: station & program archives', 'OTR': 'Radio: old-time radio & vintage shows',
 'AIR': 'Radio: airchecks, jingles & DJ shows', 'TALK': 'Radio: talk & public radio', 'SW': 'Radio: international, shortwave & amateur',
 'NEWS': 'News & newscasts', 'GOV': 'Government, courts & public records', 'REL': 'Religion & spirituality',
 'BOOK': 'Spoken word: audiobooks & stories', 'TALKS': 'Spoken word: lectures, oral history & readings',
 'EPH': 'Instructional & ephemeral', 'M78': 'Music: 78s & cylinders', 'MLP': 'Music: LPs & digitized records',
 'MLIVE': 'Music: live concerts', 'MCC': 'Music: Creative Commons & netlabels', 'MUS': 'Music: other uploads & genre collections',
 'FIELD': 'Field recordings & soundscapes', 'POD': 'Podcasts', 'VID': 'Audio from video, TV & games',
 'UMB': 'Umbrella & community-upload collections', 'OTHER': 'Other / unclassified'}
MAN = {
 'radioprograms': 'UMB', 'radio': 'CAP', 'radio_asr': 'CAP', 'radio-sub-collection-1': 'CAP', 'stream_only': 'CAP', 'opensource_audio': 'UMB', 'folksoundomy': 'UMB',
 'audio_music': 'UMB', 'audio_religion': 'REL', 'audio_news': 'NEWS', 'audio_bookspoetry': 'BOOK', 'audio_foreign': 'UMB', 'audio_tech': 'TALKS', 'audio': 'UMB',
 'radiostationarchives': 'ARCH', 'radioshowarchive': 'OTR', 'radioshowinbox': 'OTR', 'radioprograms_contributions': 'OTR', 'patron-library-collection': 'UMB',
 'ourmedia': 'UMB', 'community': 'UMB', 'loggedin': 'UMB', 'opensource': 'UMB', 'low_metadata': 'UMB', 'deemphasize': 'UMB', 'americana': 'UMB', 'geo_restricted': 'UMB',
 'the_stacks': 'UMB', 'godaneinbox': 'UMB', 'no-preview': 'UMB', 'whisper_test': 'UMB', 'individual-image-collections': 'UMB', 'europeanlibraries': 'GOV',
 'alfirdwsiy1433': 'REL', 'alfirdwsiy2018': 'REL', 'attabligarchive': 'REL', 'iskcon-hawaii': 'REL', 'spiritualityandreligion': 'REL', 'folkscanomy_religion': 'REL', 'jewish-theological-seminary': 'REL', 'rabieaaa2022': 'REL',
 'fringe': 'TALKS', 'social-media-video': 'VID', 'additional_collections_video': 'VID', 'social-media-video-unsorted': 'VID', 'mirrortube': 'VID', 'vhsvault': 'VID', 'television': 'VID', 'television_inbox': 'VID', 'anime': 'VID', 'twitchstreams': 'VID', 'audiocommentary': 'VID', 'gdps-editor-2.2': 'VID', 'leagueoflegendeffects': 'VID',
 'pandacd-archive': 'MUS', 'generative-art-archive': 'MUS', 'ai-generative-audio': 'MUS', 'offcenter': 'MUS', 'rappratodos': 'MUS', 'icacaarchive': 'MUS', 'equalizing-x-distort': 'MUS', 'remix-nin-com-collection': 'MUS', 'ninbot': 'MUS', 'ninjam': 'MUS', 'tvtunes': 'MUS', 'vaporwave': 'MUS', 'vapor-vault': 'MUS', 'iuma-archive': 'MUS', 'acidplanet': 'MUS', 'cratediggers': 'MUS', 'rivet360-audio-collection': 'MUS', 'roiocollection': 'MUS', 'arabandalusian': 'MUS', 'charlesdebevec': 'M78', 'MudritSangeet': 'M78', 'eastvillageradio-the-ragged-phonograph-program': 'M78', 'edison-recordings': 'M78', 'cylindertransfer': 'M78', 'georgeblood': 'M78', 'hessel-digital-library': 'M78', '78klubben': 'M78',
 'audiocitenet': 'BOOK', 'audiobook_viet': 'BOOK', 'truyenaudioarchive': 'BOOK', 'goc-truyen-audio': 'BOOK', 'audioboo_ru': 'BOOK', 'folksoundomy_podfic': 'BOOK', 'librivoxaudio': 'BOOK', 'gutenberg-audiobooks': 'BOOK', 'audiolibrary': 'BOOK', 'radiobooks': 'BOOK',
 'theatreaudioarchive': 'TALKS', 'breadloaf': 'TALKS', 'petersoninstitute': 'TALKS', 'noamchomskyaudioconservatory': 'TALKS', 'HindSwaraj': 'GOV', 'RajivGandhi': 'GOV', 'presidential_recordings': 'GOV', 'cityoffortwayne': 'GOV', 'mayoraudiofiles': 'GOV', 'uscourtsoralarguments': 'GOV', 'nasaaudiocollection': 'GOV', 'nasa': 'GOV', 'industry-archives-audio': 'GOV', 'saudi_cybersecurity_clips': 'OTHER',
 'californiarevealed': 'TALKS', 'sfstatelaborarchives': 'TALKS', 'csusacramento': 'TALKS', 'huntingtonlibrary': 'TALKS', 'wyoming_state_archives': 'TALKS', 'manzanar': 'TALKS', 'mphistorical': 'TALKS', 'oaklandhistoryroom': 'TALKS', 'wwct': 'TALKS', 'other_minds': 'TALK', 'othermindsmusicreferencelibrary': 'MUS',
 'Pacifica_radio_archives_NHPRC1_American': 'TALK', 'pacifica_radio_archives': 'TALK', 'pacifica_radio_archives_cavpp': 'TALK', 'kpfa_podcasts': 'TALK', 'radio4all_net': 'TALK', 'wings-radio': 'TALK', 'freespeechradionews': 'NEWS', 'afropop_worldwide': 'TALK', 'themidday': 'TALK', '2600-off-the-hook': 'TALK', 'billswailshows': 'TALK', 'thechrisvernonshow': 'TALK', 'kentucky-sports-radio': 'TALK', 'artbellshows': 'TALK', 'the-sean-hannity-show': 'TALK', 'alex-jones-radio-show': 'TALK', 'slyinthemorning': 'TALK', 'mischkepodcast': 'TALK', 'opieandanthonyarchive': 'TALK', 'joy-boys': 'OTR', 'davesgoneby': 'OTR', 'cragglive': 'OTR',
 'nprtopofthehour': 'NEWS', 'VOANewscasts': 'NEWS', 'cbsradio-podcasts': 'NEWS', 'bbc-world-service-newshour': 'NEWS', 'pris-the-world': 'NEWS', 'wwIIarchive-audio': 'NEWS', 'radiocaracasradio': 'ARCH',
 'helenhartnessflanders': 'FIELD', 'lomaxky': 'FIELD', 'uclaethnomusicologyarchive': 'FIELD', 'radio-aporee-maps': 'FIELD', 'hamiltonbioacousticsfieldrecordings': 'FIELD', 'aReWrecordings': 'FIELD', 'earthmonkey': 'FIELD', 'thickdescriptionrecordings': 'FIELD', 'birdsong': 'FIELD',
 'attentionkmartshoppers': 'EPH', 'gapmusic': 'EPH', 'educationalfilmstrips': 'EPH', 'filmstrip_archive': 'EPH', 'phonephreaking': 'EPH', 'prankcallarchive': 'EPH', 'contra-recordings': 'EPH', 'scanner_recordings': 'EPH', 'dis-perse-dispatch': 'EPH', 'usc-sound-effect-archive': 'EPH', 'folksoundomy_effects': 'EPH', 'samplecds': 'EPH', 'explodedcdroms': 'EPH', 'cassettetapes': 'UMB',
 'irdial': 'SW', 'vokarchive': 'SW', 'pirateradioairchecks': 'SW', 'shortwave-airchecks': 'SW', 'shortwavearchives': 'SW', 'shortwave-radio-audio-archive': 'SW', 'echo-of-moscow': 'SW', 'radio-ceylon': 'SW', 'voaourworld': 'SW', 'voa-music-time-in-africa': 'SW', 'radio-free-europe-afghan': 'SW', 'fnk-radio': 'SW', 'wavescan': 'SW', 'dx-extra': 'SW', 'hams-radio-japan': 'SW', 'arirang-audio-aircheck': 'SW', 'twiar': 'SW', 'arnewsline': 'SW', 'soldersmoke-podcast': 'SW', 'hamcollege': 'SW', 'world-of-radio': 'SW', 'wia-news': 'SW',
 'etree': 'MLIVE', 'taperssection': 'MLIVE', 'GratefulDead': 'MLIVE', 'jamendo-albums': 'MCC', 'netlabels': 'MCC', 'freemusicarchive': 'MCC',
 'wuvtfm': 'ARCH', 'kcsb-radio': 'ARCH', 'kfjc-fm': 'ARCH', 'whpk-radio': 'ARCH', 'weftarchive': 'ARCH', 'kwvaarchive': 'ARCH', 'collegeradio': 'ARCH', 'radio-KDVS': 'ARCH', 'zoo-zfm': 'ARCH', 'netwaves': 'ARCH',
 'oldtimeradio': 'OTR', 'radioindex': 'OTR', 'theoldtimeradio': 'OTR', 'lumedwards': 'OTR', 'the-suspense-project': 'OTR', 'jackbennyradio': 'OTR', 'ytjdradio': 'OTR', 'armedforcesradioservice': 'OTR', 'bobandraytoaster': 'OTR', 'germanradio': 'OTR', 'radioaufnahmen': 'OTR', 'ohbejoyful': 'OTR', 'worldsofadventure': 'OTR', 'quality-radio-productions': 'OTR',
 'airchecks': 'AIR', 'airchecks-misc': 'AIR', 'layfayette-radio': 'AIR', 'kornradio': 'AIR', 'kornamradio': 'AIR', 'wfmuaircheck': 'AIR', 'cfouradio': 'AIR',
 'dlarc': 'SW', 'dlarc-podcasts': 'SW', 'dlarc-audio': 'SW', 'dlarc-conferences': 'SW',
}

MAN.update({'johnsinclair': 'ARCH', 'acdc': 'MUS', 'sfjazz': 'MLIVE', 'paladinos': 'MLIVE', 'wien-rundspruch': 'SW', 'bob-bruninga-aprs': 'SW', 'caltech': 'TALKS', 'historysanjose': 'TALKS', 'lantermanhouse': 'TALKS', 'orangecountyarchives': 'TALKS', 'pocket-fields': 'TALKS', 'shaleshockmediaarchive': 'TALKS', 'bardcore-archive': 'MUS', 'punknoise': 'MUS', 'black-hoe-recordings': 'MUS', 'antena': 'MUS', 'aventuel-label': 'MUS', 'candymind': 'MUS', 'konkord': 'MUS', 'degelite': 'MUS', 'subterrestrial': 'MUS', 'conversationsaboutgambling': 'POD', 'europeanlibraries': 'UMB', 'tvbarchives': 'VID', 'JaiGyan': 'VID', 'culturalandacademicfilms': 'VID', 'folkscanomy': 'UMB', 'granth-nidhi-library': 'BOOK', 'netfocusuniversal': 'EPH'})
def rule(c, p, t):
    tl = t.lower()
    if c in MAN: return MAN[c]
    if c.startswith('Radio-'): return 'CAP'
    if c.startswith('podcast') or any(x.startswith('podcasts') for x in p): return 'POD'
    if c.startswith('78') or '78rpm' in p or re.search(r'78 ?rpm|cylinder|edison|gramophone|phonograph', tl): return 'M78'
    if c.startswith('hifidelity') or c.startswith('vinyl') or p & {'album_recordings', 'unlockedrecordings', 'hifidelity'} or c in ('album_recordings', 'unlockedrecordings'): return 'MLP'
    if 'etree' in p: return 'MLIVE'
    if 'netlabels' in p or 'jamendo' in c: return 'MCC'
    if p & {'oldtimeradio', 'radioshowarchive'} or re.search(r'old ?time radio|\botr\b', tl): return 'OTR'
    if 'aircheck' in c.lower() or 'airchecks' in p or 'aircheck' in tl: return 'AIR'
    if c.startswith('dlarc') or 'dlarc' in p or re.search(r'shortwave|short wave|pirate radio|amateur radio|ham radio|numbers station', tl): return 'SW'
    if p & {'audio_religion', 'audio_sermons', 'audio_islamic'} or re.search(r'sermon|church|quran|qur.an|islam|bible|gospel|ministr|dharma|buddh|christian|baptist|catholic|torah|hindu|devotional|mosque|masjid|prayer|tafsir|nasheed|vedic|gurbani|kirtan|ربيع|إسلام|القرآن', tl): return 'REL'
    if p & {'audio_bookspoetry', 'librivoxaudio'} or re.search(r'audiobook|audio book|truyen|truyện|podfic|librivox|livre audio|hörbuch|audiolibro|audio ?stories', tl): return 'BOOK'
    if 'podcast' in tl: return 'POD'
    if p & {'audio_news', 'newsandpublicaffairs'} or re.search(r'\bnews\b|newscast|noticias|nyheder', tl): return 'NEWS'
    if re.search(r'talk radio|pacifica|kpfa|\bnpr\b|public radio|talk show', tl): return 'TALK'
    if p & {'radiostationarchives', 'collegeradio', 'community-radio'} or re.search(r'\bradio\b|radyo|rádio|ràdio|\bfm\b|\bam\b', tl): return 'ARCH'
    if re.search(r'oral histor|lecture|university|college|historical society|museum|state archives|library|conference|seminar', tl): return 'TALKS'
    if re.search(r'court|nasa|city of|mayor|presidential|government|congress|senate', tl): return 'GOV'
    if re.search(r'field record|soundscape|sound map|bioacoust|birdsong|nature sound', tl): return 'FIELD'
    if re.search(r'video|television|\btv\b|youtube|twitch|anime|vhs|game|commentary', tl): return 'VID'
    if p & {'audio_music'} or c.startswith('folksoundomy_music') or re.search(r'music|records|label|\bband\b|discograph|mixtape|album|songs|remix|vaporwave|tapes|beats|sound', tl): return 'MUS'
    if c.startswith('folksoundomy') or c.startswith('folkscanomy'): return 'UMB'
    return 'OTHER'
out = []
for c in cols.values():
    m = meta.get(c['id'], {}); p = set(m.get('p', []))
    k = 'TALKS' if c['id'].startswith('ddr-densho') else rule(c['id'], p, (c['t'] or '') + ' ' + (m.get('d', '') or '')[:150])
    out.append(dict(c, cat=K[k], code=k, parents=[x for x in m.get('p', []) if x != 'audio'][:3], public=c['id'] in meta, lang=m.get('l', ''), desc=(m.get('d', '') or '')[:180]))
out.sort(key=lambda o: (-o['n']))
json.dump(out, open('collections_classified.json', 'w', encoding='utf-8'), ensure_ascii=False)
cc = Counter(o['code'] for o in out)
print(len(out), 'collections;', ' '.join(f'{k}:{v}' for k, v in cc.most_common()))
for code in ('OTHER', 'MUS', 'ARCH', 'GOV', 'TALKS', 'REL'):
    xs = [o for o in out if o['code'] == code][:28]
    print(f'\n[{code}] ' + ' | '.join(f"{o['n']} {o['id']} «{o['t'][:30]}»" for o in xs))
