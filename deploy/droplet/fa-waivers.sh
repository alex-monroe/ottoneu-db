#!/usr/bin/env bash
# The FA waivers job on the droplet: infer who is on waivers from the public
# roster CSV and write fa_market's waiver rows (scripts/infer_fa_waivers.py).
# Every ten minutes (ottoneu-fa-waivers.timer), in season only.
#
#   deploy/droplet/fa-waivers.sh [--force] [--dry-run]
#
# --force skips the in-season gate; other arguments go to infer_fa_waivers.py.
# Secrets (SUPABASE_URL, SUPABASE_KEY, REVALIDATE_SECRET) come from
# ~/ottoneu-db/.env; SITE_URL from the systemd unit. No FanGraphs login.
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo"
export PYTHONPATH="$repo"

gate_args=(--exit-code)
job_args=()
for arg in "$@"; do
  if [ "$arg" = "--force" ]; then gate_args+=(--force); else job_args+=("$arg"); fi
done

# Off-season the board is idle: the gate exits 3 ("not due") and so we stop
# cleanly. Any other non-zero exit is a real failure. The first in-season poll
# finds a stale snapshot and only re-baselines it.
rc=0
venv/bin/python -m scripts.fa_market_gate "${gate_args[@]}" || rc=$?
[ "$rc" -eq 3 ] && exit 0
[ "$rc" -ne 0 ] && exit "$rc"

# The same lock as post-auctions.sh: every droplet job that writes fa_market takes
# it, so the two never read-modify-write the table at the same moment.
exec 9>/run/lock/ottoneu-fa-market.lock
flock -w 120 9

venv/bin/python scripts/infer_fa_waivers.py "${job_args[@]+"${job_args[@]}"}"
