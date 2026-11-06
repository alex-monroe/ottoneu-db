"""Tests for the weekly nfl_weekly_stats backfill's pure transformation logic.

No network or database: every frame here is synthetic.
"""

from datetime import date

import pandas as pd
import pytest

from scripts.backfill_nfl_stats import STAT_MODEL_FLOAT_COLS, STAT_MODEL_INT_COLS
from scripts.backfill_nfl_weekly_stats import (
    PARITY_COLS,
    build_game_dates,
    build_snap_lookup,
    build_weekly_rows,
    compare_parity,
    current_nfl_season,
    dedup_weekly_rows,
    filter_season_types,
    parse_seasons,
    prepare_weekly_stats,
    sum_weekly_to_season,
)
from scripts.scoring import EXTRA_KEYS, score_stats

PLAYERS = {"Patrick Mahomes": "uuid-mahomes", "Justin Tucker": "uuid-tucker"}


def _raw(**overrides) -> dict:
    base = {
        "player_id": "00-0033873", "player_display_name": "Patrick Mahomes", "position": "QB",
        "position_group": "QB", "season": 2025, "week": 1, "season_type": "REG",
        "game_id": "2025_01_KC_LAC", "team": "KC", "opponent_team": "LAC",
        "completions": 20, "attempts": 30, "passing_yards": 250, "passing_tds": 2,
        "passing_interceptions": 1, "carries": 4, "rushing_yards": 20, "rushing_tds": 0,
        "receptions": 0, "targets": 0, "receiving_yards": 0, "receiving_tds": 0,
        "receiving_air_yards": 0, "target_share": None, "air_yards_share": None,
        "wopr": None, "racr": None,
        "sacks_suffered": 3, "sack_yards_lost": 20, "passing_epa": 4.5,
        "passing_2pt_conversions": 1, "sack_fumbles_lost": 1, "fumbles_lost_total": 1,
        "fg_att": 0, "fg_made": 0, "pat_att": 0, "pat_made": 0,
    }
    base.update(overrides)
    return base


def _build(rows, snaps=None, dates=None):
    df = prepare_weekly_stats(pd.DataFrame(rows))
    return build_weekly_rows(df, PLAYERS, dates or {}, snaps or {})


class TestColumnMapping:

    def test_renames_to_nfl_stats_names(self):
        rows, _ = _build([_raw()])
        r = rows[0]
        assert r["passing_attempts"] == 30
        assert r["interceptions"] == 1
        assert r["rushing_attempts"] == 4
        assert r["completions"] == 20
        assert "attempts" not in r and "carries" not in r

    def test_extras_and_stat_model_columns_carried(self):
        rows, _ = _build([_raw()])
        r = rows[0]
        assert r["fumbles_lost"] == 1
        assert r["two_point_pass"] == 1
        assert r["sacks_suffered"] == 3
        assert r["passing_epa"] == 4.5
        for col in (*EXTRA_KEYS, *STAT_MODEL_INT_COLS, *STAT_MODEL_FLOAT_COLS):
            assert col in r

    def test_fg_buckets_and_missed_kicks(self):
        kicker = _raw(
            player_display_name="Justin Tucker", position="K", position_group="SPEC",
            attempts=0, completions=0, passing_yards=0, passing_tds=0, passing_interceptions=0,
            carries=0, rushing_yards=0, fg_made_0_19=0, fg_made_20_29=1, fg_made_30_39=1,
            fg_made_40_49=1, fg_made_50_59=1, fg_made_60_=0, fg_att=5, fg_made=4,
            pat_att=3, pat_made=2, sacks_suffered=0, sack_yards_lost=0, passing_epa=0.0,
            passing_2pt_conversions=0, sack_fumbles_lost=0, fumbles_lost_total=0,
        )
        r = _build([kicker])[0][0]
        assert (r["fg_made_0_39"], r["fg_made_40_49"], r["fg_made_50_plus"]) == (2, 1, 1)
        assert r["fg_missed"] == 1 and r["pat_missed"] == 1
        assert r["total_points"] == round(score_stats(r), 2)

    def test_points_match_scoring_module(self):
        r = _build([_raw()])[0][0]
        # 250 pass yds (10) + 2 TD (8) - INT (2) + 20 rush yds (2) + 2pt (1) - fumble lost (2)
        assert r["total_points"] == 17.0

    def test_unmatched_and_defensive_rows_are_not_created(self):
        rows, info = _build([
            _raw(),
            _raw(player_display_name="Some Lineman", player_id="x"),
            _raw(player_display_name="Patrick Mahomes", position_group="LB"),
        ])
        assert len(rows) == 1
        assert info["unmatched"] == {"Some Lineman"}
        assert info["defensive_skipped"] == 1

    def test_gsis_id_kept(self):
        assert _build([_raw()])[0][0]["gsis_id"] == "00-0033873"

    def test_season_type_filter(self):
        df = pd.DataFrame([_raw(), _raw(season_type="POST", week=19)])
        assert len(filter_season_types(df, "ALL")) == 2
        assert filter_season_types(df, "POST")["week"].tolist() == [19]
        assert filter_season_types(df, "REG")["week"].tolist() == [1]


