"""Backfill team-season Vegas implied totals from nflverse.

Pulls regular-season `spread_line` + `total_line` per game from
nflverse `games.csv`, derives each team's per-game implied points-for and
points-against, and sums into season-level totals stored in
`team_vegas_lines`. The market implicitly prices coaching changes, free
agent signings, draft picks, scheme shifts — qualitative factors a
historical-stats model cannot derive. GH #378.

Notes:
- nflverse `spread_line` is the **away team's** spread (positive ⇒ home
  favored). So `home_implied = (total_line + spread_line)/2` and
  `away_implied = (total_line - spread_line)/2`. Verified against the
  2024 KC@BAL season opener (KC -3 home favorite, total 46 → KC implied
  24.5, BAL 21.5).
- The "season aggregate" is the sum across regular-season games where
  both `spread_line` and `total_line` are set. This averages out
  opponent-specific noise and minimises Week-1 single-game variance,
  but it does include some in-season information; lines set in
  May/June are the dominant signal.
- `win_total` is back-calculated via the Pythagorean expectation
  `PF^k / (PF^k + PA^k) * games` with k=2.37 (Football Outsiders' fit
  for NFL).

Usage:
    venv/bin/python scripts/backfill_vegas_lines.py             # 2016+
    venv/bin/python scripts/backfill_vegas_lines.py --since 2021
    venv/bin/python scripts/backfill_vegas_lines.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.config import get_supabase_client

GAMES_URL = "https://github.com/nflverse/nfldata/raw/master/data/games.csv"
DEFAULT_SINCE_SEASON = 2016
PYTHAG_EXPONENT = 2.37


def load_games(since_season: int) -> pd.DataFrame:
    df = pd.read_csv(GAMES_URL)
    df = df[df["season"] >= since_season]
    df = df[df["game_type"] == "REG"]
    df = df.dropna(subset=["spread_line", "total_line", "home_team", "away_team"])
    return df.copy()


def aggregate_team_season(games_df: pd.DataFrame) -> pd.DataFrame:
    """Build per-(team, season) implied totals from per-game lines."""
    home = games_df.assign(
        team=games_df["home_team"],
        implied_for=(games_df["total_line"] + games_df["spread_line"]) / 2.0,
        implied_against=(games_df["total_line"] - games_df["spread_line"]) / 2.0,
    )[["season", "team", "implied_for", "implied_against"]]

    away = games_df.assign(
        team=games_df["away_team"],
        implied_for=(games_df["total_line"] - games_df["spread_line"]) / 2.0,
        implied_against=(games_df["total_line"] + games_df["spread_line"]) / 2.0,
    )[["season", "team", "implied_for", "implied_against"]]

    long_df = pd.concat([home, away], ignore_index=True)

    agg = (
        long_df.groupby(["season", "team"], as_index=False)
        .agg(
            implied_total=("implied_for", "sum"),
            implied_against=("implied_against", "sum"),
            games=("implied_for", "count"),
        )
    )

    pf = agg["implied_total"].clip(lower=1.0) ** PYTHAG_EXPONENT
    pa = agg["implied_against"].clip(lower=1.0) ** PYTHAG_EXPONENT
    agg["win_total"] = (pf / (pf + pa)) * agg["games"]

    return agg


def upsert_vegas_lines(supabase, rows_df: pd.DataFrame, dry_run: bool) -> None:
    if rows_df.empty:
        print("  No rows to upsert.")
        return

    payload = [
        {
            "team": str(r.team),
            "season": int(r.season),
            "implied_total": round(float(r.implied_total), 2),
            "win_total": round(float(r.win_total), 2),
        }
        for r in rows_df.itertuples(index=False)
    ]

    if dry_run:
        print(f"\n[DRY RUN] Would upsert {len(payload)} rows. Sample:")
        for p in payload[:6]:
            print(f"  {p}")
        return

    batch_size = 200
    total_batches = (len(payload) + batch_size - 1) // batch_size
    for i in range(0, len(payload), batch_size):
        batch = payload[i : i + batch_size]
        supabase.table("team_vegas_lines").upsert(
            batch, on_conflict="team,season"
        ).execute()
        print(f"  Batch {i // batch_size + 1} / {total_batches}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill team-season Vegas implied totals from nflverse."
    )
    parser.add_argument(
        "--since",
        type=int,
        default=DEFAULT_SINCE_SEASON,
        help=f"Earliest season to ingest (default: {DEFAULT_SINCE_SEASON})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Aggregate without writing to the database",
    )
    args = parser.parse_args()

    print(f"Vegas Lines Backfill (since={args.since}, dry_run={args.dry_run})")

    print("\nLoading nflverse games.csv...")
    games = load_games(args.since)
    seasons = sorted(games["season"].unique().tolist())
    print(f"  {len(games)} regular-season games across seasons {seasons}")

    print("\nAggregating per-team-season implied totals...")
    agg = aggregate_team_season(games)
    print(f"  {len(agg)} (team, season) rows produced")

    if agg.empty:
        print("Nothing to upsert. Exiting.")
        return

    summary = agg.groupby("season").agg(
        teams=("team", "count"),
        league_mean=("implied_total", "mean"),
        league_min=("implied_total", "min"),
        league_max=("implied_total", "max"),
    )
    print("\nPer-season summary:")
    print(summary.round(1).to_string())

    if args.dry_run:
        upsert_vegas_lines(None, agg, dry_run=True)
        return

    supabase = get_supabase_client()
    print("\nUpserting to team_vegas_lines...")
    upsert_vegas_lines(supabase, agg, dry_run=False)
    print("Done.")


if __name__ == "__main__":
    main()
