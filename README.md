# Needle & Dial

Radio stations built from the Internet Archive's audio. Turn a vintage-style dial across AM and FM: old-time radio, 78s, live concerts, stories and more. Every station runs on a shared weekly schedule, so everyone tuned to a station hears the same moment.

Prototype. Not affiliated with the Internet Archive. Station call letters are fictional.

## What's here

| Path | What it is |
|---|---|
| `src/index.template.html` | The whole app in one page: interface, schedule engine and audio |
| `catalog/` | One JSON file per station, listing the Archive items it plays |
| `tools/build.py` | Builds `dist/index.html`, with this week's snapshot and any later drafts inlined, plus `dist/catalog.json` (the catalog as it stands) |
| `tools/test_engine.js` | Audits each week of schedule for every station: no gaps or overlaps, the legal ID at every top of the hour, programs on the minutes their station's clock allows, nothing running through the hour except long-form programs, nothing faded, week boundaries intact |
| `tools/archive_check.js` | The weekly Archive check: confirms every catalog file still exists, still downloads, hasn't turned stream-only and keeps its length (`tools/test_archive_check.js` tests it offline) |
| `tools/check_log.js` | Checks a phone's debug log against the locked-phone half of Gate B: every program change and how long it took, every stop and how long the sound was gone, heartbeat gaps, and a verdict (`tools/test_check_log.js` tests it) |
| `snapshots/` | The frozen catalog each schedule week uses, one file per Monday it starts (`tools/snapshot.py` drafts them; `tools/test_snapshot.py` tests it) |
| `catalog/review/stream-only.json` | Stream-only Archive items you've approved to keep, each with a one-line reason |
| `tools/test_playback.js` | Plays the built page in headless Chrome across record changes, with the screen "locked" and a browser that is strict about background audio |
| `.github/ISSUE_TEMPLATE/report.yml` | The form behind the Report link on the radio's card (`tools/test_report_form.js` checks it against GitHub's form schema and against the fields the page fills in) |
| `tools/analyze.js` | Lists every media URL in the catalog (`dist/urls.txt`) and prints break statistics |
| `tools/hashcheck.py` | Prints a size and hash for each station catalog |
| `research/ia-survey/` | The survey of Internet Archive audio that future stations draw on |

## Build and test

Needs Python 3 and Node 18 or later. The playback test also needs Google Chrome, and it and the report form check need `npm install` (two dev packages, `playwright-core` and `yaml`).

```
python3 tools/build.py       # writes dist/index.html and dist/catalog.json
node tools/test_engine.js    # schedule checks; exits non-zero if any fail
node tools/test_archive_check.js  # the Archive check's logic, against a fake archive.org
python3 tools/test_snapshot.py    # the snapshot tool
node tools/test_check_log.js      # the log checker
node tools/check_log.js log.txt   # check a phone's debug log (Share or Copy from ?debug=1, pasted through a chat app is fine) against Gate B; the screen may wake for up to a minute (--wake) without ending the run
node tools/test_report_form.js    # the Report link's issue form
node tools/test_playback.js  # playback checks in headless Chrome (set CHROME_PATH if Chrome is elsewhere)
ND_ONLY='lock time' node tools/test_playback.js  # just the checks whose names match
```

`npm run check` runs them all. Open `dist/index.html` in a browser to listen; audio streams straight from archive.org. GitHub Actions runs the same build and checks on every push, and publishes `main` to <https://mattforney.github.io/needle-and-dial/> (through the `gh-pages` branch) once they pass.

## Weekly Archive check

Every Sunday at 14:17 UTC (8:17 AM Central), the day before each new schedule week, GitHub Actions runs `tools/archive_check.js` against the real Archive: one metadata request per item and one download probe per file, a few requests a second, with the repository named in its user agent. It changes nothing; it reports.

Results go to a single GitHub issue labelled `archive-check`. The issue always shows the latest report, and the full report is also posted as a comment, which emails you, only when the list of problems changes. When everything passes, the issue closes. Timeouts and Archive errors are listed as "couldn't check" and don't count as problems; if more than a quarter of files can't be checked, the run fails instead of reporting.

