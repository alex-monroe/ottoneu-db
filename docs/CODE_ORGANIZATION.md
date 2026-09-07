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
| API input schemas | `web/lib/schemas/` | Zod schemas for API route bodies (admin/users, arbitration-plans, surplus-adjustments) |
| Request validation | `web/lib/validate.ts` | `parseJson(req, schema)` helper — returns typed data or a 400 response with Zod issues |
| DB schema | [db-schema.md](generated/db-schema.md) | Generated, human-readable schema reference |
| Migrations | `migrations/` | Numbered `NNN_snake_case.sql` files (source of truth); linted by `just check-migrations`. See [migrations/README.md](../migrations/README.md) |
| Components | `web/components/` | Reusable React components |
| Pages | `web/app/` | Next.js App Router pages |
| Feature projections | `scripts/feature_projections/` | Feature-based projection system (features, combiner, runner, backtest, CLI) |
| Weekly projections | `scripts/weekly_projections/` | In-season per-game projections: Sleeper ingest + Ottoneu re-scoring → `weekly_projections`. Deliberately separate from `feature_projections/` (never feeds the model — enforced by `TestNoWeeklyProjectionsInModel`). See [references/weekly-projections.md](references/weekly-projections.md) |
| NFL week resolver | `scripts/nfl_week.py` + `web/lib/nfl-week.ts` | Twin resolvers (Python + TS) for the current NFL week, anchored on `league_calendar.regular_season_start` with the Tuesday 00:00 ET boundary. Both suites read a shared boundary fixture so they cannot drift |
| Matchup scrape | `scripts/scrape_matchups.py` (`just scrape-matchups`) | Ingests the league's `/schedule` page + `/csv/schedule` export → `league_matchups`. HTML leads; the CSV enriches with numeric team ids so either source going quiet still produces rows. See [references/matchups-and-standings.md](references/matchups-and-standings.md) |
| Standings (derived) | `web/lib/standings.ts` (+ `web/lib/matchups.ts`) | Standings, seeding and the playoff picture are **computed from `league_matchups` at read time**, never stored. A test pins the derivation to the league's real 2025 final standings so our math cannot diverge from Ottoneu's silently. Only `game_type='regular'` counts; tiebreak is wins then points for |
| Transaction state machine | `scripts/transaction_state_machine.py` (`just check-transactions`) | Replays `transactions` per player against FA → `add` → OWNED → `cut` → FA + salary invariants. The **same** rulebook guards `reconcile_roster.build_transaction_rows` at write time. Repair is one-directional (only inferred rows are deleted; a violating card row exits nonzero) and converges to a fixpoint. `INFERRED_MARKERS` (Python + `web/lib/mcp/transactions.ts`) is the canonical way to detect inferred rows. See [references/roster-csv-reconciliation.md](references/roster-csv-reconciliation.md#impossible-moves-the-roster-state-machine) |
| Ottoneu HTTP helper | `scripts/ottoneu_http.py` | Shared Cloudflare-safe fetch (plain HTTP + honest User-Agent) used by `scrape_matchups.py`; three older scrapers still carry their own copy of the same idiom (migrating them is a separate cleanup) |
| Route access policy | `web/lib/access.ts` | Edge-safe (no `next/headers`, no Supabase) route-gating policy: `PROJECTIONS_ROUTES`, `ADMIN_ROUTES`, `PUBLIC_API_ROUTES`, and `accessRedirect()`. `web/middleware.ts` imports it, and server components call `requireProjectionsAccess()` (`web/lib/auth.ts`) instead of hand-rolling checks. Matching is segment-aware so `/value` never swallows `/valuation` and `/arb-progress` never swallows `/arbitration`. See [ARCHITECTURE.md § Authentication & Authorization](ARCHITECTURE.md#authentication--authorization) |
| Viewer team resolver | `web/lib/viewer-team.ts` (+ `web/lib/team-binding.ts`) | `getViewerTeam()` resolves the signed-in viewer's `users.team_name` into an Ottoneu team; unbound non-admin accounts get `null` (neutral views), unbound admin accounts fall back to `config.MY_TEAM`. `team-binding.ts` is the DB-only half so the MCP layer (bearer tokens, no cookies) can resolve a team without pulling in the session chain |
| Team object | `web/lib/teams.ts` + `web/components/TeamName.tsx` | Assembles the team-as-first-class-object: roster/cap from the transaction replay, record/rank from the derived standings, schedule flipped into that team's POV, and (gated) surplus + arbitration exposure. `TeamName` is the canonical renderer for a fantasy-team name, so every team in the app links to `/teams/[name]`; `fantasyTeamCol()` in `web/components/columns.tsx` is the `DataTable` equivalent. `teamHref()`/`resolveTeamName()`/`sameTeamName()` handle the display-string-not-id gymnastics (case + padding). See [ARCHITECTURE.md § Teams as objects](ARCHITECTURE.md#teams-as-objects) |
| Data files | `data/` | Manual config data (QB starters, etc.) |
| CI/CD | `.github/workflows/` | GitHub Actions (tests, scraping, projections) |

## Python Configuration (`scripts/config.py`)

All configuration constants live here:
- League settings (`LEAGUE_ID`, `MY_TEAM`, `HISTORICAL_SEASONS`). `MY_TEAM` is the **operator's default only** since #712 — every UI/analysis view resolves "my team" from `users.team_name` via `getViewerTeam()` (`web/lib/viewer-team.ts`), and `MY_TEAM` is applied *only* when an admin account is unbound. Never reintroduce `MY_TEAM` into a component, analysis function, or MCP tool. The current/active season is **not** a static config value — it is resolved at runtime from `league_calendar` via `scripts/season.py` (`league_season`, `projection_season`, `stats_season`, `arbitration_season`) and `web/lib/season.ts`.
- Fantasy rules (`NUM_TEAMS`, `CAP_PER_TEAM`, `POSITIONS`)
- Analysis thresholds (`MIN_GAMES`, `REPLACEMENT_LEVEL`)
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
