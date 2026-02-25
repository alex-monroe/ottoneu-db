# Market-Based Season Projection System — Implementation Plan

## Context

The existing simple projection system (`scripts/projection_methods.py` + `scripts/update_projections.py`) uses recency-weighted historical PPG as its only signal. It cannot account for team context changes, opponent adjustments, depth chart shifts, or market expectations. This plan introduces a separate, parallel projection system with two main advances:

1. **Betting market-derived team totals** — Vegas-implied team scores (from spread + O/U) as the primary team offense signal
2. **ML-based player share model** — A trained gradient boosting model that predicts each player's share of team yards/points using features including draft pick, age, years in the league, and historical usage. This model handles rookies natively (via draft/age features) and learns aging curves from historical data.

**The new system must not modify any existing files.** It lives entirely in `scripts/projections/`, writes to new DB tables, and stores results in a separate `market_player_projections` table.

---

## Feedback on the Approach

### What's Strong
- **Team totals as the primary signal is correct.** Vegas implied scores embed opponent strength, injury news, travel, weather, and scheme in a single number that no statistical model can replicate.
- **Top-down structure (team → player share) mirrors professional systems.** It naturally handles "same player, weaker team" and "new starter on pass-heavy offense."
- **ML share model is the right next step.** Simple weighted average shares can't project rookies or model age-related decline. A trained model with draft position, age, and tenure as features handles all three of these cases in a principled way.
- **Fresh separation from the existing system is correct.** The `player_projections` table has a `UNIQUE(player_id, season)` constraint that would conflict with a second method.

### Issues to Be Aware Of

1. **"Team total yards" isn't a standard betting line.** Books set spread and O/U (combined total), not team total yards as a standard prop. The right approach: derive implied team score from spread + O/U, then calibrate a regression from historical data mapping implied points → (expected passing yards, rushing yards). This is more principled than scraping prop lines.

2. **The spread sign convention is easy to get wrong.** nflverse uses negative spread for the home favorite (e.g., Bills -7 = `spread_line = -7`). The correct formula is:
   - `home_implied = (total_line - spread_line) / 2`
   - `away_implied = (total_line + spread_line) / 2`

3. **`player_stats` has no `nfl_team` column.** Team attribution requires joining through `players.nfl_team`. Mid-season trades mean traded players' stats get attributed to their end-of-season team. This is an acceptable v1 limitation — document it clearly.

4. **Future game lines aren't available far in advance.** nflverse schedules have `NaN` spread/total for distant future games. The model needs a graceful fallback (season-average implied score per team).

5. **The Odds API free tier (500 req/month) is very tight.** Start with nflverse schedule data only. The Odds API can be added later as a `source='odds_api'` enhancement to the same `betting_game_lines` table.

6. **scikit-learn is not currently installed.** It must be added to `pyproject.toml` and `requirements.txt` before the ML model issues begin.

7. **The ML model needs 3+ seasons of data to learn aging curves well.** With 2022-2024 (3 seasons), aging trends will be detectable but somewhat noisy. The system should be designed to improve as more seasons accumulate.

8. **Draft picks require a new data fetch.** `nfl_data_py` does not expose draft data. nflverse-data has a `draft_picks.parquet` file at the same GitHub releases URL pattern used by `pull_player_stats.py`. This must be fetched and matched to `players` by normalized name.

---

## Architecture

