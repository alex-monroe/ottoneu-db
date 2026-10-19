# Keeper value: an option on next season

How the trade builder and `/trades` value keeping a contract, and the model
behind it.

| | |
|---|---|
| **Table** | `keeper_outlook` (migration 052) |
| **Model + backtest** | `scripts/keeper_value/` — `just keeper-backtest` · `just keeper-publish` |
| **Workflow** | `.github/workflows/update-keeper-outlook.yml` (Tuesdays in season; dispatch with `backfill` for history) |
| **Web** | `web/lib/keeper-outlook.ts` (pure) · `web/lib/keeper-outlook-data.ts` (reads) |
| **Consumers** | `web/lib/trade-builder.ts` · `web/lib/trades.ts` ([trades.md](trades.md)) |
| **Backtest report** | [generated/keeper-value-backtest.md](../generated/keeper-value-backtest.md) |

## Why an option

Offseason cuts cost nothing ([ottoneu-rules.md](ottoneu-rules.md)). So a
contract is a **call option** on next season's value V, struck at next season's
salary S:

    keeper value = E[max(0, V − S)]          not  max(0, E[V] − S)

The two differ exactly where keepers change hands: young players and bounce-back
bets, whose median outcome may sit under the salary while the upside tail is
large. The old point read (this season's pace, or the preseason projection, minus
S, floored at 0) priced that tail at zero. A point projection a year out is not
credible enough to bet a contract on either.

Every keeper read now carries:

- **Keeper value**: the option value above.
- **P(keepable)**: P(V > S), the chance he is worth his salary next year.
- **p10 / p50 / p90**: the band of next season's dollar value.

## The outcome being predicted

For a player-season N, seen **as of NFL week w**, the target is season N+1's
dollar value in N+1's own `/value` market (`calculateSurplus`, ported in
`scripts/keeper_value/market.py`): lineup-derived replacement level, then a
share of the $4,560 distributable cap. Two choices:

- **Availability-inclusive.** Value is points per *scheduled* game (total ÷ the
  team's games), so a missed half-season costs half the value. That is what a
  keeper delivers, and it matches projected-mode VORP since #614.
- **Latent dollars.** The model works on the unfloored value (below-replacement
  seasons go negative, clipped at −$30), and floors at $1 only at the end. That
  keeps "how far below replacement" informative while every keepable outcome
  is priced exactly as `/value` prices it.

Data comes straight from nflverse's weekly files (`stats_player_week`,
`snap_counts`, `players`), cached under `.cache/keeper_value/`. The database
holds no weekly history, and a leakage-free row must see season N only through
week w.

## How much data there is

Measured before building anything (October 2026). There are about 9,600
QB/RB/WR/TE player-seasons with a known next season (N = 2010–2024, `nfl_stats`);
the model uses 2013 on, where snap counts exist for both N and N−1. About 26% have
no N+1 games at all, and those count as $1 outcomes, not missing data. By cell
(position × years in league × draft round), UDFA cells hold hundreds, but day-1
cells are thin: R1 RBs have about 20 per year-of-experience bucket, and R1 TEs
about 10. Birth dates are missing for about 95% of `players` rows, so the cells use
years in league, and age (from the nflverse player file) enters only the
regression. `league_calendar` holds only 2026, so the deadline is fixed at
**week 12**: the 2026 deadline is 1 December, after NFL week 12.

## The model (`scripts/keeper_value/model.py`)

1. **Population prior.** For each cell, the empirical distribution of next
   season's latent dollars among past players in that cell. A thin cell borrows
   from neighbouring cells (one bucket away in years or round, weight up to ½,
   then two away, up to ¼, then the whole position). It borrows only until it
   reaches 40 effective rows, so a full cell is left alone.
2. **Individual distribution.** A per-position ridge regression on the player's
   own signals. Inputs: this season's pace (and pace × games/(games+4)), last
   season's value (and × games/17), snap share and opportunity share (targets;
   carries + targets for backs; pass attempts for QBs, each as a share of the
   team's), availability, age, years, and the cell's prior mean, so the
   regression learns how much draft capital still matters once there is a stat
   line. Its distribution is the prediction plus the empirical residuals of
   training players predicted at a similar level (8 bins).
