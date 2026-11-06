# 07 - Projection calendar: publishing 2027 now and improving it as information arrives

Date: 2026-11-05. Combines [05](05-information-calendar-external.md) (NFL calendar, data release timing, evidence on value) and [06](06-vintages-and-internal-calendar.md) (League 309 decision dates, as-of data audit, vintage design).

**Goal (owner, 2026-11-05):** publish 2027-season stat projections now, and make them progressively better as each piece of information lands. Each refresh is a **vintage**: a projection of season T made with only what was known on date D. Kicker accuracy is out of scope.

Legend:
- **Value:** expected accuracy gain. H/M/L are reasoned priors from 05 §3. Little dated public evidence exists, so the vintage harness will *measure* these (see "Making the value column empirical").
- **Data:** ✅ in the DB, 🔧 ingestion needed, 📈 market input (in scope since 2026-11-05; see "Market inputs" below).
- Dates: [V] = announced, [T] = typical window or derived from 2026, (est) = estimated from the 2026 `league_calendar` row.

## Timeline: 2026-11-05 → Week 1 of 2027

| Date | Event | Information gained | Component | Value | Vintage | League 309 decision | Data |
|---|---|---|---|---|---|---|---|
| **Now (Nov 5, 2026)** | First 2027 projection | 2010-2025 history + 2026 weeks 1-9 | All | — | **V0** (weekly) | — | ✅ season stats; 🔧 2026 weekly stats |
| Nov 10 [V] | NFL trade deadline | Mid-season team changes | Role, team volume | L-M | V0 | — | 🔧 nflverse rosters/trades |
| Nov 2026 - Jan 10, 2027 | Rest of the 2026 season, injuries | Final 2026 roles and shares, injuries (ACL clocks), efficiency | Availability, role, efficiency | **H**: the base prior for 2027. Late-season data matters most for RB/TE | V0, refreshed weekly | Ottoneu trade deadline about Nov 30 (est); last auction day about Dec 29 (est) | 🔧 weekly stats, injuries |
| Jan 3-5, 2027 (est) | Ottoneu 2027 season starts | `league_calendar` 2027 row appears; the site resolver rolls over | — | — | — | Season rollover | ✅ scraper |
| Jan 11 [T] onward | Black Monday; coach and coordinator hires through Feb | Scheme, pace, pass rate, play-caller | Team volume, role | M-H (effect size undocumented) | V1 | — | 🔧 coach change dates (`team_coaching` has season-level only) |
| Feb 14 [V] | Super Bowl LXI | Season fully complete | — | — | — | — | — |
| **Feb 15** | Full 2026 season + coaching | — | — | — | **V1** | **Arbitration opens** (Feb 15 - Mar 31) | ✅/🔧 |
| about Feb 14-20 [T] | First 2027 win totals | Market team-strength prior (miss actual wins by about 2.2 on average) | Team volume | M-H, team level | V1 → V2 | Arbitration | ✅ `team_vegas_lines.win_total` (seeded manually, as in 2026) |
| Feb 17 - Mar 3 [V] | Franchise tag window | Who stays | Role | M | V2 | Arbitration | 🔧 OverTheCap/nflverse contracts |
| Mar 1-8 [V] | Combine | Athletic testing for rookies | Rookie prior | L (WR/TE), M (RB) | V3 | — | 🔧 nflverse combine |
| Mar 9-11 [V] | Negotiating window → free agency opens Mar 11 | New team or QB; vacated targets and carries | Team volume, role, efficiency | **H**: RBs who change teams lose about 7-17% per game; WR results mixed; QB moves dominate passing outcomes | V2 | Arbitration (closes Mar 31) | 🔧 rosters/transactions with dates |
| **Mar 31** | Post-FA rosters | — | — | — | **V2** | **Arbitration closes** | |
| Apr 1 | Ottoneu salary reset | — | — | — | — | Cut wave (penalty-free until the keeper deadline) | |
| Apr 29 - May 1 [V] | **NFL Draft** (Washington D.C.) | Rookie draft capital and landing spot; vacated roles become clear | Rookie prior, role | **H** for RB rookies, M for WR/TE/QB | V3 | Cut decisions | ✅ `draft_capital` (refresh after the draft) |
| **May 1** | Post-draft | — | — | — | **V3** | — | |
| about May 14 [T] | 2027 schedule release | Opponents, byes, per-game lines later | Team volume (small) | L-M | V4 | — | 🔧 nflverse schedules |
| Feb 1+ / May - Aug | Best-ball ADP (from about Feb), expert projections, season-long player props (from about May) | Market per-player priors | Volume, efficiency, role | M-H, sharpening toward August | V1 (ADP) → V4/V4b (props, expert) | Arbitration (ADP), keeper deadline, auction | 📈 🔧 dated snapshots |
| Late May - mid Jun [T] | OTAs, minicamp | First-team reps, early injuries | Role, availability | L-M, hype-prone | V4 | — | — |
| **Jun 15** | Schedule + updated win totals | — | — | — | **V4** | — | |
| Late Jul [T] | Training camp opens | Starter battles, injuries | Role, availability | Injuries M, hype L | V4b | **Keeper deadline Jul 31** | 🔧 dated depth charts (nflverse snapshots, 2025+) |
| **Aug 15** | Camp depth charts | — | — | — | **V4b** | — | |
| about Aug 21 (est) | — | — | — | — | V4b | **Ottoneu auction** (before the NFL cut to 53) | |
| about Aug 31 [T] | Cut to 53, IR placements | Final rosters | Availability, role | M | V5 | — | 🔧 rosters |
| **Sep 8** | Week-1 depth charts | — | — | — | **V5** | In-season FA | 🔧 |
| Sep 9 [T] onward | 2027 weeks 1-4 | First 2027 usage | All | **H** from weeks 3-4 | In-season (future) | Lineups, FA | 🔧 weekly stats |

