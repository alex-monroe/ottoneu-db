#!/usr/bin/env python3
"""Backfill NFL team offensive volume totals into Supabase from nflverse play-by-play.

Populates two tables:
1. `nfl_team_weekly_volume`: team offensive volume per game (week), with `game_date`,
   `opponent_team`, pass attempts, carries, dropbacks, sacks, plays, and neutral-situation volume.
2. `nfl_team_volume`: season totals per team-season, serving as the opportunity denominator
   for target/carry share projections and team budgets (00-synthesis.md §7, 07-projection-calendar.md §3).

Metric definitions (from nflverse play-by-play):
- `pass_attempts`: (pass_attempt == 1) & (sack == 0) & (two_point_attempt == 0)
- `rush_attempts`: (rush_attempt == 1) & (two_point_attempt == 0)
- `sacks`: (sack == 1)
- `dropbacks`: (qb_dropback == 1) & (two_point_attempt == 0)
- `plays`: pass_attempts + rush_attempts + sacks (scrimmage plays)
- `neutral_*`: plays occurring in neutral game script (0.20 <= wp <= 0.80, |score_diff| <= 7,
  outside final 2 minutes of each half).

Usage:
    just backfill-nfl-team-volume --seasons 2025 --dry-run
    just backfill-nfl-team-volume --seasons 2010-2026
    just backfill-nfl-team-volume --current-season
"""

from __future__ import annotations

import argparse
from datetime import date
import io
import re
from typing import Any
import urllib.request

import numpy as np
import pandas as pd

from scripts.backfill_vegas_lines import GAMES_URL
from scripts.config import get_supabase_client
from scripts.nfl_week import today_in_league_tz

_PBP_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "pbp/play_by_play_{year}.parquet"
)

TEAM_SEASON_TABLE = "nfl_team_volume"
TEAM_WEEKLY_TABLE = "nfl_team_weekly_volume"
TEAM_SEASON_UPSERT_CONFLICT = "team,season,season_type"
TEAM_WEEKLY_UPSERT_CONFLICT = "team,season,week,season_type"
BATCH_SIZE = 500
SEASON_TYPES = ("REG", "POST")

# Earliest season nflverse provides play-by-play for
FIRST_PBP_SEASON = 2010
LAST_MONTH_OF_PREVIOUS_SEASON = 2

CANONICAL_TEAMS = frozenset({
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE",
    "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
    "LA", "LAC", "LV", "MIA", "MIN", "NE", "NO", "NYG",
    "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS",
})

PBP_USECOLS = [
    "season", "week", "season_type", "game_id", "game_date",
    "home_team", "away_team", "posteam", "defteam",
    "play_type", "qb_dropback", "rush_attempt", "pass_attempt", "sack",
    "two_point_attempt", "passing_yards", "rushing_yards",
    "score_differential", "wp", "half_seconds_remaining",
]


def current_nfl_season(today: date | None = None) -> int:
    """The NFL season in progress on ``today`` (default: today in league time)."""
    if today is None:
        today = today_in_league_tz()
    return today.year - 1 if today.month <= LAST_MONTH_OF_PREVIOUS_SEASON else today.year


def expand_seasons(tokens: list[str]) -> list[int]:
    """Expand ``2018 2020`` / ``2018-2022`` tokens into a sorted unique list."""
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


def load_pbp(season: int) -> pd.DataFrame | None:
    """Download play-by-play for a season."""
    url = _PBP_URL.format(year=season)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ottoneu-db"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        return pd.read_parquet(io.BytesIO(data), columns=[
            c for c in PBP_USECOLS if c != "game_date"
        ])
    except Exception as e:
        print(f"    SKIP PBP for {season}: {e}")
        return None


def load_games() -> pd.DataFrame | None:
    """Download games.csv to map game_id -> gameday (date)."""
    try:
        return pd.read_csv(GAMES_URL, usecols=["game_id", "gameday"])
    except Exception as e:
        print(f"    SKIP games.csv (game_date will be NULL): {e}")
        return None


