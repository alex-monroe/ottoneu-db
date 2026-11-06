"""Backfill weekly NFL player stats from nflverse-data into nfl_weekly_stats.

One row per player per game (REG and POST), the weekly counterpart of
nfl_stats. Needed for the in-season projection vintage (V0) and for split-half
reliability studies (docs/exec-plans/stat-projections/06 and 07).

Standalone script that:
1. Pulls stats_player_week_{year}.parquet (REG + POST rows) from nflverse-data
2. Pulls per-game snap counts (snap_counts_{year}.parquet), joined on game_id + name
3. Pulls nflverse games.csv for each game's date (``gameday``)
4. Matches players to EXISTING ``players`` rows by normalized name (never creates players)
5. Scores each game with the league's full scoring (scripts/scoring.py)
6. Upserts into nfl_weekly_stats on (player_id, season, week, season_type)

Usage:
    just backfill-nfl-weekly-stats --seasons 2025              # one season
    just backfill-nfl-weekly-stats --seasons 2018-2025         # a range
    just backfill-nfl-weekly-stats --seasons 2025 --dry-run    # parse only, no DB writes
    just backfill-nfl-weekly-stats --seasons 2025 --season-type REG
    just backfill-nfl-weekly-stats --current-season            # the NFL season in progress today
    just backfill-nfl-weekly-stats --seasons 2025 --check-parity            # DB weekly vs nfl_stats
    just backfill-nfl-weekly-stats --seasons 2025 --check-parity --dry-run  # nflverse frame vs nfl_stats

Parity check
------------
Summing a player's REG weekly rows should reproduce their nfl_stats season row,
because nfl_stats is built from the same nflverse data. ``--check-parity``
compares the two per (player, season) on PARITY_COLS and exits 1 when the share
of mismatching pairs exceeds PARITY_TOLERANCE. Legitimate edge cases that keep
the mismatch rate above zero:

- nflverse corrects stats after the fact. The weekly file and the season file
  are re-published separately, so a refresh of one without the other leaves a
  stale side (re-run both backfills to clear it).
- Name collisions. Both tables match by normalized name, so two different
  humans sharing a name (e.g. two "Josh Allen"s) merge into one players row. The
  season file merges them before this script sees them, the weekly file after
  dropping defensive rows (which this script does), so their sums can differ.
- Different name variants of one player (nickname vs. legal name) that
  normalize to the same row are summed by both pipelines, but a variant that
  appears in only one of the two files is missing on one side.
- Duplicate ``players`` rows with one name (the season backfill's synthetic
  ottoneu_ids can collide on re-runs): nfl_stats holds a row for each, while the
  name lookup resolves the weekly rows to just one. Reported as
  ``duplicate_name`` and not counted; fixing the duplicates is a separate job.
- Defenders: nfl_stats keeps all-zero rows for them, the weekly load skips
  them. Only an nfl_stats row with a nonzero core stat and no weekly rows is a
  ``season_only`` mismatch (counted).
- nfl_stats not yet backfilled for an in-progress season (``weekly_only``,
  informational and not counted).
"""

from __future__ import annotations

import argparse
import re
from collections import defaultdict
from datetime import date
from typing import Any, Iterable

import pandas as pd

from scripts.backfill_nfl_stats import (
    _SNAP_COUNTS_URL,
    NFLVERSE_STAT_RENAMES,
    STAT_MODEL_FLOAT_COLS,
    STAT_MODEL_INT_COLS,
    _safe_float,
    _safe_int,
    add_fg_buckets,
    build_player_lookup,
)
from scripts.backfill_vegas_lines import GAMES_URL
from scripts.config import fetch_all_rows, get_supabase_client
from scripts.name_utils import normalize_player_name
from scripts.scoring import EXTRA_KEYS, add_nflverse_extras, score_stats

# --- Constants ---

_WEEKLY_STATS_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "stats_player/stats_player_week_{year}.parquet"
)

