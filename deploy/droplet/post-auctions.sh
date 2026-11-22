#!/usr/bin/env bash
# The Post Auctions job on the droplet: the same two steps as
# .github/workflows/post-auctions.yml, every five minutes (ottoneu-post-auctions.timer).
#
#   deploy/droplet/post-auctions.sh [--dry-run]
#
# Secrets: SUPABASE_URL / SUPABASE_KEY from ~/ottoneu-db/.env (the scrape), and
# NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY,
# DISCORD_TOKEN from ~/ottoneu-db/web/.env.local (the post). DISCORD_CHANNEL_ID
# and SITE_URL come from the systemd unit.
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo"

# Any droplet job that rewrites fa_market's auction rows takes this lock, like
# the workflows' shared `scrape-fa-market` concurrency group: first_seen_at
# (each auction's Discord key) must not be written by two runs at once.
exec 9>/run/lock/ottoneu-fa-market.lock
flock -w 120 9

PYTHONPATH="$repo" venv/bin/python scripts/scrape_fa_market.py --auctions-only "$@"
cd web
npm run --silent post-auctions -- "$@"
