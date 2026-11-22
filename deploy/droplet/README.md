# Droplet jobs

systemd units for the scheduled jobs that run on the DigitalOcean droplet
(`sofa-db-server`, Ubuntu 24.04, user `deploy`) instead of GitHub Actions.
GitHub started frequent schedules far too late on busy days. The matching
workflows have no schedule now and are kept for manual runs.

## Live score worm

`ottoneu-live-worm.timer` fires every minute and starts
`ottoneu-live-worm.service`, which runs `scripts/live_score_worm.py --loop --if-due`.
`--if-due` exits at once unless the next kickoff is within 15 minutes or a game
is on, and no other loop is running (no heartbeat in `live_worm_state` in the
last 3 minutes). A loop runs until no game is on or about to start, or for 340
minutes; the timer starts the next one. It exits non-zero after 10 failed passes
or 3 failed box-score scrapes in a row, so its health check alerts.

## Post Auctions

`ottoneu-post-auctions.timer` runs `post-auctions.sh` every five minutes: the
same two steps as `.github/workflows/post-auctions.yml` (scrape the public
auctions page, then post what opened or closed to #auctions). `discord_posts`
is claimed before each send, so a manual workflow run overlapping it never posts
twice. The script takes `/run/lock/ottoneu-fa-market.lock`, which any other
droplet job that rewrites `fa_market` must take too.

## Alerts

Every unit runs its job through `run-checked.sh <check> <command>`, which pings
Healthchecks.io at `https://hc-ping.com/<HC_PING_KEY>/<check>`: `/start`, then
the exit status with the last 10 KB of output. Healthchecks alerts (to the
channels set on the project) when a run fails, or when no ping arrives within
the check's period plus grace, which is how a dead droplet or a stopped timer
shows up. A check is created on its first ping; set its schedule then:

| Check | Period | Grace | Why |
|---|---|---|---|
| `post-auctions` | 5 min | 10 min | runs every five minutes, all year |
| `live-worm` | 1 min | 6 h | runs every minute, but a loop may run 340 minutes before it reports |

Without `HC_PING_KEY` in `.env` the jobs still run, unreported. DigitalOcean
Monitoring alert policies cover the machine itself (memory, disk, CPU).

## Install or update

```bash
cd ~/ottoneu-db && git pull && venv/bin/pip install -q -e . && (cd web && npm ci --no-audit --no-fund)
sudo cp deploy/droplet/ottoneu-*.service deploy/droplet/ottoneu-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ottoneu-live-worm.timer ottoneu-post-auctions.timer
```

Node 22 comes from NodeSource's apt repo. Secrets, all mode 600 and gitignored:

- `~/ottoneu-db/.env`: `SUPABASE_URL`, `SUPABASE_KEY` (the secret key),
  `REVALIDATE_SECRET`, `HC_PING_KEY`, and optionally `OTTONEU_COOKIE`.
- `~/ottoneu-db/web/.env.local`: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SECRET_KEY` (both the secret
  key, as in the workflow), and `DISCORD_TOKEN`.

## Watch it

```bash
systemctl list-timers 'ottoneu-*'
journalctl -u ottoneu-live-worm -f
journalctl -u ottoneu-post-auctions -f
```