TABLE = "nfl_weekly_stats"
UPSERT_CONFLICT = "player_id,season,week,season_type"
BATCH_SIZE = 500
SEASON_TYPES = ("REG", "POST")

# First season nflverse publishes stats_player_week_*.parquet for.
FIRST_WEEKLY_SEASON = 2010

# An NFL season runs September to early February (the Super Bowl). January and
# February therefore still belong to the previous calendar year's season.
LAST_MONTH_OF_PREVIOUS_SEASON = 2

# Counting stats stored as integers (same names and types as nfl_stats).
WEEKLY_INT_COLS: tuple[str, ...] = (
    "passing_attempts", "completions", "passing_yards", "passing_tds", "interceptions",
    "rushing_attempts", "rushing_yards", "rushing_tds",
    "targets", "receptions", "receiving_yards", "receiving_tds", "receiving_air_yards",
    "fg_made_0_39", "fg_made_40_49", "fg_made_50_plus", "pat_made",
    *EXTRA_KEYS, *STAT_MODEL_INT_COLS,
)
WEEKLY_FLOAT_COLS: tuple[str, ...] = tuple(STAT_MODEL_FLOAT_COLS)
# Per-game opportunity shares: not additive, so averaged when two rows merge.
WEEKLY_RATE_COLS: tuple[str, ...] = ("target_share", "air_yards_share", "wopr", "racr")
META_COLS: tuple[str, ...] = ("gsis_id", "game_id", "game_date", "team", "opponent_team")
SNAP_INT_COLS: tuple[str, ...] = ("offense_snaps",)

# nflverse position_group values for defenders. Their rows can never be
# fantasy-relevant, and skipping them keeps a defender who shares a name with a
# skill player (two "Josh Allen"s) from folding into that player's weekly rows.
DEFENSIVE_POSITION_GROUPS = frozenset({"DB", "DL", "LB"})

# --- Parity ---

# Core counting columns compared between SUM(nfl_weekly_stats REG) and nfl_stats.
PARITY_COLS: tuple[str, ...] = (
    "passing_attempts", "completions", "passing_yards", "passing_tds", "interceptions",
    "rushing_attempts", "rushing_yards", "rushing_tds",
    "targets", "receptions", "receiving_yards", "receiving_tds",
    "fg_made_0_39", "fg_made_40_49", "fg_made_50_plus", "pat_made",
)
# total_points is rounded to 2 dp on each side, so allow a rounding-sized gap.
PARITY_POINTS_ABS_TOL = 0.05
# Exit non-zero when more than this share of compared (player, season) pairs
# disagree on any column. See the module docstring for the legitimate causes;
# the figure is deliberately small (a clean backfill pair is at ~0) but not zero.
PARITY_TOLERANCE = 0.01


# --- Season logic ---

def current_nfl_season(today: date | None = None) -> int:
    """The NFL season in progress on ``today`` (default: today in the league's timezone).

    January and February still belong to the season that began the previous
    September (playoffs, Super Bowl). March through August return the coming
    season, whose weekly file does not exist yet; the loader skips it quietly.
    """
    if today is None:
        from scripts.nfl_week import today_in_league_tz

        today = today_in_league_tz()
    return today.year - 1 if today.month <= LAST_MONTH_OF_PREVIOUS_SEASON else today.year


def parse_seasons(tokens: Iterable[str]) -> list[int]:
    """Expand ``2018 2020`` / ``2018-2022`` style tokens into a sorted unique list."""
    seasons: set[int] = set()
    for token in tokens:
        m = re.fullmatch(r"(\d{4})(?:-(\d{4}))?", str(token).strip())
        if not m:
            raise ValueError(f"Bad season token {token!r}; use 2024 or 2018-2024")
        start = int(m.group(1))
        end = int(m.group(2) or start)
        if end < start:
            raise ValueError(f"Season range {token!r} runs backwards")
        seasons.update(range(start, end + 1))
    return sorted(seasons)


