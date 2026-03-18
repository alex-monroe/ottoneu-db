"""Tune age curve parameters via grid search per position.

Tests combinations of peak_age, decline_rate, growth_rate, and scale for each
position. Computes in-memory projections (base weighted_ppg + age curve delta)
and compares to actuals to find the optimal parameter set.

Usage:
    python scripts/feature_projections/tune_age_curve.py [--seasons 2022,2023,2024,2025]
    python scripts/feature_projections/tune_age_curve.py --positions QB,WR
"""

from __future__ import annotations

import argparse
import itertools
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
from scripts.feature_projections.features.age_curve import (
    AgeCurveFeature,
    POSITION_AGE_CURVES,
)

# Grid search ranges per parameter (relative to current values where applicable)
PEAK_AGE_OFFSETS = [-2, -1, 0, 1, 2]
DECLINE_RATES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0]
GROWTH_RATES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
SCALES = [0.0, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5]


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

    return {
        "mae": round(mae, 4),
        "bias": round(bias, 4),
        "r_squared": round(r_squared, 4) if r_squared is not None else None,
        "rmse": round(rmse, 4),
        "n": n,
    }


def _precompute_base_projections(
    seasons: list[int],
    max_history: int = 3,
) -> dict[int, dict[str, tuple[float, float, str, float | None]]]:
    """Compute base weighted_ppg projections and actuals for all players.

    Returns: {season: {player_id: (base_ppg, actual_ppg, position, age_at_season)}}
    """
    supabase = get_supabase_client()
    feature = WeightedPPGFeature()

    # Fetch players for position and birth_date
    players_res = supabase.table("players").select("id, position, birth_date").execute()
    pos_map = {}
    birth_map = {}
    for row in (players_res.data or []):
        pos_map[row["id"]] = row["position"]
        if row.get("birth_date"):
            try:
                birth_map[row["id"]] = pd.Timestamp(row["birth_date"])
            except (ValueError, TypeError):
                pass

    results: dict[int, dict[str, tuple[float, float, str, float | None]]] = {}

    for target_season in seasons:
        historical_seasons = list(range(target_season - max_history, target_season))
        history_df = fetch_multi_season_stats(historical_seasons)
        if history_df.empty:
            continue

        # Fetch actuals
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

        season_data: dict[str, tuple[float, float, str, float | None]] = {}
        season_start = pd.Timestamp(f"{target_season}-09-01")

        for player_id, player_history in history_df.groupby("player_id"):
            pid = str(player_id)
            if pid not in actual_map:
                continue
            position = pos_map.get(pid)
            if not position:
                continue

            projected = feature.compute(pid, position, player_history, pd.DataFrame(), {})
            if projected is None:
                continue

            # Compute age
            age = None
            if pid in birth_map:
                age = (season_start - birth_map[pid]).days / 365.25

            season_data[pid] = (projected, actual_map[pid], position, age)

        results[target_season] = season_data

    return results


def _eval_params(
    position: str,
    params: dict[str, float],
    base_data: dict[int, dict[str, tuple[float, float, str, float | None]]],
) -> dict:
    """Evaluate a single parameter set for one position.

    Returns metrics dict with weighted average MAE across seasons.
    """
    peak_age = params["peak_age"]
    decline = params["decline_per_year"]
    growth = params["growth_per_year"]
    scale = params["scale"]

    all_projected: list[float] = []
    all_actual: list[float] = []

    for season, season_data in base_data.items():
        for pid, (base_ppg, actual_ppg, pos, age) in season_data.items():
            if pos != position:
                continue
            if age is None:
                continue

            # Compute age curve delta with test params
            years_from_peak = age - peak_age
            if years_from_peak > 0:
                delta = -decline * years_from_peak
            else:
                years_to_peak = -years_from_peak
                delta = growth * min(years_to_peak, 3.0)

            adjusted = max(0.0, base_ppg + delta * scale)
            all_projected.append(adjusted)
            all_actual.append(actual_ppg)

    return _compute_metrics(all_projected, all_actual)


def _eval_no_age_curve(
    position: str,
    base_data: dict[int, dict[str, tuple[float, float, str, float | None]]],
) -> dict:
    """Evaluate baseline (no age curve) for a position."""
    all_projected: list[float] = []
    all_actual: list[float] = []

    for season, season_data in base_data.items():
        for pid, (base_ppg, actual_ppg, pos, age) in season_data.items():
            if pos != position:
                continue
            all_projected.append(base_ppg)
            all_actual.append(actual_ppg)

    return _compute_metrics(all_projected, all_actual)


def grid_search_position(
    position: str,
    base_data: dict[int, dict[str, tuple[float, float, str, float | None]]],
) -> tuple[dict[str, float], dict, dict]:
    """Run grid search for a single position.

    Returns: (best_params, best_metrics, baseline_metrics)
    """
    current = POSITION_AGE_CURVES[position]
    current_peak = current["peak_age"]

    # Build search grid
    peak_ages = [current_peak + offset for offset in PEAK_AGE_OFFSETS]

    combos = list(itertools.product(peak_ages, DECLINE_RATES, GROWTH_RATES, SCALES))
    total = len(combos)
    print(f"  Testing {total} parameter combinations...")

    # Baseline: no age curve
    baseline = _eval_no_age_curve(position, base_data)

    best_mae = float("inf")
    best_params: dict[str, float] = {}
    best_metrics: dict = {}

    for i, (peak, decline, growth, scale) in enumerate(combos):
        params = {
            "peak_age": peak,
            "decline_per_year": decline,
            "growth_per_year": growth,
            "scale": scale,
        }
        metrics = _eval_params(position, params, base_data)

        if metrics["mae"] is not None and metrics["mae"] < best_mae:
            best_mae = metrics["mae"]
            best_params = params
            best_metrics = metrics

        if (i + 1) % 500 == 0:
            print(f"    {i + 1}/{total} tested, best MAE so far: {best_mae:.4f}")

    return best_params, best_metrics, baseline


