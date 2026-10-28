"""Tests for the play-by-play score worm rebuild (scripts/rebuild_score_worm.py).

Pure functions over hand-built nflverse-shaped plays — no network, no DB. The
play descriptions are the real ones the scoring rules were checked against
(2026 weeks 1–6, every started player-game matching Ottoneu to the hundredth).
"""

import math

import pandas as pd
import pytest

from scripts.rebuild_score_worm import (
    ADJUSTMENT_NOTE,
    KICKOFF_NOTE,
    GameClock,
    WinModel,
    calibration_report,
    checkpoint_rows,
    lineup_residuals,
    margin_slope,
    win_probability,
    build_game_plays,
    elapsed_seconds,
    finished_nfl_weeks,
    game_clocks,
    gsis_index,
    side_progress,
    starter_game,
    team_games,
    match_gsis,
    pick_weeks,
    play_points,
    play_times,
    player_mismatches,
)

NAN = math.nan


def play(**fields):
    """A pbp row: every scoring column empty unless given."""
    base = {
        "passer_player_id": NAN, "rusher_player_id": NAN, "receiver_player_id": NAN,
        "lateral_rusher_player_id": NAN, "lateral_receiver_player_id": NAN,
        "passing_yards": NAN, "rushing_yards": NAN, "receiving_yards": NAN,
        "lateral_rushing_yards": NAN, "lateral_receiving_yards": NAN,
        "complete_pass": 0, "pass_touchdown": 0, "interception": 0,
        "touchdown": 0, "td_player_id": NAN, "td_team": NAN, "posteam": "SF",
        "kicker_player_id": NAN, "field_goal_result": NAN, "kick_distance": NAN,
        "extra_point_result": NAN, "two_point_conv_result": NAN,
        "fumble_lost": 0, "fumbled_1_player_id": NAN,
    }
    base.update(fields)
    return base


def rounded(points):
    return {k: round(v, 2) for k, v in points.items()}


class TestPlayPoints:
    def test_touchdown_pass(self):
        # Purdy deep right to Evans for 23 yards, TOUCHDOWN.
        p = play(passer_player_id="QB", receiver_player_id="WR", passing_yards=23,
                 receiving_yards=23, complete_pass=1, pass_touchdown=1, touchdown=1,
                 td_player_id="WR", td_team="SF")
        assert rounded(play_points(p)) == {"QB": 4.92, "WR": 8.8}

    def test_lateral_touchdown_goes_to_the_lateral_receiver(self):
        # Purdy to Evans for 2, lateral to Samuel for 80 yards, TOUCHDOWN.
        p = play(passer_player_id="QB", receiver_player_id="WR1", lateral_receiver_player_id="WR2",
                 passing_yards=82, receiving_yards=2, lateral_receiving_yards=80,
                 complete_pass=1, pass_touchdown=1, touchdown=1, td_player_id="WR2", td_team="SF")
        assert rounded(play_points(p)) == {"QB": 7.28, "WR1": 0.7, "WR2": 14.0}

    def test_defensive_touchdown_scores_nobody(self):
        p = play(passer_player_id="QB", interception=1, touchdown=1, td_player_id="CB", td_team="DAL")
        assert play_points(p) == {"QB": -2}

    def test_rushing_touchdown(self):
        p = play(rusher_player_id="RB", rushing_yards=4, touchdown=1, td_player_id="RB", td_team="SF")
        assert rounded(play_points(p)) == {"RB": 6.4}

    @pytest.mark.parametrize("distance,points", [(39, 3), (40, 4), (49, 4), (50, 5), (62, 5)])
    def test_field_goal_tiers(self, distance, points):
        p = play(kicker_player_id="K", field_goal_result="made", kick_distance=distance)
        assert play_points(p) == {"K": points}

    @pytest.mark.parametrize("result", ["missed", "blocked"])
    def test_missed_field_goal(self, result):
        assert play_points(play(kicker_player_id="K", field_goal_result=result)) == {"K": -1}

    @pytest.mark.parametrize("result,points", [("good", 1), ("failed", -1), ("blocked", -1)])
    def test_extra_point(self, result, points):
        assert play_points(play(kicker_player_id="K", extra_point_result=result)) == {"K": points}

    def test_two_point_pass(self):
        p = play(passer_player_id="QB", receiver_player_id="TE", two_point_conv_result="success")
        assert play_points(p) == {"QB": 1, "TE": 2}

    def test_failed_two_point_scores_nothing(self):
        p = play(rusher_player_id="RB", two_point_conv_result="failure")
        assert play_points(p) == {}

    def test_fumble_lost_charges_the_first_fumbler(self):
        # Brown fumbles, MIA recovers and fumbles it back: only Brown loses 2.
        p = play(passer_player_id="QB", receiver_player_id="RB", passing_yards=3, receiving_yards=3,
                 complete_pass=1, fumble_lost=1, fumbled_1_player_id="RB")
        assert rounded(play_points(p)) == {"QB": 0.12, "RB": -1.2}

    def test_sack_has_no_passing_yards(self):
        assert play_points(play(passer_player_id="QB")) == {}


