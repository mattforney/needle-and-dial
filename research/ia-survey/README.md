# Internet Archive audio survey

The research behind future stations, gathered in November 2026 under the project's working title, Skywave.

| File | What it is |
|---|---|
| `ia_audio_survey_raw.json` | Raw results: collection counts, metadata samples and probes from the Archive's search APIs |
| `collections_classified.json` | Audio collections sorted into categories |
| `readiness_raw.json` | Per-station readiness probes: item counts, stream-only share, licenses, samples |
| `extras.json` | Restricted-item counts and refinements |
| `classify.py` | Sorts collections into categories |
| `stations.py` | 46 candidate stations, each with a verdict and notes |
| `build_xlsx.py` | Builds the survey spreadsheet from the files above |

Run the scripts from this folder; they read their inputs by relative path. `build_xlsx.py` needs `openpyxl`.
