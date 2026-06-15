"""Tests for the red-zone usage backfill aggregation + mapping (#671)."""

from __future__ import annotations

import pandas as pd

from scripts.backfill_red_zone import (
    aggregate_red_zone,
    map_to_payload,
    _parse_seasons,
)


def _pbp(rows: list[dict]) -> pd.DataFrame:
    cols = ["yardline_100", "rush_attempt", "pass_attempt",
            "rusher_player_id", "receiver_player_id", "passer_player_id"]
    return pd.DataFrame([{c: r.get(c) for c in cols} for r in rows])


class TestAggregateRedZone:
    def test_counts_rz_and_gz_by_role(self):
        pbp = _pbp([
            # RB rush at the 15 → RZ carry (not goal-line)
            {"yardline_100": 15, "rush_attempt": 1, "rusher_player_id": "rb1"},
            # RB rush at the 5 → RZ carry AND goal-line carry
            {"yardline_100": 5, "rush_attempt": 1, "rusher_player_id": "rb1"},
            # pass at the 8 → RZ+GZ target (wr1) and RZ pass attempt (qb1)
            {"yardline_100": 8, "pass_attempt": 1, "receiver_player_id": "wr1", "passer_player_id": "qb1"},
            # pass at the 18 → RZ target only
            {"yardline_100": 18, "pass_attempt": 1, "receiver_player_id": "wr1", "passer_player_id": "qb1"},
            # play outside the RZ → ignored
            {"yardline_100": 50, "rush_attempt": 1, "rusher_player_id": "rb1"},
        ])
        c = aggregate_red_zone(pbp)
        assert c["rb1"] == {"rz_carries": 2, "rz_targets": 0, "rz_pass_attempts": 0,
                            "gz_carries": 1, "gz_targets": 0}
        assert c["wr1"]["rz_targets"] == 2
        assert c["wr1"]["gz_targets"] == 1
        assert c["qb1"]["rz_pass_attempts"] == 2
        assert c["qb1"]["gz_targets"] == 0  # QB isn't the receiver

    def test_null_player_ids_skipped(self):
        pbp = _pbp([
            {"yardline_100": 5, "rush_attempt": 1, "rusher_player_id": None},
            {"yardline_100": 5, "pass_attempt": 1, "receiver_player_id": float("nan"), "passer_player_id": "qb1"},
        ])
        c = aggregate_red_zone(pbp)
        assert "qb1" in c  # passer still counted
        assert all(k == "qb1" for k in c)  # the null rusher/receiver produced no key


class TestMapToPayload:
    def test_matched_and_unmatched(self):
        counts = {
            "gsis_match": {"rz_carries": 5, "rz_targets": 0, "rz_pass_attempts": 0,
                           "gz_carries": 2, "gz_targets": 0},
            "gsis_nomatch": {"rz_carries": 1, "rz_targets": 0, "rz_pass_attempts": 0,
                             "gz_carries": 0, "gz_targets": 0},
        }
        crosswalk = {"gsis_match": "Christian McCaffrey", "gsis_nomatch": "Random Punter"}
        # player_lookup is keyed by normalized name
        from scripts.name_utils import normalize_player_name
        player_lookup = {normalize_player_name("Christian McCaffrey"): "uuid-cmc"}
        payload, matched, unmatched = map_to_payload(counts, crosswalk, player_lookup, 2024)
        assert matched == 1 and unmatched == 1
        assert payload == [{"player_id": "uuid-cmc", "season": 2024,
                            "rz_carries": 5, "rz_targets": 0, "rz_pass_attempts": 0,
                            "gz_carries": 2, "gz_targets": 0}]

    def test_missing_crosswalk_is_unmatched(self):
        counts = {"ghost": {"rz_carries": 1, "rz_targets": 0, "rz_pass_attempts": 0,
                            "gz_carries": 0, "gz_targets": 0}}
        payload, matched, unmatched = map_to_payload(counts, {}, {}, 2024)
        assert payload == [] and matched == 0 and unmatched == 1


class TestParseSeasons:
    def test_range(self):
        assert _parse_seasons("2018-2021") == [2018, 2019, 2020, 2021]

    def test_single_and_list(self):
        assert _parse_seasons("2024") == [2024]
        assert _parse_seasons("2022,2024") == [2022, 2024]
