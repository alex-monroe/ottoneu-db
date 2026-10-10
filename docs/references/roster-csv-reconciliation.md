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
of every *complete* `scrape_player_cards.py --apply` (see
[Rate limiting](#rate-limiting-the-card-scrape-http-429) for when it is skipped),
once the authoritative rows are in, and
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
  complete `scrape_player_cards.py --apply`, right after the dedupe purge.

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

## Rate limiting: the card scrape (HTTP 429)

From 2026-10-02 the daily card scrape failed every run with
`5 consecutive Cloudflare challenges … (HTTP 429)`. Nothing in the repo had
changed: Ottoneu's Cloudflare had started **rate-limiting** the `player_card`
endpoint. The single-request `/csv/rosters` pull is unaffected.

What a 429 looks like (measured 2026-10-10, honest UA, one client):

| Question | Answer |
|---|---|
| Is it a genuine rate limit? | Yes — request 1 gets a 200; the 31st request at ~1.2 req/s (the old `--sleep 0.4`) got the 429. It is a Cloudflare *rate-limiting rule whose action is a challenge*: `cf-mitigated: challenge` and a "Just a moment…" body, but status **429**, not the 403 a refused client gets. |
| `Retry-After`? | **Not sent.** The wait is ours to choose. |
| How long does the block last? | About **5 minutes** from the first 429 (still blocked at 4.5 min, clear at 5.3). |
| What pace is safe? | A 3s sleep (~17 req/min) sustained 80 consecutive requests. |
| Anything else? | Cloudflare often truncates the 429 body, so reading it raises `ChunkedEncodingError` — the status has to be checked before the body. |

Two bugs in the old loop turned a throttle into a week-long outage:

- **A 429 was filed as a challenge.** The body markers matched, so it raised
  `CloudflareBlockedError` — the "your client is refused, give up" path — and the
  error message sent the reader to check the User-Agent, which was fine.
- **It only slept after a success.** Once the 429s began, the remaining cards
  were requested as fast as the network allowed, which is how a run burned through
  its five-strike abort in under a second instead of waiting the block out.

How `scrape_player_cards.py` behaves now:

- **`RateLimitedError` (429) vs `CloudflareBlockedError` (403 / challenge body).**
  Status wins over body markers. Exit codes differ so a red run says which wall
  it hit: `3` rate-limited, `2` challenged, `1` incomplete (some card failed).
- **Paced.** `--sleep` defaults to 3s and applies before *every* request,
  whatever the previous one returned.
- **Backs off and retries the same card.** On a 429 it waits `Retry-After` if one
  is ever sent, else 5 → 10 → 15 → 15 minutes, then aborts. No card is skipped
  because of a throttle.
- **Does less.** `--recent-days N` only fetches players who can have new history:
  those with an **inferred** transaction in the window (reconciliation notices
  every add/cut/trade and files one — the inferences *are* the work queue, and the
  purge drains it) or a `league_prices` row created in it. Typically a few dozen
  cards instead of ~1,270. `league_prices.updated_at` is **not** a usable signal:
  nothing bumps it, so it equals `created_at` on every row.
- **Weekly full sweep.** The daily signal cannot see a same-team salary change
  (arbitration `increase` rows — reconciliation updates the price without filing a
  transaction) or a move whose inference was withheld, so the workflow runs the
  whole player list on Mondays (~75 minutes at the safe pace).
- **Purges only after a complete run.** If the scrape aborted or any card failed,
  both purges are skipped. The state-machine pass deletes an inference that
  contradicts the card history, and an unfetched card is history we do not have —
  a real add looks impossible while the cut before it is still unscraped. Rows
  already upserted are kept; the next clean run purges.

The limit was measured from one IP on one day; GitHub's runners may see a
different budget, and Cloudflare rules change. If 429s return, raise `--sleep`
before anything else.

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
