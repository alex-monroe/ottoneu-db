# Trade exchange rate: keeper value per this-season dollar

How many dollars of keeper value a team gives up for a dollar of this-season
value, read from the league's trades, and whether that rate depends on the
team's playoff odds.

| | |
|---|---|
| **Command** | `just trade-exchange [--rebuild-outlooks] [--outlooks cache\|db] [--output …]` |
| **Python** | `scripts/trade_exchange/` — `outlook.py` (keeper outlooks) · `features.py` (one row per trade) · `fit.py` (fits, backtest, report) |
| **Web (pure)** | `web/lib/trade-exchange.ts` (playoff odds on the trade day, one row per side) · `web/scripts/export-trade-exchange.ts` (the JSON export) |
| **Report** | [generated/trade-exchange-rate.md](../generated/trade-exchange-rate.md) |
| **Writes** | Nothing to the database. Intermediate files go under `.cache/trade_exchange/`. |

## The headline (October 2026)

**There is too little data to fit team-specific rates, or a playoff-odds
slope.** What the data support is a single pooled rate with a wide interval:

- Among the **9 trades that were a clean now-for-later exchange**, the buyer
  gave up about **$1.8–2.1 of keeper option value per $1 of this-season
  value**. The 90% interval is about 1.0–3.0 for the geometric mean and
  1.1–3.4 for the ratio of totals. Individual trades range from 0.3 to 6.6, a
  log-SD of about 1.
- **Playoff odds:** no exchange trade has odds. The 2025 trades have no stored
  schedule, and the 2026 exchanges were offseason trades with no 2025 table
  to rate teams on. Over the 10 in-season trades that do have odds, the
  higher-odds side took the this-season value 6 times in 10 (p = 0.75).
  There is no sign either way.
- **Teams:** the crossed random-effects fit puts the between-team spread τ at
  0, with a 90% upper bound around 1.7 in log units. That is uninformative:
  the data cannot tell the teams apart.
- **Vetoes:** no trade has ever been removed. Only 6 of 36 trades with a
  count drew any veto vote, and veto votes are uncorrelated with how
  lopsided a trade is at the pooled rate (Spearman 0.06) or with its size.
- **Most trades are not an exchange by our reads.** In 30 of 39 trades, one
  side took both this-season and keeper value, or the trade was too small to
  read. Least squares over every trade gives a rate near zero (−0.2). The
  pooled rate makes *more* trades look lopsided than 1:1 does (22 vs 16 of
  39). Whatever drives most trades here (positional need, lineup fit, a
  different view of the player), our two value reads do not capture it.

**Use:** if a single number is needed, use about 2 keeper dollars per
this-season dollar, and quote the interval with it. It has no team or odds
dependence, and it should not be used to call an individual trade fair or
unfair.

## The quantity and the model

From the side that took this-season value (the **buyer**):

- `S` = prorated this-season net (dollars received minus given, times the
  share of the season left), as `valueTrade` computes it.