3. **Shrunk mix.** Quantile averaging,
   `q = (1 − w)·Q_prior + w·(m + R(m))` with `w = n/(n + k)`, where n is career
   games. A player with no games (a drafted rookie in the offseason) gets the
   prior exactly. k is chosen per position by CRPS on the last two training
   seasons, never on the season being scored.

Published as 20 equal-probability quantiles, so option value and P(keepable)
are plain means over the grid (`web/lib/keeper-outlook.ts`).

## What the backtest says

Rolling origin. Season N is scored by a model fitted only on seasons ≤ N−1 and
seeing N only through week w. Dev folds are 2016–2023; **2024 → 2025 is the
confirmation fold, looked at once**, as in
[projection-model-changes.md](projection-model-changes.md). Historical salaries
are not stored, so keepability is scored at strikes of $3–$50. Full tables:
[generated/keeper-value-backtest.md](../generated/keeper-value-backtest.md).
For fantasy-relevant players, as of week 12:

| | CRPS ($) | Brier | P(keepable) calibration |
|---|---|---|---|
| (a) prior only | 17.2 | 0.238 | under-calls: 20% calls kept 37% |
| **(b) prior + shrunk adjustment** | **13.1** | **0.164** | 21% → 21%, 39% → 39%, 58% → 62%, 91% → 82% (slightly over-confident at the top) |
| (c) point estimate (old method) | 24.0 | 0.310 | "100%" calls kept only 55% |

- (b) beats (a) and (c) significantly on CRPS, option-value MAE and Brier
  (player-clustered bootstrap) at both week 12 and week 0. The confirmation
  fold agrees on CRPS and Brier; with 146 relevant players, its option-value
  MAE gain is not significant.
- **The individual adjustment earns its place.** It cuts CRPS by about $4, and
  most of that comes from production and the prior-mean term. **Usage** (snap and
  opportunity share) improves CRPS by only $0.04, which is not significant. It is
  kept as a cheap, well-motivated signal.
- **The shrinkage weight is small.** The fitted k is about 1–5 games, so by
  the deadline even a rookie (about 10 games) is weighted mostly on his own data,
  and (b) is level with an unshrunk variant. The sample-size weighting that
  matters happens inside the regression (the games-weighted pace terms). The mix
  matters for players with no games yet, which is the offseason rookie case.

## Snapshots and leakage

`just keeper-publish` writes one row per (player, season, as-of week) for
weeks 0, 3, 6, 9, 12, 15 and 18, plus the newest week of the season in
progress. Each season's rows come from a model fitted only on earlier seasons
(`fit_through`). So:

- **`/trades/builder`** reads each player's newest snapshot this season.
- **`/trades`** reads the newest snapshot taken **no later than the trade's
  week** (regular-season weeks finished before it, from `league_matchups`;
  week 0 for an offseason trade). A trade is never credited with what the
  season revealed after it.

A player with no snapshot (a college player, an unmatched name, or any player
before the first publish) falls back to the old point read, marked `*` in the
builder.

The in-season rule that withholds the preseason projection (#748) does not
apply here. The outlook is refitted weekly on in-season data, not frozen in
August.

## Operating it

```bash
just keeper-backtest --as-of-week 12 0 --confirm --output docs/generated/keeper-value-backtest.md
just keeper-publish --dry-run            # fit + print the top of the board, write nothing
just keeper-publish                      # this season's snapshots
just keeper-publish --backfill           # every season from 2021 (first run / model change)
```

Publishing writes production data, so run it from the main checkout after
merge, or dispatch the workflow. After a model change, re-run the backtest
(dev folds only; the confirmation fold is one look per change) and backfill.

## Downstream: team exchange rates

[trade-exchange-rate.md](trade-exchange-rate.md) reads each traded player's
option value from these snapshots, as of the trade's week, to estimate how
many keeper dollars a team gives per this-season dollar (`just
trade-exchange`). Until `keeper_outlook` is backfilled, it fits the same
out-of-fold snapshots in memory.
