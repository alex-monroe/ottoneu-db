# Season Cycle — cross-season data & UI scheme

**Status:** In progress (PR #1 of 4 — foundation)

## Problem

The Ottoneu year is continuous: an NFL in-season plus a multi-stage offseason
(arbitration, keeper/cut, auction draft). The site must flip between seasons
seamlessly as the calendar advances while keeping prior-season data accessible.
Today "which season is current" is a hand-maintained `config.json` constant
(`SEASON`) plus two hand-typed dates — which go stale (as of 2026-06-01 the
config still said `SEASON: 2025`). Projection year was inconsistently
`SEASON+1` (Python) vs hardcoded `2026` (web) vs `eq("season", SEASON)` = 2025
(stats/VORP) — three different notions of "now".

## Core idea: one date-driven resolver; everything derives from it

Ottoneu's **finances page** (`/football/{league}/finances`) publishes a Calendar
section that *declares the current season label and every boundary date*:

```
These are the important dates for the 2026 season
Start of Season         - January 3, 2026     (annual rollover)
Start of Arbitration    - February 15, 2026
End of Arbitration      - March 31, 2026
Keeper Deadline         - July 31, 2026
Auction Draft           - (often "not set yet")
Start of Regular Season - September 4, 2026    (NFL Week 1)
Trade Deadline          - November 25, 2026
Last day to start auctions - December 30, 2026
```

So the Ottoneu "2026 season" runs **Jan 3 2026 → Jan 3 2027**. We scrape these
dates into a `league_calendar` table; a resolver maps `today → { phase,
leagueSeason, statsSeason, projectionSeason, … }`. The season is never inferred
— Ottoneu states it.

### The one advancing pointer — `leagueSeason`

`leagueSeason` = the Ottoneu season label = the row whose
`[season_start, next season_start)` window contains today. It increments once a
year at **Start of Season**. Everything else derives:

| Field | Rule |
|---|---|
| `leagueSeason` | calendar row with latest `season_start` ≤ today |
| `projectionSeason` | = `leagueSeason` (what projections target) |
| `statsSeason` | = `leagueSeason` if NFL games have started (≥ `regular_season_start`), else `leagueSeason − 1` (last completed) |
| `arbitrationSeason` | = `leagueSeason` |

### Phases (4, matching the offseason → in-season cycle)

Within season label Y:

| Phase | Window | Roster snapshot default | Featured |
|---|---|---|---|
| `pre_arb` | `season_start` → `arb_end` | today | arbitration planner (`arbWindowOpen` once ≥ `arb_start`) |
| `pre_keeper` | `arb_end` → `keeper_deadline` | today | keeper / cut tools |
| `pre_draft` | `keeper_deadline` → `regular_season_start` | **pre-draft** | auction / draft tools |
| `in_season` | `regular_season_start` → next `season_start` | today | live VORP / standings |

Snapshot flips to "pre-draft" exactly at the keeper deadline, per the spec.
`arbitrationSeason` data resets for free at rollover: arb tables are
season-scoped, so the resolver simply repoints to the new `leagueSeason`; the
prior season persists as history.

### Override

`SEASON_OVERRIDE` / `PHASE_OVERRIDE` env vars short-circuit the date math
(testing or off-schedule Ottoneu events). Date-driven by default, manual escape
hatch always available — this is the antidote to the stale-config problem.

## Data model — `league_calendar`

`(league_id, season)` PK. Columns: `season_start`, `arb_start`, `arb_end`,
`keeper_deadline`, `auction_date` (nullable), `regular_season_start`,
`trade_deadline`, `last_auction_date`, `raw` (jsonb label→string map for
resilience), `scraped_at`. Prior cycles persist as rows → historical access is
automatic.

## Sequencing (one PR each)

1. **Foundation (this PR):** `league_calendar` table + scraper
   (`scripts/scrape_league_calendar.py`, `just scrape-calendar`) + resolvers
   (`scripts/season.py`, `web/lib/season.ts`) with override + tests.
   Behavior-preserving — nothing consumes the resolver yet.
2. **Migrate call sites** off static `SEASON` → `statsSeason` /
   `projectionSeason` / `arbitrationSeason`. Removes the three-way "now" split.
3. **Phase-driven UI** — featured nav/landing per phase, roster snapshot default
   & bounds (`roster-reconstruction.ts` hardcoded `2025-09-01`/`today`), phase
   banner with next-boundary countdown.
4. **Cleanup** — remove static `SEASON` / `SEASON_END_DATE` / `PRE_ARB_DATE`
   from `config.json`.

## Wiring

- Scraper logs in via FanGraphs (`FANGRAPHS_USERNAME`/`PASSWORD`), parses the
  finances Calendar section, upserts one row per season label. Add to the cron
  pipeline alongside the other scrapers.
- Resolvers read `league_calendar` (web via Supabase client, Python via the
  shared client) with an in-memory fallback so a missing/partial row degrades to
  month-based phase inference rather than hard-failing.
