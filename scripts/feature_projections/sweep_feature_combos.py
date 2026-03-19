"""Sweep all combinations of adjustment features to find the best projection model.

Tests all 2^6 = 64 combinations of the 6 adjustment features on top of the
base weighted_ppg feature. Computes in-memory projections and backtest metrics
to rank every combination by weighted-average MAE across seasons.

Usage:
    python scripts/feature_projections/sweep_feature_combos.py [--seasons 2024,2025]
"""

from __future__ import annotations

import argparse
import itertools
import math
import os
import sys
from typing import Any, Optional

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
from scripts.feature_projections.features import FEATURE_REGISTRY
from scripts.feature_projections.features.base import ProjectionFeature
from scripts.feature_projections.combiner import combine_features
from scripts.feature_projections.runner import (
    _compute_team_aggregates,
    _compute_positional_mean_ppg,
    _build_context,
)

# The base feature is always included; we sweep these adjustment features
ADJUSTMENT_FEATURES = [
    "age_curve",
    "stat_efficiency",
    "games_played",
    "team_context",
    "usage_share",
    "regression_to_mean",
]


def _compute_metrics(projected: list[float], actual: list[float]) -> dict:
    """Compute MAE, Bias, R-squared, RMSE from paired lists."""
    n = len(projected)
    if n == 0:
        return {"mae": None, "bias": None, "r_squared": None, "rmse": None, "n": 0}

    errors = [a - p for a, p in zip(actual, projected)]
    abs_errors = [abs(e) for e in errors]

    mae = sum(abs_errors) / n
    bias = sum(errors) / n
    rmse = math.sqrt(sum(e ** 2 for e in errors) / n)

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


def _run_combo(
    adj_features: list[str],
    seasons: list[int],
    max_history: int = 3,
) -> dict[int, dict[str, dict]]:
    """Run in-memory projections for a feature combo and compare to actuals.

    Returns: {season: {"ALL": metrics, "QB": metrics, ...}}
    """
    supabase = get_supabase_client()

    # Instantiate features: always include base + selected adjustments
    base_instance = FEATURE_REGISTRY["weighted_ppg"]()
    adj_instances = [FEATURE_REGISTRY[f]() for f in adj_features]
    all_features = [base_instance] + adj_instances

    # Fetch players table
    players_res = supabase.table("players").select(
        "id, position, nfl_team, birth_date, is_college"
    ).execute()
    players_df = pd.DataFrame(players_res.data or [])
    players_df = players_df.rename(columns={"id": "player_id_ref"})

    pos_map = {row["player_id_ref"]: row["position"] for _, row in players_df.iterrows()}

    all_results = {}  # type: dict[int, dict[str, dict]]

    for target_season in seasons:
        historical_seasons = list(range(target_season - max_history, target_season))

        # Fetch historical player_stats
        history_df = fetch_multi_season_stats(historical_seasons)
        if history_df.empty:
            continue

        # Fetch historical nfl_stats
        nfl_stats_res = (
            supabase.table("nfl_stats")
            .select("*")
            .in_("season", historical_seasons)
            .execute()
        )
        nfl_stats_all = pd.DataFrame(nfl_stats_res.data or [])
        for col in [
            "total_points", "games_played", "targets", "rushing_attempts",
            "passing_yards", "passing_tds", "interceptions", "rushing_yards",
            "rushing_tds", "receptions", "receiving_yards", "receiving_tds",
            "offense_snaps",
        ]:
            if col in nfl_stats_all.columns:
                nfl_stats_all[col] = pd.to_numeric(nfl_stats_all[col], errors="coerce").fillna(0)
        if "season" in nfl_stats_all.columns:
            nfl_stats_all["season"] = pd.to_numeric(nfl_stats_all["season"], errors="coerce")

        # Compute shared context data
        team_aggregates = _compute_team_aggregates(nfl_stats_all, players_df)
        positional_means = _compute_positional_mean_ppg(history_df, players_df)

        # Fetch actuals for target season
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
        position_data = {pos: ([], []) for pos in POSITIONS}  # type: dict[str, tuple[list[float], list[float]]]
        all_projected = []  # type: list[float]
        all_actual = []  # type: list[float]

        for player_id, player_history in history_df.groupby("player_id"):
            player_id_str = str(player_id)
            if player_id_str not in actual_map:
                continue

            position = pos_map.get(player_id_str)
            if not position:
                continue

            # Get player's nfl_stats
            player_nfl = (
                nfl_stats_all[nfl_stats_all["player_id"] == player_id_str]
                if not nfl_stats_all.empty
                else pd.DataFrame()
            )

            # Build context (same as runner.py)
            context = _build_context(
                player_id_str, position, players_df, nfl_stats_all,
                target_season, team_aggregates, positional_means,
            )

            # Run combiner
            projected_ppg, _ = combine_features(
                all_features,
                player_id_str,
                position,
                player_history,
                player_nfl,
                context,
                None,  # no custom weights
            )

            if projected_ppg is None:
                continue

            actual_ppg = actual_map[player_id_str]
            all_projected.append(projected_ppg)
            all_actual.append(actual_ppg)

            if position in position_data:
                position_data[position][0].append(projected_ppg)
                position_data[position][1].append(actual_ppg)

        season_results = {}  # type: dict[str, dict]
        season_results["ALL"] = _compute_metrics(all_projected, all_actual)

        for pos in POSITIONS:
            proj_list, act_list = position_data[pos]
            if proj_list:
                season_results[pos] = _compute_metrics(proj_list, act_list)

        all_results[target_season] = season_results

    return all_results