```
PHASE 1: SCHEDULE INGESTION
  nfl_data_py.import_schedules([year])
    spread_line, total_line
    → home_implied = (total_line - spread_line) / 2
    → away_implied = (total_line + spread_line) / 2
    → upsert → betting_game_lines

PHASE 2: TEAM STAT AGGREGATION
  player_stats JOIN players (via player_id → nfl_team)
    GROUP BY nfl_team, season
    SUM(passing_yards, rushing_yards, receiving_yards, targets, receptions, TDs)
    + avg_implied_score from betting_game_lines
    → upsert → team_season_stats

PHASE 3: HISTORICAL SHARE COMPUTATION
  player_stats JOIN players JOIN team_season_stats
    pass_yard_share = passing_yards / team_passing_yards  (QB)
    rush_yard_share = rushing_yards / team_rushing_yards  (QB, RB)
    target_share    = targets / team_targets              (RB, WR, TE)
    rec_yard_share  = receiving_yards / team_receiving_yards (RB, WR, TE)
    → upsert → player_historical_shares

PHASE 4: DRAFT DATA INGESTION
  nflverse-data GitHub releases → draft_picks.parquet
    → match to players by normalized name
    → upsert → player_draft_info (draft_year, round, pick, is_undrafted)

PHASE 5: ML MODEL TRAINING
  Features per player-season:
    - age (from players.birth_date)
    - years_in_league (current_season - first_season_in_player_stats)
    - draft_pick (1-262, or 999 for undrafted)
    - draft_round (1-7, or 0 for undrafted)
    - is_undrafted (bool)
    - target_share_lag1/lag2/lag3 (NaN for rookies/newer players)
    - rush_yard_share_lag1/lag2/lag3
    - games_played_lag1
  Target: actual share for that season
  Model: GradientBoostingRegressor per share type
         (separate models: target_share, rush_yard_share, pass_yard_share)
  Save: joblib.dump() → scripts/projections/models/

PHASE 6: PROJECTION ENGINE
  1. Fit OLS: avg_implied_score → (team_passing_yards, team_rushing_yards)
  2. Build feature vector for each current-season player
  3. Load ML model → predict shares (model handles rookies and aging natively)
  4. Fallback: weighted historical average if model file not found
  5. projected_player_stats = team_yards × predicted_shares
  6. TDs from historical TD rates
  7. projected_ppg = stat_line × Half PPR scoring weights
  → upsert → market_player_projections
```

---

## New Database Tables (migration: `migrations/011_market_projections.sql`)

| Table | Key Columns | Unique Constraint |
|-------|-------------|-------------------|
| `betting_game_lines` | season, week, home_team, away_team, spread_line, total_line, home_implied_score, away_implied_score, source | (season, week, home_team, away_team) |
| `team_season_stats` | season, nfl_team, games, team_passing_yards, team_rushing_yards, team_targets, avg_implied_score | (season, nfl_team) |
| `player_historical_shares` | player_id, season, nfl_team, position, pass_yard_share, rush_yard_share, target_share, rec_yard_share, reception_share | (player_id, season) |
| `market_player_projections` | player_id, season, nfl_team, position, projected_ppg, projected_passing_yards, projected_rushing_yards, projected_receiving_yards, projected_targets, implied_team_score, projection_source | (player_id, season) |
| `player_draft_info` | player_id, draft_year, draft_round, draft_pick, is_undrafted | (player_id) |

---

## New Files

```
migrations/
  011_market_projections.sql          # All 5 new tables

scripts/projections/
  __init__.py
  config.py                           # constants (imports from scripts/config.py)
  fetch_schedules.py                  # nflverse schedule ingestion → betting_game_lines
  fetch_draft_picks.py                # nflverse draft_picks.parquet → player_draft_info
  compute_team_stats.py               # aggregate player_stats → team_season_stats
  compute_shares.py                   # player shares → player_historical_shares
  feature_engineering.py             # build ML feature vectors (age, tenure, draft, lagged shares)
  train_share_model.py               # train GBM models per share type, save with joblib
  projection_engine.py                # calibration + ML share prediction + PPG calc
  run.py                              # CLI: orchestrates full pipeline
  backtest.py                         # validation: projected vs actual PPG by season
  models/                             # gitignored — saved joblib model files
    .gitkeep

scripts/tests/projections/
  __init__.py
  conftest.py
  test_fetch_schedules.py
  test_fetch_draft_picks.py
  test_compute_team_stats.py
  test_compute_shares.py
  test_feature_engineering.py
  test_train_share_model.py
  test_projection_engine.py
  test_integration.py

web/lib/
  market-projections.ts               # TypeScript query helpers (new file)

web/app/market-projections/
  page.tsx                            # server component
  loading.tsx                         # skeleton state

web/components/
  MarketProjectionsClient.tsx         # client wrapper
```

