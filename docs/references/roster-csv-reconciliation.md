# Roster CSV Reconciliation

A lighter-weight path to keep `league_prices` current when the Playwright roster
scrape is Cloudflare-blocked (see the "Authentication / Cloudflare" section of the
`scraper-logic` skill). Instead of crawling the search page, it ingests Ottoneu's
official **CSV roster export** and reconciles it into the database.

- **Module / CLI:** [scripts/reconcile_roster.py](../../scripts/reconcile_roster.py)
- **Recipe:** `just reconcile-roster [args]`
- **Workflow:** [.github/workflows/pull-roster-csv.yml](../../.github/workflows/pull-roster-csv.yml)
- **Shared helper:** prospect adoption lives in
  [scripts/prospect_adopt.py](../../scripts/prospect_adopt.py) (used by both this
  and `scripts/tasks/scrape_roster.py`).

## What it does

Source of truth for **current rostered players** is the export at
`https://ottoneu.fangraphs.com/football/{LEAGUE_ID}/csv/rosters` (columns: Team ID,
Team Name, Player ID, Pro Player, Player Name, Pro Team, Position(s), Salary). The
tool fetches or reads that CSV, diffs it against `players` + `league_prices`, and:

| Situation | Action |
|---|---|
| Rostered player, ownership/salary changed | Upsert `league_prices` (team + price) |
| Rostered player, team changed | Trade (a `move (from <old team>)` transaction) |
| Rostered player, was FA / no price row | Add |
| Owned in DB but **absent** from the CSV | Cut → `team_name='FA'`, price `1` |
| Player not in `players` yet | Adopt a matching prospect record, else create |

With `--infer-transactions` it also writes a `transactions` row per detected
cut/trade/add, **dated the run day**. On a *daily* run that date is accurate (diffs
are caught same-day). Rows follow the scraper's stored convention (`cut`, `add`,
`move (from <old team>)`; `from_team` null — the source team is encoded in the type
string) and carry an `inferred from /csv/rosters reconciliation` provenance marker in
`raw_description`. The unique constraint on
`(player_id, league_id, transaction_type, transaction_date, salary)` makes re-runs
idempotent.

## Usage

```bash
just reconcile-roster                                   # fetch + dry-run (no writes)
just reconcile-roster --apply                           # fetch + write league_prices
just reconcile-roster --file roster.csv --apply --infer-transactions
just reconcile-roster --apply --infer-transactions --date 2026-07-31
```

Flags: `--file` (read a local CSV instead of fetching), `--url` (override), `--cookie`
(raw Cookie header, or `OTTONEU_COOKIE` env), `--league-id`, `--apply`,
`--infer-transactions`, `--date`.

**Safety floor:** the tool refuses to apply a CSV with fewer than 20 rows or fewer
than 2 teams, so a truncated/garbled fetch can never mass-cut real rosters.

## Limitations — NOT a full scrape replacement

The CSV lists **only current rostered players**:

- **No free agents.** The search-page scrape captures the whole FA universe
  (`team_name="FA"`); the CSV cannot. Existing FA rows go stale but are preserved,
  and newly-cut players land at the `$1` FA placeholder (no FA average salary).
- **No transaction history.** Real per-move dates/types come from the player-card
  scrape; this tool *infers* them at run time (accurate only for same-day daily runs).

So the CSV path augments/replaces **roster-state** syncing but does not replace the
Playwright pipeline for FA pricing or historical transactions. It runs **alongside**
the existing `Scrape Player Data` workflow, not instead of it.

## Cloudflare: send an honest User-Agent (counter-intuitive)

Unlike the Playwright search-page scrape, the `/csv/rosters` endpoint is reachable
from **datacenter IPs, including GitHub-hosted runners** — the datacenter IP is *not*
the blocker. What trips Cloudflare's interactive challenge (403 "Just a moment…") is
**impersonating a browser**: a request whose User-Agent claims to be Chrome but has
none of a real browser's TLS/JS fingerprint reads as a bot. An honest automated client
sails through:

| User-Agent sent | Result |
|---|---|
| `Mozilla/5.0 … Chrome/120 … Safari/537.36` (browser spoof) | **403 challenge** |
| `curl/8.x` (curl default) | **200 + CSV** |
| `python-requests/2.x` | **200 + CSV** |
| `ottoneu-db-roster-csv/1.0 (+github…)` (what we send) | **200 + CSV** |

So both `scripts/reconcile_roster.py` and the workflow deliberately send a descriptive,
honest UA and **do not** impersonate a browser. No cookie or residential runner is
required. `OTTONEU_COOKIE` (secret / `--cookie`) remains only as an **optional escape
hatch** should Cloudflare ever start challenging plain clients too. The official Ottoneu
API is still the durable long-term source (see the `ottoneu-scrape-cloudflare-blocked`
project note).
