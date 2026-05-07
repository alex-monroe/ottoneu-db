"""Seed preseason Vegas win totals for an upcoming season.

Sportsbook win totals are published in March/April but per-game lines
(needed to derive ``implied_total``) require the NFL schedule. This
script lets us populate ``team_vegas_lines`` with just ``win_total``
in the spring; a later run of ``backfill_vegas_lines.py`` will fill
in ``implied_total`` once nflverse picks up the schedule.

The data is hand-curated from public sportsbook reporting since
machine-readable preseason win totals require a paid odds API.
GH #378 follow-up.

Usage:
    venv/bin/python scripts/seed_preseason_win_totals.py --season 2026
    venv/bin/python scripts/seed_preseason_win_totals.py --season 2026 --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.config import get_supabase_client


# Preseason win totals consensus. Source: NFLTradeRumors aggregation of
# DraftKings opening lines (Feb 2026); cross-checked against BetMGM and
# CBS Sports reporting. 32 teams, sums to 277 (slight overround vs. the
# 272 zero-vig fair value, typical for season-long markets).
WIN_TOTALS_BY_SEASON: dict[int, dict[str, float]] = {
    2026: {
        "ARI": 4.5,
        "ATL": 7.5,
        "BAL": 11.5,
        "BUF": 10.5,
        "CAR": 7.5,
        "CHI": 9.5,
        "CIN": 9.5,
        "CLE": 6.5,
        "DAL": 9.5,
        "DEN": 9.5,
        "DET": 10.5,
        "GB": 10.5,
        "HOU": 9.5,
        "IND": 7.5,
        "JAX": 9.5,
        "KC": 10.5,
        "LA": 11.5,
        "LAC": 10.5,
        "LV": 5.5,
        "MIA": 4.5,
        "MIN": 8.5,
        "NE": 9.5,
        "NO": 7.5,
        "NYG": 7.5,
        "NYJ": 5.5,
        "PHI": 10.5,
        "PIT": 8.5,
        "SEA": 10.5,
        "SF": 10.5,
        "TB": 8.5,
        "TEN": 6.5,
        "WAS": 7.5,
    },
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed preseason win totals.")
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    totals = WIN_TOTALS_BY_SEASON.get(args.season)
    if not totals:
        available = sorted(WIN_TOTALS_BY_SEASON.keys())
        print(
            f"No preseason win totals encoded for {args.season}. "
            f"Add them to WIN_TOTALS_BY_SEASON. Encoded: {available}"
        )
        sys.exit(1)

    if len(totals) != 32:
        print(f"Expected 32 teams for {args.season}, got {len(totals)}")
        sys.exit(1)

    payload = [
        {
            "team": team,
            "season": args.season,
            "implied_total": None,
            "win_total": float(win_total),
        }
        for team, win_total in sorted(totals.items())
    ]

    total_wins = sum(totals.values())
    print(f"Season {args.season}: {len(totals)} teams, sum of win totals = {total_wins:.1f}")
    print(f"  (Fair value 272.0 for a 17-game season; ~5 above is normal sportsbook overround.)")

    if args.dry_run:
        print(f"\n[DRY RUN] Would upsert {len(payload)} rows. Sample:")
        for p in payload[:6]:
            print(f"  {p}")
        return

    supabase = get_supabase_client()
    print(f"\nUpserting to team_vegas_lines...")
    supabase.table("team_vegas_lines").upsert(
        payload, on_conflict="team,season"
    ).execute()
    print("Done.")


if __name__ == "__main__":
    main()
