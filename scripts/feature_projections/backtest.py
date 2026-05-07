"""Backtesting framework: compare projections to actuals, compute accuracy metrics."""

from __future__ import annotations

import json
import math
import os
import sys

import pandas as pd

script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

from config import get_supabase_client, fetch_all_rows, POSITIONS, MIN_GAMES


def _compute_metrics(projected: list[float], actual: list[float]) -> dict:
    """Compute MAE, Bias, R², RMSE from paired lists."""
    n = len(projected)
    if n == 0:
        return {"mae": None, "bias": None, "r_squared": None, "rmse": None, "player_count": 0}

    errors = [a - p for a, p in zip(actual, projected)]
    abs_errors = [abs(e) for e in errors]

    mae = sum(abs_errors) / n
    bias = sum(errors) / n
    rmse = math.sqrt(sum(e**2 for e in errors) / n)

    # R²
    mean_actual = sum(actual) / n
    ss_res = sum((a - p) ** 2 for a, p in zip(actual, projected))
    ss_tot = sum((a - mean_actual) ** 2 for a in actual)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else None

    return {
        "mae": round(mae, 4),
        "bias": round(bias, 4),
        "r_squared": round(r_squared, 4) if r_squared is not None else None,
        "rmse": round(rmse, 4),
        "player_count": n,
    }


def backtest_model(
    model_name: str,
    test_seasons: list[int],
    min_games: int = MIN_GAMES,
) -> dict:
    """Run backtest for a model: compare its projections to actual PPG.

    Returns dict of {season: {position: metrics}}.
    """
    supabase = get_supabase_client()

    # Look up model
    model_res = (
        supabase.table("projection_models")
        .select("id, name")
        .eq("name", model_name)
        .execute()
    )
    if not model_res.data:
        raise ValueError(f"Model '{model_name}' not found in projection_models table")

    model_id = model_res.data[0]["id"]

    # Fetch players for position mapping
    players_data = fetch_all_rows(supabase, "players", "id, position")
    pos_map = {row["id"]: row["position"] for row in players_data}

    # Fetch all qualifying player_stats rows once. Used to identify "true
    # rookies" (no prior NFL games) so they can be excluded from accuracy —
    # the rookie projection path is the same across all models, so including
    # them would only add shared noise to cross-model comparisons.
    all_stats = fetch_all_rows(
        supabase, "player_stats", "player_id, games_played, season"
    )

    all_results = {}

    for season in test_seasons:
        print(f"\nBacktesting model '{model_name}' for season {season}...")

        # Fetch model projections for this season
        proj_res = (
            supabase.table("model_projections")
            .select("player_id, projected_ppg")
            .eq("model_id", model_id)
            .eq("season", season)
            .execute()
        )
        if not proj_res.data:
            print(f"  No projections found for season {season}")
            continue

        proj_map = {row["player_id"]: float(row["projected_ppg"]) for row in proj_res.data}

        # Fetch actuals from player_stats
        actuals_res = (
            supabase.table("player_stats")
            .select("player_id, ppg, games_played")
            .eq("season", season)
            .execute()
        )
        if not actuals_res.data:
            print(f"  No actual stats found for season {season}")
            continue

        # Players with at least one qualifying NFL season prior to this one.
        # Excludes true rookies from accuracy (see comment near all_stats fetch).
        had_prior_stats: set[str] = {
            r["player_id"]
            for r in all_stats
            if r.get("season") is not None
            and int(r["season"]) < int(season)
            and (r.get("games_played") or 0) > 0
        }

        # Build paired data by position
        position_data: dict[str, tuple[list[float], list[float]]] = {
            pos: ([], []) for pos in POSITIONS
        }
        all_projected: list[float] = []
        all_actual: list[float] = []
        rookies_skipped = 0

        for row in actuals_res.data:
            pid = row["player_id"]
            games = int(row.get("games_played", 0) or 0)
            if games < min_games:
                continue
            if pid not in proj_map:
                continue
            if pid not in had_prior_stats:
                rookies_skipped += 1
                continue

            actual_ppg = float(row["ppg"])
            projected_ppg = proj_map[pid]
            position = pos_map.get(pid)

            all_projected.append(projected_ppg)
            all_actual.append(actual_ppg)

            if position and position in position_data:
                position_data[position][0].append(projected_ppg)
                position_data[position][1].append(actual_ppg)

        if rookies_skipped:
            print(f"  Excluded {rookies_skipped} true-rookie player(s) from accuracy")

        # Compute metrics
        season_results = {}

        # Overall
        overall = _compute_metrics(all_projected, all_actual)
        season_results["ALL"] = overall
        print(f"  ALL: MAE={overall['mae']}, Bias={overall['bias']}, R²={overall['r_squared']}, n={overall['player_count']}")

        # By position
        for pos in POSITIONS:
            proj_list, act_list = position_data[pos]
            if proj_list:
                metrics = _compute_metrics(proj_list, act_list)
                season_results[pos] = metrics
                print(f"  {pos}: MAE={metrics['mae']}, Bias={metrics['bias']}, R²={metrics['r_squared']}, n={metrics['player_count']}")

        all_results[season] = season_results

        # Store in backtest_results table
        records = []
        for position, metrics in season_results.items():
            records.append({
                "model_id": model_id,
                "season": season,
                "position": position if position != "ALL" else None,
                "player_count": metrics["player_count"],
                "mae": metrics["mae"],
                "bias": metrics["bias"],
                "r_squared": metrics["r_squared"],
                "rmse": metrics["rmse"],
            })

        if records:
            # Delete all existing results for this model/season, then insert fresh
            supabase.table("backtest_results").delete().eq(
                "model_id", model_id
            ).eq("season", season).execute()

            supabase.table("backtest_results").insert(records).execute()
            print(f"  Stored {len(records)} backtest results")

    return all_results


