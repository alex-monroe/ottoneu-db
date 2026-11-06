"""Unit tests for scripts/backfill_nfl_team_volume.py."""

from __future__ import annotations

from datetime import date
import pandas as pd
import pytest

from scripts.backfill_nfl_team_volume import (
    aggregate_pbp_team_volume,
    current_nfl_season,
    expand_seasons,
)


def test_expand_seasons():
    assert expand_seasons(["2024"]) == [2024]
    assert expand_seasons(["2020", "2022"]) == [2020, 2022]
    assert expand_seasons(["2018-2021"]) == [2018, 2019, 2020, 2021]
    with pytest.raises(ValueError, match="runs backwards"):
        expand_seasons(["2024-2020"])
    with pytest.raises(ValueError, match="Bad season token"):
        expand_seasons(["abc"])


def test_current_nfl_season():
    # Jan/Feb are tail of previous season
    assert current_nfl_season(date(2026, 1, 15)) == 2025
    assert current_nfl_season(date(2026, 2, 28)) == 2025
    # March onward is upcoming/current season
    assert current_nfl_season(date(2026, 3, 1)) == 2026
    assert current_nfl_season(date(2026, 10, 15)) == 2026


def test_aggregate_pbp_team_volume():
    pbp = pd.DataFrame([
        # Regular pass play: pass_attempt=1, sack=0, 2pt=0
        {
            "season": 2024, "week": 1, "season_type": "REG",
            "game_id": "2024_01_BAL_KC", "posteam": "KC", "defteam": "BAL",
            "pass_attempt": 1, "rush_attempt": 0, "sack": 0, "qb_dropback": 1,
            "two_point_attempt": 0, "passing_yards": 20, "rushing_yards": 0,
            "wp": 0.50, "score_differential": 0, "half_seconds_remaining": 1500,
        },
        # Rush play: rush_attempt=1, 2pt=0
        {
            "season": 2024, "week": 1, "season_type": "REG",
            "game_id": "2024_01_BAL_KC", "posteam": "KC", "defteam": "BAL",
            "pass_attempt": 0, "rush_attempt": 1, "sack": 0, "qb_dropback": 0,
            "two_point_attempt": 0, "passing_yards": 0, "rushing_yards": 5,
            "wp": 0.52, "score_differential": 0, "half_seconds_remaining": 1400,
        },
        # Sack: pass_attempt=1, sack=1, qb_dropback=1
        {
            "season": 2024, "week": 1, "season_type": "REG",
            "game_id": "2024_01_BAL_KC", "posteam": "KC", "defteam": "BAL",
            "pass_attempt": 1, "rush_attempt": 0, "sack": 1, "qb_dropback": 1,
            "two_point_attempt": 0, "passing_yards": -7, "rushing_yards": 0,
            "wp": 0.48, "score_differential": 0, "half_seconds_remaining": 1300,
        },
        # Two point pass: two_point_attempt=1 -> excluded from official counts
        {
            "season": 2024, "week": 1, "season_type": "REG",
            "game_id": "2024_01_BAL_KC", "posteam": "KC", "defteam": "BAL",
            "pass_attempt": 1, "rush_attempt": 0, "sack": 0, "qb_dropback": 1,
            "two_point_attempt": 1, "passing_yards": 0, "rushing_yards": 0,
            "wp": 0.60, "score_differential": 6, "half_seconds_remaining": 300,
        },
        # Non-neutral play (garbage time, WP=0.95)
        {
            "season": 2024, "week": 1, "season_type": "REG",
            "game_id": "2024_01_BAL_KC", "posteam": "KC", "defteam": "BAL",
            "pass_attempt": 0, "rush_attempt": 1, "sack": 0, "qb_dropback": 0,
            "two_point_attempt": 0, "passing_yards": 0, "rushing_yards": 3,
            "wp": 0.95, "score_differential": 14, "half_seconds_remaining": 60,
        },
    ])

    games = pd.DataFrame([
        {"game_id": "2024_01_BAL_KC", "gameday": "2024-09-05"},
    ])

    weekly, season = aggregate_pbp_team_volume(pbp, games_df=games)

    assert len(weekly) == 1
    w = weekly[0]
    assert w["team"] == "KC"
    assert w["season"] == 2024
    assert w["week"] == 1
    assert w["season_type"] == "REG"
    assert w["game_id"] == "2024_01_BAL_KC"
    assert w["game_date"] == "2024-09-05"
    assert w["opponent_team"] == "BAL"

    # Volume checks
    assert w["pass_attempts"] == 1  # 2 passes - 1 sack - 1 2pt = 1
    assert w["rush_attempts"] == 2  # 2 rushes
    assert w["sacks"] == 1
    assert w["dropbacks"] == 2      # 1 pass + 1 sack (2pt excluded)
    assert w["plays"] == 4          # 1 pass + 2 rush + 1 sack = 4
    assert w["passing_yards"] == 13 # 20 - 7 = 13
    assert w["rushing_yards"] == 8  # 5 + 3 = 8

    # Neutral situation checks (first 3 plays neutral, 2pt excluded, play 5 non-neutral)
    assert w["neutral_pass_attempts"] == 1
    assert w["neutral_rush_attempts"] == 1
    assert w["neutral_dropbacks"] == 2
    assert w["neutral_plays"] == 3

    # Season checks
    assert len(season) == 1
    s = season[0]
    assert s["team"] == "KC"
    assert s["season"] == 2024
    assert s["season_type"] == "REG"
    assert s["games"] == 1
    assert s["plays"] == w["plays"]
    assert s["pass_attempts"] == w["pass_attempts"]
    assert s["rush_attempts"] == w["rush_attempts"]
    assert s["dropbacks"] == w["dropbacks"]