**Existing files to modify:**
- `pyproject.toml` — add `scikit-learn>=1.3.0` to dependencies
- `requirements.txt` — add `scikit-learn>=1.3.0`
- `web/components/Navigation.tsx` — add link to `/market-projections`
- `.gitignore` — add `scripts/projections/models/*.joblib`

---

## Implementation Tasks (GitHub Issues)

Issues are organized into 8 phases. Each is independently verifiable and completable in a single coding session. Dependencies are noted explicitly.

---

### Phase 1 — Foundation

**Issue 1: `[DB]` Create 5 market projection tables (migration)**
- **Label:** `epic:db`, `phase:1`
- **Depends on:** nothing
- **What:** Create `migrations/011_market_projections.sql` with all 5 tables: `betting_game_lines`, `team_season_stats`, `player_historical_shares`, `market_player_projections`, `player_draft_info`. Use `CREATE TABLE IF NOT EXISTS` for idempotency. Add indexes. Follow the style of `migrations/002_add_scraper_jobs.sql`.

**Issue 2: `[SCAFFOLD]` Create `scripts/projections/` package with config**
- **Label:** `epic:scaffold`, `phase:1`
- **Depends on:** Issue 1
- **What:** Create `scripts/projections/__init__.py` and `scripts/projections/config.py`. Config imports from `scripts/config.py`. Constants: `PROJECTION_SEASON`, `SHARE_SEASONS`, `SHARE_RECENCY_WEIGHTS = [0.50, 0.30, 0.20]`, `MIN_GAMES_FOR_SHARE = 4`, `SCORING` dict, table name constants, `MODEL_DIR`, `DRAFT_PICK_MISSING_VALUE = 999`.

**Issue 3: `[DEPS]` Add scikit-learn to project dependencies**
- **Label:** `epic:deps`, `phase:1`
- **Depends on:** nothing
- **What:** Add `scikit-learn>=1.3.0` to `pyproject.toml` and `requirements.txt`.

### Phase 2 — Schedule Ingestion

**Issue 4: `[DATA]` `fetch_schedules.py` — ingest nflverse schedules with betting lines**
**Issue 5: `[TEST]` Tests for `fetch_schedules.py`**

### Phase 3 — Team Stat Aggregation

**Issue 6: `[DATA]` `compute_team_stats.py` — aggregate player_stats to team level**
**Issue 7: `[TEST]` Tests for `compute_team_stats.py`**

### Phase 4 — Historical Share Computation

**Issue 8: `[MODEL]` `compute_shares.py` — calculate player usage shares**
**Issue 9: `[TEST]` Tests for `compute_shares.py`**

### Phase 5 — Draft Data Ingestion

**Issue 10: `[DATA]` `fetch_draft_picks.py` — ingest nflverse draft picks data**
**Issue 11: `[TEST]` Tests for `fetch_draft_picks.py`**

### Phase 6 — ML Share Model

**Issue 12: `[MODEL]` `feature_engineering.py` — build ML feature vectors**
**Issue 13: `[TEST]` Tests for `feature_engineering.py`**
**Issue 14: `[MODEL]` `train_share_model.py` — train GBM models per share type**
**Issue 15: `[TEST]` Tests for `train_share_model.py`**

### Phase 7 — Projection Engine + CLI

**Issue 16: `[MODEL]` `projection_engine.py` — points-to-yards calibration**
**Issue 17: `[MODEL]` `projection_engine.py` — ML share prediction + PPG calc**
**Issue 18: `[TEST]` Tests for `projection_engine.py`**
**Issue 19: `[CLI]` `run.py` — orchestrate full market projection pipeline**

### Phase 8 — Validation + Frontend

**Issue 20: `[VALIDATION]` `backtest.py` — compare market projections to actuals**
**Issue 21: `[TEST]` Integration smoke test — full pipeline with mock data**
**Issue 22: `[FRONTEND]` TypeScript query helpers for `market_player_projections`**
**Issue 23: `[FRONTEND]` `/market-projections` page**

