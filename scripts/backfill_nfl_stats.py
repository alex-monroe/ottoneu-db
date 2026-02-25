"""Backfill NFL stats from nflverse-data into the nfl_stats table.

Standalone script (not a queue task) that:
1. Pulls per-season regular-season stats from nflverse-data parquet files
2. Pulls snap count data from nflverse-data
3. Creates players rows for historical NFL players not already in the DB
4. Calculates Ottoneu Half PPR fantasy points
5. Upserts everything into the nfl_stats table

Usage:
    python scripts/backfill_nfl_stats.py                           # All seasons 2010-2024
    python scripts/backfill_nfl_stats.py --seasons 2022 2023 2024  # Specific seasons
    python scripts/backfill_nfl_stats.py --dry-run                 # Parse only, no DB writes
"""

from __future__ import annotations

import argparse
import hashlib
import math
import os
import sys
from typing import Any

import pandas as pd

# Setup paths
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.config import get_supabase_client
from scripts.name_utils import normalize_player_name

# --- Constants ---

DEFAULT_SEASONS = list(range(2010, 2025))

_STATS_PLAYER_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "stats_player/stats_player_reg_{year}.parquet"
)

_SNAP_COUNTS_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "snap_counts/snap_counts_{year}.parquet"
)

_ROSTERS_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "rosters/roster_{year}.parquet"
)


# --- Fantasy Point Calculation ---

def calc_half_ppr_points(row: dict) -> float:
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


# --- Helpers ---

def _safe_int(val: Any) -> int | None:
    """Convert a value to int, returning None for NaN/None."""
    if val is None:
        return None
    try:
        if math.isnan(float(val)):
            return None
        return int(val)
    except (TypeError, ValueError):
        return None


def _generate_synthetic_ottoneu_id(nflverse_player_id: str) -> int:
    """Generate a stable negative ottoneu_id from an nflverse player ID.

    Uses a hash to produce a deterministic negative integer that won't
    collide with real Ottoneu IDs (which are positive).
    """
    h = hashlib.md5(nflverse_player_id.encode()).hexdigest()
    # Use first 7 hex chars -> up to ~268 million unique values
    return -abs(int(h[:7], 16))


VALID_POSITIONS = {"QB", "RB", "WR", "TE", "K"}


# --- Data Loading ---

def load_stats(year: int) -> pd.DataFrame | None:
    """Fetch stats_player_reg_{year}.parquet from nflverse-data."""
    url = _STATS_PLAYER_URL.format(year=year)
    try:
        df = pd.read_parquet(url)
        return df
    except Exception as e:
        print(f"    SKIP stats for {year}: {e}")
        return None


def load_snap_counts(year: int) -> pd.DataFrame | None:
    """Fetch snap count data for a season from nflverse-data."""
    url = _SNAP_COUNTS_URL.format(year=year)
    try:
        df = pd.read_parquet(url)
        # Filter to regular season only
        if "game_type" in df.columns:
            df = df[df["game_type"] == "REG"]
        return df
    except Exception as e:
        print(f"    SKIP snap counts for {year}: {e}")
        return None


def load_rosters(year: int) -> pd.DataFrame | None:
    """Fetch roster data for a season from nflverse-data."""
    url = _ROSTERS_URL.format(year=year)
    try:
        df = pd.read_parquet(url)
        return df
    except Exception as e:
        print(f"    SKIP rosters for {year}: {e}")
        return None


# --- Player Lookup ---

def build_player_lookup(supabase) -> dict[str, str]:
    """Fetch all players from DB and return normalized_name -> uuid dict."""
    result = supabase.table("players").select("id, name").execute()
    players = result.data or []
    lookup: dict[str, str] = {}
    for p in players:
        norm = normalize_player_name(p["name"])
        lookup[norm] = p["id"]
    return lookup


def build_ottoneu_id_set(supabase) -> set[int]:
    """Fetch all existing ottoneu_ids to avoid collisions."""
    result = supabase.table("players").select("ottoneu_id").execute()
    return {r["ottoneu_id"] for r in (result.data or [])}


# --- Core Logic ---

