# Player Valuation — How Dollar Values Are Built

**Purpose.** Every roster decision in this repo is denominated in dollars: keep/cut, arbitration
targeting, auction bidding, trade evaluation. This document explains where those dollars come
from, why the method is what it is, and how it maps onto the FanGraphs auction calculator and
Player Rater that the rest of the fantasy world is calibrated to.

Pair it with [ottoneu-strategy.md](ottoneu-strategy.md) (what to *do* with the numbers) and
[ottoneu-rules.md](ottoneu-rules.md) (the mechanics that constrain them).

**Code:** `web/lib/replacement.ts` · `web/lib/vorp.ts` · `web/lib/surplus.ts` ·
`web/lib/earned-value.ts`. The valuation math lives canonically in TypeScript — there is no
Python twin, per the note at the top of `scripts/analysis_utils.py`.

---

## 0. The one-sentence mental model

> A dollar value is not an absolute number — it is a **share of a fixed pot**, earned by
> production above the last player worth a roster spot.

Both halves of that sentence do work. "Fixed pot" is why values move when league size or roster
depth changes. "Above the last player worth a roster spot" is why positional scarcity gets priced
without anyone hand-tuning a QB premium.

---

## 1. The FanGraphs algorithm, and which parts we need

People conflate two FanGraphs products. They are the same algorithm with a different input:

| | Input | Answers |
|---|---|---|
| **Auction Calculator** | projections | "What should I pay?" |
| **Player Rater** / earned value | actual stats | "What was he worth?" |

The algorithm, in five steps:

1. **Fix the pool.** Teams × roster slots = how many players are "in the money." Everyone
   outside is worth zero.
2. **Collapse each player to one number.** In categories leagues this is the hard part —
   z-scores or standings-gain-points, with rate stats weighted by playing time.
   **In a points league this step vanishes.** Ottoneu football is a points league, so we
   start at step 3.
3. **Subtract replacement level.** The marginal player in the pool is defined as zero.
   Positional adjustment falls out for free: a replacement catcher is worse than a
   replacement outfielder, so catchers get an automatic bump. Nobody types the bump in.
4. **Convert to dollars as a closed economy.** Reserve the minimum salary for every roster
   spot, then distribute the remainder in proportion to value above replacement.
5. **For the Player Rater, run 2–5 on actuals.** Playing time stops being modelled and starts
   being observed.

Steps 3–5 are `vorp.ts` + `surplus.ts`. Step 5 is `earned-value.ts`.

---

## 2. Replacement level: the marginal ownable player

`web/lib/replacement.ts`

The baseline used to be a hand-typed rank per position (`REPLACEMENT_LEVEL` = QB24/RB30/WR30/TE20)
with a salary-implied override. Both are gone as the primary method. Demand is now **derived from
the lineup**:

```
dedicated  = NUM_TEAMS × STARTING_LINEUP[pos]      → QB 12, RB 24, WR 24, TE 12
contested  = NUM_TEAMS × (FLEX_SLOTS + BENCH_DEPTH_PER_TEAM) = 36 slots,
             allocated one at a time to whichever FLEX_POSITIONS entry offers
             the best *next* player
```

The superflex slots go to quarterbacks, so QB demand lands at **24** — the number
[ottoneu-strategy.md §3](ottoneu-strategy.md) builds the format's economics on. That is the point:
the Superflex QB premium is no longer an assertion in a strategy doc, it is an arithmetic
consequence of counting slots. Hand the same allocator a league where QBs fall off after the top
12 and the flex slots go to RB/WR instead, with no code change.

The replacement level for a position is the value at its demand rank. He has zero value above
replacement by construction, so he is worth exactly the minimum salary.

### How deep the pool goes is a calibration — and it is the one knob left

`BENCH_DEPTH_PER_TEAM` (default 2) is the number of spots per team beyond the starting lineup
holding players who actually enter lineups over a season: bye-week and injury coverage. It is the
only judgement call left in the construction, and it dominates how concentrated the money is.
Measured on the projected-points board checked in at `web/lib/data/athletic-vorp.ts`:

| Pool | Demand | Above repl. | Top | 10th | 25th | 50th | 100th |
|---|---|---|---|---|---|---|---|
| Starters only | 84 | 80 | $206 | $113 | $62 | $35 | $1 |
| **+2 bench/team (default)** | **108** | **104** | **$125** | **$89** | **$65** | **$41** | **$6** |
| +4 bench/team | 132 | 124 | $111 | $71 | $56 | $42 | $13 |
| Full roster, K excluded | 228 | 217 | $55 | $43 | $38 | $32 | $23 |

Both ends are wrong, in opposite directions:

