# Internal audit for a stat-level projection redesign (ottoneu_db)

Date: 2026-11-05. Read-only audit. DB checks via `just py` (paginated `fetch_all_rows`), no writes, no `fp_*` tables. Check scripts are in `.cache/stat-proj-research/_cov.py` and `_cov2.py`.

---
## 1. Data inventory for stat projection

### 1.1 Table-by-table (row counts and per-season coverage measured 2026-11-05)

| Table | Grain | What it holds | Seasons / counts | Notes |
|---|---|---|---|---|
| `nfl_stats` (migrations/011, 017, 018, 022) | player-season (regular season) | `games_played`; pass `passing_attempts, completions, passing_yards, passing_tds, interceptions`; rush `rushing_attempts, rushing_yards, rushing_tds`; rec `targets, receptions, receiving_yards, receiving_tds`; K `fg_made_0_39, fg_made_40_49, fg_made_50_plus, pat_made`; snaps `offense_snaps, defense_snaps, st_snaps, total_snaps`; `target_share, air_yards_share, wopr, racr, receiving_air_yards`; `recent_team`; `total_points, ppg` | 2010-2025, 11,923 rows (~650-870/season). **No 2026 rows yet** (in-season). Count of games>=4 qualifiers per season: QB ~56-68, RB 122-187, WR 203-276, TE 104-124, K ~40. | This is the stat-level history. All stat columns are fully populated for every row (2010+). Advanced receiving is ~85-90% populated (null for non-receivers/older). |
| `player_stats` | player-season (Ottoneu fantasy) | `games_played, snaps, ppg, pps, total_points, h1/h2_snaps, h1/h2_games`. Raw NFL columns were dropped in migration 021. | 2018-2025 + 2026 partial (618). 2025 has 1,358 rows (includes non-NFL / zero-game rows). | This is the **evaluation target** (`ppg`, `games_played`). Its `total_points` equals `nfl_stats.total_points` exactly on all 5,859 overlapping rows (diff 0.0 every season, every position), so nfl_stats points already include the fumble/2pt/miss extras. |
| `red_zone_usage` (032) | player-season | `rz_carries, rz_targets, rz_pass_attempts, gz_carries, gz_targets` (RZ = yardline_100<=20, GZ <=10) from nflverse PBP | 2018-2025, 3,824 rows (~460-500/season) | Only PBP-derived asset in the DB. Server-only (no anon RLS). |
| `ngs_passing` (033) | QB-season | cpoe, air-yards-to-sticks, aggressiveness, time-to-throw, intended/completed air yards, expected comp%, passer rating | 2018-2025, 327 rows (~40/yr) | Tied (no gain) when used as feature. |
| `depth_charts` (028) | player-season, opening-day tier | `depth_team` 1/2/3, team, position, week | 2016-2025 (~440-530/yr), 2026 = 974 | 2026 snapshot taken in June (training camp), 3-4x more depth-3 rows than history. Missing depth coded 0 = backup (bug, see 3.4). |
| `draft_capital` (023) | player | `round, overall_pick, season_drafted` | 1,246 players | Used for rookies and as a feature. |
| `player_contracts` (036) | player-signing | `year_signed, years, value, apy, guaranteed, apy_cap_pct` (OverTheCap) | 5,122 rows | Spike #651 source #3. No evidence in the experiment log that it has been backtested (coaching was source #1 and tied). |
| `team_coaching` (031) | team-season | `head_coach, head_coach_changed, coach_tenure_years` | 2016-2026 x 32 | Tied as a feature (v41). |
| `team_vegas_lines` (024) | team-season | `implied_total` (per-game aggregate), `win_total` | 2016-2026 x 32 | Season-level only; no per-game spread/total history in DB. |
| `weekly_projections` (035) | player-week (Sleeper) | `projected_points`, `projected_stats` (jsonb stat line), `actual_stats` | **2026 only**, 3,300 rows | In-season source; not history. `weekly_projections/scoring.py` already scores a stat line with `FULL_SCORING`. |
| `model_projections` (016) | model x player x season | `projected_ppg`, `feature_values` jsonb, `projected_games` (added #613) | 146k rows, 2021-2026; 49 models in `projection_models` | Only PPG is stored. |
| `players` | | `position`, `birth_date` | | `birth_date` coverage on players-with-stats is 1% (2010) -> 18% (2021) -> 41% (2025): survivorship, only currently-active players have it. Any age feature built on it is biased. |

### 1.2 Known coverage gaps and traps

* **player_stats 2021-2023 under-coverage (#599).** Was 29-40% of the nflverse qualifying population; backfilled 2026-06-10 to 82-84%. This had inflated the level (PPG 8-10 vs true ~6.0) and caused the false "learned models over-project" result. Memory: `coverage-backfill-reverses-579.md`. The held-out cache (`.cache/holdout`) is keyed on model definition, **not data**, so `rm -rf .cache/holdout` after any backfill (`holdout_cache.py:1-35`).
* `docs/generated/coverage-analysis.md` (generated 2026-06-10) shows player_stats coverage of the nflverse games>=4 population at 80-86% for 2018-2025 (2025: 81%, 152 missing). For a stat model, **use `nfl_stats` as the source of truth** (complete 2010-2025, the remaining Ottoneu-side gap is just players who are not Ottoneu-rostered/known). `player_stats` is only needed for the Ottoneu-scored eval target.
* **NULL `recent_team` (#814, merged 2026-11-04).** Was null for ~50-65% of 2019-2022 rows and 100% pre-2019, so team usage denominators were far too small (TB 2020 = 2 rush att; `usage_share_raw` up to 78). Backfilled (9,492 rows). Current check: only 1-2 nulls per season 2021-2025. v44 JSON was refit in #814 but needs `just project` after merge. `recent_team` is the team with most games for a traded player, so it is a season-level label, not a stint-level one.
* **Duplicate player rows** (college -> NFL `ottoneu_id` change): one human can be two `players` rows with the same nfl_stats line; `_compute_team_aggregates` dedupes by normalized name (`runner.py:630-660`). Memory: `duplicate_player_college_nfl_transition.md`.
* **Supabase 1000-row cap**: `nfl_stats` (11.9k), `depth_charts`, `model_projections`, `player_stats`, `red_zone_usage` all need `fetch_all_rows` with a stable `order_by="id"` (default). Arch tests enforce for 4 large tables only (`test_architecture.py`).
* `nfl_stats` is **regular season only** and has no columns for: sacks taken, passing air yards / yards after catch, fumbles lost, 2-pt conversions, FG attempts/misses (needed for the −1 missed FG/PAT), carries inside the 5, rushing TD splits, routes run, team pass/run plays. `scripts/scoring.py` adds these extras from nflverse at ingest (`add_nflverse_extras`, `score_stats`) but `backfill_nfl_stats.py:51-59` says explicitly "nfl_stats has no columns for them... dropped before upsert". So **points in nfl_stats include the extras but the extras themselves are not stored**; a stat model that scores via `FULL_SCORING` from stored columns cannot reproduce `total_points` exactly. Quantify: extras are small but non-zero (fumbles lost -2, 2pt +1/+2, K misses -1); a K model needs FG attempts/misses and distance-tier makes (tiers exist: 0-39/40-49/50+; no tier attempts).

### 1.3 What is missing that a stat model would want

1. **Game/week-level history.** Both `player_stats` and `nfl_stats` are season-grain. No `nfl_weekly_stats` table exists. Feasibility was verified in spike #667 L2: `nfl_data_py.import_weekly_data([2023])` returns 5,653 rows with all volume/efficiency columns (`docs/exec-plans/structural-projection-levers-667.md` ~L204-215), and `scripts/keeper_value/nflverse.py` already reads nflverse weekly data live (not persisted). Needed for: games-played vs injury timing, within-season role changes, QB-start counts, per-game variance.
2. **Team pass/run play totals and pace** (PBP aggregates). The only PBP asset is `red_zone_usage`. Team pass attempts / rush attempts / plays per game are currently approximated by summing individual player rows (`runner.py:_compute_team_aggregates`, only `targets` and `rushing_attempts` per team-season) which is exactly what broke in #814 and misses players not in the DB.
3. **Routes run / route participation, TPRR, YPRR, air yards per attempt, aDOT, YAC, snap-share by formation.** Only `offense_snaps` and (QB) NGS exist. nflverse has `snap_counts`; routes need PFF/FTN (paid) or derived charting (nflverse FTN charting available 2022+).
4. **Per-season injury/availability detail** (games missed by week, designation). Only `games_played`; `expected_games.py` works from games-played history.
5. **Rookie / college data**: only `draft_capital` (pick). No combine/athletic or college production.
6. **Pre-2018 position/Ottoneu data** is irrelevant to the eval but nfl_stats goes back to 2010, giving 8 extra seasons for stat-level shrinkage priors (the current learned models train only on 2021+ because of features available).
7. **Team-level offensive context per game**: spreads, game totals (only season-level `implied_total` in the DB).
8. **Kicker inputs**: FG attempts by distance, team red-zone stall rate, dome/outdoors.

---
## 2. Current system architecture and how a stat-level model plugs in

### 2.1 Pipeline today

* **Registry** `scripts/feature_projections/model_config.py` (1,327 lines): `ModelDefinition(name, status, features[], combiner_type in {additive, learned, residual}, interaction_terms, base_model_name, training_filter, sample_weight_spec, regressor_spec, position_overrides)`. `get_model` at `:1322`. Active: `v44_eb_pooling_perpos` (`model_config.py:731`), `projection_models.is_active = True` verified in DB. Features (13): `weighted_ppg_tuned_no_qb` (base), `age_curve`, `partial_pooling_eb`, `qb_backup_penalty`, `usage_share_raw`, `target_share_raw`, `air_yards_share_raw`, `wopr_raw`, `racr_raw`, `draft_capital_raw`, `implied_team_total_raw`, `depth_chart_position_raw`, `role_change_raw`; Ridge with 9 interaction terms.
* **Feature contract** `features/base.py:8-47`: `compute(player_id, position, history_df, nfl_stats_df, context) -> float|None`, "PPG-scale" (base = absolute PPG, adjustment = PPG delta). Everything downstream assumes a **scalar PPG per player**. 24 feature modules in `features/`.
* **Context** `runner.py:_build_context` (`:500`) builds shared lookups: draft capital, vegas, depth charts, red zone, NGS, coaching, team aggregates, positional means, EB pooling k (`_compute_pooling_k :137`), starter floor (`:194`), QB ecosystem.
* **Learned combiner** `learned_combiner.py`: `build_feature_vector :28`, `predict :161`, `predict_residual :255`, params as JSON in `scripts/feature_projections/trained_models/`. Training in `train_model.py`: `collect_training_data :82` builds one row per (player, target season) with `feature_values` and `actual_ppg` (filter `games >= MIN_GAMES(4) and ppg > 0`, `:177`), `train_ridge_loso :327`, `train_ridge_residual :483`.
* **Runner** `run_model :712` writes `model_projections(projected_ppg, feature_values, projected_games)`; `promote.py` copies the active model to `player_projections` (consumed by web VORP/surplus/arbitration). Rookies bypass the model: `update_projections.py` uses `RookieDraftCapitalPPG` (draft_capital fit) / `CollegeProspectPPG` (`projection_methods.py`), and `rookie_backtest.py` evaluates that separately (draft_capital MAE 2.72 ALL, QB 3.32, RB 3.00, WR 2.71, TE 1.91).
* **Availability** is separate: `expected_games.py:100 build_expected_games` (history haircut, floor 12 games for <3 prior played seasons `YOUNG_PLAYER_GAMES_FLOOR`), stored as `projected_games`, applied only in web `calculateVorp` (`web/lib/vorp.ts`, #614/#615). The rate target and availability are already split, which matches the "games played" output the new model wants.

### 2.2 Held-out harness (what a stat model must pass through)

* `holdout_eval.py`: `rolling_folds :377` (train seasons < eval season, expanding window, min-train 2021; eval 2023/2024/2025), `gather_predictions_rolling :400`, `_build_actuals_and_rookies :77` (actual = `player_stats.ppg`, requires `games >= 4` and >=1 prior-season game, i.e. **non-rookie, 4+ game** population), `_metrics_from_preds :108`, `_learned_preds_for_eval :137` (retrains Ridge/residual per fold into a temp dir; reads `td["feature_values"]`; `predict()` returns PPG), `_db_preds_for_eval :206` (additive/external models read pre-stored `model_projections`), `_restrict_to_common_players :441`, `_restrict_to_harmonized_population :471`, `run :522`. Metrics: MAE, bias, R2, RMSE per position + Spearman rho and top-N hit (`rank_metrics`, #598), balanced MAE (unweighted mean of QB/RB/WR/TE MAE; K excluded).
* `significance.py`: player-clustered paired bootstrap of MAE delta (`bootstrap_mae_difference :227`) and Spearman delta (`bootstrap_spearman_difference :157`, `--metric spearman --position P`). Gate = CI excludes 0.
* `holdout_cache.py`: caches learned-model fold predictions keyed on model-definition chain + feature-code hash; **not keyed on data** (clear after backfill). `just doctor` flags stale cache.
* `availability_backtest.py` scores `ppg x min(games,17)/17` ("avail MAE") separately from rate MAE.
* `scripts/feature_projections/external_sources/scoring.py` `stats_to_ppg` (hard-coded multipliers, omits K and extras) is the existing "stat line -> PPG" path for FantasyPros; `scripts/weekly_projections/scoring.py:score_stat_line` and `scripts/scoring.py:score_stats` use the single-source `FULL_SCORING` (config.json `SCORING_SETTINGS` + `SCORING_EXTRAS`). A new model should use `scripts/scoring.py` only.

### 2.3 Changes required for stat outputs

| Concern | Today | Needed |
|---|---|---|
| Feature API | scalar PPG per feature | new `StatProjector` contract returning a `dict[stat -> season total or per-game rate]` per player (plus games). Existing `ProjectionFeature` can stay for the legacy models; do not bend it. |
| Training target | `actual_ppg` from player_stats | per-stat actual per game (or season total with games as exposure) from `nfl_stats`, same games>=4 gate, plus games played as its own target. |
| Scoring | n/a (model outputs PPG) | `scripts.scoring.score_stats(stat_line)` -> points per game; extras (fumbles lost, 2pt, K misses) need either storage columns or expected-value constants per position. Add columns to `nfl_stats` (migration + `web/types/supabase.ts` row type + `just check-schema`) or a new `nfl_stats_extras`. |
| Storage | `model_projections.projected_ppg` (+ `projected_games`, `feature_values` jsonb) | add sibling table, e.g. `model_projection_stats(model_id, player_id, season, stats jsonb, games)`; keep `projected_ppg` populated = scored value so `promote.py`, web, and the held-out harness keep working unchanged. Mind NOT NULL on `projected_ppg` and the 1000-row cap (new table needs pagination + `LARGE_TABLES` entry). |
| Eval | PPG MAE / rho / top-N | keep PPG MAE and rho as the **gate** (what VORP/auction consume). Add per-stat MAE/bias/R2/rho and decomposition of the PPG error into volume vs efficiency vs availability; add interval calibration (see section 5). |
| Harness hook | learned models retrain via `train_ridge_*`; additive/external read DB | the cleanest integration is to register the stat model as an "additive-style" model whose per-fold held-out projections are generated by a new `fit_predict(train_seasons, eval_seasons)` and returned as PPG preds into `gather_predictions_rolling`'s `preds[model][season][pid]`. Everything after (metrics, significance, ranking, cache) is then reused. Need to extend `holdout_cache` fingerprint to include the new module. |
| Rookies | separate draft-capital path, excluded from eval | the stat model should also expose rookie stat lines (target share/carry share from pick), otherwise it only covers vets. Eval population stays non-rookie unless explicitly added to `rookie_backtest`. |
| Tests | `scripts/tests/test_feature_projections.py` one class per feature; architecture tests (no hardcoded constants, shared client, paginated reads w/ stable order, `config.json` codegen) | follow the same; scoring multipliers must come from `scripts.config`. |

---
## 3. Lessons learned

### 3.1 Active model and held-out accuracy

* Lineage: v14_qb_starter (additive, honest best pre-backfill) -> v31_depth_chart (promoted #609, sig. beat v14 after the coverage backfill: Δ −0.091, CI [−0.163,−0.020], p=0.014) -> v33_tuned_base (#618; recency weights [0.65,0.20,0.15], Δ −0.0113, p=0.038) -> **v44_eb_pooling_perpos** (promoted 2026-07-25; QB MAE −0.166 vs v33, CI [−0.324,−0.025], p=0.020; ALL MAE tie p=0.98; no position regressed).
* Pooled rolling held-out (2023-25, train 2021+), ALL MAE: v31 2.232; v33 ~2.226-2.241 (varies by log row); **v44 ALL MAE ~2.237, balanced MAE ~2.42, QB MAE 3.546, QB rho 0.697**; naive_prior_season_ppg 2.498 (balanced 2.816); position_mean_baseline 3.692; external FantasyPros 2.330 (balanced 2.410, but only 599 players and +1.05 bias). Numbers from `docs/generated/experiment-log.md` (rows at top, L24-66; v44 section L241-270) and `docs/generated/projection-holdout-eval-rolling.md:7-46`.
* **Caveat:** `projection-holdout-eval-rolling.md` is a 2026-06-10 snapshot (v31 era; holdout-eval overwrites it by default, restore via git). It does **not** contain v33/v44 rows. Regenerate (`just holdout-eval --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021 --models v44_eb_pooling_perpos,naive_prior_season_ppg,position_mean_baseline,external_fantasypros_v1,v14_qb_starter`) before quoting current per-position v44 numbers. The final window (2025 then 2026) is confirmation-only so prefer an iteration look on 2023-24 for development.
* Per-position (v31-era table, same harness; v44 differs mainly at QB):

| Pos | v31 MAE | v14 MAE | naive_prior MAE | pos-mean MAE | FantasyPros MAE | v31 rho | naive rho | FP rho |
|---|---|---|---|---|---|---|---|---|
| QB | 3.666 | 3.879 | 4.716 | 5.482 | 3.517 | 0.674 | 0.578 | 0.812 |
| RB | 2.411 | 2.407 | 2.479 | 4.384 | 2.597 | 0.787 | 0.802 | 0.833 |
| WR | 2.192 | 2.313 | 2.381 | 3.739 | 2.037 | 0.779 | 0.781 | 0.813 |
| TE | 1.530 | 1.618 | 1.689 | 2.577 | 1.488 | 0.760 | 0.738 | 0.822 |
| K | 1.435 | 1.423 | 1.685 | 1.390 | n/a | | | |

  v44 QB: MAE 3.546, rho 0.697 (vs FP 0.805-0.812). The QB ordering gap to FantasyPros is the largest remaining gap anywhere and was shown to be an *information* gap, not a same-data modeling gap (three independent same-data QB reconstructions failed). RB: **naive prior-season PPG ties the best model on ordering** (rho 0.80), i.e. little headroom from history alone. K: the position-mean baseline (1.390) beats every model; K is "essentially random" and excluded from balanced MAE; v44 has K bias ~ −1.1 PPG (bug 3.4).
* Availability: history haircut `pred x min(E[games],17)/17` turned the availability budget from +0.589 (avail MAE − rate MAE) to −0.130 (guarded −0.042) vs FantasyPros −0.124. A structural expected-games model was NEGATIVE (linear: games-MAE 3.59->3.58; GBM fragile ~4%) – a deterministic history haircut won. Games-MAE ~3.6 games is the bar for the "games played" output.
* Rookie draft-capital path: MAE ALL 2.72, QB 3.32 (n=23); depth charts do not help rookies.

### 3.2 What worked

1. **Fixing the data** (#599 backfill) was worth more than any modeling: it reversed the "learned models over-project" conclusion (bias −1.06 -> −0.03).
2. **Sample-size-aware empirical-Bayes shrinkage toward the positional mean** (v43/v44): the only significant modeling win in a 40+ experiment program; k estimated by method of moments per position per fold (`_compute_pooling_k`), k≈0.5 RB/WR/TE and 0.70 QB (hand-set k=1 over-shrank). Posterior P10/P50/P90 comes for free but is not used.
3. **Regression to the mean, depth chart (opening-day tier), advanced receiving (WR only)** were the only load-bearing features in the #588 ablation (Δ+0.075 p=0.0006; +0.066 p=0.0026; +0.072 p=0.031).
4. **Recency weighting [0.65, 0.20, 0.15], exponent 1.0**, tuned on inner folds (2022-24). Exponent 1.5 dead.
5. Two-stage **residual** vs full refit: residual is safer for weak signals, full refit wins only for strong, broad signals (Vegas; draft capital) – `projection-accuracy-improvement.md` L259-320.
6. Statistically honest tooling: rolling-origin, player-clustered paired bootstrap, ranking gate, prediction cache.

### 3.3 What failed and why (do not repeat)

| Experiment | Result | Lesson |
|---|---|---|
| In-sample leakage (v20-v31 apparent gains, audit F1) | ~0.03-0.05 MAE optimism, same size as whole "progression"; ranking inverted | never score learned models on their training seasons |
| #579 learned over-projection | data bug (coverage), not the model | check level/bias by season before blaming the model |
| L1 xFP target (TD regression via opportunity-expected TDs) v42 | tie (QB rho Δ+0.004, p=0.58) | v33 usage/target-share/WOPR features already proxy opportunity de-noising |
| #671 red-zone xFP base-swap v46 | worse (+0.030); RZ-role TD-luck flag v47 +0.018 | replacing realized TDs with expected removes real skill/role information |
| L5 QB volume x regressed efficiency v45 | worse than v44 at QB (rho 0.696->0.686) | fully shrinking YPA/TD rate/INT rate over-strips real QB skill |
| #640 QB attempts/game features v37 | tie | volume is already in PPG; ~62 QB clusters cannot resolve <0.2 MAE |
| #592 QB residual v34 | tie | |
| #642 pass-catcher "who is my QB" v38 | tie | subsumed by implied_team_total + own target share |
| #674 NGS QB process stats v48 | tie | stabilised efficiency already proxied by PPG |
| #651 coaching change v41 | tie (Δ+0.0014) | small cohort 5-10 teams/yr |
| #639 per-position base tuning v35/v36 | worse | noise tuning on tiny folds; coefficient drift |
| #643 rank-aware weighting v39 | **significant regression** (+0.026 p=0.015) | |
| #645 Huber loss v40 | tie / worse | |
| #587b structural games model | negative | history haircut is the robust choice |
| qb-usage-share (v6) | QB MAE blew up (6-8 vs 3.7-4.4) | QB1 attempt share is ~0.95 constant; share-trend design amplifies noise; backup QBs distort team totals. Do not model QB volume as a share of team; model attempts directly with team pass volume. |
| age_curve, usage_share_raw, draft_capital_raw (non-rookie), vegas, qb_backup_penalty | deadweight in #588 ablation | but see 3.4: several were broken by data bugs, so not necessarily deadweight |

Meta-lessons: (a) "every same-data feature ties at ±0.02 MAE" – MAE on realized PPG is saturated/underpowered (about 1.2k eval rows; ~62 QB clusters); the structural spike #667 argued the target bundles volume x efficiency x availability, but the two efficiency-stripping reconstructions (L1, L5) *failed*, so don't expect decomposition alone to win; the proven gain was *shrinkage scaled by sample size* plus *role/opportunity information*. (b) FantasyPros' edge is concentrated in QB/TE ordering (information). (c) Many near-zero learned coefficients were data bugs (3.4), so redo the data audit first.

### 3.4 Known bugs / biases (memory `v44-weight-audit-bugs.md`, 2026-11-04)

* **FIXED #814** NULL `recent_team` -> team usage totals too low, `usage_share_raw` up to 78; also made `implied_team_total_raw` fall back to the player's *current* team in training. Needs `just project` post-merge to refresh live projections (v44 JSON already refit).
* `usage_share_raw*base_ppg` and `wopr_raw*base_ppg` interactions are **dead (always 0)** since v20 because `base_ppg` is in context not `feature_values`.
* **Kickers**: no position dummy, so they inherit the raw `draft_capital_raw` slope (1.66/unit) and missing=0 imputations; K held-out bias ≈ −1.1 PPG. Position-mean baseline beats models at K.
* 2026 depth chart scraped June 8 (training camp), 3-4x more depth-3 rows than history; missing depth coded 0 = "backup". Train/serve skew.
* `age_curve` coverage 13%->37% WR over 2021-2025 (birth_date survivorship); coefficient shrunk to 0.12. Confirmed in this audit: birth_date coverage 18% (2021) -> 41% (2025).
* target / air-yards / wopr exactly collinear (wopr = 1.5·target_share + 0.7·air_yards_share).
* Held-out predictions in the cache are not invalidated by data changes. Supabase 1000-row cap silently truncated multi-season reads in the past and corrupted training (see `supabase-1000-row-cap-systemic.md`); stable `.order("id")` mandatory.
* `usage_share` for a traded player uses a single season-level `recent_team`.
* Population shifts: the pooled eval qualifier set is ~1,216-1,276 rows and the position mix drifts by season; hence balanced MAE.
* Feedback rule (memory `feedback-one-projection-system.md`): no chart-only or component-specific projection adjustments; fix calibration at ingest/projection production so the whole site benefits. 2026 scope memory: internal techniques only, no FantasyPros blending or market projections (`project_2026_projections_focus.md`).

### 3.5 Protocol constraints (must hold for the new model)

* Gate = `just holdout-eval --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021` + `just significance <new> <active>` (player-clustered paired bootstrap, CI must exclude 0). Never promote on a point estimate; in-sample `accuracy-report` is diagnostic only. Dual-metric nuance accepted for promotion: a significant position-level win with no regression and ALL-MAE tie (the v44 precedent).
* Ranking gate: `--metric spearman --position QB|RB|WR|TE`.
* **Final window (2025, then 2026 actuals) is confirmation-only: one look per experiment.** Iterate on 2023-24 folds. Garden-of-forking-paths: stop after a borderline result; validate on fresh ground rather than re-looking.
* Leakage rule: train only on seasons strictly before the eval season; pooling k and priors are re-estimated per fold.
* Always `just list-models --check` for the comparator; never hard-name it. `just promote` requires the model registered in `projection_models` (`just project <name>` first). `just holdout-eval` overwrites the rolling doc - restore via git for ad hoc runs. Clear `.cache/holdout` after data changes.
* Feature changes need tests in `scripts/tests/test_feature_projections.py`; `just preflight` before pushing; PR for every change; never commit to main; no writes to `fp_*`.

---
## 4. Existing per-stat assets (reusable)

| Asset | Location | What it provides for a stat model |
|---|---|---|
| Stat-level history | `nfl_stats` (section 1) | Season totals for every scored stat except extras; 2010-2025. |
| Stat-line scoring | `scripts/scoring.py` (`FULL_SCORING`, `score_stats`, `add_nflverse_extras`); `scripts/weekly_projections/scoring.py:score_stat_line`; config.json `SCORING_SETTINGS` (pass yd 0.04, pass TD 4, INT −2, rush yd 0.1, rush TD 6, rec 0.5, rec yd 0.1, rec TD 6, FG 3/4/5 by 0-39/40-49/50+, PAT 1) and `SCORING_EXTRAS` (fumble lost −2, 2pt pass 1, 2pt rush/rec 2, FG miss −1, PAT miss −1). | The "derive points via existing scoring code" step already exists and is a dot product. |
| Usage-share features | `features/usage_share.py` (+ raw variants `usage_share_raw`, `target_share_raw`, `air_yards_share_raw`, `wopr_raw`, `racr_raw` in `model_config`), `runner._compute_team_aggregates` | Player share of team targets / carries; QB excluded (attempt share ~0.95 constant; see qb-usage-share.md). Team totals now depend on `recent_team` (fixed #814). |
| Stat efficiency | `features/stat_efficiency.py` (YPA, TD rate, INT rate, YPC, catch rate, Y/T, rec TD rate vs league averages; clamped PPG deltas) | League-average rates table (`LEAGUE_AVG`) and minimum-attempt thresholds (`MIN_ATTEMPTS`) for shrinking per-stat rates. Its own v10 result was a tie. |
| xFP / TD regression | `features/xfp_redzone.py`, `weighted_xfp_*` bases, `red_zone_usage` | Per-opportunity expected-TD priors by position (league RZ->TD model, rush-TD correlation 0.92; goal-line carry ≈ 7x a 10-20 carry). Result: no PPG gain, but this is a ready-made TD-rate prior for a stat model. |
| QB volume x efficiency | `features/qb_volume.py`, `qb_volume_efficiency.py` | Attempts/game x (YPA, TD-rate, INT-rate, YPC) shrunk to population – a prototype of the target architecture at QB. It *lost* to v44; the stat-level model must beat it by modeling volume driven by team context, not by the QB's own history alone. |
| QB starters | `scripts/feature_projections/qb_starters.py`, `seed_qb_starters.py`, `features/qb_starter_usage.py`, `team_qb_quality.py` | Starter designations per season (the key input for QB attempts, and for "who is my QB" for WR/TE). |
| Expected games | `expected_games.py:100` | Games-played history haircut with young-player floor of 12; already the "games" output. Budget −0.042 vs FP −0.124. |
| EB partial pooling | `features/partial_pooling.py`, `runner._compute_pooling_k :137` | Method-of-moments `k_g = σ²_g/τ²_g` per position per fold; direct template for per-stat pooling. |
| Keeper-value distributions | `scripts/keeper_value/model.py` (quantile mixing of cell prior and per-position ridge via `w = n/(n+k)`, k chosen on an inner time split, `crps`, `prob_above`, `option_value`), `evaluate.py` (calibration, coverage, `row_scores`), `dataset.py` (as-of-week rows; **availability-inclusive** points per scheduled game), `nflverse.py` (weekly nflverse reader incl. `add_nflverse_extras`) | The only distributional/calibration code in the repo plus a weekly-data reader; reuse for stat-level predictive intervals and pinball/CRPS evaluation. Targets are dollars, not stats. |
| Weekly stat projections | `weekly_projections` table (`projected_stats` jsonb; Sleeper) and `scripts/weekly_projections/ingest.py:207` | Shows the stored-stat-line schema already in use (2026 in-season only). |
| Rookie model | `projection_methods.RookieDraftCapitalPPG`, `rookie_backtest.py` | Pick -> PPG fit; stat model needs a pick -> volume (share) analogue. |
| FantasyPros stat lines | `external_sources/` (`fantasypros_fetcher`, `scoring.py:stats_to_ppg`) | Source stat projections used as benchmark only (FP blending excluded by project scope). |

---
## 5. Recommendations

### 5.1 Baselines the new stat model must beat (all on the rolling 2023-25 held-out harness, non-rookie, games>=4, on PPG after scoring)

1. **Active model `v44_eb_pooling_perpos`** (comparator via `just list-models --check`): ALL MAE ~2.24, balanced MAE ~2.42, QB MAE 3.546 / rho 0.697. Gate = significant win on ALL MAE *or* a significant position-level win with no position regressing (v44 precedent) plus rho at the positions it targets.
2. **`naive_prior_season_ppg`** (ALL 2.498, balanced 2.816; RB rho 0.80 ≈ best model) – any stat model that fails to beat this by a wide margin at RB/WR is broken.
3. **Position-mean baseline** (K MAE 1.390 beats the models at K) – K must be tested explicitly against this; a stat-level K model (FG attempts x make rate by tier + PATs) is a genuine opportunity, since the current K bias is −1.1.
4. **Targets of opportunity**: QB rho 0.70 -> FP 0.81; WR MAE 2.19 -> FP 2.04; TE rho 0.76 -> 0.82. FantasyPros is a ceiling reference only (different, smaller, upward-biased population; FP blending out of scope).
5. Availability-inclusive target: games-MAE ≈ 3.58 (history haircut) and avail-MAE budget −0.042 (`availability_backtest.py`). Stat model's "games played" output should be evaluated against this and fed into the same `projected_games` column.
6. A stat model that simply reproduces v44 PPG after re-scoring is a null result; the value is in (a) per-stat accuracy that supports lineup / matchup / injury-replacement use and (b) predictive intervals.

### 5.2 Eval additions needed

* **Per-stat error table** per position per fold: MAE/RMSE/bias/R2 and rho for pass att, comp, pass yds, pass TD, INT, rush att/yds/TD, targets, rec, rec yds, rec TD, games, FG by tier, PAT; per-game rates and season totals both. Report each against naive prior-season rate (and shrunk-to-position-mean) so we can see which stats carry signal (TDs and INTs expected to be near the prior).
* **PPG decomposition**: score the model's stat line, and also the "oracle-substituted" line (replace one stat component with the actual) to attribute PPG error to volume vs efficiency vs TD luck vs games.
* **Calibration/intervals**: P10/P50/P90 per stat, coverage rates and pinball/CRPS (reuse `keeper_value/evaluate.py`, `model.crps`); reliability by position. Also check bias by predicted-PPG decile (the v44 audit found tier-dependent bias; `docs/generated/segment-analysis.md`, `/diagnose-segment`).
* **Extras handling**: since `nfl_stats` lacks fumbles/2pt/misses, compare scored-from-stat PPG vs stored PPG on actuals to quantify the unmodeled gap before any model comparison (should be added as a unit test; report mean/MAE of `total_points − score_stats(core columns)` per position).
* Plumb the model through `holdout_eval` as PPG preds so `significance.py` (MAE and Spearman, clustered by player), balanced MAE, top-N hit, availability-backtest and cache all work unchanged. Add a stat-level bootstrap only as a diagnostic.
* Keep rookie evaluation separate (`rookie_backtest.py` style), with the "conditional on playing" caveat noted there.
* Use `population harmonized` (top-N per position) as a robustness check; the full-population MAE is dominated by the drifting mix of bench players.
* Register 2026 in-season rows (`player_stats` 2026 = 618, `weekly_projections`) only as confirmation after the final-window rule is respected.

### 5.3 Integration risks

1. **Scalar-PPG assumptions everywhere**: `ProjectionFeature` API, `model_projections.projected_ppg NOT NULL`, `promote.py`, web `calculateVorp` and `availabilityAdjustedPpg`. Mitigation: store the stat line in an additional table/jsonb and keep `projected_ppg` = scored PPG; double-counting availability is the main risk (do not multiply by games twice: `projected_ppg` is a rate, `projected_games` separately).
2. **Scoring parity**: `nfl_stats` omits extras while `total_points` includes them; scoring from stored columns will under-count fumbles/2pt and K misses; K tiers lack attempts. Either extend `nfl_stats` (migration + TS types + `backfill_nfl_stats.py` + `just check-schema`) or accept/measure the gap. Do not use `stats_to_ppg` (hard-coded, no K, no extras).
3. **Summation consistency**: independently projected stats (targets, receptions, yards, TDs) must be coherent (rec <= targets, yards = rec x YPR, team totals ≈ league-typical). Without a team-level constraint, team volume (pass att + rush att) can drift; the #814 failure shows team denominators are fragile. A team-total layer needs PBP/team data that does not exist yet (missing item 2 in 1.3) – or must be derived from `nfl_stats` team sums with the dedupe logic and a check that every team-season has plausible totals.
4. **Data volume & leakage**: weekly/PBP ingestion makes in-season leakage easy (`structural-projection-levers-667.md` L195-198); the early-offseason projection must use only prior-season data. Train windows: stat history is 2010+, but position-dependent features (depth chart 2016+, vegas 2016+, red zone 2018+, NGS 2018+, advanced receiving 2018+, `player_stats` 2018+) – the min-train-season 2021 convention was set by feature coverage; a stat model on `nfl_stats` alone could train on 2010+ (with an era effect: league PPG fell from ~6.7 to ~5.5-5.7 in the coverage-analysis table, so include season effects or scale to league means).
5. **Era drift and population mix**: league mean PPG of qualifiers 6.67 (2010) -> 5.46 (2025); QB/TE roles shifted; the pooled eval is sensitive to qualifier-mix drift (hence balanced MAE).
6. **Eval population**: harness excludes rookies and <4-game players, so evaluation is conditional on playing; stat model should separately show games-played accuracy so this selection effect is visible. Games played is a hard-to-forecast target (structural attempts failed).
7. **Position-specific traps**: QB attempt share ≈ constant (do not use share-of-team for QB); K has no position dummy and a bias bug; WR/TE advanced receiving only from 2018; birth_date survivorship makes age features biased (use `season_drafted`/years-in-league as proxy rather than age).
8. **Cache and tests**: `holdout_cache` fingerprint must include new modules; clear after data backfills; `test_architecture.py` (pagination with order, no hardcoded constants, shared supabase client, dependency direction: analysis scripts must not import `scripts/tasks/`); `scripts/check_docs_freshness.py` requires docs updates (new table in `docs/generated/db-schema.md`, `docs/SUBSYSTEMS.md`).
9. **Power**: ~1.2k pooled eval rows and ~60 QB clusters mean per-stat gains will be hard to confirm; expect to rely on the Spearman gate and on pooling across seasons; do not iterate repeatedly on the 2023-25 window (forking-paths); keep the 2025 look single.
10. **Production side effects**: promoting a new model changes live projections and downstream surplus/arbitration; run `just project` (register), then `just promote` from the main checkout only, then `just analyze`.

### 5.4 Suggested build order (internal-evidence driven)

1. Fix/verify data: confirm #814 refit landed (`just project`), decide whether to add extras columns to `nfl_stats`, run a one-off check of scored-from-core vs stored `total_points`.
2. Build the stat targets table from `nfl_stats` (2010+; per-game rates + games) and a per-stat EB pooling baseline (position-mean prior, per-fold method-of-moments k per stat, recency weights [0.65, 0.20, 0.15] as a starting point). Score through `scripts/scoring.py`; run through the rolling harness vs naive and v44 on the 2023-24 iteration folds.
3. Add role/opportunity inputs (depth chart tier, draft capital for young players, team implied total, prior-season team volume) at the volume level (attempts, carries, targets), keeping efficiency/TD strongly shrunk. Use rushing/receiving TD priors from `red_zone_usage`/xFP code.
4. Games-played output from `expected_games.py` first (it already works), stat-model games only if it beats the 3.58 games-MAE.
5. Distributional layer and calibration (quantile approach from `keeper_value`).
6. One confirmation look on 2025 (then 2026 actuals when available).
