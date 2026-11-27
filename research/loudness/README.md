# Loudness survey

Scoping for the roadmap's "Loudness and trims": before building level matching and trims, measure how far apart the catalog's files really are, and how much quiet sits at their ends.

## The sample

`sample.json`: 134 files from the 14 pools the stations draw on (`node tools/loudness_survey.js pick`). About ten a pool (eight ads, twelve 78s, six poems, six Chopin pieces, eleven concert tracks, eleven vault tracks), spread round-robin over each pool's Archive items, so every item in the old-time radio, story, concert and vault pools is in it. A fixed seed (20261126) makes it the same every time. 31 hours of audio, roughly 1–2 GB.

## What is measured

`tools/loudness_survey.js measure`, run on GitHub's servers by the "Loudness survey" workflow (archive.org isn't reachable from every machine). Each file is downloaded once, one at a time, with the repository named in the user agent, and deleted after measuring.

- **Loudness:** integrated loudness (LUFS), loudness range (LU) and true peak (dBTP), from ffmpeg's EBU R128 meter.
- **Quiet at each end:** from the audio in 100 ms blocks (48 kHz, full bandwidth, the average power of its channels as RMS dBFS), two ways. *Silent*: blocks below −50 dBFS (digital silence, quiet tape hiss). *Quiet*: blocks more than 25 dB below the file's program level (the median of its blocks above −50 dBFS), or silent, whichever threshold is higher, which also catches needle noise and room tone. A stretch ends where at least 3 of 5 blocks in a row are louder, so a lone click doesn't end it.
- **Dead air in the middle:** the longest silent stretch between the two ends.
- Also each file's codec, channels, sample rate and bitrate.

`node tools/loudness_survey.js selftest` checks all of this on synthetic files with known answers (a −20 dBFS tone reads −23.0 LUFS; silence, hiss, needle noise, a click and a mid-file gap give the lengths they were made with; mono and stereo read the same program level). The workflow runs it before measuring.

`results.json` holds one record per file; `node tools/loudness_survey.js report research/loudness/results.json` prints a summary by pool, and `node research/loudness/analyze.js` the figures in [FINDINGS.md](FINDINGS.md): spread, the jumps at each change of recording in a real week of each station, quiet at the ends, the cost of each target level, and catalog durations against the files. *Quiet* was briefly stricter than *silent* for very quiet files (25 dB below their program level fell under −50 dBFS); the tool now uses whichever threshold is higher, and `analyze.js` corrects results measured before that.

## Every file

`all.json` lists all 1,069 files in the catalog as of 26 Nov (`node tools/loudness_survey.js pick all`), each once, under the first pool it appears in (KTPR's vault tracks are tracks of its concerts, so they're listed as concerts). A workflow measured them on 26 Nov, 50 at a time, reusing the 132 from the sample run; none failed. The measurements now live in `catalog/measurements.json`, where the weekly Archive check adds any new or changed file, and `tools/levels.js` turns them into `catalog/levels.json`.

## The limiter

`limiter/` checks the page's limiter on real recordings before it airs: `files.json` lists the 50 files that lean on it most (`node tools/limiter_check.js pick`), `results.json` what the page's chain (its high-pass, the gain, Chrome's own limiter) did to each (`node tools/limiter_check.js run`, on GitHub's servers by a workflow on its own branch, since removed), and [limiter/FINDINGS.md](limiter/FINDINGS.md) what that means (`node tools/limiter_check.js report` prints its tables). `wpge-spots.json` lists the spots behind the listening clips of 27 Nov (`node tools/limiter_check.js clips`), whose WAVs stay on the `limiter-check-2` branch. `node tools/limiter_check.js selftest` checks the method on synthetic recordings: a tone under the threshold comes through untouched, a tone over it is held near it, a click is held under full scale while the music around it loses next to nothing, and the loudness meter agrees with `tools/lufs.js`.

## Measured again through the high-pass (27 Nov)

`remeasure/measurements.json` measures every catalog file again through the page's 20 Hz high-pass (a GitHub workflow on the `remeasure` branch, since removed). `catalog/measurements.json` takes its loudness and true peak (records marked `hp_peak: 20`) but keeps the earlier quiet ends, from unfiltered audio, which trims less; `remeasure/TRIMS.md` lists the 123 files whose trims the filtered ends would change, for a listen first. Files measured from now on are measured through the filter throughout (`hp: 20`).
