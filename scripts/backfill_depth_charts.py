"""Backfill opening-day NFL depth-chart position from nflverse.

Pulls each player's **Week 1 regular-season** offensive depth-team rank from
`nfl_data_py.import_depth_charts` and stores one row per (player, season) in
`depth_charts`. Depth-team 1 = starter, 2 = backup, 3 = third string.

Why Week 1 REG: it is the opening-day role, *set before any of the projected
season's games are played*, so it is a clean forward-looking signal with no
target-season stat leakage. It captures role changes the 3-year weighted-PPG
model is blind to — a free-agent RB promoted to starter, a rookie WR who wins
a Week 1 job, a QB who beats out the incumbent. nflverse depth charts have no
preseason (PRE) game_type, so Week 1 REG is the earliest available snapshot.
GH #391.

Player mapping mirrors `backfill_nfl_stats`: nflverse `full_name` is
normalized via `scripts.name_utils.normalize_player_name` and matched against
the `players` table. Unmatched names (defensive players, fringe roster guys
not in the Ottoneu universe) are dropped.

Usage:
    venv/bin/python scripts/backfill_depth_charts.py             # 2016+
    venv/bin/python scripts/backfill_depth_charts.py --since 2021
    venv/bin/python scripts/backfill_depth_charts.py --dry-run
"""

from __future__ import annotations

import argparse
from typing import Dict, Optional

import pandas as pd

from scripts.config import fetch_all_rows, get_supabase_client
from scripts.name_utils import normalize_player_name

DEFAULT_SINCE_SEASON = 2016
SKILL_POSITIONS = {"QB", "RB", "WR", "TE"}
SNAPSHOT_WEEK = 1

# Approximate starters per position on an NFL offense. Used to normalize the
# 2025+ global per-position rank (`pos_rank`) into the same 3-tier scale as the
# pre-2025 per-slot `depth_team` (1 = starter, 2 = backup, 3 = deep reserve),
# so the feature's learned coefficient transfers across the format change.
STARTERS_PER_POSITION = {"QB": 1, "RB": 1, "TE": 1, "WR": 3, "FB": 1}


def build_player_lookup(supabase) -> Dict[str, str]:
    """Return normalized_name -> player uuid for all players in the DB."""
    players = fetch_all_rows(supabase, "players", "id, name")
    lookup: Dict[str, str] = {}
    for p in players:
        lookup[normalize_player_name(p["name"])] = p["id"]
    return lookup


def _tier_from_rank(position: str, rank: int) -> int:
    """Map a global per-position rank to a 1/2/3 depth tier."""
    starters = STARTERS_PER_POSITION.get(position, 1)
    if rank <= starters:
        return 1
    if rank <= 2 * starters:
        return 2
    return 3


def _normalize_legacy(df: pd.DataFrame, season: int) -> pd.DataFrame:
    """Normalize the pre-2025 schema (season/week/game_type/depth_team)."""
    df = df[df["game_type"] == "REG"]
    df = df[df["week"] == SNAPSHOT_WEEK]
    df = df[df["formation"] == "Offense"]
    df = df[df["position"].isin(SKILL_POSITIONS)]
    df = df.dropna(subset=["full_name", "depth_team", "club_code"]).copy()
    df["depth_team"] = pd.to_numeric(df["depth_team"], errors="coerce")
    df = df.dropna(subset=["depth_team"])
    out = pd.DataFrame({
        "season": season,
        "team": df["club_code"].astype(str),
        "position": df["position"].astype(str),
        "full_name": df["full_name"].astype(str),
        # Per-slot depth, clamped to the 3-tier scale.
        "depth_team": df["depth_team"].astype(int).clip(upper=3),
    })
    return out


def _normalize_modern(df: pd.DataFrame, season: int) -> pd.DataFrame:
    """Normalize the 2025+ snapshot schema (dt/pos_abb/pos_rank).

    Depth charts are now dated snapshots throughout the year. We take the
    latest snapshot on or before opening week (Sept 7) — the opening-day
    depth — and convert the global per-position `pos_rank` into the same
    1/2/3 tier as the legacy per-slot `depth_team`.
    """
    df = df.copy()
    df["dt"] = pd.to_datetime(df["dt"], utc=True)
    cutoff = pd.Timestamp(f"{season}-09-07", tz="UTC")
    eligible = df[df["dt"] <= cutoff]
    if eligible.empty:
        eligible = df  # season not yet started — use earliest available snapshot
        snap_dt = eligible["dt"].min()
    else:
        snap_dt = eligible["dt"].max()
    snap = eligible[eligible["dt"] == snap_dt]
    snap = snap[snap["pos_abb"].isin(SKILL_POSITIONS)]
    snap = snap.dropna(subset=["player_name", "pos_rank", "team"]).copy()
    snap["pos_rank"] = pd.to_numeric(snap["pos_rank"], errors="coerce")
    snap = snap.dropna(subset=["pos_rank"])
    out = pd.DataFrame({
        "season": season,
        "team": snap["team"].astype(str),
        "position": snap["pos_abb"].astype(str),
        "full_name": snap["player_name"].astype(str),
        "depth_team": [
            _tier_from_rank(pos, int(rank))
            for pos, rank in zip(snap["pos_abb"], snap["pos_rank"])
        ],
    })
    return out


