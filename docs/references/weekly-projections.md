# Weekly Projections

Per-game fantasy projections for the upcoming NFL week, ingested from a third
party and re-scored under this league's rules.

## Why this is not the seasonal projection

The site has two projection systems that answer different questions, and keeping
them apart is a design requirement, not a stylistic preference:

|                | Seasonal (`player_projections`)          | Weekly (`weekly_projections`)              |
| -------------- | ---------------------------------------- | ------------------------------------------ |
| Question       | "what is this player worth?"             | "should I start him Sunday?"               |
| Unit           | `projected_ppg` — points **per game**    | `projected_points` — points in **one game** |
| Origin         | our own feature model, **market-free**   | a third party, **market-aware**             |
| Produced       | once, early offseason                    | daily, in season                            |
| Attribution UI | `<ActiveModelCard>` (model + features)   | source name + "as of" timestamp            |
| MCP tool       | `get_projections`                        | `get_weekly_projections`                    |

The differently-named value columns are the enforcement mechanism: nothing can
accidentally compare `projected_ppg` to `projected_points`, in our code or in an
LLM consuming the MCP payload.

### Weekly projections must never feed the seasonal model

`scripts/feature_projections/` is deliberately market-free — the same reason
FantasyPros and ADP are eval-time comparators only, never inputs. Weekly
projections are a market-aware third-party forecast. Reading them from inside
the model would leak market information and silently invalidate every held-out
evaluation, because the "held-out" seasons would carry a signal derived from what
the market already knew.

This is mechanically enforced by `TestNoWeeklyProjectionsInModel` in
`scripts/tests/test_architecture.py`, which fails `just check-arch` if anything
under `scripts/feature_projections/` imports `scripts.weekly_projections` or
mentions the `weekly_projections` table.

## Source: Sleeper

