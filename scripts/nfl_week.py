"""NFL-week resolver: map a date to the NFL regular-season week to display.

The season-cycle resolver (scripts/season.py) answers "what season and what
phase"; this module answers the finer question "which NFL week's numbers should
we be showing right now" — the primitive the weekly-projection feature needs and
that this repo previously had no notion of.

Week boundary: **Tuesday 00:00 America/New_York**, not the Thursday kickoff.
An NFL week's games run Thursday night through Monday night, so a Tuesday flip
means the moment the Monday-nighter ends we roll forward to the next slate. That
is what makes "the upcoming week's projection shows up on Tuesday" true, while
Monday-night games still count against the week they belong to.

Anchor: `league_calendar.regular_season_start` — the Thursday of Week 1, already
scraped by scripts/scrape_league_calendar.py and read by scripts/season.py. Weeks
are whole 7-day blocks measured from the Tuesday two days *before* that Thursday:

    week = floor((today - (week1_thursday - 2d)) / 7) + 1

Before Week 1's Tuesday the upcoming week is 1; after Week 18's Monday there is
no current week (the regular season is over) and `current_nfl_week` returns None.

Override: NFL_WEEK_OVERRIDE short-circuits the resolved week (testing, or a
season whose calendar row is missing/wrong). SEASON_OVERRIDE is honoured through
scripts.season.

web/lib/nfl-week.ts is the TypeScript twin of this logic; scripts/tests/
test_nfl_week.py and web/__tests__/lib/nfl-week.test.ts share a boundary table so
the two cannot drift.
"""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from scripts.config import LEAGUE_ID, NFL_REGULAR_SEASON_WEEKS
from scripts.season import _fetch_calendar

# The league — and the NFL schedule it follows — lives on US Eastern time. A
# Monday-night game ending at 11:30pm ET is still "this week" everywhere.
LEAGUE_TZ = ZoneInfo("America/New_York")

# Days from the Thursday of Week 1 back to the Tuesday that opens that week.
_THURSDAY_TO_TUESDAY = 2

# date.weekday(): Monday is 0, so Thursday is 3.
_THURSDAY = 3


def today_in_league_tz(now: Optional[datetime] = None) -> date:
    """Today's date in the league's timezone.

    A bare `date.today()` on a UTC server rolls over at 7-8pm ET, which would
    flip the displayed week most of a day early. Always resolve through here.
    """
    if now is None:
        now = datetime.now(LEAGUE_TZ)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=LEAGUE_TZ)
    return now.astimezone(LEAGUE_TZ).date()


def _as_date(value) -> Optional[date]:
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _anchors(calendar_rows: list[dict]) -> list[tuple[date, int]]:
    """(week-1 opening Tuesday, NFL season) for every season we have a kickoff for.

    Sorted by date. The season label comes from the calendar row that declares
    the kickoff, so it is the NFL season those weeks belong to.
    """
    out = []
    for row in calendar_rows or []:
        start = _as_date(row.get("regular_season_start"))
        season = row.get("season")
        if start is None or season is None:
            continue
        out.append((_anchor_from_start(start), int(season)))
    return sorted(out)


def _anchor_from_start(start: date) -> date:
    """The Tuesday opening Week 1, from whatever date Ottoneu calls the start.

    Do NOT just subtract two days. Ottoneu's `regular_season_start` is not
    reliably the Thursday kickoff — for 2026 it is Wednesday 2026-09-09, while
    the NFL's Week 1 Thursday is 2026-09-10. Subtracting blindly would put the
    boundary on a Monday and push Week 1's Monday-night game into Week 2, which
    is precisely what the Tuesday rule exists to prevent.

    So snap forward to the first Thursday on or after the recorded start, then
    step back to that week's Tuesday. This lands on the same anchor whether
    Ottoneu records the Monday, Tuesday, Wednesday, or the Thursday itself.
    """
    thursday = start + timedelta(days=(_THURSDAY - start.weekday()) % 7)
    return thursday - timedelta(days=_THURSDAY_TO_TUESDAY)


