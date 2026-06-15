"""Tests for the NGS passing backfill aggregation + mapping (#674)."""

from __future__ import annotations

import pandas as pd

from scripts.backfill_ngs_passing import (
    _parse_seasons,
    map_to_payload,
    season_aggregate,
)
from scripts.name_utils import normalize_player_name


def _ngs(rows: list[dict]) -> pd.DataFrame:
    cols = [
        "week", "season_type", "player_display_name", "attempts",
        "completion_percentage_above_expectation", "avg_air_yards_to_sticks",
        "aggressiveness", "avg_time_to_throw", "avg_air_yards_differential",
        "avg_completed_air_yards", "avg_intended_air_yards",
        "expected_completion_percentage", "max_completed_air_distance",
        "passer_rating",
    ]
    return pd.DataFrame([{c: r.get(c) for c in cols} for r in rows])


class TestSeasonAggregate:
    def test_keeps_only_regular_season_aggregate_row(self):
        ngs = _ngs([
            {"week": 0, "season_type": "REG", "player_display_name": "Josh Allen", "attempts": 500},
            {"week": 5, "season_type": "REG", "player_display_name": "Josh Allen", "attempts": 30},
            {"week": 0, "season_type": "POST", "player_display_name": "Josh Allen", "attempts": 80},
        ])
        agg = season_aggregate(ngs)
        assert len(agg) == 1
        assert agg.iloc[0]["attempts"] == 500

    def test_empty(self):
        assert season_aggregate(_ngs([])).empty


class TestMapToPayload:
    def test_matched_and_unmatched(self):
        agg = _ngs([
            {"week": 0, "season_type": "REG", "player_display_name": "Josh Allen",
             "attempts": 500, "completion_percentage_above_expectation": 4.2,
             "avg_air_yards_to_sticks": 1.1, "aggressiveness": 18.0,
             "avg_time_to_throw": 2.9, "avg_air_yards_differential": -1.5,
             "passer_rating": 95.0},
            {"week": 0, "season_type": "REG", "player_display_name": "Unknown Backup",
             "attempts": 50},
        ])
        player_lookup = {normalize_player_name("Josh Allen"): "uuid-allen"}
        payload, matched, unmatched = map_to_payload(agg, player_lookup, 2024)
        assert matched == 1 and unmatched == 1
        assert len(payload) == 1
        rec = payload[0]
        assert rec["player_id"] == "uuid-allen"
        assert rec["season"] == 2024
        assert rec["attempts"] == 500
        assert rec["completion_pct_above_expectation"] == 4.2
        assert rec["avg_air_yards_to_sticks"] == 1.1

    def test_missing_metric_is_none_and_attempts_defaults_zero(self):
        agg = _ngs([
            {"week": 0, "season_type": "REG", "player_display_name": "Josh Allen",
             "attempts": None, "aggressiveness": float("nan")},
        ])
        player_lookup = {normalize_player_name("Josh Allen"): "uuid-allen"}
        payload, matched, _ = map_to_payload(agg, player_lookup, 2024)
        assert matched == 1
        assert payload[0]["attempts"] == 0
        assert payload[0]["aggressiveness"] is None


class TestParseSeasons:
    def test_range(self):
        assert _parse_seasons("2018-2021") == [2018, 2019, 2020, 2021]

    def test_single_and_list(self):
        assert _parse_seasons("2024") == [2024]
        assert _parse_seasons("2022,2024") == [2022, 2024]
