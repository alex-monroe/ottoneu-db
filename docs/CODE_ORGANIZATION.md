# Code Organization

## Key File Locations

| Area | Path | Purpose |
|------|------|---------|
| Python config | `scripts/config.py` | All league constants, Supabase client factory |
| TS config | `web/lib/config.ts` | Frontend constants (every key derives from `config.json`; sync enforced by architecture tests) |
| Shared config | `config.json` | **Single source of truth** for every constant shared across Python and TypeScript |
| TS types | `web/lib/types.ts` | All shared TypeScript interfaces (`CorePlayer → RosteredPlayer → StatsPlayer → Player`) |
| Data layer | `web/lib/data.ts` | **Unified data access** — all Supabase fetching goes through here |
| Scoring | `web/lib/scoring.ts` | Ottoneu Half PPR scoring formula (`calculateFantasyPoints`) |
| Analysis math | `web/lib/analysis.ts` | Projection-enriched data + backtest fetching (builds on `data.ts`) |
| Arb logic | `web/lib/arb-logic.ts` | Arbitration simulation logic |
| Replacement level (lineup-derived) | `web/lib/replacement.ts` | `computeReplacementDemand()` — starting demand per position from `NUM_TEAMS × STARTING_LINEUP[pos]`, then flex + `BENCH_DEPTH_PER_TEAM` slots allocated one at a time to whichever `FLEX_POSITIONS` entry offers the best next player. QB demand lands at **24** on its own, so the Superflex QB premium is now an arithmetic consequence of counting slots rather than a hand-typed constant. Kickers are excluded upstream. The salary-implied baseline is still computed (`salaryImpliedPpg`) but shown as a diagnostic only. See [references/player-valuation.md § 2](references/player-valuation.md#2-replacement-level-the-marginal-ownable-player) |
| Earned value (derived) | `web/lib/earned-value.ts` (+ MCP `get_earned_value`) | Same closed-economy allocation as `surplus.ts`, run on **actual** season points instead of projections — the Player-Rater half. Ranked on totals not PPG (availability observed rather than modelled), no `MIN_GAMES` filter, replacement recomputed on actuals; the flex-aware baseline and dollar conversion are shared with the projected path deliberately. `realized_surplus = earned_value − salary_paid` grades an auction buy, arbitration dollar or keep/cut call after the fact. Derived at read time (like standings) — no table, no backfill. See [references/player-valuation.md § 4](references/player-valuation.md#4-earned-value-the-retrospective-half) |
| Earned-value fetcher (player card / hover) | `web/lib/earned-value-data.ts` | `buildEarnedRowsForPlayer()` and `buildHoverDataMap()` — end-of-season snapshots per past season so the player card can print `Earned $` per season and the hover card can print the latest season's earned value beside the projection. `buildHoverDataMap` defaults `hasProjectionsAccess: false`, so a future caller on a public page cannot leak dollar valuations by omission |
| Stat window (mid-season proration) | `web/lib/stat-window.ts` (+ `web/components/StatWindowPicker.tsx`, `web/components/StatWindowNote.tsx`) | A `StatWindow` (`complete`, `games`, `weeksPlayed`, `fraction`) travels with the numbers it describes — carries the fact that `player_stats` now holds partial in-season totals since `pull-player-stats.yml` runs Tuesdays. **`fraction === 1` is a strict no-op** — retrospective pages retain bit-exact behaviour. In a partial window only two things are prorated: `distributableCap(fraction)` shrinks the pot and `salary_to_date = price × fraction` matches it, so `realized_surplus` scales together and rankings never move (only units). `full_season_vorp` is deliberately **not** rescaled — the factor cancels in the dollar conversion, so shortening it would change how VORP reads on screen without changing what anyone is worth. `effectiveMinGames()` caps the `MIN_GAMES=4` floor at the depth of the pool early-season so `/value`, `/free-agents`, `/projected-salary` do not render empty. Surfaces on `/value` (Earned tab leads in-season), `/players?tab=efficiency`'s season picker, `<StatWindowNote>` on every panel that reads production, and the `stat_window` block in MCP `get_earned_value`. See [references/player-valuation.md § 4a](references/player-valuation.md#4a-the-stat-window-reading-any-of-this-mid-season) |
| API input schemas | `web/lib/schemas/` | Zod schemas for API route bodies (admin/users, arbitration-plans, surplus-adjustments) |
| Request validation | `web/lib/validate.ts` | `parseJson(req, schema)` helper — returns typed data or a 400 response with Zod issues |
| DB schema | [db-schema.md](generated/db-schema.md) | Generated, human-readable schema reference |
| Migrations | `migrations/` | Numbered `NNN_snake_case.sql` files (source of truth); linted by `just check-migrations`. See [migrations/README.md](../migrations/README.md) |
| Components | `web/components/` | Reusable React components |
| Pages | `web/app/` | Next.js App Router pages |
| Feature projections | `scripts/feature_projections/` | Feature-based projection system (features, combiner, runner, backtest, CLI) |
| Weekly projections | `scripts/weekly_projections/` | In-season per-game projections: Sleeper ingest + Ottoneu re-scoring → `weekly_projections`. Deliberately separate from `feature_projections/` (never feeds the model — enforced by `TestNoWeeklyProjectionsInModel`). See [references/weekly-projections.md](references/weekly-projections.md) |
| NFL week resolver | `scripts/nfl_week.py` + `web/lib/nfl-week.ts` | Twin resolvers (Python + TS) for the current NFL week, anchored on `league_calendar.regular_season_start` with the Tuesday 00:00 ET boundary. Both suites read a shared boundary fixture so they cannot drift |
| Effective stats season | `web/lib/stats-season.ts` | `getEffectiveStatsSeason()` — the season **actual production** reads should use. Takes `statsSeason` from `web/lib/season.ts` and clamps it back to the newest season `player_stats` actually holds; one-directional, never forward past `league_calendar`, stops applying once the current season loads. Use it for anything reading `player_stats` (and the season labels beside those numbers); keep plain `getStatsSeason()` for season-cycle questions, and keep `projectionSeason` for `player_projections` reads such as `buildProjectionMap`. Without the clamp the season rollover renders every stats-joined page empty until `pull-player-stats.yml` runs. See [exec-plans/season-cycle.md § `statsSeason` vs what `player_stats` actually holds](exec-plans/season-cycle.md#statsseason-vs-what-player_stats-actually-holds) |
| Matchup scrape | `scripts/scrape_matchups.py` (`just scrape-matchups`) | Ingests the league's `/schedule` page + `/csv/schedule` export → `league_matchups`. HTML leads; the CSV enriches with numeric team ids so either source going quiet still produces rows. See [references/matchups-and-standings.md](references/matchups-and-standings.md) |
| Lineup scrape | `scripts/scrape_lineups.py` (`just scrape-lineups`) | Ingests each game's public box score (`/football/{league}/game/{game_id}`) → `matchup_lineups` — one row per (game, player), bench included, with slot / points / game state / injury. Uses `scripts/ottoneu_http.py`; one request per game, spaced. Runs after `scrape_matchups.py` in the `pull-matchups.yml` workflow. Ottoneu's own Proj column is **deliberately not stored** — it turns into the actual after a game. See [references/matchups-and-standings.md § Lineups and the live matchup projection](references/matchups-and-standings.md#lineups-and-the-live-matchup-projection) |
| Standings (derived) | `web/lib/standings.ts` (+ `web/lib/matchups.ts`) | Standings, seeding and the playoff picture are **computed from `league_matchups` at read time**, never stored. A test pins the derivation to the league's real 2025 final standings so our math cannot diverge from Ottoneu's silently. Only `game_type='regular'` counts; tiebreak is wins then points for |
| Live matchup projection (derived) | `web/lib/live-matchup.ts` (+ `web/lib/matchup-lineups.ts`) | Each side's **live** matchup score is derived from `matchup_lineups` + `weekly_projections` at read time, never stored: finished starters contribute their `points`, in-progress and scheduled starters contribute their pre-kickoff `weekly_projections.projected_points`. Powers `/scoreboard/[gameId]`, the scoreboard cards, and the homepage's league-status section. Same design principle as standings — one source of truth, one derivation |
| Weekly pick'em | `web/lib/pickem.ts` (+ `web/lib/schemas/pickem.ts`) | Signed-in pick'em picks the winner of every week's matchups; results are **derived** from `league_matchups` at read time (`buildBoard`), not stored. The lock is a clock — `pickemLocksAt` is Thursday 20:00 America/New_York (Thanksgiving noon), computed from `seasonAnchor` in `web/lib/nfl-week.ts`; `league_matchups.status` cannot be the lock because Ottoneu flips it to in-progress on Wednesday. Before the lock `pickemRevealed` is false and `buildBoard` returns only a player count — nobody's picks leak. Picks point at Ottoneu's `game_id`/`team_id` with no FK to `league_matchups`, so a re-scrape never cascade-deletes a week. See [references/matchups-and-standings.md § Weekly pick'em](references/matchups-and-standings.md#weekly-pickem) |
| Community power rankings (derived) | `web/lib/community-rankings.ts` | The public consolidated ranking over host **and** listener ballots (`fetchBallots(season, week, "everyone")`), reduced to a `CommunityRow` with no per-voter fields. Listener ballots stay out of the reveal because `fetchBallots` defaults to host ballots and only this module asks for everyone — `web/__tests__/lib/community-rankings.test.ts` walks `app/`, `lib/` and `components/` and fails if anything else does. See [references/podcast-tools.md § Community power rankings](references/podcast-tools.md#community-power-rankings) |
| Weekly recap (derived) | `web/lib/weekly-recap.ts` | Episode-prep for one finished NFL week (`/podcast/recap?week=N`), derived at read time from `matchup_lineups` + `weekly_projections` + `league_matchups` + `power_ranking_*` — **nothing stored**, same design principle as standings and the live matchup. Keeps **three kinds of surprise** distinct (player vs his kickoff-frozen projection, team vs its starters' projected total — an *upset* is the lower-projected side winning, team vs where the hosts ranked it) and a missing projection is never treated as zero. Overachievers include the bench; busts do not. `benchMisses` re-runs `optimizeLineup` over what players actually scored, so the "left on the bench" list is pure hindsight and reuses the one place the laminar slot maths lives. Defaults to the last **finished** week — a half-played week reads as a league of busts. See [references/podcast-tools.md § Weekly recap](references/podcast-tools.md#weekly-recap) |
| Transaction state machine | `scripts/transaction_state_machine.py` (`just check-transactions`) | Replays `transactions` per player against FA → `add` → OWNED → `cut` → FA + salary invariants. The **same** rulebook guards `reconcile_roster.build_transaction_rows` at write time. Repair is one-directional (only inferred rows are deleted; a violating card row exits nonzero) and converges to a fixpoint. `INFERRED_MARKERS` (Python + `web/lib/mcp/transactions.ts`) is the canonical way to detect inferred rows. See [references/roster-csv-reconciliation.md](references/roster-csv-reconciliation.md#impossible-moves-the-roster-state-machine) |
| Ottoneu HTTP helper | `scripts/ottoneu_http.py` | Shared Cloudflare-safe fetch (plain HTTP + honest User-Agent) used by `scrape_matchups.py` and `scrape_lineups.py`; three older scrapers still carry their own copy of the same idiom (migrating them is a separate cleanup) |
| Route access policy | `web/lib/access.ts` | Edge-safe (no `next/headers`, no Supabase) route-gating policy: `PROJECTIONS_ROUTES`, `ADMIN_ROUTES`, `PUBLIC_API_ROUTES`, and `accessRedirect()`. `web/middleware.ts` imports it, and server components call `requireProjectionsAccess()` (`web/lib/auth.ts`) instead of hand-rolling checks. Matching is segment-aware so `/value` never swallows `/valuation` and `/arb-progress` never swallows `/arbitration`. See [ARCHITECTURE.md § Authentication & Authorization](ARCHITECTURE.md#authentication--authorization) |
| Viewer team resolver | `web/lib/viewer-team.ts` (+ `web/lib/team-binding.ts`) | `getViewerTeam()` resolves the signed-in viewer's `users.team_name` into an Ottoneu team; unbound non-admin accounts get `null` (neutral views), unbound admin accounts fall back to `config.MY_TEAM`. `team-binding.ts` is the DB-only half so the MCP layer (bearer tokens, no cookies) can resolve a team without pulling in the session chain |
| Team object | `web/lib/teams.ts` + `web/components/TeamName.tsx` | Assembles the team-as-first-class-object: roster/cap from the transaction replay, record/rank from the derived standings, schedule flipped into that team's POV, and (gated) surplus + arbitration exposure. `TeamName` is the canonical renderer for a fantasy-team name, so every team in the app links to `/teams/[name]`; `fantasyTeamCol()` in `web/components/columns.tsx` is the `DataTable` equivalent. `teamHref()`/`resolveTeamName()`/`sameTeamName()` handle the display-string-not-id gymnastics (case + padding). See [ARCHITECTURE.md § Teams as objects](ARCHITECTURE.md#teams-as-objects) |
| Data files | `data/` | Manual config data (QB starters, etc.) |
| CI/CD | `.github/workflows/` | GitHub Actions (tests, scraping, projections) |

## Python Configuration (`scripts/config.py`)

All configuration constants live here:
- League settings (`LEAGUE_ID`, `MY_TEAM`, `HISTORICAL_SEASONS`). `MY_TEAM` is the **operator's default only** since #712 — every UI/analysis view resolves "my team" from `users.team_name` via `getViewerTeam()` (`web/lib/viewer-team.ts`), and `MY_TEAM` is applied *only* when an admin account is unbound. Never reintroduce `MY_TEAM` into a component, analysis function, or MCP tool. The current/active season is **not** a static config value — it is resolved at runtime from `league_calendar` via `scripts/season.py` (`league_season`, `projection_season`, `stats_season`, `arbitration_season`) and `web/lib/season.ts`.
- Fantasy rules (`NUM_TEAMS`, `CAP_PER_TEAM`, `POSITIONS`)
- Analysis thresholds (`MIN_GAMES`, `STARTING_LINEUP`, `FLEX_SLOTS`, `FLEX_POSITIONS`, `ROSTER_SPOTS`, `MIN_PLAYER_SALARY`, `FULL_SEASON_GAMES`)
- Arbitration constants
- Shared Supabase client via `get_supabase_client()`

All scripts import from `scripts/config.py` to eliminate duplication and ensure consistency.

## Shared Configuration (`config.json`)

`config.json` at the repo root is the single source of truth for every constant shared between Python and TypeScript. The constant declarations in both `scripts/config.py` and `web/lib/config.ts` are **generated** from it by `scripts/gen_config.py`.

To add or change a shared key:
1. Edit `config.json`.
2. Run `just gen-config` — it rewrites the marked block in `scripts/config.py` and `web/lib/config.ts`. Commit all three.

Do **not** hand-edit the region between the `BEGIN GENERATED CONFIG` / `END GENERATED CONFIG` markers. Hand-written logic (`get_supabase_client()`, `isCollegePlayer()`, simulation constants, position colors) lives outside the markers and is preserved. Per-key type transforms (e.g. `NFL_TEAM_CODES` → `set`/`Set`, `POSITIONS` tuple cast) are encoded in the `PY_OVERRIDES` / `TS_OVERRIDES` maps in `gen_config.py`.

Freshness is enforced mechanically:
- `scripts/tests/test_architecture.py::TestConfigCodegen` — regenerates both blocks in-memory and fails with "run `just gen-config`" if the checked-in output is stale.
- `TestConfigSync` (Python) additionally asserts every `config.json` key is consumed and no dangling key is referenced.
- `web/__tests__/lib/architecture.test.ts::Config JSON Sync` — asserts the TypeScript module's *exported values* match `config.json`.

## Imports in Python Scripts

`scripts/` is a proper Python package (`scripts/__init__.py`, declared in
`pyproject.toml` under `[tool.setuptools]`). **No per-file `sys.path`
manipulation is needed.** Import everything via the canonical `scripts.`
namespace:

```python
from scripts.config import get_supabase_client, SEASON
from scripts.analysis_utils import fetch_multi_season_stats
from scripts.feature_projections.runner import run_model
```

Import resolution is provided by two mechanisms, so it works both under pytest
and when running a script directly (`python scripts/foo.py`) from any cwd:

- **`pythonpath = ["."]`** in `[tool.pytest.ini_options]` — puts the repo root on
  `sys.path` during test collection.
- **Editable install** (`pip install -e .`, included via `-e .` in
  `requirements.txt`) — puts the repo root on `sys.path` for all execution. `just
  install` runs `pip install -r requirements.txt`, so a normal setup gets it
  automatically.

**CI note:** workflows that install an ad-hoc package subset instead of
`requirements.txt` must add `pip install -e . --no-deps` so `import scripts.*`
resolves when they run scripts directly. (Workflows that install the full
`requirements.txt` get `-e .` for free — it's the last entry of the export.)

If you see `ModuleNotFoundError: No module named 'scripts'`, the editable
install is missing — run `venv/bin/pip install -e .` (or `just doctor` to
confirm the editable mapping).

## Python Dependencies

`pyproject.toml` `[project.dependencies]` (+ the `dev` extra) is the **single
source of truth** for direct Python dependencies. Two lockfiles derive from it,
both checked in and kept in sync by `just lock`:

- **`uv.lock`** — the canonical, fully-resolved lockfile (managed by `uv`).
- **`requirements.txt`** — a pinned, marker-aware, pip-installable export of
  `uv.lock` (`uv export`), ending in `-e .`. It is **generated, not
  hand-edited** — it keeps the zero-extra-tooling `python -m venv venv && pip
  install -r requirements.txt` workflow working and reproducible.

To change a dependency: edit `pyproject.toml`, then run `just lock` (runs
`uv lock` + `uv export`) and commit both lockfiles. `uv` itself is pinned in the
`dev` extra so `just lock` always has it. CI installs from `requirements.txt`
via `uv pip install` with caching.
