"""ESPN's public (unlisted) NFL play-by-play, reshaped as nflverse play-by-play rows.

The score worm is built from nflverse play-by-play (scripts/rebuild_score_worm.py),
but nflverse publishes a game only after it has ended — typically overnight.
ESPN's core API serves every play within a minute or so of the snap, with the
players involved and their roles. This module turns those plays into rows with
the nflverse column names that `play_points`, `game_clocks` and the rest of the
worm pipeline read, so the live worm is scored by exactly the same code as the
rebuilt one. nflverse stays the source of truth: scripts/live_score_worm.py uses
ESPN only for NFL games that nflverse does not have yet.

Two unauthenticated endpoints, both undocumented:

- the site API scoreboard, for a week's games, teams, kickoffs and states;
- the core API plays list, one request per game (`limit=1000` covers a game),
  where each play carries its type, text, clock, wall-clock time, the offense,
  and `participants` with a role each (passer, rusher, receiver, scorer,
  kicker, fumbler, patPasser, patRusher, patScorer, ...).

ESPN athlete ids are mapped to gsis ids through the nflverse roster's `espn_id`
column, so the rows join to starters exactly as nflverse rows do. An athlete
the roster does not know keeps an `espn:<id>` id: he scores, but credits no one.

ESPN gives per-play yardage only as the play's net `statYardage`, which on a
fumble includes the recovery. The ball carrier's gain is read from the play
text instead ("... for 13 yards. FUMBLES ..."), falling back to `statYardage`.
Plays whose type is `Penalty` were nullified ("No Play") and score nothing,
which is how nflverse and Ottoneu count them too.
"""

from __future__ import annotations

import re
import time

import requests

SCOREBOARD_URL = (
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
    "?seasontype=2&week={week}&dates={season}"
)
PLAYS_URL = (
    "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{event}"
    "/competitions/{event}/plays?limit=1000&page={page}"
)

# ESPN team codes that nflverse spells differently.
_NFLVERSE_TEAM = {"WSH": "WAS", "LAR": "LA"}

_PASS_TYPES = {
    "Pass Reception", "Passing Touchdown", "Pass Incompletion", "Pass Interception Return",
    "Interception Return Touchdown", "Pass Interception",
}
_RUSH_TYPES = {"Rush", "Rushing Touchdown"}
_FUMBLE_LOST_TYPES = {
    "Fumble Recovery (Opponent)", "Sack Opp Fumble Recovery", "Muffed Punt Recovery (Opponent)",
}
# Fumble types that do not say who recovered. The play text does: the NFL's
# gamebook style capitalises "RECOVERED by" for the defense and writes
# "recovered by" for the offense.
_FUMBLE_EITHER_TYPES = {"Fumble Recovery (Own)", "Fumble Return Touchdown"}
_FG_RESULT = {
    "Field Goal Good": "made",
    "Field Goal Missed": "missed",
    "Missed Field Goal Return": "missed",
    "Missed Field Goal Return Touchdown": "missed",
    "Blocked Field Goal": "blocked",
    "Blocked Field Goal Touchdown": "blocked",
}
# pointAfterAttempt ids on a touchdown play.
_PAT_GOOD, _PAT_MISSED, _PAT_BLOCKED = 61, 62, 43
_TWO_POINT_PASS, _TWO_POINT_RUSH = 15, 16

_GAIN = re.compile(r"\bfor (-?\d+) yards?\b|\bfor (no gain)\b")
_SHORT_GAIN = re.compile(r"\b(-?\d+) Yd (?:pass|Pass|Run|Rush|rush)\b")
_FG_DISTANCE = re.compile(r"(\d+)(?: |-)(?:yard|yd|Yd) (?:field goal|Field Goal|FG)")
# Spots after the end of a run that can cut its yards back (see enforced_gain).
_STOP_SPOT = re.compile(
    r"(?:PENALTY on [^,]+, [^,]+, \d+ yards?, enforced at"
    r"|RECOVERED by \S+ at|recovered by \S+ at|recovers at|ball out of bounds at)"
    r" ((?:[A-Z]+ )?\d+)"
)
_TEAM_ID = re.compile(r"/teams/(\d+)")

