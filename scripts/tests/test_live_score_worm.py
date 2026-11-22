"""Tests for the live score worm (scripts/live_score_worm.py) and the parts of
scripts/rebuild_score_worm.py it relies on for games still being played.

Pure functions only — no network, no DB.
"""

import math
from datetime import datetime, timedelta, timezone

import pandas as pd

from scripts.live_score_worm import (
    IDLE_RECHECK,
    FailureStreaks,
    fingerprint,
    is_due,
    keep_going,
    next_kickoff,
    pick_sources,
    state_kickoff,
    week_frame,
)
from scripts.rebuild_score_worm import GameClock, game_clocks, week_game_rows

NOW = datetime(2026, 11, 1, 18, 30, tzinfo=timezone.utc)


def espn_game(game_id, state, kickoff="2026-11-01T18:00Z", event=None):
    _season, _week, away, home = game_id.split("_")
    return {"event": event or game_id, "game_id": game_id, "home": home, "away": away,
            "teams": {"1": home, "2": away}, "kickoff": kickoff, "state": state}


def nflverse_row(game_id, play_id, desc="", **fields):
    _season, _week, away, home = game_id.split("_")
    row = {"game_id": game_id, "play_id": float(play_id), "week": 8, "desc": desc,
           "time_of_day": "2026-10-30T02:00:00Z", "home_team": home, "away_team": away,
           "posteam": home, "qtr": 4, "quarter_seconds_remaining": 0.0, "game_seconds_remaining": 0.0}
    row.update(fields)
    return row


class TestSources:
    def test_nflverse_wins_where_it_has_the_whole_game(self):
        games = [espn_game("2026_08_CAR_GB", "post"), espn_game("2026_08_BAL_BUF", "in"),
                 espn_game("2026_08_KC_DEN", "pre"), espn_game("2026_08_NE_MIA", "post")]
        assert pick_sources(games, {"2026_08_CAR_GB"}) == {
            "2026_08_CAR_GB": "nflverse", "2026_08_BAL_BUF": "espn", "2026_08_NE_MIA": "espn",
        }

    def test_week_frame_mixes_feeds_and_lists_games_to_come(self):
        nflverse = pd.DataFrame([nflverse_row("2026_08_CAR_GB", 1),
                                 nflverse_row("2026_08_CAR_GB", 2, desc="END GAME")])
        games = [espn_game("2026_08_CAR_GB", "post"), espn_game("2026_08_BAL_BUF", "in", event="77"),
                 espn_game("2026_08_KC_DEN", "pre")]
        plays = {"77": [{"type": {"text": "Rush"}, "text": "J.Cook up the middle for 4 yards.",
                         "sequenceNumber": "50", "period": {"number": 1}, "clock": {"value": 800.0},
                         "wallclock": "2026-11-01T18:10:00Z",
                         "teamParticipants": [{"id": "1", "type": "offense"}],
                         "participants": [], "start": {}}]}
        frame, sources, scheduled = week_frame(8, games, nflverse, plays, {})
        assert sorted(frame["game_id"].unique()) == ["2026_08_BAL_BUF", "2026_08_CAR_GB"]
        assert sources == {"2026_08_CAR_GB": "nflverse", "2026_08_BAL_BUF": "espn"}
        assert scheduled == [("2026_08_KC_DEN", "DEN", "KC")]


class TestLooping:
    def test_keeps_going_while_a_game_is_on(self):
        assert keep_going([espn_game("2026_08_BAL_BUF", "in")], NOW, timedelta(minutes=20))

    def test_keeps_going_when_a_kickoff_is_near(self):
        soon = [espn_game("2026_08_KC_DEN", "pre", kickoff="2026-11-01T18:45Z")]
        later = [espn_game("2026_08_KC_DEN", "pre", kickoff="2026-11-01T21:25Z")]
        assert keep_going(soon, NOW, timedelta(minutes=20))
        assert not keep_going(later, NOW, timedelta(minutes=20))

    def test_next_kickoff_ignores_games_already_started(self):
        games = [espn_game("2026_08_BAL_BUF", "in"),
                 espn_game("2026_08_KC_DEN", "pre", kickoff="2026-11-01T21:25Z"),
                 espn_game("2026_08_PHI_WAS", "pre", kickoff="2026-11-02T01:20Z")]
        assert next_kickoff(games, NOW) == datetime(2026, 11, 1, 21, 25, tzinfo=timezone.utc)
        assert next_kickoff([espn_game("2026_08_CAR_GB", "post")], NOW) is None

    def test_state_kickoff_is_now_while_a_game_is_on(self):
        # So pg_cron restarts a loop that dies mid-game, not at the next kickoff.
        games = [espn_game("2026_08_BAL_BUF", "in"),
                 espn_game("2026_08_KC_DEN", "pre", kickoff="2026-11-01T21:25Z")]
        assert state_kickoff(games, NOW) == NOW

    def test_state_kickoff_otherwise_is_the_next_kickoff_or_a_day_out(self):
        later = [espn_game("2026_08_CAR_GB", "post"),
                 espn_game("2026_08_KC_DEN", "pre", kickoff="2026-11-01T21:25Z")]
        assert state_kickoff(later, NOW) == datetime(2026, 11, 1, 21, 25, tzinfo=timezone.utc)
        assert state_kickoff([espn_game("2026_08_CAR_GB", "post")], NOW) == NOW + IDLE_RECHECK

    def test_fingerprint_changes_with_the_rows(self):
        assert fingerprint([{"a": 1}]) == fingerprint([{"a": 1}])
        assert fingerprint([{"a": 1}]) != fingerprint([{"a": 2}])


