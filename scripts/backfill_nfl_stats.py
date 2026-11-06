"""Backfill NFL stats from nflverse-data into the nfl_stats table.

Standalone script (not a queue task) that:
1. Pulls per-season regular-season stats from nflverse-data parquet files
2. Pulls snap count data from nflverse-data
3. Creates players rows for historical NFL players not already in the DB
4. Calculates Ottoneu fantasy points (the league's full scoring, extras included)
5. Upserts everything into the nfl_stats table

Usage:
    python scripts/backfill_nfl_stats.py                           # All seasons 2010-2024
    python scripts/backfill_nfl_stats.py --seasons 2022 2023 2024  # Specific seasons
    python scripts/backfill_nfl_stats.py --dry-run                 # Parse only, no DB writes
    python scripts/backfill_nfl_stats.py --fill-missing-teams --seasons 2018 2019  # Only fill NULL recent_team
"""

from __future__ import annotations

import argparse
import hashlib
import math
from typing import Any

import pandas as pd

from scripts.config import get_supabase_client
from scripts.name_utils import normalize_player_name
from scripts.scoring import EXTRA_KEYS, add_nflverse_extras, score_stats

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

# Inputs for the stat-level projection model (docs/exec-plans/stat-projections/),
# stored as nflverse names them. All are season totals, so a traded player's
# stints are summed. Sacks turn pass attempts into dropbacks; air yards vs
# yards-after-catch and first downs split efficiency into its parts.
STAT_MODEL_INT_COLS: tuple[str, ...] = (
    "sacks_suffered", "sack_yards_lost",
    "passing_air_yards", "passing_yards_after_catch", "passing_first_downs",
    "rushing_first_downs",
    "receiving_yards_after_catch", "receiving_first_downs",
    "fg_att", "pat_att",
)
STAT_MODEL_FLOAT_COLS: tuple[str, ...] = ("passing_epa", "rushing_epa", "receiving_epa")


# --- Fantasy Point Calculation ---

def calc_half_ppr_points(row: dict) -> float:
    """Calculate Ottoneu fantasy points from raw stats (the league's full scoring).

    The SCORING_EXTRAS stats (fumbles lost, two-point conversions, missed kicks)
    count when the row carries them; nfl_stats stores them (migration 060), so
    ``score_stats`` on a stored row reproduces its ``total_points``.
    """
    return score_stats(row)


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


def _safe_float(val: Any) -> float | None:
    """Convert a value to float, returning None for NaN/None."""
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f):
            return None
        return f
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
    from scripts.config import fetch_all_rows
    players = fetch_all_rows(supabase, "players", "id, name")
    lookup: dict[str, str] = {}
    for p in players:
        norm = normalize_player_name(p["name"])
        lookup[norm] = p["id"]
    return lookup