class TestMatching:
    ROSTER = pd.DataFrame(
        [
            ("00-1", "Josh Allen", "QB", "BUF"),
            ("00-2", "Josh Allen", "LB", "JAX"),
            ("00-3", "Mike Williams", "WR", "NYJ"),
            ("00-4", "Mike Williams", "WR", "PIT"),
            ("00-5", "D.J. Moore", "WR", "CHI"),
        ],
        columns=["gsis_id", "full_name", "position", "team"],
    )

    def test_position_breaks_a_name_tie(self):
        index = gsis_index(self.ROSTER)
        assert match_gsis({"player_name": "Josh Allen", "position": "QB", "nfl_team": "BUF"}, index) == "00-1"

    def test_team_breaks_a_name_and_position_tie(self):
        index = gsis_index(self.ROSTER)
        assert match_gsis({"player_name": "Mike Williams", "position": "WR", "nfl_team": "PIT"}, index) == "00-4"

    def test_names_are_normalized(self):
        index = gsis_index(self.ROSTER)
        assert match_gsis({"player_name": "DJ Moore", "position": "WR", "nfl_team": "CHI"}, index) == "00-5"

    def test_unknown_or_ambiguous_is_none(self):
        index = gsis_index(self.ROSTER)
        assert match_gsis({"player_name": "Nobody", "position": "WR", "nfl_team": "CHI"}, index) is None
        assert match_gsis({"player_name": "Mike Williams", "position": "WR", "nfl_team": "LAC"}, index) is None


GAME = {"game_id": 7, "season": 2026, "week": 3}


def starter(side, ottoneu_id, name, points):
    return {"side": side, "ottoneu_id": ottoneu_id, "player_name": name, "nfl_team": "SF", "points": points}


def event(at, points, game="2026_03_SF_LA", play_id=1.0):
    return (pd.Timestamp(at), game, play_id, points)


class TestBuildGamePlays:
    STARTERS = [starter("home", 1, "Brock Purdy", 4.92), starter("away", 2, "Ja'Marr Chase", 8.8)]
    GSIS = {1: "QB", 2: "WR"}

    def test_running_totals_and_notes(self):
        events = [
            event("2026-09-20T17:05:00Z", {"QB": 4.92, "BENCH": 3.0}),
            event("2026-09-20T17:10:00Z", {"NOBODY": 1.0}),
            event("2026-09-20T20:30:00Z", {"WR": 8.8}),
        ]
        rows = build_game_plays(GAME, self.STARTERS, self.GSIS, events, 309)
        assert [(r["seq"], r["home_points"], r["away_points"], r["note"]) for r in rows] == [
            (1, 4.92, 0.0, "B. Purdy +4.92"),
            (2, 4.92, 8.8, "J. Chase +8.80"),
        ]
        assert rows[0]["play_at"].startswith("2026-09-20T17:05:00")
        assert {r["week"] for r in rows} == {3}

    def test_adjusts_to_ottoneus_final(self):
        starters = [starter("home", 1, "Brock Purdy", 6.92), starter("away", 2, "Ja'Marr Chase", 8.8)]
        events = [event("2026-09-20T17:05:00Z", {"QB": 4.92}), event("2026-09-20T17:06:00Z", {"WR": 8.8})]
        rows = build_game_plays(GAME, starters, self.GSIS, events, 309)
        last = rows[-1]
        assert (last["home_points"], last["away_points"], last["note"]) == (6.92, 8.8, ADJUSTMENT_NOTE)
        assert last["play_at"].startswith("2026-09-20T17:07:00")

    def test_no_plays_no_rows(self):
        assert build_game_plays(GAME, self.STARTERS, self.GSIS, [], 309) == []

    def test_player_mismatches(self):
        starters = self.STARTERS + [starter("home", 3, "Unmatched Guy", 2.0), starter("home", 4, "Benched", None)]
        events = [event("2026-09-20T17:05:00Z", {"QB": 4.92}), event("2026-09-20T17:06:00Z", {"WR": 6.8})]
        assert player_mismatches(starters, self.GSIS, events) == [
            "Ja'Marr Chase (SF): Ottoneu 8.80, rebuilt 6.80",
            "Unmatched Guy (SF): no nflverse match",
        ]


