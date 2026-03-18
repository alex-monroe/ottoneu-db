"""Sweep recency weight variants for the WeightedPPG base feature.

Tests multiple weight configurations and reports MAE/R² across seasons
to find the optimal recency weights.

Usage:
    python scripts/feature_projections/sweep_recency_weights.py [--seasons 2022,2023,2024,2025]
"""

from __future__ import annotations

import argparse
import math
import os
import sys
from typing import Any

import pandas as pd

# Setup paths
script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
repo_root = os.path.dirname(script_dir)
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from config import get_supabase_client, POSITIONS, MIN_GAMES
from analysis_utils import fetch_multi_season_stats
from scripts.feature_projections.features.weighted_ppg import WeightedPPGFeature

# Weight variants to test (most recent season first)
WEIGHT_VARIANTS = [
    [0.50, 0.30, 0.20],  # current baseline
    [0.55, 0.30, 0.15],
    [0.60, 0.25, 0.15],
    [0.65, 0.20, 0.15],
    [0.55, 0.25, 0.20],
    [0.60, 0.30, 0.10],
    [0.70, 0.20, 0.10],
]


def _compute_metrics(projected: list[float], actual: list[float]) -> dict:
    """Compute MAE, Bias, R², RMSE from paired lists."""
    n = len(projected)
    if n == 0:
        return {"mae": None, "bias": None, "r_squared": None, "rmse": None, "n": 0}

    errors = [a - p for a, p in zip(actual, projected)]
    abs_errors = [abs(e) for e in errors]

    mae = sum(abs_errors) / n
    bias = sum(errors) / n
    rmse = math.sqrt(sum(e**2 for e in errors) / n)

    mean_actual = sum(actual) / n
    ss_res = sum((a - p) ** 2 for a, p in zip(actual, projected))
    ss_tot = sum((a - mean_actual) ** 2 for a in actual)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else None

    return {"mae": round(mae, 4), "bias": round(bias, 4), "r_squared": round(r_squared, 4), "rmse": round(rmse, 4), "n": n}


def _run_projections_for_weights(
    weights: list[float],
    seasons: list[int],
    max_history: int = 3,
) -> dict[int, dict[str, dict]]:
    """Compute in-memory projections for a weight variant and compare to actuals.

    Returns: {season: {"ALL": metrics, "QB": metrics, ...}}
    """
    supabase = get_supabase_client()

    # Patch the feature class
    WeightedPPGFeature.RECENCY_WEIGHTS = weights
    feature = WeightedPPGFeature()

    # Fetch players for position mapping
    players_res = supabase.table("players").select("id, position").execute()
    pos_map = {row["id"]: row["position"] for row in (players_res.data or [])}

    all_results: dict[int, dict[str, dict]] = {}

    for target_season in seasons:
        historical_seasons = list(range(target_season - max_history, target_season))

        # Fetch historical player_stats
        history_df = fetch_multi_season_stats(historical_seasons)
        if history_df.empty:
            continue

        # Fetch actuals for the target season
        actuals_res = (
            supabase.table("player_stats")
            .select("player_id, ppg, games_played")
            .eq("season", target_season)
            .execute()
        )
        if not actuals_res.data:
            continue

        actual_map = {}
        for row in actuals_res.data:
            games = int(row.get("games_played", 0) or 0)
            if games >= MIN_GAMES:
                actual_map[row["player_id"]] = float(row["ppg"])

        # Generate projections
        position_data: dict[str, tuple[list[float], list[float]]] = {
            pos: ([], []) for pos in POSITIONS
        }
        all_projected: list[float] = []
        all_actual: list[float] = []

        for player_id, player_history in history_df.groupby("player_id"):
            player_id_str = str(player_id)
            if player_id_str not in actual_map:
                continue

            position = pos_map.get(player_id_str)
            if not position:
                continue

            # Compute base feature only (no nfl_stats needed for weighted_ppg)
            projected = feature.compute(
                player_id_str, position, player_history, pd.DataFrame(), {}
            )
            if projected is None:
                continue

            actual_ppg = actual_map[player_id_str]
            all_projected.append(projected)
            all_actual.append(actual_ppg)

            if position in position_data:
                position_data[position][0].append(projected)
                position_data[position][1].append(actual_ppg)

        season_results: dict[str, dict] = {}
        season_results["ALL"] = _compute_metrics(all_projected, all_actual)

        for pos in POSITIONS:
            proj_list, act_list = position_data[pos]
            if proj_list:
                season_results[pos] = _compute_metrics(proj_list, act_list)

        all_results[target_season] = season_results

    return all_results


