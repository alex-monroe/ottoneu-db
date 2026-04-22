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
| Arb progress helpers | `web/lib/arb-progress.ts` | Pure transformations for `/arb-progress` (allocations, raises, spending) |
| API input validation | `web/lib/validate.ts` | `parseJson(req, schema)` helper returning typed result or 400 response |
| Request schemas | `web/lib/schemas/` | Zod schemas for API route inputs (user, arbitration-plan, surplus-adjustment) |
| DB schema | `schema.sql` | Canonical schema definition |
| Migrations | `migrations/` | Numbered SQL migration files |
| Components | `web/components/` | Reusable React components |
| Pages | `web/app/` | Next.js App Router pages |
| Feature projections | `scripts/feature_projections/` | Feature-based projection system (features, combiner, runner, backtest, CLI) |
| Data files | `data/` | Manual config data (QB starters, etc.) |
| CI/CD | `.github/workflows/` | GitHub Actions (tests, scraping, projections) |

## Python Configuration (`scripts/config.py`)

All configuration constants live here:
- League settings (`LEAGUE_ID`, `SEASON`, `MY_TEAM`)
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

## Path Setup for New Python Scripts

Scripts under `scripts/feature_projections/` need two paths on sys.path to resolve all imports:

```python
import os
import sys

# Setup paths so imports work when run directly
script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # → scripts/
repo_root = os.path.dirname(script_dir)                                    # → project root
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)
```

- **`script_dir`** (`scripts/`) — resolves `from config import ...` and `from analysis_utils import ...`
- **`repo_root`** (project root) — resolves `from scripts.feature_projections.features import ...`

Both are required. Only adding `script_dir` causes `ModuleNotFoundError: No module named 'scripts'`. See scripts/feature_projections/cli.py for the canonical example.
