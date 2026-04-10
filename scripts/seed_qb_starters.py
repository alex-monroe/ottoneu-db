"""Seed QB starter designations from historical nfl_stats and player_stats data.

Auto-detects the primary starter for each team/season by finding the QB
with the most passing attempts (nfl_stats) or highest total points (player_stats
fallback). Results are written to data/qb_starters.json for manual review.

Usage:
    python scripts/seed_qb_starters.py                          # Seasons 2020-2025
    python scripts/seed_qb_starters.py --seasons 2023 2024 2025 # Specific seasons
    python scripts/seed_qb_starters.py --dry-run                # Print only, no write
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.config import get_supabase_client, fetch_all_rows

DEFAULT_SEASONS = list(range(2020, 2026))
OUTPUT_PATH = Path(__file__).parent.parent / "data" / "qb_starters.json"


def _seed_from_nfl_stats(
    supabase, seasons: list[int], qb_ids: set, id_to_name: dict
) -> dict[str, dict]:
    """Seed starters from nfl_stats (passing_attempts + recent_team).

    Returns {season_key: {team: {player_name, confidence, notes}}}.
    Also returns set of seasons that had data.
    """
    nfl_stats_res = (
        supabase.table("nfl_stats")
        .select("player_id, season, passing_attempts, games_played, recent_team")
        .in_("season", seasons)
        .execute()
    )
    nfl_df = pd.DataFrame(nfl_stats_res.data or [])
    if nfl_df.empty:
        return {}, set()

    for col in ["passing_attempts", "games_played", "season"]:
        nfl_df[col] = pd.to_numeric(nfl_df[col], errors="coerce").fillna(0)

    qb_stats = nfl_df[nfl_df["player_id"].isin(qb_ids)].copy()
    if qb_stats.empty:
        return {}, set()

    result = {}
    covered_seasons = set()

    for season in sorted(seasons):
        season_data = qb_stats[qb_stats["season"] == season]
        if season_data.empty:
            continue

        covered_seasons.add(season)
        season_key = str(season)
        result[season_key] = {}

        for team, team_df in season_data.groupby("recent_team"):
            if not team or pd.isna(team):
                continue
            team = str(team)

            team_total = team_df["passing_attempts"].sum()
            if team_total == 0:
                continue

            top_qb = team_df.loc[team_df["passing_attempts"].idxmax()]
            top_attempts = float(top_qb["passing_attempts"])
            share = top_attempts / team_total

            if share < 0.40:
                confidence = "competition"
                notes = f"No clear starter ({share:.0%} share)"
            elif share < 0.60:
                confidence = "competition"
                notes = f"Split duties ({share:.0%} share)"
            else:
                confidence = "locked"
                notes = f"Primary starter ({share:.0%} share)"

            player_name = id_to_name.get(top_qb["player_id"], "Unknown")
            games = int(top_qb["games_played"])

            result[season_key][team] = {
                "player_name": player_name,
                "confidence": confidence,
                "notes": f"{notes}, {games}G, {int(top_attempts)} att [nfl_stats]",
            }

    return result, covered_seasons


def _seed_from_player_stats(
    supabase, seasons: list[int], players_df: pd.DataFrame, qb_ids: set, id_to_name: dict
) -> dict[str, dict]:
    """Seed starters from player_stats (total_points + players.nfl_team) as fallback.

    Uses total fantasy points as a proxy for starter status since player_stats
    doesn't have passing attempts. The QB with the most total_points on a team
    is likely the starter.

    Returns {season_key: {team: {player_name, confidence, notes}}}.
    """
    ps_res = (
        supabase.table("player_stats")
        .select("player_id, season, total_points, games_played")
        .in_("season", seasons)
        .execute()
    )
    ps_df = pd.DataFrame(ps_res.data or [])
    if ps_df.empty:
        return {}

    for col in ["total_points", "games_played", "season"]:
        ps_df[col] = pd.to_numeric(ps_df[col], errors="coerce").fillna(0)

    # Filter to QBs
    qb_ps = ps_df[ps_df["player_id"].isin(qb_ids)].copy()
    if qb_ps.empty:
        return {}

    # Join with players table to get nfl_team
    team_map = dict(zip(players_df["id"], players_df["nfl_team"]))
    qb_ps["nfl_team"] = qb_ps["player_id"].map(team_map)

    result = {}

    for season in sorted(seasons):
        season_data = qb_ps[qb_ps["season"] == season]
        if season_data.empty:
            continue

        season_key = str(season)
        result[season_key] = {}

        for team, team_df in season_data.groupby("nfl_team"):
            if not team or pd.isna(team):
                continue
            team = str(team)

            team_total = team_df["total_points"].sum()
            if team_total == 0:
                continue

            top_qb = team_df.loc[team_df["total_points"].idxmax()]
            top_points = float(top_qb["total_points"])
            share = top_points / team_total if team_total > 0 else 0

            if share < 0.40:
                confidence = "competition"
                notes = f"No clear starter ({share:.0%} pts share)"
            elif share < 0.60:
                confidence = "competition"
                notes = f"Split duties ({share:.0%} pts share)"
            else:
                confidence = "projected"
                notes = f"Likely starter ({share:.0%} pts share)"

            player_name = id_to_name.get(top_qb["player_id"], "Unknown")
            games = int(top_qb["games_played"])

            result[season_key][team] = {
                "player_name": player_name,
                "confidence": confidence,
                "notes": f"{notes}, {games}G, {top_points:.0f} pts [player_stats]",
            }

    return result


def seed_starters(seasons: list[int], dry_run: bool = False) -> dict:
    """Detect QB starters from nfl_stats (primary) and player_stats (fallback).

    For seasons with nfl_stats data, uses passing_attempts to determine starters.
    For seasons without nfl_stats, falls back to player_stats total_points.
    """
    supabase = get_supabase_client()

    # Fetch player info
    players_data = fetch_all_rows(supabase, "players", "id, name, position, nfl_team")
    players_df = pd.DataFrame(players_data)
    qb_ids = set(players_df[players_df["position"] == "QB"]["id"].values)
    id_to_name = dict(zip(players_df["id"], players_df["name"]))

    # Load existing data to merge with
    existing = {}
    if OUTPUT_PATH.exists():
        with open(OUTPUT_PATH, "r") as f:
            existing = json.load(f)

    result = dict(existing)

    # Primary: nfl_stats
    nfl_result, covered_seasons = _seed_from_nfl_stats(
        supabase, seasons, qb_ids, id_to_name
    )

    # Fallback: player_stats for seasons not covered by nfl_stats
    uncovered_seasons = [s for s in seasons if s not in covered_seasons]
    ps_result = {}
    if uncovered_seasons:
        print(f"  Seasons {uncovered_seasons} not in nfl_stats, trying player_stats...")
        ps_result = _seed_from_player_stats(
            supabase, uncovered_seasons, players_df, qb_ids, id_to_name
        )

    # Merge results: nfl_stats first, then player_stats fallback
    for source_result in [nfl_result, ps_result]:
        for season_key, teams in source_result.items():
            if season_key not in result:
                result[season_key] = {}
            for team, info in teams.items():
                # Don't overwrite existing manual entries
                if team not in result[season_key]:
                    result[season_key][team] = info

    # Print summary per season
    for season in sorted(seasons):
        season_key = str(season)
        if season_key in result:
            teams = result[season_key]
            result[season_key] = dict(sorted(teams.items()))
            locked = sum(1 for v in teams.values() if v["confidence"] == "locked")
            projected = sum(1 for v in teams.values() if v["confidence"] == "projected")
            competition = sum(1 for v in teams.values() if v["confidence"] == "competition")
            source = "nfl_stats" if season in covered_seasons else "player_stats"
            print(f"  {season}: {len(teams)} teams ({locked} locked, {projected} projected, {competition} competition) [{source}]")

    # Sort by season
    result = dict(sorted(result.items()))

    if dry_run:
        print("\n--- DRY RUN (not writing) ---")
        print(json.dumps(result, indent=2))
    else:
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(OUTPUT_PATH, "w") as f:
            json.dump(result, f, indent=2)
        print(f"\nWrote {OUTPUT_PATH}")

    return result


def main():
    parser = argparse.ArgumentParser(description="Seed QB starter designations from nfl_stats + player_stats")
    parser.add_argument("--seasons", type=int, nargs="+", default=DEFAULT_SEASONS,
                        help="Seasons to seed (default: 2020-2025)")
    parser.add_argument("--dry-run", action="store_true", help="Print results without writing")
    args = parser.parse_args()

    print(f"Seeding QB starters for seasons: {args.seasons}")
    seed_starters(args.seasons, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
