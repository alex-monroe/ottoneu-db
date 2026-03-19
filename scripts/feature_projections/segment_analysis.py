"""Segmented projection accuracy analysis: identify where models systematically struggle.

Computes MAE/Bias/R²/N broken down by player segments (experience, availability,
performance tier, age bucket, YoY change, error direction) across multiple models
and seasons.

Usage:
    python scripts/feature_projections/segment_analysis.py [--models M1,M2] [--seasons S1,S2] [--segments SEG1,SEG2] [--output PATH]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import date, datetime

script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
repo_root = os.path.dirname(script_dir)
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from config import get_supabase_client, POSITIONS, MIN_GAMES
from scripts.feature_projections.backtest import _compute_metrics

# Default models and seasons
DEFAULT_MODELS = "v1_baseline_weighted_ppg,v8_age_regression,external_fantasypros_v1"
DEFAULT_SEASONS = "2022,2023,2024,2025"

# Segment definitions: name -> description
SEGMENT_DEFS = {
    "experience": "Player NFL experience level",
    "availability": "Games played in the season",
    "performance_tier": "Rank by actual PPG within position",
    "age_bucket": "Player age at season start",
    "yoy_change": "Year-over-year PPG change",
    "error_direction": "Direction and magnitude of projection error",
}


def _player_age_sept1(birth_date_str: str | None, season: int) -> int | None:
    """Calculate player age on Sept 1 of the given season."""
    if not birth_date_str:
        return None
    try:
        bd = datetime.strptime(str(birth_date_str)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None
    sept1 = date(season, 9, 1)
    return sept1.year - bd.year - ((sept1.month, sept1.day) < (bd.month, bd.day))


def _assign_experience(prior_seasons: int) -> str:
    """Classify experience: rookie (0-1), young (2-3), veteran (4+)."""
    if prior_seasons <= 1:
        return "rookie"
    elif prior_seasons <= 3:
        return "young"
    return "veteran"


def _assign_availability(games_played: int) -> str:
    """Classify availability: full (15+), partial (10-14), limited (<10)."""
    if games_played >= 15:
        return "full"
    elif games_played >= 10:
        return "partial"
    return "limited"


def _assign_performance_tier(position_rank: int) -> str:
    """Classify performance tier by position rank: elite (1-12), starter (13-24), bench (25+)."""
    if position_rank <= 12:
        return "elite"
    elif position_rank <= 24:
        return "starter"
    return "bench"


def _assign_age_bucket(age: int | None) -> str:
    """Classify age: young (<25), prime (25-29), aging (30+)."""
    if age is None:
        return "unknown"
    if age < 25:
        return "young"
    elif age < 30:
        return "prime"
    return "aging"


def _assign_yoy_change(actual_ppg: float, prior_ppg: float | None) -> str:
    """Classify YoY change: improver (>+2), stable, decliner (<-2), new."""
    if prior_ppg is None:
        return "new"
    diff = actual_ppg - prior_ppg
    if diff > 2:
        return "improver"
    elif diff < -2:
        return "decliner"
    return "stable"


def _assign_error_direction(error: float) -> str:
    """Classify error: under_projected (>+2), accurate (|err|<=2), over_projected (<-2)."""
    if error > 2:
        return "under_projected"
    elif error < -2:
        return "over_projected"
    return "accurate"


def _compute_position_ranks(
    actuals: dict[str, dict], player_info: dict[str, dict]
) -> dict[str, int]:
    """Rank players within position by actual PPG. Returns {player_id: rank}."""
    by_pos: dict[str, list[tuple[str, float]]] = {}
    for pid, act in actuals.items():
        pos = player_info.get(pid, {}).get("position", "?")
        by_pos.setdefault(pos, []).append((pid, act["ppg"]))

    ranks: dict[str, int] = {}
    for pos, players in by_pos.items():
        players.sort(key=lambda x: x[1], reverse=True)
        for rank, (pid, _) in enumerate(players, 1):
            ranks[pid] = rank
    return ranks


def run_segment_analysis(
    model_names: list[str],
    seasons: list[int],
    segments: list[str] | None = None,
    min_games: int = MIN_GAMES,
) -> dict[str, list[dict]]:
    """Run segmented accuracy analysis across models and seasons.

    Returns: {segment_name: [{"segment_value": ..., "model": ..., "mae": ..., "bias": ..., "r_squared": ..., "n": ...}, ...]}
    """
    active_segments = segments or list(SEGMENT_DEFS.keys())
    supabase = get_supabase_client()

    # Look up model IDs
    model_res = supabase.table("projection_models").select("id, name").execute()
    model_id_map = {row["name"]: row["id"] for row in (model_res.data or [])}
    for mn in model_names:
        if mn not in model_id_map:
            raise ValueError(f"Model '{mn}' not found in projection_models table")

    # Fetch player info (once)
    players_res = supabase.table("players").select("id, name, position, birth_date").execute()
    player_info = {row["id"]: row for row in (players_res.data or [])}

    # Collect tagged records: list of dicts with segment values + projected/actual
    # keyed by (segment_name) -> (segment_value, model) -> lists of (projected, actual)
    segment_data: dict[str, dict[tuple[str, str], tuple[list[float], list[float]]]] = {
        seg: {} for seg in active_segments
    }

    for season in seasons:
        # Fetch actuals for this season
        actuals_res = (
            supabase.table("player_stats")
            .select("player_id, ppg, games_played")
            .eq("season", season)
            .execute()
        )
        actual_map = {
            row["player_id"]: {
                "ppg": float(row["ppg"]),
                "games_played": int(row.get("games_played", 0) or 0),
            }
            for row in (actuals_res.data or [])
        }

        # Count prior seasons per player
        prior_stats_res = (
            supabase.table("player_stats")
            .select("player_id, season")
            .lt("season", season)
            .execute()
        )
        prior_seasons_count: dict[str, int] = {}
        for row in (prior_stats_res.data or []):
            pid = row["player_id"]
            prior_seasons_count[pid] = prior_seasons_count.get(pid, 0) + 1

        # Fetch prior season PPG for YoY change
        prior_ppg_res = (
            supabase.table("player_stats")
            .select("player_id, ppg")
            .eq("season", season - 1)
            .execute()
        )
        prior_ppg_map = {
            row["player_id"]: float(row["ppg"])
            for row in (prior_ppg_res.data or [])
        }

        # Position ranks by actual PPG
        position_ranks = _compute_position_ranks(actual_map, player_info)

        for model_name in model_names:
            model_id = model_id_map[model_name]

            # Fetch projections
            proj_res = (
                supabase.table("model_projections")
                .select("player_id, projected_ppg")
                .eq("model_id", model_id)
                .eq("season", season)
                .execute()
            )
            proj_map = {
                row["player_id"]: float(row["projected_ppg"])
                for row in (proj_res.data or [])
            }

            # Match projected to actual
            for pid, projected_ppg in proj_map.items():
                if pid not in actual_map:
                    continue
                act = actual_map[pid]
                if act["games_played"] < min_games:
                    continue

                actual_ppg = act["ppg"]
                error = actual_ppg - projected_ppg
                info = player_info.get(pid, {})
                age = _player_age_sept1(info.get("birth_date"), season)

                # Compute segment values
                seg_values: dict[str, str] = {}
                if "experience" in active_segments:
                    seg_values["experience"] = _assign_experience(prior_seasons_count.get(pid, 0))
                if "availability" in active_segments:
                    seg_values["availability"] = _assign_availability(act["games_played"])
                if "performance_tier" in active_segments:
                    seg_values["performance_tier"] = _assign_performance_tier(position_ranks.get(pid, 999))
                if "age_bucket" in active_segments:
                    seg_values["age_bucket"] = _assign_age_bucket(age)
                if "yoy_change" in active_segments:
                    seg_values["yoy_change"] = _assign_yoy_change(actual_ppg, prior_ppg_map.get(pid))
                if "error_direction" in active_segments:
                    seg_values["error_direction"] = _assign_error_direction(error)

                # Append to segment data
                for seg_name, seg_value in seg_values.items():
                    key = (seg_value, model_name)
                    if key not in segment_data[seg_name]:
                        segment_data[seg_name][key] = ([], [])
                    segment_data[seg_name][key][0].append(projected_ppg)
                    segment_data[seg_name][key][1].append(actual_ppg)

    # Compute metrics per (segment_value, model)
    results: dict[str, list[dict]] = {}
    for seg_name in active_segments:
        rows = []
        for (seg_value, model_name), (proj_list, act_list) in segment_data[seg_name].items():
            metrics = _compute_metrics(proj_list, act_list)
            rows.append({
                "segment_value": seg_value,
                "model": model_name,
                "mae": metrics["mae"],
                "bias": metrics["bias"],
                "r_squared": metrics["r_squared"],
                "n": metrics["player_count"],
            })
        # Sort by segment value, then model
        rows.sort(key=lambda r: (r["segment_value"], r["model"]))
        results[seg_name] = rows

    return results


def format_segment_markdown(
    results: dict[str, list[dict]],
    model_names: list[str],
    seasons: list[int],
) -> str:
    """Format segment analysis results as a markdown report."""
    lines: list[str] = []
    lines.append("# Segmented Projection Accuracy Analysis\n")
    lines.append(f"_Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}_\n")
    lines.append(f"**Models:** {', '.join(f'`{m}`' for m in model_names)}  ")
    lines.append(f"**Seasons:** {', '.join(str(s) for s in seasons)}  ")
    lines.append(f"**Min games:** {MIN_GAMES}\n")

    for seg_name, rows in results.items():
        if not rows:
            continue

        title = SEGMENT_DEFS.get(seg_name, seg_name).title()
        lines.append(f"## {title}\n")
        lines.append("| Segment | Model | MAE | Bias | R² | N |")
        lines.append("| --- | --- | ---: | ---: | ---: | ---: |")

        for row in rows:
            r2 = f"{row['r_squared']:.3f}" if row["r_squared"] is not None and row["n"] >= 10 else "--"
            mae = f"{row['mae']:.3f}" if row["mae"] is not None else "--"
            bias = f"{row['bias']:+.3f}" if row["bias"] is not None else "--"
            lines.append(
                f"| {row['segment_value']} | `{row['model']}` | {mae} | {bias} | {r2} | {row['n']} |"
            )
        lines.append("")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Segmented projection accuracy analysis")
    parser.add_argument(
        "--models",
        default=DEFAULT_MODELS,
        help=f"Comma-separated model names (default: {DEFAULT_MODELS})",
    )
    parser.add_argument(
        "--seasons",
        default=DEFAULT_SEASONS,
        help=f"Comma-separated seasons (default: {DEFAULT_SEASONS})",
    )
    parser.add_argument(
        "--segments",
        default=None,
        help="Comma-separated segments to compute (default: all)",
    )
    parser.add_argument(
        "--output",
        default=os.path.join(repo_root, "docs", "generated", "segment-analysis.md"),
        help="Output file path (default: docs/generated/segment-analysis.md)",
    )
    args = parser.parse_args()

    model_names = [m.strip() for m in args.models.split(",")]
    seasons = [int(s.strip()) for s in args.seasons.split(",")]
    segments = [s.strip() for s in args.segments.split(",")] if args.segments else None

    print(f"Models: {model_names}")
    print(f"Seasons: {seasons}")
    print(f"Segments: {segments or 'all'}")

    results = run_segment_analysis(model_names, seasons, segments)

    report = format_segment_markdown(results, model_names, seasons)

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        f.write(report)
    print(f"\nReport written to: {args.output}")

    # Print summary to stdout
    for seg_name, rows in results.items():
        print(f"\n{'=' * 60}")
        print(f"  {seg_name.upper()}")
        print(f"{'=' * 60}")
        print(f"  {'Segment':<20} {'Model':<40} {'MAE':>6} {'Bias':>7} {'R²':>6} {'N':>5}")
        print(f"  {'-' * 80}")
        for row in rows:
            r2 = f"{row['r_squared']:.3f}" if row["r_squared"] is not None and row["n"] >= 10 else "   --"
            mae = f"{row['mae']:.3f}" if row["mae"] is not None else "   --"
            bias = f"{row['bias']:+.3f}" if row["bias"] is not None else "   --"
            print(f"  {row['segment_value']:<20} {row['model']:<40} {mae:>6} {bias:>7} {r2:>6} {row['n']:>5}")


if __name__ == "__main__":
    main()