def _weighted_avg(
    results: dict[int, dict[str, dict]], pos: str, metric: str
) -> Optional[float]:
    """Compute weighted average of a metric across seasons for a position."""
    pairs = []
    for _season, season_data in results.items():
        if pos in season_data:
            val = season_data[pos].get(metric)
            n = season_data[pos].get("n", 0)
            if val is not None and n > 0:
                pairs.append((val, n))
    if not pairs:
        return None
    return sum(v * w for v, w in pairs) / sum(w for _, w in pairs)


def _generate_all_combos() -> list[list[str]]:
    """Generate all 2^6 combinations of adjustment features (including empty = base-only)."""
    combos = []
    for r in range(len(ADJUSTMENT_FEATURES) + 1):
        for subset in itertools.combinations(ADJUSTMENT_FEATURES, r):
            combos.append(list(subset))
    return combos


def main() -> None:
    parser = argparse.ArgumentParser(description="Sweep all feature combinations")
    parser.add_argument(
        "--seasons",
        default="2024,2025",
        help="Comma-separated target seasons (default: 2024,2025)",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=10,
        help="Number of top combinations to show in detail (default: 10)",
    )
    parser.add_argument(
        "--by-position",
        action="store_true",
        help="Rank combos per position instead of ALL-positions aggregate",
    )
    args = parser.parse_args()
    seasons = [int(s.strip()) for s in args.seasons.split(",")]

    combos = _generate_all_combos()
    print(f"Testing {len(combos)} feature combinations across seasons {seasons}\n")

    combo_results = []  # type: list[tuple[list[str], dict[int, dict[str, dict]]]]

    for i, adj_features in enumerate(combos):
        label = "weighted_ppg"
        if adj_features:
            label += " + " + " + ".join(adj_features)
        else:
            label += " (base only)"

        print(f"\n[{i + 1}/{len(combos)}] {label}")

        results = _run_combo(adj_features, seasons)
        combo_results.append((adj_features, results))

        # Print per-season summary
        for season in seasons:
            if season in results and "ALL" in results[season]:
                m = results[season]["ALL"]
                print(f"  {season}: MAE={m['mae']}, R²={m['r_squared']}, n={m['n']}")

    # === Rank by weighted-average MAE across all seasons ===
    ranked = []
    for adj_features, results in combo_results:
        mae = _weighted_avg(results, "ALL", "mae")
        r_sq = _weighted_avg(results, "ALL", "r_squared")
        bias = _weighted_avg(results, "ALL", "bias")
        rmse = _weighted_avg(results, "ALL", "rmse")
        if mae is not None:
            ranked.append({
                "features": adj_features,
                "mae": mae,
                "bias": bias,
                "r_squared": r_sq,
                "rmse": rmse,
                "results": results,
            })

    ranked.sort(key=lambda x: x["mae"])

    # === Print summary table ===
    print(f"\n\n{'=' * 100}")
    print("RANKED FEATURE COMBINATIONS — Weighted Average Across All Seasons (ALL positions)")
    print(f"{'=' * 100}\n")

    header = f"{'Rank':>4}  {'Features':<65} {'MAE':>8} {'Bias':>8} {'R²':>8} {'RMSE':>8}"
    print(header)
    print("-" * len(header))

    for i, row in enumerate(ranked):
        label = "weighted_ppg"
        if row["features"]:
            label += " + " + " + ".join(row["features"])
        else:
            label += " (base only)"

        # Truncate long labels
        if len(label) > 65:
            label = label[:62] + "..."

        mae_str = f"{row['mae']:.4f}" if row["mae"] is not None else "N/A"
        bias_str = f"{row['bias']:+.4f}" if row["bias"] is not None else "N/A"
        r2_str = f"{row['r_squared']:.4f}" if row["r_squared"] is not None else "N/A"
        rmse_str = f"{row['rmse']:.4f}" if row["rmse"] is not None else "N/A"

        marker = ""
        if i == 0:
            marker = " ← BEST"

        print(f"{i + 1:>4}  {label:<65} {mae_str:>8} {bias_str:>8} {r2_str:>8} {rmse_str:>8}{marker}")

    # === Detailed breakdown for top N ===
    top_n = min(args.top, len(ranked))
    print(f"\n\n{'=' * 100}")
    print(f"DETAILED BREAKDOWN — Top {top_n} Combinations")
    print(f"{'=' * 100}")

    for i, row in enumerate(ranked[:top_n]):
        label = "weighted_ppg"
        if row["features"]:
            label += " + " + " + ".join(row["features"])
        else:
            label += " (base only)"

        print(f"\n  #{i + 1}: {label}")
        print(f"  {'Position':<10} {'MAE':>8} {'Bias':>8} {'R²':>8} {'RMSE':>8}")
        print(f"  {'-' * 46}")

        for pos in ["ALL"] + list(POSITIONS):
            mae = _weighted_avg(row["results"], pos, "mae")
            bias = _weighted_avg(row["results"], pos, "bias")
            r_sq = _weighted_avg(row["results"], pos, "r_squared")
            rmse = _weighted_avg(row["results"], pos, "rmse")
            if mae is not None:
                print(
                    f"  {pos:<10} {mae:>8.4f} {bias:>+8.4f} {r_sq:>8.4f} {rmse:>8.4f}"
                )

    # === Per-position ranking (--by-position) ===
    if args.by_position:
        # Find v8 combo (all 6 features) for comparison baseline
        v8_features = set(ADJUSTMENT_FEATURES)
        v8_row = None
        for row in ranked:
            if set(row["features"]) == v8_features:
                v8_row = row
                break

        print(f"\n\n{'=' * 100}")
        print("PER-POSITION BEST COMBOS")
        print(f"{'=' * 100}\n")

        # Summary table
        header = f"{'Position':<6}  {'Best Combo':<60} {'MAE':>8} {'R²':>8} {'vs v8 MAE':>10}"
        print(header)
        print("-" * len(header))

        for pos in POSITIONS:
            # Rank combos by this position's weighted-average MAE
            pos_ranked = []
            for adj_features_item, results in combo_results:
                mae = _weighted_avg(results, pos, "mae")
                r_sq = _weighted_avg(results, pos, "r_squared")
                if mae is not None:
                    pos_ranked.append({
                        "features": adj_features_item,
                        "mae": mae,
                        "r_squared": r_sq,
                        "results": results,
                    })
            pos_ranked.sort(key=lambda x: x["mae"])

            if not pos_ranked:
                continue

            best = pos_ranked[0]
            label = "weighted_ppg"
            if best["features"]:
                label += " + " + " + ".join(best["features"])
            else:
                label += " (base only)"
            if len(label) > 60:
                label = label[:57] + "..."

            mae_str = f"{best['mae']:.4f}"
            r2_str = f"{best['r_squared']:.4f}" if best["r_squared"] is not None else "N/A"

            v8_mae = _weighted_avg(v8_row["results"], pos, "mae") if v8_row else None
            if v8_mae is not None:
                diff = best["mae"] - v8_mae
                vs_v8_str = f"{diff:+.4f}"
            else:
                vs_v8_str = "N/A"

            print(f"{pos:<6}  {label:<60} {mae_str:>8} {r2_str:>8} {vs_v8_str:>10}")

        # Detailed top-3 per position
        print(f"\n\n{'=' * 100}")
        print("PER-POSITION TOP 3 DETAIL")
        print(f"{'=' * 100}")

        for pos in POSITIONS:
            pos_ranked = []
            for adj_features_item, results in combo_results:
                mae = _weighted_avg(results, pos, "mae")
                r_sq = _weighted_avg(results, pos, "r_squared")
                bias = _weighted_avg(results, pos, "bias")
                rmse = _weighted_avg(results, pos, "rmse")
                if mae is not None:
                    pos_ranked.append({
                        "features": adj_features_item,
                        "mae": mae,
                        "r_squared": r_sq,
                        "bias": bias,
                        "rmse": rmse,
                    })
            pos_ranked.sort(key=lambda x: x["mae"])

            if not pos_ranked:
                continue

            v8_mae = _weighted_avg(v8_row["results"], pos, "mae") if v8_row else None

            print(f"\n  {pos} (v8 MAE: {v8_mae:.4f})" if v8_mae else f"\n  {pos}")
            print(f"  {'Rank':>4}  {'Features':<55} {'MAE':>8} {'Bias':>8} {'R²':>8} {'RMSE':>8}")
            print(f"  {'-' * 96}")

            for i, row in enumerate(pos_ranked[:3]):
                label = "weighted_ppg"
                if row["features"]:
                    label += " + " + " + ".join(row["features"])
                else:
                    label += " (base only)"
                if len(label) > 55:
                    label = label[:52] + "..."

                mae_str = f"{row['mae']:.4f}"
                bias_str = f"{row['bias']:+.4f}" if row["bias"] is not None else "N/A"
                r2_str = f"{row['r_squared']:.4f}" if row["r_squared"] is not None else "N/A"
                rmse_str = f"{row['rmse']:.4f}" if row["rmse"] is not None else "N/A"

                marker = " ← BEST" if i == 0 else ""
                print(f"  {i + 1:>4}  {label:<55} {mae_str:>8} {bias_str:>8} {r2_str:>8} {rmse_str:>8}{marker}")

    print(f"\n\nDone. Tested {len(combos)} combinations across {len(seasons)} seasons.")
    if ranked:
        best = ranked[0]
        best_label = "weighted_ppg"
        if best["features"]:
            best_label += " + " + " + ".join(best["features"])
        else:
            best_label += " (base only)"
        print(f"\nBEST COMBO: {best_label}")
        print(f"  ALL MAE: {best['mae']:.4f}, R²: {best['r_squared']:.4f}")


if __name__ == "__main__":
    main()
