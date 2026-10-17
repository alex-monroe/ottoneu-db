"""Decide whether the scheduled arbitration-progress scrape should run today.

The "Scrape Arbitration Progress" workflow fires every 6 hours all year, but the
Ottoneu arbitration page only changes while arbitration is open. This gate asks
the league_calendar resolver (scripts/season.py) instead of hard-coding months,
and writes `due=true|false` to $GITHUB_OUTPUT so the workflow can skip the scrape
job cleanly (a skipped job leaves the run green, so the scheduled-failure alert
stays quiet out of season).

Usage:
    python -m scripts.arb_scrape_gate            # resolve from league_calendar
    python -m scripts.arb_scrape_gate --force    # always due (manual dispatch)
"""

from __future__ import annotations

import argparse
import os
from datetime import date, timedelta
from typing import Optional

from scripts.season import _as_date, get_season_context

# Run once more the day after arbitration closes, to capture the final allocations.
FINAL_CATCH_UP_DAYS = 1


def arb_scrape_due(ctx: dict, today: date) -> tuple[bool, str]:
    """Whether the scrape is due, with a one-line reason for the log.

    Due while the arbitration window is open (arb_start through arb_end
    inclusive) plus FINAL_CATCH_UP_DAYS after arb_end. Without calendar dates
    (resolver fallback), defer to the resolver's arb_window_open.
    """
    deadlines = ctx.get("deadlines") or {}
    arb_start = _as_date(deadlines.get("arb_start"))
    arb_end = _as_date(deadlines.get("arb_end"))
    if arb_start and arb_end:
        last_day = arb_end + timedelta(days=FINAL_CATCH_UP_DAYS)
        due = arb_start <= today <= last_day
        state = "open" if due else "closed"
        return due, (
            f"Arbitration window {arb_start}..{arb_end} (+{FINAL_CATCH_UP_DAYS}d catch-up) "
            f"is {state} on {today} [source={ctx.get('source')}]"
        )
    due = bool(ctx.get("arb_window_open"))
    return due, (
        f"No arb dates in league_calendar; resolver says arb_window_open={due} "
        f"on {today} [source={ctx.get('source')}]"
    )


def _resolve_context(today: date) -> dict:
    """Season context, degrading to the month-based fallback if the DB read fails.

    The gate runs every 6 hours all year; a transient Supabase blip should not
    turn into a scheduled-failure alert.
    """
    try:
        return get_season_context(today=today)
    except Exception as e:  # noqa: BLE001 - any read failure degrades the same way
        print(f"Warning: league_calendar read failed ({e}); using month-based fallback.")
        return get_season_context(today=today, calendar_rows=[])


def _write_output(due: bool) -> None:
    path = os.getenv("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"due={'true' if due else 'false'}\n")


def main(argv: Optional[list[str]] = None, today: Optional[date] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--force", action="store_true",
                        help="Treat the scrape as due regardless of the calendar.")
    args = parser.parse_args(argv)
    today = today or date.today()

    if args.force:
        due, reason = True, "Forced (manual dispatch); skipping the arbitration window check."
    else:
        due, reason = arb_scrape_due(_resolve_context(today), today)

    print(f"{reason} -> {'scraping' if due else 'skipping scrape'}.")
    _write_output(due)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
