"""Tests for the league-agnostic live NFL feed (scripts/live_feed.py).

Pure functions only — no network, no DB. The central check: a play's stats,
scored with this league's rules in Sleeper's keys, give exactly what
rebuild_score_worm.play_points gives, so the feed carries everything the worm
scores and nothing it doesn't.
"""

import itertools
import math
import random

import pandas as pd
import pytest

from scripts.live_feed import (
    OTTONEU_SLEEPER_SCORING,
    game_rows,
    play_rows,
    play_stats,
    player_rows,
    score_stats,
)
from scripts.rebuild_score_worm import play_points

NAN = math.nan
QB, RB, WR, TE, K = "00-QB", "00-RB", "00-WR", "00-TE", "00-K"


def scored(play: dict) -> dict[str, float]:
    """Points per player; a line worth nothing here (a completion alone) drops out."""
    points = {p: round(score_stats(line, OTTONEU_SLEEPER_SCORING), 2) for p, line in play_stats(play).items()}
    return {p: v for p, v in points.items() if v}


def rounded(points: dict[str, float]) -> dict[str, float]:
    return {p: round(v, 2) for p, v in points.items() if round(v, 2)}


PLAYS = [
    # A 23-yard touchdown catch.
    {"passer_player_id": QB, "receiver_player_id": WR, "passing_yards": 23.0, "receiving_yards": 23.0,
     "complete_pass": 1, "pass_touchdown": 1, "touchdown": 1, "td_player_id": WR,
     "td_team": "KC", "posteam": "KC"},
    # A rushing touchdown.
    {"rusher_player_id": RB, "rushing_yards": 4.0, "touchdown": 1, "td_player_id": RB,
     "td_team": "KC", "posteam": "KC"},
    # An interception returned for a touchdown: the passer loses 2, nobody else scores.
    {"passer_player_id": QB, "receiver_player_id": WR, "interception": 1, "touchdown": 1,
     "td_player_id": "00-DEF", "td_team": "BUF", "posteam": "KC"},
    # A lateral after the catch.
    {"passer_player_id": QB, "receiver_player_id": WR, "passing_yards": 12.0, "receiving_yards": 12.0,
     "complete_pass": 1, "lateral_receiver_player_id": TE, "lateral_receiving_yards": 9.0},
    # A lateral rush that scores.
    {"rusher_player_id": RB, "rushing_yards": 3.0, "lateral_rusher_player_id": WR,
     "lateral_rushing_yards": 30.0, "touchdown": 1, "td_player_id": WR, "td_team": "KC", "posteam": "KC"},
    # Field goals in every band, a miss and a block.
    *({"kicker_player_id": K, "field_goal_result": "made", "kick_distance": float(d)}
      for d in (19, 20, 29, 33, 39, 40, 49, 50, 59, 61)),
    {"kicker_player_id": K, "field_goal_result": "missed", "kick_distance": 52.0},
    {"kicker_player_id": K, "field_goal_result": "blocked", "kick_distance": 44.0},
    {"kicker_player_id": K, "field_goal_result": "made", "kick_distance": NAN},
    # Extra points.
    *({"kicker_player_id": K, "extra_point_result": r} for r in ("good", "failed", "blocked", "aborted")),
    # Two-point conversions, pass and rush.
    {"passer_player_id": QB, "receiver_player_id": TE, "two_point_conv_result": "success"},
    {"rusher_player_id": RB, "two_point_conv_result": "success"},
    {"rusher_player_id": RB, "two_point_conv_result": "failure"},
    # A strip after the catch, lost.
    {"passer_player_id": QB, "receiver_player_id": WR, "passing_yards": 8.0, "receiving_yards": 8.0,
     "complete_pass": 1, "fumble_lost": 1, "fumbled_1_player_id": WR},
    # A sack: nflverse carries no passing yards on one.
    {"passer_player_id": NAN, "rusher_player_id": NAN, "fumble_lost": 0},
    # Negative rushing yards.
    {"rusher_player_id": RB, "rushing_yards": -3.0},
    # A nullified play: ids but no yards.
    {"passer_player_id": QB, "receiver_player_id": WR},
]