def state(minutes_ago_heartbeat=None, minutes_ago_dispatch=None, kickoff_in=None):
    """A live_worm_state row as Supabase returns it, times relative to NOW."""
    def at(delta):
        return None if delta is None else (NOW + timedelta(minutes=delta)).isoformat()
    return {"id": 1,
            "heartbeat_at": at(None if minutes_ago_heartbeat is None else -minutes_ago_heartbeat),
            "dispatched_at": at(None if minutes_ago_dispatch is None else -minutes_ago_dispatch),
            "next_kickoff": at(kickoff_in)}


class TestFailureStreaks:
    """A loop that keeps failing must exit non-zero so the health check alerts."""

    def test_exhausted_only_after_limit_failures_in_a_row(self):
        s = FailureStreaks({"pass": 3, "lineup scrape": 2})
        for _ in range(2):
            s.record("pass", False)
        assert s.exhausted() is None
        s.record("pass", False)
        assert s.exhausted() == "pass"

    def test_a_success_resets_that_step_only(self):
        s = FailureStreaks({"pass": 2, "lineup scrape": 2})
        s.record("pass", False)
        s.record("lineup scrape", False)
        s.record("pass", True)
        s.record("pass", False)
        assert s.exhausted() is None
        s.record("lineup scrape", False)
        assert s.exhausted() == "lineup scrape"


class TestIfDue:
    """`--if-due` must make pg_cron's start decision (migration 059), so the
    droplet timer and the GitHub fallback never run two loops at once."""

    def test_due_when_a_kickoff_is_within_15_minutes_or_past(self):
        assert is_due(state(kickoff_in=14), NOW)
        assert is_due(state(kickoff_in=-30), NOW)  # a game on: the loop writes now
        assert not is_due(state(kickoff_in=16), NOW)

    def test_not_due_while_another_loop_has_a_fresh_heartbeat(self):
        assert not is_due(state(minutes_ago_heartbeat=1, kickoff_in=0), NOW)
        assert is_due(state(minutes_ago_heartbeat=4, kickoff_in=0), NOW)  # that loop died

    def test_not_due_while_a_github_dispatch_is_starting(self):
        assert not is_due(state(minutes_ago_dispatch=5, kickoff_in=0), NOW)
        assert is_due(state(minutes_ago_dispatch=11, kickoff_in=0), NOW)

    def test_due_with_no_state_or_no_kickoff_known(self):
        assert is_due(None, NOW)
        assert is_due(state(), NOW)

    def test_reads_supabase_timestamp_format(self):
        row = {"heartbeat_at": None, "dispatched_at": "2026-11-01 17:00:00.1+00",
               "next_kickoff": "2026-11-01T18:40:00.349816+00:00"}
        assert is_due(row, NOW)


class TestGamesInProgress:
    def test_unfinished_clock_stops_at_the_latest_play(self):
        t = pd.Timestamp("2026-11-01T18:00:00Z")
        clock = GameClock([t, t + pd.Timedelta(minutes=30)], [0.0, 900.0], finished=False)
        assert clock.at(t + pd.Timedelta(hours=2)) == 900.0
        assert clock.length == 3600
        assert GameClock([], [], finished=False).at(t) == 0.0

    def test_game_without_end_game_row_is_unfinished(self):
        frame = pd.DataFrame([nflverse_row("2026_08_CAR_GB", 1, qtr=1, game_seconds_remaining=3000.0),
                              nflverse_row("2026_08_BAL_BUF", 1, desc="END GAME")])
        clocks = game_clocks(frame)
        assert not clocks["2026_08_CAR_GB"].finished
        assert clocks["2026_08_BAL_BUF"].finished

    def test_games_to_come_count_in_progress_and_projection(self):
        frame = pd.DataFrame([nflverse_row(
            "2026_08_CAR_GB", 1, qtr=3, game_seconds_remaining=1800.0, time_of_day="2026-11-01T18:00:00Z",
            rusher_player_id="G1", rushing_yards=60.0, passer_player_id=math.nan,
        )])
        game = {"game_id": 7, "season": 2026, "week": 8}
        starters = [
            {"game_id": 7, "side": "home", "ottoneu_id": 1, "player_id": "p1", "player_name": "Home Back",
             "nfl_team": "GB", "points": 6.0, "game_state": "in_progress"},
            {"game_id": 7, "side": "away", "ottoneu_id": 2, "player_id": "p2", "player_name": "Away Back",
             "nfl_team": "DEN", "points": None, "game_state": "scheduled"},
        ]
        built = week_game_rows([game], starters, {"p1": 10.0, "p2": 12.0}, {1: "G1"}, frame, {}, 309,
                               sources={"2026_08_CAR_GB": "espn"},
                               scheduled=[("2026_08_KC_DEN", "DEN", "KC")], adjust=False)
        kickoff, score = built[7]
        assert score["home_points"] == 6.0 and score["source"] == "espn"
        # Home is halfway through its game; away's starts later and brings all 12 projected points.
        assert score["home_progress"] == 0.5 and score["away_progress"] == 0.0
        assert score["away_proj_remaining"] == 12.0
        assert kickoff["source"] is None
