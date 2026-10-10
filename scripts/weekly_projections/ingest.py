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
import os
from datetime import date, datetime, timezone
from typing import Optional

from scripts.config import LEAGUE_ID, fetch_all_rows, get_supabase_client
from scripts.feature_projections.external_sources.player_matcher import (
    build_player_index,
    match_player,
)
from scripts.nfl_week import current_nfl_week, today_in_league_tz
from scripts.weekly_projections.scoring import normalised_stats, score_stat_line
from scripts.weekly_projections.sources import sleeper
from scripts.weekly_projections.sources.base import WeeklyRow

TABLE = "weekly_projections"

SOURCES = {"sleeper": sleeper}


def _fetch_players(supabase) -> list[dict]:
    """Our current players (`ottoneu_id > 0`), for name matching.

    Filtered to `ottoneu_id > 0` — the same filter the web data layer uses
    (fetchPlayerList, fetchRosterData). The players table also holds ~2.5k
    historical placeholder rows with negative ottoneu_ids, and many of those are
    duplicates of a real player (DeAndre Hopkins appears twice) carrying stale
    NFL teams. Without this filter those duplicates make `match_player` see two
    exact name matches, fail the team cross-check against the stale team, and
    skip the player as ambiguous — silently dropping hundreds of real,
    currently-rostered players from the board.
    """
    return fetch_all_rows(
        supabase,
        "players",
        "id, name, position, nfl_team, is_college",
        filters=[("gte", "ottoneu_id", 1)],
    )


def _players_index(players: list[dict]):
    """Position-keyed index of `players`, for `match_player`."""
    import pandas as pd

    return build_player_index(pd.DataFrame(players))


# Sleeper spells two teams differently from our players.nfl_team.
_SLEEPER_TEAM_TO_OURS = {"JAX": "JAC", "LAR": "LA"}


def playing_teams(rows: list[WeeklyRow]) -> set[str]:
    """NFL teams (in our spelling) with a game this week, per the source slate.

    A team missing from this set is on a bye, so its players having no row is
    expected rather than a coverage gap.
    """
    return {_SLEEPER_TEAM_TO_OURS.get(r.team, r.team) for r in rows if r.team and r.opponent}


def find_coverage_gaps(
    rostered: list[dict], seen: set[str], teams_playing: set[str]
) -> list[dict]:
    """Rostered players whose team plays this week but who matched no source row.

    Not "has no projection": a player the source lists with an empty stat line
    (out, injured, inactive) was still *matched*, and is in `seen`. A gap means
    we could not find the player in the source at all — an index or naming bug
    (unordered pagination dropping Jeremiyah Love; "Cam Ward" vs "Cameron
    Ward"), which otherwise shows up only as a silently blank lineup slot.

    College players are skipped: the source has no row for them, and some
    college codes collide with NFL ones (Miami's "MIA").
    """
    return [
        p for p in rostered
        if p["id"] not in seen
        and not p.get("is_college")
        and p.get("nfl_team") in teams_playing
    ]


def _rostered_players(supabase, players: list[dict]) -> list[dict]:
    """The league's currently rostered players, from the roster snapshot."""
    owned = fetch_all_rows(
        supabase,
        "league_prices",
        "player_id, team_name",
        filters=[("eq", "league_id", LEAGUE_ID), ("neq", "team_name", "FA")],
    )
    owned_ids = {r["player_id"] for r in owned if r.get("team_name")}
    return [p for p in players if p["id"] in owned_ids]


def report_coverage_gaps(gaps: list[dict], season: int, week: int) -> None:
    """Print gaps loudly, and surface them in GitHub Actions when running there.

    A warning annotation plus a job-summary table, rather than failing the job:
    the rows that *did* match are still worth writing, and a brand-new Ottoneu
    signing that the source has not added yet is a legitimate, transient gap.
    """
    if not gaps:
        print("  Coverage: every rostered player on a team with a game was matched.")
        return

    lines = [f"{p['name']} ({p['position']}, {p['nfl_team']})" for p in gaps]
    print(
        f"\n  COVERAGE GAP: {len(gaps)} rostered player(s) on a team with a game "
        "matched no source row — they will show no weekly projection:"
    )
    for line in lines:
        print(f"    - {line}")
    print(
        "  Likely a naming mismatch (add to scripts/name_utils.NAME_ALIASES) or a "
        "player missing from the matching index."
    )

    if os.environ.get("GITHUB_ACTIONS") == "true":
        print(
            f"::warning title=Weekly projection coverage gap::{len(gaps)} rostered "
            f"player(s) unmatched for {season} week {week}: " + "; ".join(lines)
        )
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a") as fh:
                fh.write(f"\n### Coverage gap: {season} week {week}\n\n")
                fh.write("Rostered players on a team with a game that matched no source row:\n\n")
                fh.writelines(f"- {line}\n" for line in lines)