[docs.sleeper.com](https://docs.sleeper.com/) states the read-only HTTP API is
**"free to use for non-commercial purposes"** (commercial use requires
contacting them for licensing). This league's private analytics site is
non-commercial, so we have explicit permission rather than merely an absence of
blocking.

No API key, no login, no browser automation, and an **honest identifying
User-Agent** — we do not spoof a browser to get past anything.

```
GET https://api.sleeper.com/projections/nfl/{season}/{week}?season_type=regular&position[]=QB…
GET https://api.sleeper.com/stats/nfl/{season}/{week}?season_type=regular&position[]=QB…
```

Both return the same row shape, which is why actuals cost almost nothing on top
of projections.

### Known caveat: permitted, but undocumented

These two paths are open and unauthenticated on the same public API the
permission grant covers, but they are **not in Sleeper's published endpoint
docs** (those cover leagues, users, drafts and players). Permission is clear;
**stability is not promised** — the response shape could change without notice.

Two mitigations:

1. **Fail loudly.** `sources/sleeper.py::validate_payload` raises
   `SleeperSchemaError` on an empty payload, a missing `stats` object, or a stat
   dict containing none of the expected keys. A renamed key would otherwise map
   to nothing, score every player at `0.0`, and quietly overwrite a good week
   with zeroes that look like real data on the player cards.
2. **A pluggable source layer.** `scripts/weekly_projections/sources/` takes one
   module per provider, all normalising to `WeeklyRow`. Swapping to or adding
   the FantasyPros official API (a paid personal key, explicitly licensed for
   non-commercial use) is a new module plus a `--source` flag, not a rewrite.

If a run fails on the schema check:

```bash
just weekly-projections-probe --season 2025 --week 1
```

That dumps a live payload, prints every observed stat key split into mapped and
ignored, warns about mapped keys that have disappeared, and saves a fixture to
`scripts/tests/fixtures/`. Update `_STAT_MAP` from what it prints.

## Scoring

We take the **stat line** and apply Ottoneu scoring ourselves — never the
source's own fantasy point total, which is scored under the source's rules.

The gap is real: Ottoneu pays field goals on a distance ladder (3 / 4 / 5 points
for 0-39 / 40-49 / 50+ yards) where most sites pay a flat 3. Sleeper reports
finer distance bands than Ottoneu scores, so the short bands **sum** into
`fg_made_0_39`.

`scripts/weekly_projections/scoring.py` reads its multipliers straight from
`SCORING_SETTINGS` in `config.json`, and our normalised stat keys *are* the
`SCORING_SETTINGS` keys, so scoring is a dot product and a scoring change
propagates without a code edit.

## The NFL-week resolver

The repo previously had no notion of an NFL week. `scripts/nfl_week.py` and its
TypeScript twin `web/lib/nfl-week.ts` are the single source of truth.

- **Anchor:** derived from `league_calendar.regular_season_start`, but **not by
  subtracting two days**. Ottoneu's recorded start is not reliably the Thursday
  kickoff — the real 2026 value is **Wednesday 2026-09-09** while Week 1 Thursday
  is 2026-09-10. `_anchor_from_start` snaps forward to the first Thursday on or
  after the recorded date, then steps back to that week's Tuesday, so Monday,
  Tuesday, Wednesday and Thursday values all resolve to the same anchor. A blind
  subtraction would put the boundary on a Monday and push Week 1's Monday-night
  game into Week 2.
- **Boundary: Tuesday 00:00 America/New_York.** An NFL week's games run Thursday
  night through Monday night, so the slate flips the morning after the
  Monday-nighter:

  ```
  week = floor((today - (week1_thursday - 2 days)) / 7) + 1
  ```

- Dates before Week 1's Tuesday clamp to Week 1; past Week 18's Monday there is
  no current week and the resolver returns `None`.
- Timezone matters: a naive UTC "today" rolls over at 7-8pm ET and would flip
  the week mid-game. Always resolve through `today_in_league_tz` /
  `todayInLeagueTz`.
- `display_weeks()` returns the `{upcoming, previous}` pair the player card
  renders — the previous week deliberately stays visible after its games are
  played, with the actual result beside the projection.
- `NFL_WEEK_OVERRIDE` short-circuits the resolved week for testing or an
  off-schedule situation, mirroring `SEASON_OVERRIDE`.

### Which NFL season a week belongs to

The season is resolved from **which kickoff date we sit between**
(`resolve_window` / `resolveWindow`), not from the active league-calendar row,
because the league calendar and the NFL schedule disagree twice a year:

- **Early January.** Ottoneu rolls its league season around Jan 3, but NFL
  Week 18 is played a day or two later. Taking the season from the active row
  would label those games with the *next* season — and the retention purge would
  then delete the very week the player cards are showing.
- **All summer.** The active row's `stats_season` is last year, but the upcoming
  slate is this year's Week 1.

### Gating in-season jobs

For the same reason, **gate on `is_nfl_week_live()`, not on the league phase**
from `scripts/season.py`. The phase is already `pre_arb` while Week 18 is being
played, so a phase gate would silently skip the final week of the season. The
workflow uses `is_nfl_week_live`.

`scripts/tests/fixtures/nfl_week_boundaries.json` is a boundary table read by
**both** test suites, so the Python and TypeScript twins cannot drift apart
without one of them going red. It covers the single-season week boundaries and
the multi-season season-attribution cases above.

## Data quality

Three behaviours worth knowing, all found by running the first real ingest and
all covered by tests:

- **Players with no projected stats are skipped.** Sleeper returns its whole
  player universe (~3,200 rows for QB/RB/WR/TE/K), most of it not actually
  projected. On a real slate these split cleanly: every row with a scoring stat
  also carries an opponent, and every row without one has neither. Week 1 of 2025
  was 344 real projections out of 869 candidate rows. Writing the rest would
  roughly triple the table with `0.0` rows that read as real projections on the
  board, and would make "missing = bye or inactive" — which the UI and the MCP
  note both promise — untrue.
- **Duplicate matches are collapsed, keeping the highest-scoring row.** Sleeper
  carries duplicate, retired, and practice-squad records under the same name, and
  the fuzzy matcher lands them on one `player_id` (29 collisions in 2025 Week 1).
  PostgREST rejects such a batch outright — *"ON CONFLICT DO UPDATE command
  cannot affect row a second time"* — so the whole week fails to write unless
  they are collapsed first.
- **Only players with `ottoneu_id > 0` are matched.** The `players` table holds
  ~2,500 historical placeholder rows with negative ids, many of them duplicates
  of a real player carrying a stale NFL team. Matching against them produced
  ~780 bogus rows pointing at records the web layer filters out and whose player
  pages do not exist. This is the same filter `fetchPlayerList` and
  `fetchRosterData` already use.

### Expected coverage

About **84% of rostered players** have a projection in a live week (2026 Week 1).
The rest are genuinely unprojected: suspended players, backup QBs, PUP/injured,
and players not in the NFL that season. Backtesting an old season against a
current roster scores lower (72% for 2025 Week 1) for the same reason — several
rostered players had not entered the league yet.

Validated against 2025 Week 1 actuals: **correlation 0.73, MAE 3.6 points**,
which is the expected range for weekly fantasy projections.

## Retention

Ingest purges seasons older than the current one. A full season is roughly 600
players × 18 weeks — a couple of megabytes — so keeping the whole season buys
week-over-week trends and season-long projected-vs-actual for free, while the
table never grows year over year.

## Commands

```bash
just weekly-projections                              # current week's projections
just weekly-projections --week 3 --season 2025
just weekly-projections --actuals --week 2           # backfill a played week
just weekly-projections --week 1 --season 2025 --dry-run
just weekly-projections-probe --season 2025 --week 1 # confirm the payload shape
```

Automated by `.github/workflows/pull-weekly-projections.yml`: daily at 11:00 UTC
(~7am ET), **gated on `is_nfl_week_live()`** so it is a no-op all offseason
(and, unlike a league-phase gate, still runs through Week 18). Each scheduled run ingests the current week's projections and
backfills the previous week's actuals. A `workflow_dispatch` run skips the gate
so a specific week can be backfilled at any time.

## Surfaces

- **`/weekly`** — the full board for a week, filterable by week and position,
  with salary and owner joined in. Gated on projections access.
- **Player card** (`/players/[id]`) — `<WeeklyProjectionCard>` shows the upcoming
  week and the previous week side by side, the latter with its actual result.
- **MCP `get_weekly_projections`** — `week`, `season`, `position`, `team_name`
  (`"FA"` for free agents), `min_points`, `limit`. The response carries
  `source`, `as_of`, `scoring`, and a `note` telling a consuming agent not to
  confuse it with `get_projections`.
- **MCP `get_player`** — also returns a `weekly_projections` block with the
  upcoming and previous week, nested separately from the seasonal `projection`.

## Known limitations

- **Bye weeks are indistinguishable from inactives.** A player with no row for a
  week renders as "—" with a "no projection (bye or inactive)" note. Telling the
  two apart needs an NFL schedule table; nflverse schedules download from hosts
  already on the devcontainer allowlist, so this is a clean follow-up.
- **Kicker coverage** depends on Sleeper's kicker stat keys matching `_STAT_MAP`.
  All twelve Ottoneu scoring categories have a mapping, but the kicker bands are
  the least certain part of it — the probe command settles it.
- **The `players` table has no external IDs** (only `ottoneu_id` and `name`), so
  matching goes through the shared normalised-name + position + fuzzy matcher in
  `scripts/feature_projections/external_sources/player_matcher.py`. Unmatched
  names are printed on every run; add aliases to `scripts/name_utils.NAME_ALIASES`.

## Local development

`api.sleeper.com` is on the devcontainer egress allowlist
(`.devcontainer/allowed-domains.txt`). If it was added after your container
started, re-run `sudo .devcontainer/init-firewall.sh` or rebuild the container,
or the fetch will hang and fail.
