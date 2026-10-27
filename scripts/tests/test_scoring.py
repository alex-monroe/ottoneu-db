"""Tests for the league's full scoring (scripts/scoring.py) and the pipelines using it."""

from __future__ import annotations

import pandas as pd
import pytest

from scripts.config import SCORING_EXTRAS, SCORING_SETTINGS
from scripts.keeper_value import dataset
from scripts.scoring import EXTRA_KEYS, FULL_SCORING, add_nflverse_extras, score_stats
from scripts.tasks.pull_player_stats import _calc_points


class TestFullScoring:
    def test_is_settings_plus_extras(self):
        assert FULL_SCORING == {**SCORING_SETTINGS, **SCORING_EXTRAS}
        assert not set(SCORING_SETTINGS) & set(SCORING_EXTRAS)

    def test_extras_values(self):
        # The rules Ottoneu's box scores were matched against (PR 795).
        assert SCORING_EXTRAS == {
            "fumbles_lost": -2,
            "two_point_pass": 1,
            "two_point_rush_rec": 2,
            "fg_missed": -1,
            "pat_missed": -1,
        }

    def test_score_stats_includes_extras(self):
        # 2 rec TD (12) + 1 two-point catch (2) + 1 fumble lost (-2)
        assert score_stats({"receiving_tds": 2, "two_point_rush_rec": 1, "fumbles_lost": 1}) == 12
        assert score_stats({"pat_made": 3, "pat_missed": 1, "fg_missed": 2}) == 0
        assert score_stats({"fumbles_lost": None}) == 0


class TestAddNflverseExtras:
    def test_every_extra_gets_a_column(self):
        # A new SCORING_EXTRAS key in config.json needs a source mapping here.
        out = add_nflverse_extras(pd.DataFrame([{"player_display_name": "x"}]))
        for key in EXTRA_KEYS:
            assert out.loc[0, key] == 0

    def test_maps_nflverse_columns(self):
        out = add_nflverse_extras(pd.DataFrame([{
            "fumbles_lost_total": 2, "sack_fumbles_lost": 1,
            "passing_2pt_conversions": 1, "rushing_2pt_conversions": 1, "receiving_2pt_conversions": 1,
            "fg_att": 5, "fg_made": 3, "fg_missed": 1, "pat_att": 4, "pat_made": 4,
        }]))
        row = out.iloc[0]
        assert row["fumbles_lost"] == 2  # the total, which counts return fumbles too
        assert row["two_point_pass"] == 1
        assert row["two_point_rush_rec"] == 2
        assert row["fg_missed"] == 2  # attempts - makes: the blocked kick counts
        assert row["pat_missed"] == 0

    def test_fumbles_fall_back_to_the_splits(self):
        out = add_nflverse_extras(pd.DataFrame([{
            "sack_fumbles_lost": 1, "rushing_fumbles_lost": 1, "receiving_fumbles_lost": None,
        }]))
        assert out.loc[0, "fumbles_lost"] == 2


class TestPullPlayerStatsPoints:
    def test_calc_points_includes_extras(self):
        base = {"passing_yards": 250, "passing_tds": 2, "rushing_tds": 1}  # 10 + 8 + 6
        assert _calc_points(base) == pytest.approx(24)
        assert _calc_points({**base, "two_point_pass": 1, "fumbles_lost": 2}) == pytest.approx(21)


class TestKeeperGamePoints:
    def test_game_points_include_extras(self):
        weekly = pd.DataFrame([{
            "player_id": "00-1", "player_display_name": "RB One", "position": "RB",
            "season": 2024, "week": 1, "team": "SF",
            "passing_yards": 0, "passing_tds": 0, "passing_interceptions": 0,
            "rushing_yards": 80, "rushing_tds": 1, "receptions": 2, "receiving_yards": 10,
            "receiving_tds": 0, "fumbles_lost_total": 1, "rushing_2pt_conversions": 1,
            "targets": 3, "carries": 15, "attempts": 0,
        }])
        rows = dataset._game_rows(weekly, pd.DataFrame(), {})
        # 8 + 6 + 1 + 1 (base) - 2 (fumble) + 2 (two-pointer)
        assert rows.loc[0, "points"] == pytest.approx(16)
