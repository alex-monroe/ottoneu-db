"""Backfill birth_date for all players using nfl_data_py roster data."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import nfl_data_py as nfl
from config import get_supabase_client
from name_utils import normalize_player_name


def run():
    supabase = get_supabase_client()

    # Pull rosters for multiple seasons to maximize coverage
    print("Fetching roster data from nfl_data_py...")
    rosters = nfl.import_seasonal_rosters([2022, 2023, 2024, 2025])

    # Keep only rows with a birth_date
    rosters = rosters[rosters["birth_date"].notna()][["player_name", "birth_date"]].drop_duplicates("player_name")

    # Build name -> birth_date lookup (normalized names)
    dob_lookup = {
        normalize_player_name(str(row.player_name)): str(row.birth_date)
        for _, row in rosters.iterrows()
    }
    print(f"Loaded {len(dob_lookup)} players with birth dates from nfl_data_py")

    # Fetch all players from DB
    result = supabase.table("players").select("id, name").execute()
    players = result.data or []
    print(f"Found {len(players)} players in database")

    matched = 0
    for p in players:
        norm = normalize_player_name(p["name"])
        dob = dob_lookup.get(norm)
        if dob:
            supabase.table("players").update({"birth_date": dob}).eq("id", p["id"]).execute()
            matched += 1

    print(f"Updated {matched}/{len(players)} players with birth_date.")


if __name__ == "__main__":
    run()
