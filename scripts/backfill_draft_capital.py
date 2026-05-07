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

For a fresh draft (e.g. immediately post-draft), pass --update-rosters to also
flip matched players from college to NFL (is_college=False, nfl_team=<NFL>) and
insert player rows for any picks not already in our DB:
    python scripts/backfill_draft_capital.py --since 2026 --update-rosters
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.config import get_supabase_client, fetch_all_rows
from scripts.name_utils import normalize_player_name

# nflverse uses different team abbreviations than Ottoneu/our DB.
# Map nflverse codes to the codes stored in players.nfl_team.
NFLVERSE_TO_OTTONEU_TEAM = {
    "GNB": "GB",
    "JAX": "JAC",
    "KAN": "KC",
    "LAR": "LA",
    "LVR": "LV",
    "NOR": "NO",
    "NWE": "NE",
    "SFO": "SF",
    "TAM": "TB",
}

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

        nflverse_team = str(getattr(row, "team", "") or "").strip()
        ottoneu_team = NFLVERSE_TO_OTTONEU_TEAM.get(nflverse_team, nflverse_team)
        nflverse_id = (
            str(getattr(row, "pfr_player_id", "") or "")
            or str(getattr(row, "cfb_player_id", "") or "")
            or str(getattr(row, "gsis_id", "") or "")
            or name
        )

        norm = normalize_player_name(name)
        player_id = player_lookup.get((norm, position))
        record = {
            "player_id": player_id,
            "season_drafted": int(row.season),
            "round": int(row.round),
            "overall_pick": int(row.pick),
            "_name": name,
            "_position": position,
            "_nfl_team": ottoneu_team,
            "_nflverse_id": nflverse_id,
        }
        if player_id:
            matched.append(record)
        else:
            unmatched.append(record)

    return matched, unmatched


def _generate_synthetic_ottoneu_id(seed: str) -> int:
    """Stable negative ottoneu_id from a string seed (mirrors backfill_nfl_stats)."""
    h = hashlib.md5(seed.encode()).hexdigest()
    return -abs(int(h[:7], 16))


def update_existing_players(
    supabase, matched: list[dict], dry_run: bool
) -> int:
    """Flip matched college players to NFL with their drafted team."""
    updates = 0
    for r in matched:
        if not r.get("_nfl_team"):
            continue
        if dry_run:
            updates += 1
            continue
        supabase.table("players").update(
            {"is_college": False, "nfl_team": r["_nfl_team"]}
        ).eq("id", r["player_id"]).execute()
        updates += 1
    return updates


def insert_new_players(
    supabase,
    unmatched: list[dict],
    dry_run: bool,
) -> int:
    """Insert player rows for drafted picks not already in our DB.

    Returns the number of new player rows created and mutates each unmatched
    record in place to set its `player_id` so draft_capital can be upserted.
    """
    if not unmatched:
        return 0

    existing_ids = {r["ottoneu_id"] for r in fetch_all_rows(supabase, "players", "ottoneu_id")}

    new_rows: list[dict] = []
    for r in unmatched:
        seed = r.get("_nflverse_id") or f"{r['_name']}|{r['_position']}|{r['season_drafted']}"
        synthetic = _generate_synthetic_ottoneu_id(seed)
        while synthetic in existing_ids:
            synthetic -= 1
        existing_ids.add(synthetic)
        r["_synthetic_ottoneu_id"] = synthetic
        new_rows.append({
            "ottoneu_id": synthetic,
            "name": r["_name"],
            "position": r["_position"],
            "nfl_team": r["_nfl_team"] or "FA",
            "is_college": False,
        })

    if dry_run:
        return len(new_rows)

    batch_size = 200
    for i in range(0, len(new_rows), batch_size):
        batch = new_rows[i : i + batch_size]
        result = supabase.table("players").upsert(
            batch, on_conflict="ottoneu_id"
        ).execute()
        returned = result.data or []
        # Map synthetic_id -> uuid so we can attach player_id to each unmatched record.
        by_otto = {p["ottoneu_id"]: p["id"] for p in returned}
        for r in unmatched:
            sid = r.get("_synthetic_ottoneu_id")
            if sid is not None and sid in by_otto:
                r["player_id"] = by_otto[sid]

    return len(new_rows)


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
    parser.add_argument(
        "--update-rosters", action="store_true",
        help=(
            "For picks in --since season only, also (a) flip matched college "
            "players to is_college=False with their drafted NFL team, and "
            "(b) insert new player rows for drafted picks not yet in the DB."
        ),
    )
    args = parser.parse_args()

    print(f"Draft Capital Backfill (since={args.since}, dry_run={args.dry_run}, "
          f"update_rosters={args.update_rosters})")

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
                  f"{u['_name']} ({u['_position']}, {u['_nfl_team']})")

    if args.update_rosters:
        # Restrict roster updates/inserts to --since season only. Editing players'
        # current nfl_team based on a draft pick from years ago would clobber trades
        # and free-agent moves.
        update_season = args.since
        season_matched = [r for r in matched if r["season_drafted"] == update_season]
        season_unmatched = [r for r in unmatched if r["season_drafted"] == update_season]

        print(f"\nRoster updates for {update_season} draft:")
        n_updated = update_existing_players(supabase, season_matched, args.dry_run)
        n_inserted = insert_new_players(supabase, season_unmatched, args.dry_run)
        print(f"  {'Would update' if args.dry_run else 'Updated'} {n_updated} existing players")
        print(f"  {'Would insert' if args.dry_run else 'Inserted'} {n_inserted} new players")

        # Newly inserted players now have player_id set; promote them into matched.
        if not args.dry_run:
            for r in season_unmatched:
                if r.get("player_id"):
                    matched.append(r)

    if args.dry_run:
        # In dry-run we don't actually create the player rows for unmatched picks,
        # but in a real --update-rosters run those would also flow into draft_capital.
        extra_from_inserts = (
            sum(
                1 for r in unmatched
                if r["season_drafted"] == args.since and r.get("_nfl_team")
            )
            if args.update_rosters else 0
        )
        print(
            f"\n[DRY RUN] Would upsert {len(matched) + extra_from_inserts} "
            f"draft_capital rows ({len(matched)} matched + {extra_from_inserts} newly-inserted)."
        )
        for r in matched[:5]:
            print(f"    {r['season_drafted']} R{r['round']}.{r['overall_pick']:03d} "
                  f"{r['_name']} ({r['_position']}) -> {r['player_id']}")
        return

    print(f"\nUpserting {len(matched)} rows to draft_capital...")
    upsert_draft_capital(supabase, matched)
    print("Done.")


if __name__ == "__main__":
    main()
