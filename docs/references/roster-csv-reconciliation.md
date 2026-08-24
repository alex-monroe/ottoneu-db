# Roster CSV Reconciliation

The primary roster-state ingest for `league_prices`, since PR #691 removed the
Playwright search-page scrape entirely. It ingests Ottoneu's official
**CSV roster export** (fetched over plain HTTP with an honest User-Agent — see the
"Cloudflare" section of the `scraper-logic` skill) and reconciles it into the
database. Complementary to `scripts/scrape_player_cards.py`, which handles the
per-player transaction history over plain HTTP.

- **Module / CLI:** [scripts/reconcile_roster.py](../../scripts/reconcile_roster.py)
- **Recipe:** `just reconcile-roster [args]`
- **Workflow:** [.github/workflows/pull-roster-csv.yml](../../.github/workflows/pull-roster-csv.yml)
- **Prospect adoption helper:** [scripts/prospect_adopt.py](../../scripts/prospect_adopt.py)
  — new rostered ids adopt a matching prospect record when one exists (see
  `choose_prospect_to_adopt`).

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

### Inferences never duplicate a scraped move

This script owns `league_prices`; `scrape_player_cards.py` owns `transactions`.
Neither writes the other's table — so after the card scrape logs a move *with its
real timestamp*, the next reconciliation still sees a stale price row, re-derives
the same move, and (since the uniqueness key includes `transaction_date`) files a
second copy under the run date. That is how the 2026-08-23 run wrote 86 rows that
each duplicated a card row from 2026-08-22, burying real activity under what
looked like a day of frantic trading.

So before inferring, `_already_scraped` reads back the last
`TXN_DEDUPE_LOOKBACK_DAYS` (14) of **non-inferred** transactions and skips any
event already recorded there, matching on the whole move
(`player_id, type, salary, team`) rather than just the player. An inference dated
the run day is strictly worse than the same move with its true timestamp. The
lookback ignores this script's own prior output, so a genuine repeat (add → cut →
re-add at the same price) is still recorded, and a lagging or failed card-scrape
run still gets covered. `_print_summary` reports the skipped count.

The rows already written before this fix are suppressed on read instead, by
`web/lib/mcp/transactions.ts` — see
[the MCP server reference](mcp-server.md#reading-the-transaction-feed).

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

## Limitations

The CSV lists **only current rostered players**:

- **No free agents / FA average salary.** The removed Playwright search-page scrape
  used to capture the whole FA universe (`team_name="FA"` with an FA average salary).
  The CSV cannot. Existing FA rows go stale but are preserved; newly-cut players land
  at the `$1` FA placeholder. **There is currently no automated FA-average-salary
  refresh path** — this is the biggest gap left by #691.
- **No transaction history.** Real per-move dates / types come from
  `scripts/scrape_player_cards.py` (daily via `scrape-player-cards.yml`); this tool
  only *infers* transactions at run time (accurate only for same-day daily runs).

So the CSV path is the source of truth for **roster-state** (team + salary), and
`scrape_player_cards.py` supplies the transaction history — they run alongside each
other daily. FA universe / FA-average-salary refresh remains an open gap.

## Cloudflare: send an honest User-Agent (counter-intuitive)

The `/csv/rosters` endpoint is reachable from **datacenter IPs, including
GitHub-hosted runners** — the datacenter IP is *not* the blocker. What trips
Cloudflare's interactive challenge (403 "Just a moment…") is **impersonating a
browser**: a request whose User-Agent claims to be Chrome but has none of a real
browser's TLS/JS fingerprint reads as a bot. An honest automated client sails
through (this is the same lesson that let #691 replace the Playwright player-card
scrape with a plain-HTTP one):

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
