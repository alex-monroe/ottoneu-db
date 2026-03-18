"""Per-player backtest diagnostics: projected vs actual with error categorization.

Shows each player's projected vs actual PPG, feature contributions, and error magnitude.
Identifies the worst projections and categorizes error types (breakout, bust, injury, rookie, team change).

Usage:
    python scripts/feature_projections/diagnostics.py [--model MODEL] [--season SEASON] [--top N] [--output PATH]

Options:
    --model     Model name (default: active model from MODELS with most features)
    --season    Season to analyze (default: latest available)
    --top       Number of worst projections to highlight (default: 20)
    --output    Output file path (default: stdout + docs/generated/player-diagnostics.md)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime

# Setup paths so imports work when run directly
script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
repo_root = os.path.dirname(script_dir)
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from config import get_supabase_client, MIN_GAMES, POSITIONS
from scripts.feature_projections.model_config import MODELS


def _categorize_error(
    error: float,
    actual_ppg: float,
    projected_ppg: float,
    games_played: int,
    max_games: int,
    position: str | None,
    seasons_of_data: int,
) -> str:
    """Categorize a projection error into a failure mode.

    Categories:
        - breakout: under-projected by a large margin (actual >> projected)
        - bust: over-projected by a large margin (projected >> actual)
        - injury: player had significantly fewer games than expected
        - rookie: player had no/little prior data (1 season or less)
        - normal: error within expected range
    """
    abs_error = abs(error)

    # Injury: played fewer than 60% of max games in season
    if games_played < max_games * 0.6:
        return "injury"

    # Rookie: limited history
    if seasons_of_data <= 1:
        if error > 0:
            return "rookie_breakout"
        return "rookie_bust"

    # Large positive error = under-projected (breakout)
    if error > 3.0:
        return "breakout"

    # Large negative error = over-projected (bust)
    if error < -3.0:
        return "bust"

    return "normal"


def _get_default_model() -> str:
    """Get the model with the most features (most complete)."""
    best = max(MODELS.values(), key=lambda m: len(m.features) if m.features != ["external"] else 0)
    return best.name


def run_diagnostics(
    model_name: str,
    season: int,
    top_n: int = 20,
    min_games: int = MIN_GAMES,
) -> dict:
    """Run per-player diagnostics for a model and season.

    Returns dict with keys: players (list of dicts), summary (dict), worst (list of top_n worst).
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

    # Fetch projections with feature values
    proj_res = (
        supabase.table("model_projections")
        .select("player_id, projected_ppg, feature_values")
        .eq("model_id", model_id)
        .eq("season", season)
        .execute()
    )
    if not proj_res.data:
        raise ValueError(f"No projections found for model '{model_name}', season {season}")

    proj_map = {}
    for row in proj_res.data:
        fv = row.get("feature_values") or {}
        if isinstance(fv, str):
            fv = json.loads(fv)
        proj_map[row["player_id"]] = {
            "projected_ppg": float(row["projected_ppg"]),
            "feature_values": fv,
        }

    # Fetch actuals
    actuals_res = (
        supabase.table("player_stats")
        .select("player_id, ppg, games_played")
        .eq("season", season)
        .execute()
    )
    if not actuals_res.data:
        raise ValueError(f"No actual stats found for season {season}")

    actual_map = {
        row["player_id"]: {
            "ppg": float(row["ppg"]),
            "games_played": int(row.get("games_played", 0) or 0),
        }
        for row in actuals_res.data
    }

    # Fetch player info
    players_res = supabase.table("players").select("id, name, position, nfl_team").execute()
    player_info = {row["id"]: row for row in (players_res.data or [])}

    # Count seasons of data per player (for rookie detection)
    stats_res = (
        supabase.table("player_stats")
        .select("player_id, season")
        .lt("season", season)
        .execute()
    )
    seasons_count: dict[str, int] = {}
    for row in (stats_res.data or []):
        pid = row["player_id"]
        seasons_count[pid] = seasons_count.get(pid, 0) + 1

    # Find max games played this season (proxy for full season)
    max_games = max((a["games_played"] for a in actual_map.values()), default=17)

    # Build per-player records
    players = []
    for pid, proj in proj_map.items():
        if pid not in actual_map:
            continue
        act = actual_map[pid]
        if act["games_played"] < min_games:
            continue

        info = player_info.get(pid, {})
        projected_ppg = proj["projected_ppg"]
        actual_ppg = act["ppg"]
        error = actual_ppg - projected_ppg  # positive = under-projected
        abs_error = abs(error)

        category = _categorize_error(
            error=error,
            actual_ppg=actual_ppg,
            projected_ppg=projected_ppg,
            games_played=act["games_played"],
            max_games=max_games,
            position=info.get("position"),
            seasons_of_data=seasons_count.get(pid, 0),
        )

        players.append({
            "player_id": pid,
            "name": info.get("name", "Unknown"),
            "position": info.get("position", "?"),
            "team": info.get("nfl_team", "?"),
            "projected_ppg": round(projected_ppg, 2),
            "actual_ppg": round(actual_ppg, 2),
            "error": round(error, 2),
            "abs_error": round(abs_error, 2),
            "games_played": act["games_played"],
            "category": category,
            "feature_values": proj["feature_values"],
            "seasons_of_data": seasons_count.get(pid, 0),
        })

    # Sort by absolute error descending
    players.sort(key=lambda p: p["abs_error"], reverse=True)

    # Summary stats
    category_counts: dict[str, int] = {}
    for p in players:
        cat = p["category"]
        category_counts[cat] = category_counts.get(cat, 0) + 1

    # Position breakdown
    pos_errors: dict[str, list[float]] = {}
    for p in players:
        pos = p["position"]
        pos_errors.setdefault(pos, []).append(p["abs_error"])

    pos_summary = {
        pos: {
            "count": len(errs),
            "mean_abs_error": round(sum(errs) / len(errs), 3),
            "max_abs_error": round(max(errs), 3),
        }
        for pos, errs in pos_errors.items()
    }

    return {
        "model": model_name,
        "season": season,
        "total_players": len(players),
        "category_counts": category_counts,
        "position_summary": pos_summary,
        "players": players,
        "worst": players[:top_n],
    }