- `K` = keeper net: the sum of each received player's option value
  E[max(0, V_next − salary_next)] minus the same for each player given. Each
  is read from the keeper outlook snapshot no later than the trade's week
  (`outlookAsOf`'s rule; see [keeper-value.md](keeper-value.md)). A player
  with no outlook takes the `/trades` point fallback.

The two sides of a trade mirror each other, so each trade is one
observation. It is an **exchange** when S ≥ $5 and K ≤ −$5 (`MIN_LEG`), and
its rate is r = −K/S. Both teams accepted it, so λ_buyer ≥ r ≥ λ_seller,
where λ is a team's own rate. The model has the trade clear at the midpoint:

    log r = μ + β·(odds_buyer + odds_seller)/2 + (u_buyer + u_seller)/2 + ε
    u_team ~ N(0, τ²),   ε ~ N(0, σ²)

`fit.py` reports it in tiers, smallest assumption first:

1. **Pooled rate.** Ratio of totals and geometric mean over exchanges, with
   trade-level bootstrap intervals, plus least squares over every trade
   (`λ` minimising Σ(λS + K)²).
2. **Odds dependence.** A table by the buyer's odds bucket. β by least
   squares only when at least `MIN_FOR_SLOPE` (8) exchanges have odds.
   Otherwise, a direction check on every in-season trade.
3. **Team effects.** τ by profile likelihood over the crossed design, the
   shrunk (BLUP) team rates, and the sample size needed.
4. **Vetoes.** Spearman of veto votes with |λ̂·S + K| and with trade size.

## Playoff odds on the trade day

`web/lib/trade-exchange.ts` `oddsOnDay` rewinds the season to the trade day:

- Every game whose fantasy week had not ended is set back to scheduled.
- Each team's weekly mean is its PPG so far, shrunk toward last season's PPG
  with 4 pseudo-games (toward this season's league average when last season
  is not stored).
- Then it runs `simulateSeason` unchanged (seeded, 2,000 seasons).

An offseason trade therefore runs on last season's PPG alone. With neither
season stored, the odds are unknown, not a coin flip.

No historical lineup projections are stored, so this is coarser than the
live `/playoff-odds` page. **Check:** at week 5 of 2026, its odds for the 7
teams that traded that week rank-correlate 0.82 with the live,
projection-based odds, with a mean absolute gap of 16 points. Irish Invasion
was the largest miss: 53% here vs 21% live, because its PPG is high but its
projected lineup is weak.

## Data limits

| Limit | Effect |
|---|---|
| Trade history starts September 2025 (Ottoneu's `/trade_history` is not paginated), and player cards reach no further. | 39 trades in all: 21 in 2025 and 18 in 2026. |
| `trades.status`: all 39 are `processed`. A vetoed pending trade only ever shows up as `removed`, and there are none. | No accepted-vs-vetoed contrast. Votes are the only fairness signal. |
| `league_matchups` holds only 2026. | 2025 trades have no odds. Their as-of week and season share are approximated from the NFL calendar (week 1 ends the Tuesday after the opener; 14 weeks). They are marked `~` in the report. |
| This-season values are preseason projections (`valueTrade`). | A November trade is judged on what the model believed in August. |
| One team (Irish Invasion) is in 19 of 39 trades. | The pooled rate leans on one manager's habits. |

### What sample would make team rates identifiable

Each trade carries half of each team's effect, so a team needs about
**4σ²/τ² exchanges** for its estimated effect to be half signal. With σ ≈ 1
and a between-team spread worth detecting (τ = 0.35, teams about 40% apart),
that is **about 32 exchanges per team**. The league makes about 8 exchanges a
year in total.

An odds slope of 0.7 (a sure contender pays about twice what an eliminated
team does) needs about **180 exchanges with odds** to sit two standard errors
from zero. Neither is reachable from one league's history. A real reading
needs either many leagues (the `scripts/league_explorer/` survey has
cross-league data, but no trades) or a much tighter per-trade signal than
these value reads give.

## Backtest

- **Leave-one-exchange-out:** predict each exchange's log rate from the
  others' geometric mean. The pooled rate's mean absolute log error is 0.91,
  against 1.01 for the 1:1 rate implicit in adding the two reads together.
  It is closer on 6 of 9 exchanges.
- **Temporal:** fit on the 7 exchanges from 2025 (rate 1.53), then score
  the 2 from 2026 (4.58 and 2.00). Log error is 0.68, against 1.11 at 1:1.

So the pooled rate is better than 1:1 for exchange trades, but only
modestly, and on very few trades. It does not make the whole trade log look
fairer (see the headline).

## Operating it

```bash
just trade-exchange --rebuild-outlooks --output docs/generated/trade-exchange-rate.md   # first run, or after a keeper model change
just trade-exchange --output docs/generated/trade-exchange-rate.md                      # reuse cached outlooks
just trade-exchange --outlooks db                                                       # read keeper_outlook once it is published
```

The recipe first runs the TS export (reads only), then the Python fit. Keeper
outlooks are fitted in memory with `scripts.keeper_value.publish.build`,
out of fold as in production, and cached at
`.cache/trade_exchange/outlooks.parquet`. Once `keeper_outlook` is backfilled
(`just keeper-publish --backfill`), use `--outlooks db` to read the published
snapshots instead. The export needs `NEXT_PUBLIC_SUPABASE_*` in
`web/.env.local`, and the fit needs `SUPABASE_*` in `.env`.

**Revisit** when either of these holds:

- about 10 exchanges have in-season odds, or
- the trade log has run another full season with `league_matchups` stored.

At that point the slope tier switches on by itself.