def build_ottoneu_id_set(supabase) -> set[int]:
    """Fetch all existing ottoneu_ids to avoid collisions."""
    from scripts.config import fetch_all_rows
    rows = fetch_all_rows(supabase, "players", "ottoneu_id")
    return {r["ottoneu_id"] for r in rows}


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
    add_nflverse_extras(combined)

    # Normalize column names
    combined = combined.rename(columns={
        "passing_interceptions": "interceptions",
        "carries": "rushing_attempts",
        "games": "games_played",
        "attempts": "passing_attempts",
    })

    # Aggregate stat columns for players who appear multiple times per season
    # (mid-season trades produce one row per team)
    stat_cols = [
        "games_played", "passing_yards", "passing_tds", "interceptions",
        "rushing_yards", "rushing_tds", "rushing_attempts",
        "receptions", "targets", "receiving_yards", "receiving_tds",
        "fg_made_0_39", "fg_made_40_49", "fg_made_50_plus", "pat_made",
        "passing_attempts", "completions", "receiving_air_yards",
        *EXTRA_KEYS, *STAT_MODEL_INT_COLS, *STAT_MODEL_FLOAT_COLS,
    ]
    agg_cols = {c: "sum" for c in stat_cols if c in combined.columns}

    # Rate stats from nflverse are season-totals already — for traded players
    # take the row with the most games so the dominant team's value wins.
    rate_cols = ["target_share", "air_yards_share", "wopr", "racr"]
    if any(c in combined.columns for c in rate_cols) and "games_played" in combined.columns:
        combined = combined.sort_values(
            ["player_display_name", "season", "games_played"]
        )
    for c in rate_cols:
        if c in combined.columns:
            agg_cols[c] = "last"

    # Also carry forward player_id for roster matching
    if "player_id" in combined.columns:
        agg_cols["player_id"] = "first"

    # Preserve recent_team: for traded players, keep the team where they
    # played the most games (last row after sort is a reasonable proxy)
    if "recent_team" in combined.columns:
        agg_cols["recent_team"] = "last"

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
        for row in rdf.itertuples(index=False):
            rname = str(getattr(row, name_col, ""))
            norm = normalize_player_name(rname)
            if norm not in roster_info:
                pos = str(getattr(row, "position", "")) if pd.notna(getattr(row, "position", None)) else ""
                team = str(getattr(row, "team", "")) if pd.notna(getattr(row, "team", None)) else "FA"
                pid = str(getattr(row, pid_col, "")) if pd.notna(getattr(row, pid_col, None)) else ""
                roster_info[norm] = {"position": pos, "team": team, "nflverse_id": pid}

    # Also collect position info from the stats dataframe itself
    stats_position_info: dict[str, str] = {}
    if "position" in stats_df.columns:
        for row in stats_df[["player_display_name", "position"]].drop_duplicates().itertuples(index=False):
            norm = normalize_player_name(str(row.player_display_name))
            pos = str(row.position) if pd.notna(getattr(row, "position", None)) else ""
            if pos:
                stats_position_info[norm] = pos

    new_players: list[dict] = []
    # norm name -> ottoneu_id of a row that already exists for this player
    reused: dict[str, int] = {}
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
        # The id is derived from the nflverse id, so finding it already taken
        # means this player already has a row that the name lookup missed.
        # Reuse that row. Decrementing to a free id (as this code once did)
        # inserted a second copy of the player; 693 such pairs were merged on
        # 2026-11-05 (scripts/merge_synthetic_id_duplicates.sql).
        if synthetic_id in existing_ottoneu_ids:
            reused[norm] = synthetic_id
            continue

        existing_ottoneu_ids.add(synthetic_id)
        new_players.append({
            "ottoneu_id": synthetic_id,
            "name": name,
            "position": position,
            "nfl_team": team,
            "is_college": False,
        })

    if reused:
        # Read-only, so it runs in a dry run too: point the names at the rows.
        by_ottoneu_id: dict[int, str] = {}
        ids = sorted(set(reused.values()))
        for i in range(0, len(ids), 200):
            res = (
                supabase.table("players").select("id, ottoneu_id")
                .in_("ottoneu_id", ids[i:i + 200]).execute()
            )
            by_ottoneu_id.update({r["ottoneu_id"]: r["id"] for r in res.data or []})
        for norm, oid in reused.items():
            if oid in by_ottoneu_id:
                player_lookup[norm] = by_ottoneu_id[oid]
        print(f"  Reused {len(reused)} existing player rows the name lookup missed.")

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


def dedup_stat_rows(upsert_rows: list[dict]) -> list[dict]:
    """Collapse rows that share a (player_id, season) into one row.

    Different display-name variants can normalize to the same player_id. Stats
    are summed, rate stats averaged, points/ppg recomputed, and recent_team
    kept from the variant with the most games.
    """
    if not upsert_rows:
        return upsert_rows
    stat_sum_cols = [
        "games_played", "passing_yards", "passing_tds", "interceptions",
        "rushing_yards", "rushing_tds", "rushing_attempts",
        "receptions", "targets", "receiving_yards", "receiving_tds",
        "fg_made_0_39", "fg_made_40_49", "fg_made_50_plus", "pat_made",
        "passing_attempts", "completions", "receiving_air_yards",
        "offense_snaps", "defense_snaps", "st_snaps", "total_snaps",
        *EXTRA_KEYS, *STAT_MODEL_INT_COLS, *STAT_MODEL_FLOAT_COLS,
    ]
    rate_avg_cols = ["target_share", "air_yards_share", "wopr", "racr"]
    dedup_df = pd.DataFrame(upsert_rows)
    present_sum = [c for c in stat_sum_cols if c in dedup_df.columns]
    present_avg = [c for c in rate_avg_cols if c in dedup_df.columns]
    agg_dict: dict[str, str] = {c: "sum" for c in present_sum}
    for c in present_avg:
        agg_dict[c] = "mean"
    # Carry recent_team through the dedup. Leaving it out of the aggregation
    # silently dropped it, so every row inserted through here landed with a
    # NULL team; that broke team usage totals and the vegas team lookup in
    # the projection features. Keep the team of the variant with the most
    # games ("last" skips NULLs).
    if "recent_team" in dedup_df.columns:
        dedup_df = dedup_df.sort_values("games_played", na_position="first", kind="stable")
        agg_dict["recent_team"] = "last"
    dedup_df = dedup_df.groupby(["player_id", "season"], as_index=False).agg(agg_dict)
    # Recalculate total_points and ppg after summing
    dedup_df["total_points"] = dedup_df.apply(
        lambda r: round(calc_half_ppr_points(r.to_dict()), 2), axis=1
    )
    # pandas sum() promotes int columns with NaN to float64 — cast back to int|None
    # (the EPA totals are genuinely fractional, so they stay floats).
    for col in present_sum:
        cast = _safe_float if col in STAT_MODEL_FLOAT_COLS else _safe_int
        dedup_df[col] = dedup_df[col].apply(cast)
    # mean() of all-NaN groups produces NaN — JSON can't encode it.
    for col in present_avg:
        dedup_df[col] = dedup_df[col].apply(_safe_float)
    dedup_df["ppg"] = dedup_df.apply(
        lambda r: round(r["total_points"] / r["games_played"], 2)
        if r.get("games_played") else 0.0,
        axis=1,
    )
    upsert_rows = dedup_df.to_dict(orient="records")
    # Replace any lingering NaN floats (pandas float64 columns can't hold None)
    # with None so JSON encoding succeeds.
    for r in upsert_rows:
        for k, v in list(r.items()):
            if isinstance(v, float) and math.isnan(v):
                r[k] = None
    return upsert_rows


