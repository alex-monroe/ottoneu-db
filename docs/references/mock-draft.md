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
below-market pounces, and per-bid taste noise. They differ only in how the auction is run.

## How the live auction works

`mock-draft-live.ts` is pure and framework-free: every function takes the current
wall-clock `now` and returns a new state, so React drives it from a `setInterval` and the
tests drive it from a fake clock.

1. **Lot opens** (`advanceLive` → `openLot`). Each AI computes a **private max** once, via
   `aiBid` (never shown to the user), and gets a randomized reaction time. The clock starts
   at `clockMs`.
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
| `web/lib/mock-draft-engine.ts` | Pure engine: AI valuation, sealed-bid resolution, roster/lineup helpers, nomination order |
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
- AI teams value players purely off Draft Sharks market value; they don't reason about
  keeper economics, contract length, or trades.
- For the batch/offline version of the same model — thousands of simulated auctions to
  price a target list rather than one interactive draft — see
  [auction-simulator.md](auction-simulator.md).
