"""Backfill NFL draft pick metadata from nflverse into the draft_capital table.

Draft capital is a strong predictor of rookie/early-career performance — a 1st-round
WR has fundamentally different opportunity expectations than a 5th-rounder. The
existing rookie growth curves are neutral because age_curve and regression_to_mean
already capture the available statistical signal. Draft capital is orthogonal
information available from the moment a player enters the league. GH #376.

Usage:
    python scripts/backfill_draft_capital.py             # All seasons (default 2010+)
    python scripts/backfill_draft_capital.py --since 2015
    python scripts/backfill_draft_capital.py --dry-run   # Parse only, no DB writes
"""

from __future__ import annotations

import argparse
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.config import get_supabase_client, fetch_all_rows
from scripts.name_utils import normalize_player_name

DRAFT_PICKS_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "draft_picks/draft_picks.parquet"
)

DEFAULT_SINCE_SEASON = 2010

# Map nflverse draft positions to the fantasy-relevant Ottoneu positions
# we project. Special teamers and defensive players are dropped.
FANTASY_POSITIONS = {"QB", "RB", "WR", "TE", "K"}


def load_draft_picks(since_season: int) -> pd.DataFrame:
    df = pd.read_parquet(DRAFT_PICKS_URL)
    df = df[df["season"] >= since_season].copy()
    df = df[df["position"].isin(FANTASY_POSITIONS)].copy()
    return df


def build_player_lookup(supabase) -> dict[tuple[str, str], str]:
    """Return (normalized_name, position) -> player_id.

    Position is part of the key because drafted player names occasionally
    collide across positions (e.g. multiple "Mike Williams" entries) and
    matching by name alone would assign draft capital to the wrong player.
    """
    rows = fetch_all_rows(supabase, "players", "id, name, position")
    lookup: dict[tuple[str, str], str] = {}
    for r in rows:
        if not r.get("name") or not r.get("position"):
            continue
        key = (normalize_player_name(r["name"]), r["position"])
        # First match wins; duplicates within the same (name, position) are rare
        # but if they happen we don't have a way to disambiguate further here.
        lookup.setdefault(key, r["id"])
    return lookup


def match_picks_to_players(
    picks_df: pd.DataFrame,
    player_lookup: dict[tuple[str, str], str],
) -> tuple[list[dict], list[dict]]:
    matched: list[dict] = []
    unmatched: list[dict] = []

    for row in picks_df.itertuples(index=False):
        name = str(getattr(row, "pfr_player_name", "") or "").strip()
        if not name:
            continue
        position = str(getattr(row, "position", "") or "").strip()
        if position not in FANTASY_POSITIONS:
            continue

        norm = normalize_player_name(name)
        player_id = player_lookup.get((norm, position))
        record = {
            "player_id": player_id,
            "season_drafted": int(row.season),
            "round": int(row.round),
            "overall_pick": int(row.pick),
            "_name": name,
            "_position": position,
        }
        if player_id:
            matched.append(record)
        else:
            unmatched.append(record)

    return matched, unmatched


def upsert_draft_capital(supabase, rows: list[dict]) -> None:
    if not rows:
        print("  No rows to upsert.")
        return

    payload = [
        {
            "player_id": r["player_id"],
            "season_drafted": r["season_drafted"],
            "round": r["round"],
            "overall_pick": r["overall_pick"],
        }
        for r in rows
    ]

    batch_size = 200
    for i in range(0, len(payload), batch_size):
        batch = payload[i : i + batch_size]
        supabase.table("draft_capital").upsert(
            batch, on_conflict="player_id"
        ).execute()
        if (i // batch_size) % 10 == 0:
            print(f"  Batch {i // batch_size + 1} / {(len(payload) + batch_size - 1) // batch_size}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill draft capital from nflverse draft_picks."
    )
    parser.add_argument(
        "--since", type=int, default=DEFAULT_SINCE_SEASON,
        help=f"Earliest draft season to ingest (default: {DEFAULT_SINCE_SEASON})",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Parse and match without writing to the database",
    )
    args = parser.parse_args()

    print(f"Draft Capital Backfill (since={args.since}, dry_run={args.dry_run})")

    print("\nLoading draft picks parquet from nflverse...")
    picks = load_draft_picks(args.since)
    print(f"  {len(picks)} fantasy-position picks since {args.since}")

    supabase = get_supabase_client()

    print("\nBuilding player lookup from DB...")
    player_lookup = build_player_lookup(supabase)
    print(f"  {len(player_lookup)} (name, position) keys")

    print("\nMatching picks to players...")
    matched, unmatched = match_picks_to_players(picks, player_lookup)
    print(f"  Matched: {len(matched)}")
    print(f"  Unmatched: {len(unmatched)}")
    if unmatched:
        sample = unmatched[:10]
        for u in sample:
            print(f"    UNMATCHED {u['season_drafted']} R{u['round']}.{u['overall_pick']:03d} "
                  f"{u['_name']} ({u['_position']})")

    if args.dry_run:
        print(f"\n[DRY RUN] Would upsert {len(matched)} draft_capital rows.")
        for r in matched[:5]:
            print(f"    {r['season_drafted']} R{r['round']}.{r['overall_pick']:03d} "
                  f"{r['_name']} ({r['_position']}) -> {r['player_id']}")
        return

    print(f"\nUpserting {len(matched)} rows to draft_capital...")
    upsert_draft_capital(supabase, matched)
    print("Done.")


if __name__ == "__main__":
    main()
