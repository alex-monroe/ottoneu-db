#!/usr/bin/env python3
"""Backfill `players.gsis_id` (and `players.nflverse_birth_date`) from nfl_weekly_stats and nflverse registry.

The `players.gsis_id` column provides a canonical nflverse player identifier
(e.g. '00-0033873'), replacing fragile name-based matching for NFL stats and
play-by-play ingestion.

Resolution priority:
1. `nfl_weekly_stats`: 1-to-1 mapping for players with a single distinct gsis_id.
2. For collision players (e.g. Mike Williams, Josh Allen) where multiple gsis_ids
   exist under the same name: disambiguate using birth_date and position matching
   against the nflverse player registry.
3. For players without weekly rows (e.g. non-offensive skill players, historical
   players): match against nflverse player registry by (normalized_name, position,
   birth_date).
4. College players and unmatched prospects remain NULL until they enter the NFL.

Usage:
    venv/bin/python scripts/backfill_players_gsis_id.py --dry-run
    venv/bin/python scripts/backfill_players_gsis_id.py
    just backfill-players-gsis-id [--dry-run]
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from typing import Any

import pandas as pd

from scripts.config import fetch_all_rows, get_supabase_client
from scripts.keeper_value.nflverse import load_players
from scripts.name_utils import normalize_player_name


def resolve_players_gsis_id(
    players: list[dict[str, Any]],
    weekly_rows: list[dict[str, Any]],
    nflverse_players: pd.DataFrame,
) -> tuple[dict[str, str], dict[str, int]]:
    """Pure resolution mapping: player_id -> gsis_id.

    Returns:
        (mapping: {player_id: gsis_id}, stats: summary counters)
    """
    # 1. Map player_id -> set of gsis_ids from weekly stats
    p_to_weekly_gsis: dict[str, set[str]] = defaultdict(set)
    for r in weekly_rows:
        gid = r.get("gsis_id")
        pid = r.get("player_id")
        if gid and pid:
            p_to_weekly_gsis[pid].add(str(gid))

    # 2. Index nflverse registry by (normalized_name, position)
    nfl_lookup: dict[tuple[str, str], list[Any]] = defaultdict(list)
    df = nflverse_players.copy()
    if "display_name" in df.columns:
        df["norm_name"] = df["display_name"].astype(str).map(normalize_player_name)
    else:
        df["norm_name"] = ""

    for row in df.itertuples(index=False):
        norm = getattr(row, "norm_name", "")
        pos = getattr(row, "position", "")
        if norm and pos:
            nfl_lookup[(norm, str(pos))].append(row)

    mapping: dict[str, str] = {}
    stats = {
        "total_players": len(players),
        "from_weekly_single": 0,
        "from_weekly_collision_resolved": 0,
        "from_registry": 0,
        "unmatched": 0,
    }

    for p in players:
        pid = str(p["id"])
        norm = normalize_player_name(str(p.get("name") or ""))
        pos = str(p.get("position") or "")
        bdate = str(p.get("birth_date") or "").strip()
        team = str(p.get("nfl_team") or "").strip()

        weekly_gsis = p_to_weekly_gsis.get(pid, set())

        if len(weekly_gsis) == 1:
            mapping[pid] = next(iter(weekly_gsis))
            stats["from_weekly_single"] += 1
            continue

        if len(weekly_gsis) > 1:
            # Name collision in weekly stats (e.g. Mike Williams)
            # Find which gsis_id in weekly_gsis matches this player's birth date or team
            candidates = [
                r for r in nfl_lookup.get((norm, pos), [])
                if str(getattr(r, "gsis_id", "")) in weekly_gsis
            ]
            chosen_gid: str | None = None
            if bdate:
                bdate_matches = [
                    str(r.gsis_id) for r in candidates
                    if str(getattr(r, "birth_date", "") or "").strip() == bdate
                ]
                if len(bdate_matches) == 1:
                    chosen_gid = bdate_matches[0]

            if not chosen_gid and candidates:
                # If no unique birth date match, pick the most recent/active candidate
                # Sort by rookie_season or draft_year descending
                sorted_cands = sorted(
                    candidates,
                    key=lambda r: (
                        getattr(r, "rookie_season", 0) or 0,
                        getattr(r, "draft_year", 0) or 0,
                    ),
                    reverse=True,
                )
                chosen_gid = str(sorted_cands[0].gsis_id)

            if chosen_gid:
                mapping[pid] = chosen_gid
                stats["from_weekly_collision_resolved"] += 1
            else:
                mapping[pid] = next(iter(weekly_gsis))
                stats["from_weekly_single"] += 1
            continue

        # No weekly rows: try matching against nflverse registry
        reg_cands = nfl_lookup.get((norm, pos), [])
        if len(reg_cands) == 1:
            mapping[pid] = str(reg_cands[0].gsis_id)
            stats["from_registry"] += 1
            continue

        if len(reg_cands) > 1 and bdate:
            bdate_matches = [
                str(r.gsis_id) for r in reg_cands
                if str(getattr(r, "birth_date", "") or "").strip() == bdate
            ]
            if len(bdate_matches) == 1:
                mapping[pid] = bdate_matches[0]
                stats["from_registry"] += 1
                continue

        stats["unmatched"] += 1

    return mapping, stats


def resolve_nflverse_birth_dates(
    gsis_by_player: dict[str, str], nflverse_players: pd.DataFrame
) -> dict[str, str]:
    """player id → nflverse registry birth date (ISO), for players with a gsis_id.

    Players whose gsis_id is missing from the registry, or whose registry row has
    no birth date, are left out. Feeds ``players.nflverse_birth_date`` (migration
    064), which only the stat_* models read; ``players.birth_date`` is untouched.
    """
    registry = nflverse_players.dropna(subset=["gsis_id", "birth_date"])
    by_gsis = {
        str(g): str(pd.Timestamp(b).date())
        for g, b in zip(registry["gsis_id"], registry["birth_date"])
        if str(b).strip()
    }
    return {pid: by_gsis[g] for pid, g in gsis_by_player.items() if g and g in by_gsis}


def backfill_players_gsis_id(
    supabase,
    dry_run: bool = False,
    batch_size: int = 200,
) -> dict[str, Any]:
    """Execute backfill of players.gsis_id."""
    print("Fetching players from DB...")
    players = fetch_all_rows(
        supabase,
        "players",
        "id, name, position, nfl_team, birth_date, ottoneu_id, gsis_id, is_college, nflverse_birth_date",
    )
    print(f"  Loaded {len(players)} players.")

    print("Fetching nfl_weekly_stats from DB...")
    weekly_rows = fetch_all_rows(
        supabase,
        "nfl_weekly_stats",
        "player_id, gsis_id",
    )
    print(f"  Loaded {len(weekly_rows)} weekly stat records.")

    print("Loading nflverse players registry...")
    nflverse_players = load_players()
    print(f"  Loaded {len(nflverse_players)} nflverse registry rows.")

    mapping, stats = resolve_players_gsis_id(players, weekly_rows, nflverse_players)

    print("\nResolution Summary:")
    print(f"  Total players:                     {stats['total_players']}")
    print(f"  Single weekly match:               {stats['from_weekly_single']}")
    print(f"  Weekly collisions resolved:        {stats['from_weekly_collision_resolved']}")
    print(f"  Resolved from registry:            {stats['from_registry']}")
    print(f"  Total resolved:                    {len(mapping)} ({len(mapping) / stats['total_players']:.1%})")
    print(f"  Unmatched (college/unrostered):    {stats['unmatched']}")

    # Final gsis_id per player (new resolution wins), then registry birth dates.
    existing_map = {p["id"]: p.get("gsis_id") for p in players}
    final_gsis = {**{k: v for k, v in existing_map.items() if v}, **mapping}
    birth_dates = resolve_nflverse_birth_dates(final_gsis, nflverse_players)
    existing_bd = {p["id"]: p.get("nflverse_birth_date") for p in players}
    print(f"  nflverse birth dates resolved:     {len(birth_dates)}")

    players_dict = {p["id"]: p for p in players}
    changed = {
        pid for pid in players_dict
        if (pid in mapping and existing_map.get(pid) != mapping[pid])
        or (pid in birth_dates and existing_bd.get(pid) != birth_dates[pid])
    }
    # Upsert carries the NOT NULL columns so a conflict-update never trips them.
    updates_needed = [
        {
            "id": pid,
            "ottoneu_id": players_dict[pid]["ottoneu_id"],
            "name": players_dict[pid]["name"],
            "position": players_dict[pid]["position"],
            "nfl_team": players_dict[pid].get("nfl_team"),
            "birth_date": players_dict[pid].get("birth_date"),
            "is_college": players_dict[pid].get("is_college", False),
            "gsis_id": final_gsis.get(pid),
            "nflverse_birth_date": birth_dates.get(pid, existing_bd.get(pid)),
        }
        for pid in sorted(changed)
    ]
    print(f"\n  Players requiring gsis_id / nflverse_birth_date update: {len(updates_needed)}")

    if dry_run:
        print("Dry run requested — skipping database writes.")
        return {"stats": stats, "updated": 0, "dry_run": True}

    if not updates_needed:
        print("All players already have matching gsis_id — no writes needed.")
        return {"stats": stats, "updated": 0, "dry_run": False}

    print(f"Applying {len(updates_needed)} updates in batches of {batch_size}...")
    for i in range(0, len(updates_needed), batch_size):
        batch = updates_needed[i : i + batch_size]
        supabase.table("players").upsert(batch).execute()

    print(f"Successfully updated {len(updates_needed)} players.")
    return {"stats": stats, "updated": len(updates_needed), "dry_run": False}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute gsis_id mapping without writing to the database",
    )
    args = parser.parse_args()

    sb = get_supabase_client()
    backfill_players_gsis_id(sb, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
