# Mock Draft (`/mock-draft`)

A practice keeper auction against AI opponents. Every team is seeded with its **real
current roster and cap** (`league_prices` for the active season) and the free-agent pool
is priced by **Draft Sharks superflex market value** (`draft_sharks_values`). Gated on
`has_projections_access`.

## Two formats

| Format | What it is | Where it lives |
|--------|-----------|----------------|
| **Live auction** (default) | Real time. Each nominee gets a countdown; the AI teams bid against you while it runs; any bid extends the clock; the high bidder wins at the price on the board when the hammer falls. | `web/lib/mock-draft-live.ts` |
| **Turn by turn** | No clock. You enter one max bid per nominee and it resolves instantly as a sealed Vickrey auction (second-highest bid + $1). | `resolveNominee` in `web/lib/mock-draft-engine.ts` |

Both formats use the **same AI valuation heuristics** (`aiBid`), ported from the Monte-Carlo
sim in `scripts/auction_simulator.py` ([auction-simulator.md](auction-simulator.md)) — starter needs, the
Superflex QB premium, bench-depth discount, a cash reserve, $1 held per open roster spot,
below-market pounces, budget pressure, and per-bid taste noise. They differ only in how the
auction is run.

## Budget pressure (why the AI overpays)

A bot that only ever bids market value ends the draft sitting on cash, which in a keeper
auction is pure waste — and it makes for a soft practice room. `budgetPressure` gives every
AI a **≥ 1 multiplier on every bid**, so it finishes spent out instead:

```
spendable    = cap − RESERVE                              # what it means to deploy
naturalSpend = mv × (1 − TAIL_DECAY^spots) / (1 − TAIL_DECAY)   # market cost of the rest of its draft
pressure     = clamp(spendable / naturalSpend, 1, MAX_PRESSURE)
```

`naturalSpend` estimates what filling the remaining spots costs at market. Nomination runs
roughly high value → low, so the rest of a team's draft is modelled as a geometrically
decaying tail (`TAIL_DECAY = 0.7`) off the player currently on the block. A team whose
spendable cash exceeds that estimate is holding dollars it can never convert into players,
so those dollars are worth less than face and it bids them up — capped at `MAX_PRESSURE`
(6×), and still bounded by affordability and `MAX_BID`.

Three details matter:

- **The anchor is market value, never the private valuation.** A manager's future spending
  happens at market prices. Anchoring on its own opinion would let a manager who is *low*
  on this player inflate his bid, cancelling out the disagreement the noise slider exists
  to create.
