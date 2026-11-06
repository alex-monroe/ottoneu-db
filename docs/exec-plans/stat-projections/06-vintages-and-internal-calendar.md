# 06 - Vintages, as-of data audit and the League 309 decision calendar (internal research)

Date: 2026-11-05. Research agent report, saved verbatim in substance.
Dates marked (est) are estimates; NFL offseason dates here are from memory. The
verified NFL calendar is in [05-information-calendar-external.md](05-information-calendar-external.md).

## Headline findings

1. **The site cannot show 2027 projections today.** `scripts/season.py` and `web/lib/season.ts` resolve the season from the `league_calendar` row whose `season_start <= today`. Only the 2026 row exists, so `projection_season` stays 2026 until Ottoneu publishes the 2027 row (about 2027-01-03..05). Publishing 2027 now needs a **"published projection season" pointer** separate from `league_season`. `SEASON_OVERRIDE` is global, so it is unsuitable.
2. **The auction comes before the NFL cutdown**, so an early-September vintage is too late for it. The keeper deadline and auction fall after the draft but before the 53-man cut, so they need a **camp vintage (about Aug 15)**.
3. **Arbitration straddles free agency.** The window (Feb 15 - Mar 31) opens before FA (about Mar 10) and closes before the draft, so it needs the post-season and post-FA vintages.

## 1. League 309 decision calendar (`league_calendar`)

| Milestone | 2026 (stored) | 2027 (est) |
|---|---|---|
| Season start | Jan 3 | about Jan 3-5 |
| Arbitration | Feb 15 - Mar 31 | same fixed window |
| Salary reset / cut wave | Apr 1 | Apr 1 |
| Keeper deadline | Jul 31 | Jul 31 |
| Auction | Aug 22 (Sat) | about Aug 21 (Sat) |
| Regular season start | Sep 9 | Sep 9 |
| Trade deadline | Dec 1 | about Nov 30 |
| Last auction day | Dec 30 | about Dec 29 |

How 2027 was estimated: fixed dates copy the month and day; weekday-anchored dates shift to the same weekday.
Doc drift: `ottoneu-rules.md:67` and `ottoneu-strategy.md:174` say the trade deadline is "day before Thanksgiving". The calendar says Dec 1 (after NFL week 12), and `keeper-value.md` agrees.
Cuts are penalty-free until the keeper deadline, which is why the cut wave follows the Apr 1 salary reset.

## 2. As-of (point-in-time) data audit

| Input | Can we rebuild "known at date D"? | Fill |
|---|---|---|
| `nfl_stats` | Season grain, regular season only, no 2026 rows. Cannot give "weeks 1-10 of T-1" | nflverse `stats_player_week_{1999..2026}`. The 2010 and 2025 files share the same 150 columns; in 2025, weekly rows match the season file's `games` for 610/610 QB/RB/WR/TE rows |
| `depth_charts` | One opening-day tier per season | 2016-2024: weekly tiers (week 1+), no dates. 2025+: dated snapshots (`dt`, Aug 2025 to Mar 2026). There is no historical offseason depth chart before 2025, so use a proxy |
| `team_vegas_lines` | **Leaks.** Built from closing per-game lines; 2016-2025 `win_total` is back-calculated (Pythagorean). Only the 2026 preseason win totals are real | No nflverse source for historical preseason win totals. A spike is needed |
| Team as of May of year T | `players.nfl_team` is current-only; there is no dated FA signing log in nflverse | `roster_weekly` (2002+) gives week-1 team and status without dates; `draft_picks` gives the drafting team; the `trades` release is dated; `historical_contracts` has `year_signed` and today's team only. Proxy: the week-1 team of T, allowing only move events known by D, plus a "no move info" stress variant |
| `transactions` | Ottoneu-only, from Aug 2025 | — |
| `draft_capital` | Exact from the post-draft vintage | — |
| `team_coaching` | Season-opening coach; change dates missing (proxy) | Head-coach hire dates |
| `players` | No `gsis_id`; matching is by name | Add `players.gsis_id` |

## 3. Vintage design

| Vintage | As-of date | Adds |
|---|---|---|
| V0 | Tuesday after NFL week 10 of T-1 (live: 2026-11-17), refreshed weekly | T-1 weeks 1-10+ |
| V1 | Feb 15 | Full T-1 season, coaching hires |
| V2 | Mar 31 | Free-agency moves |
| V3 | May 1 | Draft capital, rookie landing spots |
| V4 | Jun 15 | Schedule, win totals |
| V4b | Aug 15 | Camp depth charts (only exists 2025+) |
| V5 | Sep 8 | Cutdown rosters, week-1 depth chart |

**Harness:** folds become (train seasons, eval season, vintage). Training uses same-vintage features from earlier seasons. Add the vintage and a data hash to the `holdout_cache` key. Report a model × vintage table, plus a paired-bootstrap **value of information** between adjacent vintages. Add a leakage test that perturbs post-`as_of` rows and asserts the predictions don't change.

**Storage:** neither projection table can carry a vintage. `model_projections` is unique on (model, player, season), and `promote.py` deletes and re-upserts, so history is destroyed on each run. Proposed:
- a `projection_vintages` table plus a nullable `vintage_id` on `model_projections`;
- an append-only `player_projection_history`;
- `player_projections` kept as the "current published" pointer.

**Site:** a banner showing the current vintage and the next refresh, plus each player's change since the last vintage.

## 4. Weekly data

- Extras in the weekly files:
  - Fumbles lost: `sack_fumbles_lost`, `rushing_fumbles_lost`, `receiving_fumbles_lost`, and a `fumbles_lost_total`.
  - 2-pt: `{passing,rushing,receiving}_2pt_conversions`.
  - Kicks: `fg_att`, `fg_missed*`, `pat_att`, `pat_missed`.
  - Pass attempts are `attempts`; rush attempts are `carries`.
- `fumbles_lost_total` (249 in 2025) exceeds the sum of the three components (213). The gap is return fumbles. `scripts/scoring.py` deliberately uses the total, matching the play-by-play rebuild.
- Proposed `nfl_weekly_stats` table (about 200k rows for 2010-2026) with `game_date`, plus a parity test against `nfl_stats`.

## 5. Minimum ingestion, in priority order

1. `players.gsis_id` plus the weekly backfill (2010-2026).
2. A team-season volume table from play-by-play.
3. `rosters_weekly` and `trades` tables.
4. Vintage migrations plus `as_of` functions.
5. A spike on historical preseason win totals (decides whether V4 is credible in backtests).
6. Head-coach change dates.

Deferred: dated depth snapshots, injuries, and a dated FA transaction scrape (reachability untested).

**Backtest feasibility, 2018-2025:**
- Exact: V0, V1, V5.
- V3: exact for the draft, proxy for player moves.
- V2: proxy.
- V4: credible only if the win-totals spike succeeds.
- V4b: 2025 only.
