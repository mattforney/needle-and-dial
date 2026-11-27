# Loudness: figures for the whole catalog (26 Nov 2026; levels-table columns added 27 Nov)

1069 files measured. Measured 2026-11-26 with ffmpeg version 8.0.1-3ubuntu2 Copyright (c) 2000-2025 the FFmpeg developers.

## 1. How far apart files are

All files: median -19.7 LUFS; middle half -22.7 to -16.5 (6.2 LU wide); middle 90% -28.0 to -11.5 (16.5 LU); lowest -43.8, highest -6.4.

| Pool | Files | Median LUFS | Middle half | Lowest to highest | Loudness range (median LU) | True peak, highest (dBTP) | Format |
|---|---|---|---|---|---|---|---|
| stories | 55 | -24.9 | -26.4 to -22.7 | -37.7 to -19.9 | 6.7 | 1.4 | mp3 mono 64k ×36, mp3 stereo 64k ×19 |
| g78 | 135 | -24.6 | -27.5 to -21.3 | -43.8 to -11.0 | 5.8 | 2.8 | mp3 stereo 274k ×3, mp3 stereo 223k ×3 |
| poems | 45 | -23.7 | -26.9 to -22.6 | -41.3 to -16.2 | 6.6 | 0.8 | mp3 stereo 64k ×24, mp3 mono 64k ×21 |
| whodunit | 48 | -20.6 | -22.5 to -18.8 | -24.2 to -13.9 | 10.0 | 3.3 | mp3 mono 128k ×28, mp3 stereo 128k ×10 |
| works | 144 | -20.6 | -22.7 to -18.4 | -37.3 to -12.3 | 12.5 | 0.6 | mp3 stereo 173k ×7, mp3 stereo 170k ×7 |
| rocket | 48 | -20.2 | -21.2 to -19.2 | -24.5 to -17.1 | 9.8 | 11.2 | mp3 mono 32k ×22, mp3 mono 128k ×14 |
| midnight | 47 | -20.0 | -22.9 to -18.1 | -24.6 to -11.8 | 10.8 | 1.0 | mp3 mono 128k ×27, mp3 mono 64k ×6 |
| saddle | 48 | -20.0 | -21.8 to -17.6 | -23.2 to -12.9 | 10.7 | 3.8 | mp3 mono 64k ×17, mp3 mono 128k ×17 |
| chopin | 99 | -19.9 | -21.6 to -17.6 | -28.5 to -10.9 | 11.6 | 0.0 | mp3 stereo 155k ×6, mp3 stereo 148k ×5 |
| shows | 200 | -17.9 | -20.2 to -16.3 | -33.3 to -7.7 | 8.9 | 1.7 | mp3 stereo 190k ×20, mp3 stereo 189k ×17 |
| laugh | 48 | -17.5 | -19.8 to -15.8 | -23.9 to -10.0 | 10.5 | 1.9 | mp3 mono 128k ×12, mp3 stereo 320k ×9 |
| ads | 55 | -15.8 | -16.2 to -15.4 | -18.0 to -13.1 | 2.4 | 0.0 | mp3 mono 40k ×55 |
| free | 97 | -12.1 | -14.4 to -10.1 | -21.5 to -6.4 | 6.4 | 14.0 | mp3 stereo 320k ×56, mp3 stereo 256k ×19 |

Two files from the same Archive item differ by a median 2.6 LU (20544 pairs; 90th percentile 7.9); two from different items of the same pool by 3.4 LU (37757 pairs; 90th percentile 9.4).

## 2. The jumps a listener hears

Each change from one recording to the next in a week of each station's schedule (station IDs between them skipped), with the level change expected from the measured files that could make it: now, with one gain per pool, and with one gain per file aiming at -20 LUFS but boosting no file past -1 dBTP true peak (no limiter); then as catalog/levels.json has it, where programs in parts share a gain (so a movement-to-movement change stays as recorded), without the limiter and with it.