- **Pressure is self-limiting.** Early, with many spots open, `naturalSpend` is large and
  pressure sits at ~1 — a normal-budget team behaves exactly as before. It only bites for
  teams genuinely richer than the market they still have to buy from, and it climbs as
  spots run out (that's the familiar end-of-draft "$1 players go for $15" effect).
- **Cash still can't buy a bad roster.** `MAX_AT_POS` (QB 4 · RB 6 · WR 7 · TE 3 · K 1) is a
  hard positional ceiling that no amount of surplus overrides — including the pounce.

Two supporting behaviours close the same leak from the other side: a team with more than
`SPILL_CASH` ($25) of surplus keeps buying past the usual `FILL_TO` (18) stopping point to
the full `ROSTER_SPOTS` (20), and once its positional targets are met it will still buy a
**best-available body** at `SPARE_DISC` (32% of market) rather than leave a spot empty.

Measured over a full auto-drafted pool seeded from live rosters (12 teams × 25 drafts):

| Valuation noise | Mean leftover | Teams over $50 |
|---|---|---|
| 0 | $41.5 → **$22.0** | 23% → **4%** |
| ±40% | $35.8 → **$19.8** | 18% → **3%** |
| ±90% | $27.8 → **$15.9** | 9% → **1%** |

The residual is structural rather than a tuning miss: those teams have filled all 20 roster
spots, and both formats price a lot at the *runner-up's* ceiling (Vickrey / English), so a
team far richer than the rest of the room wins its lots cheaply and runs out of spots before
it runs out of money.

Because `suggestedBid` is `aiBid` with the noise switched off, **your** suggested bid is
budget-aware too — it leans over book value when you are the one with cash to burn.

## Manager valuation noise (the setup slider)

By default every AI manager prices the pool identically, at Draft Sharks market value —
so the only disagreement between them is roster need and a little per-bid taste jitter.
The **Manager valuation noise** slider (0 → ±90%, in 5% steps) instead gives each rival a
**private price for every player**:

```
private value = market value × uniform(1 − spread, 1 + spread)
```

The multiplier is a deterministic FNV-1a hash of `(seed, team name, player id)`
(`valuationMultiplier` / `privateValue` in `mock-draft-engine.ts`), which buys two
properties that matter:

- **Stable within a draft.** A manager who is 40% high on a receiver stays 40% high on him
  for every bid of every lot — including the whole of one English-auction lot, where a
  re-rolled opinion would let a team walk past its own ceiling.
- **Fresh between drafts.** `start()` draws a new `randomValuationSeed()`, so the league's
  opinions are redrawn each time you restart.

The private value replaces market value *everywhere inside* `aiBid` — the startable
threshold, the starter/bench base, and the pounce trigger — so a rival who is low on a
player may not even see him as a startable option, and one who is high on him will pounce
on a "bargain" you priced correctly. It does **not** touch: your own suggested bid (always
the book value at market), nomination order, or the roster/cap seeds.

Higher noise is the setting to practise against a messy real-life room: more rivals
overpaying for their guys, more of your targets going cheap because nobody else rated
them. `spread` is carried on `LiveDraft.valuation` and threaded into both `openLot`
(the live private maxes) and `instantStep`/`resolveNominee` (the sealed-bid paths), so
both formats and every fast-forward see the same opinions.

## How the live auction works

`mock-draft-live.ts` is pure and framework-free: every function takes the current
wall-clock `now` and returns a new state, so React drives it from a `setInterval` and the
tests drive it from a fake clock.

1. **Lot opens** (`advanceLive` → `openLot`). Each AI computes a **private max** once, via
   `aiBid` against its own private valuation (never shown to the user), and gets a
   randomized reaction time. The clock starts at `clockMs`.
2. **AI bids** (`autoBid`). At most one bid per tick — the AI whose reaction landed first
   and whose max still beats the board. The opening bid is ~40% of market value
   (`OPENING_FRAC`); later bids are jumps that close ~22% of the gap to that team's max
   (`JUMP_FRAC`), so wars converge in a handful of raises instead of crawling by $1. A team
   never bids against itself and never exceeds its max.
3. **Bids extend the clock** (`placeBid`): `deadline = max(deadline, now + resetMs)`, and
   every bidder re-rolls their reaction delay for the new price.
4. **The user bids** either manually (`placeUserBid` — the `Bid $N` / `+$5` buttons) or by
   setting an **auto-bid ceiling** (`setUserMax`), which behaves like an eBay proxy: it
   answers rivals with the minimum raise and never volunteers more than it must.
5. **Hammer** (`hammer`). When the clock expires the high bidder is charged the price on
   the board, the player joins their roster, and the sale hits the draft log. No bids = *no
   sale*.

Pace presets (`SPEED_PRESETS`: relaxed / normal / fast) set the clock, the reset window,
and AI reaction times. **Pause** freezes the auction — `shiftClock` pushes every deadline
out by the paused duration so a paused lot doesn't quietly expire.

## Fast-forwards

`instantStep` resolves the next player with no clock (sealed-bid). It backs **Skip to my
next need** (auto-pass until a nominee fills an open starter/flex slot) and **Auto-finish
rest**, in both formats — a full live draft of a few hundred FAs is otherwise an
hours-long sitting.

## Nomination

`nominationOrder` gives each FA a jittered sort key (`mv × lognormal(NOMINATION_SIGMA)`),
so elites still tend to go early but the order varies run to run. The live view also
attributes each lot to a nominating team, rotating through the teams that still have
roster room.

## Files

| File | Role |
|------|------|
| `web/lib/valuation-noise.ts` | The private per-manager valuations, shared with [`/snake-draft`](snake-draft.md) |
| `web/lib/mock-draft-engine.ts` | Pure engine: AI valuation (incl. private per-manager valuations), sealed-bid resolution, roster/lineup helpers, nomination order |
| `web/lib/mock-draft-live.ts` | Real-time English-auction layer on top of it (clock, bid feed, proxy bids, pause) |
| `web/lib/mock-draft.ts` | Server-side seed: rosters + caps from `league_prices`, FA pool from `draft_sharks_values` |
| `web/app/mock-draft/page.tsx` | Server page + access gate |
| `web/app/mock-draft/MockDraftClient.tsx` | The UI and the interval that drives the live clock |
| `web/__tests__/lib/mock-draft-engine.test.ts` | Engine unit tests |
| `web/__tests__/lib/mock-draft-live.test.ts` | Live-auction unit tests (fake clock) |
| `web/__tests__/app/mock-draft/MockDraftClient.test.tsx` | Component test: the clock runs, AI bid, lots hammer unattended |

## Caveats

- Nothing here is written back to Supabase — the draft is entirely client-side state and a
  refresh restarts it.
- Roster seeds are only as fresh as `league_prices` (see
  [roster-csv-reconciliation.md](roster-csv-reconciliation.md)).
- AI teams value players purely off Draft Sharks market value (optionally noised per
  manager, above) plus budget pressure; they don't reason about keeper economics, contract
  length, or trades.
  The noise is symmetric and independent per player — it makes the room disagree, but it
  doesn't model a manager with a coherent *strategy* (a positional bias, a rebuild).
- Budget pressure is a `/mock-draft` addition — `scripts/auction_simulator.py` has not been
  given the same treatment, so its bots still leave cash on the table. The two are no longer
  a strict port of each other.
- For a **snake** draft in a league that isn't this one, see
  [snake-draft.md](snake-draft.md) — a separate tool with its own engine, sharing
  only the valuation-noise module.
- For the batch/offline version of the same model — thousands of simulated auctions to
  price a target list rather than one interactive draft — see
  [auction-simulator.md](auction-simulator.md).