class TestWeekReadiness:
    def test_finished_nfl_weeks_needs_every_game_ended(self):
        schedule = pd.DataFrame({"game_id": ["a", "b", "c"], "week": [1, 1, 2]})
        pbp = pd.DataFrame({"game_id": ["a", "a", "b", "c"], "desc": ["x", "END GAME", "x", "END GAME"]})
        assert finished_nfl_weeks(schedule, pbp) == {2}

    def test_pick_weeks(self):
        games = [
            {"week": 1, "status": "final"}, {"week": 2, "status": "final"},
            {"week": 3, "status": "final"}, {"week": 4, "status": "in_progress"},
        ]
        assert pick_weeks(games, {1, 2, 4}, {1}, None, False) == (
            [2], ["week 3: nflverse play-by-play not complete yet"],
        )
        assert pick_weeks(games, {1, 2, 4}, {1}, None, True)[0] == [1, 2]
        assert pick_weeks(games, {1, 2, 4}, {1}, 1, False)[0] == [1]
        assert pick_weeks(games, {1, 2, 4}, set(), 4, False) == (
            [], ["week 4: league games not all final yet"],
        )

    def test_play_times_fill_untimed_rows_within_a_game(self):
        pbp = pd.DataFrame({
            "game_id": ["g", "g", "g", "h"],
            "play_id": [1, 2, 3, 1],
            "time_of_day": [None, "2026-09-20T17:00:00Z", None, "2026-09-20T20:00:00Z"],
        })
        times = play_times(pbp).dt.strftime("%H:%M").tolist()
        assert times == ["17:00", "17:00", "17:00", "20:00"]


T = pd.Timestamp


