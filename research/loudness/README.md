# Loudness survey

Scoping for the roadmap's "Loudness and trims": before building level matching and trims, measure how far apart the catalog's files really are, and how much quiet sits at their ends.

## The sample

`sample.json`: 134 files from the 14 pools the stations draw on (`node tools/loudness_survey.js pick`). About ten a pool (eight ads, twelve 78s, six poems, six Chopin pieces, eleven concert tracks, eleven vault tracks), spread round-robin over each pool's Archive items, so every item in the old-time radio, story, concert and vault pools is in it. A fixed seed (20261126) makes it the same every time. 31 hours of audio, roughly 1–2 GB.

## What is measured

`tools/loudness_survey.js measure`, run on GitHub's servers by the "Loudness survey" workflow (archive.org isn't reachable from every machine). Each file is downloaded once, one at a time, with the repository named in the user agent, and deleted after measuring.

- **Loudness:** integrated loudness (LUFS), loudness range (LU) and true peak (dBTP), from ffmpeg's EBU R128 meter.
- **Quiet at each end:** from the audio in 100 ms blocks (48 kHz, full bandwidth, the average power of its channels as RMS dBFS), two ways. *Silent*: blocks below −50 dBFS (digital silence, quiet tape hiss). *Quiet*: blocks more than 25 dB below the file's program level (the median of its blocks above −50 dBFS), which also catches needle noise and room tone. A stretch ends where at least 3 of 5 blocks in a row are louder, so a lone click doesn't end it.
- **Dead air in the middle:** the longest silent stretch between the two ends.
- Also each file's codec, channels, sample rate and bitrate.

`node tools/loudness_survey.js selftest` checks all of this on synthetic files with known answers (a −20 dBFS tone reads −23.0 LUFS; silence, hiss, needle noise, a click and a mid-file gap give the lengths they were made with; mono and stereo read the same program level). The workflow runs it before measuring.

`results.json` holds one record per file; `node tools/loudness_survey.js report research/loudness/results.json` prints the summary by pool.
