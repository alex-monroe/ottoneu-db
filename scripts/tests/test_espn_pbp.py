"""Tests for ESPN play-by-play → nflverse-shaped rows (scripts/espn_pbp.py).

Pure functions over hand-built plays in the core API's shape — no network. The
play texts are real ones from 2026 weeks 5–8; each test pins a case that the
week-by-week check against Ottoneu's box scores turned up.
"""

import pytest

from scripts.espn_pbp import carrier_gain, enforced_gain, espn_rows, parse_scoreboard
from scripts.rebuild_score_worm import play_points

GAME = {"game_id": "2026_07_BAL_CIN", "home": "CIN", "away": "BAL", "teams": {"4": "CIN", "33": "BAL"}}


def athlete(espn_id, role, order=1):
    return {
        "athlete": {"$ref": f"http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/athletes/{espn_id}?lang=en"},
        "type": role,
        "order": order,
    }


def espn_play(kind, text, *participants, seq=100, offense="4", **fields):
    play = {
        "type": {"text": kind},
        "text": text,
        "sequenceNumber": str(seq),
        "period": {"number": 2},
        "clock": {"value": 600.0},
        "wallclock": "2026-10-19T18:30:00Z",
        "teamParticipants": [{"id": offense, "type": "offense"}],
        "participants": list(participants),
        "statYardage": 0,
        "start": {"yardsToEndzone": 60},
    }
    play.update(fields)
    return play


def points(*plays):
    total: dict[str, float] = {}
    for row in espn_rows(list(plays), GAME, 7, {"1": "QB", "2": "WR", "3": "RB", "4": "K", "9": "DEF"}):
        for pid, value in play_points(row).items():
            total[pid] = round(total.get(pid, 0) + value, 2)
    return total


class TestScoreboard:
    def test_games_use_nflverse_ids_and_codes(self):
        data = {"events": [{
            "id": "401873035", "date": "2026-11-02T01:20Z",
            "status": {"type": {"state": "pre"}},
            "competitions": [{"competitors": [
                {"homeAway": "home", "team": {"id": "28", "abbreviation": "WSH"}},
                {"homeAway": "away", "team": {"id": "21", "abbreviation": "PHI"}},
            ]}],
        }]}
        [game] = parse_scoreboard(data, 2026, 8)
        assert game["game_id"] == "2026_08_PHI_WAS"
        assert game["teams"] == {"28": "WAS", "21": "PHI"}
        assert game["state"] == "pre"


