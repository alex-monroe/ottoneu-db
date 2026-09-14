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

### Deduping against the player-card scrape

This script owns `league_prices`; `scrape_player_cards.py` owns `transactions`.
Neither writes the other's table — so after the card scrape logs a move *with its
real timestamp*, the next reconciliation still sees a stale price row, re-derives
the same move, and (since the uniqueness key includes `transaction_date`) files a
second copy under the run date. That is how the 2026-08-23 run wrote 86 rows that
each duplicated a card row from 2026-08-22, burying the auction under what looked
like a day of frantic trading.

Three mechanisms handle it, in order. The first two match *duplicate* moves; the
third catches the worse failure, an inference that **contradicts** the real
history rather than restating it (see
[Impossible moves](#impossible-moves-the-roster-state-machine)).

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

Both readers decide "inference or testimony?" from a marker string stamped into
`raw_description`. That marker is a **contract with the rows already written**:
its wording changed once, and the 80 rows carrying the older phrasing were
silently reclassified as real card history — exempt from the purge, and trusted by
`_already_scraped` as proof a move had happened. `INFERRED_MARKERS` in
`scripts/transaction_dedupe.py` (and its twin in `web/lib/mcp/transactions.ts`)
therefore lists every wording ever written. Write with `INFERRED_MARKER`, read
with `is_inferred` — never compare against the single constant.

### Impossible moves: the roster state machine

Deduping assumes the inference at least describes a *real* move. The 2026-07-31
backfill broke that assumption: `league_prices` was empty, so the CSV diff read
every one of 80 rosters as brand new and filed 80 phantom adds, cuts and trades.
None of them duplicated a card row — they contradicted one. Jonathon Brooks had
sat on Tinseltown Little Gold Men since 2025-08-24 and was recorded as *added* by
that same team eleven months later.

A player's status in a league is a small state machine, and that is enough to
catch all of it:

```
          add(T)                 cut(T)
  FA  ─────────────────▶  OWNED(T)  ─────────────────▶  FA
                             │  ▲
                move(T→U)    │  │  increase(T)   (salary changes,
                             ▼  │                 ownership does not)
                         OWNED(U)
```

Every legal edge is drawn above; anything else is impossible in the real league
and therefore a data bug. A rostered player cannot be added again — he has to be
cut first. Nobody can cut a free agent. A trade must originate from the team that
actually holds him.

#### The salary axis

Ownership is only half of what an edge carries. Each one also makes a claim about
the money, and the league's own history shows those claims are just as strict —
every count below is over the full log, with **zero exceptions**:

| invariant | evidence |
| --- | --- |
| A trade moves the contract intact — the salary never changes | 114 trades |
| An `increase` must actually increase the salary | all increases |
| A `cut` records the **cap penalty**, `ceil(salary/2)` — not the salary | 317 cuts |

The last one is a different instrument from the rest. It matches the cut rule in
[ottoneu-rules.md](ottoneu-rules.md) ("half the player's salary, rounded up"), and
because it is derived from a number the log tracks independently, it works as a
**checksum on the salary the log believes a player carries**. If an arbitration
raise went missing, the penalty on the eventual cut will not line up.

That distinction drives how findings are handled:

- **Ownership rules** find rows that should not be there. On an inferred row,
  deleting it *is* the fix.
- **Salary rules** find rows that are **not** there — a gap no deletion can close.
  So they are report-only, even on an inference, and the report points at
  `just scrape-player-cards --apply` instead.

Inferred cuts are exempt from the checksum: `reconcile_roster` writes the salary
into that column, having no penalty to observe. Note that this means the `salary`
column on a cut row carries two different meanings depending on the writer — the
penalty on a card row, the salary on an inference.

The two axes are known independently, too. A history that opens mid-stream can
establish a salary before it establishes an owner, so `would_violate` gates them
separately rather than bailing out on the first unknown.

**Rejected as a rule:** Ottoneu blocks a team from re-acquiring a player it cut
for 30 days, but the annual auction cuts straight through it — four of the
league's re-adds are 22–26 days after the cut, all landing on auction day. A rule
with real exceptions is worse than no rule in a pipeline that deletes.

`scripts/transaction_state_machine.py` replays the log per player and reports what
the machine refuses. Two properties make it safe to run automatically:

- **Repair is one-directional, on one axis.** A row is deleted only if it is an
  *inference* **and** it breaks an *ownership* rule. A **card** row that violates
  the machine is Ottoneu's own history contradicting itself — our parse or our
  model of the league is wrong — so it is reported loudly and never touched. Both
  cases exit nonzero.
- **It repairs to a fixpoint.** A bad row can hide the next one. D'Andre Swift's
  phantom trade on 07-31 put him back on a roster he had already been cut from,
  which made the phantom cut filed on 08-01 look perfectly legal; only removing
  the trade exposed it. Each pass replays what is left until a pass finds nothing.

Ordering matters, because it decides which row is at fault. `transaction_date` is
a DATE, so same-day moves tie; the card's wall clock (`Aug 22, 2026 9:26 PM`,
kept verbatim in `raw_description`) breaks the tie, and a clockless inference
sorts *after* the card rows of that day — it is dated the reconciliation run, so
whatever it describes had already happened.

The same rulebook runs at both ends, which is the point:

- **Write time.** `build_transaction_rows` asks `would_violate` whether an event
  is even possible against the state the **card** history implies, and drops it if
  not. Inferences are excluded from that state deliberately: letting a guess vouch
  for the next guess is how a desync becomes permanent. The `league_prices`
  correction still lands — we drop the false *story*, not the ownership fix.
- **After the fact.** `purge_inferred_violations` runs at the end of every
  `scrape_player_cards.py --apply`, right after the dedupe purge.

```bash
just check-transactions            # dry run — replay and report
just check-transactions --verbose  # list every affected row
just check-transactions --apply    # delete the inferred rows that break the machine
```

The 105 impossible rows written between 2026-07-31 and 2026-09-02 were cleaned up
with this command; the log now replays with zero violations and its final state
agrees with `league_prices` on all 377 players it covers.

### The blast-radius ceiling

The deeper cause was volume: one run inferred moves for a quarter of the league
and nothing questioned it. A daily diff of a 12-team league is a handful of moves;
the day it is 80, `league_prices` has desynced and the reconciler is *discovering*
rosters, not watching them change. `MAX_INFERRED_SHARE` (0.25) withholds the whole
inferred batch past that threshold. Ownership is still reconciled — that is the
fix — and the run says so, pointing at `just scrape-player-cards --apply` to
supply the real history.

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
