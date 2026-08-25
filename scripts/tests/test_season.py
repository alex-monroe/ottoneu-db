"""Tests for the season-cycle resolver (scripts/season.py).

Pure logic: calendar rows and the date are injected, so no DB/network access.
Kept in sync with web/__tests__/lib/season.test.ts (the TS twin).
"""
from datetime import date

import pytest

from scripts import season
from scripts.season import get_season_context

CAL_2026 = {
    "league_id": 309,
    "season": 2026,
    "season_start": "2026-01-03",
    "arb_start": "2026-02-15",
    "arb_end": "2026-03-31",
    "keeper_deadline": "2026-07-31",
    "auction_date": None,
    "regular_season_start": "2026-09-04",
    "trade_deadline": "2026-11-25",
    "last_auction_date": "2026-12-30",
}
CAL_2027 = {
    **CAL_2026,
    "season": 2027,
    "season_start": "2027-01-03",
    "arb_start": "2027-02-15",
    "arb_end": "2027-03-31",
    "keeper_deadline": "2027-07-31",
    "regular_season_start": "2027-09-04",
    "trade_deadline": "2027-11-25",
    "last_auction_date": "2027-12-30",
}
CAL = [CAL_2026, CAL_2027]


@pytest.fixture(autouse=True)
def _clear_overrides(monkeypatch):
    monkeypatch.delenv("SEASON_OVERRIDE", raising=False)
    monkeypatch.delenv("PHASE_OVERRIDE", raising=False)


def ctx(today: str):
    return get_season_context(date.fromisoformat(today), calendar_rows=CAL)


def test_pre_arb_during_arbitration_window():
    c = ctx("2026-02-20")
    assert c["phase"] == "pre_arb"
    assert c["league_season"] == 2026
    assert c["projection_season"] == 2026
    assert c["stats_season"] == 2025  # no 2026 NFL games yet
    assert c["arb_window_open"] is True


def test_pre_keeper_between_arb_end_and_keeper_deadline():
    c = ctx("2026-06-01")
    assert c["phase"] == "pre_keeper"
    assert c["stats_season"] == 2025
    assert c["arb_window_open"] is False
    assert c["next_boundary"] == "2026-07-31"


def test_pre_draft_between_keeper_and_regular_season():
    c = ctx("2026-08-15")
    assert c["phase"] == "pre_draft"
    assert c["stats_season"] == 2025


# Ottoneu publishes "Draft day has not been set yet" until the auction is
# scheduled, so the whole keeper->kickoff window has to stay pre_draft without one.
def test_pre_draft_without_auction_date_spans_whole_window():
    assert ctx("2026-09-03")["phase"] == "pre_draft"


DRAFTED = [{**CAL_2026, "auction_date": "2026-08-22"}, CAL_2027]


def drafted_ctx(today: str):
    return get_season_context(date.fromisoformat(today), calendar_rows=DRAFTED)


def test_pre_draft_before_a_scheduled_auction():
    assert drafted_ctx("2026-08-15")["phase"] == "pre_draft"


def test_auction_day_itself_is_still_pre_draft():
    assert drafted_ctx("2026-08-22")["phase"] == "pre_draft"


def test_post_draft_after_the_auction_until_kickoff():
    c = drafted_ctx("2026-08-24")
    assert c["phase"] == "post_draft"
    assert c["league_season"] == 2026
    assert c["stats_season"] == 2025  # still no 2026 NFL games
    assert c["arb_window_open"] is False


def test_post_draft_gives_way_to_in_season_at_kickoff():
    assert drafted_ctx("2026-09-04")["phase"] == "in_season"


def test_post_draft_is_a_valid_phase_override(monkeypatch):
    monkeypatch.setenv("PHASE_OVERRIDE", "post_draft")
    assert ctx("2026-06-01")["phase"] == "post_draft"


def test_in_season_flips_stats_to_league_season():
    c = ctx("2026-10-01")
    assert c["phase"] == "in_season"
    assert c["stats_season"] == 2026
    assert c["projection_season"] == 2026


def test_in_season_after_nfl_season_before_rollover():
    c = ctx("2027-01-01")
    assert c["phase"] == "in_season"
    assert c["league_season"] == 2026  # not yet rolled
    assert c["stats_season"] == 2026


def test_rollover_at_start_of_season():
    c = ctx("2027-01-03")
    assert c["league_season"] == 2027
    assert c["phase"] == "pre_arb"
    assert c["projection_season"] == 2027
    assert c["stats_season"] == 2026


def test_fallback_with_no_calendar():
    c = get_season_context(date(2026, 6, 1), calendar_rows=[])
    assert c["source"] == "fallback"
    assert c["phase"] == "pre_keeper"
    assert c["league_season"] == 2026


def test_season_override(monkeypatch):
    monkeypatch.setenv("SEASON_OVERRIDE", "2030")
    c = ctx("2026-06-01")
    assert c["league_season"] == 2030
    assert c["projection_season"] == 2030
    assert c["stats_season"] == 2029
    assert c["source"] == "override"


def test_phase_override(monkeypatch):
    monkeypatch.setenv("PHASE_OVERRIDE", "in_season")
    c = ctx("2026-06-01")
    assert c["phase"] == "in_season"
    assert c["arb_window_open"] is False


def test_invalid_phase_override(monkeypatch):
    monkeypatch.setenv("PHASE_OVERRIDE", "nonsense")
    with pytest.raises(ValueError):
        ctx("2026-06-01")
