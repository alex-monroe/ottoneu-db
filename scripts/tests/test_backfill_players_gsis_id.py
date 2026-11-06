"""Unit tests for scripts/backfill_players_gsis_id.py."""

from __future__ import annotations

import pandas as pd
import pytest

from scripts.backfill_players_gsis_id import resolve_players_gsis_id


@pytest.fixture
def sample_registry() -> pd.DataFrame:
    return pd.DataFrame([
        {
            "gsis_id": "00-0033873",
            "display_name": "Patrick Mahomes",
            "position": "QB",
            "birth_date": "1995-09-17",
            "rookie_season": 2017,
            "draft_year": 2017,
        },
        {
            "gsis_id": "00-0033536",
            "display_name": "Mike Williams",
            "position": "WR",
            "birth_date": "1994-10-04",
            "rookie_season": 2017,
            "draft_year": 2017,
        },
        {
            "gsis_id": "00-0027702",
            "display_name": "Mike Williams",
            "position": "WR",
            "birth_date": "1987-05-18",
            "rookie_season": 2010,
            "draft_year": 2010,
        },
        {
            "gsis_id": "00-0038583",
            "display_name": "Travis Kelce",
            "position": "TE",
            "birth_date": "1989-10-05",
            "rookie_season": 2013,
            "draft_year": 2013,
        },
    ])


def test_resolve_from_single_weekly(sample_registry: pd.DataFrame):
    players = [
        {"id": "p1", "name": "Patrick Mahomes", "position": "QB", "birth_date": "1995-09-17"},
    ]
    weekly_rows = [
        {"player_id": "p1", "gsis_id": "00-0033873"},
        {"player_id": "p1", "gsis_id": "00-0033873"},
    ]

    mapping, stats = resolve_players_gsis_id(players, weekly_rows, sample_registry)
    assert mapping["p1"] == "00-0033873"
    assert stats["from_weekly_single"] == 1
    assert stats["unmatched"] == 0


def test_resolve_weekly_collision_by_birth_date(sample_registry: pd.DataFrame):
    # Mike Williams 2017 Clemson WR
    players = [
        {"id": "p_mw", "name": "Mike Williams", "position": "WR", "birth_date": "1994-10-04"},
    ]
    # Both 2010 and 2017 Mike Williams appear in weekly rows
    weekly_rows = [
        {"player_id": "p_mw", "gsis_id": "00-0033536"},
        {"player_id": "p_mw", "gsis_id": "00-0027702"},
    ]

    mapping, stats = resolve_players_gsis_id(players, weekly_rows, sample_registry)
    assert mapping["p_mw"] == "00-0033536"
    assert stats["from_weekly_collision_resolved"] == 1


def test_resolve_from_registry_when_no_weekly(sample_registry: pd.DataFrame):
    players = [
        {"id": "p_tk", "name": "Travis Kelce", "position": "TE", "birth_date": "1989-10-05"},
    ]
    weekly_rows: list[dict] = []

    mapping, stats = resolve_players_gsis_id(players, weekly_rows, sample_registry)
    assert mapping["p_tk"] == "00-0038583"
    assert stats["from_registry"] == 1


def test_unmatched_college_player(sample_registry: pd.DataFrame):
    players = [
        {"id": "p_college", "name": "Arch Manning", "position": "QB", "birth_date": "2005-04-27"},
    ]
    weekly_rows: list[dict] = []

    mapping, stats = resolve_players_gsis_id(players, weekly_rows, sample_registry)
    assert "p_college" not in mapping
    assert stats["unmatched"] == 1
