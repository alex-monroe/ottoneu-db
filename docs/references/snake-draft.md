# Snake Draft (`/snake-draft`)

A practice **snake draft** against AI opponents, for redraft leagues that have
nothing to do with Ottoneu league 309. **Public — no sign-in, no database.** The
board is a static module and the whole draft runs in the browser.

This is a **separate tool** from [`/mock-draft`](mock-draft.md), which is the
Ottoneu keeper *auction* seeded from live league state. The only machinery the
two share is the private-valuation noise (`web/lib/valuation-noise.ts`).

| | `/mock-draft` | `/snake-draft` |
|---|---|---|
| Format | Keeper auction (live English or sealed bid) | Snake draft |
| League | Ottoneu 309, real rosters + caps | Any league — you configure it |
| Currency | Auction dollars against a $400 cap | Value over replacement, no money |
| Board | Draft Sharks half-PPR superflex auction values, from Supabase | The Athletic's 12-team PPR 1-QB VORP board, a static file |
| Access | Signed in, `has_projections_access` | Public |

## The board

`web/lib/data/athletic-vorp.ts` holds **The Athletic's published preseason VORP
board** — 300 players (QB/RB/WR/TE), each with a positional rank, bye week,
projected points and VORP, downloaded for a **12-team, single-QB, PPR** league.
It is the tool's only ranking source; nothing is read from Supabase.

Their VORP is not one formula. Read back out of the numbers
(`boardStats`, which derives this rather than hardcoding it):

| Pos | Replacement lands on | VORP relationship to projected points |
|---|---|---|
| QB | QB16 | **not affine** — implied baseline climbs from ~247 for the QB1 to ~330 for the QB40 |
| RB | RB44 | `0.80 × (points − 117.5)` — exact |
| WR | WR60 | `points − 148.2` — exact |
| TE | TE21 | `points − 127.7` — exact |

Two things follow. Their replacement level is **deeper than "last starter"** —
WR60 in a 12-team league is the last receiver anyone *rosters*, not the last one
anyone starts. And the QB column can't be reproduced by any shift of season
points; it reads as a streaming-aware replacement (the worse your quarterback,
the more you would simply play the waiver wire instead). So the published values
are used **as published** rather than re-derived.

## Changing the format

The board is calibrated for one format, but the tool lets you configure another.
`buildBoard` handles that by moving the **baseline**, never by recomputing the
value:

```
replacementRank(pos) = sourceRank(pos) × (teams / 12)
                     + teams × (startersPerTeam(yourLineup, pos) − startersPerTeam(theirLineup, pos))

value(player)        = publishedVorp + slope(pos) × (sourceBaselinePoints(pos) − newBaselinePoints(pos))
```

`startersPerTeam` splits a flex slot the way flex slots actually get filled
(RB .40 · WR .50 · TE .10) and a superflex slot as a quarterback 85% of the
time. `slope` is the published VORP-per-point above — exact at RB/WR/TE, and at
QB the least-squares 1.16, which is an approximation used only to price a change
*away* from 1 QB.

**At 12 teams and their lineup this correction is exactly zero**, by
construction: the baseline is defined as the points of the player at the source
replacement rank, so `sourceBaselinePoints == newBaselinePoints`. You draft off
their numbers, in their order. (Three players sit at exactly 0.00 VORP and are
ordered among themselves by projected points instead of arbitrarily — the only
place this board differs from the published one.)

What the correction does elsewhere:

- **Superflex** — QB starters go 1.0 → 1.85 per team, replacement falls from
  QB16 to QB26, and every quarterback gains the ~48 points between them. Josh
  Allen goes from board rank 15 (their number, back of round 2) to rank 7.
- **10-team** — every baseline moves shallower, so values fall league-wide, and
  they fall *fastest* at the positions with the steepest curve there.

The setup screen names the replacement level for the configured format and says
whether values are as published or adjusted.

## Setup

| Setting | Range | Default |
|---|---|---|
| Teams | 4 – 20 | 12 (the board's own) |
| My draft slot | 1 – *teams* | 1 |
| Rounds | 1 – 30 | 15 |
| Starting lineup | QB · RB · WR · TE · FLEX · SFLEX, 0–6 each | 1 · 2 · 2 · 1 · 1 · 0 (the board's own) |
| Manager valuation noise | 0 → ±90%, 5% steps | 0 |
| Pace | instant / fast / normal | fast |

The setup screen previews the overall pick numbers your slot owns (`#3 · #18 ·
#23 · …`). Two lineup presets — **1 QB** and **Superflex** — set the lineup in
one click.

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

**Real VORP goes negative below replacement, and this model is multiplicative.**
A negative value would invert both the need discount and the manager's private
multiplier — a bot would start *preferring* positions it had no room for. So the
value a bot scores with is floored at `MIN_PICK_VALUE` (0.1), which leaves every
below-replacement player effectively tied and lets the board's own order break
the tie. Displayed values and the final standings are untouched.

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
highest `value × needMultiplier` on the board, at published value.

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
| `web/lib/data/athletic-vorp.ts` | The published board: 300 rows + the format it was built for |
| `web/lib/valuation-noise.ts` | Private per-manager valuations, shared with `/mock-draft` |
| `web/lib/snake-draft-engine.ts` | Pure engine: board stats + format correction, snake order, bot picks, lineups, scoring |
| `web/app/snake-draft/page.tsx` | Server page — no gate, no data fetch |
| `web/app/snake-draft/SnakeDraftClient.tsx` | Setup screen, draft room, standings |
| `web/__tests__/lib/snake-draft-engine.test.ts` | Engine unit tests (including the published-board regression) |
| `web/__tests__/app/snake-draft/SnakeDraftClient.test.tsx` | Component test: setup → bots pick → user picks → standings |

## Updating the board

There is no scraper for this — the file was built from a downloaded table. To
refresh it for a new season, replace the rows in `athletic-vorp.ts` (keeping the
`[name, pos, posRank, bye, points, vorp]` tuple shape) and update
`SOURCE_FORMAT` if the new download is for a different league format. Everything
downstream — replacement ranks, baselines, slopes — is derived from the data at
runtime, so nothing else needs touching. The engine tests assert the derived
baselines, so a bad paste fails loudly.

## Caveats

- **The board is a third-party ranking**, republished on a public page. That is a
  deliberate choice by the site owner, not something the tool infers.
- **Nothing is persisted.** The draft is client-side state; a refresh restarts it.
- **No kickers or defenses** — the source board has none.
- **It is a PPR board.** There is no scoring-settings input, so a half-PPR or
  standard league is being approximated. Positional *rank* is fairly robust to
  that; the exact values are not.
- **The QB slope is fitted, not exact.** At 1 QB it is never used (the correction
  is zero); away from 1 QB it prices the baseline move approximately.
- **Values are static.** No injuries, no depth-chart moves, no news since the
  download.
- **The bots have no draft strategy beyond value and need.** They don't run on
  positional tiers, don't anticipate a run, don't reach for their handcuff, and
  don't adjust to what the room is doing. The noise slider makes the room
  *disagree*; it does not give any bot a coherent plan.