class TestGameClock:
    def test_elapsed_seconds_regulation_and_overtime(self):
        assert elapsed_seconds(1, 900, 3600) == 0
        assert elapsed_seconds(3, 450, 1350) == 2250
        # nflverse restarts game_seconds_remaining on the overtime clock.
        assert elapsed_seconds(5, 94, 94) == 3600 + 506
        assert elapsed_seconds(2, NAN, NAN) is None

    def test_clock_lengths_include_overtime(self):
        pbp = pd.DataFrame({
            "game_id": ["reg", "reg", "reg", "ot", "ot", "ot"],
            "play_id": [1, 2, 3, 1, 2, 3],
            "time_of_day": ["2026-09-20T17:00:00Z", "2026-09-20T18:30:00Z", None,
                            "2026-09-20T20:25:00Z", "2026-09-20T23:40:00Z", "2026-09-20T23:50:00Z"],
            "qtr": [1, 4, 4, 1, 5, 5],
            "quarter_seconds_remaining": [900, 0, 0, 900, 300, 94],
            "game_seconds_remaining": [3600, 0, 0, 3600, 300, 94],
        })
        clocks = game_clocks(pbp)
        assert clocks["reg"].length == 3600
        assert clocks["ot"].length == 3600 + 506
        assert clocks["ot"].at(T("2026-09-20T20:00:00Z")) == 0  # before kickoff
        assert clocks["ot"].at(T("2026-09-20T23:45:00Z")) == 3600 + 300
        assert clocks["ot"].at(T("2026-09-21T03:00:00Z")) == 3600 + 506  # over

    def test_elapsed_never_runs_backwards(self):
        pbp = pd.DataFrame({
            "game_id": ["g", "g", "g"], "play_id": [1, 2, 3],
            "time_of_day": ["2026-09-20T17:00:00Z", "2026-09-20T17:30:00Z", "2026-09-20T17:31:00Z"],
            "qtr": [1, 2, 2], "quarter_seconds_remaining": [900, 300, 400],
            "game_seconds_remaining": [3600, 2100, 2200],
        })
        assert game_clocks(pbp)["g"].elapsed == [0, 1500, 1500]

    def test_side_progress_weights_by_game_length(self):
        regulation = GameClock([T("2026-09-20T17:00:00Z"), T("2026-09-20T20:00:00Z")], [0, 3600])
        overtime = GameClock([T("2026-09-20T20:25:00Z"), T("2026-09-20T22:00:00Z"), T("2026-09-21T00:00:00Z")],
                             [0, 1800, 4200])
        clocks = {"a": regulation, "b": overtime}
        # Two starters in the 1pm game (done), one in the late game at halftime.
        assert side_progress(["a", "a", "b"], clocks, T("2026-09-20T22:30:00Z")) == round(
            (3600 + 3600 + 1800) / (3600 + 3600 + 4200), 4)
        assert side_progress(["a", "b"], clocks, T("2026-09-21T05:00:00Z")) == 1.0
        assert side_progress([], clocks, T("2026-09-21T05:00:00Z")) is None

    def test_starter_game(self):
        games = team_games(pd.DataFrame({"game_id": ["g1", "g2"], "home_team": ["LA", "JAX"],
                                         "away_team": ["SF", "HOU"]}))
        assert starter_game({"nfl_team": "SF"}, "00-1", {"00-1": "LA"}, games) == "g1"  # roster wins
        assert starter_game({"nfl_team": "JAC"}, None, {}, games) == "g2"  # Ottoneu code mapped
        assert starter_game({"nfl_team": "LAR", "game_state": "bye"}, None, {}, games) is None
        assert starter_game({"nfl_team": "DAL"}, None, {}, games) is None

    def test_rows_carry_progress(self):
        clocks = {
            "g": GameClock([T("2026-09-20T17:00:00Z"), T("2026-09-20T18:00:00Z"), T("2026-09-20T20:00:00Z")],
                           [0, 1800, 3600]),
        }
        events = [event("2026-09-20T18:00:00Z", {"QB": 4.92}), event("2026-09-20T19:00:00Z", {"WR": 8.8})]
        rows = build_game_plays(GAME, TestBuildGamePlays.STARTERS, TestBuildGamePlays.GSIS, events, 309,
                                {"home": ["g"], "away": []}, clocks)
        assert [(r["home_progress"], r["away_progress"]) for r in rows] == [(0.5, None), (0.5, None)]

    def test_adjustment_row_is_at_full_progress(self):
        clocks = {"g": GameClock([T("2026-09-20T17:00:00Z"), T("2026-09-20T20:00:00Z")], [0, 3600])}
        starters = [starter("home", 1, "Brock Purdy", 6.92), starter("away", 2, "Ja'Marr Chase", 8.8)]
        events = [event("2026-09-20T17:05:00Z", {"QB": 4.92}), event("2026-09-20T17:06:00Z", {"WR": 8.8})]
        rows = build_game_plays(GAME, starters, TestBuildGamePlays.GSIS, events, 309,
                                {"home": ["g"], "away": ["g"]}, clocks)
        assert (rows[-1]["home_progress"], rows[-1]["away_progress"]) == (1.0, 1.0)

    def test_progress_is_none_without_clocks(self):
        events = [event("2026-09-20T17:05:00Z", {"QB": 4.92})]
        rows = build_game_plays(GAME, TestBuildGamePlays.STARTERS, TestBuildGamePlays.GSIS, events, 309)
        assert rows[0]["home_progress"] is None


