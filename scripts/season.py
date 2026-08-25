"""Season-cycle resolver: map a date to the league's position in its annual cycle.

The Ottoneu year is continuous (an NFL in-season plus a multi-stage offseason:
arbitration, keeper/cut, auction draft). This module is the single source of
truth for "what season are we in and what phase of the cycle" — every other
script and the web app (see web/lib/season.ts, a TS twin of this logic) derive
their season from it instead of a hand-maintained constant.

Boundary dates come from the `league_calendar` table (scraped from the Ottoneu
finances page by scripts/scrape_league_calendar.py). Ottoneu declares the season
label itself, so the season is never inferred when calendar data exists.

Phases (within season label Y):
    pre_arb      season_start      -> arb_end              (arbitration window)
    pre_keeper   arb_end           -> keeper_deadline      (keep/cut decisions)
    pre_draft    keeper_deadline   -> auction_date          (auction draft ahead)
    post_draft   auction_date      -> regular_season_start (rosters set, pre-kickoff)
    in_season    regular_season_start -> next season_start (NFL games played)

`post_draft` only appears once Ottoneu has published an auction date and it has
passed; while `auction_date` is unset or still ahead, the window stays
`pre_draft` (Ottoneu shows "Draft day has not been set yet" until it is
scheduled).

Override: SEASON_OVERRIDE / PHASE_OVERRIDE env vars short-circuit the result
(testing or off-schedule events). Date-driven by default, manual escape hatch
always available.
"""

from __future__ import annotations

import os
from datetime import date
from typing import Optional

from scripts.config import LEAGUE_ID

PHASES = ("pre_arb", "pre_keeper", "pre_draft", "post_draft", "in_season")


def _as_date(value) -> Optional[date]:
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _phase_from_row(today: date, row: dict) -> str:
    """Phase within the active calendar row, using its milestone dates."""
    arb_end = _as_date(row.get("arb_end"))
    keeper_deadline = _as_date(row.get("keeper_deadline"))
    auction_date = _as_date(row.get("auction_date"))
    regular_season_start = _as_date(row.get("regular_season_start"))
    if arb_end and today < arb_end:
        return "pre_arb"
    if keeper_deadline and today < keeper_deadline:
        return "pre_keeper"
    if regular_season_start and today < regular_season_start:
        # The auction splits this window: rosters are speculative before it and
        # settled after. Unset/future auction_date keeps the whole window pre_draft.
        if auction_date and today > auction_date:
            return "post_draft"
        return "pre_draft"
    return "in_season"


def _fallback_context(today: date) -> dict:
    """Month-based phase inference when no calendar row is available.

    Uses typical Ottoneu football boundaries so the resolver degrades gracefully
    rather than hard-failing on a missing/partial calendar.
    """
    year = today.year
    month = today.month
    if month >= 9:                 # Sep-Dec: NFL season
        phase, league_season = "in_season", year
    elif month < 4:               # Jan-Mar: arbitration window
        phase, league_season = "pre_arb", year
    elif month < 8:               # Apr-Jul: post-arb, pre-keeper
        phase, league_season = "pre_keeper", year
    else:                          # Aug: post-keeper, pre-draft
        phase, league_season = "pre_draft", year
    stats_season = league_season if phase == "in_season" else league_season - 1
    return {
        "phase": phase,
        "league_season": league_season,
        "projection_season": league_season,
        "stats_season": stats_season,
        "arbitration_season": league_season,
        "arb_window_open": phase == "pre_arb",
        "deadlines": {},
        "next_boundary": None,
        "source": "fallback",
    }


def get_season_context(
    today: Optional[date] = None,
    calendar_rows: Optional[list[dict]] = None,
    league_id: int = LEAGUE_ID,
) -> dict:
    """Resolve the season context for a date.

    Args:
        today: Date to resolve (default: today). Pass a fixed date in tests.
        calendar_rows: league_calendar rows; fetched from the DB if omitted.
        league_id: League to resolve for.

    Returns a dict with: phase, league_season, projection_season, stats_season,
    arbitration_season, arb_window_open, deadlines, next_boundary, source.
    """
    if today is None:
        today = date.today()

    if calendar_rows is None:
        calendar_rows = _fetch_calendar(league_id)

    rows = [r for r in (calendar_rows or []) if r.get("league_id", league_id) == league_id]
    # Active row: latest season_start on or before today.
    dated = [(s, r) for r in rows if (s := _as_date(r.get("season_start"))) is not None]
    active = max((r for s, r in dated if s <= today),
                 key=lambda r: _as_date(r["season_start"]), default=None)

    if active is None:
        ctx = _fallback_context(today)
    else:
        phase = _phase_from_row(today, active)
        league_season = int(active["season"])
        regular_season_start = _as_date(active.get("regular_season_start"))
        stats_season = (
            league_season
            if regular_season_start and today >= regular_season_start
            else league_season - 1
        )
        arb_start = _as_date(active.get("arb_start"))
        arb_end = _as_date(active.get("arb_end"))
        deadlines = {
            k: active.get(k)
            for k in ("season_start", "arb_start", "arb_end", "keeper_deadline",
                      "auction_date", "regular_season_start", "trade_deadline",
                      "last_auction_date")
            if active.get(k)
        }
        future = sorted(d for d in (_as_date(v) for v in deadlines.values()) if d and d > today)
        ctx = {
            "phase": phase,
            "league_season": league_season,
            "projection_season": league_season,
            "stats_season": stats_season,
            "arbitration_season": league_season,
            "arb_window_open": bool(arb_start and arb_end and arb_start <= today < arb_end),
            "deadlines": deadlines,
            "next_boundary": future[0].isoformat() if future else None,
            "source": "calendar",
        }

    return _apply_overrides(ctx)


def _apply_overrides(ctx: dict) -> dict:
    """Apply SEASON_OVERRIDE / PHASE_OVERRIDE env vars on top of the computed context."""
    season_override = os.getenv("SEASON_OVERRIDE")
    phase_override = os.getenv("PHASE_OVERRIDE")
    if season_override:
        season = int(season_override)
        ctx["league_season"] = season
        ctx["projection_season"] = season
        ctx["arbitration_season"] = season
        ctx["stats_season"] = season if ctx["phase"] == "in_season" else season - 1
        ctx["source"] = "override"
    if phase_override:
        if phase_override not in PHASES:
            raise ValueError(f"PHASE_OVERRIDE must be one of {PHASES}, got {phase_override!r}")
        ctx["phase"] = phase_override
        ctx["arb_window_open"] = phase_override == "pre_arb"
        ctx["source"] = "override"
    return ctx


def _fetch_calendar(league_id: int) -> list[dict]:
    from scripts.config import get_supabase_client
    supabase = get_supabase_client()
    return (
        supabase.table("league_calendar")
        .select("*")
        .eq("league_id", league_id)
        .execute()
        .data
        or []
    )


# === Convenience accessors (mirror web/lib/season.ts) ===
# Each resolves the live context from the league_calendar table. Pass an
# explicit season on the command line to skip resolution.

def league_season() -> int:
    """The league season whose roster we're managing (advancing pointer)."""
    return get_season_context()["league_season"]


def projection_season() -> int:
    """Season that projections / Draft Sharks values target."""
    return get_season_context()["projection_season"]


def stats_season() -> int:
    """Season whose actual NFL stats drive VORP / surplus / observed PPG."""
    return get_season_context()["stats_season"]


def arbitration_season() -> int:
    """Season arbitration is being conducted for."""
    return get_season_context()["arbitration_season"]


if __name__ == "__main__":
    import json
    print(json.dumps(get_season_context(), indent=2, default=str))