To run it by hand: Actions, then Weekly Archive check, then Run workflow. Give it identifiers to check only those items (those runs don't touch the issue). To keep a stream-only item, add its identifier and a one-line reason to `catalog/review/stream-only.json`. GitHub turns scheduled workflows off in a public repository after 60 days without activity; Actions then offers a button to turn it back on.

## Weekly snapshots

Each week's schedule comes from a frozen copy of the catalog, so the program guide never shifts mid-week. `snapshots/2026-11-30.json` is the catalog in effect from Monday 30 November, 00:00 Central, until the next snapshot's Monday; a week without a file of its own keeps the one before. Edits to `catalog/` therefore reach the air the following Monday.

After the Sunday Archive check, the same workflow drafts next week's snapshot from `catalog/`, holding out files the check found broken and stream-only items not yet approved (files that only changed length, or couldn't be checked, stay in). If that differs from what the week would otherwise use, it commits the file and republishes the site. To draft one by hand: `python3 tools/snapshot.py`. A snapshot is fixed once its week starts; to change what is on air this week anyway, edit that week's file directly, knowing it reshuffles that station from that moment.

## Reports

The Report link on the radio's card opens a GitHub issue form, `.github/ISSUE_TEMPLATE/report.yml`, with what was playing when the link was pressed already filled in: the station, what the card showed, the Archive file and the time into it, when it aired (the listener's time and UTC), the recording just before it if that ended within ten minutes, and the site version. The listener picks a reason and may add a note. Filing one needs a free GitHub account, and reports are public issues labelled `report`; the form itself only takes effect once it is on `main`.

Nothing comes off the air on a report alone. To act on one, take the file out of its station's catalog, which holds it out from the next Monday's snapshot, or, to take it off this week, add its `item/file` to the `exclude` list of the snapshot in effect (this reshuffles that station from that moment). Then close the issue, saying what was done.

## How the schedule works

Each station's week is built from that week's catalog snapshot, the same for every listener. Every hour opens with the legal ID at :00. A program starts after a 10-second station break on a minute its length allows: up to 14:50 long on a quarter hour, up to 29:50 on :00 or :30, up to 59:50 on :00, so it ends before the top of the hour. Story Hour and Nocturne start a piece on any five-minute mark from which it ends before the hour. KTPR's concerts start on :00 or :30 and, like anything longer than an hour, run through the top of the hour, with the legal ID in the break between tracks or movements nearest it. Ads, 78s, poems, interludes or vault tracks fill the gaps, packed so nothing is faded out, and up to a minute of interval signal covers the rest. `tools/test_engine.js` checks every one of these rules for every week the page carries. Because the week is fixed, the page's Radio Log can list every program on every station for the seven days ahead, by day and hour, with a station's full playlist on request.

## How playback works

One audio element, the carrier, plays everything: programs, station IDs, interval signals and silence. It changes source between segments but never stops, and a second element loops silence underneath, so a phone never sees the page stop playing. Phone browsers can refuse to start a new player with the screen locked; this design gives them nothing new to start. While the page is hidden, the schedule runs off the players' progress events rather than timers. On load, the page reads the server's time and corrects the device clock if it is more than 2 seconds off (plus half the round trip, which limits how well it can tell), so everyone tuned to a station hears the same moment. Tuning in seeks into the middle of a file, and that seek takes a few seconds to load on a phone, so the page aims it ahead by the median of this device's last five tune-in load times (3 seconds until it has one). Otherwise the station would run that far behind the schedule and lose the end of the program. If a recording won't load after two retries eight seconds apart, or ends more than a minute early, the station fills the rest of its slot with its own filler (78s and ads, poems, interludes, vault tracks or songs) instead of the interval signal, skipping any filler that won't load either. On iPhone and iPad the carrier plays directly instead of through Web Audio, because Web Audio stops when the screen locks there. iPhone also pauses a station that is still loading when the screen locks. If the silent second player is still going, the page starts the station again by itself (up to three tries within 20 seconds); otherwise the station waits for play on the lock screen or an unlock.

Add `?debug=1` to the address to show an event log at the bottom of the page. It survives reloads and keeps the last 3,000 lines, enough for a long locked-phone test; Clear empties it, and Copy or Share sends the whole log for a bug report. `python3 tools/build.py --debug` also writes `dist/index-debug.html`, which shows the log without the address change, for phones. `?audio=direct` or `?audio=webaudio` forces either audio path for testing, and `?keepalive=0` turns the silent second player off.

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
