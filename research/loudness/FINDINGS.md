# Loudness survey: findings (26 Nov 2026)

134 files sampled from the catalog's 1,069 (method in [README.md](README.md); figures below, from `node research/loudness/analyze.js`).

## What it means

1. **Level matching is worth doing, and it has to be per file.** Files span 25 LU (−32.9 to −7.4 LUFS); the middle 90% span 14.8 LU. At a change of recording, the jump is over 3 LU on 32–74% of changes, depending on the station, and over 6 LU on 15–49%. WGRM is worst: one 78 differs from the next by a median 5.8 LU. One gain per pool would fix the old-time radio stations' main jump (the ads run 4.5 LU louder than the programs, −16.0 against −20.5 LUFS, as commercials did on real radio) but nothing within a pool, so WGRM, KFRE, KTPR and WNOC would stay as they are. One gain per file, aiming at −20 LUFS and boosting no file past −1 dBTP true peak, brings the changes over 3 LU down to 15% or fewer on eight of the ten stations.
2. **Quiet files limit how far boosting can go.** Aiming at −20 LUFS turns 59 files down and 59 up; 29 can't be raised all the way without peaks over −1 dBTP (a median 2.2 LU short): 15 LibriVox readings (stories and poems), 5 78s and 9 others. That is why WGRM (47% of changes still over 3 LU) and WPGE (25%) keep many of their jumps. A limiter would close the gap; whether it sounds right on 78s needs a listen. −23 LUFS, the EBU broadcast target, needs fewer boosts but plays the typical file about 3 dB quieter than now; −20 keeps today's average level.
3. **Trims matter for a few kinds of file, not most.** Quiet at the two ends adds up to a median 2.0 s a file. 23 of 134 files carry more than 5 s: 9 old-time radio episodes, 6 LibriVox stories (tails up to 10 s), 5 netlabel tracks (up to 17 s) and 3 others. The ads and vault tracks are clean, and so are most 78s and concert tracks.
4. **About one catalog duration in twenty is wrong.** 6 of 134 files differ by more than 2 s from their decoded length. Four old-time radio episodes run 2–8 s longer than listed, so the schedule cuts off their endings today. One KFRE track (`foot149_04-duis-dancing_elephant.mp3`) decodes 17.6 s short of its listing and peaks at +8 dBTP, which looks like a damaged file. Measuring every file corrects the durations too.
5. **Dead air in the middle of a file is rare:** 5 files have more than 5 s of it (longest 10.4 s). Worth a listen, not a feature.
6. **None of the gain can reach iPhone and iPad listeners,** where a page can't set the volume and the page plays audio directly so it survives the lock screen. Trims and corrected durations still apply there. The page's Volume knob does nothing on iPhone today.

## Recommended plan

1. Measure every catalog file once: 1,069 files, about 11 GB, roughly 2.5 hours on GitHub's servers, one file at a time. After that, only new files, with the weekly Archive check.
2. Keep, for each file, a gain, in and out points and the true duration, and carry them in each week's snapshot, so a week's schedule uses them.
3. Build the schedule on the true, trimmed durations (every device).
4. Apply the gain on the Web Audio path (computers and Android), aiming at −20 LUFS with boosts capped at each file's headroom; try a limiter for WGRM after a listen.
5. Bring the page's own sounds (station IDs, interval signal) to the same target.
6. On iPhone, hide the Volume knob or point to the phone's buttons.
7. Review the damaged KFRE track and the five long mid-file silences.

## Limits