def main() -> None:
    parser = argparse.ArgumentParser(description="Tune age curve parameters via grid search")
    parser.add_argument(
        "--seasons",
        default="2022,2023,2024,2025",
        help="Comma-separated target seasons (default: 2022,2023,2024,2025)",
    )
    parser.add_argument(
        "--positions",
        default="QB,WR",
        help="Comma-separated positions to tune (default: QB,WR)",
    )
    args = parser.parse_args()
    seasons = [int(s.strip()) for s in args.seasons.split(",")]
    positions = [p.strip().upper() for p in args.positions.split(",")]

    print(f"Tuning age curve for positions: {positions}")
    print(f"Backtest seasons: {seasons}")
    print()

    # Step 1: Precompute base projections (once for all positions)
    print("Precomputing base weighted_ppg projections...")
    base_data = _precompute_base_projections(seasons)
    total_players = sum(len(sd) for sd in base_data.values())
    print(f"  {total_players} player-seasons loaded across {len(base_data)} seasons\n")

    # Step 2: Grid search per position
    results: dict[str, tuple[dict, dict, dict]] = {}

    for position in positions:
        if position not in POSITION_AGE_CURVES:
            print(f"Skipping {position} — not in POSITION_AGE_CURVES")
            continue

        current = POSITION_AGE_CURVES[position]
        print(f"\n{'='*60}")
        print(f"Position: {position}")
        print(f"Current params: peak={current['peak_age']}, decline={current['decline_per_year']}, "
              f"growth={current['growth_per_year']}, scale={current['scale']}")
        print(f"{'='*60}")

        best_params, best_metrics, baseline = grid_search_position(position, base_data)
        results[position] = (best_params, best_metrics, baseline)

        # Evaluate current params for comparison
        current_metrics = _eval_params(position, current, base_data)

        print(f"\n  Results for {position}:")
        print(f"    {'Config':<35} {'MAE':>8} {'Bias':>8} {'R²':>8} {'RMSE':>8} {'N':>5}")
        print(f"    {'-'*75}")
        print(f"    {'No age curve (baseline)':<35} {baseline['mae']:>8.4f} {baseline['bias']:>+8.4f} "
              f"{baseline['r_squared']:>8.4f} {baseline['rmse']:>8.4f} {baseline['n']:>5}")
        print(f"    {'Current params':<35} {current_metrics['mae']:>8.4f} {current_metrics['bias']:>+8.4f} "
              f"{current_metrics['r_squared']:>8.4f} {current_metrics['rmse']:>8.4f} {current_metrics['n']:>5}")
        print(f"    {'Best grid search':<35} {best_metrics['mae']:>8.4f} {best_metrics['bias']:>+8.4f} "
              f"{best_metrics['r_squared']:>8.4f} {best_metrics['rmse']:>8.4f} {best_metrics['n']:>5}")

        print(f"\n  Best params: peak_age={best_params['peak_age']}, "
              f"decline={best_params['decline_per_year']}, "
              f"growth={best_params['growth_per_year']}, "
              f"scale={best_params['scale']}")

        mae_improvement = current_metrics["mae"] - best_metrics["mae"]
        print(f"  MAE improvement over current: {mae_improvement:+.4f}")
        mae_vs_baseline = baseline["mae"] - best_metrics["mae"]
        print(f"  MAE improvement over no-age-curve: {mae_vs_baseline:+.4f}")

    # === Final summary ===
    print(f"\n\n{'='*80}")
    print("SUMMARY — Recommended Parameter Updates")
    print(f"{'='*80}\n")

    print(f"{'Position':<6} {'Param':<20} {'Current':>10} {'Recommended':>12} {'MAE Δ':>8}")
    print("-" * 60)

    for position in positions:
        if position not in results:
            continue
        best_params, best_metrics, baseline = results[position]
        current = POSITION_AGE_CURVES[position]
        current_metrics = _eval_params(position, current, base_data)
        mae_delta = current_metrics["mae"] - best_metrics["mae"]

        for param in ["peak_age", "decline_per_year", "growth_per_year", "scale"]:
            cur_val = current[param]
            new_val = best_params[param]
            changed = " *" if cur_val != new_val else ""
            print(f"{position:<6} {param:<20} {cur_val:>10.1f} {new_val:>12.1f}{changed}")

        print(f"{'':<6} {'MAE improvement':<20} {'':>10} {'':>12} {mae_delta:>+8.4f}")
        print()

    # Show code snippet for updating
    print("\nSuggested update to POSITION_AGE_CURVES in age_curve.py:")
    print("-" * 60)
    for position in positions:
        if position not in results:
            continue
        best_params = results[position][0]
        print(f'    "{position}": {{"peak_age": {int(best_params["peak_age"])}, '
              f'"decline_per_year": {best_params["decline_per_year"]}, '
              f'"growth_per_year": {best_params["growth_per_year"]}, '
              f'"scale": {best_params["scale"]}}},')


if __name__ == "__main__":
    main()