# --- Data loading (I/O) ---

def load_weekly_stats(year: int) -> pd.DataFrame | None:
    url = _WEEKLY_STATS_URL.format(year=year)
    try:
        return pd.read_parquet(url)
    except Exception as e:
        print(f"    SKIP weekly stats for {year}: {e}")
        return None


def load_weekly_snaps(year: int) -> pd.DataFrame | None:
    url = _SNAP_COUNTS_URL.format(year=year)
    try:
        return pd.read_parquet(url)
    except Exception as e:
        print(f"    SKIP snap counts for {year}: {e}")
        return None


def load_games() -> pd.DataFrame | None:
    try:
        return pd.read_csv(GAMES_URL, usecols=["game_id", "gameday"])
    except Exception as e:
        print(f"    SKIP games.csv (game_date will be NULL): {e}")
        return None


# --- Pure transformation ---

def prepare_weekly_stats(df: pd.DataFrame) -> pd.DataFrame:
    """Rename and derive columns on a raw ``stats_player_week`` frame.

    Same FG bucketing, scoring extras and renames as the season backfill
    (``backfill_nfl_stats.process_stats``). Returns a new frame; the input is
    left alone.
    """
    out = df.copy()
    add_fg_buckets(out)
    add_nflverse_extras(out)
    return out.rename(columns=NFLVERSE_STAT_RENAMES)


def build_game_dates(games_df: pd.DataFrame | None) -> dict[str, str]:
    """game_id -> ISO ``gameday`` from nflverse games.csv."""
    if games_df is None or games_df.empty:
        return {}
    valid = games_df.dropna(subset=["game_id", "gameday"])
    return {str(g): str(d)[:10] for g, d in zip(valid["game_id"], valid["gameday"])}


def build_snap_lookup(snaps_df: pd.DataFrame | None) -> dict[tuple[str, str], dict[str, Any]]:
    """(game_id, normalized player name) -> offense snaps and share.

    A name that appears twice in one game (two players, or two variants of one)
    has its snaps summed and the larger share kept.
    """
    lookup: dict[tuple[str, str], dict[str, Any]] = {}
    if snaps_df is None or snaps_df.empty:
        return lookup
    for rec in snaps_df[["game_id", "player", "offense_snaps", "offense_pct"]].to_dict("records"):
        if not isinstance(rec["game_id"], str) or not isinstance(rec["player"], str):
            continue
        key = (rec["game_id"], normalize_player_name(rec["player"]))
        snaps = _safe_int(rec["offense_snaps"])
        pct = _safe_float(rec["offense_pct"])
        cur = lookup.get(key)
        if cur is None:
            lookup[key] = {"offense_snaps": snaps, "offense_pct": pct}
        else:
            cur["offense_snaps"] = _sum_optional(cur["offense_snaps"], snaps)
            cur["offense_pct"] = _max_optional(cur["offense_pct"], pct)
    return lookup


def _sum_optional(a: float | None, b: float | None) -> float | None:
    if a is None:
        return b
    if b is None:
        return a
    return a + b


def _max_optional(a: float | None, b: float | None) -> float | None:
    if a is None:
        return b
    if b is None:
        return a
    return max(a, b)


def filter_season_types(df: pd.DataFrame, season_type: str) -> pd.DataFrame:
    """Keep REG, POST, or both (``ALL``) rows of a weekly frame."""
    if season_type == "ALL":
        return df[df["season_type"].isin(SEASON_TYPES)]
    return df[df["season_type"] == season_type]