def aggregate_pbp_team_volume(
    pbp_df: pd.DataFrame,
    games_df: pd.DataFrame | None = None,
    season_type_filter: str = "ALL",
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Aggregate raw PBP dataframe into weekly and season volume rows.

    Returns:
        (weekly_rows, season_rows)
    """
    if pbp_df.empty:
        return [], []

    df = pbp_df.copy()

    # Filter to offensive plays by known NFL teams
    df = df[df["posteam"].notna() & df["posteam"].isin(CANONICAL_TEAMS)].copy()
    if df.empty:
        return [], []

    if season_type_filter in SEASON_TYPES:
        df = df[df["season_type"] == season_type_filter]
    elif season_type_filter != "ALL":
        raise ValueError(f"Unknown season_type_filter: {season_type_filter}")

    if df.empty:
        return [], []

    # Map game_date from games_df if available
    date_map: dict[str, str] = {}
    if games_df is not None and not games_df.empty:
        valid_games = games_df.dropna(subset=["game_id", "gameday"])
        date_map = dict(zip(valid_games["game_id"], valid_games["gameday"].astype(str)))

    # Compute binary play indicators
    two_point = pd.to_numeric(df.get("two_point_attempt", 0), errors="coerce").fillna(0) == 1
    sack = pd.to_numeric(df.get("sack", 0), errors="coerce").fillna(0) == 1
    pass_att_raw = pd.to_numeric(df.get("pass_attempt", 0), errors="coerce").fillna(0) == 1
    rush_att_raw = pd.to_numeric(df.get("rush_attempt", 0), errors="coerce").fillna(0) == 1
    dropback_raw = pd.to_numeric(df.get("qb_dropback", 0), errors="coerce").fillna(0) == 1

    df["is_pass"] = pass_att_raw & (~sack) & (~two_point)
    df["is_rush"] = rush_att_raw & (~two_point)
    df["is_sack"] = sack
    df["is_dropback"] = dropback_raw & (~two_point)
    df["is_play"] = df["is_pass"] | df["is_rush"] | df["is_sack"]

    # Yards
    pass_yds = pd.to_numeric(df.get("passing_yards", 0), errors="coerce").fillna(0)
    rush_yds = pd.to_numeric(df.get("rushing_yards", 0), errors="coerce").fillna(0)
    df["pass_yds_clean"] = np.where(df["is_pass"] | df["is_sack"], pass_yds, 0)
    df["rush_yds_clean"] = np.where(df["is_rush"], rush_yds, 0)

    # Neutral game script filter
    wp = pd.to_numeric(df.get("wp", np.nan), errors="coerce")
    score_diff = pd.to_numeric(df.get("score_differential", np.nan), errors="coerce")
    half_sec = pd.to_numeric(df.get("half_seconds_remaining", np.nan), errors="coerce")

    is_neutral = (
        (~two_point)
        & (wp >= 0.20)
        & (wp <= 0.80)
        & (score_diff.abs() <= 7)
        & (half_sec > 120)
    ).fillna(False)

    df["neutral_play"] = df["is_play"] & is_neutral
    df["neutral_pass"] = df["is_pass"] & is_neutral
    df["neutral_rush"] = df["is_rush"] & is_neutral
    df["neutral_drop"] = df["is_dropback"] & is_neutral

    # Group by team-week
    weekly_records: list[dict[str, Any]] = []
    weekly_grouped = df.groupby(["posteam", "season", "week", "season_type"], as_index=False)

    for (team, season, week, stype), group in weekly_grouped:
        gid = str(group["game_id"].iloc[0]) if "game_id" in group.columns else None
        opp = str(group["defteam"].dropna().iloc[0]) if "defteam" in group.columns and len(group["defteam"].dropna()) > 0 else None
        gdate = date_map.get(gid) if gid else None

        weekly_records.append({
            "team": str(team),
            "season": int(season),
            "week": int(week),
            "season_type": str(stype),
            "game_id": gid,
            "game_date": gdate,
            "opponent_team": opp,
            "plays": int(group["is_play"].sum()),
            "pass_attempts": int(group["is_pass"].sum()),
            "rush_attempts": int(group["is_rush"].sum()),
            "dropbacks": int(group["is_dropback"].sum()),
            "sacks": int(group["is_sack"].sum()),
            "passing_yards": int(group["pass_yds_clean"].sum()),
            "rushing_yards": int(group["rush_yds_clean"].sum()),
            "neutral_plays": int(group["neutral_play"].sum()),
            "neutral_pass_attempts": int(group["neutral_pass"].sum()),
            "neutral_rush_attempts": int(group["neutral_rush"].sum()),
            "neutral_dropbacks": int(group["neutral_drop"].sum()),
        })

    # Group by team-season
    season_records: list[dict[str, Any]] = []
    season_grouped = df.groupby(["posteam", "season", "season_type"], as_index=False)

    for (team, season, stype), group in season_grouped:
        season_records.append({
            "team": str(team),
            "season": int(season),
            "season_type": str(stype),
            "games": int(group["game_id"].nunique()) if "game_id" in group.columns else 0,
            "plays": int(group["is_play"].sum()),
            "pass_attempts": int(group["is_pass"].sum()),
            "rush_attempts": int(group["is_rush"].sum()),
            "dropbacks": int(group["is_dropback"].sum()),
            "sacks": int(group["is_sack"].sum()),
            "passing_yards": int(group["pass_yds_clean"].sum()),
            "rushing_yards": int(group["rush_yds_clean"].sum()),
            "neutral_plays": int(group["neutral_play"].sum()),
            "neutral_pass_attempts": int(group["neutral_pass"].sum()),
            "neutral_rush_attempts": int(group["neutral_rush"].sum()),
            "neutral_dropbacks": int(group["neutral_drop"].sum()),
        })

    return weekly_records, season_records


def backfill_nfl_team_volume(
    supabase,
    seasons: list[int],
    season_type: str = "ALL",
    dry_run: bool = False,
) -> dict[str, int]:
    """Execute backfill for given seasons."""
    print(f"NFL Team Volume Backfill")
    print(f"  Seasons:     {seasons}")
    print(f"  Season type: {season_type}")
    print(f"  Dry run:     {dry_run}")

    print("\nFetching games.csv for game_date mapping...")
    games_df = load_games()
    if games_df is not None:
        print(f"  Loaded {len(games_df)} game records.")

    total_weekly = 0
    total_season = 0

    for year in seasons:
        print(f"\nProcessing season {year}...")
        pbp_df = load_pbp(year)
        if pbp_df is None or pbp_df.empty:
            continue

        weekly_rows, season_rows = aggregate_pbp_team_volume(
            pbp_df, games_df=games_df, season_type_filter=season_type
        )
        print(f"  Computed {len(weekly_rows)} weekly rows, {len(season_rows)} season rows.")

        total_weekly += len(weekly_rows)
        total_season += len(season_rows)

        if not dry_run and weekly_rows:
            # Batch upsert weekly rows
            for i in range(0, len(weekly_rows), BATCH_SIZE):
                chunk = weekly_rows[i : i + BATCH_SIZE]
                supabase.table(TEAM_WEEKLY_TABLE).upsert(
                    chunk, on_conflict=TEAM_WEEKLY_UPSERT_CONFLICT
                ).execute()

        if not dry_run and season_rows:
            # Batch upsert season rows
            for i in range(0, len(season_rows), BATCH_SIZE):
                chunk = season_rows[i : i + BATCH_SIZE]
                supabase.table(TEAM_SEASON_TABLE).upsert(
                    chunk, on_conflict=TEAM_SEASON_UPSERT_CONFLICT
                ).execute()

    print("\nBackfill Summary:")
    print(f"  Total weekly rows processed: {total_weekly}")
    print(f"  Total season rows processed: {total_season}")

    return {"weekly": total_weekly, "season": total_season}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--seasons",
        nargs="*",
        default=[],
        help="Season year(s) or ranges (e.g. '2024 2025' or '2010-2026'). Blank = current season.",
    )
    parser.add_argument(
        "--season-type",
        choices=["REG", "POST", "ALL"],
        default="ALL",
        help="Season type to include (default: ALL)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Aggregate without writing to Supabase",
    )
    parser.add_argument(
        "--current-season",
        action="store_true",
        help="Print the current NFL season and exit",
    )
    args = parser.parse_args()

    if args.current_season:
        print(current_nfl_season())
        return

    seasons = expand_seasons(args.seasons) if args.seasons else [current_nfl_season()]

    sb = get_supabase_client()
    backfill_nfl_team_volume(
        sb,
        seasons=seasons,
        season_type=args.season_type,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