QUARTER_SECONDS = 900


# --- Fetching ----------------------------------------------------------------

def _get_json(url: str) -> dict:
    error: Exception | None = None
    for attempt in range(3):
        try:
            resp = requests.get(url, timeout=20)
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError) as exc:  # a blip: retry
            error = exc
            time.sleep(1 + attempt)
    raise RuntimeError(f"could not fetch {url}: {error}")


def nflverse_team(code: str) -> str:
    return _NFLVERSE_TEAM.get(code, code)


def parse_scoreboard(data: dict, season: int, week: int) -> list[dict]:
    """A week's games from a scoreboard response (pure).

    Each: `event` (ESPN id), `game_id` (nflverse's `{season}_{week}_{away}_{home}`),
    `home`/`away` (nflverse codes), `teams` (ESPN team id -> nflverse code),
    `kickoff` (ISO), `state` ('pre', 'in' or 'post').
    """
    games = []
    for event in data.get("events", []):
        competition = event["competitions"][0]
        teams, side = {}, {}
        for competitor in competition["competitors"]:
            code = nflverse_team(competitor["team"]["abbreviation"])
            teams[str(competitor["team"]["id"])] = code
            side[competitor["homeAway"]] = code
        games.append({
            "event": str(event["id"]),
            "game_id": f"{season}_{week:02d}_{side['away']}_{side['home']}",
            "home": side["home"],
            "away": side["away"],
            "teams": teams,
            "kickoff": event["date"],
            "state": event["status"]["type"]["state"],
        })
    return games


def fetch_week_games(season: int, week: int) -> list[dict]:
    return parse_scoreboard(_get_json(SCOREBOARD_URL.format(season=season, week=week)), season, week)


def fetch_plays(event: str) -> list[dict]:
    """Every play of one game so far, in ESPN's order."""
    items: list[dict] = []
    page = 1
    while True:
        data = _get_json(PLAYS_URL.format(event=event, page=page))
        items.extend(data.get("items", []))
        if page >= int(data.get("pageCount") or 1):
            return items
        page += 1


# --- Reshaping ---------------------------------------------------------------

def _athlete_id(participant: dict) -> str | None:
    match = re.search(r"/athletes/(\d+)", participant.get("athlete", {}).get("$ref", ""))
    return match.group(1) if match else None


def _roles(play: dict, gsis_of_espn: dict[str, str]) -> dict[str, str]:
    """Role -> player id (gsis where known) for the first participant in each role."""
    roles: dict[str, str] = {}
    for participant in sorted(play.get("participants", []), key=lambda p: p.get("order", 0)):
        espn = _athlete_id(participant)
        if espn and participant["type"] not in roles:
            roles[participant["type"]] = gsis_of_espn.get(espn, f"espn:{espn}")
    return roles


def _play_text(play: dict) -> str:
    """The play's description; after a replay reversal, only the ruling that stood."""
    text = play.get("text") or ""
    return text.rsplit("REVERSED.", 1)[-1]


def carrier_gain(play: dict) -> float:
    """Yards the ball carrier (rusher, or receiver on a catch) gained on the play.

    On a fumble `statYardage` is the net of the whole play, recovery included,
    so with no gain in the text a fumble counts 0 rather than falling back to it.
    """
    text = _play_text(play)
    match = _GAIN.search(text)
    if match:
        return 0.0 if match.group(2) else float(match.group(1))
    match = _SHORT_GAIN.search(play.get("shortText") or "")
    if match:
        return float(match.group(1))
    if "FUMBLES" in text:
        return 0.0
    return float(play.get("statYardage") or 0)


def _spot(text: str) -> tuple[str | None, int] | None:
    match = re.fullmatch(r"(?:([A-Z]+) )?(\d+)", text.strip())
    return (match.group(1), int(match.group(2))) if match else None


