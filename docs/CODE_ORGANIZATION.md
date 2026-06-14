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
| Data files | `data/` | Manual config data (QB starters, etc.) |
| CI/CD | `.github/workflows/` | GitHub Actions (tests, scraping, projections) |

## Python Configuration (`scripts/config.py`)

All configuration constants live here:
- League settings (`LEAGUE_ID`, `MY_TEAM`, `HISTORICAL_SEASONS`). The current/active season is **not** a static config value — it is resolved at runtime from `league_calendar` via `scripts/season.py` (`league_season`, `projection_season`, `stats_season`, `arbitration_season`) and `web/lib/season.ts`.
- Fantasy rules (`NUM_TEAMS`, `CAP_PER_TEAM`, `POSITIONS`)
- Analysis thresholds (`MIN_GAMES`, `REPLACEMENT_LEVEL`)
- Arbitration constants
- Shared Supabase client via `get_supabase_client()`

All scripts import from `scripts/config.py` to eliminate duplication and ensure consistency.

## Shared Configuration (`config.json`)

`config.json` at the repo root is the single source of truth for every constant shared between Python and TypeScript. Both `scripts/config.py` and `web/lib/config.ts` read from it — never hand-copy a value.

When adding a new shared key, update three places:
1. `config.json` — add the key/value
2. `scripts/config.py` — add `CONSTANT = _config["KEY"]`
3. `web/lib/config.ts` — add `export const CONSTANT = config.KEY`

Drift is caught mechanically by architecture tests:
- `scripts/tests/test_architecture.py::TestConfigSync` — asserts every `config.json` key is consumed in both `config.py` and `config.ts`, and that neither references a nonexistent key.
- `web/__tests__/lib/architecture.test.ts::Config JSON Sync` — asserts the TypeScript module's *exported values* match `config.json` (not just key presence).

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
