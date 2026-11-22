#!/usr/bin/env bash
# The Scrape FA Market job on the droplet: the same steps as
# .github/workflows/scrape-fa-market.yml, every three hours
# (ottoneu-scrape-fa-market.timer).
#
#   deploy/droplet/scrape-fa-market.sh [--force] [--dry-run]
#
# --force skips the in-season gate (like a manual workflow dispatch); any other
# argument goes to scrape_fa_market.py. Secrets come from ~/ottoneu-db/.env:
# SUPABASE_URL / SUPABASE_KEY, FANGRAPHS_USERNAME / FANGRAPHS_PASSWORD (the
# waivers login; without them only the public auctions are read), and
# REVALIDATE_SECRET. SITE_URL comes from the systemd unit.
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo"
export PYTHONPATH="$repo"

gate_args=(--exit-code)
scrape_args=()
for arg in "$@"; do
  if [ "$arg" = "--force" ]; then gate_args+=(--force); else scrape_args+=("$arg"); fi
done

# Off-season the board is idle: the gate exits 3 ("not due") and we stop
# cleanly. Any other non-zero exit is a real failure.
rc=0
venv/bin/python -m scripts.fa_market_gate "${gate_args[@]}" || rc=$?
[ "$rc" -eq 3 ] && exit 0
[ "$rc" -ne 0 ] && exit "$rc"

# The same lock as post-auctions.sh: both rewrite fa_market's auction rows, and
# first_seen_at (each auction's Discord key) must not be written by two runs at once.
exec 9>/run/lock/ottoneu-fa-market.lock
flock -w 300 9

venv/bin/python scripts/scrape_fa_market.py "${scrape_args[@]+"${scrape_args[@]}"}"

for arg in "${scrape_args[@]+"${scrape_args[@]}"}"; do
  [ "$arg" = "--dry-run" ] && exit 0
done

# Revalidate /free-agents, like the workflow's revalidate-site step: never fails
# the job (the write already landed; the page's timer refreshes it anyway).
secret="$(grep -E '^REVALIDATE_SECRET=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'" || true)"
if [ -n "$secret" ] && [ -n "${SITE_URL:-}" ]; then
  curl --silent --show-error --fail --retry 2 --max-time 30 \
    -X POST "$SITE_URL/api/revalidate" \
    -H @<(printf 'Authorization: Bearer %s\n' "$secret") \
    -H "Content-Type: application/json" \
    -d '{"paths": ["/free-agents"]}' && echo \
    || echo "Site revalidation failed; /free-agents will refresh on its timer."
fi
