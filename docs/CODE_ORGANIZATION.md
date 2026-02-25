# Code Organization

## Key File Locations

| Area | Path | Purpose |
|------|------|---------|
| Python config | `scripts/config.py` | All league constants, Supabase client factory |
| TS config | `web/lib/config.ts` | Frontend constants (**must stay in sync with `config.py`**) |
| TS types | `web/lib/types.ts` | All shared TypeScript interfaces |
| Analysis math | `web/lib/analysis.ts` | TS port of `scripts/analysis_utils.py` |
| Arb logic | `web/lib/arb-logic.ts` | Arbitration simulation logic |
| DB schema | `schema.sql` | Canonical schema definition |
| Migrations | `migrations/` | Numbered SQL migration files |
| Components | `web/components/` | Reusable React components |
| Pages | `web/app/` | Next.js App Router pages |
| CI/CD | `.github/workflows/` | GitHub Actions (tests, scraping, projections) |

## Python Configuration (`scripts/config.py`)

All configuration constants live here:
- League settings (`LEAGUE_ID`, `SEASON`, `MY_TEAM`)
- Fantasy rules (`NUM_TEAMS`, `CAP_PER_TEAM`, `POSITIONS`)
- Analysis thresholds (`MIN_GAMES`, `REPLACEMENT_LEVEL`)
- Arbitration constants
- Shared Supabase client via `get_supabase_client()`

All scripts import from `config.py` to eliminate duplication and ensure consistency.