def format_markdown(results: dict, top_n: int = 20) -> str:
    """Format diagnostics results as a markdown report."""
    lines: list[str] = []
    lines.append("# Per-Player Backtest Diagnostics\n")
    lines.append(f"_Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}_\n")
    lines.append(f"**Model:** `{results['model']}`  ")
    lines.append(f"**Season:** {results['season']}  ")
    lines.append(f"**Players analyzed:** {results['total_players']}\n")

    # Error categories
    lines.append("## Error Category Summary\n")
    lines.append("| Category | Count | % |")
    lines.append("| --- | --- | --- |")
    total = results["total_players"]
    for cat, count in sorted(results["category_counts"].items(), key=lambda x: -x[1]):
        pct = round(100 * count / total, 1) if total > 0 else 0
        lines.append(f"| {cat} | {count} | {pct}% |")
    lines.append("")

    # Position summary
    lines.append("## Position Summary\n")
    lines.append("| Position | Count | Mean |Error| | Max |Error| |")
    lines.append("| --- | --- | --- | --- |")
    for pos in POSITIONS:
        ps = results["position_summary"].get(pos)
        if ps:
            lines.append(f"| {pos} | {ps['count']} | {ps['mean_abs_error']:.3f} | {ps['max_abs_error']:.3f} |")
    lines.append("")

    # Top N worst projections
    lines.append(f"## Top {top_n} Worst Projections\n")
    lines.append("| Rank | Player | Pos | Team | Projected | Actual | Error | |Error| | Category | GP | Features |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")

    for i, p in enumerate(results["worst"][:top_n], 1):
        # Format feature values compactly
        fv = p["feature_values"]
        if fv:
            feat_parts = []
            for k, v in sorted(fv.items()):
                if isinstance(v, (int, float)):
                    feat_parts.append(f"{k}={v:+.2f}" if k != "weighted_ppg" else f"{k}={v:.2f}")
                else:
                    feat_parts.append(f"{k}={v}")
            features_str = ", ".join(feat_parts)
        else:
            features_str = "—"

        sign = "+" if p["error"] >= 0 else ""
        lines.append(
            f"| {i} | {p['name']} | {p['position']} | {p['team']} | "
            f"{p['projected_ppg']:.2f} | {p['actual_ppg']:.2f} | "
            f"{sign}{p['error']:.2f} | {p['abs_error']:.2f} | "
            f"{p['category']} | {p['games_played']} | {features_str} |"
        )
    lines.append("")

    # Full player list (condensed)
    lines.append("## All Players (sorted by |Error|)\n")
    lines.append("| Player | Pos | Projected | Actual | Error | Category |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for p in results["players"]:
        sign = "+" if p["error"] >= 0 else ""
        lines.append(
            f"| {p['name']} | {p['position']} | "
            f"{p['projected_ppg']:.2f} | {p['actual_ppg']:.2f} | "
            f"{sign}{p['error']:.2f} | {p['category']} |"
        )
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Per-player backtest diagnostics")
    parser.add_argument(
        "--model",
        default=None,
        help="Model name (default: most complete model)",
    )
    parser.add_argument(
        "--season",
        default=None,
        type=int,
        help="Season to analyze (default: latest with data)",
    )
    parser.add_argument(
        "--top",
        default=20,
        type=int,
        help="Number of worst projections to highlight (default: 20)",
    )
    parser.add_argument(
        "--output",
        default=os.path.join(repo_root, "docs", "generated", "player-diagnostics.md"),
        help="Output file path (default: docs/generated/player-diagnostics.md)",
    )
    args = parser.parse_args()

    model_name = args.model or _get_default_model()
    print(f"Using model: {model_name}")

    # Determine season: use provided or find latest with projections
    if args.season:
        season = args.season
    else:
        supabase = get_supabase_client()
        model_res = (
            supabase.table("projection_models")
            .select("id")
            .eq("name", model_name)
            .execute()
        )
        if not model_res.data:
            print(f"Error: Model '{model_name}' not found")
            sys.exit(1)
        model_id = model_res.data[0]["id"]

        # Find latest season with both projections and actuals
        proj_res = (
            supabase.table("model_projections")
            .select("season")
            .eq("model_id", model_id)
            .execute()
        )
        proj_seasons = {row["season"] for row in (proj_res.data or [])}

        stats_res = supabase.table("player_stats").select("season").execute()
        stats_seasons = {row["season"] for row in (stats_res.data or [])}

        available = sorted(proj_seasons & stats_seasons, reverse=True)
        if not available:
            print("Error: No seasons found with both projections and actuals")
            sys.exit(1)
        season = available[0]

    print(f"Analyzing season: {season}")

    results = run_diagnostics(model_name, season, top_n=args.top)

    # Generate markdown
    report = format_markdown(results, top_n=args.top)

    # Write to file
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        f.write(report)
    print(f"\nReport written to: {args.output}")

    # Print summary to stdout
    print(f"\n{'=' * 70}")
    print(f"Model: {model_name} | Season: {season} | Players: {results['total_players']}")
    print(f"\nError Categories:")
    for cat, count in sorted(results["category_counts"].items(), key=lambda x: -x[1]):
        pct = round(100 * count / results["total_players"], 1)
        print(f"  {cat:20s}: {count:4d} ({pct}%)")

    print(f"\nTop {args.top} Worst Projections:")
    print(f"{'Rank':>4} {'Player':<25} {'Pos':>3} {'Proj':>6} {'Actual':>6} {'Error':>7} {'Category':<15}")
    print("-" * 70)
    for i, p in enumerate(results["worst"][:args.top], 1):
        sign = "+" if p["error"] >= 0 else ""
        print(
            f"{i:>4} {p['name']:<25} {p['position']:>3} "
            f"{p['projected_ppg']:>6.2f} {p['actual_ppg']:>6.2f} "
            f"{sign}{p['error']:>6.2f} {p['category']:<15}"
        )


if __name__ == "__main__":
    main()