def build_records(
    rows: list[WeeklyRow],
    player_index: dict,
    source: str,
    actuals: bool,
    seen: Optional[set[str]] = None,
) -> tuple[list[dict], list[str]]:
    """Match, score, and shape rows for upsert.

    Args:
        seen: If given, every matched player_id is added to it — including
            players the source carries with an empty stat line (inactive,
            injured). `find_coverage_gaps` uses it to tell "matched but not
            projected" apart from "never matched at all".

    Returns:
        (records, unmatched_names). Only rows the source is actually projecting
        count as unmatched: the payload is Sleeper's whole player database,
        ~2,000 of them long retired, and reporting those buried the handful of
        real misses (Jeremiyah Love, Cam Ward) for weeks. Fix a real miss with an
        alias in scripts/name_utils.NAME_ALIASES.
    """
    cache: dict[tuple[str, str, str], Optional[str]] = {}
    records: list[dict] = []
    unmatched: list[str] = []
    # PostgREST sends JSON verbatim, so a literal "now()" string would be written
    # into the timestamptz column rather than evaluated. Stamp it here instead.
    now = datetime.now(timezone.utc).isoformat()

    for row in rows:
        stats = normalised_stats(row.stats)
        player_id = match_player(
            row.name, row.position, row.team, player_index, cache, verbose=bool(stats)
        )
        if not player_id:
            if stats:
                unmatched.append(f"{row.name} ({row.position}, {row.team})")
            continue
        if seen is not None:
            seen.add(player_id)

        # Skip players the source carries but is not actually projecting. On a
        # real slate these split cleanly: every row with a scoring stat also has
        # an opponent, and every row without one has neither. Storing them would
        # roughly triple the table with 0.0 rows that read as real projections on
        # the board, and would make "missing = bye or inactive" — which is what
        # the UI and the MCP note both promise — untrue.
        if not stats:
            continue
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
            record["game_date"] = row.game_date
            record["projected_at"] = now
        records.append(record)

    return _dedupe(records, actuals), unmatched


def _dedupe(records: list[dict], actuals: bool) -> list[dict]:
    """Collapse records that share a (player_id, season, week, source) key.

    Two Sleeper entries can resolve to the same player of ours: the source
    carries duplicate, retired, and practice-squad records under the same name,
    and the fuzzy matcher lands them on one player_id. PostgREST rejects such a
    batch outright — "ON CONFLICT DO UPDATE command cannot affect row a second
    time" — so the whole week fails to write unless we collapse them first.

    The duplicates are almost always a real projection plus one or more 0.0
    stubs (the inactive record), so we keep the highest-scoring row.
    """
    points_key = "actual_points" if actuals else "projected_points"
    best: dict[tuple, dict] = {}
    for record in records:
        key = (record["player_id"], record["season"], record["week"], record["source"])
        current = best.get(key)
        if current is None or (record.get(points_key) or 0) > (current.get(points_key) or 0):
            best[key] = record
    return list(best.values())


def _as_date(value) -> Optional[date]:
    if isinstance(value, date):
        return value
    if not isinstance(value, str) or not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def game_has_started(row: dict, today: date) -> bool:
    """Whether a stored row's game is under way or over, as of `today` (ET).

    Two signals, either sufficient:

      * the game date is before today — every NFL game is over by the morning
        after its date, so this is exact for a completed day;
      * an actual is already recorded — covers rows written before `game_date`
        was stored, and is true of any game the actuals pass has seen.

    Deliberately a *date*, not a kickoff time: nothing in this pipeline knows
    kickoff times, and the scheduled runs are placed so that a same-day refresh
    is always pre-kickoff (7am ET daily, noon ET Sunday). The one gap is a
    Sunday-morning international game, which the noon run reaches mid-game.
    """
    if row.get("actual_points") is not None:
        return True
    game_date = _as_date(row.get("game_date"))
    return game_date is not None and game_date < today


