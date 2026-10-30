# Generalizing the score worm: plan and status

The score worm, its Win % view and the 80% "hurricane" cone were built for
League 309. Nothing about them is specific to Ottoneu, though: any head-to-head
fantasy game is two running totals moving across a scoring period. This doc is
the plan for using them in other leagues and on other platforms, and the record
of what has been done so far.

**Status:** the league-agnostic core has been extracted into an in-repo package,
[`web/packages/fantasy-worm`](../../web/packages/fantasy-worm/README.md), and
SOFA DB now consumes it. Steps 1–3 and 5 below are done. Steps 4 and 6 are
recommendations that need Alex's call before anything is published.

## 1. Inventory

| Piece | Inputs | Depends on | Ottoneu / SOFA-specific assumptions |
|---|---|---|---|
| `web/lib/score-worm.ts` (now an adapter) | `matchup_score_plays` / `matchup_score_snapshots` rows: `home_*` / `away_*` columns | `LEAGUE_TZ` | home/away column names; ET day labels; NFL wording in the footnotes ("60 per starter", "NFL play-by-play") |
| `web/lib/worm-cone.ts` (now an adapter) | worm points | `WORM_LINEUP_SD` (config.json) | the spread (20.3) is calibrated on this league's scoring and lineup size |
| `web/components/ScoreWorm.tsx` | `WormChart` from `wormChart()` | React 19, Recharts 3, Tailwind 4, app tokens (`bg-raised`, `text-ink-*`, `--worm-left/right`) | wording ("The worm", "Minutes played", "Likely finals from here"); app design tokens |
| `web/lib/matchup-lineups.ts` (`fetchScoreSnapshots`) | Supabase | Supabase client | table names; plays-over-scrapes fallback |
| `scripts/rebuild_score_worm.py` | nflverse play-by-play, roster, schedule; `matchup_lineups`, `league_matchups`, `weekly_projections` | pandas, requests, Supabase | Ottoneu scoring (`SCORING_SETTINGS` + `SCORING_EXTRAS`); name→gsis matching; Ottoneu→nflverse team codes; **game length floored at 3,600 s** (NFL regulation) and 600 s overtime periods; `LEAGUE_ID`; "Adjustment to Ottoneu's final" row |
| `scripts/scrape_lineups.py` | Ottoneu box scores | Playwright/HTTP | writes the live `matchup_score_snapshots` |
| Migrations 053, 055–058 | | | schema for the two tables above |

The useful split is between the **math** (worm series, progress view, cone,
win probability) and the **plumbing**: fetching lineups, scoring plays with a
platform's rules, matching players, storing rows. The math holds no
assumptions beyond "two sides, running totals, a share of each lineup played".
All of the plumbing is platform-specific.

## 2. The data contract