## What this means for the build

1. **The Feb 15 and Mar 31 vintages (V1/V2) matter most to League 309**, because they cover arbitration. Free agency lands *inside* the arbitration window, so the V2 refresh around Mar 12-15 should be timed to the FA rush, not left until Mar 31.
2. **The keeper deadline and auction come before the NFL cut to 53**, so the camp vintage (V4b) is the one auction prices rely on.
3. **V0 needs weekly stats.** The rest of the 2026 season is the single most valuable input, and `nfl_stats` is season-grain only. Ingesting nflverse weekly stats (`stats_player_week`, 2010-2026) is the first data task.
4. **Publishing 2027 now needs a separate "published projection season" pointer.** The site's season resolver won't roll to 2027 until Ottoneu creates the 2027 `league_calendar` row in early January.
5. **Projections must keep their history.** `model_projections` is unique on (model, player, season), and `promote.py` overwrites. Add a vintage key and an append-only history, so the site can show "what changed since the last refresh".

## Making the value column empirical

For each backtest season 2018-2025, rebuild every vintage from as-of data and score it in the rolling harness. The paired-bootstrap delta between adjacent vintages (V1 vs V0, V2 vs V1, and so on) is the **measured value of that information window**, per position and per stat. This turns the H/M/L guesses above into numbers, and it says where data effort pays off.

Backtest feasibility (06 §5):
- Exact: V0, V1, V5.
- V3: exact for the draft, proxy for player moves.
- V2: proxy (week-1 team of T, with only known moves allowed).
- V4: needs historical preseason win totals. `team_vegas_lines.win_total` for 2016-2025 is back-calculated from closing lines and **leaks**, so it must not be used in vintage backtests.
- V4b: 2025 only.

**Start archiving now:** depth-chart snapshots, win totals and roster moves with the date we saw them. Most historical snapshots don't exist anywhere, and each week we don't archive is lost.

## Market inputs (in scope, owner decision 2026-11-05)

ADP, expert projections (e.g. FantasyPros) and season-long player props are **in scope**. The earlier "internal techniques only" rule was about timing: projections were needed before that data existed. With vintages, both needs are met:
- **Every vintage still produces an internal-only projection.** V0 (now) and early V1 have no market data for the coming season.
- **Market inputs join from the vintage at which they first exist:**
  - ADP: from about Feb, so V1/V2.
  - Expert projections and player props: from about May-Jun, so V4/V4b.
  - Each is blended (or used as a prior) and gated on the vintage harness like any other input.
- **Leakage:** backtests may only use market data snapshotted *on or before* the vintage date. Historical ADP/props snapshots are scarce, so start a dated archiving job for each source as soon as it's chosen. Until a source has enough dated history to backtest, it can feed live projections only as a clearly labelled, ungated blend.
- **Win totals:** team win totals are already team-level context (`team_vegas_lines`). Note the 2016-2025 values are back-calculated and leak (see above).
- **Prior plan:** [market-projections.md](../market-projections.md) has the earlier deferred design.

## Data ingestion order

1. ✅ `nfl_stats` scoring extras + stat-model inputs (migration 060).
2. ✅ Weekly player stats (`nfl_weekly_stats`, with `game_date`): migration 061, `scripts/backfill_nfl_weekly_stats.py`, backfilled 2010–2026 with parity OK; `players.gsis_id` added in migration 062 and backfilled via `scripts/backfill_players_gsis_id.py` (2,899/3,154 resolved).
3. ✅ Team-season and team-week volume from play-by-play: `nfl_team_volume` and `nfl_team_weekly_volume` (migration 063, `scripts/backfill_nfl_team_volume.py`), backfilled 2010–2026 (748 season rows, 8,968 weekly rows). Refreshed Tuesdays by `update-nfl-weekly-stats.yml`.
4. `rosters_weekly` + dated trades/transactions, for team as of a date.
5. Vintage storage: `projection_vintages`, `vintage_id`, append-only history, and the published-season pointer.
6. A spike on historical preseason win totals; coach change dates.
7. Weekly archiving job for depth charts, win totals, roster moves, **ADP, expert projections and player props** (dated snapshots).