def build_weekly_rows(
    prepared: pd.DataFrame,
    player_lookup: dict[str, str],
    game_dates: dict[str, str],
    snap_lookup: dict[tuple[str, str], dict[str, Any]],
) -> tuple[list[dict], dict[str, Any]]:
    """Turn a prepared weekly frame into nfl_weekly_stats rows.

    Returns ``(rows, info)``. Rows are matched to existing players by normalized
    display name; unmatched and defensive rows are only counted. ``info`` holds
    ``unmatched`` (set of names), ``defensive_skipped`` and ``matched_raw``.
    Duplicate (player, season, week, season_type) keys are merged by
    ``dedup_weekly_rows``.
    """
    rows: list[dict] = []
    unmatched: set[str] = set()
    defensive = 0
    matched_raw = 0
    wanted = list(WEEKLY_INT_COLS) + list(WEEKLY_FLOAT_COLS) + list(WEEKLY_RATE_COLS)

    for rec in prepared.to_dict("records"):
        if rec.get("position_group") in DEFENSIVE_POSITION_GROUPS:
            defensive += 1
            continue
        raw_name = rec.get("player_display_name")
        if not isinstance(raw_name, str):
            continue
        norm = normalize_player_name(raw_name)
        player_id = player_lookup.get(norm)
        if not player_id:
            unmatched.add(raw_name)
            continue
        matched_raw += 1

        game_id = rec.get("game_id") if isinstance(rec.get("game_id"), str) else None
        row: dict[str, Any] = {
            "player_id": player_id,
            "gsis_id": rec.get("player_id") if isinstance(rec.get("player_id"), str) else None,
            "season": int(rec["season"]),
            "week": int(rec["week"]),
            "season_type": str(rec["season_type"]),
            "game_id": game_id,
            "game_date": game_dates.get(game_id) if game_id else None,
            "team": rec.get("team") if isinstance(rec.get("team"), str) else None,
            "opponent_team": rec.get("opponent_team") if isinstance(rec.get("opponent_team"), str) else None,
        }
        for col in wanted:
            cast = _safe_int if col in WEEKLY_INT_COLS else _safe_float
            row[col] = cast(rec.get(col))
        snap = snap_lookup.get((game_id, norm)) if game_id else None
        row["offense_snaps"] = snap["offense_snaps"] if snap else None
        row["offense_pct"] = snap["offense_pct"] if snap else None
        row["total_points"] = round(score_stats(row), 2)
        rows.append(row)

    return dedup_weekly_rows(rows), {
        "unmatched": unmatched,
        "defensive_skipped": defensive,
        "matched_raw": matched_raw,
    }


def _first_non_null(values: list[Any]) -> Any:
    return next((v for v in values if v is not None), None)


def dedup_weekly_rows(rows: list[dict]) -> list[dict]:
    """Collapse rows sharing (player_id, season, week, season_type).

    Two name variants that normalize to one players row in the same game are
    summed like ``backfill_nfl_stats.dedup_stat_rows`` does: counting stats and
    snaps add, shares are averaged, the larger snap share is kept, metadata comes
    from the first non-null value, and points are recomputed.
    """
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        groups[(r["player_id"], r["season"], r["week"], r["season_type"])].append(r)

    out: list[dict] = []
    for group in groups.values():
        if len(group) == 1:
            out.append(group[0])
            continue
        merged: dict[str, Any] = {k: group[0][k] for k in ("player_id", "season", "week", "season_type")}
        for col in META_COLS:
            merged[col] = _first_non_null([g.get(col) for g in group])
        for col in (*WEEKLY_INT_COLS, *WEEKLY_FLOAT_COLS, *SNAP_INT_COLS):
            vals = [g.get(col) for g in group if g.get(col) is not None]
            merged[col] = sum(vals) if vals else None
        for col in WEEKLY_RATE_COLS:
            vals = [g.get(col) for g in group if g.get(col) is not None]
            merged[col] = sum(vals) / len(vals) if vals else None
        pcts = [g.get("offense_pct") for g in group if g.get("offense_pct") is not None]
        merged["offense_pct"] = max(pcts) if pcts else None
        merged["total_points"] = round(score_stats(merged), 2)
        out.append(merged)
    return out


# --- Parity (pure) ---

