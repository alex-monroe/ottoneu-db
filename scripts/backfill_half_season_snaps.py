"""Backfill H1/H2 snap splits for historical seasons in player_stats.

Computes h1_snaps, h1_games, h2_snaps, h2_games for seasons 2022-2025
using nfl_data_py snap count data, then updates the matching player_stats
rows via player name normalization.

Usage:
    source venv/bin/activate
    python scripts/backfill_half_season_snaps.py
"""

import nfl_data_py as nfl
import pandas as pd

from scripts.config import get_supabase_client, HISTORICAL_SEASONS, SEASON
from scripts.name_utils import normalize_player_name

H1_WEEKS = list(range(1, 9))   # weeks 1-8
H2_WEEKS = list(range(9, 17))  # weeks 9-16

SEASONS_TO_BACKFILL = HISTORICAL_SEASONS + [SEASON]


def compute_half_splits(season: int) -> pd.DataFrame:
    """Return a DataFrame with h1/h2 snap splits for a given season.

    Columns: player, position, team, h1_snaps, h1_games, h2_snaps, h2_games
    """
    print(f"  Importing snap counts for {season}...")
    snaps = nfl.import_snap_counts([season])

    if "game_type" in snaps.columns:
        snaps = snaps[snaps["game_type"] == "REG"]

    # Full-season base for joining
    base = snaps.groupby(["player", "position", "team"]).agg(
        games_played=("game_id", "nunique"),
    ).reset_index()

    # H1
    snaps_h1 = snaps[snaps["week"].isin(H1_WEEKS)].copy()
    snaps_h1["total_snaps_calc"] = (
        snaps_h1["offense_snaps"] + snaps_h1["defense_snaps"] + snaps_h1["st_snaps"]
    )
    h1_agg = snaps_h1.groupby(["player", "position", "team"]).agg(
        h1_snaps=("total_snaps_calc", "sum"),
        h1_games=("game_id", "nunique"),
    ).reset_index()

    # H2
    snaps_h2 = snaps[snaps["week"].isin(H2_WEEKS)].copy()
    snaps_h2["total_snaps_calc"] = (
        snaps_h2["offense_snaps"] + snaps_h2["defense_snaps"] + snaps_h2["st_snaps"]
    )
    h2_agg = snaps_h2.groupby(["player", "position", "team"]).agg(
        h2_snaps=("total_snaps_calc", "sum"),
        h2_games=("game_id", "nunique"),
    ).reset_index()

    result = base.merge(
        h1_agg[["player", "position", "team", "h1_snaps", "h1_games"]],
        on=["player", "position", "team"], how="left"
    ).merge(
        h2_agg[["player", "position", "team", "h2_snaps", "h2_games"]],
        on=["player", "position", "team"], how="left"
    )

    for col in ["h1_snaps", "h1_games", "h2_snaps", "h2_games"]:
        result[col] = result[col].fillna(0).astype(int)

    result["player_normalized"] = result["player"].apply(normalize_player_name)

    return result


def backfill_season(supabase, season: int) -> None:
    """Backfill H1/H2 snaps for all player_stats rows in a given season."""
    print(f"\nBackfilling season {season}...")

    # Fetch all player_stats rows for the season with player name for matching
    res = supabase.table("player_stats").select(
        "id, player_id, season"
    ).eq("season", season).execute()

    stats_rows = res.data
    if not stats_rows:
        print(f"  No player_stats rows found for {season}. Skipping.")
        return

    # Fetch all player names (id -> name mapping)
    player_ids = list({r["player_id"] for r in stats_rows})
    players_res = supabase.table("players").select("id, name").in_("id", player_ids).execute()
    player_name_map = {p["id"]: p["name"] for p in (players_res.data or [])}

    # Compute NFL snap splits for the season
    nfl_splits = compute_half_splits(season)

    # Build a normalized-name → splits dict (handle traded players by summing across teams)
    splits_by_name: dict[str, dict] = {}
    for _, row in nfl_splits.iterrows():
        norm = row["player_normalized"]
        if norm not in splits_by_name:
            splits_by_name[norm] = {
                "h1_snaps": 0, "h1_games": 0,
                "h2_snaps": 0, "h2_games": 0,
            }
        splits_by_name[norm]["h1_snaps"] += int(row["h1_snaps"])
        splits_by_name[norm]["h1_games"] += int(row["h1_games"])
        splits_by_name[norm]["h2_snaps"] += int(row["h2_snaps"])
        splits_by_name[norm]["h2_games"] += int(row["h2_games"])

    updated = 0
    skipped = 0

    for stats_row in stats_rows:
        player_id = stats_row["player_id"]
        raw_name = player_name_map.get(player_id)
        if not raw_name:
            skipped += 1
            continue

        norm_name = normalize_player_name(raw_name)
        splits = splits_by_name.get(norm_name)
        if not splits:
            skipped += 1
            continue

        supabase.table("player_stats").update({
            "h1_snaps": splits["h1_snaps"],
            "h1_games": splits["h1_games"],
            "h2_snaps": splits["h2_snaps"],
            "h2_games": splits["h2_games"],
        }).eq("id", stats_row["id"]).execute()
        updated += 1

    print(f"  Updated {updated} rows, skipped {skipped} (no NFL snap match).")


def main():
    supabase = get_supabase_client()

    print(f"Backfilling H1/H2 snaps for seasons: {SEASONS_TO_BACKFILL}")

    for season in SEASONS_TO_BACKFILL:
        backfill_season(supabase, season)

    print("\nDone.")


if __name__ == "__main__":
    main()
