# The limiter on real recordings (27 Nov 2026)

The page's limiter lets a recording come up as much as 6 dB past its −1 dBTP headroom, taking those peaks. Before it plays on air, this checks what it does to the 50 recordings that lean on it most (`files.json`: per pool, the most gain past their headroom, then the quietest; 12 78s, 8 stories, 8 poems, 8 movements of works, 14 others; 8.5 hours). Each went through Chrome's own limiter, offline, on GitHub's servers (`tools/limiter_check.js`, results in `results.json`), at its levels-table gain, at the page's setting and three others. What the limiter does was read sample by sample, from a constant run through it beside each recording.

Criteria set before the run: no sample out over 0 dBFS; the median recording more than 3 dB down under 1% of the time, and none over 5%; the music around the peaks (samples more than 6 dB under the threshold) losing a median under 0.3 dB, and none over 1 dB.

## What it found

- **It keeps peaks under full scale.** The highest sample out of any recording is −0.33 dBFS (the median recording's, −0.92). With the threshold at −1 dBFS instead of −2, 23 of the 50 let peaks over 0 dBFS (to +0.42): Chrome's limiter lets the sharpest clicks about 1.5 dB past its threshold, hence −2.
- **It works rarely.** The median recording has more than 1 dB taken off 0.15% of the time and more than 3 dB 0.02%; across all 8.5 hours, 0.54% and 0.065%. The busiest is a LibriVox reading of *Beauty and the Beast* (more than 1 dB 4.7% of the time), and the most time over 3 dB is a poem, at 0.57%. More than 6 dB comes off at most 0.01% of the time.
- **The music around the peaks loses next to nothing:** a median 0.01 dB, the worst recording 0.36 dB. So the ducking after a click is too brief to matter. Integrated loudness drops more (a median 0.04 LU, worst 1.23 LU) because it counts the peaks themselves, which in a crackly 78 are mostly clicks.
- **100 ms release is the middle way.** 50 ms works about a fifth less of the time but lets peaks to −0.10 dBFS; 200 ms holds them lower but works a third longer. Neither changes what the music loses.
- **The stations.** With the levels table as it now stands, changes of recording that jump more than 3 LU fall from 56% to 12% of WGRM's, from 39% to 7% of WPGE's, and to 1–2% on the old-time radio stations (from 8–14% with gains capped at the headroom; `../FINDINGS-catalog.md`). WNOC's 24% and KTPR's 27% are movements and concert tracks keeping their recorded differences, by design.

All the criteria are met, so the setting stays: threshold −2 dBFS, ratio 20, attack 1 ms (Chrome's quickest; it looks 6 ms ahead), release 100 ms, makeup gain taken back out.

## What's left

The quietest 78s and readings still come out short of −20 LUFS: a median 1.8 LU for the 78s (the worst 6.6), 1.9 for stories and 1.6 for poems, since 6 dB past their headroom isn't enough. The limiter idles on them over 99% of the time, so a bigger allowance for those pools has room. It would take more off each click, though, so it's for the ears first: the preview (`python3 tools/build.py --preview`, then `dist/preview.html`) switches the limiter on and off.

## The run in full

50 files (8.5 hours) through Chrome's limiter (Google Chrome 158.0.8127.36), 0 failed. The page's setting: threshold -2 dBFS, ratio 20, attack 0.001 s, release 0.1 s, 1.14 dB of the browser's makeup gain taken back out.

Across the files, for each setting (median, and the worst file):

| Setting | Over 1 dB reduction | Over 3 dB | Over 6 dB | Most taken off | Highest sample out | Loudness cost |
|---|---|---|---|---|---|---|
| page | 0.15%, 4.67% | 0.020%, 0.57% | 0.000%, 0.010% | 5.2 dB, 7.3 dB | -0.92, -0.33 dBFS | -0.04, -1.23 LU |
| release 0.05 s | 0.11%, 3.76% | 0.015%, 0.42% | 0.000%, 0.010% | 5.2 dB, 7.3 dB | -0.69, -0.10 dBFS | -0.03, -1.13 LU |
| release 0.2 s | 0.21%, 6.10% | 0.025%, 0.78% | 0.000%, 0.020% | 5.2 dB, 7.3 dB | -1.04, -0.45 dBFS | -0.05, -1.31 LU |
| threshold -1 dBFS | 0.090%, 1.77% | 0.010%, 0.25% | 0.000%, 0.000% | 4.5 dB, 6.3 dB | -0.08, 0.42 dBFS | -0.02, -0.94 LU |

By pool, at the page's setting (median; the worst file in brackets). Comes out at: the program's loudness with the limiter, against the -20 LUFS aimed for, and without the limiter at its lower gain:

| Pool | Files | Leans on it by | Over 1 dB | Over 3 dB | Loudness cost | Comes out at | Without the limiter |
|---|---|---|---|---|---|---|---|
| chopin | 3 | 1.7 dB | 0.090% (0.20%) | 0.000% (0.010%) | -0.04 (-0.12) LU | -20.0 (-20.1) LUFS | -21.7 (-22.9) LUFS |
| free | 1 | 1.1 dB | 0.030% (0.030%) | 0.000% (0.000%) | -0.03 (-0.03) LU | -20.1 (-20.1) LUFS | -21.1 (-21.1) LUFS |
| g78 | 12 | 6.0 dB | 0.38% (0.62%) | 0.055% (0.11%) | -0.03 (-0.08) LU | -21.8 (-26.6) LUFS | -27.7 (-32.6) LUFS |
| laugh | 1 | 2.1 dB | 0.080% (0.080%) | 0.000% (0.000%) | -0.03 (-0.03) LU | -20.0 (-20.0) LUFS | -22.1 (-22.1) LUFS |
| midnight | 2 | 3.7 dB | 0.31% (0.33%) | 0.010% (0.010%) | -0.15 (-0.16) LU | -20.1 (-20.2) LUFS | -23.7 (-24.5) LUFS |
| poems | 8 | 5.9 dB | 0.66% (3.30%) | 0.13% (0.57%) | -0.40 (-1.12) LU | -21.6 (-26.5) LUFS | -26.5 (-32.1) LUFS |
| rocket | 2 | 2.3 dB | 0.035% (0.040%) | 0.000% (0.000%) | -0.01 (-0.02) LU | -20.1 (-20.1) LUFS | -22.4 (-22.8) LUFS |
| saddle | 2 | 2.9 dB | 0.085% (0.12%) | 0.010% (0.020%) | -0.16 (-0.25) LU | -20.1 (-20.2) LUFS | -22.9 (-23.2) LUFS |
| shows | 1 | 1.4 dB | 0.000% (0.000%) | 0.000% (0.000%) | 0.00 (0.00) LU | -28.9 (-28.9) LUFS | -30.3 (-30.3) LUFS |
| stories | 8 | 6.0 dB | 0.66% (4.67%) | 0.13% (0.39%) | -0.33 (-1.23) LU | -21.9 (-23.9) LUFS | -27.3 (-29.8) LUFS |
| whodunit | 2 | 2.5 dB | 0.36% (0.66%) | 0.070% (0.14%) | -0.30 (-0.55) LU | -20.3 (-20.6) LUFS | -22.5 (-23.4) LUFS |
| works | 8 | 2.3 dB | 0.000% (0.070%) | 0.000% (0.000%) | 0.00 (-0.03) LU | -20.0 (-21.7) LUFS | -22.2 (-24.0) LUFS |

Each file, at the page's setting:

| Pool | File | Gain (without) | Over 1 dB | Over 3 dB | Most | Peak out | Cost | Works hardest at |
|---|---|---|---|---|---|---|---|---|
| chopin | [Mazurka Op. 17 no. 4 in A minor.mp3](https://archive.org/download/musopen-chopin/Mazurka%20Op.%2017%20no.%204%20in%20A%20minor.mp3) | +6 (+3.1) dB | 0.20% | 0.010% | 3.4 dB | -1.28 dBFS | -0.12 LU | 3:09, 0.4 dB |
| chopin | [NocturneOp.9No.1InBFlatMinor.mp3](https://archive.org/download/musopen-chopin/NocturneOp.9No.1InBFlatMinor.mp3) | +2.4 (+0.7) dB | 0.090% | 0.000% | 2.3 dB | -1.35 dBFS | -0.04 LU | 3:23, 0.1 dB |
| chopin | [Nocturne Op. 27 no. 1 in C sharp minor.mp3](https://archive.org/download/musopen-chopin/Nocturne%20Op.%2027%20no.%201%20in%20C%20sharp%20minor.mp3) | +7.7 (+6.2) dB | 0.030% | 0.000% | 2.1 dB | -1.40 dBFS | -0.02 LU | 2:44, 0.1 dB |
| free | [08RidingAloneForThousandsOfMiles-Eli.mp3](https://archive.org/download/badpanda018/08RidingAloneForThousandsOfMiles-Eli.mp3) | +1.5 (+0.4) dB | 0.030% | 0.000% | 1.6 dB | -1.46 dBFS | -0.03 LU | 1:30, 0.1 dB |
| g78 | [Funiculi-Funicula - Vessella's Italian Band.mp3](https://archive.org/download/78_funiculi-funicula_vessellas-italian-band-denza_gbia3033472b/Funiculi-Funicula%20-%20Vessella's%20Italian%20Band.mp3) | +16.5 (+10.5) dB | 0.62% | 0.060% | 5.6 dB | -0.66 dBFS | -0.03 LU | 0:17, 0.2 dB |
| g78 | [HUSH, LITTLE BA - FRIEDA HEMPEL and THE LYRIC MA](https://archive.org/download/78_hush-little-baby-dont-you-cry_frieda-hempel-and-the-lyric-male-quartet-f-belasc_gbia0423884b/HUSH%2C%20LITTLE%20BA%20-%20FRIEDA%20HEMPEL%20and%20THE%20LYRIC%20MALE%20QUARTET.mp3) | +17.1 (+11.1) dB | 0.54% | 0.070% | 5.1 dB | -0.43 dBFS | -0.08 LU | 0:04, 0.1 dB |
| g78 | [MORNING, NOON AND NIGHT - A. PALET GALLARINI.mp3](https://archive.org/download/78_morning-noon-and-night_a-palet-gallarini-suppe_gbia0237941b/MORNING%2C%20NOON%20AND%20NIGHT%20-%20A.%20PALET%20GALLARINI.mp3) | +10.6 (+4.6) dB | 0.53% | 0.050% | 5.3 dB | -0.56 dBFS | -0.03 LU | 0:16, 0.1 dB |
| g78 | [Tango - Mischa Elman - Josef Bonime - I. Albeniz](https://archive.org/download/78_tango_mischa-elman-josef-bonime-i.-albeniz-elman_gbia0010962a/Tango%20-%20Mischa%20Elman%20-%20Josef%20Bonime%20-%20I.%20Albeniz.mp3) | +9.4 (+3.4) dB | 0.52% | 0.11% | 5.4 dB | -0.72 dBFS | -0.03 LU | 2:05, 0.2 dB |
| g78 | [THE SWALLOWS - VIRGINIA REA - Bingham - Cowen.mp](https://archive.org/download/78_the-swallows_virginia-rea-bingham-cowen_gbia3004823b/THE%20SWALLOWS%20-%20VIRGINIA%20REA%20-%20Bingham%20-%20Cowen.mp3) | +12.5 (+6.5) dB | 0.43% | 0.040% | 5.5 dB | -0.63 dBFS | -0.02 LU | 0:19, 0.2 dB |
| g78 | [SHOW ME THE WAY TO GO HOME - HARRY FAY - Irving ](https://archive.org/download/78_show-me-the-way-to-go-home_harry-fay-irving-king_gbia3037986b/SHOW%20ME%20THE%20WAY%20TO%20GO%20HOME%20-%20HARRY%20FAY%20-%20Irving%20King.mp3) | +10.1 (+4.1) dB | 0.41% | 0.060% | 5.5 dB | -0.33 dBFS | -0.03 LU | 0:00, 0.1 dB |
| g78 | [MY WILD IRISH ROSE - DENNIS O'TOOLE.mp3](https://archive.org/download/78_my-wild-irish-rose_dennis-otoole_gbia0463439a/MY%20WILD%20IRISH%20ROSE%20-%20DENNIS%20O'TOOLE.mp3) | +7.9 (+1.9) dB | 0.35% | 0.11% | 5.8 dB | -0.50 dBFS | -0.04 LU | 0:33, 0.1 dB |
| g78 | [La Gazza Ladra Overture - Rossini.mp3](https://archive.org/download/78_la-gazza-ladra-overture_rossini_gbia0023286a/La%20Gazza%20Ladra%20Overture%20-%20Rossini.mp3) | +8.1 (+2.1) dB | 0.32% | 0.070% | 5.4 dB | -0.58 dBFS | -0.02 LU | 1:04, 0.1 dB |
| g78 | [AULD LANG SYNE - AULD LANG SYNE.mp3](https://archive.org/download/78_auld-lang-syne_auld-lang-syne_gbia0298939a/AULD%20LANG%20SYNE%20-%20AULD%20LANG%20SYNE.mp3) | +7.7 (+1.7) dB | 0.29% | 0.030% | 5.6 dB | -0.56 dBFS | -0.02 LU | 1:15, 0.1 dB |
| g78 | [PRETTY LITTLE BABY - PHIL BAKER'S BAD BOYS.mp3](https://archive.org/download/78_pretty-little-baby_phil-bakers-bad-boys-sid-silvers-phil-baker-ben-bernie_gbia0527224a/PRETTY%20LITTLE%20BABY%20-%20PHIL%20BAKER'S%20BAD%20BOYS.mp3) | +12.5 (+6.5) dB | 0.18% | 0.040% | 5.8 dB | -0.47 dBFS | -0.01 LU | 0:49, 0.1 dB |
| g78 | [THE VOLGA BOATMAN'S SONG AND  - RUSSIAN BALALAIK](https://archive.org/download/78_the-volga-boatmans-song-and-the-charming-boy_russian-balalaika-ensemble_gbia0420751b/THE%20VOLGA%20BOATMAN'S%20SONG%20AND%20%20-%20RUSSIAN%20BALALAIKA%20ENSEMBLE.mp3) | +8.9 (+2.9) dB | 0.090% | 0.010% | 5.4 dB | -0.66 dBFS | -0.01 LU | 1:44, 0.1 dB |
| g78 | [Valse in A Flat Op. 42 - SERGEI RACHMANINOFF.mp3](https://archive.org/download/78_valse-in-a-flat-op-42_sergei-rachmaninoff-chopin_gbia0307222a/Valse%20in%20A%20Flat%20Op.%2042%20-%20SERGEI%20RACHMANINOFF.mp3) | +13.5 (+7.5) dB | 0.050% | 0.010% | 5.5 dB | -0.65 dBFS | 0.00 LU | 3:24, 0.1 dB |
| laugh | [PhilHarris51-05-27182ContractWorries.mp3](https://archive.org/download/OTRR_Harris_Faye_Singles/PhilHarris51-05-27182ContractWorries.mp3) | +2.9 (+0.8) dB | 0.080% | 0.000% | 2.7 dB | -1.29 dBFS | -0.03 LU | 20:37, 0.1 dB |
| midnight | [Escape_47-11-05_-013-_Evening_Primrose_-Elliott_](https://archive.org/download/OTRR_Escape_Singles/Escape_47-11-05_-013-_Evening_Primrose_-Elliott_Lewis-.mp3) | +2.9 (+0) dB | 0.33% | 0.010% | 4.0 dB | -1.05 dBFS | -0.16 LU | 7:56, 0.5 dB |
| midnight | [Whistler_50-05-07_ep414_Fatal_Error.mp3](https://archive.org/download/OTRR_Whistler_Singles/Whistler_50-05-07_ep414_Fatal_Error.mp3) | +4.6 (+0.1) dB | 0.29% | 0.010% | 4.6 dB | -0.88 dBFS | -0.13 LU | 14:09, 0.6 dB |
| poems | [familiar_faces_lamb_py_64kb.mp3](https://archive.org/download/short_poetry_001_librivox/familiar_faces_lamb_py_64kb.mp3) | +10.6 (+4.8) dB | 3.30% | 0.57% | 5.8 dB | -0.61 dBFS | -0.89 LU | 0:37, 0.4 dB |
| poems | [irish_emigrant_selina_py_64kb.mp3](https://archive.org/download/short_poetry_001_librivox/irish_emigrant_selina_py_64kb.mp3) | +7.5 (+1.8) dB | 2.20% | 0.28% | 5.8 dB | -0.73 dBFS | -0.49 LU | 0:04, 0.4 dB |
| poems | [love_age_peacock_py_64kb.mp3](https://archive.org/download/short_poetry_001_librivox/love_age_peacock_py_64kb.mp3) | +6.9 (+2.1) dB | 1.79% | 0.20% | 5.1 dB | -0.94 dBFS | -0.41 LU | 2:27, 0.3 dB |
| poems | [artilleryman_whitman_64kb.mp3](https://archive.org/download/short_poetry_001_librivox/artilleryman_whitman_64kb.mp3) | +8.8 (+2.8) dB | 0.72% | 0.23% | 6.0 dB | -0.69 dBFS | -1.12 LU | 1:12, 0.3 dB |
| poems | [kublai_khan_coleridge_py_64kb.mp3](https://archive.org/download/short_poetry_001_librivox/kublai_khan_coleridge_py_64kb.mp3) | +8.7 (+2.7) dB | 0.60% | 0.060% | 6.0 dB | -0.54 dBFS | -0.27 LU | 1:45, 0.2 dB |
| poems | [abou_hunt_py_64kb.mp3](https://archive.org/download/short_poetry_001_librivox/abou_hunt_py_64kb.mp3) | +5.1 (+0.5) dB | 0.48% | 0.060% | 4.6 dB | -0.78 dBFS | -0.11 LU | 0:19, 0.1 dB |
| poems | [casabianca_hemans_jh_64kb.mp3](https://archive.org/download/short_poetry_001_librivox/casabianca_hemans_jh_64kb.mp3) | +6.1 (+0.1) dB | 0.11% | 0.050% | 6.6 dB | -1.21 dBFS | -0.11 LU | 0:56, 0.1 dB |
| poems | [tinternabbey_ww_wcd_64kb.mp3](https://archive.org/download/shortpoetry_002_librivox/tinternabbey_ww_wcd_64kb.mp3) | +6 (+0) dB | 0.080% | 0.040% | 6.6 dB | -1.16 dBFS | -0.38 LU | 0:33, 0.1 dB |
| rocket | [Planet_Man_50-xx-xx_ep06_Discussing_Marston.mp3](https://archive.org/download/OTRR_Planet_Man_Ver2_Singles/Planet_Man_50-xx-xx_ep06_Discussing_Marston.mp3) | +1.9 (+0) dB | 0.040% | 0.000% | 2.6 dB | -1.40 dBFS | -0.02 LU | 9:00, 0.1 dB |
| rocket | [XMinusOne57-07-18103TheMerchantsOfVenus.mp3](https://archive.org/download/OTRR_X_Minus_One_Singles/XMinusOne57-07-18103TheMerchantsOfVenus.mp3) | +2.8 (+0) dB | 0.030% | 0.000% | 3.5 dB | -1.26 dBFS | -0.01 LU | 0:44, 0.2 dB |
| saddle | [Have Gun—Will Travel 1960-02-14 (065) The Dollho](https://archive.org/download/OTRR_Have_Gun_Singles/Have%20Gun%E2%80%94Will%20Travel%201960-02-14%20(065)%20The%20Dollhouse%20in%20Diamond%20Springs.mp3) | +3.2 (+0) dB | 0.12% | 0.020% | 4.1 dB | -1.15 dBFS | -0.25 LU | 17:03, 1.3 dB |
| saddle | [Have Gun—Will Travel 1959-09-13 (043) Treasure H](https://archive.org/download/OTRR_Have_Gun_Singles/Have%20Gun%E2%80%94Will%20Travel%201959-09-13%20(043)%20Treasure%20Hunt.mp3) | +2.6 (+0) dB | 0.050% | 0.000% | 3.5 dB | -1.20 dBFS | -0.07 LU | 19:06, 0.4 dB |
| shows | [ymsb2006-05-09t01.mp3](https://archive.org/download/ymsb2006-05-09.flac16/ymsb2006-05-09t01.mp3) | +1.4 (+0) dB | 0.000% | 0.000% | 0.0 dB | -4.35 dBFS | 0.00 LU | 2:07, 0.0 dB |
| stories | [beauty_and_the_beast_beaumont_t_64kb.mp3](https://archive.org/download/story_5_librivox/beauty_and_the_beast_beaumont_t_64kb.mp3) | +6 (+0) dB | 4.67% | 0.29% | 6.8 dB | -0.66 dBFS | -0.86 LU | 25:29, 0.9 dB |
| stories | [open_window_saki_mh_64kb.mp3](https://archive.org/download/stories_003_librivox/open_window_saki_mh_64kb.mp3) | +6.4 (+0.4) dB | 1.14% | 0.25% | 6.0 dB | -0.43 dBFS | -0.45 LU | 3:35, 0.5 dB |
| stories | [little_match_girl_anderson_th_64kb.mp3](https://archive.org/download/stories_002_librivox/little_match_girl_anderson_th_64kb.mp3) | +6 (+0) dB | 0.85% | 0.14% | 6.0 dB | -0.54 dBFS | -0.29 LU | 6:29, 0.2 dB |
| stories | [cask_of_amontillado_poe_zw-rh_64kb.mp3](https://archive.org/download/stories_002_librivox/cask_of_amontillado_poe_zw-rh_64kb.mp3) | +6.2 (+0.2) dB | 0.81% | 0.39% | 6.3 dB | -0.94 dBFS | -1.23 LU | 13:28, 2.5 dB |
| stories | [children_zodiac_kipling_ce_64kb.mp3](https://archive.org/download/stories_001_librivox/children_zodiac_kipling_ce_64kb.mp3) | +6 (+0) dB | 0.51% | 0.11% | 7.3 dB | -0.69 dBFS | -0.38 LU | 1:50, 1.3 dB |
| stories | [quest_saki_ianish_64kb.mp3](https://archive.org/download/stories_003_librivox/quest_saki_ianish_64kb.mp3) | +6.2 (+0.2) dB | 0.10% | 0.020% | 6.2 dB | -0.79 dBFS | -0.08 LU | 2:16, 0.1 dB |
| stories | [pigs_is_pigs_butler_blb_64kb.mp3](https://archive.org/download/stories_001_librivox/pigs_is_pigs_butler_blb_64kb.mp3) | +6 (+0) dB | 0.040% | 0.010% | 6.1 dB | -0.72 dBFS | -0.05 LU | 22:35, 0.3 dB |
| stories | [deacon_lampton_cs_64kb.mp3](https://archive.org/download/story_5_librivox/deacon_lampton_cs_64kb.mp3) | +6.1 (+0.1) dB | 0.010% | 0.010% | 6.5 dB | -1.31 dBFS | -0.01 LU | 16:32, 0.1 dB |
| whodunit | [Crime Classics 1954-01-13 (028) How Supan Got th](https://archive.org/download/OTRR_Crime_Classics_Singles/Crime%20Classics%201954-01-13%20(028)%20How%20Supan%20Got%20the%20Hook%20Outside%20Bombay.mp3) | +3.4 (+0) dB | 0.66% | 0.14% | 4.8 dB | -0.89 dBFS | -0.55 LU | 11:34, 1.2 dB |
| whodunit | [Richard Diamond 49-07-02 (011) The Bloody Hat Ca](https://archive.org/download/OTRR_Richard_Diamond_Private_Detective_Singles/Richard%20Diamond%2049-07-02%20(011)%20The%20Bloody%20Hat%20Case.mp3) | +1.5 (+0) dB | 0.060% | 0.000% | 2.9 dB | -1.16 dBFS | -0.05 LU | 4:34, 0.2 dB |
| works | [LudwigVanBeethoven-StringQuartetNo.6InBFlatMajor](https://archive.org/download/MusopenCollectionAsFlac/Beethoven_StringQuartetNo.6inBFlatMajorOp.18/LudwigVanBeethoven-StringQuartetNo.6InBFlatMajorOp.18No.6-01-AllegroConBrio.mp3) | +2.4 (+0) dB | 0.070% | 0.000% | 3.0 dB | -1.24 dBFS | -0.03 LU | 4:35, 0.1 dB |
| works | [AntonnDvorak-StringQuartetNo.12InFMajorOp.96Amer](https://archive.org/download/MusopenCollectionAsFlac/Dvorak_StringQuartetNo.12inFMajorOp.96/AntonnDvorak-StringQuartetNo.12InFMajorOp.96American-04-Finale-VivaceMaNonTroppo.mp3) | +2.2 (+0) dB | 0.040% | 0.000% | 2.7 dB | -1.25 dBFS | -0.02 LU | 5:42, 0.1 dB |
| works | [LudwigVanBeethoven-StringQuartetNo.6InBFlatMajor](https://archive.org/download/MusopenCollectionAsFlac/Beethoven_StringQuartetNo.6inBFlatMajorOp.18/LudwigVanBeethoven-StringQuartetNo.6InBFlatMajorOp.18No.6-02-AdagioMaNonTroppo.mp3) | +2.4 (+0) dB | 0.000% | 0.000% | 0.0 dB | -2.12 dBFS | 0.00 LU | 0:00, 0.0 dB |
| works | [LudwigVanBeethoven-StringQuartetNo.6InBFlatMajor](https://archive.org/download/MusopenCollectionAsFlac/Beethoven_StringQuartetNo.6inBFlatMajorOp.18/LudwigVanBeethoven-StringQuartetNo.6InBFlatMajorOp.18No.6-03-ScherzoAllegro.mp3) | +2.4 (+0) dB | 0.000% | 0.000% | 0.9 dB | -1.70 dBFS | 0.00 LU | 2:23, 0.0 dB |
| works | [LudwigVanBeethoven-StringQuartetNo.6InBFlatMajor](https://archive.org/download/MusopenCollectionAsFlac/Beethoven_StringQuartetNo.6inBFlatMajorOp.18/LudwigVanBeethoven-StringQuartetNo.6InBFlatMajorOp.18No.6-04-adagioLaMalinconia.mp3) | +2.4 (+0) dB | 0.000% | 0.000% | 1.3 dB | -1.53 dBFS | -0.01 LU | 8:06, 0.0 dB |
| works | [AntonnDvorak-StringQuartetNo.12InFMajorOp.96Amer](https://archive.org/download/MusopenCollectionAsFlac/Dvorak_StringQuartetNo.12inFMajorOp.96/AntonnDvorak-StringQuartetNo.12InFMajorOp.96American-01-AllegroMaNonTroppo.mp3) | +2.2 (+0) dB | 0.000% | 0.000% | 0.5 dB | -1.80 dBFS | 0.00 LU | 1:19, 0.0 dB |
| works | [AntonnDvorak-StringQuartetNo.12InFMajorOp.96Amer](https://archive.org/download/MusopenCollectionAsFlac/Dvorak_StringQuartetNo.12inFMajorOp.96/AntonnDvorak-StringQuartetNo.12InFMajorOp.96American-02-Lento.mp3) | +2.2 (+0) dB | 0.000% | 0.000% | 0.4 dB | -1.83 dBFS | 0.00 LU | 1:56, 0.0 dB |
| works | [AntonnDvorak-StringQuartetNo.12InFMajorOp.96Amer](https://archive.org/download/MusopenCollectionAsFlac/Dvorak_StringQuartetNo.12inFMajorOp.96/AntonnDvorak-StringQuartetNo.12InFMajorOp.96American-03-MoltoVivace.mp3) | +2.2 (+0) dB | 0.000% | 0.000% | 0.1 dB | -1.92 dBFS | 0.00 LU | 1:47, 0.0 dB |
