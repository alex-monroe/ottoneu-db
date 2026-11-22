# Droplet jobs

systemd units for scheduled jobs that run on the DigitalOcean droplet
(`sofa-db-server`, Ubuntu 24.04, user `deploy`) instead of GitHub Actions.

## Live score worm

`ottoneu-live-worm.timer` fires every minute and starts
`ottoneu-live-worm.service`, which runs `scripts/live_score_worm.py --loop --if-due`.
`--if-due` makes the same start decision as pg_cron's `dispatch_live_worm`
(migration 059): a kickoff within 15 minutes or a game on, and no other loop
running (no heartbeat in 3 minutes, no GitHub dispatch in 10).

GitHub Actions stays the fallback with no changes: while the droplet's loop
writes heartbeats to `live_worm_state`, pg_cron never dispatches the workflow.
If the droplet is down, pg_cron dispatches it within about 5 minutes.

## Post Auctions

`ottoneu-post-auctions.timer` runs `post-auctions.sh` every five minutes: the
same two steps as `.github/workflows/post-auctions.yml` (scrape the public
auctions page, then post what opened or closed to #auctions). That workflow
stays on an hourly schedule as the fallback. Overlapping runs never post twice,
because `discord_posts` is claimed before each send. The script takes
`/run/lock/ottoneu-fa-market.lock`, which any other droplet job that rewrites
`fa_market` must take too.

## Scrape FA Market

`ottoneu-scrape-fa-market.timer` runs `scrape-fa-market.sh` every three hours at
:41: the same steps as `.github/workflows/scrape-fa-market.yml`. The in-season
gate (`python -m scripts.fa_market_gate --exit-code`) makes off-season runs a
no-op; then it logs in to FanGraphs over plain HTTP (no browser), snapshots open
auctions and claimable waivers into `fa_market`, and revalidates `/free-agents`.
It takes the same `/run/lock/ottoneu-fa-market.lock` as Post Auctions, so the
two never write `fa_market.first_seen_at` (each auction's Discord key) at once.
The workflow drops to a once-a-day fallback schedule. That run and the hourly
Post Auctions fallback cannot share the droplet's lock, but both are rare.

Run it by hand with `deploy/droplet/scrape-fa-market.sh --force --dry-run`
(`--force` skips the in-season gate).

## Install or update

```bash
cd ~/ottoneu-db && git pull && venv/bin/pip install -q -e . && (cd web && npm ci --no-audit --no-fund)
sudo cp deploy/droplet/ottoneu-*.service deploy/droplet/ottoneu-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ottoneu-live-worm.timer ottoneu-post-auctions.timer ottoneu-scrape-fa-market.timer
```

Node 22 comes from NodeSource's apt repo. Secrets, all mode 600 and gitignored:

- `~/ottoneu-db/.env`: `SUPABASE_URL`, `SUPABASE_KEY` (the secret key),
  `REVALIDATE_SECRET`, `FANGRAPHS_USERNAME` / `FANGRAPHS_PASSWORD` (the FA market
  scrape's waivers login; without them it reads only the public auctions), and
  optionally `OTTONEU_COOKIE`.
- `~/ottoneu-db/web/.env.local`: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SECRET_KEY` (both the secret
  key, as in the workflow), and `DISCORD_TOKEN`.

## Watch it

```bash
systemctl list-timers 'ottoneu-*'
journalctl -u ottoneu-live-worm -f
journalctl -u ottoneu-post-auctions -f
journalctl -u ottoneu-scrape-fa-market -f
```

Droplet failures do not alert yet; the GitHub fallbacks' failures still do.