class TestPlayStats:
    @pytest.mark.parametrize("play", PLAYS)
    def test_scoring_the_stats_gives_the_worms_points(self, play):
        assert scored(play) == rounded(play_points(play))

    def test_random_plays_agree_too(self):
        rng = random.Random(66)
        ids = [QB, RB, WR, TE, K, NAN, None]
        fields = {
            "passer_player_id": ids, "rusher_player_id": ids, "receiver_player_id": ids,
            "lateral_rusher_player_id": ids, "lateral_receiver_player_id": ids,
            "passing_yards": [0.0, 7.0, -2.0, NAN], "rushing_yards": [0.0, 11.0, -4.0, NAN],
            "receiving_yards": [0.0, 7.0, 31.0], "lateral_rushing_yards": [0.0, 5.0],
            "lateral_receiving_yards": [0.0, 6.0], "complete_pass": [0, 1], "pass_touchdown": [0, 1],
            "interception": [0, 1], "touchdown": [0, 1], "td_player_id": ids, "td_team": ["KC", "BUF"],
            "kicker_player_id": ids, "field_goal_result": [None, "made", "missed", "blocked"],
            "kick_distance": [22.0, 45.0, 55.0, NAN], "extra_point_result": [None, "good", "failed"],
            "two_point_conv_result": [None, "success", "failure"], "fumble_lost": [0, 1],
            "fumbled_1_player_id": ids,
        }
        for _ in range(2000):
            play = {k: rng.choice(v) for k, v in fields.items()}
            play["posteam"] = "KC"
            assert scored(play) == rounded(play_points(play)), play

    def test_uses_sleepers_keys(self):
        stats = play_stats(PLAYS[0])
        assert stats[QB] == {"pass_yd": 23.0, "pass_td": 1, "pass_cmp": 1}
        assert stats[WR] == {"rec_yd": 23.0, "rec": 1, "rec_td": 1}

    def test_field_goals_carry_band_count_and_distance(self):
        stats = play_stats({"kicker_player_id": K, "field_goal_result": "made", "kick_distance": 47.0})
        assert stats == {K: {"fgm_40_49": 1, "fgm": 1, "fgm_yds": 47.0}}

    def test_a_play_with_nothing_has_no_stats(self):
        assert play_stats({"desc": "Timeout #1 by KC"}) == {}


def frame(*plays):
    base = {"game_id": "2026_12_KC_BUF", "week": 12, "home_team": "BUF", "away_team": "KC",
            "posteam": "KC", "desc": ""}
    return pd.DataFrame([{**base, **p} for p in plays])


class TestPlayRows:
    def test_every_timed_play_with_a_monotone_clock(self):
        rows = play_rows(frame(
            {"play_id": 1.0, "time_of_day": "2026-11-23T18:01:00Z", "qtr": 1,
             "quarter_seconds_remaining": 880.0, "game_seconds_remaining": 3580.0},
            {"play_id": 2.0, "time_of_day": "2026-11-23T18:02:00Z", "qtr": 1,
             "quarter_seconds_remaining": 850.0, "game_seconds_remaining": 3550.0,
             "rusher_player_id": RB, "rushing_yards": 6.0},
            # A replay review that reads earlier on the clock: elapsed never goes back.
            {"play_id": 3.0, "time_of_day": "2026-11-23T18:03:00Z", "qtr": 1,
             "quarter_seconds_remaining": 860.0, "game_seconds_remaining": 3560.0},
            {"play_id": 4.0, "time_of_day": None, "qtr": 1,
             "quarter_seconds_remaining": NAN, "game_seconds_remaining": NAN},
        ), 2026, {"2026_12_KC_BUF": "espn"})["2026_12_KC_BUF"]
        assert [r["play_id"] for r in rows] == [1.0, 2.0, 3.0, 4.0]
        assert [r["elapsed_seconds"] for r in rows] == [20.0, 50.0, 50.0, 50.0]
        assert rows[0]["stats"] is None
        assert rows[1]["stats"] == {RB: {"rush_yd": 6.0}}
        assert {r["source"] for r in rows} == {"espn"}
        assert rows[1]["play_at"].startswith("2026-11-23T18:02:00")

    def test_games_without_a_source_are_skipped(self):
        rows = play_rows(frame({"play_id": 1.0, "time_of_day": "2026-11-23T18:01:00Z", "qtr": 1,
                                "quarter_seconds_remaining": 880.0, "game_seconds_remaining": 3580.0}),
                         2026, {})
        assert rows == {}

    def test_empty_frame(self):
        assert play_rows(pd.DataFrame(), 2026, {}) == {}


