"""Seed QB starter designations from historical nfl_stats data.

Auto-detects the primary starter for each team/season by finding the QB
with the most passing attempts. Results are written to data/qb_starters.json
for manual review and correction.

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

from scripts.config import get_supabase_client

DEFAULT_SEASONS = list(range(2020, 2026))
OUTPUT_PATH = Path(__file__).parent.parent / "data" / "qb_starters.json"


def seed_starters(seasons: list[int], dry_run: bool = False) -> dict:
    """Detect QB starters from nfl_stats passing attempts.

    For each team/season, finds the QB with the most passing attempts.
    Assigns confidence based on attempt share:
      - >60% of team attempts → "locked"
      - 40-60% → "competition"
      - <40% → skipped (no clear starter)
    """
    supabase = get_supabase_client()

    # Fetch nfl_stats for requested seasons
    nfl_stats_res = (
        supabase.table("nfl_stats")
        .select("player_id, season, passing_attempts, games_played, recent_team")
        .in_("season", seasons)
        .execute()
    )
    nfl_df = pd.DataFrame(nfl_stats_res.data or [])
    if nfl_df.empty:
        print("No nfl_stats data found.")
        return {}

    for col in ["passing_attempts", "games_played", "season"]:
        nfl_df[col] = pd.to_numeric(nfl_df[col], errors="coerce").fillna(0)

    # Fetch player info (name, position)
    players_res = supabase.table("players").select("id, name, position").execute()
    players_df = pd.DataFrame(players_res.data or [])

    # Filter to QBs
    qb_ids = set(players_df[players_df["position"] == "QB"]["id"].values)
    qb_stats = nfl_df[nfl_df["player_id"].isin(qb_ids)].copy()

    if qb_stats.empty:
        print("No QB stats found.")
        return {}

    # Build player_id -> name lookup
    id_to_name = dict(zip(players_df["id"], players_df["name"]))

    # Load existing data to merge with
    existing = {}
    if OUTPUT_PATH.exists():
        with open(OUTPUT_PATH, "r") as f:
            existing = json.load(f)

    result = dict(existing)

    for season in sorted(seasons):
        season_data = qb_stats[qb_stats["season"] == season]
        if season_data.empty:
            continue

        season_key = str(season)
        if season_key not in result:
            result[season_key] = {}

        # Group by team
        for team, team_df in season_data.groupby("recent_team"):
            if not team or pd.isna(team):
                continue

            team = str(team)

            # Skip if already manually set
            if team in result[season_key]:
                continue

            # Total team passing attempts
            team_total = team_df["passing_attempts"].sum()
            if team_total == 0:
                continue

            # Find QB with most attempts
            top_qb = team_df.loc[team_df["passing_attempts"].idxmax()]
            top_attempts = float(top_qb["passing_attempts"])
            share = top_attempts / team_total

            if share < 0.40:
                # No clear starter
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
                "notes": f"{notes}, {games}G, {int(top_attempts)} att",
            }

        # Sort teams alphabetically within each season
        result[season_key] = dict(sorted(result[season_key].items()))

        team_count = len(result[season_key])
        locked = sum(1 for v in result[season_key].values() if v["confidence"] == "locked")
        print(f"  {season}: {team_count} teams ({locked} locked, {team_count - locked} competition)")

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
    parser = argparse.ArgumentParser(description="Seed QB starter designations from nfl_stats")
    parser.add_argument("--seasons", type=int, nargs="+", default=DEFAULT_SEASONS,
                        help="Seasons to seed (default: 2020-2025)")
    parser.add_argument("--dry-run", action="store_true", help="Print results without writing")
    args = parser.parse_args()

    print(f"Seeding QB starters for seasons: {args.seasons}")
    seed_starters(args.seasons, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
