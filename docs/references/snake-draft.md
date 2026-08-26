# Snake Draft (`/snake-draft`)

A practice **snake draft** against AI opponents, for redraft leagues that have
nothing to do with Ottoneu league 309. Nothing about the league is read: no
rosters, no salaries, no cap, no keepers. You choose the league size, your draft
slot, the starting lineup and the number of rounds; the bots draft against you
snake-style off a market consensus board. Gated on `has_projections_access`.

This is a **separate tool** from [`/mock-draft`](mock-draft.md), which is the
Ottoneu keeper *auction* seeded from live league state. The only machinery the
two share is the private-valuation noise (`web/lib/valuation-noise.ts`).

| | `/mock-draft` | `/snake-draft` |
|---|---|---|
| Format | Keeper auction (live English or sealed bid) | Snake draft |
| League | Ottoneu 309, real rosters + caps | Any league — you configure it |
| Currency | Auction dollars against a $400 cap | Value over replacement, no money |
| Pool | League free agents | Every Draft Sharks–priced player |

## Setup

| Setting | Range | Default |
|---|---|---|
| Teams | 4 – 20 | 12 |
| My draft slot | 1 – *teams* | 1 |
| Rounds | 1 – 30 | 15 |
| Starting lineup | QB · RB · WR · TE · FLEX · SFLEX, 0–6 each | 1 · 2 · 2 · 1 · 1 · 0 |
| Manager valuation noise | 0 → ±90%, 5% steps | 0 |
| Pace | instant / fast / normal | fast |

The setup screen previews the overall pick numbers your slot owns (`#3 · #18 ·
#23 · …`) and the replacement level each position lands on for the format you
have configured. Two lineup presets — **1 QB** and **Superflex** — set the whole
lineup in one click.

## The board is re-priced for your format

The underlying values are Draft Sharks' **half-PPR superflex** consensus auction
values (`draft_sharks_values.market_auction_value`, on this project's $400
scale — see [mock-draft.md](mock-draft.md)). Those are the only consensus prices
this project stores, and they are superflex-shaped, so using them raw in a 1-QB
league would send quarterbacks off the board far too early.

`buildBoard` fixes that with the standard VORP transform, which is what makes
one board serve any format:

```
replacementRank(pos) = teams × (lineup[pos] + FLEX × flexShare[pos] + SF × sfShare[pos])
value(player)        = max(mv − mv of the player at replacementRank(pos),  0.1 × mv)
```

A flex slot doesn't belong to a single position, so it is split across the
league the way flex slots are actually filled (`flexShare` RB 0.40 · WR 0.50 ·
TE 0.10), and a superflex slot is a quarterback nearly always (`sfShare` QB
0.85). The consequences fall out on their own:

- **12-team, 1 QB** → replacement is QB12 · RB29 · WR30 · TE13, and the first
  quarterback shows up around board rank 22.
- **Add a superflex slot** → QB replacement moves to QB22, every quarterback
  gains that difference, and the first one climbs to around rank 9.

Below replacement a player's value-over-replacement is zero or negative, which
would flatten the whole late board into a tie. The `0.1 × mv` floor keeps those
players ordered against each other — and keeps the bots' *multiplicative*
valuation noise meaningful down there.

## How the bots draft

Every bot scores the whole remaining board and takes the best thing on it:

```
score = value × managerMultiplier × needMultiplier × taste
```

- **`managerMultiplier`** is the noise slider — a private, draft-stable opinion
  of each player (below).
- **`needMultiplier`** is roster construction. A player who steps straight into
  an empty starting slot is worth full value; a backup is worth `0.6 × 0.8^depth`
  behind the starters already rostered; past the positional ceiling
  (`maxAtPos` — slots the position can fill, plus a bench of QB 1 · RB 4 · WR 5 ·
  TE 0) he is worth nothing. This is what stops a bot from taking its fifth
  quarterback because the board says he is the best player left.
- **`taste`** is a small per-pick lognormal jitter (σ = 0.08), so two bots with
  identical rosters don't make identical picks.

**Roster crunch.** Once a team has no more picks than it has unfillable starting
slots (`picksLeft ≤ openStarterSlots`), it stops taking best available and only
drafts players who fill a hole — the behaviour real drafters show in the last
couple of rounds. If nothing on the board fills a hole (or everything left is
capped out), it takes the best body available rather than forfeit the pick.

**The superflex slot is planned as a QB slot.** Any position may legally *start*
there — `startingLineup` and the final standings honour that — but roster
planning uses a narrower list (QB · RB · WR). Counting TE as a superflex starter
gave bots a phantom starting job and left them holding a third tight end in a
one-TE league.

## Manager valuation noise

Identical to the slider on `/mock-draft`, and the same code
(`valuationMultiplier` in `web/lib/valuation-noise.ts`): each rival gets a
private multiplier on every player, uniform in `[1 − spread, 1 + spread]`,
derived from a deterministic FNV-1a hash of `(seed, team name, player id)`.

- **Stable within a draft** — a manager who is 40% high on a receiver stays 40%
  high on him in every round.
- **Fresh between drafts** — a new seed is drawn each time you start one.

At 0 the room ranks the board exactly as it is shown to you, and every bot wants
the same player. Turn it up for a messier room: more reaches, and more of your
targets sliding to you.

Your side of the draft is never noised. **Take best available** recommends the
highest `value × needMultiplier` on the board, at consensus value.

## Running the draft

Bots pick on a timer (instant / 250ms / 700ms per pick) so the draft reads like
a draft. **Skip to my pick** fast-forwards the bots instantly; **Auto-draft
rest** runs the remainder including your own picks, on the same heuristic.

When the board empties or the last round ends, the standings replace the board:
every roster ranked by the value of the starting lineup it can actually field
(`scoreTeams`), which is the honest way to grade a snake draft — bench value is
mostly insurance.

## Files

| File | Role |
|------|------|
| `web/lib/valuation-noise.ts` | Private per-manager valuations, shared with `/mock-draft` |
| `web/lib/snake-draft-engine.ts` | Pure engine: board construction, snake order, bot picks, lineups, scoring |
| `web/lib/snake-draft.ts` | Server-side seed: the Draft Sharks consensus pool |
| `web/app/snake-draft/page.tsx` | Server page + access gate |
| `web/app/snake-draft/SnakeDraftClient.tsx` | Setup screen, draft room, standings |
| `web/__tests__/lib/snake-draft-engine.test.ts` | Engine unit tests |
| `web/__tests__/app/snake-draft/SnakeDraftClient.test.tsx` | Component test: setup → bots pick → user picks → standings |

## Caveats

- **Nothing is persisted.** The draft is client-side state; a refresh restarts it.
- **No kickers or defenses.** `scrape_draft_sharks.py` only pulls QB/RB/WR/TE, so
  those positions cannot be drafted or configured in the lineup.
- **The board is half-PPR.** There is no scoring-settings input, so a full-PPR or
  standard league is being approximated. Positional *rank* is fairly robust to
  that; the exact values are not.
- **Auction values are not ADP.** The board is derived from auction prices, where
  you can always buy the quarterback you want; in a snake you cannot. Elite
  superflex QBs consequently come off this board a little later than superflex
  ADP would have them.
- **The bots have no draft strategy beyond value and need.** They don't run on
  positional tiers, don't anticipate a run, don't reach for their handcuff, and
  don't adjust to what the room is doing. The noise slider makes the room
  *disagree*; it does not give any bot a coherent plan.
- **The board is only as fresh as the last `just scrape-draft-sharks` run.** If the
  calendar has rolled to a season that has not been scraped yet, the tool falls
  back to the most recent season that has values.
