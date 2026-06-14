"""Backfill per-team-season head coach + coaching-change signal from nflverse.

Pulls `home_coach`/`away_coach` per regular-season game from nflverse
`games.csv` (the same free, leakage-checkable source as Vegas lines), derives
each team's *season-opening* head coach (the coach of its earliest-week game),
and records:

- ``head_coach``: the season-opening head coach.
- ``head_coach_changed``: 1 if that coach differs from the prior season's
  opening coach, else 0; NULL when no prior season is loaded to compare.
- ``coach_tenure_years``: consecutive seasons (incl. current) the opening
  coach has led the team, over the full loaded history.

A new head coach changes scheme, pace, and pass rate — the classic
"QB/WR breakout or bust" driver a player's own PPG history can't see. Coaching
hires complete by late Jan–Feb, well before the offseason projection run, so
the signal is leakage-free w.r.t. the target season. Spike #651.

History is loaded from EARLIEST_LOAD_SEASON so tenure and the changed-flag are
accurate for the stored window; rows are stored from ``--since`` (default 2016).

Usage:
    venv/bin/python scripts/backfill_team_coaching.py             # store 2016+
    venv/bin/python scripts/backfill_team_coaching.py --since 2021
    venv/bin/python scripts/backfill_team_coaching.py --dry-run
"""

from __future__ import annotations

import argparse

import pandas as pd

from scripts.config import get_supabase_client

GAMES_URL = "https://github.com/nflverse/nfldata/raw/master/data/games.csv"
DEFAULT_SINCE_SEASON = 2016
# Load extra history before --since so coach_tenure_years and the
# head_coach_changed flag are accurate for the earliest stored season.
EARLIEST_LOAD_SEASON = 2005


def load_games(earliest: int) -> pd.DataFrame:
    df = pd.read_csv(GAMES_URL)
    df = df[df["season"] >= earliest]
    df = df[df["game_type"] == "REG"]
    df = df.dropna(subset=["home_team", "away_team", "week"])
    return df.copy()


def opening_coach_by_team_season(games_df: pd.DataFrame) -> pd.DataFrame:
    """Each (team, season)'s head coach from its earliest-week game."""
    home = games_df.assign(team=games_df["home_team"], coach=games_df["home_coach"])[
        ["season", "team", "week", "coach"]
    ]
    away = games_df.assign(team=games_df["away_team"], coach=games_df["away_coach"])[
        ["season", "team", "week", "coach"]
    ]
    long_df = pd.concat([home, away], ignore_index=True)
    long_df = long_df.dropna(subset=["coach"])

    # The season-opening coach = coach of the team's earliest-week game.
    long_df = long_df.sort_values(["season", "team", "week"])
    opening = long_df.groupby(["season", "team"], as_index=False).first()
    return opening[["season", "team", "coach"]].rename(columns={"coach": "head_coach"})


def derive_signal(opening_df: pd.DataFrame) -> pd.DataFrame:
    """Add head_coach_changed (vs prior season) and coach_tenure_years."""
    rows = []
    for team, team_df in opening_df.groupby("team"):
        team_df = team_df.sort_values("season")
        prev_coach: str | None = None
        prev_season: int | None = None
        tenure = 0
        for r in team_df.itertuples(index=False):
            season = int(r.season)
            coach = str(r.head_coach)
            if prev_coach is None or prev_season != season - 1:
                # No comparable prior season loaded → changed is unknown (NULL).
                changed: bool | None = None
                tenure = 1
            elif coach == prev_coach:
                changed = False
                tenure += 1
            else:
                changed = True
                tenure = 1
            rows.append(
                {
                    "team": team,
                    "season": season,
                    "head_coach": coach,
                    "head_coach_changed": changed,
                    "coach_tenure_years": tenure,
                }
            )
            prev_coach = coach
            prev_season = season
    return pd.DataFrame(rows)


def upsert_team_coaching(supabase, rows_df: pd.DataFrame, dry_run: bool) -> None:
    if rows_df.empty:
        print("  No rows to upsert.")
        return

    payload = [
        {
            "team": str(r.team),
            "season": int(r.season),
            "head_coach": str(r.head_coach),
            "head_coach_changed": (
                None if pd.isna(r.head_coach_changed) else bool(r.head_coach_changed)
            ),
            "coach_tenure_years": int(r.coach_tenure_years),
        }
        for r in rows_df.itertuples(index=False)
    ]

    if dry_run:
        print(f"\n[DRY RUN] Would upsert {len(payload)} rows. Sample:")
        for p in payload[:8]:
            print(f"  {p}")
        return

    batch_size = 200
    total_batches = (len(payload) + batch_size - 1) // batch_size
    for i in range(0, len(payload), batch_size):
        batch = payload[i : i + batch_size]
        supabase.table("team_coaching").upsert(
            batch, on_conflict="team,season"
        ).execute()
        print(f"  Batch {i // batch_size + 1} / {total_batches}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill per-team-season head coach + coaching-change signal."
    )
    parser.add_argument(
        "--since",
        type=int,
        default=DEFAULT_SINCE_SEASON,
        help=f"Earliest season to store (default: {DEFAULT_SINCE_SEASON})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Aggregate without writing to the database",
    )
    args = parser.parse_args()

    print(f"Team Coaching Backfill (since={args.since}, dry_run={args.dry_run})")

    print("\nLoading nflverse games.csv...")
    games = load_games(EARLIEST_LOAD_SEASON)
    print(f"  {len(games)} regular-season games since {EARLIEST_LOAD_SEASON}")

    print("\nDeriving season-opening head coach per team...")
    opening = opening_coach_by_team_season(games)
    print(f"  {len(opening)} (team, season) coach rows")

    print("\nDeriving change flag + tenure...")
    signal = derive_signal(opening)
    # Store only the requested window (history before --since was loaded purely
    # to make the earliest stored season's signal accurate).
    signal = signal[signal["season"] >= args.since].sort_values(["season", "team"])
    print(f"  {len(signal)} rows in store window (season >= {args.since})")

    changes_per_season = (
        signal[signal["head_coach_changed"] == True]  # noqa: E712
        .groupby("season")
        .size()
    )
    print("\nCoaching changes per season:")
    print(changes_per_season.to_string() if not changes_per_season.empty else "  none")

    if args.dry_run:
        upsert_team_coaching(None, signal, dry_run=True)
        return

    supabase = get_supabase_client()
    print("\nUpserting to team_coaching...")
    upsert_team_coaching(supabase, signal, dry_run=False)
    print("Done.")


if __name__ == "__main__":
    main()