class TestWinProbability:
    def test_normal_chance_and_settled_games(self):
        assert win_probability(0.0, 400.0) == pytest.approx(0.5)
        assert win_probability(20.0, 400.0) == pytest.approx(0.8413, abs=1e-4)  # one sd ahead
        assert win_probability(-20.0, 400.0) == pytest.approx(0.1587, abs=1e-4)
        assert (win_probability(0.5, 0), win_probability(-0.5, 0), win_probability(0.0, 0)) == (1.0, 0.0, 0.5)

    def test_model_blends_points_with_remaining_projection(self):
        clock = GameClock([T("2026-09-20T17:00:00Z"), T("2026-09-20T18:00:00Z"), T("2026-09-20T20:00:00Z")],
                          [0, 1800, 3600])
        model = WinModel([("home", "g", 20.0), ("away", "g", 10.0)], lineup_sd=10.0)
        # Halftime: home 5 + 20·½ = 15, away 10 + 10·½ = 15 → level.
        p = model.home_win_prob({"home": 5.0, "away": 10.0}, {"home": 0.5, "away": 0.5}, {"g": clock},
                                T("2026-09-20T18:00:00Z"))
        assert p == 0.5
        # Pre-game: 20 v 10, margin sd 10·√2 → Φ(10 / 14.14).
        p = model.home_win_prob({"home": 0.0, "away": 0.0}, {"home": 0.0, "away": 0.0}, {"g": clock},
                                T("2026-09-20T16:00:00Z"))
        assert p == pytest.approx(0.7602, abs=1e-4)

    def test_starter_without_a_game_brings_no_projection(self):
        model = WinModel([("home", None, 30.0)], lineup_sd=10.0)
        p = model.home_win_prob({"home": 0.0, "away": 0.0}, {"home": 0.0, "away": 0.0}, {}, T("2026-09-20T16:00:00Z"))
        assert p == 0.5

    def test_rows_start_with_kickoff_and_settle_at_the_end(self):
        clocks = {"g": GameClock([T("2026-09-20T17:00:00Z"), T("2026-09-20T20:00:00Z")], [0, 3600])}
        starters = [starter("home", 1, "Brock Purdy", 6.92), starter("away", 2, "Ja'Marr Chase", 8.8)]
        events = [event("2026-09-20T17:05:00Z", {"QB": 4.92}), event("2026-09-20T17:06:00Z", {"WR": 8.8})]
        model = WinModel([("home", "g", 15.0), ("away", "g", 10.0)], lineup_sd=20.0)
        rows = build_game_plays(GAME, starters, TestBuildGamePlays.GSIS, events, 309,
                                {"home": ["g"], "away": ["g"]}, clocks, model)
        kickoff = rows[0]
        assert (kickoff["note"], kickoff["home_points"], kickoff["away_points"]) == (KICKOFF_NOTE, 0.0, 0.0)
        assert kickoff["play_at"].startswith("2026-09-20T17:00:00")
        assert kickoff["home_win_prob"] > 0.5  # projected 15 v 10
        assert [r["seq"] for r in rows] == [1, 2, 3, 4]
        # The adjustment row (Ottoneu's 6.92 v 8.80) settles it for away.
        assert (rows[-1]["note"], rows[-1]["home_win_prob"]) == (ADJUSTMENT_NOTE, 0.0)

    def test_no_kickoff_row_without_a_model(self):
        events = [event("2026-09-20T17:05:00Z", {"QB": 4.92})]
        rows = build_game_plays(GAME, TestBuildGamePlays.STARTERS, TestBuildGamePlays.GSIS, events, 309)
        assert rows[0]["note"] != KICKOFF_NOTE and rows[0]["home_win_prob"] is None


class TestCalibrationHelpers:
    STARTERS = [
        {"game_id": 1, "side": "home", "player_id": "a", "points": 30.0},
        {"game_id": 1, "side": "away", "player_id": "b", "points": 10.0},
        {"game_id": 2, "side": "home", "player_id": "c", "points": 5.0},
        {"game_id": 2, "side": "away", "player_id": "d", "points": 15.0},
    ]
    PROJ = {"a": 20.0, "b": 10.0, "c": 10.0, "d": 10.0}

    def test_lineup_residuals(self):
        assert sorted(lineup_residuals(self.STARTERS, self.PROJ)) == [-5.0, 0.0, 5.0, 10.0]

    def test_margin_slope_sums(self):
        # Game 1: projected +10, actual +20; game 2: projected 0, actual −10.
        assert margin_slope(self.STARTERS, self.PROJ) == (200.0, 100.0)

    def test_checkpoints_and_report(self):
        rows = [
            {"home_progress": 0.0, "away_progress": 0.0, "home_win_prob": 0.6},
            {"home_progress": 0.5, "away_progress": 0.5, "home_win_prob": 0.8},
            {"home_progress": 1.0, "away_progress": 1.0, "home_win_prob": 1.0},
        ]
        picked = checkpoint_rows(rows)
        assert picked[0.0]["home_win_prob"] == 0.6
        assert picked[0.5]["home_win_prob"] == 0.8
        assert picked[0.9]["home_win_prob"] == 1.0
        report = "\n".join(calibration_report([(rows, 1.0)]))
        assert "0.160" in report  # Brier at kickoff: (0.6 − 1)²
