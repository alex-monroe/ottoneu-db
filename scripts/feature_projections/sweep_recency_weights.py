"""Sweep the WeightedPPG base feature's hyperparameters (GH #271, #589).

Grid-searches the two real knobs of the production base feature
(``weighted_ppg_no_qb_trajectory`` — every model since v12 uses the no-QB/K
trajectory base):

- **Recency weights** — the 3-season blend, most recent first.
- **Games-reliability exponent** — the per-season reliability factor is
  ``(games_played / 17) ** exponent``; >1.0 down-weights partial seasons
  harder (v28 tried 1.5 at the model level, judged on leaked data).

Each (weights, exponent) cell scores the *isolated* base feature against
next-season actuals. Tuning runs on the **inner folds** (default
2022,2023,2024) by design — the confirmation window (2025) is held back for a
single confirmatory look per accepted variant (honest tuning protocol,
GH #595). Pointing ``--seasons`` at the confirmation window prints a loud
warning. A winning cell must then be wired into a model variant and pass
``just significance <variant> <active-model>`` on the rolling protocol before
adoption — the sweep alone is never the gate.

Usage:
    python scripts/feature_projections/sweep_recency_weights.py \
        [--seasons 2022,2023,2024] [--exponents 1.0,1.25,1.5,2.0]
"""

from __future__ import annotations

import argparse
import math
from typing import Any

import pandas as pd

from scripts.config import get_supabase_client, fetch_all_rows, POSITIONS, MIN_GAMES
from scripts.analysis_utils import fetch_multi_season_stats
from scripts.feature_projections.tuning_protocol import (
    inner_tuning_seasons_str,
    warn_on_confirmation_overlap,
)
from scripts.feature_projections.features.weighted_ppg import (
    WeightedPPGFeature,
    WeightedPPGNoQBTrajectoryFeature,
)

# Weight variants to test (most recent season first). The production value is
# read from the feature class so the "(current)" marker can never go stale.
CURRENT_WEIGHTS = list(WeightedPPGFeature.RECENCY_WEIGHTS)
CURRENT_EXPONENT = float(WeightedPPGFeature.GAMES_RELIABILITY_EXPONENT)

WEIGHT_VARIANTS = [
    CURRENT_WEIGHTS,     # production baseline [0.55, 0.25, 0.20]
    [0.34, 0.33, 0.33],  # flat — no recency signal at all
    [0.45, 0.30, 0.25],  # flatter than current
    [0.50, 0.30, 0.20],
    [0.55, 0.30, 0.15],
    [0.60, 0.25, 0.15],
    [0.65, 0.20, 0.15],
    [0.60, 0.30, 0.10],
    [0.70, 0.20, 0.10],
    [0.80, 0.15, 0.05],  # near prior-season-only
]

DEFAULT_EXPONENTS = [1.0, 1.25, 1.5, 2.0]


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


def _fetch_season_data(
    seasons: list[int],
    max_history: int = 3,
) -> tuple[dict[str, str], dict[int, pd.DataFrame], dict[int, dict[str, float]]]:
    """Fetch everything the sweep needs once, so the grid loop is in-memory only.

    Returns (position map, {season: history_df}, {season: {player_id: actual_ppg}}).
    """
    supabase = get_supabase_client()

    players_data = fetch_all_rows(supabase, "players", "id, position")
    pos_map = {row["id"]: row["position"] for row in players_data}

    history_by_season: dict[int, pd.DataFrame] = {}
    actuals_by_season: dict[int, dict[str, float]] = {}

    for target_season in seasons:
        historical_seasons = list(range(target_season - max_history, target_season))
        history_df = fetch_multi_season_stats(historical_seasons)
        if history_df.empty:
            continue
        history_by_season[target_season] = history_df

        actuals_res = (
            supabase.table("player_stats")
            .select("player_id, ppg, games_played")
            .eq("season", target_season)
            .execute()
        )
        actual_map = {}
        for row in actuals_res.data or []:
            games = int(row.get("games_played", 0) or 0)
            if games >= MIN_GAMES:
                actual_map[row["player_id"]] = float(row["ppg"])
        actuals_by_season[target_season] = actual_map

    return pos_map, history_by_season, actuals_by_season


