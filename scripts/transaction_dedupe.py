"""Collapse duplicate ``transactions`` rows written by the two Ottoneu pipelines.

Two jobs write roster moves, and only one of them knows the real timestamp:

* ``scrape_player_cards.py`` parses each player card's Transaction History and
  records the move with its **true** date (e.g. ``Aug 22, 2026 9:26 PM``).
* ``reconcile_roster.py --infer-transactions`` diffs the ``/csv/rosters`` export
  against ``league_prices`` and **infers** a move, dated the run day, because the
  CSV carries no history at all.

The unique constraint on ``transactions`` includes ``transaction_date``
(migration 003), so the same real move filed under two different dates is two
rows, not one. That is exactly what happened around the 2026-08-22 auction: the
roster-CSV job runs before the card scrape, so ``reconcile_roster._already_scraped``
looked for card rows that had not been written yet, and every overnight move was
filed twice — once by each writer.

An inferred row is *always* strictly worse than the card row for the same move
(guessed date, no timestamp), so the resolution is one-directional: when a real
card row exists for the same move within a short window, delete the inference.
Doing that here — after the card scrape — makes the pipeline converge no matter
which job runs first, or if one of them fails and catches up a day late.

An inferred row with **no** card counterpart is kept: it is the only record of
that move (the card scrape does not cover every player, and a cut player can
drop out of the roster CSV entirely).

Usage::

    python -m scripts.transaction_dedupe            # dry run, whole league history
    python -m scripts.transaction_dedupe --apply
    python -m scripts.transaction_dedupe --since 2026-08-01 --apply
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from datetime import date, timedelta

from dotenv import load_dotenv

from scripts.config import LEAGUE_ID, fetch_all_rows, get_supabase_client

# Stamped into `raw_description` by reconcile_roster so an inferred row stays
# distinguishable from a card-scraped one — on re-read (web/lib/mcp/transactions.ts),
# when deduping the next run's inferences, and when purging here.
INFERRED_MARKER = "inferred from /csv/rosters reconciliation"

# How far before an inferred row to look for the real card row it duplicates.
# Wide enough to cover a card scrape that lagged or failed for a few days, narrow
# enough that a genuine repeat (add → cut → re-add at the same price) survives.
SUPERSEDE_WINDOW_DAYS = 14

# Supabase rejects very long `in` filters; delete ids in batches.
_DELETE_BATCH = 100

_SELECT = ("id, player_id, transaction_type, team_name, salary, "
           "transaction_date, raw_description")


def is_inferred(row: dict) -> bool:
    """True if ``row`` was written by reconcile_roster rather than the card scrape."""
    return INFERRED_MARKER in (row.get("raw_description") or "")


def move_key(row: dict) -> tuple:
    """Identity of the real-world move, independent of the date it was filed under."""
    return (row["player_id"], row["transaction_type"], row["salary"], row["team_name"])


def find_superseded(rows: list[dict], window_days: int = SUPERSEDE_WINDOW_DAYS) -> list[dict]:
    """Inferred rows that duplicate a real card row for the same move.

    A card row supersedes an inference when it describes the same move and is
    dated **on or before** it, within ``window_days``. The direction matters: an
    inference is filed on the run day, which is always on or after the move it
    describes, so a card row dated *later* is a different, later occurrence and
    must not swallow this one.
    """
    real_dates: dict[tuple, list[date]] = defaultdict(list)
    for r in rows:
        if not is_inferred(r) and r.get("transaction_date"):
            real_dates[move_key(r)].append(date.fromisoformat(r["transaction_date"]))

    superseded = []
    for r in rows:
        if not is_inferred(r) or not r.get("transaction_date"):
            continue
        filed = date.fromisoformat(r["transaction_date"])
        if any(0 <= (filed - real).days <= window_days
               for real in real_dates.get(move_key(r), ())):
            superseded.append(r)
    return superseded


def fetch_transactions(sb, league_id: int, since: str | None = None) -> list[dict]:
    """All league transactions (optionally from ``since``), paginated."""
    filters = [("eq", "league_id", league_id)]
    if since:
        filters.append(("gte", "transaction_date", since))
    return fetch_all_rows(sb, "transactions", _SELECT, filters=filters)


def purge_superseded_inferred(sb, league_id: int, since: str | None = None,
                              window_days: int = SUPERSEDE_WINDOW_DAYS,
                              apply: bool = False) -> dict:
    """Delete inferred rows that a real card row already covers. Returns a summary."""
    rows = fetch_transactions(sb, league_id, since)
    superseded = find_superseded(rows, window_days)
    inferred_total = sum(1 for r in rows if is_inferred(r))

    if apply and superseded:
        ids = [r["id"] for r in superseded]
        for i in range(0, len(ids), _DELETE_BATCH):
            sb.table("transactions").delete().in_("id", ids[i:i + _DELETE_BATCH]).execute()

    return {
        "scanned": len(rows),
        "inferred": inferred_total,
        "superseded": len(superseded),
        "kept_inferred": inferred_total - len(superseded),
        "deleted": len(superseded) if apply else 0,
        "rows": superseded,
    }


def recent_purge(sb, league_id: int, run_date: date, lookback_days: int = 30) -> dict:
    """Purge pass scoped to recent history — for running after the card scrape."""
    since = (run_date - timedelta(days=lookback_days)).isoformat()
    return purge_superseded_inferred(sb, league_id, since=since, apply=True)


def _print_summary(summary: dict, apply: bool, verbose: bool) -> None:
    mode = "APPLY" if apply else "DRY RUN"
    print(f"\n=== Transaction dedupe: {mode} ===")
    print(f"  scanned:         {summary['scanned']} rows")
    print(f"  inferred:        {summary['inferred']}")
    print(f"  superseded:      {summary['superseded']} "
          f"({'deleted' if apply else 'would delete'})")
    print(f"  kept (no card row): {summary['kept_inferred']}")
    if verbose:
        for r in sorted(summary["rows"], key=lambda x: x["transaction_date"]):
            print(f"    {r['transaction_date']}  {r['transaction_type']:32} "
                  f"${r['salary']:<4} {r['team_name']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Delete inferred transactions superseded by a real player-card row.")
    parser.add_argument("--apply", action="store_true",
                        help="Actually delete (default: dry run).")
    parser.add_argument("--since", help="Only consider rows on/after this date (YYYY-MM-DD).")
    parser.add_argument("--window-days", type=int, default=SUPERSEDE_WINDOW_DAYS,
                        help=f"Card-row lookback window (default: {SUPERSEDE_WINDOW_DAYS}).")
    parser.add_argument("--league-id", type=int, default=LEAGUE_ID)
    parser.add_argument("--verbose", action="store_true", help="List each affected row.")
    args = parser.parse_args(argv)

    load_dotenv()
    sb = get_supabase_client()
    summary = purge_superseded_inferred(sb, args.league_id, since=args.since,
                                        window_days=args.window_days, apply=args.apply)
    _print_summary(summary, args.apply, args.verbose)
    if not args.apply and summary["superseded"]:
        print("\n  Re-run with --apply to delete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