def plan_team_fills(
    processed: pd.DataFrame,
    name_by_id: dict[str, str],
    existing: list[dict],
) -> dict[tuple[int, str], list[str]]:
    """Group nfl_stats row ids whose recent_team is NULL by the team to set.

    ``processed`` is ``process_stats`` output (one row per display name and
    season, with ``recent_team``). Each existing row is matched through its own
    player's name (``name_by_id``: players.id -> name), so two player rows that
    share a name both get filled. Rows that already carry a team are left alone.
    Returns ``{(season, team): [row ids]}``.
    """
    team_by_key: dict[tuple[str, int], tuple[float, str]] = {}
    for row in processed.itertuples(index=False):
        team = getattr(row, "recent_team", None)
        if not team or pd.isna(team):
            continue
        key = (normalize_player_name(str(row.player_display_name)), int(row.season))
        games = float(getattr(row, "games_played", 0) or 0)
        # Two name variants can normalize alike; keep the team with more games.
        if key not in team_by_key or games > team_by_key[key][0]:
            team_by_key[key] = (games, str(team))

    plan: dict[tuple[int, str], list[str]] = {}
    for r in existing:
        if r.get("recent_team"):
            continue
        name = name_by_id.get(r["player_id"])
        if not name:
            continue
        match = team_by_key.get((normalize_player_name(name), int(r["season"])))
        if match:
            plan.setdefault((int(r["season"]), match[1]), []).append(r["id"])
    return plan


def fill_missing_recent_team(seasons: list[int], dry_run: bool = False) -> None:
    """Set nfl_stats.recent_team where it is NULL, from nflverse. Touches nothing else."""
    from scripts.config import fetch_all_rows

    supabase = get_supabase_client()
    name_by_id = {p["id"]: p["name"] for p in fetch_all_rows(supabase, "players", "id, name")}
    total = 0
    for year in seasons:
        stats = load_stats(year)
        if stats is None:
            continue
        processed = process_stats(stats)
        existing = fetch_all_rows(
            supabase, "nfl_stats", "id, player_id, season, recent_team",
            filters=[("eq", "season", year)],
        )
        plan = plan_team_fills(processed, name_by_id, existing)
        n = sum(len(ids) for ids in plan.values())
        missing = sum(1 for r in existing if not r.get("recent_team"))
        print(f"  {year}: {missing} rows missing a team, {n} fillable")
        total += n
        if dry_run:
            continue
        for (_season, team), ids in plan.items():
            for i in range(0, len(ids), 200):
                (
                    supabase.table("nfl_stats")
                    .update({"recent_team": team})
                    .in_("id", ids[i:i + 200])
                    .is_("recent_team", "null")
                    .execute()
                )
    verb = "Would fill" if dry_run else "Filled"
    print(f"\n{verb} recent_team on {total} rows.")


