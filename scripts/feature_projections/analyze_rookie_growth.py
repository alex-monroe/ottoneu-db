"""Compute position-specific rookie growth constants from historical data.

Identifies rookies (players with exactly 1 season at time T), pairs their
year-1 PPG with year-2 PPG, and computes per-position growth ratios and
mean rookie PPG for small-sample blending.

Usage:
    venv/bin/python scripts/feature_projections/analyze_rookie_growth.py [--seasons 2019,2020,2021,2022,2023,2024,2025]
    venv/bin/python scripts/feature_projections/analyze_rookie_growth.py --positions QB,WR,RB,TE
"""

from __future__ import annotations

import argparse
import os
import statistics
import sys
from collections import defaultdict

# Setup paths
script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
repo_root = os.path.dirname(script_dir)
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from config import get_supabase_client, fetch_all_rows, MIN_GAMES


def compute_rookie_growth_ratios(
    seasons: list[int],
    min_games: int = MIN_GAMES,
    positions: list[str] | None = None,
) -> dict[str, dict[str, float]]:
    """Compute rookie-to-year-2 growth ratios by position.

    For each target season T in `seasons`:
    - A "rookie" is a player whose first appearance in player_stats is season T-1
      (i.e., they have exactly 1 season of history at projection time T).
    - We pair their year-1 PPG (season T-1) with year-2 PPG (season T).
    - Both seasons must have >= min_games.

    Returns: {position: {"growth_ratio": median, "mean_ratio": mean,
                          "rookie_mean_ppg": mean year-1 PPG, "n": count}}
    """
    supabase = get_supabase_client()

    # Fetch all player_stats
    all_seasons = list(range(min(seasons) - 1, max(seasons) + 1))
    print(f"Fetching player_stats for seasons {all_seasons[0]}-{all_seasons[-1]}...")

    stats_res = (
        supabase.table("player_stats")
        .select("player_id, season, ppg, games_played")
        .gte("season", all_seasons[0])
        .lte("season", all_seasons[-1])
        .execute()
    )

    # Fetch player positions
    players_data = fetch_all_rows(supabase, "players", "id, position")
    pos_map = {row["id"]: row["position"] for row in players_data}

    # Organize stats by player
    player_seasons: dict[str, dict[int, dict]] = defaultdict(dict)
    for row in (stats_res.data or []):
        pid = row["player_id"]
        season = int(row["season"])
        player_seasons[pid][season] = row

    # Find rookie pairs: for each target season T, find players whose
    # first season in player_stats is T-1 (making them a "rookie" at time T)
    pairs: dict[str, list[tuple[float, float]]] = defaultdict(list)  # position -> [(y1_ppg, y2_ppg)]
    rookie_ppgs: dict[str, list[float]] = defaultdict(list)  # position -> [y1_ppg]

    for target_season in seasons:
        rookie_season = target_season - 1

        for pid, seasons_data in player_seasons.items():
            position = pos_map.get(pid)
            if not position:
                continue
            if positions and position not in positions:
                continue

            # Check if rookie_season is their first season
            player_season_list = sorted(seasons_data.keys())
            if not player_season_list or player_season_list[0] != rookie_season:
                continue
            # Must have exactly 1 season before target_season
            seasons_before_target = [s for s in player_season_list if s < target_season]
            if len(seasons_before_target) != 1:
                continue

            y1_data = seasons_data.get(rookie_season)
            y2_data = seasons_data.get(target_season)

            if not y1_data or not y2_data:
                continue

            y1_games = int(y1_data.get("games_played", 0) or 0)
            y2_games = int(y2_data.get("games_played", 0) or 0)

            if y1_games < min_games or y2_games < min_games:
                continue

            y1_ppg = float(y1_data["ppg"])
            y2_ppg = float(y2_data["ppg"])

            if y1_ppg <= 0:
                continue

            ratio = y2_ppg / y1_ppg
            pairs[position].append((y1_ppg, y2_ppg))
            rookie_ppgs[position].append(y1_ppg)

    # Compute per-position stats
    results: dict[str, dict[str, float]] = {}
    for position in sorted(pairs.keys()):
        position_pairs = pairs[position]
        ratios = [y2 / y1 for y1, y2 in position_pairs]
        y1_ppgs = rookie_ppgs[position]

        results[position] = {
            "growth_ratio": round(statistics.median(ratios), 3),
            "mean_ratio": round(statistics.mean(ratios), 3),
            "rookie_mean_ppg": round(statistics.mean(y1_ppgs), 2),
            "rookie_median_ppg": round(statistics.median(y1_ppgs), 2),
            "n": len(position_pairs),
        }

    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Compute rookie growth constants by position")
    parser.add_argument(
        "--seasons",
        default="2019,2020,2021,2022,2023,2024,2025",
        help="Comma-separated target seasons (default: 2019-2025)",
    )
    parser.add_argument(
        "--positions",
        default=None,
        help="Comma-separated positions to analyze (default: all)",
    )
    parser.add_argument(
        "--min-games",
        type=int,
        default=MIN_GAMES,
        help=f"Minimum games played in both seasons (default: {MIN_GAMES})",
    )
    args = parser.parse_args()

    seasons = [int(s.strip()) for s in args.seasons.split(",")]
    positions = [p.strip().upper() for p in args.positions.split(",")] if args.positions else None

    print(f"Computing rookie growth ratios")
    print(f"Target seasons: {seasons}")
    print(f"Positions: {positions or 'all'}")
    print(f"Min games: {args.min_games}")
    print()

    results = compute_rookie_growth_ratios(seasons, args.min_games, positions)

    if not results:
        print("No rookie pairs found!")
        return

    # Display results table
    print(f"\n{'Position':<6} {'N':>5} {'Median Ratio':>13} {'Mean Ratio':>11} "
          f"{'Mean Y1 PPG':>12} {'Median Y1 PPG':>14}")
    print("-" * 70)

    for position, stats in results.items():
        print(f"{position:<6} {stats['n']:>5} {stats['growth_ratio']:>13.3f} "
              f"{stats['mean_ratio']:>11.3f} {stats['rookie_mean_ppg']:>12.2f} "
              f"{stats['rookie_median_ppg']:>14.2f}")

    # Print code snippet
    print("\n\nSuggested ROOKIE_GROWTH_CURVES for weighted_ppg.py:")
    print("-" * 60)
    print("ROOKIE_GROWTH_CURVES = {")
    for position, stats in results.items():
        print(f'    "{position}": {{"growth_ratio": {stats["growth_ratio"]}, '
              f'"rookie_mean_ppg": {stats["rookie_mean_ppg"]}}},')
    print("}")


if __name__ == "__main__":
    main()