def enforced_gain(play: dict, gain: float) -> float:
    """The carrier's gain, cut back to a spot behind where he was stopped.

    Two things move it back, and nflverse and Ottoneu agree on both: offensive
    holding downfield is a spot foul, so yards past the spot don't count; and a
    fumble counts the carrier's yards only to where it was recovered or went
    out of bounds. A spot at or beyond the end of the run (a face mask enforced
    from there, a fumble that bounced forward) leaves the gain alone, so taking
    the smaller is safe.

    The text names field sides in its own team spellings (BLT, HST, CLV, ...),
    unlike the rest of the feed, so whose side a spot is on is worked out from
    where the run ended ("to CLV 40 for 3 yards"): that spot is `gain` yards on
    from the start's `yardsToEndzone`.
    """
    text = _play_text(play)
    to_go = (play.get("start") or {}).get("yardsToEndzone")
    end = re.search(r"\b(?:to|at) ((?:[A-Z]+ )?\d+)(?: \([^)]*\))? for\b", text)
    end_spot = _spot(end.group(1)) if end else None
    if to_go is None or not end_spot:
        return gain
    end_to_go = float(to_go) - gain
    if end_spot[1] == 50 or end_to_go == end_spot[1]:
        end_on_their_side = True
    elif end_to_go == 100 - end_spot[1]:
        end_on_their_side = False
    else:
        return gain  # the text and the feed disagree; leave the gain alone

    best = gain
    for match in _STOP_SPOT.finditer(text, end.end()):
        spot = _spot(match.group(1))
        if not spot:
            continue
        if spot[1] == 50:
            spot_to_go = 50.0
        elif (spot[0] == end_spot[0]) == end_on_their_side:
            spot_to_go = float(spot[1])
        else:
            spot_to_go = 100.0 - spot[1]
        best = min(best, float(to_go) - spot_to_go)
    return best


def _offense(play: dict, teams: dict[str, str]) -> str | None:
    for participant in play.get("teamParticipants", []):
        if participant.get("type") == "offense":
            return teams.get(str(participant.get("id")))
    match = _TEAM_ID.search((play.get("start", {}).get("team") or {}).get("$ref", ""))
    return teams.get(match.group(1)) if match else None


def _clock(play: dict) -> tuple[int, float | None, float | None]:
    """(quarter, seconds left in the quarter, seconds left in regulation)."""
    quarter = int((play.get("period") or {}).get("number") or 0)
    left = (play.get("clock") or {}).get("value")
    if left is None or quarter < 1:
        return quarter, None, None
    left = float(left)
    game_left = (4 - quarter) * QUARTER_SECONDS + left if quarter <= 4 else left
    return quarter, left, game_left


