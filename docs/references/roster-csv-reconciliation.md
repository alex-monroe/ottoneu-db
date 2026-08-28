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

### Deduping against the player-card scrape

This script owns `league_prices`; `scrape_player_cards.py` owns `transactions`.
Neither writes the other's table — so after the card scrape logs a move *with its
real timestamp*, the next reconciliation still sees a stale price row, re-derives
the same move, and (since the uniqueness key includes `transaction_date`) files a
second copy under the run date. That is how the 2026-08-23 run wrote 86 rows that
each duplicated a card row from 2026-08-22, burying the auction under what looked
like a day of frantic trading.

Two mechanisms handle it, in order.

**1. The pre-filter (cheap path).** Before inferring, `_already_scraped` reads
back the last `TXN_DEDUPE_LOOKBACK_DAYS` (14) of **non-inferred** transactions and
skips any event already recorded there, matching on the whole move
(`player_id, type, salary, team`) rather than just the player. It ignores this
script's own prior output, so a genuine repeat (add → cut → re-add at the same
price) is still recorded. `_print_summary` reports the skipped count.

This only catches moves the card scrape has **already** written, so it does
nothing for an overnight move: the roster-CSV job is scheduled at 06:17 UTC and
the card scrape at 06:40, so on the morning after a move the card row does not
exist yet. That ordering is deliberate — reconciliation discovers and creates the
new player rows the card scrape then needs — which is why the pre-filter alone was
not enough to stop the auction duplicates.

**2. The purge (the guarantee).** `scripts/transaction_dedupe.py` runs at the end
of every `scrape_player_cards.py --apply`, once the authoritative rows are in, and
deletes each inferred row that a real card row supersedes. A card row supersedes
an inference when it describes the same move and is dated **on or before** it,
within 14 days:

- The direction matters. An inference is always filed on or after the move it
  describes, so a card row dated *later* is a separate, later occurrence and is
  left alone.
- Card rows are never deleted, only inferences.
- An inference with no card counterpart is **kept** — it is the only record of
  that move. Cuts are the common case: a cut player leaves the roster CSV, and
  the card scrape does not always carry the row either.

This makes the two writers converge regardless of which ran first, or if the card
scrape fails and catches up days later. Run it by hand with:

```bash
just dedupe-transactions            # dry run — reports what it would delete
just dedupe-transactions --verbose  # list each affected row
just dedupe-transactions --apply
```

The 98 duplicate rows written between 2026-08-22 and 2026-08-27 (86 of them from
the auction night itself) were cleaned up with this command.

Rows are additionally suppressed on read by `web/lib/mcp/transactions.ts` — see
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