def backfill_seasons(
    seasons: list[int],
    dry_run: bool = False,
    skip_create_players: bool = False,
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
    if skip_create_players:
        print("  Skipping player creation (skip_create_players=True).")
    else:
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
    snap_by_season: dict[int, dict[str, dict]] = {}
    for year, snaps_df in all_snap_frames.items():
        snap_agg = process_snap_counts(snaps_df)
        if not snap_agg.empty:
            # Store as dict for O(1) lookup: player_normalized -> snap_row_dict
            snap_by_season[year] = snap_agg.set_index("player_normalized").to_dict("index")

    # Build upsert rows
    matched = 0
    unmatched_names: set[str] = set()
    upsert_rows: list[dict] = []

    for row in processed.itertuples(index=False):
        raw_name = str(getattr(row, "player_display_name", ""))
        norm_name = normalize_player_name(raw_name)
        player_uuid = player_lookup.get(norm_name)

        if not player_uuid:
            unmatched_names.add(raw_name)
            continue

        season = int(row.season)

        stat_row: dict = {
            "player_id": player_uuid,
            "season": season,
            "games_played": _safe_int(getattr(row, "games_played", None)),
            "passing_yards": _safe_int(getattr(row, "passing_yards", None)),
            "passing_tds": _safe_int(getattr(row, "passing_tds", None)),
            "interceptions": _safe_int(getattr(row, "interceptions", None)),
            "rushing_yards": _safe_int(getattr(row, "rushing_yards", None)),
            "rushing_tds": _safe_int(getattr(row, "rushing_tds", None)),
            "rushing_attempts": _safe_int(getattr(row, "rushing_attempts", None)),
            "receptions": _safe_int(getattr(row, "receptions", None)),
            "receiving_yards": _safe_int(getattr(row, "receiving_yards", None)),
            "receiving_tds": _safe_int(getattr(row, "receiving_tds", None)),
            "targets": _safe_int(getattr(row, "targets", None)),
            "fg_made_0_39": _safe_int(getattr(row, "fg_made_0_39", None)),
            "fg_made_40_49": _safe_int(getattr(row, "fg_made_40_49", None)),
            "fg_made_50_plus": _safe_int(getattr(row, "fg_made_50_plus", None)),
            "pat_made": _safe_int(getattr(row, "pat_made", None)),
            "passing_attempts": _safe_int(getattr(row, "passing_attempts", None)),
            "completions": _safe_int(getattr(row, "completions", None)),
            "receiving_air_yards": _safe_int(getattr(row, "receiving_air_yards", None)),
            "target_share": _safe_float(getattr(row, "target_share", None)),
            "air_yards_share": _safe_float(getattr(row, "air_yards_share", None)),
            "wopr": _safe_float(getattr(row, "wopr", None)),
            "racr": _safe_float(getattr(row, "racr", None)),
            **{key: _safe_int(getattr(row, key, None)) for key in EXTRA_KEYS},
            **{key: _safe_int(getattr(row, key, None)) for key in STAT_MODEL_INT_COLS},
            **{key: _safe_float(getattr(row, key, None)) for key in STAT_MODEL_FLOAT_COLS},
        }

        # Preserve recent_team for historical team tracking
        recent_team = getattr(row, "recent_team", None)
        if recent_team and pd.notna(recent_team):
            stat_row["recent_team"] = str(recent_team)

        # Calculate fantasy points
        stat_row["total_points"] = round(calc_half_ppr_points(stat_row), 2)
        games = stat_row.get("games_played") or 0
        stat_row["ppg"] = round(stat_row["total_points"] / games, 2) if games > 0 else 0.0

        # Merge snap counts if available (O(1) lookup)
        season_snaps = snap_by_season.get(season)
        if season_snaps:
            snap_row = season_snaps.get(norm_name)
            if snap_row:
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
    upsert_rows = dedup_stat_rows(upsert_rows)
    if upsert_rows:
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
    # nfl_stats has no updated_at trigger, so stamp it here; otherwise it keeps
    # the insert time forever and "most recently written" can't be told apart.
    written_at = pd.Timestamp.now(tz="UTC").isoformat()
    for r in upsert_rows:
        r["updated_at"] = written_at
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
    parser.add_argument(
        "--fill-missing-teams", action="store_true",
        help="Only set recent_team on rows where it is NULL; leave every other column alone",
    )
    args = parser.parse_args()

    if args.fill_missing_teams:
        print(f"Filling missing nfl_stats.recent_team for seasons {args.seasons} (dry run: {args.dry_run})")
        fill_missing_recent_team(args.seasons, dry_run=args.dry_run)
        return

    print(f"NFL Stats Backfill")
    print(f"  Seasons: {args.seasons}")
    print(f"  Dry run: {args.dry_run}")
    print()

    backfill_seasons(args.seasons, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