def resolve_window(
    today: date, calendar_rows: list[dict]
) -> tuple[Optional[int], Optional[date]]:
    """Which NFL season's slate `today` falls in, and that season's anchor.

    Deliberately resolved from the kickoff dates rather than from the active
    league-calendar row, because the two disagree twice a year:

      * Ottoneu rolls its league season in early January, but NFL Week 18 is
        played a day or two later. Using the active row would label those games
        with the *next* season — and the retention purge would then delete the
        very week the cards are showing.
      * All summer the active row's `stats_season` is last year, but the
        upcoming slate is this year's Week 1.

    Returns (season, anchor); either may be None when no kickoff date is known.
    """
    anchors = _anchors(calendar_rows)
    if not anchors:
        return None, None

    started = [(a, s) for a, s in anchors if a <= today]
    # The most recent kickoff wins while its season still has weeks left — this
    # is what keeps Week 18 attributed to the season that played it.
    if started:
        anchor, season = started[-1]
        if week_for_date(today, anchor) is not None:
            return season, anchor

    # Otherwise the next kickoff is what "upcoming" means.
    upcoming = [(a, s) for a, s in anchors if a > today]
    if upcoming:
        return upcoming[0][1], upcoming[0][0]

    # Past the final week with no next season scheduled yet.
    anchor, season = started[-1]
    return season, anchor


def week_for_date(today: date, anchor: date) -> Optional[int]:
    """The NFL week containing `today`, given Week 1's opening Tuesday.

    Returns None past the end of the regular season. Dates before the anchor
    clamp to week 1 — in the run-up to kickoff the "upcoming week" is Week 1.
    """
    if today < anchor:
        return 1
    week = (today - anchor).days // 7 + 1
    if week > NFL_REGULAR_SEASON_WEEKS:
        return None
    return week


def _override() -> Optional[int]:
    raw = os.getenv("NFL_WEEK_OVERRIDE")
    if not raw:
        return None
    week = int(raw)
    if not 1 <= week <= NFL_REGULAR_SEASON_WEEKS:
        raise ValueError(
            f"NFL_WEEK_OVERRIDE must be between 1 and {NFL_REGULAR_SEASON_WEEKS}, got {week}"
        )
    return week


def current_nfl_week(
    today: Optional[date] = None,
    calendar_rows: Optional[list[dict]] = None,
    league_id: int = LEAGUE_ID,
) -> tuple[Optional[int], Optional[int]]:
    """Resolve (season, week) for the slate we should be showing.

    Args:
        today: Date to resolve (default: today in the league timezone). Pass a
            fixed date in tests.
        calendar_rows: league_calendar rows; fetched from the DB if omitted.
        league_id: League to resolve for.

    Returns:
        (season, week). `week` is None when the regular season is over or no
        kickoff date is known. `season` is the NFL season those weeks belong to.
    """
    if today is None:
        today = today_in_league_tz()
    if calendar_rows is None:
        calendar_rows = _fetch_calendar(league_id)

    season, anchor = resolve_window(today, calendar_rows)

    override = _override()
    if override is not None:
        return season, override

    if anchor is None:
        return season, None
    return season, week_for_date(today, anchor)


def is_nfl_week_live(
    today: Optional[date] = None,
    calendar_rows: Optional[list[dict]] = None,
    league_id: int = LEAGUE_ID,
) -> bool:
    """Are NFL regular-season games actually being played right now?

    Use this, not the league phase from scripts.season, to gate in-season jobs.
    The two disagree at the end of the year: Ottoneu rolls its league season in
    early January and the phase becomes `pre_arb`, but NFL Week 18 is played a
    day or two later. Gating the weekly ingest on the league phase would silently
    skip the final week of the season.

    False before the first kickoff and after Week 18's Monday.
    """
    if today is None:
        today = today_in_league_tz()
    if calendar_rows is None:
        calendar_rows = _fetch_calendar(league_id)

    _, anchor = resolve_window(today, calendar_rows)
    if anchor is None or today < anchor:
        return False
    return week_for_date(today, anchor) is not None


def display_weeks(
    today: Optional[date] = None,
    calendar_rows: Optional[list[dict]] = None,
    league_id: int = LEAGUE_ID,
) -> dict:
    """The pair of weeks a player card renders.

    `upcoming` is the slate being played next (or now); `previous` is the one
    just completed, which stays on the card after the games are over so people
    can see how the projection actually did. `previous` is None during Week 1,
    and once the regular season ends `upcoming` is None while `previous` holds
    the final week.

    Returns:
        {"season": int|None, "upcoming": int|None, "previous": int|None}
    """
    if today is None:
        today = today_in_league_tz()
    if calendar_rows is None:
        calendar_rows = _fetch_calendar(league_id)

    season, week = current_nfl_week(today, calendar_rows, league_id)

    if week is None:
        # Season over (or no kickoff known): nothing upcoming, and the finale is
        # what stays on the card.
        _, anchor = resolve_window(today, calendar_rows)
        return {
            "season": season,
            "upcoming": None,
            "previous": NFL_REGULAR_SEASON_WEEKS if anchor is not None else None,
        }

    return {
        "season": season,
        "upcoming": week,
        "previous": week - 1 if week > 1 else None,
    }