def load_depth_charts(since_season: int, until_season: int) -> pd.DataFrame:
    """Load opening-day offensive depth tiers per season, handling both the
    pre-2025 (per-slot depth_team) and 2025+ (snapshot pos_rank) schemas."""
    import nfl_data_py as nfl

    frames = []
    for season in range(since_season, until_season + 1):
        try:
            raw = nfl.import_depth_charts([season])
        except Exception as e:  # pragma: no cover - network/availability
            print(f"  {season}: skipped ({type(e).__name__}: {e})")
            continue
        if raw is None or raw.empty:
            continue
        if "pos_rank" in raw.columns:
            frames.append(_normalize_modern(raw, season))
        elif "depth_team" in raw.columns:
            frames.append(_normalize_legacy(raw, season))
        else:
            print(f"  {season}: unrecognized depth-chart schema, skipping")
    if not frames:
        return pd.DataFrame(columns=["season", "team", "position", "full_name", "depth_team"])
    return pd.concat(frames, ignore_index=True)


def build_payload(
    df: pd.DataFrame, player_lookup: Dict[str, str]
) -> tuple[list, int, int]:
    """Map nflverse rows to depth_charts payload. Returns (payload, matched, unmatched)."""
    # One player can appear on multiple depth charts in a transition week;
    # keep their best (lowest) depth-team rank per season.
    rows: Dict[tuple, dict] = {}
    matched = 0
    unmatched_names: set = set()

    for r in df.itertuples(index=False):
        norm = normalize_player_name(str(r.full_name))
        player_id = player_lookup.get(norm)
        if not player_id:
            unmatched_names.add(str(r.full_name))
            continue
        matched += 1
        key = (player_id, int(r.season))
        depth = int(r.depth_team)
        existing = rows.get(key)
        if existing is None or depth < existing["depth_team"]:
            rows[key] = {
                "player_id": player_id,
                "season": int(r.season),
                "team": str(r.team),
                "position": str(r.position),
                "depth_team": depth,
                "week": SNAPSHOT_WEEK,
            }

    return list(rows.values()), matched, len(unmatched_names)


def upsert_depth_charts(supabase, payload: list, dry_run: bool) -> None:
    if not payload:
        print("  No rows to upsert.")
        return

    if dry_run:
        print(f"\n[DRY RUN] Would upsert {len(payload)} rows. Sample:")
        for p in payload[:8]:
            print(f"  {p}")
        return

    batch_size = 200
    total_batches = (len(payload) + batch_size - 1) // batch_size
    for i in range(0, len(payload), batch_size):
        batch = payload[i : i + batch_size]
        supabase.table("depth_charts").upsert(
            batch, on_conflict="player_id,season"
        ).execute()
        print(f"  Batch {i // batch_size + 1} / {total_batches}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill opening-day depth-chart position from nflverse."
    )
    parser.add_argument(
        "--since",
        type=int,
        default=DEFAULT_SINCE_SEASON,
        help=f"Earliest season to ingest (default: {DEFAULT_SINCE_SEASON})",
    )
    parser.add_argument(
        "--until",
        type=int,
        default=None,
        help="Latest season to ingest (default: latest available)",
    )
    parser.add_argument(
        "--current",
        action="store_true",
        help=(
            "Refresh only the current projection season (since = until = "
            "projection_season). Use for the scheduled offseason refresh so "
            "we re-pull just the upcoming season's evolving depth charts "
            "without re-touching every historical row."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Map and aggregate without writing to the database",
    )
    args = parser.parse_args()

    from scripts.season import projection_season, stats_season

    if args.current:
        since = until = projection_season()
    else:
        since = args.since
        until = args.until if args.until is not None else stats_season()
    print(f"Depth Charts Backfill (since={since}, until={until}, dry_run={args.dry_run})")

    supabase = get_supabase_client()
    player_lookup = build_player_lookup(supabase)
    print(f"  {len(player_lookup)} players in lookup")

    print("\nLoading nflverse depth charts (Week 1 REG, offense)...")
    df = load_depth_charts(since, until)
    seasons = sorted(df["season"].unique().tolist())
    print(f"  {len(df)} skill-position depth rows across seasons {seasons}")

    payload, matched, unmatched = build_payload(df, player_lookup)
    print(f"\nMatched {matched} rows -> {len(payload)} unique (player, season).")
    print(f"Unmatched names: {unmatched}")

    if payload:
        by_season = pd.DataFrame(payload).groupby("season").agg(
            players=("player_id", "count"),
            starters=("depth_team", lambda s: int((s == 1).sum())),
        )
        print("\nPer-season summary:")
        print(by_season.to_string())

    if args.dry_run:
        upsert_depth_charts(None, payload, dry_run=True)
        return

    print("\nUpserting to depth_charts...")
    upsert_depth_charts(supabase, payload, dry_run=False)
    print("Done.")


if __name__ == "__main__":
    main()
