#!/usr/bin/env bash
# Run a droplet job and report it to Healthchecks.io, which alerts when a job
# fails or stops checking in (the droplet down, a timer broken, a job hung).
#
#   deploy/droplet/run-checked.sh <check-slug> <command> [args...]
#
# Pings https://hc-ping.com/<HC_PING_KEY>/<check-slug>: /start before the job,
# then the job's exit status (0 = success, anything else = failure) with the
# last 10 KB of its output, which the alert shows. `?create=1` makes the check
# on first use; its period and grace are set in Healthchecks (see README.md).
# HC_PING_KEY (the project's ping key) is read from ~/ottoneu-db/.env. Without
# it the job still runs, unreported. A failed ping never fails the job.
set -uo pipefail

slug="$1"; shift
repo="$(cd "$(dirname "$0")/../.." && pwd)"
key="${HC_PING_KEY:-$(sed -n 's/^HC_PING_KEY=//p' "$repo/.env" 2>/dev/null | tr -d "\"'" | head -1)}"
url="${HC_PING_BASE:-https://hc-ping.com}/$key/$slug"

ping() {  # ping <suffix> [file with the body]
  [ -n "$key" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null ${2:+--data-binary @"$2"} "$url$1" || true
}

log="$(mktemp)"
trap 'rm -f "$log"' EXIT
ping "/start?create=1"
"$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
tail -c 10000 "$log" > "$log.tail" && mv "$log.tail" "$log"
ping "/$status?create=1" "$log"
exit "$status"