---

## Dependency Graph

```
#1 (migration)
#2 (scaffold)           ← depends on #1
#3 (add scikit-learn)   ← depends on nothing (can run in parallel with #1, #2)

#4 (fetch_schedules)    ← depends on #1, #2
#5 (test schedules)     ← depends on #4

#6 (team stats)         ← depends on #1, #2
#7 (test team stats)    ← depends on #6

#8 (compute shares)     ← depends on #6, #7
#9 (test shares)        ← depends on #8

#10 (fetch draft picks) ← depends on #1, #2
#11 (test draft picks)  ← depends on #10

#12 (feature eng.)      ← depends on #8, #10
#13 (test feature eng.) ← depends on #12

#14 (train models)      ← depends on #3, #12, #13
#15 (test models)       ← depends on #14

#16 (regression engine) ← depends on #6, #8
#17 (ML projection)     ← depends on #14, #16
#18 (test engine)       ← depends on #16, #17

#19 (run.py CLI)        ← depends on #4, #6, #8, #10, #14, #16, #17

#20 (backtest)          ← depends on #19
#21 (integration tests) ← depends on #19, #20

#22 (TS helpers)        ← depends on #19
#23 (frontend page)     ← depends on #22
```

**MVP cutoff: Issues #1–#21.** Issues #22–#23 are a separate milestone once the backend is validated.

**Milestones:**
- `v1-foundation` (issues #1–#3): DB tables, scaffold, dependencies
- `v2-data-pipeline` (issues #4–#11): all data ingestion complete, shares computed, draft data in DB
- `v3-ml-model` (issues #12–#18): ML model trained and evaluated
- `v4-projections` (issues #19–#21): end-to-end projections generated and backtested
- `v5-frontend` (issues #22–#23): visible in web app

---

## Key Files for Reference

| File | Why It Matters |
|------|----------------|
| `scripts/projection_methods.py` | `WeightedAveragePPG` recency weighting (0.50/0.30/0.20) — use as fallback in `predict_shares` when ML model not found |
| `scripts/tasks/pull_player_stats.py` | DB upsert pattern (batch 200 rows, `on_conflict`, `_safe_int()` NaN handling) and nflverse-data parquet fetch pattern |
| `scripts/name_utils.py` | `normalize_name()` — reuse in `fetch_draft_picks.py` for player name matching |
| `scripts/tests/test_projection_methods.py` | Test structure: `pytest.approx`, pure functions, no DB calls |
| `migrations/002_add_scraper_jobs.sql` | Migration style: `CREATE TABLE IF NOT EXISTS`, indexes at end |
| `scripts/config.py` | `NFL_TEAM_CODES`, `HISTORICAL_SEASONS`, `get_supabase_client()` |
| `web/app/vorp/page.tsx` | Server component + client wrapper pattern to mirror |

---

## Verification Strategy

1. **After Issue 1:** Open Supabase dashboard → verify 5 new tables exist
2. **After Issue 4:** Query `betting_game_lines` for season 2023 → ~272 rows, implied scores between 15–35
3. **After Issue 6:** Query `team_season_stats` for 2023 → 32 rows, spot-check KC passing yards ≈ 4000–4500
4. **After Issue 8:** Query `player_historical_shares` for Josh Allen 2023 → `pass_yard_share` ≈ 0.97–1.0
5. **After Issue 10:** Query `player_draft_info` for known picks → spot-check CJ Stroud = round 1, pick 2
6. **After Issue 14:** Check `scripts/projections/models/` → 3 `.joblib` files created; review logged MAE from cross-validation
7. **After Issue 19:** `python scripts/projections/run.py --dry-run --verbose` → Josh Allen projected PPG should be in the 25–35 range
8. **After Issue 20:** `python scripts/projections/backtest.py --test-season 2024` → MAE < 5.0 PPG for QBs is a reasonable baseline target
9. **Run tests at each phase:** `pytest scripts/tests/projections/ -v`