def sum_weekly_to_season(weekly_rows: Iterable[dict]) -> dict[tuple[str, int], dict[str, float]]:
    """Sum REG weekly rows per (player_id, season) over PARITY_COLS and total_points."""
    totals: dict[tuple[str, int], dict[str, float]] = {}
    for r in weekly_rows:
        if r.get("season_type") != "REG":
            continue
        acc = totals.setdefault(
            (r["player_id"], int(r["season"])), {c: 0.0 for c in (*PARITY_COLS, "total_points")}
        )
        for col in acc:
            acc[col] += r.get(col) or 0
    return totals


def compare_parity(
    weekly_totals: dict[tuple[str, int], dict[str, float]],
    season_rows: Iterable[dict],
    tolerance: float = PARITY_TOLERANCE,
    name_by_id: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Compare weekly REG sums with nfl_stats rows (NULL counts as 0 on both sides).

    Returns a report with the compared pair count, per-column mismatch counts, a
    list of mismatching pairs, pairs present on only one side, and ``ok``.
    ``season_only`` pairs (an nfl_stats row with a nonzero core stat but no weekly
    rows; all-zero rows are mostly defenders, which the weekly load skips)
    count as mismatches; ``weekly_only`` pairs (nfl_stats not yet backfilled) are
    informational. A season_only pair whose player shares a normalized name with
    another players row that DOES have weekly rows for that season is a
    duplicate players row (name lookup resolves to one of them), listed under
    ``duplicate_name`` and not counted. A pair mismatches if any column differs (total_points within
    PARITY_POINTS_ABS_TOL).
    """
    season_by_key = {(r["player_id"], int(r["season"])): r for r in season_rows}
    per_col: dict[str, int] = defaultdict(int)
    mismatches: list[dict] = []
    compared = 0
    season_only: list[tuple[str, int]] = []
    duplicate_name: list[tuple[str, int]] = []
    covered_names: set[tuple[str, int]] = set()
    if name_by_id:
        covered_names = {
            (normalize_player_name(name_by_id[pid]), season)
            for pid, season in weekly_totals if pid in name_by_id
        }

    for key, srow in season_by_key.items():
        wsum = weekly_totals.get(key)
        if wsum is None:
            if any(srow.get(c) for c in PARITY_COLS):
                name = (name_by_id or {}).get(key[0])
                if name and (normalize_player_name(name), key[1]) in covered_names:
                    duplicate_name.append(key)
                else:
                    season_only.append(key)
            continue
        compared += 1
        bad: dict[str, tuple[float, float]] = {}
        for col in PARITY_COLS:
            s_val = srow.get(col) or 0
            if wsum[col] != s_val:
                bad[col] = (wsum[col], s_val)
        s_pts = srow.get("total_points") or 0
        if abs(wsum["total_points"] - float(s_pts)) > PARITY_POINTS_ABS_TOL:
            bad["total_points"] = (round(wsum["total_points"], 2), float(s_pts))
        if bad:
            mismatches.append({"player_id": key[0], "season": key[1], "diffs": bad})
            for col in bad:
                per_col[col] += 1

    weekly_only = [k for k in weekly_totals if k not in season_by_key]
    bad_pairs = len(mismatches) + len(season_only)
    denominator = compared + len(season_only)
    rate = bad_pairs / denominator if denominator else 0.0
    return {
        "compared": compared,
        "mismatched_pairs": len(mismatches),
        "mismatches": mismatches,
        "per_column": dict(per_col),
        "season_only": season_only,
        "duplicate_name": duplicate_name,
        "weekly_only": weekly_only,
        "mismatch_rate": rate,
        "tolerance": tolerance,
        "ok": rate <= tolerance,
    }


def print_parity_report(report: dict[str, Any], names: dict[str, str] | None = None) -> None:
    names = names or {}
    print("\n=== Parity: SUM(nfl_weekly_stats REG) vs nfl_stats ===")
    print(f"  Compared (player, season) pairs: {report['compared']}")
    print(f"  Mismatching pairs:               {report['mismatched_pairs']}")
    print(f"  In nfl_stats but no weekly rows: {len(report['season_only'])} (counted as mismatches)")
    print(f"  Duplicate players rows (name resolves to a sibling): {len(report['duplicate_name'])} (not counted)")
    print(f"  In weekly but not nfl_stats:     {len(report['weekly_only'])} (informational)")
    print(f"  Mismatch rate: {report['mismatch_rate']:.2%} (tolerance {report['tolerance']:.2%})")
    if report["per_column"]:
        print("  Mismatches per column:")
        for col, n in sorted(report["per_column"].items(), key=lambda kv: -kv[1]):
            print(f"    {col}: {n}")
    for m in report["mismatches"][:15]:
        label = names.get(m["player_id"], m["player_id"])
        diffs = ", ".join(f"{c}: weekly={w} season={s}" for c, (w, s) in m["diffs"].items())
        print(f"    {label} {m['season']}: {diffs}")
    for key in report["season_only"][:5]:
        print(f"    season-only: {names.get(key[0], key[0])} {key[1]}")
    print("  PARITY OK" if report["ok"] else "  PARITY FAILED")


# --- Orchestration (I/O) ---

def build_rows_for_season(
    year: int,
    player_lookup: dict[str, str],
    game_dates: dict[str, str],
    season_type: str,
) -> tuple[list[dict], dict[str, Any]] | None:
    stats = load_weekly_stats(year)
    if stats is None:
        return None
    stats = filter_season_types(stats, season_type)
    snaps = load_weekly_snaps(year)
    rows, info = build_weekly_rows(
        prepare_weekly_stats(stats), player_lookup, game_dates, build_snap_lookup(snaps)
    )
    info["raw_rows"] = len(stats)
    info["with_snaps"] = sum(1 for r in rows if r["offense_snaps"] is not None)
    info["with_date"] = sum(1 for r in rows if r["game_date"] is not None)
    return rows, info


def stamp_updated_at(rows: list[dict], now: str | None = None) -> list[dict]:
    """Set one shared ``updated_at`` on every row (new dicts; inputs untouched).

    The table has no updated_at trigger, so an upsert that omits the column
    leaves the insert time in place forever.
    """
    stamp = now or pd.Timestamp.now(tz="UTC").isoformat()
    return [{**r, "updated_at": stamp} for r in rows]


def upsert_rows(supabase, rows: list[dict]) -> None:
    rows = stamp_updated_at(rows)
    for i in range(0, len(rows), BATCH_SIZE):
        supabase.table(TABLE).upsert(rows[i:i + BATCH_SIZE], on_conflict=UPSERT_CONFLICT).execute()
        if (i // BATCH_SIZE) % 10 == 0:
            print(f"  Batch {i // BATCH_SIZE + 1} / {(len(rows) + BATCH_SIZE - 1) // BATCH_SIZE}")


def backfill_weekly(seasons: list[int], season_type: str, dry_run: bool, check_parity: bool) -> bool:
    """Build (and, unless dry-run, upsert) weekly rows. Returns the parity verdict (True if not checked)."""
    supabase = get_supabase_client()
    if check_parity and not dry_run:
        # Compare what is already in the table; nothing to download or build.
        return _run_parity(supabase, seasons, None)

    print("Building player lookup from DB...")
    player_lookup = build_player_lookup(supabase)
    print(f"  {len(player_lookup)} players in DB.")
    game_dates = build_game_dates(load_games())
    print(f"  {len(game_dates)} games with a date.")

    all_rows: list[dict] = []
    for year in seasons:
        print(f"\n  Season {year}:")
        built = build_rows_for_season(year, player_lookup, game_dates, season_type)
        if built is None:
            continue
        rows, info = built
        by_type = defaultdict(int)
        for r in rows:
            by_type[r["season_type"]] += 1
        print(f"    Raw rows: {info['raw_rows']} (defensive skipped: {info['defensive_skipped']})")
        print(f"    Matched: {info['matched_raw']} raw rows -> {len(rows)} player-games "
              f"({', '.join(f'{k}={v}' for k, v in sorted(by_type.items()))})")
        print(f"    Unmatched names: {len(info['unmatched'])}  sample: {sorted(info['unmatched'])[:8]}")
        print(f"    With snaps: {info['with_snaps']}, with game_date: {info['with_date']}")
        all_rows.extend(rows)

    if not all_rows:
        print("No weekly data loaded. Exiting.")
        return True

    if check_parity:
        # --check-parity --dry-run compares the in-memory frame and never writes.
        return _run_parity(supabase, seasons, all_rows)

    if dry_run:
        print(f"\n[DRY RUN] Would upsert {len(all_rows)} rows to {TABLE}.")
        for r in all_rows[:3]:
            print("  " + ", ".join(
                f"{k}={r.get(k)}" for k in (
                    "season", "week", "season_type", "team", "opponent_team", "game_date",
                    "gsis_id", "passing_yards", "rushing_yards", "receiving_yards",
                    "targets", "offense_snaps", "offense_pct", "total_points")))
        return True

    print(f"\n=== Upserting {len(all_rows)} rows to {TABLE} ===")
    upsert_rows(supabase, all_rows)
    print(f"\nDone! Upserted {len(all_rows)} rows to {TABLE}.")
    return True


def _run_parity(supabase, seasons: list[int], in_memory_rows: list[dict] | None) -> bool:
    """Compare weekly REG sums with nfl_stats. ``in_memory_rows`` None means read the DB table."""
    name_by_id = {p["id"]: p["name"] for p in fetch_all_rows(supabase, "players", "id, name")}
    select = "id, player_id, season, games_played, total_points, " + ", ".join(PARITY_COLS)
    season_rows: list[dict] = []
    weekly_rows: list[dict] = []
    for year in seasons:
        season_rows.extend(fetch_all_rows(supabase, "nfl_stats", select, filters=[("eq", "season", year)]))
        if in_memory_rows is None:
            weekly_rows.extend(fetch_all_rows(
                supabase, TABLE, "id, player_id, season, season_type, total_points, " + ", ".join(PARITY_COLS),
                filters=[("eq", "season", year), ("eq", "season_type", "REG")],
            ))
    if in_memory_rows is not None:
        weekly_rows = in_memory_rows
    report = compare_parity(sum_weekly_to_season(weekly_rows), season_rows, name_by_id=name_by_id)
    print_parity_report(report, name_by_id)
    return report["ok"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill weekly NFL stats into nfl_weekly_stats")
    parser.add_argument("--seasons", nargs="+", default=None,
                        help="Seasons as 2024 2025 or a range 2018-2025 (default: the current NFL season)")
    parser.add_argument("--current-season", action="store_true",
                        help="Print the NFL season in progress today and exit")
    parser.add_argument("--season-type", choices=[*SEASON_TYPES, "ALL"], default="ALL",
                        help="Which game types to load (default ALL)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Build rows without writing to the database")
    parser.add_argument("--check-parity", action="store_true",
                        help="Compare REG weekly sums with nfl_stats; exits 1 over the tolerance. "
                             "With --dry-run, compares the freshly built nflverse frame instead of the table")
    args = parser.parse_args()

    if args.current_season:
        print(current_nfl_season())
        return

    seasons = parse_seasons(args.seasons) if args.seasons else [current_nfl_season()]
    print("NFL Weekly Stats Backfill")
    print(f"  Seasons: {seasons}")
    print(f"  Season type: {args.season_type}")
    print(f"  Dry run: {args.dry_run}")
    ok = backfill_weekly(seasons, args.season_type, args.dry_run, args.check_parity)
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
