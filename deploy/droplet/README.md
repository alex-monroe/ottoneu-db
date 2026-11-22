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

## Install or update

```bash
cd ~/ottoneu-db && git pull && venv/bin/pip install -q -e .
sudo cp deploy/droplet/ottoneu-live-worm.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ottoneu-live-worm.timer
```

Secrets live in `~/ottoneu-db/.env` (mode 600, gitignored): `SUPABASE_URL`,
`SUPABASE_KEY` (the secret key), `OTTONEU_COOKIE`, `REVALIDATE_SECRET`.

## Watch it

```bash
systemctl list-timers ottoneu-live-worm.timer
journalctl -u ottoneu-live-worm -f
```