| Station | Changes a week | Measured | Median jump now (LU) | Over 3 LU now | Over 6 LU now | Over 3 LU, gain per pool | Over 3 LU, gain per file | Over 3 LU, levels table | With the limiter | Biggest kinds of change now (median jump) |
|---|---|---|---|---|---|---|---|---|---|---|
| WHOD | 774 | 100% | 3.1 | 50% | 24% | 29% | 8% | 8% | 1% | ads → same item ×197 (0.8); whodunit → ads ×186 (4.9); whodunit → whodunit ×150 (2.8) |
| WMID | 926 | 100% | 3.2 | 52% | 28% | 33% | 10% | 10% | 1% | midnight → ads ×258 (4.4); ads → same item ×244 (0.8); ads → midnight ×188 (4.4) |
| KRKT | 1200 | 100% | 3.5 | 55% | 18% | 18% | 11% | 11% | 2% | rocket → ads ×344 (4.4); ads → same item ×310 (0.8); ads → rocket ×245 (4.4) |
| KPRY | 902 | 100% | 3.3 | 52% | 26% | 31% | 14% | 14% | 2% | saddle → ads ×232 (4.3); ads → same item ×214 (0.8); ads → saddle ×121 (4.3) |
| WHAH | 525 | 100% | 2.6 | 44% | 22% | 43% | 2% | 2% | 0% | laugh → laugh ×189 (3.5); laugh → ads ×146 (2.3); ads → laugh ×136 (2.3) |
| WGRM | 3006 | 100% | 4.9 | 67% | 41% | 67% | 56% | 56% | 12% | g78 → g78 ×3006 (4.9) |
| WPGE | 1207 | 100% | 3.3 | 54% | 25% | 53% | 39% | 39% | 7% | stories → poems ×364 (3.2); poems → stories ×363 (3.2); poems → poems ×220 (4.0) |
| WNOC | 1718 | 100% | 3.2 | 53% | 22% | 53% | 1% | 24% | 23% | works → same item ×874 (3.2); chopin → same item ×297 (3.2); works → chopin ×274 (3.2) |
| KFRE | 2141 | 100% | 3.1 | 50% | 19% | 50% | 0% | 0% | 0% | free → free ×1964 (3.3); free → same item ×177 (1.4) |
| KTPR | 1677 | 100% | 1.9 | 31% | 9% | 31% | 1% | 27% | 27% | shows → same item ×1393 (1.7); shows → shows ×284 (3.3) |

A change within one Archive item (a concert's next track, a work's next movement) is measured from pairs of sampled files from the same item; 938 sampled files share an item with another. Left out for want of such a pair: nothing.

## 3. Quiet at the ends, and dead air

*Silent*: below −50 dBFS. *Quiet*: more than 25 dB below the file's own program level (also catches needle noise and room tone).

| Pool | Files | Quiet lead-in: median / longest (s) | Quiet tail: median / longest (s) | Files with over 2 s quiet at an end | Silent lead-in + tail, median (s) | Longest dead air mid-file (s) |
|---|---|---|---|---|---|---|
| stories | 55 | 0.8 / 4.5 | 3.2 / 11.4 | 38 | 4.3 | 8.7 |
| g78 | 135 | 0.5 / 4.8 | 1.6 / 89.8 | 53 | 2.2 | 3.7 |
| poems | 45 | 0.2 / 5.0 | 0.3 / 9.2 | 12 | 0.7 | 4.9 |
| whodunit | 48 | 0.5 / 2.4 | 2.5 / 4.8 | 27 | 3.5 | 7.4 |
| works | 144 | 0.5 / 5.8 | 1.6 / 19.6 | 64 | 2.3 | 8.0 |
| rocket | 48 | 0.2 / 9.2 | 0.3 / 7.6 | 22 | 1.4 | 10.6 |
| midnight | 47 | 1.2 / 3.0 | 2.0 / 11.8 | 28 | 3.8 | 8.0 |
| saddle | 48 | 0.7 / 3.4 | 0.2 / 4.9 | 16 | 1.9 | 4.7 |
| chopin | 99 | 0.8 / 4.6 | 2.9 / 11.9 | 79 | 3.5 | 3.1 |
| shows | 200 | 0.0 / 35.2 | 0.0 / 18.3 | 20 | 0.0 | 13.7 |
| laugh | 48 | 0.6 / 2.8 | 1.6 / 6.5 | 21 | 2.5 | 5.0 |
| ads | 55 | 0.4 / 0.9 | 0.4 / 1.5 | 0 | 0.7 | 1.0 |
| free | 97 | 0.3 / 19.4 | 2.5 / 17.1 | 56 | 2.5 | 33.9 |

