"""Ingest external projection sources into model_projections.

Usage:
    python scripts/feature_projections/external_sources/ingest_external.py \\
        --source fantasypros \\
        --seasons 2022,2023,2024,2025,2026

The script registers a named model in projection_models and upserts projected
PPG values into model_projections, following the same patterns as runner.py.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

try:
    import lxml  # noqa: F401 — required by pandas.read_html for HTML parsing
except ImportError:
    print(
        "ERROR: lxml is required but not installed.\n"
        "Run: pip install lxml\n"
        "(It is listed in requirements.txt — re-run pip install -r requirements.txt)"
    )
    sys.exit(1)

import pandas as pd

# Setup paths so imports work when run directly from repo root or this dir
_this_dir = os.path.dirname(os.path.abspath(__file__))
_fp_dir = os.path.dirname(_this_dir)           # feature_projections/
_scripts_dir = os.path.dirname(_fp_dir)        # scripts/
_repo_root = os.path.dirname(_scripts_dir)     # repo root

for _p in [_scripts_dir, _repo_root]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from config import get_supabase_client, fetch_all_rows  # noqa: E402

from scripts.feature_projections.external_sources.fantasypros_fetcher import (  # noqa: E402
    fetch_all_positions,
)
from scripts.feature_projections.external_sources.player_matcher import (  # noqa: E402
    build_player_index,
    match_dataframe,
)
from scripts.feature_projections.external_sources.scoring import stats_to_ppg  # noqa: E402

# ---------------------------------------------------------------------------
# Model definitions for each external source
# ---------------------------------------------------------------------------

_SOURCE_MODELS = {
    "fantasypros": {
        "name": "external_fantasypros_v1",
        "version": 1,
        "description": "FantasyPros consensus seasonal projections (stat-line → Ottoneu Half-PPR PPG)",
        "features": ["external"],
        "is_baseline": False,
    },
}

_BATCH_SIZE = 500
_GAMES_PER_SEASON = 17


def _ensure_model_in_db(supabase, model_def: dict) -> str:
    """Register or fetch model in projection_models. Returns model_id."""
    existing = (
        supabase.table("projection_models")
        .select("id")
        .eq("name", model_def["name"])
        .eq("version", model_def["version"])
        .execute()
    )
    if existing.data:
        return existing.data[0]["id"]

    result = (
        supabase.table("projection_models")
        .insert(
            {
                "name": model_def["name"],
                "version": model_def["version"],
                "description": model_def["description"],
                "features": json.dumps(model_def["features"]),
                "config": json.dumps({}),
                "is_baseline": model_def["is_baseline"],
                "is_active": False,
            }
        )
        .execute()
    )
    return result.data[0]["id"]


def _fetch_players(supabase) -> pd.DataFrame:
    """Fetch the players table for name matching."""
    players_data = fetch_all_rows(supabase, "players", "id, name, position, nfl_team")
    return pd.DataFrame(players_data)


def _upsert_records(supabase, records: list[dict]) -> None:
    """Batch upsert records into model_projections."""
    for i in range(0, len(records), _BATCH_SIZE):
        batch = records[i : i + _BATCH_SIZE]
        supabase.table("model_projections").upsert(
            batch, on_conflict="model_id,player_id,season"
        ).execute()
        print(f"    Upserted batch {i // _BATCH_SIZE + 1} ({len(batch)} records)")


def ingest_fantasypros(seasons: list[int]) -> int:
    """Fetch, match, score, and upsert FantasyPros projections.

    Args:
        seasons: List of season years to ingest.

    Returns:
        Total number of projections upserted.
    """
    supabase = get_supabase_client()
    model_def = _SOURCE_MODELS["fantasypros"]
    model_id = _ensure_model_in_db(supabase, model_def)
    print(f"Model '{model_def['name']}' registered with id={model_id}")

    players_df = _fetch_players(supabase)
    if players_df.empty:
        print("ERROR: No players found in DB. Aborting.")
        return 0
    player_index = build_player_index(players_df)
    print(f"Loaded {len(players_df)} players into matching index.")

    total = 0

    for season in seasons:
        print(f"\nIngesting FantasyPros projections for {season}...")
        fp_df = fetch_all_positions(season)
        if fp_df.empty:
            print(f"  No data fetched for {season}, skipping.")
            continue

        print(f"  Fetched {len(fp_df)} total rows. Matching to players table...")
        fp_df = match_dataframe(fp_df, player_index)

        matched = fp_df[fp_df["player_id"].notna()]
        unmatched = fp_df[fp_df["player_id"].isna()]
        print(f"  Matched: {len(matched)} | Unmatched: {len(unmatched)}")

        if matched.empty:
            print(f"  No matched players for {season}, skipping.")
            continue

        # Build projection records
        records = []
        for _, row in matched.iterrows():
            ppg = stats_to_ppg(row.to_dict(), games=_GAMES_PER_SEASON)
            if ppg is None:
                continue

            # Store raw stat line in feature_values for audit
            stat_snapshot = {
                "pass_yds": float(row.get("pass_yds", 0) or 0),
                "pass_tds": float(row.get("pass_tds", 0) or 0),
                "interceptions": float(row.get("interceptions", 0) or 0),
                "rush_yds": float(row.get("rush_yds", 0) or 0),
                "rush_tds": float(row.get("rush_tds", 0) or 0),
                "receptions": float(row.get("receptions", 0) or 0),
                "rec_yds": float(row.get("rec_yds", 0) or 0),
                "rec_tds": float(row.get("rec_tds", 0) or 0),
                "source": "fantasypros",
                "games": _GAMES_PER_SEASON,
            }

            records.append(
                {
                    "model_id": model_id,
                    "player_id": str(row["player_id"]),
                    "season": season,
                    "projected_ppg": round(float(ppg), 4),
                    "feature_values": json.dumps(stat_snapshot),
                }
            )

        # Deduplicate by player_id — multiple FP rows may fuzzy-match to the same player
        seen_pids: set[str] = set()
        deduped: list[dict] = []
        for r in records:
            pid = r["player_id"]
            if pid not in seen_pids:
                seen_pids.add(pid)
                deduped.append(r)
            else:
                print(f"  Skipping duplicate match for player_id={pid}")
        records = deduped

        print(f"  Generated {len(records)} projection records for {season}")
        _upsert_records(supabase, records)
        total += len(records)

    print(f"\nTotal: {total} projections ingested for model '{model_def['name']}'")
    return total


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest external projection sources into model_projections"
    )
    parser.add_argument(
        "--source",
        required=True,
        choices=list(_SOURCE_MODELS.keys()),
        help="External source to ingest (e.g., fantasypros)",
    )
    parser.add_argument(
        "--seasons",
        required=True,
        help="Comma-separated season years (e.g., 2022,2023,2024,2025,2026)",
    )
    args = parser.parse_args()

    seasons = [int(s.strip()) for s in args.seasons.split(",")]

    if args.source == "fantasypros":
        ingest_fantasypros(seasons)
    else:
        print(f"ERROR: Unknown source '{args.source}'")
        sys.exit(1)


if __name__ == "__main__":
    main()