134 files is 13% of the catalog, spread over every pool and every Archive item in the program pools; the figures are estimates, good for the decisions above rather than for setting any one file's gain. KTPR's concerts and the 78s were sampled one file per item, so changes between tracks of one concert are unmeasured (83% of KTPR's changes). Integrated loudness evens out programs, not the loud and quiet scenes inside one (old-time radio episodes have a loudness range of about 10 LU).

---

## Figures

134 of 134 sampled files measured. Measured 2026-11-26 with ffmpeg version 8.0.1-3ubuntu2 Copyright (c) 2000-2025 the FFmpeg developers.

### 1. How far apart files are

All files: median -19.9 LUFS; middle half -22.5 to -16.9 (5.6 LU wide); middle 90% -26.3 to -11.5 (14.8 LU); lowest -32.9, highest -7.4.

| Pool | Files | Median LUFS | Middle half | Lowest to highest | Loudness range (median LU) | True peak, highest (dBTP) | Format |
|---|---|---|---|---|---|---|---|
| stories | 10 | -25.2 | -26.0 to -23.3 | -27.1 to -20.7 | 7.9 | 1.4 | mp3 mono 64k ×6, mp3 stereo 64k ×4 |
| g78 | 12 | -24.2 | -27.2 to -21.3 | -32.9 to -11.3 | 6.6 | 2.0 | mp3 stereo 208k, mp3 stereo 207k |
| poems | 6 | -23.3 | -23.8 to -22.3 | -31.7 to -21.3 | 7.0 | -0.9 | mp3 mono 64k ×4, mp3 stereo 64k ×2 |
| works | 10 | -21.6 | -22.7 to -19.9 | -24.7 to -18.5 | 10.7 | -0.6 | mp3 stereo 164k ×2, mp3 stereo 165k ×2 |
| midnight | 10 | -21.5 | -23.3 to -19.2 | -23.7 to -14.3 | 10.9 | 0.0 | mp3 mono 128k ×5, mp3 mono 32k ×2 |
| saddle | 10 | -20.5 | -21.9 to -19.6 | -23.2 to -16.2 | 10.0 | -0.1 | mp3 mono 128k ×6, mp3 mono 64k ×3 |
| whodunit | 10 | -20.5 | -21.3 to -18.0 | -23.7 to -16.8 | 10.1 | 3.3 | mp3 mono 128k ×7, mp3 stereo 128k ×2 |
| rocket | 10 | -20.2 | -20.9 to -19.1 | -21.8 to -18.4 | 9.5 | 4.0 | mp3 mono 128k ×5, mp3 mono 32k ×5 |
| chopin | 6 | -19.8 | -20.4 to -17.5 | -23.2 to -11.9 | 8.6 | 0.0 | mp3 stereo 160k, mp3 stereo 155k |
| shows | 11 | -18.2 | -20.1 to -17.0 | -22.7 to -8.8 | 7.7 | 0.5 | mp3 stereo 190k ×2, mp3 stereo 184k |
| vault | 11 | -17.9 | -19.2 to -16.6 | -22.8 to -7.7 | 9.5 | 0.6 | mp3 stereo 191k ×3, mp3 stereo 194k ×2 |
| laugh | 10 | -17.5 | -18.6 to -16.3 | -22.9 to -14.0 | 10.4 | 0.7 | mp3 mono 128k ×3, mp3 stereo 109k ×2 |
| ads | 8 | -16.0 | -16.7 to -15.5 | -17.0 to -15.4 | 2.3 | 0.0 | mp3 mono 40k ×8 |
| free | 10 | -12.0 | -14.3 to -10.4 | -18.4 to -7.4 | 5.5 | 8.0 | mp3 stereo 256k ×3, mp3 stereo 320k ×3 |

Two files from the same Archive item differ by a median 1.5 LU (122 pairs; 90th percentile 5.3); two from different items of the same pool by 3.0 LU (472 pairs; 90th percentile 8.8).

### 2. The jumps a listener hears

Each change from one recording to the next in a week of each station's schedule (station IDs between them skipped), with the level change expected from the measured files that could make it: now, with one gain per pool, and with one gain per file aiming at -20 LUFS but boosting no file past -1 dBTP true peak (no limiter).

| Station | Changes a week | Measured | Median jump now (LU) | Over 3 LU now | Over 6 LU now | Over 3 LU, gain per pool | Over 3 LU, gain per file | Biggest kinds of change now (median jump) |
|---|---|---|---|---|---|---|---|---|
| WHOD | 774 | 100% | 2.4 | 46% | 16% | 28% | 5% | ads → same item ×197 (0.9); whodunit → ads ×186 (4.0); whodunit → whodunit ×150 (2.8) |
| WMID | 926 | 100% | 3.5 | 56% | 32% | 23% | 6% | midnight → ads ×258 (5.5); ads → same item ×244 (0.9); ads → midnight ×188 (5.5) |
| KRKT | 1200 | 100% | 3.3 | 53% | 15% | 13% | 8% | rocket → ads ×344 (4.0); ads → same item ×310 (0.9); ads → rocket ×245 (4.0) |
| KPRY | 902 | 100% | 3.4 | 53% | 24% | 26% | 15% | saddle → ads ×232 (4.4); ads → same item ×214 (0.9); ads → saddle ×121 (4.4) |
| WHAH | 525 | 100% | 2.1 | 32% | 19% | 31% | 1% | laugh → laugh ×189 (2.4); laugh → ads ×146 (1.7); ads → laugh ×136 (1.7) |
| WGRM | 3006 | 100% | 5.9 | 74% | 49% | 74% | 47% | g78 → g78 ×3006 (5.8) |
| WPGE | 1207 | 100% | 2.6 | 43% | 18% | 35% | 25% | stories → poems ×364 (3.0); poems → stories ×363 (3.0); poems → poems ×220 (1.9) |
| WNOC | 1718 | 100% | 2.9 | 46% | 15% | 45% | 0% | works → same item ×874 (2.6); chopin → same item ×297 (3.5); works → chopin ×274 (2.8) |
| KFRE | 2141 | 92% | 3.9 | 64% | 27% | 64% | 0% | free → free ×1964 (3.9) |
| KTPR | 1677 | 17% | 3.1 | 51% | 22% | 51% | 0% | shows → shows ×284 (3.1) |

A change within one Archive item can only be measured where the sample has two files from the same item; KTPR's concerts and the 78s are sampled one file per item, so changes between tracks of one concert are left out.

### 3. Quiet at the ends, and dead air

*Silent*: below −50 dBFS. *Quiet*: more than 25 dB below the file's own program level (also catches needle noise and room tone).

| Pool | Files | Quiet lead-in: median / longest (s) | Quiet tail: median / longest (s) | Files with over 2 s quiet at an end | Silent lead-in + tail, median (s) | Longest dead air mid-file (s) |
|---|---|---|---|---|---|---|
| stories | 10 | 1.1 / 3.3 | 4.0 / 10.4 | 9 | 6.0 | 8.7 |
| g78 | 12 | 0.5 / 2.0 | 0.4 / 5.4 | 2 | 1.1 | 0.1 |
| poems | 6 | 0.3 / 1.6 | 0.4 / 3.0 | 1 | 0.8 | 3.0 |
| works | 10 | 0.3 / 1.3 | 2.0 / 3.7 | 5 | 2.2 | 6.1 |
| midnight | 10 | 1.2 / 2.1 | 1.9 / 4.0 | 4 | 2.8 | 5.4 |
| saddle | 10 | 0.7 / 3.1 | 1.1 / 4.9 | 5 | 2.7 | 4.0 |
| whodunit | 10 | 1.5 / 2.4 | 2.9 / 3.9 | 9 | 4.4 | 3.1 |
| rocket | 10 | 0.2 / 3.8 | 0.4 / 4.9 | 5 | 1.7 | 5.7 |
| chopin | 6 | 0.9 / 2.3 | 2.3 / 4.5 | 4 | 3.1 | 1.4 |
| shows | 11 | 0.0 / 2.0 | 0.0 / 4.3 | 2 | 0.0 | 0.6 |
| vault | 11 | 0.0 / 0.5 | 0.0 / 1.8 | 0 | 0.0 | 10.4 |
| laugh | 10 | 0.8 / 2.3 | 1.9 / 2.7 | 5 | 2.7 | 4.3 |
| ads | 8 | 0.5 / 0.9 | 0.5 / 0.7 | 0 | 0.8 | 0.8 |
| free | 10 | 0.3 / 7.0 | 3.4 / 17.1 | 8 | 4.7 | 1.0 |

Across all files, quiet at the two ends adds up to a median 2.0 s a file (90th percentile 6.1 s; 23 files over 5 s). Mid-file dead air over 5 s: midnight Weird_Circle_4x-xx-xx_ep72_The_Shadow.mp3 (5.4 s); rocket Planet_Man_50-xx-xx_ep12_Marston_Dead.mp3 (5.7 s); stories sorrow_chekhov_pl_64kb.mp3 (8.7 s); vault ccope2005-09-20t08.mp3 (10.4 s); works Borodin_StringQuartetNo.1inAMajor/AlexanderBorodin (6.1 s).

### 4. Choosing a target level

Gain needed to reach each target, and how many files would end up with true peaks over −1 dBTP (so would need a limiter, or less gain).

| Target (LUFS) | Files turned down | Turned up | Would peak over −1 dBTP | Median change (LU) | Largest boost needed (LU) | Short of target with boost capped at the headroom: files, median shortfall (LU) |
|---|---|---|---|---|---|---|
| -16 | 18 | 107 | 104 | 4.5 | 16.9 | 89, 2.9 |
| -18 | 37 | 81 | 67 | 3.1 | 14.9 | 52, 2.8 |
| -20 | 59 | 59 | 37 | 2.8 | 12.9 | 29, 2.2 |
| -23 | 100 | 22 | 15 | 3.4 | 9.9 | 9, 3.1 |

### 5. Catalog durations against the files

The schedule is built on the catalog's durations. Decoded length minus catalog length: median 0.2 s; 6 of 134 files differ by more than 2 s: free UnderscoreOrkestra-BalancingAct.mp3 (-3.2 s); free foot149_04-duis-dancing_elephant.mp3 (-17.6 s); laugh Father Knows Best (088) 1951-06-21 Mothe (+2.1 s); laugh The Great Gildersleeve 44-01-23 (110) Ev (+8.1 s); laugh Father Knows Best (171) 1953-05-07 The G (+3.7 s); rocket Space_Patrol_54-11-06_110_The_Watchman_o (+6.9 s).