def apply_kickoff_freeze(
    records: list[dict],
    existing: list[dict],
    today: date,
    allow_post_kickoff_fill: bool = False,
) -> tuple[list[dict], list[str]]:
    """Drop projection records that would rewrite history. Returns (writable, frozen_ids).

    **A projection is a forecast, and a forecast stops being one at kickoff.**
    Sleeper keeps revising a week's projections after its games are played —
    rows for a game that finished the night before come back re-stamped with a
    new number the next morning, and the checked-in 2025 Week 1 fixture carries
    a `last_modified` a month after the game. Re-upserting those every day
    quietly replaced the number a lineup was set against with a post-game
    revision, so "projected vs actual" compared the actual to a figure nobody
    could have seen beforehand.

    So once a player's game has started (see `game_has_started`) his stored
    projection is frozen: the record is not written at all. Frozen rows are
    excluded rather than upserted with fewer columns because PostgREST fills a
    batch's missing keys with NULL, which would erase the very projection this
    exists to keep.

    A record for a started game with no stored projection is not a pre-game
    forecast either — it first appeared after kickoff — so it is refused too,
    unless `allow_post_kickoff_fill` is set. That is the backfill case: ingesting
    a past week, where a post-hoc projection is the only one there will ever be.
    Even then a stored projection is never overwritten.

    Pure, so the decision is testable without a database.
    """
    stored = {str(row["player_id"]): row for row in existing}
    writable: list[dict] = []
    frozen: list[str] = []
    for record in records:
        player_id = str(record["player_id"])
        prior = stored.get(player_id)
        # A projection record never carries an actual, so it only speaks to the
        # date; the stored row can also say "already played".
        started = game_has_started(record, today) or (
            prior is not None and game_has_started(prior, today)
        )
        if not started:
            writable.append(record)
        elif prior is not None and prior.get("projected_points") is not None:
            frozen.append(player_id)
        elif allow_post_kickoff_fill:
            writable.append(record)
        else:
            frozen.append(player_id)
    return writable, frozen


def partition_dropped_rows(
    existing: list[dict], projected_ids: set[str], today: date
) -> tuple[list[str], list[str]]:
    """Split the week's stored rows the source no longer projects into (delete, keep).

    `existing` is every row we already hold for one (season, week, source);
    `projected_ids` is who the source projected in the payload we just fetched.
    Anything stored but no longer projected is stale and must not keep sitting
    on the board — unless its game has already started:

      * Game not started — delete. A player cut, waived or ruled out before
        kickoff has no forecast worth keeping, and "missing = bye or inactive"
        is what the UI and the MCP note promise.
      * Game started — keep the row untouched, projection included. The
        projection is now the pre-game forecast the week is judged against, and
        a played game is the entire reason a week is retained. (This used to
        clear the projection on a played row, which erased exactly the number
        "projected vs actual" needs.)

    Pure, so the decision is testable without a database.
    """
    delete: list[str] = []
    keep: list[str] = []
    for row in existing:
        player_id = str(row["player_id"])
        if player_id in projected_ids:
            continue
        if game_has_started(row, today):
            keep.append(player_id)
        else:
            delete.append(player_id)
    return delete, keep


def _chunks(values: list[str], size: int = 200):
    """PostgREST puts `in_` lists in the query string, so send them in batches."""
    for start in range(0, len(values), size):
        yield values[start : start + size]


def fetch_existing_rows(supabase, season: int, week: int, source: str) -> list[dict]:
    """Every row already stored for one (season, week, source) — what the freeze
    and the dropped-player reconciliation both decide against."""
    return fetch_all_rows(
        supabase,
        TABLE,
        "player_id, game_date, actual_points, projected_points",
        filters=[("eq", "season", season), ("eq", "week", week), ("eq", "source", source)],
    )


