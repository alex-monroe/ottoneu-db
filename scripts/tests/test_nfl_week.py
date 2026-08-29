"""Tests for the NFL-week resolver (scripts/nfl_week.py).

The boundary table lives in fixtures/nfl_week_boundaries.json and is shared with
web/__tests__/lib/nfl-week.test.ts, so the Python and TypeScript twins cannot
drift apart silently.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from scripts.nfl_week import (
    _anchor_from_start,
    current_nfl_week,
    display_weeks,
    is_nfl_week_live,
    resolve_window,
    today_in_league_tz,
    week_for_date,
)

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "nfl_week_boundaries.json").read_text()
)
ANCHOR = date.fromisoformat(FIXTURE["anchor_tuesday"])
CALENDAR = FIXTURE["calendar"]

def _case_id(case: dict) -> str:
    return f"{case['date']}-{case['why']}"


class TestWeekForDate:
    @pytest.mark.parametrize("case", FIXTURE["cases"], ids=_case_id)
    def test_shared_boundary_table(self, case):
        assert week_for_date(date.fromisoformat(case["date"]), ANCHOR) == case["week"]

    def test_anchor_derived_from_regular_season_start(self):
        # Week 1's Thursday minus two days is the Tuesday the week opens.
        assert resolve_window(date(2026, 9, 15), CALENDAR)[1] == ANCHOR

    def test_missing_regular_season_start_has_no_anchor(self):
        assert resolve_window(date(2026, 9, 15), [{"season": 2026}])[1] is None
        assert resolve_window(date(2026, 9, 15), [])[1] is None

    def test_every_week_is_exactly_seven_days(self):
        # Walk the whole regular season a day at a time: the week must increment
        # once per 7 days and never skip or repeat a value.
        seen = []
        day = ANCHOR
        while (w := week_for_date(day, ANCHOR)) is not None:
            seen.append(w)
            day = date.fromordinal(day.toordinal() + 1)
        assert sorted(set(seen)) == list(range(1, FIXTURE["weeks"] + 1))
        assert all(seen.count(w) == 7 for w in set(seen))


class TestCurrentNflWeek:
    @pytest.mark.parametrize("case", FIXTURE["cases"], ids=_case_id)
    def test_resolves_season_and_week(self, case):
        season, week = current_nfl_week(
            today=date.fromisoformat(case["date"]), calendar_rows=CALENDAR
        )
        assert week == case["week"] or case["week"] is None

    def test_no_kickoff_date_yields_no_week(self):
        assert current_nfl_week(today=date(2026, 10, 1), calendar_rows=[]) == (None, None)
        assert current_nfl_week(
            today=date(2026, 10, 1), calendar_rows=[{"season": 2026}]
        ) == (None, None)

    def test_week_override(self, monkeypatch):
        monkeypatch.setenv("NFL_WEEK_OVERRIDE", "7")
        # A date that would otherwise resolve to Week 1.
        assert current_nfl_week(today=date(2026, 9, 10), calendar_rows=CALENDAR) == (2026, 7)

    def test_week_override_rejects_out_of_range(self, monkeypatch):
        monkeypatch.setenv("NFL_WEEK_OVERRIDE", "19")
        with pytest.raises(ValueError, match="between 1 and 18"):
            current_nfl_week(today=date(2026, 9, 10), calendar_rows=CALENDAR)


class TestDisplayWeeks:
    @pytest.mark.parametrize("case", FIXTURE["display_cases"], ids=_case_id)
    def test_shared_display_table(self, case):
        got = display_weeks(today=date.fromisoformat(case["date"]), calendar_rows=[CALENDAR[0]])
        assert got["upcoming"] == case["upcoming"]
        assert got["previous"] == case["previous"]

    def test_previous_week_survives_the_games_being_played(self):
        # The whole point of the feature: after Week 1's games are done, Week 1's
        # projection is still on the card next to Week 2's.
        assert display_weeks(today=date(2026, 9, 15), calendar_rows=CALENDAR)["previous"] == 1


class TestLeagueTimezone:
    def test_utc_evening_is_still_the_same_league_day(self):
        # 2026-09-15 01:30 UTC is 2026-09-14 21:30 ET — a Monday-night kickoff.
        # A naive date.today() on a UTC host would call this Tuesday and flip the
        # week a day early, mid-game.
        utc_evening = datetime(2026, 9, 15, 1, 30, tzinfo=timezone.utc)
        assert today_in_league_tz(utc_evening) == date(2026, 9, 14)
        assert week_for_date(today_in_league_tz(utc_evening), ANCHOR) == 1

    def test_tuesday_morning_et_flips_the_week(self):
        et_tuesday = datetime(2026, 9, 15, 7, 0, tzinfo=ZoneInfo("America/New_York"))
        assert week_for_date(today_in_league_tz(et_tuesday), ANCHOR) == 2

    def test_naive_datetime_is_treated_as_league_time(self):
        assert today_in_league_tz(datetime(2026, 9, 14, 23, 0)) == date(2026, 9, 14)


class TestSeasonResolution:
    """Which NFL season a date belongs to, across a multi-season calendar.

    The league calendar and the NFL schedule disagree twice a year; these cases
    pin the disagreements. Shared with the TypeScript twin's suite.
    """

    @pytest.mark.parametrize("case", FIXTURE["season_cases"], ids=_case_id)
    def test_shared_season_table(self, case):
        today = date.fromisoformat(case["date"])
        assert current_nfl_week(today=today, calendar_rows=CALENDAR) == (
            case["season"],
            case["week"],
        )

    @pytest.mark.parametrize("case", FIXTURE["season_cases"], ids=_case_id)
    def test_shared_live_table(self, case):
        today = date.fromisoformat(case["date"])
        assert is_nfl_week_live(today=today, calendar_rows=CALENDAR) is case["live"]

    def test_week_18_is_not_stolen_by_the_league_season_roll(self):
        # Ottoneu rolls its league season on ~Jan 3; Week 18 is played Jan 4-5.
        # Attributing those games to the NEW season would both mislabel them and
        # make the retention purge delete the week the cards are showing.
        assert current_nfl_week(today=date(2027, 1, 5), calendar_rows=CALENDAR) == (2026, 18)

    def test_preseason_points_at_the_coming_season_not_the_last_one(self):
        assert current_nfl_week(today=date(2026, 8, 20), calendar_rows=CALENDAR) == (2026, 1)

    def test_live_gate_is_false_outside_the_regular_season(self):
        # The workflow gates on this rather than the league phase, which is
        # already `pre_arb` while Week 18 is still being played.
        assert is_nfl_week_live(today=date(2026, 8, 20), calendar_rows=CALENDAR) is False
        assert is_nfl_week_live(today=date(2027, 1, 11), calendar_rows=CALENDAR) is True
        assert is_nfl_week_live(today=date(2027, 1, 12), calendar_rows=CALENDAR) is False

    def test_resolve_window_with_a_single_season(self):
        season, anchor = resolve_window(date(2026, 9, 15), [CALENDAR[0]])
        assert (season, anchor) == (2026, ANCHOR)

    def test_no_calendar_resolves_to_nothing(self):
        assert resolve_window(date(2026, 9, 15), []) == (None, None)


class TestAnchorDerivation:
    """Ottoneu's regular_season_start is not reliably the Thursday kickoff.

    The real 2026 value is Wednesday 2026-09-09 while Week 1 Thursday is
    2026-09-10. Blindly subtracting two days would put the boundary on a Monday
    and push Week 1's Monday-night game into Week 2 — the exact thing the
    Tuesday rule exists to prevent. Every weekday in the kickoff week must
    resolve to the same Tuesday. Shared with the TypeScript twin.
    """

    @pytest.mark.parametrize("case", FIXTURE["anchor_cases"], ids=lambda c: f"{c['start']}-{c['why']}")
    def test_shared_anchor_table(self, case):
        got = _anchor_from_start(date.fromisoformat(case["start"]))
        assert got == date.fromisoformat(case["anchor"])
        assert got.weekday() == 1, "anchor must always be a Tuesday"

    def test_monday_night_stays_in_its_week_with_the_real_ottoneu_date(self):
        # The regression this guards: Ottoneu says the season starts Wed Sep 9.
        calendar = [{"season": 2026, "regular_season_start": "2026-09-09"}]
        # Week 1's Monday-night game.
        assert current_nfl_week(today=date(2026, 9, 14), calendar_rows=calendar) == (2026, 1)
        # And the slate flips the next morning, not a day early.
        assert current_nfl_week(today=date(2026, 9, 15), calendar_rows=calendar) == (2026, 2)