def process_stats(combined: pd.DataFrame) -> pd.DataFrame:
    """Process raw nflverse stats DataFrame into aggregated per-player/season rows."""
    # Build fg_made_0_39 from sub-ranges, and fg_made_50_plus from 50-59 + 60+
    fg_sub = ["fg_made_0_19", "fg_made_20_29", "fg_made_30_39"]
    fg_50_plus = ["fg_made_50_59", "fg_made_60_"]
    present_sub = [c for c in fg_sub if c in combined.columns]
    present_50 = [c for c in fg_50_plus if c in combined.columns]
    if present_sub:
        combined["fg_made_0_39"] = combined[present_sub].sum(axis=1)
    if present_50:
        combined["fg_made_50_plus"] = combined[present_50].sum(axis=1)

    # Normalize column names
    combined = combined.rename(columns={
        "passing_interceptions": "interceptions",
        "carries": "rushing_attempts",
        "games": "games_played",
    })

    # Aggregate stat columns for players who appear multiple times per season
    # (mid-season trades produce one row per team)
    stat_cols = [
        "games_played", "passing_yards", "passing_tds", "interceptions",
        "rushing_yards", "rushing_tds", "rushing_attempts",
        "receptions", "targets", "receiving_yards", "receiving_tds",
        "fg_made_0_39", "fg_made_40_49", "fg_made_50_plus", "pat_made",
    ]
    agg_cols = {c: "sum" for c in stat_cols if c in combined.columns}

    # Also carry forward player_id for roster matching
    if "player_id" in combined.columns:
        agg_cols["player_id"] = "first"

    combined = (
        combined
        .groupby(["player_display_name", "season"], as_index=False)
        .agg(agg_cols)
    )

    return combined