def reconcile_dropped_players(
    supabase,
    season: int,
    week: int,
    source: str,
    projected_ids: set[str],
    existing: list[dict],
    today: date,
    dry_run: bool = False,
) -> tuple[int, int]:
    """Retire rows the source has stopped projecting for this week.

    The upsert only touches players present in today's payload, so a player who
    was projected on Tuesday and then cut, waived, or put on IR kept Tuesday's
    number on the board for the rest of the week — a figure that reads as live
    and is not. Worse, it quietly broke the promise the player card and the MCP
    tool both make, that **a missing week means a bye or an inactive**: the
    stale row is indistinguishable from a healthy starter's.

    Rows whose game has started are never touched; see `partition_dropped_rows`.

    Returns (deleted, kept).
    """
    delete_ids, keep_ids = partition_dropped_rows(existing, projected_ids, today)

    if not delete_ids:
        print(
            "  No dropped players to retire."
            + (f" ({len(keep_ids)} no longer projected but already played — kept)" if keep_ids else "")
        )
        return 0, len(keep_ids)

    if dry_run:
        print(
            f"  [dry-run] would delete {len(delete_ids)} dropped rows; "
            f"{len(keep_ids)} no longer projected but already played would be kept"
        )
        return len(delete_ids), len(keep_ids)

    for batch in _chunks(delete_ids):
        supabase.table(TABLE).delete().eq("season", season).eq("week", week).eq(
            "source", source
        ).in_("player_id", batch).execute()

    print(
        f"  Retired {len(delete_ids)} dropped players"
        + (f", kept {len(keep_ids)} that already played" if keep_ids else "")
    )
    return len(delete_ids), len(keep_ids)


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

    current = current_nfl_week()
    if season is None or week is None:
        season = season if season is not None else current[0]
        week = week if week is not None else current[1]

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

    if not rows and actuals:
        # Expected between the Tuesday rollover and kickoff: the games simply
        # have not been played. Not a failure — the daily job re-runs and picks
        # them up once they are final.
        print(f"  No results posted yet for {season} week {week}; nothing to backfill.")
        return 0

    print("Matching players...")
    players = _fetch_players(supabase)
    seen: set[str] = set()
    records, unmatched = build_records(rows, _players_index(players), source, actuals, seen)
    print(f"  {len(records)} matched, {len(unmatched)} projected rows unmatched")
    if unmatched:
        print("  Unmatched (add aliases to scripts/name_utils.NAME_ALIASES if wanted):")
        for name in unmatched[:20]:
            print(f"    - {name}")
        if len(unmatched) > 20:
            print(f"    ... and {len(unmatched) - 20} more")

    # The actuals pass is partial by nature (most players have not played early
    # in the week), so only a projections slate says anything about coverage.
    if not actuals and records:
        gaps = find_coverage_gaps(
            _rostered_players(supabase, players), seen, playing_teams(rows)
        )
        report_coverage_gaps(gaps, season, week)

    # Every matched player, frozen or not: a frozen player is still projected by
    # the source, so the reconciliation must not see him as dropped.
    projected_ids = {r["player_id"] for r in records}
    existing: list[dict] = []
    today = today_in_league_tz()
    if not actuals:
        existing = fetch_existing_rows(supabase, season, week, source)
        # Ingesting any week other than the current one is a backfill: every game
        # is already played, so a post-hoc projection is the only one available.
        records, frozen = apply_kickoff_freeze(
            records, existing, today,
            allow_post_kickoff_fill=(season, week) != current,
        )
        if frozen:
            print(
                f"  Froze {len(frozen)} players whose game has started — their "
                "pre-kickoff projection is kept, not overwritten"
            )

    if dry_run:
        print(f"\n[dry-run] would upsert {len(records)} rows into {TABLE}")
        for record in records[:5]:
            print(f"  {json.dumps(record, default=str)}")
        if not actuals and projected_ids:
            reconcile_dropped_players(
                supabase, season, week, source, projected_ids, existing, today, dry_run=True
            )
        purge_old_seasons(supabase, season, dry_run=True)
        return 0

    if records:
        supabase.table(TABLE).upsert(
            records, on_conflict="player_id,season,week,source"
        ).execute()
        print(f"  Upserted {len(records)} rows into {TABLE}")

    # Only on a projections pass, and only when the source actually returned a
    # slate. `projected_ids` being empty is the guard that matters: an outage or
    # a silently-emptied payload would otherwise look like "the source projects
    # nobody this week" and take the whole board down with it. The actuals pass
    # is a partial view by nature — early in the week most players simply have
    # not played — so it must never retire anything.
    if not actuals and projected_ids:
        reconcile_dropped_players(
            supabase, season, week, source, projected_ids, existing, today
        )

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
