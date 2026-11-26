# Needle & Dial

Radio stations built from the Internet Archive's audio. Turn a vintage-style dial across AM and FM: old-time radio, 78s, live concerts, stories and more. Every station runs on a shared weekly schedule, so everyone tuned to a station hears the same moment.

Prototype. Not affiliated with the Internet Archive. Station call letters are fictional.

## What's here

| Path | What it is |
|---|---|
| `src/index.template.html` | The whole app in one page: interface, schedule engine and audio |
| `catalog/` | One JSON file per station, listing the Archive items it plays |
| `tools/build.py` | Builds `dist/index.html`, with the catalog inlined, plus `dist/catalog.json` |
| `tools/test_engine.js` | Audits a week of schedule for every station: no gaps or overlaps, programs on the grid, week boundaries intact |
| `tools/test_playback.js` | Plays the built page in headless Chrome across record changes, with the screen "locked" and a browser that is strict about background audio |
| `tools/analyze.js` | Lists every media URL in the catalog (`dist/urls.txt`) and prints break statistics |
| `tools/hashcheck.py` | Prints a size and hash for each station catalog |
| `research/ia-survey/` | The survey of Internet Archive audio that future stations draw on |

## Build and test

Needs Python 3 and Node 18 or later. The playback test also needs Google Chrome and `npm install` (one dev package, `playwright-core`).

```
python3 tools/build.py       # writes dist/index.html and dist/catalog.json
node tools/test_engine.js    # schedule checks; exits non-zero if any fail
node tools/test_playback.js  # playback checks in headless Chrome (set CHROME_PATH if Chrome is elsewhere)
```

`npm run check` runs all three. Open `dist/index.html` in a browser to listen; audio streams straight from archive.org. GitHub Actions runs the same build and checks on every push.

## How playback works

One audio element, the carrier, plays everything: programs, station IDs, interval signals and silence. It changes source between segments but never stops, and a second element loops silence underneath, so a phone never sees the page stop playing. Phone browsers can refuse to start a new player with the screen locked; this design gives them nothing new to start. While the page is hidden, the schedule runs off the players' progress events rather than timers. On iPhone and iPad the carrier plays directly instead of through Web Audio, because Web Audio stops when the screen locks there.

Add `?debug=1` to the address to show an event log at the bottom of the page. It survives reloads, and its Copy button puts the whole log on the clipboard for a bug report. `python3 tools/build.py --debug` also writes `dist/index-debug.html`, which shows the log without the address change, for phones. `?audio=direct` or `?audio=webaudio` forces either audio path for testing.

## Roadmap

1. **Foundations:** this repo, hosting, a catalog split per station, a weekly check of every Archive file.
2. **On-air fixes:** playback with the phone locked, programs on the hour, legal IDs at the top of the hour, a full program guide.
3. **Sound and look:** a new interface, recorded announcers and jingles, a shortwave band, new stations (Mission Control, National Jukebox, Numbers & Pirates first).
4. **Live and local:** the listener's city in station IDs, weather, schedule-driven promos, DJ segments written ahead.
5. **Going public:** About, Credits, Terms and Privacy pages, takedown contact, donations to the Internet Archive.

## Credits

Audio and metadata come from Internet Archive contributors, the Old Time Radio Researchers, LibriVox, the Great 78 Project, the Live Music Archive tapers, Musopen and the netlabels credited on air. Rights notes for each station are in the app's About section.

## License

No license has been chosen yet, so all rights are reserved for now.