def _run_projections(
    weights: list[float],
    exponent: float,
    seasons: list[int],
    pos_map: dict[str, str],
    history_by_season: dict[int, pd.DataFrame],
    actuals_by_season: dict[int, dict[str, float]],
) -> dict[int, dict[str, dict]]:
    """Score one (weights, exponent) cell of the isolated base feature.

    Returns: {season: {"ALL": metrics, "QB": metrics, ...}}
    """
    # Patch the parent class attributes; the no-QB subclass inherits both.
    WeightedPPGFeature.RECENCY_WEIGHTS = weights
    WeightedPPGFeature.GAMES_RELIABILITY_EXPONENT = exponent
    feature = WeightedPPGNoQBTrajectoryFeature()

    all_results: dict[int, dict[str, dict]] = {}

    for target_season in seasons:
        history_df = history_by_season.get(target_season)
        actual_map = actuals_by_season.get(target_season)
        if history_df is None or not actual_map:
            continue

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
    parser = argparse.ArgumentParser(
        description="Sweep WeightedPPG base hyperparameters (recency weights × reliability exponent)"
    )
    parser.add_argument(
        "--seasons",
        default=inner_tuning_seasons_str(),
        help=f"Comma-separated target seasons (default: {inner_tuning_seasons_str()} — "
             "the inner tuning folds; the confirmation window is excluded, GH #595)",
    )
    parser.add_argument(
        "--exponents",
        default=",".join(str(e) for e in DEFAULT_EXPONENTS),
        help="Comma-separated games-reliability exponents to grid over "
             f"(default: {','.join(str(e) for e in DEFAULT_EXPONENTS)})",
    )
    args = parser.parse_args()
    seasons = [int(s.strip()) for s in args.seasons.split(",")]
    exponents = [float(e.strip()) for e in args.exponents.split(",")]
    warn_on_confirmation_overlap(seasons)

    print(
        f"Grid: {len(WEIGHT_VARIANTS)} weight variants × {len(exponents)} exponents "
        f"across seasons {seasons} (base: weighted_ppg_no_qb_trajectory)\n"
    )

    print("Fetching season data once for the whole grid...")
    pos_map, history_by_season, actuals_by_season = _fetch_season_data(seasons)

    grid_results: list[tuple[list[float], float, dict[int, dict[str, dict]]]] = []

    for weights in WEIGHT_VARIANTS:
        for exponent in exponents:
            results = _run_projections(
                weights, exponent, seasons, pos_map, history_by_season, actuals_by_season
            )
            grid_results.append((weights, exponent, results))

    # === Summary comparison table ===
    print(f"\n{'='*88}")
    print("SUMMARY — Weighted Average Across All Seasons (ALL positions)")
    print(f"{'='*88}\n")

    header = f"{'Weights':<22} {'Exp':>5} {'MAE':>8} {'Bias':>8} {'R²':>8} {'RMSE':>8}"
    print(header)
    print("-" * len(header))

    best_mae = float("inf")
    best_cell: tuple[list[float], float] | None = None

    for weights, exponent, results in grid_results:
        label = f"[{', '.join(f'{w:.2f}' for w in weights)}]"
        mae = _weighted_avg(results, "ALL", "mae")
        bias = _weighted_avg(results, "ALL", "bias")
        r_sq = _weighted_avg(results, "ALL", "r_squared")
        rmse = _weighted_avg(results, "ALL", "rmse")
        if mae is None:
            continue

        marker = ""
        if weights == CURRENT_WEIGHTS and exponent == CURRENT_EXPONENT:
            marker = " (current)"
        if mae < best_mae:
            best_mae = mae
            best_cell = (weights, exponent)

        print(
            f"{label:<22} {exponent:>5.2f} {mae:>8.4f} {bias:>+8.4f} {r_sq:>8.4f} {rmse:>8.4f}{marker}"
        )

    print()

    # Per-position breakdown for best cell
    if best_cell:
        best_weights, best_exponent = best_cell
        best_label = f"[{', '.join(f'{w:.2f}' for w in best_weights)}] exp={best_exponent}"
        print(f"BEST: {best_label} (lowest weighted MAE)")
        print()

        best_results = next(
            r for w, e, r in grid_results if w == best_weights and e == best_exponent
        )

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

    # Restore the production values patched during the sweep
    WeightedPPGFeature.RECENCY_WEIGHTS = CURRENT_WEIGHTS
    WeightedPPGFeature.GAMES_RELIABILITY_EXPONENT = CURRENT_EXPONENT


if __name__ == "__main__":
    main()
