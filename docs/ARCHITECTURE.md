# Architecture

## System Overview

```
Python Scripts (scripts/)
        │ upsert via supabase-py
        ▼
   Supabase (PostgreSQL)
        │ queried via @supabase/supabase-js
        ▼
   Next.js App (web/)
```

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Recharts
- **Backend:** Python 3.9+, Playwright (scraping), pandas, nfl_data_py
- **Database:** Supabase (PostgreSQL)
- **Environment:** `.env` (root, for Python) and `web/.env.local` (for Next.js) hold Supabase credentials

## Data Pipeline

Uses a worker-based job queue. `scripts/enqueue.py` inserts jobs into the `scraper_jobs` table in Supabase. `scripts/worker.py` polls the queue, dispatches tasks, and manages a shared Playwright browser.

Three task types:
- `pull_nfl_stats` — sync, loads snap counts via `nfl_data_py`
- `scrape_roster` — async, scrapes one position from Ottoneu search page
- `scrape_player_card` — async, scrapes FA transaction history for real salary

Jobs support dependencies, retries (up to 3 attempts), and batch grouping. `ottoneu_scraper.py` is a backward-compatible wrapper that enqueues a batch and runs the worker. Data is upserted into three tables: `players`, `player_stats`, `league_prices`.

### NFL Stats (separate from Ottoneu data)

`nfl_stats` stores pure NFL statistical data from nflverse-data (2010–present), kept separate from the Ottoneu fantasy data in `player_stats`. Backfilled via `scripts/backfill_nfl_stats.py` or the `Backfill NFL Stats` GitHub Action.

- **`player_stats`** = Ottoneu fantasy data (total_points, ppg, pps, snaps from scraping)
- **`nfl_stats`** = Real NFL stats (passing_yards, rushing_tds, snap counts, etc. from nflverse)

### Worker Task Modules (`scripts/tasks/`)

Each task type lives in its own module. `__init__.py` defines task type constants and `TaskResult` dataclass. The worker caches NFL stats in memory so roster scrapes can match snap counts by player name.

## Analysis Pipeline

`scripts/run_all_analyses.py` orchestrates analysis in dependency order:

```
feature projection system
        │ promote.py → player_projections table
        ▼
update projections → projected salary → VORP → surplus value → arbitration → arbitration simulation → projected arbitration
```

The feature projection system (see below) generates per-player PPG projections and stores them in `model_projections`. `promote.py` copies the active model's projections into `player_projections`, which is what the analysis pipeline reads.

Shared config and DB helpers in `scripts/analysis_utils.py`. The Python analysis scripts (`analyze_*.py`) are **deprecated** — they generate markdown reports but duplicate calculations that now live canonically in the TypeScript web UI (`web/lib/vorp.ts`, `web/lib/surplus.ts`, `web/lib/arbitration.ts`, `web/lib/simulation.ts`). The Python scraper and projection pipelines remain active.

### Web Data Access Layer

All web data fetching goes through `web/lib/data.ts` — the single source of truth for assembling player data from Supabase. Key principles:

- **Salary source of truth:** `league_prices` table for current views. Historical salary uses transaction replay (`roster-reconstruction.ts`).
- **Type hierarchy:** `CorePlayer → RosteredPlayer → StatsPlayer → Player` — each layer adds data from a different source (players table → league_prices → player_stats).
- **Calculations are TypeScript-only:** VORP, surplus, arbitration, and projected salary are computed in `web/lib/` and are the canonical implementations.
- **Scoring formula:** `web/lib/scoring.ts` provides `calculateFantasyPoints()` — the Ottoneu Half PPR formula as a pure function of raw NFL stats.
- **API input validation:** Route handlers under `web/app/api/` validate JSON bodies via `parseJson(req, schema)` from `web/lib/validate.ts`, with per-resource Zod schemas in `web/lib/schemas/`. On failure the helper returns a 400 with Zod's `issues` array; on success it returns the typed, parsed data.

### Key Metrics

- **PPG** (Points Per Game) = total_points / games_played
- **PPS** (Points Per Snap) = total_points / snaps
- **VORP** (Value Over Replacement) = ppg - replacement_ppg at position
- **Surplus Value** = dollar_value (from VORP) - salary
- Chart shows salary (Y-axis) vs. selected metric (X-axis), bubble size = total points

## Authentication & Authorization

User accounts with email/password login stored in the `users` table. Passwords are hashed with bcrypt (`bcryptjs`). Sessions use HMAC-SHA256 signed tokens stored in HTTP-only cookies (7-day expiry). The session payload encodes `userId`, `isAdmin`, and `hasProjectionsAccess` — no DB lookup needed for authorization.

- **`SESSION_SECRET`** env var provides the HMAC signing key
- **Middleware** (`web/middleware.ts`) enforces route protection:
  - Protected routes (projections, VORP, surplus, arbitration) require `hasProjectionsAccess`
  - Admin routes (`/admin`) require `isAdmin`
- **User-scoped data:** `surplus_adjustments` and `arbitration_plans` are scoped to `user_id` — each user sees only their own data
- **Admin panel** (`/admin`) allows admins to create users, toggle projections access, and delete users

## Feature Projection System (`scripts/feature_projections/`)

