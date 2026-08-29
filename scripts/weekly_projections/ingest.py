"""Ingest one NFL week's projections (or actuals) into weekly_projections.

Usage:
    just weekly-projections                          # current week, projections
    just weekly-projections --week 3 --season 2025
    just weekly-projections --actuals --week 2       # backfill results
    just weekly-projections --week 1 --season 2025 --dry-run
    just weekly-projections-probe --week 1 --season 2025

What this does NOT do: feed the seasonal projection model. Weekly projections
are a third party's market-aware forecast; scripts/feature_projections/ is this
site's own market-free model and must stay that way. See the migration comment
on weekly_projections and TestNoWeeklyProjectionsInModel.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from typing import Optional

from scripts.config import fetch_all_rows, get_supabase_client
from scripts.feature_projections.external_sources.player_matcher import (
    build_player_index,
    match_player,
)
from scripts.nfl_week import current_nfl_week
from scripts.weekly_projections.scoring import normalised_stats, score_stat_line
from scripts.weekly_projections.sources import sleeper
from scripts.weekly_projections.sources.base import WeeklyRow

TABLE = "weekly_projections"

SOURCES = {"sleeper": sleeper}


def _players_index(supabase):
    """Position-keyed index of our players, for name matching."""
    import pandas as pd

    players = fetch_all_rows(supabase, "players", "id, name, position, nfl_team")
    # College prospects share the players table; they never have NFL projections.
    df = pd.DataFrame(players)
    return build_player_index(df)


def build_records(
    rows: list[WeeklyRow],
    player_index: dict,
    source: str,
    actuals: bool,
) -> tuple[list[dict], list[str]]:
    """Match, score, and shape rows for upsert.

    Returns:
        (records, unmatched_names). Unmatched names are reported so aliases can
        be added to scripts/name_utils.NAME_ALIASES.
    """
    cache: dict[tuple[str, str, str], Optional[str]] = {}
    records: list[dict] = []
    unmatched: list[str] = []
    # PostgREST sends JSON verbatim, so a literal "now()" string would be written
    # into the timestamptz column rather than evaluated. Stamp it here instead.
    now = datetime.now(timezone.utc).isoformat()

    for row in rows:
        player_id = match_player(row.name, row.position, row.team, player_index, cache)
        if not player_id:
            unmatched.append(f"{row.name} ({row.position}, {row.team})")
            continue

        stats = normalised_stats(row.stats)
        points = score_stat_line(row.stats)

        record = {
            "player_id": player_id,
            "season": row.season,
            "week": row.week,
            "source": source,
            "updated_at": now,
        }
        if actuals:
            record["actual_points"] = points
            record["actual_stats"] = stats
        else:
            record["projected_points"] = points
            record["projected_stats"] = stats
            record["opponent"] = row.opponent
            record["projected_at"] = now
        records.append(record)

    return records, unmatched


def purge_old_seasons(supabase, current_season: int, dry_run: bool = False) -> None:
    """Drop weeks from seasons before the current one.

    Retention is "the full current season": ~600 players x 18 weeks is a couple
    of megabytes, which buys week-over-week trends and season-long
    projected-vs-actual for free, while the table never grows year over year.
    """
    if dry_run:
        print(f"  [dry-run] would delete {TABLE} rows with season < {current_season}")
        return
    supabase.table(TABLE).delete().lt("season", current_season).execute()
    print(f"  Purged {TABLE} rows from seasons before {current_season}")


def ingest(
    season: Optional[int] = None,
    week: Optional[int] = None,
    source: str = "sleeper",
    actuals: bool = False,
    dry_run: bool = False,
) -> int:
    """Fetch one week from `source` and upsert it. Returns rows written."""
    if source not in SOURCES:
        raise ValueError(f"Unknown source {source!r}; expected one of {sorted(SOURCES)}")
    provider = SOURCES[source]

    supabase = get_supabase_client()

    if season is None or week is None:
        resolved_season, resolved_week = current_nfl_week()
        season = season if season is not None else resolved_season
        week = week if week is not None else resolved_week

    if season is None or week is None:
        print(
            "No NFL week to ingest — the regular season is over, or league_calendar "
            "has no regular_season_start. Pass --season/--week explicitly to override."
        )
        return 0

    kind = "stats" if actuals else "projections"
    print(f"Fetching {source} {kind} for {season} week {week}...")
    rows = provider.fetch(season, week, kind=kind)
    print(f"  {len(rows)} rows returned")

    print("Matching players...")
    records, unmatched = build_records(rows, _players_index(supabase), source, actuals)
    print(f"  {len(records)} matched, {len(unmatched)} unmatched")
    if unmatched:
        print("  Unmatched (add aliases to scripts/name_utils.NAME_ALIASES if wanted):")
        for name in unmatched[:20]:
            print(f"    - {name}")
        if len(unmatched) > 20:
            print(f"    ... and {len(unmatched) - 20} more")

    if dry_run:
        print(f"\n[dry-run] would upsert {len(records)} rows into {TABLE}")
        for record in records[:5]:
            print(f"  {json.dumps(record, default=str)}")
        purge_old_seasons(supabase, season, dry_run=True)
        return 0

    if records:
        supabase.table(TABLE).upsert(
            records, on_conflict="player_id,season,week,source"
        ).execute()
        print(f"  Upserted {len(records)} rows into {TABLE}")

    purge_old_seasons(supabase, season)
    return len(records)


def probe(season: int, week: int, source: str = "sleeper") -> None:
    """Dump a live payload's shape so the stat-key mapping can be confirmed.

    The endpoint is permitted but undocumented, so its response shape is not
    promised. This prints what the source actually returned — observed stat keys,
    which ones we map, and which we ignore — plus a saved fixture, so pinning the
    parser is one command rather than an investigation.
    """
    provider = SOURCES[source]
    payload = provider.fetch_raw(season, week)
    print(f"{len(payload)} raw rows from {source} for {season} week {week}\n")

    if not payload:
        print("Empty payload — nothing to inspect.")
        return

    print("=== First row (verbatim) ===")
    print(json.dumps(payload[0], indent=2)[:2000])

    observed: dict[str, int] = {}
    for entry in payload:
        for key in (entry.get("stats") or {}):
            observed[key] = observed.get(key, 0) + 1

    mapped = set(provider._STAT_MAP)
    print(f"\n=== {len(observed)} observed stat keys ===")
    print("MAPPED (feed Ottoneu scoring):")
    for key in sorted(observed):
        if key in mapped:
            print(f"  {key:<20} {observed[key]:>5} rows -> {provider._STAT_MAP[key]}")
    print("IGNORED:")
    print("  " + ", ".join(sorted(k for k in observed if k not in mapped)))

    missing = mapped - set(observed)
    if missing:
        print(f"\nWARNING: mapped keys absent from this payload: {sorted(missing)}")

    out = f"scripts/tests/fixtures/{source}_week_{season}_{week}.json"
    with open(out, "w") as fh:
        json.dump(payload[:50], fh, indent=2)
    print(f"\nSaved first 50 rows to {out}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, help="NFL season (default: resolved)")
    parser.add_argument("--week", type=int, help="NFL week 1-18 (default: current)")
    parser.add_argument("--source", default="sleeper", choices=sorted(SOURCES))
    parser.add_argument(
        "--actuals",
        action="store_true",
        help="Ingest actual results instead of projections (backfills a played week)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Fetch and match, write nothing")
    parser.add_argument(
        "--probe",
        action="store_true",
        help="Dump the live payload shape and save a fixture; writes nothing to the DB",
    )
    args = parser.parse_args()

    if args.probe:
        if args.season is None or args.week is None:
            parser.error("--probe requires explicit --season and --week")
        probe(args.season, args.week, args.source)
        return

    ingest(
        season=args.season,
        week=args.week,
        source=args.source,
        actuals=args.actuals,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