def process_snap_counts(snaps_df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate snap counts per player/season."""
    if snaps_df is None or snaps_df.empty:
        return pd.DataFrame()

    agg = snaps_df.groupby(["player", "position", "team"]).agg({
        "offense_snaps": "sum",
        "defense_snaps": "sum",
        "st_snaps": "sum",
    }).reset_index()

    agg["total_snaps"] = agg["offense_snaps"] + agg["defense_snaps"] + agg["st_snaps"]

    # Aggregate across teams (traded players) — sum by normalized name
    agg["player_normalized"] = agg["player"].apply(normalize_player_name)
    agg = agg.groupby("player_normalized").agg({
        "offense_snaps": "sum",
        "defense_snaps": "sum",
        "st_snaps": "sum",
        "total_snaps": "sum",
    }).reset_index()

    return agg


def create_missing_players(
    stats_df: pd.DataFrame,
    roster_dfs: dict[int, pd.DataFrame],
    player_lookup: dict[str, str],
    existing_ottoneu_ids: set[int],
    supabase,
    dry_run: bool = False,
) -> dict[str, str]:
    """Create players rows for NFL players not already in the database.

    Returns updated player_lookup dict.
    """
    # Collect all unique player names from stats
    all_names = set(stats_df["player_display_name"].dropna().unique())
    missing_names: set[str] = set()

    for name in all_names:
        norm = normalize_player_name(str(name))
        if norm not in player_lookup:
            missing_names.add(str(name))

    if not missing_names:
        print(f"  All {len(all_names)} players already in DB.")
        return player_lookup

    print(f"  Found {len(missing_names)} players not in DB. Creating...")

    # Build a roster lookup for position/team info
    roster_info: dict[str, dict[str, str]] = {}
    for year, rdf in roster_dfs.items():
        if rdf is None:
            continue
        name_col = "player_name" if "player_name" in rdf.columns else "full_name"
        if name_col not in rdf.columns:
            continue
        pid_col = "player_id" if "player_id" in rdf.columns else "gsis_id"
        for _, row in rdf.iterrows():
            rname = str(row.get(name_col, ""))
            norm = normalize_player_name(rname)
            if norm not in roster_info:
                pos = str(row.get("position", "")) if pd.notna(row.get("position")) else ""
                team = str(row.get("team", "")) if pd.notna(row.get("team")) else "FA"
                pid = str(row.get(pid_col, "")) if pd.notna(row.get(pid_col)) else ""
                roster_info[norm] = {"position": pos, "team": team, "nflverse_id": pid}

    # Also collect position info from the stats dataframe itself
    stats_position_info: dict[str, str] = {}
    if "position" in stats_df.columns:
        for _, row in stats_df[["player_display_name", "position"]].drop_duplicates().iterrows():
            norm = normalize_player_name(str(row["player_display_name"]))
            pos = str(row["position"]) if pd.notna(row.get("position")) else ""
            if pos:
                stats_position_info[norm] = pos

    new_players: list[dict] = []
    for name in missing_names:
        norm = normalize_player_name(name)
        info = roster_info.get(norm, {})
        position = info.get("position", stats_position_info.get(norm, ""))
        team = info.get("team", "FA")
        nflverse_id = info.get("nflverse_id", name)

        # Only create players at fantasy-relevant positions
        if position not in VALID_POSITIONS:
            continue

        synthetic_id = _generate_synthetic_ottoneu_id(nflverse_id if nflverse_id else name)
        # Handle collision (extremely unlikely but be safe)
        while synthetic_id in existing_ottoneu_ids:
            synthetic_id -= 1

        existing_ottoneu_ids.add(synthetic_id)
        new_players.append({
            "ottoneu_id": synthetic_id,
            "name": name,
            "position": position,
            "nfl_team": team,
            "is_college": False,
        })

    if dry_run:
        print(f"  [DRY RUN] Would create {len(new_players)} new player rows.")
        sample = new_players[:5]
        for p in sample:
            print(f"    {p['name']} ({p['position']}, {p['nfl_team']}, ottoneu_id={p['ottoneu_id']})")
        return player_lookup

    # Batch upsert new players
    batch_size = 200
    created = 0
    for i in range(0, len(new_players), batch_size):
        batch = new_players[i:i + batch_size]
        result = supabase.table("players").upsert(
            batch, on_conflict="ottoneu_id"
        ).execute()
        returned = result.data or []
        for p in returned:
            norm = normalize_player_name(p["name"])
            player_lookup[norm] = p["id"]
            created += 1

    print(f"  Created {created} new player rows.")
    return player_lookup


def backfill_seasons(
    seasons: list[int],
    dry_run: bool = False,
) -> None:
    """Main backfill function."""
    supabase = get_supabase_client()

    print("Building player lookup from DB...")
    player_lookup = build_player_lookup(supabase)
    existing_ottoneu_ids = build_ottoneu_id_set(supabase)
    print(f"  {len(player_lookup)} players in DB.")

    # Phase 1: Load all data
    print(f"\n=== Phase 1: Loading data for {len(seasons)} seasons ===")
    all_stats_frames: list[pd.DataFrame] = []
    all_snap_frames: dict[int, pd.DataFrame] = {}
    all_roster_frames: dict[int, pd.DataFrame] = {}

    for year in seasons:
        print(f"\n  Season {year}:")

        stats = load_stats(year)
        if stats is not None:
            all_stats_frames.append(stats)
            print(f"    Stats: {len(stats)} rows")

        snaps = load_snap_counts(year)
        if snaps is not None:
            all_snap_frames[year] = snaps
            print(f"    Snaps: {len(snaps)} rows")

        rosters = load_rosters(year)
        if rosters is not None:
            all_roster_frames[year] = rosters
            print(f"    Rosters: {len(rosters)} rows")

    if not all_stats_frames:
        print("No stats data loaded. Exiting.")
        return

    combined_stats = pd.concat(all_stats_frames, ignore_index=True)
    print(f"\n  Total raw stats rows: {len(combined_stats)}")

    # Phase 2: Create missing players
    print("\n=== Phase 2: Creating missing players ===")
    player_lookup = create_missing_players(
        combined_stats, all_roster_frames,
        player_lookup, existing_ottoneu_ids,
        supabase, dry_run=dry_run,
    )

    # Phase 3: Process and upsert stats
    print("\n=== Phase 3: Processing stats ===")
    processed = process_stats(combined_stats)
    print(f"  Aggregated to {len(processed)} player/season rows.")

    # Process snap counts per season and merge
    snap_by_season: dict[int, pd.DataFrame] = {}
    for year, snaps_df in all_snap_frames.items():
        snap_agg = process_snap_counts(snaps_df)
        if not snap_agg.empty:
            snap_by_season[year] = snap_agg

    # Build upsert rows
    matched = 0
    unmatched_names: set[str] = set()
    upsert_rows: list[dict] = []

    for _, row in processed.iterrows():
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

        # Calculate fantasy points
        stat_row["total_points"] = round(calc_half_ppr_points(stat_row), 2)
        games = stat_row.get("games_played") or 0
        stat_row["ppg"] = round(stat_row["total_points"] / games, 2) if games > 0 else 0.0

        # Merge snap counts if available
        snap_data = snap_by_season.get(season)
        if snap_data is not None and not snap_data.empty:
            snap_match = snap_data[snap_data["player_normalized"] == norm_name]
            if not snap_match.empty:
                snap_row = snap_match.iloc[0]
                stat_row["offense_snaps"] = _safe_int(snap_row.get("offense_snaps"))
                stat_row["defense_snaps"] = _safe_int(snap_row.get("defense_snaps"))
                stat_row["st_snaps"] = _safe_int(snap_row.get("st_snaps"))
                stat_row["total_snaps"] = _safe_int(snap_row.get("total_snaps"))

        upsert_rows.append(stat_row)
        matched += 1

    print(f"\n  Matched: {matched} player/season rows")
    print(f"  Unmatched: {len(unmatched_names)}")
    if unmatched_names:
        sample = sorted(unmatched_names)[:15]
        print(f"  Unmatched sample: {sample}")

    # Deduplicate by (player_id, season): different display name variants can
    # map to the same player_id after normalization. Aggregate by summing stats
    # and recalculating points/ppg, then convert back to list of dicts.
    if upsert_rows:
        stat_sum_cols = [
            "games_played", "passing_yards", "passing_tds", "interceptions",
            "rushing_yards", "rushing_tds", "rushing_attempts",
            "receptions", "targets", "receiving_yards", "receiving_tds",
            "fg_made_0_39", "fg_made_40_49", "fg_made_50_plus", "pat_made",
            "offense_snaps", "defense_snaps", "st_snaps", "total_snaps",
        ]
        dedup_df = pd.DataFrame(upsert_rows)
        present_sum = [c for c in stat_sum_cols if c in dedup_df.columns]
        agg_dict = {c: "sum" for c in present_sum}
        dedup_df = dedup_df.groupby(["player_id", "season"], as_index=False).agg(agg_dict)
        # Recalculate total_points and ppg after summing
        dedup_df["total_points"] = dedup_df.apply(
            lambda r: round(calc_half_ppr_points(r.to_dict()), 2), axis=1
        )
        # pandas sum() promotes int columns with NaN to float64 — cast back to int|None
        for col in present_sum:
            dedup_df[col] = dedup_df[col].apply(_safe_int)
        dedup_df["ppg"] = dedup_df.apply(
            lambda r: round(r["total_points"] / r["games_played"], 2)
            if r.get("games_played") else 0.0,
            axis=1,
        )
        upsert_rows = dedup_df.to_dict(orient="records")
        print(f"  After dedup: {len(upsert_rows)} unique player/season rows")

    if dry_run:
        print(f"\n[DRY RUN] Would upsert {len(upsert_rows)} rows to nfl_stats.")
        # Show a sample
        if upsert_rows:
            sample = upsert_rows[:3]
            for r in sample:
                print(f"  {r.get('season')} | pts={r.get('total_points')} | ppg={r.get('ppg')} | "
                      f"pass={r.get('passing_yards')} | rush={r.get('rushing_yards')} | "
                      f"rec={r.get('receiving_yards')}")
        return

    # Phase 4: Upsert to nfl_stats
    print(f"\n=== Phase 4: Upserting {len(upsert_rows)} rows to nfl_stats ===")
    batch_size = 200
    for i in range(0, len(upsert_rows), batch_size):
        batch = upsert_rows[i:i + batch_size]
        supabase.table("nfl_stats").upsert(
            batch, on_conflict="player_id,season"
        ).execute()
        if (i // batch_size) % 10 == 0:
            print(f"  Batch {i // batch_size + 1} / {(len(upsert_rows) + batch_size - 1) // batch_size}")

    print(f"\nDone! Upserted {len(upsert_rows)} rows to nfl_stats.")


def main():
    parser = argparse.ArgumentParser(
        description="Backfill NFL stats into the nfl_stats table"
    )
    parser.add_argument(
        "--seasons", type=int, nargs="+",
        default=DEFAULT_SEASONS,
        help=f"Seasons to backfill (default: {DEFAULT_SEASONS[0]}-{DEFAULT_SEASONS[-1]})",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Parse and process data without writing to the database",
    )
    args = parser.parse_args()

    print(f"NFL Stats Backfill")
    print(f"  Seasons: {args.seasons}")
    print(f"  Dry run: {args.dry_run}")
    print()

    backfill_seasons(args.seasons, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
