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

        # --- Offense stats ---
        print("Fetching offense stats...")
        offense_raw = nfl.import_player_stats(seasons, stat_type="offense")
        offense_raw = offense_raw[offense_raw["season_type"] == "REG"]

        offense_cols = {
            "player_display_name": "player_display_name",
            "season": "season",
            "passing_yards": "passing_yards",
            "passing_tds": "passing_tds",
            "interceptions": "interceptions",
            "rushing_yards": "rushing_yards",
            "rushing_tds": "rushing_tds",
            "attempts": "rushing_attempts",
            "receptions": "receptions",
            "receiving_yards": "receiving_yards",
            "receiving_tds": "receiving_tds",
            "targets": "targets",
            "week": "week",
        }

        # Keep only columns that exist in the data
        available_cols = [c for c in offense_cols if c in offense_raw.columns]
        offense_df = offense_raw[available_cols].copy()
        offense_df = offense_df.rename(columns={
            "attempts": "rushing_attempts",
        })

        # Aggregate per player/season
        agg_offense: dict[str, str] = {}
        for col in ["passing_yards", "passing_tds", "interceptions", "rushing_yards",
                    "rushing_tds", "rushing_attempts", "receptions", "receiving_yards",
                    "receiving_tds", "targets"]:
            if col in offense_df.columns:
                agg_offense[col] = "sum"
        if "week" in offense_df.columns:
            agg_offense["week"] = "nunique"

        offense_agg = offense_df.groupby(["player_display_name", "season"]).agg(agg_offense).reset_index()
        if "week" in offense_agg.columns:
            offense_agg = offense_agg.rename(columns={"week": "games_played"})

        # --- Kicking stats ---
        print("Fetching kicking stats...")
        kicking_raw = nfl.import_player_stats(seasons, stat_type="kicking")
        kicking_raw = kicking_raw[kicking_raw["season_type"] == "REG"]

        # Identify kicking columns present
        kick_week_col = "week" if "week" in kicking_raw.columns else None

        # fg_made_0_39 = sum of fg_made_0_19 + fg_made_20_29 + fg_made_30_39
        fg_sub_cols = ["fg_made_0_19", "fg_made_20_29", "fg_made_30_39"]
        fg_50_cols = ["fg_made_50_59", "fg_made_60_"]

        kicking_df = kicking_raw[["player_display_name", "season"] +
                                  [c for c in fg_sub_cols + fg_50_cols + ["fg_made_40_49", "pat_made"]
                                   if c in kicking_raw.columns] +
                                  ([kick_week_col] if kick_week_col else [])].copy()

        # Build 0-39 aggregate column
        present_sub = [c for c in fg_sub_cols if c in kicking_df.columns]
        if present_sub:
            kicking_df["fg_made_0_39"] = kicking_df[present_sub].sum(axis=1)

        present_50 = [c for c in fg_50_cols if c in kicking_df.columns]
        if present_50:
            kicking_df["fg_made_50_plus"] = kicking_df[present_50].sum(axis=1)

        agg_kicking: dict[str, str] = {}
        for col in ["fg_made_0_39", "fg_made_40_49", "fg_made_50_plus", "pat_made"]:
            if col in kicking_df.columns:
                agg_kicking[col] = "sum"
        if kick_week_col:
            agg_kicking[kick_week_col] = "nunique"

        kicking_agg = kicking_df.groupby(["player_display_name", "season"]).agg(agg_kicking).reset_index()
        if kick_week_col in kicking_agg.columns:
            kicking_agg = kicking_agg.rename(columns={kick_week_col: "games_played"})

        # --- Merge offense and kicking ---
        merged = pd.merge(
            offense_agg, kicking_agg,
            on=["player_display_name", "season"],
            how="outer",
            suffixes=("_off", "_kick"),
        )

        # Reconcile games_played columns if both present
        if "games_played_off" in merged.columns and "games_played_kick" in merged.columns:
            merged["games_played"] = merged[["games_played_off", "games_played_kick"]].max(axis=1)
            merged = merged.drop(columns=["games_played_off", "games_played_kick"])
        elif "games_played_off" in merged.columns:
            merged = merged.rename(columns={"games_played_off": "games_played"})
        elif "games_played_kick" in merged.columns:
            merged = merged.rename(columns={"games_played_kick": "games_played"})

        # --- Match to DB players and upsert ---
        matched = 0
        unmatched_names: set[str] = set()
        upsert_rows: list[dict] = []

        for _, row in merged.iterrows():
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
                "fg_made_0_39": _safe_int(row.get("fg_made_0_39")),
                "fg_made_40_49": _safe_int(row.get("fg_made_40_49")),
                "fg_made_50_plus": _safe_int(row.get("fg_made_50_plus")),
                "pat_made": _safe_int(row.get("pat_made")),
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