class TestGameRows:
    GAMES = [
        {"event": "1", "game_id": "2026_12_KC_BUF", "home": "BUF", "away": "KC",
         "kickoff": "2026-11-23T18:00Z", "state": "in"},
        {"event": "2", "game_id": "2026_12_NE_MIA", "home": "MIA", "away": "NE",
         "kickoff": "2026-11-23T21:25Z", "state": "pre"},
        {"event": "3", "game_id": "2026_12_CAR_GB", "home": "GB", "away": "CAR",
         "kickoff": "2026-11-20T01:15Z", "state": "post"},
    ]

    def test_clock_state_and_source(self):
        plays = {
            "2026_12_KC_BUF": [{"elapsed_seconds": 900.0, "play_at": "2026-11-23T18:40:00+00:00"}],
            "2026_12_CAR_GB": [{"elapsed_seconds": 3950.0, "play_at": "2026-11-20T04:30:00+00:00"}],
        }
        rows = {r["game_id"]: r for r in game_rows(
            self.GAMES, 2026, 12, {"2026_12_KC_BUF": "espn", "2026_12_CAR_GB": "nflverse"},
            plays, {"2026_12_CAR_GB"}, "2026-11-23T18:41:00+00:00")}
        live, later, done = rows["2026_12_KC_BUF"], rows["2026_12_NE_MIA"], rows["2026_12_CAR_GB"]
        assert (live["elapsed_seconds"], live["length_seconds"], live["finished"]) == (900.0, 3600.0, False)
        assert (later["elapsed_seconds"], later["source"], later["last_play_at"]) == (0.0, None, None)
        # Overtime stretches the game's length; a finished game has played all of it.
        assert (done["elapsed_seconds"], done["length_seconds"], done["finished"]) == (3950.0, 3950.0, True)
        assert live["espn_event"] == "1" and live["state"] == "in"


class TestPlayerRows:
    def test_latest_week_wins_and_espn_ids_join(self):
        roster = pd.DataFrame([
            {"gsis_id": WR, "full_name": "Wide Out", "position": "WR", "team": "NYJ", "week": 1},
            {"gsis_id": WR, "full_name": "Wide Out", "position": "WR", "team": "KC", "week": 9},
            {"gsis_id": K, "full_name": "Kick Er", "position": None, "team": "BUF", "week": 9},
        ])
        rows = {r["gsis_id"]: r for r in player_rows(roster, {"4241": WR}, 2026)}
        assert rows[WR]["team"] == "KC" and rows[WR]["espn_id"] == "4241"
        assert rows[K]["espn_id"] is None and rows[K]["position"] is None


def test_scoring_map_covers_every_stat_the_worm_scores():
    # Every stat play_stats can emit that the worm scores has a weight here;
    # pass_cmp, fgm and fgm_yds are extras for other leagues, worth 0 here.
    emitted = set(itertools.chain.from_iterable(
        line.keys() for play in PLAYS for line in play_stats(play).values()))
    assert emitted - set(OTTONEU_SLEEPER_SCORING) == {"pass_cmp", "fgm", "fgm_yds"}
