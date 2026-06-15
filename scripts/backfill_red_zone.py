"""Backfill per-player-season red-zone / goal-line usage from nflverse PBP.

Red-zone usage (issue #671) is the role-based, leakage-free opportunity signal a
same-data model cannot derive from a player's own PPG history: a goal-line back
*should* score more rushing TDs — durable role, not luck. It feeds the xFP base
(the #667 spike's "new information" lever) which replaces realized TDs with
red-zone-usage-expected TDs.

Source: nflverse play-by-play (`nfl_data_py.import_pbp_data`). For each season we
count, per player, plays inside the 20 (red zone) and inside the 10 (goal line):

    rz_carries / rz_targets / rz_pass_attempts   (yardline_100 <= 20)
    gz_carries / gz_targets                      (yardline_100 <= 10)

Player mapping mirrors `backfill_depth_charts` / `backfill_nfl_stats`: PBP rows
carry **gsis** ids (`rusher_player_id` etc.) and *abbreviated* names ("C.McCaffrey"),
so we aggregate by gsis id, crosswalk gsis → full name via that season's roster
(`import_seasonal_rosters` — covers the current season, which weekly stats don't
publish until later), then normalize the full name and match it to `players`.
Unmatched ids (punters/defenders credited on RZ special-teams/defensive plays,
plus the occasional name variant) are dropped — ≈99% of skill-position RZ usage
matches.

Usage:
    venv/bin/python scripts/backfill_red_zone.py --seasons 2018-2025
    venv/bin/python scripts/backfill_red_zone.py --seasons 2024 --dry-run
"""

from __future__ import annotations

import argparse

import nfl_data_py as nfl
import pandas as pd

from scripts.config import fetch_all_rows, get_supabase_client
from scripts.name_utils import normalize_player_name

RED_ZONE_YARDLINE = 20
GOAL_LINE_YARDLINE = 10

_PBP_COLUMNS = [
    "season",
    "yardline_100",
    "rush_attempt",
    "pass_attempt",
    "rusher_player_id",
    "receiver_player_id",
    "passer_player_id",
]

# Per-player counter keys, in the order written to the table.
_FIELDS = ("rz_carries", "rz_targets", "rz_pass_attempts", "gz_carries", "gz_targets")


def _new_counts() -> dict[str, int]:
    return {f: 0 for f in _FIELDS}


def aggregate_red_zone(pbp: pd.DataFrame) -> dict[str, dict[str, int]]:
    """Aggregate red-zone / goal-line usage by gsis player id (pure function).

    Returns ``{gsis_id: {rz_carries, rz_targets, rz_pass_attempts, gz_carries,
    gz_targets}}``. A player accumulates across roles (an RB with both RZ carries
    and RZ targets gets both). Rows with a null player id for the relevant role
    are skipped.
    """
    counts: dict[str, dict[str, int]] = {}

    def bump(pid, field: str) -> None:
        if pid is None or (isinstance(pid, float) and pd.isna(pid)):
            return
        counts.setdefault(str(pid), _new_counts())[field] += 1

    yl = pd.to_numeric(pbp["yardline_100"], errors="coerce")
    rush = pd.to_numeric(pbp["rush_attempt"], errors="coerce").fillna(0) == 1
    pass_ = pd.to_numeric(pbp["pass_attempt"], errors="coerce").fillna(0) == 1
    in_rz = yl <= RED_ZONE_YARDLINE
    in_gz = yl <= GOAL_LINE_YARDLINE

    for pid in pbp.loc[in_rz & rush, "rusher_player_id"]:
        bump(pid, "rz_carries")
    for pid in pbp.loc[in_rz & pass_, "receiver_player_id"]:
        bump(pid, "rz_targets")
    for pid in pbp.loc[in_rz & pass_, "passer_player_id"]:
        bump(pid, "rz_pass_attempts")
    for pid in pbp.loc[in_gz & rush, "rusher_player_id"]:
        bump(pid, "gz_carries")
    for pid in pbp.loc[in_gz & pass_, "receiver_player_id"]:
        bump(pid, "gz_targets")

    return counts


def build_player_lookup(supabase) -> dict[str, str]:
    """normalized player name -> player uuid (mirrors backfill_depth_charts)."""
    return {
        normalize_player_name(p["name"]): p["id"]
        for p in fetch_all_rows(supabase, "players", "id, name")
        if p.get("name")
    }


def gsis_name_crosswalk(season: int) -> dict[str, str]:
    """gsis player id -> full name, from that season's roster.

    Uses ``import_seasonal_rosters`` (gsis ``player_id`` + ``player_name``) rather
    than weekly data: rosters publish for the current season before the weekly
    stats parquet does, so this also covers the most recent season (weekly 404s
    for it in the offseason).
    """
    roster = nfl.import_seasonal_rosters([season])
    return {
        str(pid): str(name)
        for pid, name in zip(roster["player_id"], roster["player_name"])
        if pid and name
    }


def map_to_payload(
    counts: dict[str, dict[str, int]],
    crosswalk: dict[str, str],
    player_lookup: dict[str, str],
    season: int,
) -> tuple[list[dict], int, int]:
    """Map gsis-keyed counts to red_zone_usage rows. Returns (payload, matched, unmatched)."""
    payload: list[dict] = []
    matched = 0
    unmatched = 0
    for gsis_id, c in counts.items():
        name = crosswalk.get(gsis_id)
        player_id = player_lookup.get(normalize_player_name(name)) if name else None
        if not player_id:
            unmatched += 1
            continue
        matched += 1
        payload.append({"player_id": player_id, "season": season, **c})
    return payload, matched, unmatched


def backfill(seasons: list[int], dry_run: bool = False) -> None:
    supabase = get_supabase_client()
    player_lookup = build_player_lookup(supabase)
    print(f"{len(player_lookup)} players in lookup")

    for season in seasons:
        try:
            pbp = nfl.import_pbp_data([season], columns=_PBP_COLUMNS, downcast=True)
            counts = aggregate_red_zone(pbp)
            crosswalk = gsis_name_crosswalk(season)
            payload, matched, unmatched = map_to_payload(counts, crosswalk, player_lookup, season)
        except Exception as e:  # noqa: BLE001 — skip a season the source can't provide
            print(f"  {season}: skipped ({type(e).__name__}: {e})")
            continue

        print(f"  {season}: {matched} matched, {unmatched} unmatched ({len(payload)} rows)")
        if dry_run or not payload:
            continue

        # pagination-safe: writes (upsert), not reads; batched to stay well under limits.
        for i in range(0, len(payload), 500):
            supabase.table("red_zone_usage").upsert(
                payload[i : i + 500], on_conflict="player_id,season"
            ).execute()
    if dry_run:
        print("Dry run — nothing written.")


def _parse_seasons(spec: str) -> list[int]:
    """'2018-2025' or '2024' or '2022,2024' → list of ints."""
    out: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            lo, hi = part.split("-")
            out.extend(range(int(lo), int(hi) + 1))
        else:
            out.append(int(part))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill red_zone_usage from nflverse PBP (#671)")
    parser.add_argument("--seasons", default="2018-2025", help="e.g. 2018-2025 or 2024 or 2022,2024")
    parser.add_argument("--dry-run", action="store_true", help="Aggregate + map without writing")
    args = parser.parse_args()
    backfill(_parse_seasons(args.seasons), dry_run=args.dry_run)


if __name__ == "__main__":
    main()
