# Code Organization

## Key File Locations

| Area | Path | Purpose |
|------|------|---------|
| Python config | `scripts/config.py` | All league constants, Supabase client factory |
| TS config | `web/lib/config.ts` | Frontend constants (**must stay in sync with `scripts/config.py`**) |
| TS types | `web/lib/types.ts` | All shared TypeScript interfaces |
| Analysis math | `web/lib/analysis.ts` | TS port of `scripts/analysis_utils.py` |
| Arb logic | `web/lib/arb-logic.ts` | Arbitration simulation logic |
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

## Path Setup for New Python Scripts

Scripts under `scripts/feature_projections/` need two paths on `sys.path` to resolve all imports:

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

Both are required. Only adding `script_dir` causes `ModuleNotFoundError: No module named 'scripts'`. See `cli.py` for the canonical example.
