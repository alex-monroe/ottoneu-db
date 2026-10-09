"""Tests for the roster-question context pack's season-phase source switch."""

from scripts.roster_context_pack import render, resolve_source

ROWS = [
    {"team": "Team A", "name": "QB One", "position": "QB", "salary": 40, "ppg": 21.4, "games": 5},
    {"team": "Team A", "name": "RB One", "position": "RB", "salary": 12, "ppg": None, "games": None},
]


def test_auto_uses_actuals_in_season_and_projections_offseason():
    assert resolve_source("in_season", "auto") == "actual"
    for phase in ("pre_arb", "pre_keeper", "pre_draft", "post_draft"):
        assert resolve_source(phase, "auto") == "projection"


def test_explicit_source_wins():
    assert resolve_source("in_season", "projection") == "projection"
    assert resolve_source("pre_arb", "actual") == "actual"


def test_in_season_pack_shows_actual_ppg_and_games():
    out = render(ROWS, 2026, "actual", "in_season")
    assert "actual production" in out
    assert "| PPG | GP |" in out
    assert "Proj PPG" not in out
    assert "| QB One | QB | $40 | 21.4 | 5 |" in out
    assert "| RB One | RB | $12 | — | — |" in out


def test_forced_projections_in_season_carry_a_warning():
    out = render(ROWS, 2026, "projection", "in_season")
    assert "Proj PPG" in out
    assert "WARNING" in out


def test_offseason_projections_have_no_warning():
    out = render(ROWS, 2026, "projection", "pre_arb")
    assert "Proj PPG" in out
    assert "WARNING" not in out