Generates season-long player PPG projections from historical data using a combination of targeted features. The active production model (`v14_qb_starter`) uses:
1. `weighted_ppg_no_qb_trajectory` baseline (recency-weighted PPG, without snap trajectory for QB/K)
2. `age_curve` adjustment (career arc expectations)
3. `regression_to_mean` (pulling extreme outliers toward positional averages)
4. `qb_backup_penalty` (15% PPG penalty for non-starter QBs to deflate small-sample heroics)

Model history: v1–v7 proved that cumulatively stacking features (stat efficiency, usage share) introduced noise. v8–v12 refined the core three features. v13 tested QB volume trends (no improvement). v14 added the backup penalty using manual starter designations — the key insight was that the starter data's value is in *penalizing backups*, not *boosting starters*.

### Projection Pipeline

```
model_config.py  →  runner.py  →  model_projections table  →  promote.py  →  player_projections table
    (defines)        (computes)       (stores)                   (copies)        (production, used by web)
```

- `model_config.py` — model registry (name, version, features, weights, is_baseline)
- `qb_starters.py` — loads manual QB starter designations from `data/qb_starters.json`, resolves names to player IDs
- `runner.py` — fetches historical player_stats + nfl_stats, loads QB starters, runs combiner, batch upserts
- `combiner.py` — base feature PPG + weighted sum of adjustment feature deltas
- `backtest.py` — compares projected_ppg to actual actuals (MAE, RMSE per model)
- `accuracy_report.py` — side-by-side model comparison table across all seasons (no `--models` filter; always runs all models)
- `promote.py` — copies a model's projections to the production `player_projections` table and sets it as active
- `sweep_recency_weights.py` — in-memory weight sweep for base feature tuning (no DB writes)

### Feature Architecture

Features are registered in `features/__init__.py` via `FEATURE_REGISTRY` (maps string name → class). They are instantiated with no constructor arguments (`FEATURE_REGISTRY[name]()`), so parameterization must happen via class constants or subclasses.

**Two feature types:**
- **Base feature** (`is_base=True`) — returns absolute PPG estimate. Exactly one per model, computed first. Example: `weighted_ppg`.
- **Adjustment feature** (`is_base=False`, default) — returns a PPG delta. Receives `base_ppg` in context. Summed after the base. Examples: `age_curve`, `qb_backup_penalty`.

**To add a new feature:**
1. Create a class in `features/` extending `ProjectionFeature`
2. Register it in `features/__init__.py` FEATURE_REGISTRY
3. Add a model config in `model_config.py` that includes it
4. Run + backtest via `cli.py run` and `accuracy_report.py --run-backtest`
5. If it wins, promote via `cli.py promote --model <name>` or `promote.py <name>`

### Promoting a Model to Production

The web frontend reads from `player_projections`, NOT `model_projections`. After validating a new model via backtesting, promote it:

```bash
venv/bin/python scripts/feature_projections/promote.py v14_qb_starter
```

This copies all projections to `player_projections`, clears `is_active` from all other models, and sets the promoted model as active. **This is a production data change** — the web app will immediately reflect the new projections.

**Important dependency:** All internal models (v1–v6) share the `weighted_ppg` base feature. Changing `WeightedPPGFeature.RECENCY_WEIGHTS` requires regenerating projections for **every** internal model via `cli.py run`, not just re-running backtests. The `--run-backtest` flag on `accuracy_report.py` only re-backtests existing projections — it does not regenerate them.

**Note on experimental models:** Models registered via `cli.py run` persist in the `projection_models` and `model_projections` DB tables even after removing them from `model_config.py`. There is no cleanup script — stale experimental models remain in the DB but are excluded from `accuracy_report.py` output (which iterates `model_config.MODELS`).

### External Projection Sources (`external_sources/`)

A separate ingestion pipeline that pulls third-party consensus projections and stores them as named models in `model_projections`, making them directly comparable to internal models via the existing backtest and accuracy_report infrastructure.

```
external_sources/
├── __init__.py
├── fantasypros_fetcher.py  — scrape FP projections by position + year (requests + pd.read_html)
├── scoring.py              — convert stat totals to Ottoneu Half-PPR PPG
├── player_matcher.py       — fuzzy name+team matching to players table
└── ingest_external.py      — register model + upsert to model_projections (standalone script)
```

**Running FantasyPros ingestion:**
```
python scripts/feature_projections/external_sources/ingest_external.py \
    --source fantasypros --seasons 2022,2023,2024,2025,2026
```

Model name: `external_fantasypros_v1`. No DB schema changes required — uses existing `model_projections` table with `feature_values` jsonb for raw stat storage.

**Adding a new external model — checklist:**
1. **Verify column names before writing parsers.** FP HTML uses multi-level headers; always test-fetch one position and print `df.columns` before finalizing column mappings. The actual flattened names (e.g. `passing_yds`, `receiving_rec`) differ from the raw header labels (`YDS`, `REC`).
2. **Deduplicate by `player_id` before upserting.** Fuzzy name matching can map two different source rows to the same `player_id`. Postgres's `ON CONFLICT DO UPDATE` rejects duplicate keys within the same batch — deduplicate first.
3. **Register in `model_config.py`.** `accuracy_report.py` iterates `MODELS` in `model_config.py` to build comparison tables. External models must be added there (with `features=["external"]`) to appear in the report.
4. **Ensure `lxml` is installed.** `pandas.read_html` requires `lxml` as its HTML parser. It is in `requirements.txt` but must be explicitly installed (`pip install lxml`) if the venv was created before it was added.