class TestGameDateAndSnaps:

    def test_game_date_joined_on_game_id(self):
        dates = build_game_dates(pd.DataFrame(
            {"game_id": ["2025_01_KC_LAC", "g2"], "gameday": ["2025-09-05", "2025-09-12"]}
        ))
        rows, _ = _build([_raw(), _raw(week=2, game_id="g2"), _raw(week=3, game_id="unknown")], dates=dates)
        by_week = {r["week"]: r["game_date"] for r in rows}
        assert by_week == {1: "2025-09-05", 2: "2025-09-12", 3: None}

    def test_snaps_joined_on_game_id_and_name(self):
        snaps = build_snap_lookup(pd.DataFrame([
            {"game_id": "2025_01_KC_LAC", "player": "Patrick Mahomes", "offense_snaps": 60.0, "offense_pct": 0.97},
            {"game_id": "other", "player": "Patrick Mahomes", "offense_snaps": 1.0, "offense_pct": 0.01},
        ]))
        rows, _ = _build([_raw(), _raw(week=2, game_id="missing")], snaps=snaps)
        by_week = {r["week"]: r for r in rows}
        assert by_week[1]["offense_snaps"] == 60 and by_week[1]["offense_pct"] == pytest.approx(0.97)
        assert by_week[2]["offense_snaps"] is None

    def test_duplicate_snap_names_summed(self):
        snaps = build_snap_lookup(pd.DataFrame([
            {"game_id": "g", "player": "Pat Mahomes", "offense_snaps": 10, "offense_pct": 0.2},
            {"game_id": "g", "player": "Pat Mahomes", "offense_snaps": 5, "offense_pct": 0.3},
        ]))
        (entry,) = snaps.values()
        assert entry["offense_snaps"] == 15 and entry["offense_pct"] == 0.3

    def test_empty_inputs(self):
        assert build_game_dates(None) == {}
        assert build_snap_lookup(None) == {}


class TestDedup:

    def test_same_game_name_variants_are_summed(self):
        players = {"Patrick Mahomes": "u1", "Pat Mahomes": "u1"}
        df = prepare_weekly_stats(pd.DataFrame([
            _raw(),
            _raw(player_display_name="Pat Mahomes", passing_yards=50, passing_tds=1,
                 attempts=5, completions=3, passing_interceptions=0, carries=0, rushing_yards=0,
                 passing_2pt_conversions=0, sack_fumbles_lost=0, fumbles_lost_total=0,
                 sacks_suffered=0, sack_yards_lost=0, passing_epa=1.0, target_share=0.1),
        ]))
        rows, _ = build_weekly_rows(df, players, {}, {})
        assert len(rows) == 1
        r = rows[0]
        assert r["passing_yards"] == 300 and r["passing_tds"] == 3
        assert r["passing_attempts"] == 35
        assert r["passing_epa"] == pytest.approx(5.5)
        assert r["target_share"] == pytest.approx(0.1)
        assert r["total_points"] == round(score_stats(r), 2)

    def test_different_weeks_not_merged(self):
        rows, _ = _build([_raw(), _raw(week=2, game_id="g2")])
        assert len(rows) == 2

    def test_regular_and_postseason_not_merged(self):
        rows, _ = _build([_raw(), _raw(season_type="POST", week=19, game_id="p")])
        assert {r["season_type"] for r in rows} == {"REG", "POST"}

    def test_dedup_all_none_stays_none(self):
        a = {"player_id": "p", "season": 1, "week": 1, "season_type": "REG", "targets": None}
        (merged,) = dedup_weekly_rows([a, dict(a)])
        assert merged["targets"] is None


def _wrow(player="p1", season=2025, week=1, season_type="REG", **stats):
    row = {"player_id": player, "season": season, "week": week, "season_type": season_type}
    row.update(stats)
    return row


def _srow(player="p1", season=2025, **stats):
    row = {"player_id": player, "season": season, "games_played": 2, "total_points": 0}
    row.update(stats)
    return row