def espn_rows(plays: list[dict], game: dict, week: int, gsis_of_espn: dict[str, str]) -> list[dict]:
    """One game's ESPN plays as nflverse-shaped rows (pure).

    A touchdown's try (extra point or two-point conversion) is its own row, as
    in nflverse, half a step after the touchdown, so the try's passer and
    scorer are not confused with the touchdown's.
    """
    rows: list[dict] = []
    for play in plays:
        kind = (play.get("type") or {}).get("text") or ""
        quarter, quarter_left, game_left = _clock(play)
        base = {
            "game_id": game["game_id"],
            "play_id": float(play.get("sequenceNumber") or 0),
            "season_type": "REG",
            "week": week,
            "time_of_day": play.get("wallclock"),
            "desc": "END GAME" if kind == "End of Game" else _play_text(play),
            "posteam": _offense(play, game["teams"]),
            "home_team": game["home"],
            "away_team": game["away"],
            "qtr": quarter,
            "quarter_seconds_remaining": quarter_left,
            "game_seconds_remaining": game_left,
        }
        text = _play_text(play)
        if kind == "Penalty" or "No Play" in text or "offsetting" in text:  # nullified
            rows.append(base)
            continue

        roles = _roles(play, gsis_of_espn)
        row = dict(base)
        passer, receiver, rusher = roles.get("passer"), roles.get("receiver"), roles.get("rusher")
        is_pass = kind in _PASS_TYPES or (passer is not None and kind in _FUMBLE_LOST_TYPES | _FUMBLE_EITHER_TYPES)
        is_rush = kind in _RUSH_TYPES or (rusher is not None and passer is None
                                          and kind in _FUMBLE_LOST_TYPES | _FUMBLE_EITHER_TYPES)

        # A two-point try's "is incomplete" or "is sacked" can follow a caught
        # touchdown, so judge the snap by its own part of the text.
        snap = text.split("TWO-POINT CONVERSION")[0].split("FUMBLES")[0]
        if is_pass and passer and kind != "Sack" and "sacked" not in snap:
            row["passer_player_id"] = passer
            if receiver:
                row["receiver_player_id"] = receiver
            complete = receiver is not None and "Interception" not in kind and "incomplete" not in snap
            if complete:
                gain = enforced_gain(play, carrier_gain(play))
                row.update(complete_pass=1, passing_yards=gain, receiving_yards=gain)
            if "Interception" in kind:
                row["interception"] = 1
        elif is_rush and rusher:
            row["rusher_player_id"] = rusher
            row["rushing_yards"] = enforced_gain(play, carrier_gain(play))

        scorer = roles.get("scorer")
        if play.get("scoringPlay") and int(play.get("scoreValue") or 0) == 6 and scorer:
            if scorer in (row.get("rusher_player_id"), row.get("receiver_player_id")):
                row.update(touchdown=1, td_player_id=scorer, td_team=row["posteam"])
                if scorer == row.get("receiver_player_id"):
                    row["pass_touchdown"] = 1

        if kind in _FG_RESULT:
            row["kicker_player_id"] = roles.get("kicker")
            row["field_goal_result"] = _FG_RESULT[kind]
            distance = _FG_DISTANCE.search(text)
            row["kick_distance"] = float(distance.group(1)) if distance else None

        lost = kind in _FUMBLE_LOST_TYPES or (kind in _FUMBLE_EITHER_TYPES and "RECOVERED by" in text)
        if lost and roles.get("fumbler"):
            row.update(fumble_lost=1, fumbled_1_player_id=_fumbler(roles, row))

        rows.append(row)

        attempt = play.get("pointAfterAttempt") or {}
        try_row = _try_row(base, attempt, roles)
        if try_row:
            rows.append(try_row)
    return rows


def _fumbler(roles: dict[str, str], row: dict) -> str:
    """Who lost the fumble. ESPN sometimes lists the defender who forced it as
    the fumbler (seen on a strip sack); then it is the ball carrier."""
    fumbler = roles["fumbler"]
    defenders = {roles.get(r) for r in ("forcedBy", "sackedBy", "tackler", "recoverer")}
    if fumbler not in defenders:
        return fumbler
    if row.get("complete_pass"):
        return row["receiver_player_id"]
    return roles.get("rusher") or roles.get("passer") or fumbler


def _try_row(base: dict, attempt: dict, roles: dict[str, str]) -> dict | None:
    """The extra point or two-point try after a touchdown, as its own row."""
    kind = attempt.get("id")
    if kind is None:
        return None
    row = {**base, "play_id": base["play_id"] + 0.5}
    if kind == _PAT_GOOD:
        row.update(kicker_player_id=roles.get("kicker"), extra_point_result="good")
    elif kind == _PAT_MISSED:
        row.update(kicker_player_id=roles.get("kicker"), extra_point_result="failed")
    elif kind == _PAT_BLOCKED:
        row.update(kicker_player_id=roles.get("kicker"), extra_point_result="blocked")
    elif kind in (_TWO_POINT_PASS, _TWO_POINT_RUSH):
        if not attempt.get("value"):
            return None  # a failed try scores nobody
        row["two_point_conv_result"] = "success"
        if kind == _TWO_POINT_PASS:
            row.update(passer_player_id=roles.get("patPasser"), receiver_player_id=roles.get("patScorer"))
        else:
            row["rusher_player_id"] = roles.get("patRusher") or roles.get("patScorer")
    else:
        return None
    return row