- **Starters only** goes violently top-heavy — the best player clears half a team's cap and the
  100th-best player in the league is worth the $1 floor. That is not an Ottoneu auction. The
  tempting argument for it ("a bench player scores nothing for you, so his marginal value is $0")
  fails in a keeper league with 20-man rosters: the alternative to a bench player is not a
  startable free agent, it is nothing, because the wire is picked clean.
- **Full roster**, the way the FanGraphs baseball calculator does it, flattens the board until a
  stud and a middling starter are $20 apart. The premise that fails here is that all 240 spots
  chase current production — real Ottoneu rosters spend theirs on prospects, injured stashes and
  lottery tickets.

So it is a number rather than a principle, and it lives in `config.json` where it can be fitted
against real clears rather than argued about. The default of 2 puts the pool at ~108, deliberately
close to the scale the superseded hand-typed ranks produced — so this change alters the **shape**
of the board without silently repricing it wholesale. On the same board, holding scale roughly
fixed, the shape change is the superflex correction: quarterbacks **+$25–32** each, running backs
**−$15–24**.

### Kickers

Excluded from the valuation entirely. They occupy a starting slot, but every kicker clears at the
floor, so there is no surplus to allocate. Excluding them upstream also keeps the K slot out of
the demand allocation. Their roster spots still count toward the salary floor in §3.

### The salary-implied baseline is now a diagnostic

The old method — median PPG of the bottom-salary quartile of rostered players — is still computed
and surfaced on `/value` beside the real baseline (`salaryImpliedPpg`). It is not used for
valuation, for two reasons:

1. **It is doubly circular.** Prices set the replacement level, which sets dollar values, which
   are what we then compare prices against to find "bargains."
2. **It is hostage to roster quirks.** One manager stashing a talented injured back at $2 drags
   the RB baseline up and silently deflates every RB in the league.

It is worth keeping on screen because a large gap between the two is informative — it means the
market is pricing a position very differently from how the lineup values it.

---

## 3. Dollars: a closed economy

`web/lib/surplus.ts`

```
league cap     = NUM_TEAMS × CAP_PER_TEAM              = 12 × $400 = $4,800
salary floor   = NUM_TEAMS × ROSTER_SPOTS × MIN_PLAYER_SALARY = 240 × $1 = $240
distributable  = $4,800 − $240                                          = $4,560

$/VORP         = distributable / Σ(positive full-season VORP)
dollar_value   = MIN_PLAYER_SALARY + (VORP × $/VORP)   ← above replacement
               = MIN_PLAYER_SALARY                     ← at or below replacement
surplus        = dollar_value − salary
```

This replaced a flat `× 0.875` factor ($4,200) — the same idea carrying a magic number instead of
the arithmetic. Deriving it buys a property the constant did not have: **dollar values sum to
exactly the league cap**, because every rostered player is priced at the floor plus his share of
the remainder. That invariant is pinned by
`web/__tests__/lib/surplus-economy.test.ts`.

Practical effect of the change: the distributable pot rose ~8.6% ($4,200 → $4,560) and every
above-replacement player also gained the $1 base. On its own that lifts the whole board slightly;
combined with the recalibrated pool depth above, overall scale lands close to where it was and the
visible movement is positional (QB up, RB down).

### What this prices, and what it does not

These are **full-reset market** values: what the league would pay if every contract cleared at
once. That is the frame the FanGraphs calculator uses and the right one for "what is this player
worth."

An actual in-year Ottoneu auction distributes only the **uncommitted** cap — the rest is tied up
in keepers — so real auction prices run below these values by whatever share of the cap is already
committed. Do not read a gap between `dollar_value` and an observed auction clear as mispricing
without adjusting for that first.

### `FULL_SEASON_GAMES` is a display scale

`full_season_vorp = vorp_per_game × FULL_SEASON_GAMES` (17, a player's full NFL slate: 18 weeks
minus a bye). The constant **cancels out of the dollar conversion** — it scales both the numerator
and the Σ in the denominator — so it sets how VORP reads on screen, not what anyone is worth.
(Not bit-exact: `full_season_vorp` is rounded to one decimal before the conversion reads it, worth
at most $1 on a player.)

Note that Ottoneu's scoring window ends after NFL week 16, so 17 is an upper bound on the games a
player can actually bank for you. Because it cancels, this costs nothing in dollars; it does mean
the displayed VORP number is ~6% larger than the points a player can really deliver.

---

## 4. Earned value: the retrospective half

`web/lib/earned-value.ts` · MCP tool `get_earned_value`

Same closed-economy allocation, run on actual season points. It answers: *if the auction had been
run with perfect foresight, what would he have gone for?* Set beside what he actually cost, it is
the only honest scoreboard for an auction buy, an arbitration dollar, or a keep/cut call.

What differs from the projected path:

- **Ranked on season totals, not PPG.** The important one. Availability is observed rather than
  modelled: a star who missed eight games earned eight games less. `surplus.ts` needs the
  `projected_games` discount precisely because it cannot see this yet.
- **No minimum-games filter.** A player who managed three games earned what he earned; dropping
  him misstates the pool he was part of.
- **Replacement level recomputed on actuals** — whoever *actually* finished as the marginal
  startable player.

What is shared: the flex-aware baseline and the dollar conversion. Deliberately — if the two
directions used different baselines, a projected-vs-earned comparison would measure the difference
between the two methods rather than the difference between forecast and reality.

**Salary input.** Realized surplus must use the salary the player was carried at *during* that
season. `fetchPlayersEndOfSeason()` is the right fetcher: its snapshot predates the +$4/+$1 bump.
A post-bump or post-arbitration salary compares production against a price nobody paid for it.

### Derived at read time, not stored

There is no `player_earned_value` table. Earned value is a pure function of rows already in
`player_stats` and `league_prices`, so it is computed on read — the same call the standings, the
playoff picture and the weekly recap make (see
[matchups-and-standings.md](matchups-and-standings.md)). No second source of truth to drift, no
backfill to re-run when the method changes.

### Known limitation: it counts points you never started

Roto baseball accumulates everything a player does. Football has a weekly start/sit gate, so a
season total credits a player for points scored on somebody's bench. Season totals are still the
right first cut — they are what every public Player Rater reports, so they are comparable outside
this league — but the sharper measure is available to us and to almost nobody else, because
`matchup_lineups` records who was actually started, per week. See §6.

---

## 4a. The stat window: reading any of this mid-season

`web/lib/stat-window.ts` · `<StatWindowNote>` · `<StatWindowPicker>`

Everything above was written when `player_stats` only ever held **finished** seasons, so no number
on the site needed a caveat about its sample. That stopped being true when
[`pull-player-stats.yml`](../../.github/workflows/pull-player-stats.yml) started running every
Tuesday during the season: the table now carries a row for the season being played, and because it
is keyed `(player_id, season)` and holds season-**to-date** totals, a two-game row is
indistinguishable in shape from a seventeen-game one. The same code that said *"the #12 WR averaged
13.4 PPG last year"* says the same sentence off two Sundays, with the same confidence.

A `StatWindow` makes that explicit and travels with the numbers it describes:

| Field | Source | Why that source |
| --- | --- | --- |
| `complete` | the season cycle (`season.ts`) | The calendar is the authority on whether a season is over. Deriving it here — rather than from row contents — is what guarantees a finished season always takes the no-op path. |
| `games` | the rows themselves (p90 of `games_played`) | The scale can then never disagree with the numbers it scales. If the stats pull is a week behind the schedule, the window is a week behind too, which is correct. A percentile rather than the max so one stale row cannot claim a finished season. |
| `weeksPlayed` | `league_matchups` | Used **only** in the human sentence, so a disagreement between the schedule and the stats table is cosmetic. |
| `fraction` | `games / FULL_SEASON_GAMES` | The single scale factor the dollar math applies. |

### The invariant everything rests on

**`fraction === 1` is a strict no-op.** Every window-aware formula reduces to exactly the arithmetic
it did before the module existed, so the retrospective pages cannot change behaviour. One code path,
not two. Guarded by `__tests__/lib/stat-window.test.ts` ("the no-op guarantee") and by the fact that
all of `surplus-economy.test.ts` and `earned-value.test.ts` still pass unchanged.

### What actually changes in a partial window

Only two things, and both live in one place each:

1. **The pot is prorated** — `distributableCap(fraction)`. Through two of seventeen games the league
   has earned two seventeenths of its cap, not all of it. Pricing a fortnight of points against the
   whole $4,560 would hand out a full season's money for two Sundays.
2. **The salary is prorated to match** — `salary_to_date = price × fraction`. This is the one that
   matters. Setting a fortnight of earnings against a full year's price is the single comparison
   that would make the whole view lie.

Because both sides take the same factor, mid-season `realized_surplus` is exactly `fraction ×` what
it would be at full scale: **the ranking and the sign never move, only the units.** That is why the
small dollar figures in week 2 are safe to read, and why a little imprecision in `fraction` (bye
weeks make it a slight overestimate from week 5 on) cannot mislead — it scales both sides equally.

It is also why `return_on_salary` — dollars earned per dollar paid, 1.00 being break-even — is the
column to read off a small sample. Being a ratio it is free of the scale entirely, so it is the same
number whether you are looking at two weeks or a whole season.

### What is deliberately *not* rescaled

`full_season_vorp` stays `VORP/G × 17` in every window. The factor cancels out of the dollar
conversion (§3), so shortening it would change how VORP reads on screen without changing what anyone
is worth — and the field name would start lying. The VORP and Surplus panels instead **say** that
their figures are full-season claims resting on however much football the window holds, and point at
the Earned tab, whose arithmetic is confined to what has actually been played.