class TestRows:
    def test_reception(self):
        play = espn_play("Pass Reception", "J.Burrow pass short left to J.Chase to CIN 44 for 9 yards (M.Humphrey).",
                         athlete(1, "passer"), athlete(2, "receiver", 2))
        assert points(play) == {"QB": 0.36, "WR": 1.4}

    def test_passing_touchdown_and_extra_point_are_separate_rows(self):
        play = espn_play(
            "Passing Touchdown",
            "J.Burrow pass short middle to J.Chase for 13 yards, TOUCHDOWN. E.McPherson extra point is GOOD.",
            athlete(1, "passer"), athlete(2, "receiver", 2), athlete(2, "scorer", 3),
            athlete(4, "kicker", 4), athlete(4, "patScorer", 5),
            scoringPlay=True, scoreValue=6,
            pointAfterAttempt={"id": 61, "text": "Extra Point Good", "value": 1},
        )
        rows = espn_rows([play], GAME, 7, {"1": "QB", "2": "WR", "4": "K"})
        assert [r["play_id"] for r in rows] == [100.0, 100.5]
        assert points(play) == {"QB": 4.52, "WR": 7.8, "K": 1.0}

    def test_failed_two_point_try_text_does_not_void_the_catch(self):
        play = espn_play(
            "Passing Touchdown",
            "K.Cousins pass short right to A.Jeanty for 15 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. "
            "K.Cousins pass to J.Nailor is incomplete. ATTEMPT FAILS.",
            athlete(1, "passer"), athlete(2, "receiver", 2), athlete(2, "scorer", 3),
            scoringPlay=True, scoreValue=6,
            pointAfterAttempt={"id": 15, "text": "Two Point Pass", "value": 0},
        )
        assert points(play) == {"QB": 4.6, "WR": 8.0}

    def test_sacked_on_the_try_still_completes_the_touchdown(self):
        play = espn_play(
            "Passing Touchdown",
            "M.Stafford pass short left to P.Nacua for 2 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. "
            "M.Stafford is sacked. ATTEMPT FAILS.",
            athlete(1, "passer"), athlete(2, "receiver", 2), athlete(2, "scorer", 3),
            scoringPlay=True, scoreValue=6,
            pointAfterAttempt={"id": 15, "text": "Two Point Pass", "value": 0},
        )
        assert points(play) == {"QB": 4.08, "WR": 6.7}

    def test_two_point_pass(self):
        play = espn_play(
            "Passing Touchdown",
            "G.Smith pass short left to M.Taylor for 12 yards, TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. "
            "G.Smith pass to M.Taylor is complete. ATTEMPT SUCCEEDS.",
            athlete(1, "passer"), athlete(2, "receiver", 2), athlete(2, "scorer", 3),
            athlete(1, "patPasser", 4), athlete(2, "patScorer", 5),
            scoringPlay=True, scoreValue=6,
            pointAfterAttempt={"id": 15, "text": "Two Point Pass", "value": 2},
        )
        assert points(play) == {"QB": 5.48, "WR": 9.7}

    def test_nullified_plays_score_nothing(self):
        penalty = espn_play("Penalty", "B.Corum right tackle for 2 yards, TOUCHDOWN NULLIFIED by Penalty.",
                            athlete(3, "rusher"))
        no_play = espn_play("Rush", "S.Barkley right end ran ob at PHI 20 for 5 yards (Q.Williams).PENALTY on "
                                    "PHI-T.Steen, Offensive Holding, 7 yards, enforced at PHI 15 - No Play.",
                            athlete(3, "rusher"))
        assert points(penalty, no_play) == {}

    def test_sack_scores_nothing(self):
        assert points(espn_play("Sack", "T.Huntley sacked at BLT 16 for -6 yards (B.Mafe).",
                                athlete(1, "passer"), athlete(9, "sackedBy", 2))) == {}

    def test_interception(self):
        play = espn_play("Pass Interception Return",
                         "T.Huntley pass short right intended for Z.Flowers INTERCEPTED by D.Knight at BLT 38. "
                         "D.Knight to BLT 24 for 14 yards.",
                         athlete(1, "passer"), athlete(2, "receiver", 2))
        assert points(play) == {"QB": -2.0}

    @pytest.mark.parametrize("kind, text, result", [
        ("Field Goal Good", "A.Szmyt 32 yard field goal is GOOD, Center-R.Sunahara.", 3.0),
        ("Field Goal Good", "A.Szmyt 52 yard field goal is GOOD, Center-R.Sunahara.", 5.0),
        ("Field Goal Missed", "A.Szmyt 43 yard field goal is No Good, Hit Right Upright.", -1.0),
        ("Blocked Field Goal", "W.Reichard 59 yard field goal is BLOCKED (G.Stewart).", -1.0),
    ])
    def test_field_goals(self, kind, text, result):
        assert points(espn_play(kind, text, athlete(4, "kicker"))) == {"K": result}

    def test_strip_sack_charges_the_quarterback_not_the_listed_defender(self):
        # ESPN listed the pass rusher as the fumbler on this play.
        play = espn_play("Sack Opp Fumble Recovery",
                         "B.Young sacked at CAR 31 for -9 yards (A.Muhammad). FUMBLES (A.Muhammad), "
                         "RECOVERED by TB-C.Kancey at CAR 32.",
                         athlete(9, "forcedBy"), athlete(9, "sackedBy", 2), athlete(9, "fumbler", 3),
                         athlete(1, "passer", 4))
        assert points(play) == {"QB": -2.0}

    def test_fumble_recovered_by_the_offense_is_not_lost(self):
        # A "Fumble Return Touchdown" where a teammate fell on it in the end zone.
        play = espn_play("Fumble Return Touchdown",
                         "J.Williams left tackle to ARZ 2 for 2 yards (B.Baker). FUMBLES (B.Baker), "
                         "recovered by DAL-J.Mitchell at ARZ -2. TOUCHDOWN.",
                         athlete(3, "rusher"), athlete(3, "fumbler", 2), scoringPlay=True, scoreValue=6)
        assert points(play) == {"RB": 0.2}

    def test_fumble_lost_after_a_catch(self):
        play = espn_play("Fumble Recovery (Opponent)",
                         "J.Gibbs up the middle to GB 6 for 6 yards (I.McDuffie). FUMBLES (I.McDuffie), "
                         "RECOVERED by GB-B.Cox at GB 8.",
                         athlete(3, "rusher"), athlete(3, "fumbler", 2), athlete(9, "recoverer", 3),
                         start={"yardsToEndzone": 12})
        # 6 yards to the GB 6, but only 4 count: the ball was recovered at the GB 8.
        assert points(play) == {"RB": -1.6}


class TestYards:
    def test_gain_is_read_from_the_text(self):
        assert carrier_gain({"text": "D.Henry left tackle to CIN 48 for 1 yard (T.Slaton).", "statYardage": 9}) == 1
        assert carrier_gain({"text": "W.Marks up the middle for no gain.", "statYardage": 3}) == 0
        assert carrier_gain({"text": "", "shortText": "Darren Waller 50 Yd pass from Bryce Young",
                             "statYardage": 0}) == 50

    def test_fumble_without_a_gain_counts_zero_not_the_net(self):
        assert carrier_gain({"text": "B.Nix FUMBLES (Aborted) at DEN 48, recovered by DEN-J.Waddle at DEN 44.",
                             "statYardage": -12}) == 0

    def test_holding_downfield_cuts_the_run_back_to_the_spot(self):
        play = {"text": "W.Marks left end pushed ob at NYG 39 for 27 yards (A.Washington).PENALTY on "
                        "HST-D.Schultz, Offensive Holding, 10 yards, enforced at HST 35.",
                "start": {"yardsToEndzone": 66}}
        assert enforced_gain(play, 27) == 1

    def test_foul_on_their_side_of_the_field(self):
        play = {"text": "T.Pollard up the middle to CLV 40 for 3 yards (C.Schwesinger).PENALTY on "
                        "TEN-A.Schlottmann, Offensive Holding, 10 yards, enforced at CLV 41.",
                "start": {"yardsToEndzone": 43}}
        assert enforced_gain(play, 3) == 2

    def test_foul_at_the_end_of_the_run_leaves_the_gain(self):
        play = {"text": "T.Allgeier left tackle to ARZ 16 for 3 yards (M.Roach).PENALTY on ARZ-T.McBride, "
                        "Face Mask, 8 yards, enforced at ARZ 16.",
                "start": {"yardsToEndzone": 19}}
        assert enforced_gain(play, 3) == 3