The package's input is a time series of `ScoreFrame`s. Each frame has `at`,
`left` and `right`, plus optional progress, the left side's win probability,
and projected points still to come (full definition in the
[package README](../../web/packages/fantasy-worm/README.md#the-data-contract)).
Design choices:

- **`left` / `right`, not home/away.** The page decides who is drawn first
  (`/matchup` puts the viewer first). Platforms disagree on whether "home" means
  anything.
- **Progress is a share (0–1), not minutes.** This keeps the progress view
  sport-agnostic: NFL game seconds, NBA minutes, MLB outs and cricket balls all
  reduce to "share of this lineup played".
- **Each optional field turns on a view.** A platform that only offers polled
  scores still gets the clock worm. Adding progress and projections unlocks the
  rest.
- **Every league-specific constant is a parameter:** `sd`, `timeZone`,
  `locale`, `originLabel`, `progressLabel`, and the footnote `notes`.

The model behind win probability can also be run by the package itself.
`rebuildFrames({ slots, clocks, events, sd, close })` takes lineup **slots**
(one player × one real game, so an NBA player with three games is three
slots), real-game **clocks** (wall time → elapsed game time) and **scored
events**, and returns frames. The caller still does the scoring and the player
matching.

## 3. Extraction (done)

- `web/packages/fantasy-worm/src/` contains `types.ts`, `worm.ts`, `cone.ts`,
  `win-probability.ts` (a TS port of `win_probability` / `WinModel`, with an
  erf-based normal CDF) and `rebuild.ts` (a TS port of `build_game_plays`,
  without the Ottoneu-specific parts). It has no runtime dependencies.
  `web/__tests__/lib/architecture.test.ts` fails if the package imports
  anything outside itself.
- It is wired in through the `fantasy-worm` path alias in `web/tsconfig.json`
  and `web/jest.config.ts`. It is not an npm workspace, so `package-lock.json`
  is unchanged.
- `web/lib/score-worm.ts` and `web/lib/worm-cone.ts` are now thin Ottoneu
  adapters. They map `home_*`/`away_*` rows to frames and pass in `LEAGUE_TZ`,
  `WORM_LINEUP_SD` and the existing footnotes. Their public API is unchanged,
  so the pages and `ScoreWorm.tsx` were not touched.
- **Output unchanged:** `wormChart`, `buildWorm`, `dayTicks`, `coneFrom` and
  `finalRanges` were run over the plays, flipped and scrape variants of a game
  before and after the refactor (every hover index, both cone sds), and the
  JSON dumps were byte-identical. The existing `score-worm` and `worm-cone`
  tests pass unmodified.
- **One deliberate behavior addition:** `buildWorm` now keeps a *last* frame
  whose progress is 1 on both sides even when it repeats the score, so that a
  generic "Final" frame settles the Win % line. Ottoneu's data never reaches
  this case: the Python job writes its settled row only when the totals change.
- **Deviations from the plan, and why.** (a) `ScoreWorm.tsx` stays in `web/`
  for now. It is built from the app's Tailwind tokens, and a reusable version
  needs a theming API (see §6), which is a design decision rather than a move.
  (b) The production rebuild stays in Python. The package carries a TS port,
  held to the Python output by a parity fixture, rather than replacing a job
  that works.

## 4. Productization path (recommendation, needs a decision)

| Option | What it is | For | Against |
|---|---|---|---|
| **A. Library** (`fantasy-worm` on npm, plus a React chart) | Developers bring frames | Cheap; the contract is already proven; no data liability | Reaches developers only; most fantasy players will never use a library |
| **B. Hosted service** ("enter your league ID") | We fetch the league, build frames, host the chart | Reaches players directly | Ongoing cost; platform ToS and auth; play-level data is the hard part (below) |
| **C. Both, library first** | Ship A, then a thin B on top of it for one platform | B dogfoods A; each step can stop early | Two surfaces to maintain |

**Recommendation: C, in order.** Publish the library, then build a post-week
hosted demo for a single platform.

**The constraint that shapes B:** the clock worm needs nothing but polled
scores, but the play-by-play worm, the progress view, Win % and the cone need
*timed scoring events* and *game clocks*. For the NFL, nflverse supplies both
for free once games are final, which is how SOFA DB rebuilds a week after it
ends. Live play-level data needs a paid real-time stats feed, with licensing to
match. So a hosted v1 should do what SOFA DB does: show the polled clock worm
during the week and rebuild the full worm after it.

**Platform order (verify each API's current terms before building):**

1. **Sleeper.** Its read API is public and needs no auth, and it is popular
   in dynasty and superflex leagues. It is the most likely first hosted target.
2. **ESPN, Yahoo.** These have the largest audience, but private ESPN leagues
   need the user's cookies and Yahoo needs OAuth, so they come later.
3. **Ottoneu.** Already done here; scraping it does not scale to other people's
   leagues.
4. **Other sports.** NBA H2H points is already a fixture. Category leagues are
   out of scope (§6).

## 5. Fixtures across league formats (done)

`web/packages/fantasy-worm/fixtures/` holds two formats as plain JSON, and
`__tests__/fixtures.test.ts` runs every view over both:

- **Ottoneu superflex half PPR (NFL):** a Thursday-to-Monday week, one game per
  starter, a starter on bye, an overtime game. It doubles as the **Python parity
  fixture**: `ottoneu-superflex-half-ppr.python.json` is
  `scripts/rebuild_score_worm.py`'s output on the same input.
- **ESPN-style NBA weekly H2H points:** several games per player (one slot
  each), 48-minute games, an overtime game, and a weekly sd of 32 instead of
  20.3.

The checks assert properties that must hold in any format: progress rises to
1 and projections fall to 0; win % stays in [0, 100] and mirrors exactly when
the sides flip; the cone has zero width at the hovered point and the
final-score ranges narrow monotonically; a closed game settles at 0/100. They
also check behavior specific to each format (a bye adds no minutes; a player's
later games keep projecting).

The Python job **cannot** rebuild the NBA fixture as written: `GameClock`
floors every game at 3,600 s. That floor is the one Python assumption a
generic backend would have to drop. The TS port takes `length` from the clock.

**Fixtures to add before 1.0:** Sleeper 1QB full PPR with real exported data;
a league whose weeks have no Thursday game; an MLB weekly points week (outs as
progress); a "vs league median" game, where the median is modeled as the
right side.

## 6. Packaging, versioning, licensing, docs

- **Packaging.** Either publish from this monorepo or split the package into
  its own repo. Splitting is cleaner once there are outside contributors.
  Build ESM + CJS + `.d.ts` (tsup), flip `private` off, and point
  `main`/`exports` at `dist/`. Add a `fantasy-worm/react` entry with the chart:
  Recharts as a peer dependency, colors and fonts from CSS variables
  (`--fw-left`, `--fw-right`, `--fw-ink`…) rather than Tailwind classes, and
  all labels as props.
- **Versioning.** Use semver, and stay on 0.x until the `ScoreFrame` contract
  has had one outside consumer. A field rename is a major bump after 1.0. Keep
  a changelog, and keep the parity fixture in CI so the TS model cannot drift
  from the Python one.
- **Licensing — Alex's call.** The repo README currently says "for personal use
  in Ottoneu League 309", and the package is `UNLICENSED` / `private` to match.
  MIT (or Apache-2.0) is the usual choice for adoption. If a hosted service
  republishes nflverse-derived data, check nflverse's data license and
  attribution terms first.
- **Docs for outsiders.** These need: the README (contract, model, parity —
  written); a **calibration guide** for `sd` (the RMS of actual − projected
  lineup totals; `just rebuild-score-worm --calibrate` is the reference
  implementation); a hosted demo page that renders the fixtures; and a "bring
  your platform" guide covering slots, clocks and events.

**Out of scope for the first release:**

- live play-level feeds (post-week rebuild and polled scores only)
- more than one platform adapter
- auth to private ESPN/Yahoo leagues
- a Python distribution of the package
- non-head-to-head formats (rotisserie, H2H categories, best ball without
  lineups)
- more than two sides per chart
- storage or hosting of anyone's league data
- per-player cones (the cone is per lineup)

## Next steps

1. Alex decides on the license and on whether to publish (§4, §6).
2. Build `fantasy-worm/react` with the CSS-variable theme, then switch
   `ScoreWorm.tsx` to it with the same byte-identical check.
3. Add a Sleeper adapter, fed by a real exported week as a third fixture.
4. Add the tsup build and npm publish.