### The games floor had to move too

`MIN_GAMES` is 4, and applied literally to a season in progress it removes *everybody*: in week 2 no
player has four games, so `calculateVorp` returned an empty pool and `/value`, `/free-agents` and
`/projected-salary` each rendered a "no data" state over a table that was full. This is the same
class of failure the [stats-season clamp](../../web/lib/stats-season.ts) was written for, arriving by
a different door.

`effectiveMinGames()` caps the floor at the depth of the pool it is filtering. Mid-season it relaxes
to "has played every game so far"; from week 4 on it is `MIN_GAMES` again and nothing changes. It is
derived from the rows rather than from a `StatWindow` **on purpose**, so it protects every caller —
including the ones that never learn windows exist.

### Where it surfaces

- `/value` grows an **Earned** tab, which leads the tab order while a season is in progress because
  it is the only panel there that makes no claim about football that has not happened yet. It
  carries a per-team scoreboard — what each roster's salary has actually bought — which is the
  in-season read on the shape of the league.
- `/value` and `/players?tab=efficiency` both take a `?season=` picker, because during the season
  "what has happened so far" and "what happened last year" are different questions.
- `<StatWindowNote>` states the sample on every panel that reads production. It renders **nothing**
  for a finished season: there is no caveat to make.
- The min-games slider on the efficiency scatter stops at the games played, rather than at 17 where
  fifteen of its stops would simply blank the chart.
- MCP `get_earned_value` returns a `stat_window` block with an explicit caveat. This matters more
  there than anywhere: a caller reading `earned_value: 142` cannot tell a finished season from two
  Sundays, and will state it as settled fact either way.

### When it turns on

The in-season path activates the moment `player_stats` holds a row for the season being played —
i.e. after the first Tuesday `pull-player-stats.yml` run of the season. Until then the
[stats-season clamp](../../web/lib/stats-season.ts) keeps the site on the last finished season,
every window is `complete`, and the site looks exactly as it did. Nothing needs deploying to switch
over; a `workflow_dispatch` run of **Pull Player Stats** brings it forward by hand.

---

## 5. What this unlocks

Three things that were not previously computable:

1. **Realized surplus** — `earned_value − price_paid`. The after-the-fact grade on every auction
   buy, arbitration dollar and keep/cut call. This is the missing piece of the "post-auction
   review" journey in [ux-journeys.md](../exec-plans/ux-journeys.md).
2. **Projection error in dollars.** Compare preseason `dollar_value` against `earned_value`. For
   roster decisions this is better calibrated than points-MAE because it is *scarcity-weighted*:
   being 2 PPG wrong on the QB4 costs far more than being 2 PPG wrong on the WR40, and RMSE
   cannot see that. A genuinely new axis for the held-out harness — see
   [projection-accuracy-improvement.md](../exec-plans/projection-accuracy-improvement.md).
3. **Market efficiency.** `earned_value` vs actual auction clears (`transactions`,
   `draft_sharks_values`) tells you which positions and tiers this league systematically overpays
   for.

---

## 6. Open questions and follow-up work

- **Started-only earned value.** Compute §4 over `matchup_lineups` instead of season totals, so a
  player is credited only for points he scored in somebody's starting lineup. `matchup_lineups`
  is current-season-only (migration 044), so this cannot be backfilled to 2021 — it would be a
  forward-looking metric alongside the season-total one, not a replacement.
- **Fit `BENCH_DEPTH_PER_TEAM` against real clears.** The default of 2 is reasoned, not measured:
  it was chosen to hold overall scale near the previous board while the positional shape corrects.
  The right way to settle it is to regress our dollar values against actual auction clears
  (`transactions`) and published superflex market values (`draft_sharks_values`) and pick the depth
  that minimises error. That needs DB access and has not been done — treat the current value as a
  placeholder with a defensible prior, not a result.
- **Calibrate the deflator against real clears.** §3 prices a full-reset market with no deflation.
  Whether Ottoneu auctions systematically clear below that (in-season FA money held back, cap
  committed to keepers) is an empirical question answerable from the same data. If there is a
  stable discount, it belongs in config as a *measured* constant with the measurement recorded —
  not as another 0.875.
- **Linear values vs. convex auctions.** This allocation is linear in value above replacement, but
  real auctions are convex at the top: stars clear above their linear value because roster slots
  are finite and managers pay for certainty. The machinery to test this already exists
  (`scripts/auction_simulator.py`, `/mock-draft`) — run the Monte Carlo to equilibrium prices and
  compare. Where they diverge is where the linear model is lying.
- **No UI for earned value yet.** The library and the MCP tool are live; a `/value` tab or a
  post-auction review page is not built.
