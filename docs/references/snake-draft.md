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

## Where my picks land

The board shows a rule across it for each of my upcoming picks — everything
below the line is what should still be there when that pick comes around.

The model is the simple one, and the one the ranking itself supports: assume
players come off the board in board order, so the `n` picks between now and mine
consume the top `n` players and the best thing left for me sits at index `n`.
The line moves up as the draft actually unfolds, and the pick on the clock gets
no marker (it would sit at the top of the board and tell you nothing).

Marker positions are indexes into the **whole** board, so they stay honest under
a position filter: with WRs showing, "my pick #17" lands above the best receiver
expected to survive that long, not above the 17th receiver. It is an estimate —
a run at one position pushes value down the board, a quiet position pushes it up.

## How the bots draft

Every bot scores the whole remaining board and takes the best thing on it:

```
score = value, bent by his opinion of the player and his taste for the position
      + what his roster needs
```

### Need is a bonus, not a multiplier

VORP is an **interval** scale — the gap between two players means something, the
ratio does not — so roster need is added in board points rather than multiplied:

| Situation | Adjustment |
|---|---|
| Steps into an empty slot at his own position | **+22** |
| Fills an empty FLEX / superflex slot (fungible) | **+12** |
| Bench body, `depth` deep behind the starters | **−(QB 26 · RB 8 · WR 7 · TE 22) × depth** |
| Past the positional ceiling (`maxAtPos`) | won't draft him |

Multiplying was tried first and broke badly. Late in a draft every player left
is below replacement, so their VORP is negative; the values were clamped
positive to keep the multiplication working, which flattened the value term and
left **need alone** deciding every pick. All twelve teams have near-identical
needs at that point, so they all wanted the same position — and the draft
produced runs of a dozen straight running backs. Adding a bonus keeps the
board's own ordering alive down the tail, where the values are still spread over
tens of points.

The depth penalty is steeper at QB and TE because a bench player there is close
to useless. A sixth receiver still covers byes and flexes in; a third tight end
in a one-TE league does neither — and the board prices tight ends off a deep
replacement level (TE21), so their raw values stay competitive long after a
roster has stopped needing one. With a flat penalty, a third TE became the
*modal* outcome.

`maxAtPos` (slots the position can fill, plus a bench of QB 2 · RB 4 · WR 5 · TE
1) is a backstop against absurdity, not the thing that shapes a roster. Cinching
it tighter — it once held tight ends to the slots they could start — made every
team in the room finish with an identical positional split, because the ceiling
bound before taste ever got a say.

### Positional taste

Every manager is a bit irrational about positions: one always leaves with four
running backs, another cannot stop taking receivers. `positionalBias` gives each
team a private, draft-stable multiplier per position (±30%), from the same
deterministic hash the per-player noise uses, keyed on the position instead of
the player.

It is **always on and independent of the noise slider**. The slider governs
whether managers disagree about *players*; this is whether they disagree about
*positions*. Without it a room of bots holding identical rosters wants identical
things and drafts in lockstep — the same failure the need multiplier caused, from
the other direction. Measured over ten 12-team drafts, it is the difference
between every team finishing on the same positional split and ten or eleven
distinct ones.

### Sign-safe opinions

Every multiplier — the noise slider, positional taste, the per-pick jitter —
goes through `applyMultiplier(value, m) = value + (m − 1) × |value|`. A plain
`value × m` inverts below replacement: a manager 40% *high* on a −30 player
would price him at −42, i.e. lower. This gives exactly `value × m` wherever
value is positive and the intended direction below zero.

### Roster crunch

Once a team has no more picks than it has unfillable starting slots
(`picksLeft ≤ openStarterSlots`), it stops taking best available and only drafts
players who fill a hole — the behaviour real drafters show in the last couple of
rounds. If nothing on the board fills a hole (or everything left is capped out),
it takes the best body available rather than forfeit the pick. Across 144
simulated rosters, none finished unable to field a lineup.

### The superflex slot is planned as a QB slot

Any position may legally *start* there — `startingLineup` and the final standings
honour that — but roster planning uses a narrower list (QB · RB · WR). Counting
TE as a superflex starter gave bots a phantom starting job and left them holding
a third tight end in a one-TE league.

## Manager valuation noise

Each rival gets a private multiplier on every player, uniform in
`[1 − spread, 1 + spread]`, from a deterministic hash of `(seed, team name,
player id)` (`valuationMultiplier` in `web/lib/valuation-noise.ts`, shared with
`/mock-draft`).

- **Stable within a draft** — a manager who is 40% high on a receiver stays 40%
  high on him in every round.
- **Fresh between drafts** — a new seed is drawn each time you start one.

At 0 the room prices every *player* exactly as the board does, and only
positional taste separates the managers. Turn it up for a messier room: more
reaches, and more of your targets sliding to you.

> **The hash needs a finalizer.** Plain FNV-1a barely mixes its last byte: two
> keys differing only in a trailing character land ~0.4% of the range apart. That
> is invisible with the auction board's UUID player ids and fatal with this
> board's structured ones (`WR1`, `WR2`, …) — every manager got nearly the same
> opinion of every player and the slider quietly did nothing. `hash32` now runs a
> MurmurHash3 finalizer over the FNV output, and
> `__tests__/lib/valuation-noise.test.ts` asserts the avalanche.

Your side of the draft is never noised. **Take best available** recommends the
highest `value + needBonus` on the board, at published value.

## Running the draft

Bots pick on a timer (instant / 250ms / 700ms per pick) so the draft reads like
a draft. **Skip to my pick** fast-forwards the bots instantly; **Auto-draft
rest** runs the remainder including your own picks, on the same heuristic.

The **Draft history** panel in the sidebar keeps *every* pick, newest first,
with the running count in its heading; it scrolls inside a fixed-height box
rather than growing the page or dropping older picks. (It previously rendered
only the last 12, so earlier rounds were unrecoverable once the draft moved on.)

When the board empties or the last round ends, the standings replace the board:
every roster ranked by the value of the starting lineup it can actually field
(`scoreTeams`), which is the honest way to grade a snake draft — bench value is
mostly insurance.

## Files

| File | Role |
|------|------|
| `web/lib/data/athletic-vorp.ts` | The published board: 300 rows + the format it was built for |
| `web/lib/valuation-noise.ts` | Private per-manager valuations, shared with `/mock-draft` |
| `web/lib/snake-draft-engine.ts` | Pure engine: board stats + format correction, snake order, bot picks, pick markers, lineups, scoring |
| `web/app/snake-draft/page.tsx` | Server page — no gate, no data fetch |
| `web/app/snake-draft/SnakeDraftClient.tsx` | Setup screen, draft room, standings |
| `web/__tests__/lib/snake-draft-engine.test.ts` | Engine unit tests (including the published-board regression) |
| `web/__tests__/lib/valuation-noise.test.ts` | Noise primitives, including the hash-avalanche regression |
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
- **The bots have no draft strategy beyond value, need and positional taste.**
  They don't run on positional tiers, don't anticipate a run, don't reach for
  their handcuff, and don't adjust to what the room is doing. Taste makes a
  manager lean on a position all draft; it is not a coherent plan.
- **The pick markers assume board order.** They are where your picks land if
  nothing surprising happens, which is not how drafts go.