Across all files, quiet at the two ends adds up to a median 2.0 s a file (90th percentile 6.7 s; 183 files over 5 s). Mid-file dead air over 5 s: midnight Weird_Circle_4x-xx-xx_ep72_The_Shadow.mp3 (5.4 s); rocket Planet_Man_50-xx-xx_ep12_Marston_Dead.mp3 (5.7 s); stories sorrow_chekhov_pl_64kb.mp3 (8.7 s); shows ccope2005-09-20t08.mp3 (10.4 s); works Borodin_StringQuartetNo.1inAMajor/AlexanderBorodin (6.1 s); free 07RidingAloneForThousandsOfMiles-FinalNotice.mp3 (10.6 s); free 08RidingAloneForThousandsOfMiles-Eli.mp3 (33.9 s); free RidingAloneForThousandsOfMiles-BrickCityLoveSong.m (5.7 s); midnight Suspense 540930 565 A Little Matter of Memory (64- (5.7 s); midnight Weird_Circle_4x-xx-xx_ep46_The_Queer_Client.mp3 (8 s); rocket Planet_Man_50-xx-xx_ep05_Marston_to_Attack_Earth.m (8.8 s); rocket Planet_Man_50-xx-xx_ep07_Kidnapping_Order.mp3 (10.5 s); rocket Planet_Man_50-xx-xx_ep08_Billy_and_Jane_Need_Help. (7.5 s); rocket Planet_Man_50-xx-xx_ep09_Hoping_for_a_Miracle.mp3 (7 s); rocket Planet_Man_50-xx-xx_ep10_Billy_and_Jane_in_Ship.mp (10.6 s); rocket Planet_Man_50-xx-xx_ep11_Three_D_Dantro.mp3 (10.6 s); shows Rad2006-04-21.sbd.flac.d1t01.mp3 (6.9 s); shows Rad2006-04-21.sbd.flac.d1t04.mp3 (10.7 s); shows Rad2006-04-21.sbd.flac.d1t05.mp3 (13.7 s); shows Rad2006-04-21.sbd.flac.d1t11.mp3 (5.8 s); shows Rad2006-04-21.sbd.flac.d2t08.mp3 (8 s); shows Rad2006-04-21.sbd.flac.d2t17.mp3 (5.7 s); shows Rad2006-04-21.sbd.flac.d2t18.mp3 (13.4 s); shows ccope2005-09-20t05.mp3 (10.3 s); stories markheim_stevenson_wsc_64kb.mp3 (5.9 s); stories nice_people_bunner_wsc_64kb.mp3 (5.4 s); stories leopard_mans_story_london_km_64kb.mp3 (6.3 s); whodunit BIMB 53-06-27 (171) The Sophie Brettin Murder Case (7.4 s); whodunit Richard Diamond 49-10-22 (026) Rene Bennet Protect (5.7 s); works Bach_GoldbergVariations/JohannSebastianBach-14-Gol (5.8 s); works Rimsky-Korsakov_RussianOverture/NikolaiRimsky-kors (5.3 s); works Tchaikovsky_SymphonyPathetique/PyotrIlyichTchaikov (8 s).

## 4. Choosing a target level

Gain needed to reach each target, and how many files would end up with true peaks over −1 dBTP (so would need a limiter, or less gain).

| Target (LUFS) | Files turned down | Turned up | Would peak over −1 dBTP | Median change (LU) | Largest boost needed (LU) | Short of target with boost capped at the headroom: files, median shortfall (LU) |
|---|---|---|---|---|---|---|
| -16 | 181 | 800 | 838 | 4.3 | 27.8 | 695, 3.5 |
| -18 | 345 | 636 | 564 | 3.2 | 25.8 | 466, 2.8 |
| -20 | 514 | 453 | 342 | 3.1 | 23.8 | 254, 2.8 |
| -23 | 784 | 199 | 133 | 4.0 | 20.8 | 102, 2.9 |

## 5. Catalog durations against the files

The schedule is built on the catalog's durations. Decoded length minus catalog length: median 0.2 s; 58 of 1069 files differ by more than 2 s: free UnderscoreOrkestra-BalancingAct.mp3 (-3.2 s); free foot149_04-duis-dancing_elephant.mp3 (-17.6 s); laugh Father Knows Best (088) 1951-06-21 Mothe (+2.1 s); laugh The Great Gildersleeve 44-01-23 (110) Ev (+8.1 s); laugh Father Knows Best (171) 1953-05-07 The G (+3.7 s); rocket Space_Patrol_54-11-06_110_The_Watchman_o (+6.9 s); free Aydio_-_01_-_Track.mp3 (-18.0 s); free Aydio_-_02_-_Deltitnu.mp3 (-17.8 s); ….
