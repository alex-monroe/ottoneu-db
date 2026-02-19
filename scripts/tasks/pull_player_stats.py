"""Task: Pull multi-season NFL player stats via nfl_data_py and upsert to player_stats."""

from __future__ import annotations

import sys
import os

import nfl_data_py as nfl
import pandas as pd
from supabase import Client

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from scripts.tasks import TaskResult
from scripts.name_utils import normalize_player_name


def _calc_points(row: dict) -> float:
    """Calculate Ottoneu fantasy points from raw stats using Half PPR scoring."""
    return (
        (row.get("passing_yards") or 0) * 0.04 +
        (row.get("passing_tds") or 0) * 4 +
        (row.get("interceptions") or 0) * -2 +
        (row.get("rushing_yards") or 0) * 0.1 +
        (row.get("rushing_tds") or 0) * 6 +
        (row.get("receptions") or 0) * 0.5 +
        (row.get("receiving_yards") or 0) * 0.1 +
        (row.get("receiving_tds") or 0) * 6 +
        (row.get("fg_made_0_39") or 0) * 3 +
        (row.get("fg_made_40_49") or 0) * 4 +
        (row.get("fg_made_50_plus") or 0) * 5 +
        (row.get("pat_made") or 0) * 1
    )


def _build_player_lookup(supabase: Client) -> dict[str, str]:
    """Fetch all players from DB and return normalized_name -> uuid dict."""
    result = supabase.table("players").select("id, name").execute()
    players = result.data or []
    lookup: dict[str, str] = {}
    for p in players:
        norm = normalize_player_name(p["name"])
        lookup[norm] = p["id"]
    return lookup


def _safe_int(val) -> int | None:
    """Convert a value to int, returning None for NaN/None."""
    if val is None:
        return None
    try:
        import math
        if math.isnan(float(val)):
            return None
        return int(val)
    except (TypeError, ValueError):
        return None


def run(params: dict, supabase: Client) -> TaskResult:
    """Pull NFL player stats for multiple seasons and upsert to player_stats.

    Uses nfl_data_py.import_weekly_data() which provides per-player-per-week
    offensive stats with player_display_name. Data is filtered to REG season
    and aggregated to season totals. Kickers are not included in weekly offensive
    data, so existing kicker rows in player_stats are preserved.

    Params:
        seasons (list[int]): List of NFL season years to pull

    Returns a TaskResult indicating success or failure.
    """
    seasons = params.get("seasons", [2022, 2023, 2024])
    print(f"Pulling player stats for seasons: {seasons}")

    try:
        # Build player lookup from DB
        player_lookup = _build_player_lookup(supabase)
        print(f"Loaded {len(player_lookup)} players from DB.")

        # Fetch weekly offensive data — has player_display_name + all skill-position stats
        print("Fetching weekly offensive stats...")
        weekly_cols = [
            "player_display_name", "season", "week", "season_type",
            "passing_yards", "passing_tds", "interceptions",
            "carries", "rushing_yards", "rushing_tds",
            "receptions", "targets", "receiving_yards", "receiving_tds",
        ]
        weekly_raw = nfl.import_weekly_data(seasons, columns=weekly_cols)
        weekly_raw = weekly_raw[weekly_raw["season_type"] == "REG"]
        print(f"  Fetched {len(weekly_raw)} weekly rows across {len(seasons)} season(s).")

        # Rename carries -> rushing_attempts for DB column name consistency
        weekly_raw = weekly_raw.rename(columns={"carries": "rushing_attempts"})

        # Aggregate stat columns by player + season; count unique weeks as games_played
        stat_cols = [
            "passing_yards", "passing_tds", "interceptions",
            "rushing_attempts", "rushing_yards", "rushing_tds",
            "receptions", "targets", "receiving_yards", "receiving_tds",
        ]
        agg_dict: dict[str, str] = {c: "sum" for c in stat_cols if c in weekly_raw.columns}
        agg_dict["week"] = "nunique"

        season_agg = (
            weekly_raw
            .groupby(["player_display_name", "season"])
            .agg(agg_dict)
            .reset_index()
            .rename(columns={"week": "games_played"})
        )

        # --- Match to DB players and build upsert rows ---
        matched = 0
        unmatched_names: set[str] = set()
        upsert_rows: list[dict] = []

        for _, row in season_agg.iterrows():
            raw_name = str(row["player_display_name"])
            norm_name = normalize_player_name(raw_name)
            player_uuid = player_lookup.get(norm_name)

            if not player_uuid:
                unmatched_names.add(raw_name)
                continue

            season = int(row["season"])

            stat_row: dict = {
                "player_id": player_uuid,
                "season": season,
                "games_played": _safe_int(row.get("games_played")),
                "passing_yards": _safe_int(row.get("passing_yards")),
                "passing_tds": _safe_int(row.get("passing_tds")),
                "interceptions": _safe_int(row.get("interceptions")),
                "rushing_yards": _safe_int(row.get("rushing_yards")),
                "rushing_tds": _safe_int(row.get("rushing_tds")),
                "rushing_attempts": _safe_int(row.get("rushing_attempts")),
                "receptions": _safe_int(row.get("receptions")),
                "receiving_yards": _safe_int(row.get("receiving_yards")),
                "receiving_tds": _safe_int(row.get("receiving_tds")),
                "targets": _safe_int(row.get("targets")),
                "fg_made_0_39": None,
                "fg_made_40_49": None,
                "fg_made_50_plus": None,
                "pat_made": None,
            }
            stat_row["total_points"] = round(_calc_points(stat_row), 2)

            upsert_rows.append(stat_row)
            matched += 1

        print(f"Matched {matched} player/season rows. Unmatched: {len(unmatched_names)}")
        if unmatched_names:
            sample = sorted(unmatched_names)[:20]
            print(f"  Unmatched sample: {sample}")

        # Upsert in batches to avoid request size limits
        batch_size = 200
        for i in range(0, len(upsert_rows), batch_size):
            batch = upsert_rows[i:i + batch_size]
            supabase.table("player_stats").upsert(
                batch, on_conflict="player_id,season"
            ).execute()

        print(f"Upserted {len(upsert_rows)} rows to player_stats.")
        return TaskResult(success=True, data={"rows_upserted": len(upsert_rows), "unmatched": len(unmatched_names)})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return TaskResult(success=False, error=str(e))
