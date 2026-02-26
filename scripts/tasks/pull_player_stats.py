"""Task: Pull multi-season NFL player stats via nflverse-data and upsert to player_stats.

Reads directly from the nflverse-data `stats_player` GitHub release, which:
- Covers 2022-present and is updated within days of each season ending
- Pre-aggregates stats by player/season (no groupby needed)
- Includes kicking stats (fg_made_0_39, fg_made_40_49, fg_made_50_plus, pat_made)
- Works independently of the archived nfl_data_py library

URL pattern: https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_{year}.parquet
"""

from __future__ import annotations

import sys
import os
import math

import pandas as pd
from supabase import Client

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from scripts.config import SCORING_SETTINGS
from scripts.tasks import TaskResult
from scripts.name_utils import normalize_player_name

_STATS_PLAYER_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "stats_player/stats_player_reg_{year}.parquet"
)


def _calc_points(row: dict) -> float:
    """Calculate Ottoneu fantasy points from raw stats using Half PPR scoring."""
    points = 0.0
    for stat, multiplier in SCORING_SETTINGS.items():
        points += (row.get(stat) or 0) * multiplier
    return points


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
        if math.isnan(float(val)):
            return None
        return int(val)
    except (TypeError, ValueError):
        return None


def _load_season(year: int) -> pd.DataFrame:
    """Fetch stats_player_reg_{year}.parquet from nflverse-data."""
    url = _STATS_PLAYER_URL.format(year=year)
    df = pd.read_parquet(url)
    return df


def run(params: dict, supabase: Client) -> TaskResult:
    """Pull NFL player stats for multiple seasons and upsert to player_stats.

    Reads pre-aggregated regular-season stats from the nflverse-data
    `stats_player` release. Includes both skill-position and kicking stats.

    Params:
        seasons (list[int]): List of NFL season years to pull (e.g. [2022, 2023, 2024, 2025])

    Returns a TaskResult indicating success or failure.
    """
    seasons = params.get("seasons", [2022, 2023, 2024])
    print(f"Pulling player stats for seasons: {seasons}")

    try:
        player_lookup = _build_player_lookup(supabase)
        print(f"Loaded {len(player_lookup)} players from DB.")

        frames: list[pd.DataFrame] = []
        for year in seasons:
            print(f"  Fetching {year}...")
            try:
                df = _load_season(year)
                frames.append(df)
                print(f"    {year}: {len(df)} rows")
            except Exception as e:
                print(f"    {year}: SKIP — {e}")

        if not frames:
            return TaskResult(success=False, error="No season data could be fetched.")

        combined = pd.concat(frames, ignore_index=True)

        # Build fg_made_0_39 from sub-ranges, and fg_made_50_plus from 50-59 + 60+
        fg_sub = ["fg_made_0_19", "fg_made_20_29", "fg_made_30_39"]
        fg_50_plus = ["fg_made_50_59", "fg_made_60_"]
        present_sub = [c for c in fg_sub if c in combined.columns]
        present_50 = [c for c in fg_50_plus if c in combined.columns]
        if present_sub:
            combined["fg_made_0_39"] = combined[present_sub].sum(axis=1)
        if present_50:
            combined["fg_made_50_plus"] = combined[present_50].sum(axis=1)

        # Normalize column names to match DB schema
        combined = combined.rename(columns={
            "passing_interceptions": "interceptions",
            "carries": "rushing_attempts",
            "games": "games_played",
        })

        # Aggregate stat columns for players who appear multiple times in a season
        # (mid-season trades produce one row per team)
        stat_cols = [
            "games_played", "passing_yards", "passing_tds", "interceptions",
            "rushing_yards", "rushing_tds", "rushing_attempts",
            "receptions", "targets", "receiving_yards", "receiving_tds",
            "fg_made_0_39", "fg_made_40_49", "fg_made_50_plus", "pat_made",
        ]
        agg_cols = {c: "sum" for c in stat_cols if c in combined.columns}
        combined = (
            combined
            .groupby(["player_display_name", "season"], as_index=False)
            .agg(agg_cols)
        )

        # Match to DB players and build upsert rows
        matched = 0
        unmatched_names: set[str] = set()
        upsert_rows: list[dict] = []

        for _, row in combined.iterrows():
            raw_name = str(row.get("player_display_name", ""))
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
                "fg_made_0_39": _safe_int(row.get("fg_made_0_39")),
                "fg_made_40_49": _safe_int(row.get("fg_made_40_49")),
                "fg_made_50_plus": _safe_int(row.get("fg_made_50_plus")),
                "pat_made": _safe_int(row.get("pat_made")),
            }
            stat_row["total_points"] = round(_calc_points(stat_row), 2)
            games = stat_row.get("games_played") or 0
            stat_row["ppg"] = round(stat_row["total_points"] / games, 2) if games > 0 else 0.0

            upsert_rows.append(stat_row)
            matched += 1

        print(f"Matched {matched} player/season rows. Unmatched: {len(unmatched_names)}")
        if unmatched_names:
            sample = sorted(unmatched_names)[:20]
            print(f"  Unmatched sample: {sample}")

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
