"""Train a learned model using Ridge regression with leave-one-season-out CV.

Usage:
    venv/bin/python scripts/feature_projections/train_model.py --model v20_learned_usage --seasons 2021,2022,2023,2024,2025

This computes features for all players across training seasons, builds a feature matrix
with interaction terms, selects the best Ridge alpha via LOSO cross-validation, and
saves the trained coefficients to trained_models/{model_name}.json.

See GH #367 for motivation.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import HuberRegressor, Ridge
from sklearn.preprocessing import StandardScaler

from scripts.config import get_supabase_client, MIN_GAMES, fetch_all_rows
from scripts.analysis_utils import fetch_multi_season_stats, fetch_multi_season_nfl_stats
from scripts.feature_projections.features import FEATURE_REGISTRY
from scripts.feature_projections.model_config import get_model
from scripts.feature_projections.runner import (
    _build_coaching_lookup,
    _build_context,
    _build_contracts_lookup,
    _build_depth_charts_lookup,
    _build_draft_capital_lookup,
    _build_qb_ecosystem_lookups,
    _build_vegas_lines_lookup,
    _collect_feature_names_recursive,
    _compute_positional_mean_ppg,
    _compute_qb_quality_by_team,
    _compute_team_aggregates,
    _resolve_features_for_position,
    _resolve_residual_base_features,
)
from scripts.feature_projections.qb_starters import get_all_starter_ids
from scripts.feature_projections.learned_combiner import (
    build_feature_vector,
    compute_features_for_player,
    get_feature_column_names,
    TRAINED_MODELS_DIR,
)

ALPHA_CANDIDATES = [0.01, 0.1, 1.0, 10.0, 100.0]

# HuberRegressor regularises on a different scale than Ridge (its objective is
# Huber loss + alpha·‖w‖², not squared loss), so it needs its own, smaller grid
# centered on the sklearn default (0.0001). GH #645.
HUBER_ALPHA_CANDIDATES = [0.0001, 0.001, 0.01, 0.1, 1.0]


def _make_linear_estimator(alpha: float, regressor_spec: dict | None, fit_intercept: bool = True):
    """Build the per-fold linear estimator (Ridge by default; Huber if specified).

    ``regressor_spec={"type": "huber", "epsilon": e}`` selects a robust Huber
    fit (#645) — squared loss for residuals within ``epsilon`` standard
    deviations, linear beyond, so injury-wrecked / role-collapse outlier seasons
    pull the coefficients less. Empty/None → Ridge, byte-identical to before.
    """
    if regressor_spec and regressor_spec.get("type") == "huber":
        return HuberRegressor(
            alpha=alpha,
            epsilon=float(regressor_spec.get("epsilon", 1.35)),
            fit_intercept=fit_intercept,
            max_iter=2000,
        )
    return Ridge(alpha=alpha, fit_intercept=fit_intercept)


def collect_training_data(
    model_name: str,
    seasons: list[int],
    max_history: int = 3,
) -> pd.DataFrame:
    """Compute features and collect actuals for all players across seasons.

    Returns a DataFrame with columns:
    - player_id, position, season (metadata)
    - feature columns (from feature computation)
    - actual_ppg (from player_stats for the target season)
    - feature_values (dict, for building the feature vector)
    """
    model_def = get_model(model_name)
    supabase = get_supabase_client()

    # Fetch players
    players_data = fetch_all_rows(supabase, "players", "id, name, position, nfl_team, birth_date, is_college")
    players_df = pd.DataFrame(players_data)
    players_df = players_df.rename(columns={"id": "player_id_ref"})

    # Fetch draft capital once (used across all training seasons)
    draft_capital_lookup = _build_draft_capital_lookup(supabase)

    # Fetch Vegas implied team totals once (used across all training seasons)
    vegas_lookup, vegas_league_means = _build_vegas_lines_lookup(supabase)

    # Fetch opening-day depth-chart tiers once (used across all training seasons)
    depth_charts_lookup = _build_depth_charts_lookup(supabase)

    # QB-ecosystem lookups for team_qb_quality_raw / team_qb_changed_raw (#642);
    # per-season centered QB1 PPG computed in the loop from that season's history.
    qb1_by_team, player_team_by_season = _build_qb_ecosystem_lookups(supabase)

    # Per-team-season coaching-change signal once (spike #651).
    coaching_lookup = _build_coaching_lookup(supabase)

    # Per-player offseason contract signings once (spike #651, source #3).
    contracts_lookup = _build_contracts_lookup(supabase)

    # Instantiate features. Residual stacks pull in features from every
    # nested base so the trainer can compute the base prediction per sample.
    all_feature_names = _collect_feature_names_recursive(model_def)
    feature_pool = {}
    for fname in all_feature_names:
        if fname in FEATURE_REGISTRY:
            feature_pool[fname] = FEATURE_REGISTRY[fname]()

    rows = []

    for target_season in seasons:
        historical_seasons = list(range(target_season - max_history, target_season))
        print(f"Collecting features for {target_season} (history: {historical_seasons})...")

        # Fetch historical data
        history_df = fetch_multi_season_stats(historical_seasons)
        if history_df.empty:
            print(f"  No history for {historical_seasons}, skipping")
            continue

        # Fetch nfl_stats (paginated — a multi-season window exceeds the
        # 1000-row cap; truncation here corrupted learned-model features and
        # therefore the trained coefficients; GH #562).
        nfl_stats_all = fetch_multi_season_nfl_stats(historical_seasons)
        for col in ["total_points", "games_played", "targets", "rushing_attempts",
                     "passing_yards", "passing_tds", "interceptions", "rushing_yards",
                     "rushing_tds", "receptions", "receiving_yards", "receiving_tds",
                     "offense_snaps", "passing_attempts", "completions"]:
            if col in nfl_stats_all.columns:
                nfl_stats_all[col] = pd.to_numeric(nfl_stats_all[col], errors="coerce").fillna(0)
        if "season" in nfl_stats_all.columns:
            nfl_stats_all["season"] = pd.to_numeric(nfl_stats_all["season"], errors="coerce")

        # Team aggregates and positional means
        team_aggregates = _compute_team_aggregates(nfl_stats_all, players_df)
        positional_means = _compute_positional_mean_ppg(history_df, players_df)

        # Centered QB1 prior PPG per team for this target season (#642).
        qb_quality = _compute_qb_quality_by_team(history_df, qb1_by_team, target_season)

        # QB starters
        qb_starters = get_all_starter_ids(historical_seasons + [target_season], players_df)

        # Fetch actuals for target season
        actuals_df = fetch_multi_season_stats([target_season])
        if actuals_df.empty:
            print(f"  No actuals for {target_season}, skipping")
            continue

        # Build a lookup of actual PPG for the target season
        actuals_lookup: dict[str, float] = {}
        for _, row in actuals_df.iterrows():
            pid = str(row["player_id"])
            games = float(row.get("games_played", 0) or 0)
            ppg = float(row.get("ppg", 0) or 0)
            if games >= MIN_GAMES and ppg > 0:
                actuals_lookup[pid] = ppg

        # Compute features for each player
        for player_id, player_history in history_df.groupby("player_id"):
            player_id_str = str(player_id)

            if player_id_str not in actuals_lookup:
                continue

            player_row = players_df[players_df["player_id_ref"] == player_id_str]
            if player_row.empty:
                continue
            position = player_row.iloc[0]["position"]
            if not position:
                continue

            player_nfl = nfl_stats_all[nfl_stats_all["player_id"] == player_id_str] if not nfl_stats_all.empty else pd.DataFrame()

            context = _build_context(
                player_id_str, position, players_df, nfl_stats_all,
                target_season, team_aggregates, positional_means,
                qb_starters=qb_starters,
                draft_capital=draft_capital_lookup,
                vegas_lines=vegas_lookup,
                vegas_league_means=vegas_league_means,
                depth_charts=depth_charts_lookup,
                qb1_by_team=qb1_by_team,
                player_team_by_season=player_team_by_season,
                qb_quality=qb_quality,
                team_coaching=coaching_lookup,
                contracts_by_player_year=contracts_lookup,
            )

            effective_features, effective_weights = _resolve_features_for_position(model_def, position)
            # For residual models, also evaluate every nested base's features
            # so the trainer can compute the base prediction (and the residual
            # to fit).
            base_eff = _resolve_residual_base_features(model_def, position)
            if base_eff:
                effective_features = list(dict.fromkeys(list(base_eff) + list(effective_features)))
            player_feature_instances = [
                feature_pool[f] for f in effective_features if f in feature_pool
            ]

            feature_values = compute_features_for_player(
                player_feature_instances,
                player_id_str,
                position,
                player_history,
                player_nfl,
                context,
                effective_weights or None,
            )

            # Check base feature exists
            base_name = next((f.name for f in player_feature_instances if f.is_base), None)
            if base_name and feature_values.get(base_name) is None:
                continue

            row_record = {
                "player_id": player_id_str,
                "position": position,
                "season": target_season,
                "feature_values": feature_values,
                "actual_ppg": actuals_lookup[player_id_str],
                # Leakage-free relevance signal for rank-aware training (#643):
                # the recency-weighted prior-season PPG, computed only from
                # seasons before the target.
                "base_ppg": feature_values.get(base_name) if base_name else None,
            }
            # Residual models filter on draft seasonality at fit time.
            dc = context.get("draft_capital")
            if dc and isinstance(dc, dict):
                row_record["seasons_since_draft"] = (
                    int(target_season) - int(dc.get("season_drafted", target_season))
                )
            rows.append(row_record)

        print(f"  Collected {sum(1 for r in rows if r['season'] == target_season)} samples")

    print(f"Total training samples: {len(rows)}")
    return pd.DataFrame(rows)


# Starter-pool sizes per position (mirrors backtest.TOP_N_BY_POSITION). The
# rank-aware "top-2N" tier is the rosterable + near-rosterable band.
_TOP_N_BY_POSITION = {"QB": 12, "RB": 24, "WR": 24, "TE": 12, "K": 12}


def compute_sample_weights(
    base_ppgs: "np.ndarray",
    positions: list[str],
    seasons: "np.ndarray",
    spec: dict,
) -> "np.ndarray":
    """Per-sample Ridge weights from leakage-free prior-season relevance (#643).

    ``base_ppgs`` is each kept sample's recency-weighted prior PPG (the base
    feature value). Weights concentrate fit capacity on the rosterable tier so
    the model orders starters better — the metric the projections actually feed.
    Returns an array aligned with the inputs; all-ones when ``spec`` is empty.

    Schemes:
      - ``topn_step`` (param ``k``): samples whose base_ppg ranks in the top-2N
        at their (position, season) get weight ``1 + k``; the rest ``1.0``.
      - ``ppg_within_pos`` (param ``clip``=[lo, hi]): ``base_ppg`` divided by
        the (position, season) mean base_ppg, clipped — a continuous relevance
        weight that is comparable across positions (so QB scoring level doesn't
        dominate).
    """
    n = len(base_ppgs)
    weights = np.ones(n, dtype=np.float64)
    if not spec:
        return weights

    scheme = spec.get("scheme")
    # Group sample indices by (position, season) so relevance is judged within
    # the pool a roster decision actually compares.
    groups: dict[tuple, list[int]] = {}
    for i in range(n):
        groups.setdefault((positions[i], int(seasons[i])), []).append(i)

    if scheme == "topn_step":
        k = float(spec.get("k", 1.0))
        for (pos, _season), idxs in groups.items():
            top_n = _TOP_N_BY_POSITION.get(pos, 12)
            cutoff = 2 * top_n
            # Rank by base_ppg descending; the top-2N get the bump.
            ordered = sorted(idxs, key=lambda i: base_ppgs[i], reverse=True)
            for rank, i in enumerate(ordered):
                if rank < cutoff:
                    weights[i] = 1.0 + k
    elif scheme == "ppg_within_pos":
        lo, hi = spec.get("clip", [0.25, 4.0])
        for (_pos, _season), idxs in groups.items():
            vals = np.array([base_ppgs[i] for i in idxs], dtype=np.float64)
            mean = float(np.mean(vals)) if len(vals) else 0.0
            if mean <= 0:
                continue
            for i in idxs:
                weights[i] = float(np.clip(base_ppgs[i] / mean, lo, hi))
    else:
        raise ValueError(f"Unknown sample_weight scheme: {scheme!r}")

    return weights


def train_ridge_loso(
    training_data: pd.DataFrame,
    interaction_terms: list[str],
    alpha_candidates: list[float] | None = None,
    sample_weight_spec: dict | None = None,
    regressor_spec: dict | None = None,
) -> dict[str, Any]:
    """Train a linear model with leave-one-season-out CV for alpha selection.

    Ridge by default; ``regressor_spec={"type": "huber", "epsilon": e}`` swaps in
    a robust Huber loss (#645). When ``sample_weight_spec`` is set, the fit (and
    every LOSO fold) is weighted by prior-season relevance (#643) so the model
    concentrates on ordering the rosterable tier. The saved params
    (coefficients/intercept/scaler) have the same shape regardless, so
    prediction is unchanged. Returns the trained model parameters as a dict
    suitable for JSON serialization.
    """
    if alpha_candidates is None:
        alpha_candidates = (
            HUBER_ALPHA_CANDIDATES
            if regressor_spec and regressor_spec.get("type") == "huber"
            else ALPHA_CANDIDATES
        )

    seasons = sorted(training_data["season"].unique())
    print(f"\nTraining with LOSO CV across seasons: {seasons}")

    # Build feature matrices
    all_X = []
    all_y = []
    all_seasons_col = []
    all_positions = []
    all_base_ppg = []

    feature_names = None

    for _, row in training_data.iterrows():
        fv = row["feature_values"]
        position = row["position"]

        vector = build_feature_vector(fv, position, interaction_terms)
        if vector is None:
            continue

        if feature_names is None:
            feature_names = get_feature_column_names(list(fv.keys()), interaction_terms)

        all_X.append(vector)
        all_y.append(row["actual_ppg"])
        all_seasons_col.append(row["season"])
        all_positions.append(position)
        bp = row.get("base_ppg") if hasattr(row, "get") else None
        all_base_ppg.append(float(bp) if bp is not None else 0.0)

    X = np.array(all_X, dtype=np.float64)
    y = np.array(all_y, dtype=np.float64)
    season_arr = np.array(all_seasons_col)
    base_ppg_arr = np.array(all_base_ppg, dtype=np.float64)

    # Rank-aware sample weights (#643); all-ones unless a spec is given.
    sample_weights = compute_sample_weights(
        base_ppg_arr, all_positions, season_arr, sample_weight_spec or {}
    )

    print(f"Feature matrix: {X.shape[0]} samples × {X.shape[1]} features")
    print(f"Feature columns: {feature_names}")
    if sample_weight_spec:
        print(f"Rank-aware sample weights: {sample_weight_spec} "
              f"(mean={sample_weights.mean():.3f}, max={sample_weights.max():.3f})")

    # LOSO cross-validation to select alpha
    best_alpha = alpha_candidates[0]
    best_mae = float("inf")

    for alpha in alpha_candidates:
        fold_maes = []

        for holdout_season in seasons:
            train_mask = season_arr != holdout_season
            test_mask = season_arr == holdout_season

            if not np.any(train_mask) or not np.any(test_mask):
                continue

            X_train, X_test = X[train_mask], X[test_mask]
            y_train, y_test = y[train_mask], y[test_mask]
            w_train = sample_weights[train_mask]

            # Standardize
            scaler = StandardScaler()
            X_train_scaled = scaler.fit_transform(X_train)
            X_test_scaled = scaler.transform(X_test)

            model = _make_linear_estimator(alpha, regressor_spec)
            model.fit(X_train_scaled, y_train, sample_weight=w_train)
            preds = model.predict(X_test_scaled)
            preds = np.maximum(preds, 0.0)

            # The held-out fold is scored unweighted — we tune for true MAE,
            # not weighted MAE (the weights are a fitting device, not the goal).
            mae = float(np.mean(np.abs(preds - y_test)))
            fold_maes.append(mae)

        avg_mae = float(np.mean(fold_maes)) if fold_maes else float("inf")
        print(f"  Alpha={alpha:>6.2f} → LOSO MAE: {avg_mae:.4f}")

        if avg_mae < best_mae:
            best_mae = avg_mae
            best_alpha = alpha

    print(f"\nBest alpha: {best_alpha} (LOSO MAE: {best_mae:.4f})")

    # Final fit on all data
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = _make_linear_estimator(best_alpha, regressor_spec)
    model.fit(X_scaled, y, sample_weight=sample_weights)

    # Report coefficients
    print("\nLearned coefficients:")
    for name, coef in zip(feature_names, model.coef_):
        print(f"  {name:>35s}: {coef:>8.4f}")
    print(f"  {'intercept':>35s}: {model.intercept_:>8.4f}")

    # Training set metrics
    train_preds = np.maximum(model.predict(X_scaled), 0.0)
    train_mae = float(np.mean(np.abs(train_preds - y)))
    train_r2 = float(1 - np.sum((y - train_preds) ** 2) / np.sum((y - np.mean(y)) ** 2))
    print(f"\nTraining set: MAE={train_mae:.4f}, R²={train_r2:.4f}")
    print(f"LOSO CV:      MAE={best_mae:.4f}")

    return {
        "alpha": best_alpha,
        "coefficients": model.coef_.tolist(),
        "intercept": float(model.intercept_),
        "feature_names": feature_names,
        "interaction_terms": interaction_terms,
        "scaler_mean": scaler.mean_.tolist(),
        "scaler_scale": scaler.scale_.tolist(),
        # Documented for reproducibility; neither affects prediction (a linear
        # model either way; weights/loss only shape the fit). GH #643/#645.
        "sample_weight_spec": sample_weight_spec or {},
        "regressor_spec": regressor_spec or {},
        "training_metadata": {
            "seasons": [int(s) for s in seasons],
            "n_samples": int(X.shape[0]),
            "n_features": int(X.shape[1]),
            "loso_mae": best_mae,
            "train_mae": train_mae,
            "train_r2": train_r2,
            "trained_at": datetime.now(timezone.utc).isoformat(),
        },
    }


def train_ridge_residual(
    training_data: pd.DataFrame,
    base_model_name: str,
    residual_features: list[str],
    interaction_terms: list[str],
    training_filter: dict[str, Any],
    alpha_candidates: list[float] | None = None,
) -> dict[str, Any]:
    """Train a Ridge residual on top of a frozen base model.

    The base model's coefficients are NOT re-optimized — they are loaded from
    its saved JSON and used to compute predictions on every training sample.
    The residual model is then fit on (actual − base_pred) using only
    `residual_features` and `interaction_terms`, with fit_intercept=False so
    samples whose residual feature values are zero (veterans for
    `draft_capital_raw`) receive an exactly-zero correction.

    Returns a dict suitable for JSON serialization. The saved file embeds the
    base model's params alongside the residual coefficients so inference is
    self-contained.
    """
    from scripts.feature_projections.learned_combiner import (
        load_model_params,
        predict as learned_predict,
        predict_residual as learned_predict_residual,
    )

    if alpha_candidates is None:
        alpha_candidates = ALPHA_CANDIDATES

    # Apply training filter (e.g. only rookie/soph/3rd-year for residual fit)
    filtered = training_data
    max_ssd = training_filter.get("max_seasons_since_draft")
    if max_ssd is not None:
        filtered = filtered[
            filtered["seasons_since_draft"].notna()
            & (filtered["seasons_since_draft"] <= max_ssd)
            & (filtered["seasons_since_draft"] >= 0)
        ]
    # Position-restricted residual (GH #592): fit only on the listed positions.
    # predict_residual gates application by the same filter, so other positions
    # receive the base model's prediction unchanged.
    positions = training_filter.get("positions")
    if positions:
        filtered = filtered[filtered["position"].isin(positions)]
    print(f"\nResidual training set: {len(filtered)} samples "
          f"(filtered from {len(training_data)} via {training_filter})")
    if filtered.empty:
        raise ValueError("No samples remain after applying training_filter")

    base_params = load_model_params(base_model_name)
    print(f"Loaded base model '{base_model_name}' "
          f"(alpha={base_params['alpha']}, n_features={base_params['training_metadata']['n_features']})")

    # Build (residual_feature_vector, residual_target) pairs
    all_X: list[list[float]] = []
    all_y: list[float] = []
    all_seasons_col: list[int] = []
    residual_feature_names: list[str] | None = None

    for _, row in filtered.iterrows():
        fv = row["feature_values"]
        position = row["position"]

        # Base prediction: feed the FULL feature dict to the base model. The
        # base predict() builds its own vector from base_params["feature_names"]
        # in the canonical alphabetical order, so extra keys in `fv` are
        # ignored — only the features the base model knows about are used.
        # If the base is itself a residual model (nested residuals), use
        # predict_residual so its own residual layer is applied. GH #378.
        if base_params.get("combiner_type") == "residual":
            base_pred = learned_predict_residual(fv, position, base_params)
        else:
            base_pred = learned_predict(fv, position, base_params)
        if base_pred is None:
            continue

        # Residual feature vector — restrict feature_values to just the
        # residual model's features so build_feature_vector orders columns
        # over only those.
        residual_fv = {f: fv.get(f) for f in residual_features}
        vector = build_feature_vector(residual_fv, position, interaction_terms)
        if vector is None:
            continue

        if residual_feature_names is None:
            residual_feature_names = get_feature_column_names(residual_features, interaction_terms)

        residual = float(row["actual_ppg"]) - float(base_pred)
        all_X.append(vector)
        all_y.append(residual)
        all_seasons_col.append(int(row["season"]))

    if not all_X:
        raise ValueError("No residual training rows produced")

    X = np.array(all_X, dtype=np.float64)
    y = np.array(all_y, dtype=np.float64)
    season_arr = np.array(all_seasons_col)

    print(f"Residual feature matrix: {X.shape[0]} samples × {X.shape[1]} features")
    print(f"Residual columns: {residual_feature_names}")

    # LOSO CV alpha selection. fit_intercept=False so vets get a 0 contribution.
    seasons = sorted(set(all_seasons_col))
    best_alpha = alpha_candidates[0]
    best_mae = float("inf")

    for alpha in alpha_candidates:
        fold_maes: list[float] = []
        for holdout in seasons:
            train_mask = season_arr != holdout
            test_mask = season_arr == holdout
            if not np.any(train_mask) or not np.any(test_mask):
                continue
            model = Ridge(alpha=alpha, fit_intercept=False)
            model.fit(X[train_mask], y[train_mask])
            preds = model.predict(X[test_mask])
            fold_maes.append(float(np.mean(np.abs(preds - y[test_mask]))))
        avg = float(np.mean(fold_maes)) if fold_maes else float("inf")
        print(f"  Alpha={alpha:>6.2f} → LOSO residual MAE: {avg:.4f}")
        if avg < best_mae:
            best_mae = avg
            best_alpha = alpha

    print(f"\nBest residual alpha: {best_alpha} (LOSO MAE: {best_mae:.4f})")

    final_model = Ridge(alpha=best_alpha, fit_intercept=False)
    final_model.fit(X, y)

    print("\nResidual coefficients (PPG delta per unit feature):")
    for name, coef in zip(residual_feature_names, final_model.coef_):
        print(f"  {name:>35s}: {coef:>+8.4f}")

    return {
        "combiner_type": "residual",
        "base_model_name": base_model_name,
        "base_model_params": base_params,
        "alpha": best_alpha,
        "coefficients": final_model.coef_.tolist(),
        "intercept": 0.0,
        "feature_names": residual_features,
        "interaction_terms": interaction_terms,
        "training_filter": training_filter,
        "training_metadata": {
            "seasons": [int(s) for s in seasons],
            "n_samples": int(X.shape[0]),
            "n_features": int(X.shape[1]),
            "loso_residual_mae": best_mae,
            "trained_at": datetime.now(timezone.utc).isoformat(),
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Train a learned projection model")
    parser.add_argument("--model", required=True, help="Model name from model_config.py")
    parser.add_argument("--seasons", required=True, help="Comma-separated training seasons (e.g., 2022,2023,2024)")
    parser.add_argument("--max-history", type=int, default=3, help="Max seasons of history per projection")
    args = parser.parse_args()

    model_name = args.model
    seasons = [int(s.strip()) for s in args.seasons.split(",")]

    model_def = get_model(model_name)
    if model_def.combiner_type not in {"learned", "residual"}:
        print(f"Error: Model '{model_name}' has combiner_type='{model_def.combiner_type}', expected 'learned' or 'residual'")
        sys.exit(1)

    print(f"Training model: {model_name}")
    print(f"Seasons: {seasons}")
    print(f"Interaction terms: {model_def.interaction_terms}")
    if model_def.combiner_type == "residual":
        print(f"Base model: {model_def.base_model_name}")
        print(f"Training filter: {model_def.training_filter}")

    # Collect training data
    training_data = collect_training_data(model_name, seasons, args.max_history)
    if training_data.empty:
        print("No training data collected. Aborting.")
        sys.exit(1)

    # Train
    if model_def.combiner_type == "residual":
        if not model_def.base_model_name:
            print(f"Error: residual model '{model_name}' requires base_model_name")
            sys.exit(1)
        model_params = train_ridge_residual(
            training_data,
            base_model_name=model_def.base_model_name,
            residual_features=model_def.features,
            interaction_terms=model_def.interaction_terms,
            training_filter=model_def.training_filter,
        )
    else:
        model_params = train_ridge_loso(
            training_data,
            model_def.interaction_terms,
            sample_weight_spec=model_def.sample_weight_spec,
            regressor_spec=model_def.regressor_spec,
        )

    # Save
    TRAINED_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = TRAINED_MODELS_DIR / f"{model_name}.json"
    with open(output_path, "w") as f:
        json.dump(model_params, f, indent=2)
    print(f"\nSaved trained model to {output_path}")


if __name__ == "__main__":
    main()
