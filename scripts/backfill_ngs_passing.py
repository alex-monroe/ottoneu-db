"""Backfill per-player-season NFL Next Gen Stats passing metrics from nflverse.

NGS passing (issue #674) is the *stabilized, less-luck-driven* measure of QB
skill the #667 spike's "new information" track was looking for: CPOE, air-yards-
to-sticks, aggressiveness, time-to-throw and the completed-vs-intended air-yards
differential are more persistent year-to-year than the realized efficiency
(comp %, YPA, TD rate) already baked into a QB's own PPG history. They feed a
QB-only feature stacked on v44_eb_pooling_perpos (the best QB model).

Source: nflverse Next Gen Stats (`nfl_data_py.import_ngs_data(stat_type=
"passing")`). NGS publishes a per-(player, season) *regular-season aggregate*
row identified by ``week == 0`` and ``season_type == 'REG'``; we take exactly
that row per qualified passer (the source only publishes passers above its own
attempt threshold).

Player mapping is simpler than the red-zone PBP backfill: NGS rows already carry
the full ``player_display_name`` (not the abbreviated PBP form), so we normalize
that name and match it directly to `players` — no gsis→name roster crosswalk
needed. ``player_gsis_id`` is retained only as a tie-break log. Unmatched names
(the occasional spelling variant) are dropped.

Usage:
    venv/bin/python scripts/backfill_ngs_passing.py --seasons 2018-2025
    venv/bin/python scripts/backfill_ngs_passing.py --seasons 2024 --dry-run
"""

from __future__ import annotations

import argparse

import nfl_data_py as nfl
import pandas as pd

from scripts.config import fetch_all_rows, get_supabase_client
from scripts.name_utils import normalize_player_name

# NGS source column -> our table column. The table column order is also the
# write order. attempts is stored as an int; the rest are real.
_COLUMN_MAP = {
    "attempts": "attempts",
    "completion_percentage_above_expectation": "completion_pct_above_expectation",
    "avg_air_yards_to_sticks": "avg_air_yards_to_sticks",
    "aggressiveness": "aggressiveness",
    "avg_time_to_throw": "avg_time_to_throw",
    "avg_air_yards_differential": "avg_air_yards_differential",
    "avg_completed_air_yards": "avg_completed_air_yards",
    "avg_intended_air_yards": "avg_intended_air_yards",
    "expected_completion_percentage": "expected_completion_pct",
    "max_completed_air_distance": "max_completed_air_distance",
    "passer_rating": "passer_rating",
}


def season_aggregate(ngs: pd.DataFrame) -> pd.DataFrame:
    """Return the per-player regular-season aggregate rows (pure function).

    NGS season-aggregate rows are ``week == 0`` with ``season_type == 'REG'`` —
    one per qualified passer. Weekly rows (week >= 1) and postseason rows are
    dropped so we never double-count.
    """
    if ngs.empty:
        return ngs
    week = pd.to_numeric(ngs["week"], errors="coerce")
    return ngs[(week == 0) & (ngs["season_type"] == "REG")]


def build_player_lookup(supabase) -> dict[str, str]:
    """normalized player name -> player uuid (mirrors backfill_red_zone)."""
    return {
        normalize_player_name(p["name"]): p["id"]
        for p in fetch_all_rows(supabase, "players", "id, name")
        if p.get("name")
    }


def _num(val, *, integer: bool = False):
    """Coerce a value to int/float, or None when missing/NaN."""
    if val is None or (isinstance(val, float) and pd.isna(val)) or pd.isna(val):
        return None
    return int(val) if integer else float(val)


def map_to_payload(
    agg: pd.DataFrame,
    player_lookup: dict[str, str],
    season: int,
) -> tuple[list[dict], int, int]:
    """Map NGS aggregate rows to ngs_passing rows. Returns (payload, matched, unmatched)."""
    payload: list[dict] = []
    matched = 0
    unmatched = 0
    for _, row in agg.iterrows():
        name = row.get("player_display_name")
        player_id = player_lookup.get(normalize_player_name(name)) if name else None
        if not player_id:
            unmatched += 1
            continue
        matched += 1
        rec: dict = {"player_id": player_id, "season": season}
        for src, dst in _COLUMN_MAP.items():
            rec[dst] = _num(row.get(src), integer=(dst == "attempts"))
        rec["attempts"] = rec["attempts"] or 0
        payload.append(rec)
    return payload, matched, unmatched


def backfill(seasons: list[int], dry_run: bool = False) -> None:
    supabase = get_supabase_client()
    player_lookup = build_player_lookup(supabase)
    print(f"{len(player_lookup)} players in lookup")

    for season in seasons:
        try:
            ngs = nfl.import_ngs_data(stat_type="passing", years=[season])
            agg = season_aggregate(ngs)
            payload, matched, unmatched = map_to_payload(agg, player_lookup, season)
        except Exception as e:  # noqa: BLE001 — skip a season the source can't provide
            print(f"  {season}: skipped ({type(e).__name__}: {e})")
            continue

        print(f"  {season}: {matched} matched, {unmatched} unmatched ({len(payload)} rows)")
        if dry_run or not payload:
            continue

        # pagination-safe: writes (upsert), not reads; batched to stay well under limits.
        for i in range(0, len(payload), 500):
            supabase.table("ngs_passing").upsert(
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
    parser = argparse.ArgumentParser(description="Backfill ngs_passing from nflverse NGS (#674)")
    parser.add_argument("--seasons", default="2018-2025", help="e.g. 2018-2025 or 2024 or 2022,2024")
    parser.add_argument("--dry-run", action="store_true", help="Aggregate + map without writing")
    args = parser.parse_args()
    backfill(_parse_seasons(args.seasons), dry_run=args.dry_run)


if __name__ == "__main__":
    main()