def compare_models(
    model_names: list[str],
    season: int,
) -> None:
    """Print side-by-side comparison of backtest results for multiple models."""
    supabase = get_supabase_client()

    model_results = {}
    for name in model_names:
        model_res = (
            supabase.table("projection_models")
            .select("id")
            .eq("name", name)
            .execute()
        )
        if not model_res.data:
            print(f"Model '{name}' not found, skipping")
            continue

        model_id = model_res.data[0]["id"]
        bt_res = (
            supabase.table("backtest_results")
            .select("*")
            .eq("model_id", model_id)
            .eq("season", season)
            .execute()
        )
        model_results[name] = {
            (row.get("position") or "ALL"): row for row in (bt_res.data or [])
        }

    if not model_results:
        print("No results to compare.")
        return

    # Print comparison table
    positions = ["ALL"] + POSITIONS
    metrics = ["mae", "bias", "r_squared", "rmse", "player_count"]

    print(f"\n{'=' * 80}")
    print(f"Model Comparison — Season {season}")
    print(f"{'=' * 80}")

    for pos in positions:
        print(f"\n  {pos}:")
        header = f"    {'Metric':<15}"
        for name in model_names:
            header += f" {name:>25}"
        if len(model_names) == 2:
            header += f" {'Delta':>12}"
        print(header)
        print(f"    {'-' * (15 + 25 * len(model_names) + (12 if len(model_names) == 2 else 0))}")

        for metric in metrics:
            row_str = f"    {metric:<15}"
            values = []
            for name in model_names:
                val = model_results.get(name, {}).get(pos, {}).get(metric)
                if val is not None:
                    row_str += f" {val:>25.4f}" if isinstance(val, float) else f" {val:>25}"
                    values.append(val)
                else:
                    row_str += f" {'N/A':>25}"
                    values.append(None)

            if len(model_names) == 2 and all(v is not None for v in values):
                delta = values[1] - values[0]
                sign = "+" if delta >= 0 else ""
                row_str += f" {sign}{delta:>10.4f}" if isinstance(delta, float) else f" {sign}{delta:>10}"
            print(row_str)