def _weighted_avg(results: dict[int, dict[str, dict]], pos: str, metric: str) -> float | None:
    """Compute weighted average of a metric across seasons for a position."""
    pairs = []
    for season, season_data in results.items():
        if pos in season_data:
            val = season_data[pos].get(metric)
            n = season_data[pos].get("n", 0)
            if val is not None and n > 0:
                pairs.append((val, n))
    if not pairs:
        return None
    return sum(v * w for v, w in pairs) / sum(w for _, w in pairs)


def main() -> None:
    parser = argparse.ArgumentParser(description="Sweep recency weight variants")
    parser.add_argument(
        "--seasons",
        default="2022,2023,2024,2025",
        help="Comma-separated target seasons (default: 2022,2023,2024,2025)",
    )
    args = parser.parse_args()
    seasons = [int(s.strip()) for s in args.seasons.split(",")]

    print(f"Testing {len(WEIGHT_VARIANTS)} weight variants across seasons {seasons}\n")

    variant_results: list[tuple[list[float], dict[int, dict[str, dict]]]] = []

    for weights in WEIGHT_VARIANTS:
        label = f"[{', '.join(f'{w:.2f}' for w in weights)}]"
        print(f"\n{'='*60}")
        print(f"Testing weights: {label}")
        print(f"{'='*60}")

        results = _run_projections_for_weights(weights, seasons)
        variant_results.append((weights, results))

        # Print per-season summary
        for season in seasons:
            if season in results and "ALL" in results[season]:
                m = results[season]["ALL"]
                print(f"  {season}: MAE={m['mae']}, R²={m['r_squared']}, n={m['n']}")

    # === Summary comparison table ===
    print(f"\n\n{'='*80}")
    print("SUMMARY — Weighted Average Across All Seasons (ALL positions)")
    print(f"{'='*80}\n")

    header = f"{'Weights':<25} {'MAE':>8} {'Bias':>8} {'R²':>8} {'RMSE':>8}"
    print(header)
    print("-" * len(header))

    best_mae = float("inf")
    best_variant = None

    for weights, results in variant_results:
        label = f"[{', '.join(f'{w:.2f}' for w in weights)}]"
        mae = _weighted_avg(results, "ALL", "mae")
        bias = _weighted_avg(results, "ALL", "bias")
        r_sq = _weighted_avg(results, "ALL", "r_squared")
        rmse = _weighted_avg(results, "ALL", "rmse")

        marker = ""
        if weights == WEIGHT_VARIANTS[0]:
            marker = " (current)"
        if mae is not None and mae < best_mae:
            best_mae = mae
            best_variant = weights

        print(
            f"{label:<25} {mae:>8.4f} {bias:>+8.4f} {r_sq:>8.4f} {rmse:>8.4f}{marker}"
        )

    print()

    # Per-position breakdown for best variant
    if best_variant:
        best_label = f"[{', '.join(f'{w:.2f}' for w in best_variant)}]"
        print(f"BEST: {best_label} (lowest weighted MAE)")
        print()

        # Find the best result
        best_results = next(r for w, r in variant_results if w == best_variant)

        print(f"Per-position breakdown for {best_label}:")
        print(f"{'Position':<10} {'MAE':>8} {'Bias':>8} {'R²':>8} {'RMSE':>8}")
        print("-" * 46)
        for pos in ["ALL"] + list(POSITIONS):
            mae = _weighted_avg(best_results, pos, "mae")
            bias = _weighted_avg(best_results, pos, "bias")
            r_sq = _weighted_avg(best_results, pos, "r_squared")
            rmse = _weighted_avg(best_results, pos, "rmse")
            if mae is not None:
                print(f"{pos:<10} {mae:>8.4f} {bias:>+8.4f} {r_sq:>8.4f} {rmse:>8.4f}")

    # Restore original weights
    WeightedPPGFeature.RECENCY_WEIGHTS = [0.50, 0.30, 0.20]


if __name__ == "__main__":
    main()
