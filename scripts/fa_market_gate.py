"""Decide whether the scheduled free-agent market scrape should run now.

The "Scrape FA Market" workflow fires every few hours all year, but the board it
feeds is an in-season tool (the off-season FA market is the keeper auction, which
has its own pages). This gate asks the league_calendar resolver
(scripts/season.py) for the phase instead of hard-coding months, and writes
`due=true|false` to $GITHUB_OUTPUT so the workflow skips the scrape job cleanly
(a skipped job leaves the run green). Same shape as scripts/arb_scrape_gate.py.

Usage:
    python -m scripts.fa_market_gate            # resolve from league_calendar
    python -m scripts.fa_market_gate --force    # always due (manual dispatch)
"""

from __future__ import annotations

import argparse
import os
from datetime import date

from scripts.season import get_season_context

DUE_PHASES = ("in_season",)


def fa_market_due(ctx: dict) -> tuple[bool, str]:
    """Whether the scrape is due for this season context, with a reason for the log."""
    phase = ctx.get("phase")
    due = phase in DUE_PHASES
    return due, f"League phase is {phase!r} [source={ctx.get('source')}]"


def _resolve_context(today: date) -> dict:
    """Season context, degrading to the month-based fallback if the DB read fails."""
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


def main(argv: list[str] | None = None, today: date | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--force", action="store_true",
                        help="Treat the scrape as due regardless of the phase.")
    args = parser.parse_args(argv)
    today = today or date.today()

    if args.force:
        due, reason = True, "Forced (manual dispatch); skipping the phase check."
    else:
        due, reason = fa_market_due(_resolve_context(today))

    print(f"{reason} -> {'scraping' if due else 'skipping scrape'}.")
    _write_output(due)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
