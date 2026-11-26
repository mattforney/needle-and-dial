#!/usr/bin/env bash
# Files the weekly Archive check's findings in one GitHub issue, labelled archive-check.
# The issue body always holds the latest report. The full report is also posted as a comment,
# which emails the repository's watchers, but only when the list of problems has changed since
# the last check. When everything passes, the issue closes.
# Needs gh, GH_TOKEN, and PROBLEMS, HASH, TITLE and FILES from tools/archive_check.js.
set -euo pipefail
label=archive-check
report=dist/archive-check.md
gh label create "$label" --color c5def5 --description "Weekly Archive check" >/dev/null 2>&1 || true
num=$(gh issue list --label "$label" --state open --limit 1 --json number --jq '.[0].number // empty')
if [ "$PROBLEMS" -gt 0 ]; then
  if [ -z "$num" ]; then
    gh issue create --title "$TITLE" --label "$label" --body-file "$report"
  else
    old=$(gh issue view "$num" --json body --jq .body | grep -o 'archive-check:[0-9a-f]*' | head -n1 || true)
    gh issue edit "$num" --title "$TITLE" --body-file "$report"
    if [ "$old" != "archive-check:$HASH" ]; then gh issue comment "$num" --body-file "$report"; fi
  fi
elif [ -n "$num" ]; then
  gh issue edit "$num" --title "$TITLE" --body-file "$report"
  gh issue comment "$num" --body "All $FILES files passed this week's check, so this issue is closing."
  gh issue close "$num"
else
  echo "All $FILES files passed; no open issue to update."
fi