class TestParity:

    def test_matching_sums_pass(self):
        weekly = sum_weekly_to_season([
            _wrow(week=1, passing_yards=100, total_points=4), _wrow(week=2, passing_yards=150, total_points=6),
        ])
        rep = compare_parity(weekly, [_srow(passing_yards=250, total_points=10)])
        assert rep["compared"] == 1 and rep["mismatched_pairs"] == 0 and rep["ok"]

    def test_postseason_excluded_from_sums(self):
        weekly = sum_weekly_to_season([
            _wrow(passing_yards=100), _wrow(week=19, season_type="POST", passing_yards=999),
        ])
        assert weekly[("p1", 2025)]["passing_yards"] == 100

    def test_mismatch_counted_per_column(self):
        weekly = sum_weekly_to_season([_wrow(passing_yards=100, rushing_yards=5)])
        rep = compare_parity(weekly, [_srow(passing_yards=110, rushing_yards=6)], tolerance=0)
        assert rep["mismatched_pairs"] == 1
        assert rep["per_column"] == {"passing_yards": 1, "rushing_yards": 1}
        assert not rep["ok"]

    def test_null_counts_as_zero(self):
        weekly = sum_weekly_to_season([_wrow(targets=None)])
        rep = compare_parity(weekly, [_srow(targets=None)])
        assert rep["mismatched_pairs"] == 0

    def test_points_within_rounding_tolerance(self):
        weekly = sum_weekly_to_season([_wrow(total_points=10.01)])
        assert compare_parity(weekly, [_srow(total_points=10.0)])["mismatched_pairs"] == 0
        assert compare_parity(weekly, [_srow(total_points=11.0)])["per_column"] == {"total_points": 1}

    def test_season_only_counts_when_stats_nonzero(self):
        rep = compare_parity({}, [_srow(player="p2", receptions=3), _srow(player="p3", receptions=0)], tolerance=0)
        assert rep["season_only"] == [("p2", 2025)]
        assert not rep["ok"]

    def test_weekly_only_is_informational(self):
        weekly = sum_weekly_to_season([_wrow(player="p9", passing_yards=1)])
        rep = compare_parity(weekly, [], tolerance=0)
        assert rep["weekly_only"] == [("p9", 2025)] and rep["ok"]

    def test_duplicate_player_rows_not_counted(self):
        weekly = sum_weekly_to_season([_wrow(player="a", targets=5)])
        seasons = [_srow(player="a", targets=5), _srow(player="b", targets=5)]
        names = {"a": "Josh Reynolds", "b": "Josh Reynolds"}
        rep = compare_parity(weekly, seasons, tolerance=0, name_by_id=names)
        assert rep["duplicate_name"] == [("b", 2025)] and rep["season_only"] == [] and rep["ok"]

    def test_tolerance_threshold(self):
        weekly = sum_weekly_to_season([_wrow(player=f"p{i}", targets=1) for i in range(100)])
        seasons = [_srow(player=f"p{i}", targets=1 if i else 2) for i in range(100)]
        assert compare_parity(weekly, seasons, tolerance=0.01)["ok"]
        assert not compare_parity(weekly, seasons, tolerance=0.005)["ok"]

    def test_parity_columns_are_core_counting_stats(self):
        assert {"passing_yards", "targets", "pat_made"} <= set(PARITY_COLS)


class TestUpsertStamp:

    def test_every_row_gets_the_same_updated_at(self):
        from scripts.backfill_nfl_weekly_stats import stamp_updated_at

        rows = [_wrow(week=1), _wrow(week=2)]
        out = stamp_updated_at(rows)
        stamps = {r["updated_at"] for r in out}
        assert len(stamps) == 1
        assert pd.Timestamp(stamps.pop()).tz is not None
        assert "updated_at" not in rows[0]

    def test_upsert_sends_stamped_rows(self):
        from scripts.backfill_nfl_weekly_stats import upsert_rows

        sent = []

        class _Q:
            def upsert(self, batch, on_conflict):
                sent.extend(batch)
                return self

            def execute(self):
                return None

        class _SB:
            def table(self, _name):
                return _Q()

        upsert_rows(_SB(), [_wrow(week=1), _wrow(week=2)])
        assert len(sent) == 2 and all(r["updated_at"] for r in sent)


class TestSeasonLogic:

    @pytest.mark.parametrize("today,expected", [
        (date(2026, 11, 3), 2026),
        (date(2026, 9, 1), 2026),
        (date(2027, 1, 12), 2026),
        (date(2027, 2, 15), 2026),
        (date(2027, 3, 1), 2027),
        (date(2026, 8, 31), 2026),
        (date(2026, 12, 31), 2026),
    ])
    def test_current_nfl_season_from_date(self, today, expected):
        assert current_nfl_season(today) == expected

    def test_parse_seasons(self):
        assert parse_seasons(["2024", "2018-2020", "2019"]) == [2018, 2019, 2020, 2024]
        with pytest.raises(ValueError):
            parse_seasons(["24"])
        with pytest.raises(ValueError):
            parse_seasons(["2020-2018"])
