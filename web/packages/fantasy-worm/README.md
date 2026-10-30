# fantasy-worm

The score worm, win probability and 80% "hurricane" cone for any head-to-head
fantasy game, whatever the platform, sport or league format. This is the
league-agnostic core behind SOFA DB's game-page worm. ottoneu-db consumes it
through `web/lib/score-worm.ts` and `web/lib/worm-cone.ts`.

**Status: 0.x, in-repo, unpublished.** The roadmap for shipping it outside this
repo, and what is still out of scope, is in
[docs/references/worm-productization.md](../../../docs/references/worm-productization.md).

- **Zero runtime dependencies.** Pure TypeScript, no React, no config. Every
  league-specific value is a parameter.
- **Two ways in.** Hand it frames you already have (`wormChart`), or have it
  build them from lineup slots, game clocks and scoring events (`rebuildFrames`).

## The data contract

```ts
interface ScoreFrame {
  at: string;                    // ISO 8601
  left: number; right: number;   // running totals, left = drawn first
  note?: string | null;          // "J. Chase +9.40"
  leftProgress?: number | null;  // 0–1 share of each lineup played
  rightProgress?: number | null;
  leftWinProb?: number | null;   // 0–1, the left side's chance
  leftRemaining?: number | null; // projected points still to come
  rightRemaining?: number | null;
}
```

Only `at`, `left` and `right` are required. Each optional field enables a
view:

| You supply | You get |
|---|---|
| `at`, `left`, `right` | the clock worm, lead changes, biggest leads |
| + `leftProgress`, `rightProgress` on every frame | the progress ("minutes played") view |
| + `leftWinProb` on every frame | the Win % view and its story ("won after falling to 12%") |
| + `leftRemaining`, `rightRemaining` and progress | the hurricane cone and "likely finals from here" |

A frame where both totals are 0 is the **kickoff** frame. Its win probability
and projections become the origin's. A **last frame with both progress values at
1** is kept even if it repeats the score, so a closing "Final" frame settles the
win line at 0 or 100.

## Usage

```ts
import { wormChart, coneFrom, finalRanges, rebuildFrames } from "fantasy-worm";

// 1. You already have frames (polled scores, or your own model's output):
const chart = wormChart(frames, "Alpha", "Beta", {
  timeZone: "America/New_York",              // labels and day ticks; default UTC
  progressLabel: (pct) => `${Math.round(pct)}% of minutes`,
  notes: { clock: "One point per scoring play." },
});

// 2. Or build frames from lineup slots, real-game clocks and scored events:
const built = rebuildFrames({
  slots: [{ id: "chase", side: "left", projected: 16.2, game: "CIN_PIT", name: "J. Chase" } /* … */],
  clocks: { CIN_PIT: { times: [/* ISO */], elapsed: [/* seconds */], length: 3600 } },
  events: [{ at: "2026-09-20T17:50:00Z", points: { chase: 12.3 } }],
  sd: 20.3,                                   // your league's lineup spread
  close: { at: "2026-09-22T03:30:00Z", note: "Final" },
});

// 3. The cone, per hovered point (cheap enough to compute on hover):
const bands = coneFrom(chart!.points, hoverIndex, 20.3);
const ranges = finalRanges(chart!.points, hoverIndex, 20.3);
```

A **slot** is one player's appearance in one real game. An NFL starter is one
slot. An NBA starter with three games that week is three. Scoring the events is
the caller's job (that is where platform rules live), and so is deciding which
real game a slot belongs to.

## The model

- **Expected final** for a side = points so far + Σ (slot projection × share of
  its game not yet played).
- **Uncertainty left** = `sd² × (1 − progress)` per side, where `sd` is the
  spread of a full lineup's actual total around its projection.
- **Win probability** = Φ(expected margin / √(left variance + right variance)).
- **Cone** from point t to a later point s:
  `centre = points(t) + remaining(t) − remaining(s)`,
  `half-width = 1.2816 × sd × √(progress(s) − progress(t))` (central 80%).

`sd` is the one number you must calibrate per league format. Take the RMS of
(actual − projected) lineup totals over past weeks. It is 20.3 for Ottoneu
superflex half PPR, and much larger for a weekly NBA points lineup.

## Parity

`rebuildFrames` + `leftWinProbability` port `scripts/rebuild_score_worm.py`
(`build_game_plays`, `WinModel`). `fixtures/ottoneu-superflex-half-ppr.python.json`
holds the Python model's output on the same fixture, and
`__tests__/rebuild.test.ts` holds the TypeScript to it: progress, remaining and
notes must match exactly, and win probability to within 0.0001 (rounding ties).
`normalCdf` is pinned to `statistics.NormalDist` to 1e-13.

## Fixtures

`fixtures/` holds two league formats as plain JSON (slots, compact clocks,
events), loaded by `fixtures/index.ts`:

- `ottoneu-superflex-half-ppr.json`: NFL, Thursday to Monday, one game per
  starter, a starter on bye, an overtime game.
- `espn-nba-h2h-points-week.json`: NBA weekly head-to-head points, several
  games per player, 48-minute games and an overtime game.

`__tests__/fixtures.test.ts` runs every view over both.
