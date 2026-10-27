"""Rebuild each finished game's score worm, play by play, from nflverse play-by-play.

Usage:
    just rebuild-score-worm                 # every finished week not yet rebuilt
    just rebuild-score-worm --week 3        # rebuild week 3, even if already done
    just rebuild-score-worm --all           # rebuild every finished week again
    just rebuild-score-worm --dry-run       # score and check, write nothing

The live worm (`matchup_score_snapshots`, written by scripts/scrape_lineups.py)
has one point per lineup scrape, and GitHub fires the scrape's 5-minute cron
every couple of hours at best. Once a week's NFL games are over, nflverse has
every play with a wall-clock timestamp (`time_of_day`), so the worm can be
redrawn exactly: each play is scored with the league's rules, credited to the
starters in `matchup_lineups`, and every play that moves either side's total
becomes a `matchup_score_plays` row. The game page draws those in place of the
snapshots.

Scoring is SCORING_SETTINGS plus SCORING_EXTRAS (fumbles lost, two-point
conversions, missed kicks) — the same full scoring the season-total pipelines
use through scripts/scoring.py. Checked against Ottoneu's box scores: weeks 1–6 of 2026
match all 1,295 started player-games to the hundredth. Every run repeats that
check for the weeks it rebuilds and prints any player who disagrees; if a side's
rebuilt total still differs from Ottoneu's (a stat correction, an unmatched
player), a final 'Adjustment to Ottoneu's final' row brings it level.

A week is rebuilt only when it is over on both sides: every NFL game of that
week has an END GAME row in play-by-play, and every league game of the week is
final in `league_matchups`. The league week is the NFL week of the same number.

Players are matched to nflverse gsis ids by normalized name through that
season's roster file, with position and then NFL team as tie-breaks — the same
approach as scripts/backfill_red_zone.py.

Each row also carries each side's **share of lineup minutes played**
(`home_progress` / `away_progress`, 0–1) — the x-axis of the worm's "Minutes
played" view. Every starter brings his NFL game's full length: 60 minutes, plus
whatever overtime that game went to, so a lineup always finishes at exactly 1.
A starter on bye, or whose NFL game cannot be found, brings none. At any moment
a side's progress is the game minutes elapsed across its starters' games over
that total.
"""

from __future__ import annotations

import argparse
import io
import math
import sys
import time
from bisect import bisect_right
from collections import defaultdict
from datetime import datetime, timedelta

import pandas as pd
import requests

from scripts.config import (
    LEAGUE_ID,
    SCORING_EXTRAS,
    SCORING_SETTINGS,
    fetch_all_rows,
    get_supabase_client,
)
from scripts.name_utils import normalize_player_name

TABLE = "matchup_score_plays"

_NFLVERSE = "https://github.com/nflverse/nflverse-data/releases/download"
PBP_URL = _NFLVERSE + "/pbp/play_by_play_{season}.parquet"
ROSTER_URL = _NFLVERSE + "/rosters/roster_{season}.parquet"
GAMES_URL = "https://github.com/nflverse/nfldata/raw/master/data/games.csv"

ADJUSTMENT_NOTE = "Adjustment to Ottoneu's final"

# Two totals closer than this are the same score (points are kept to 2 dp).
_EPSILON = 0.005

REGULATION_SECONDS = 3600
OVERTIME_PERIOD_SECONDS = 600  # regular-season overtime

# Ottoneu team codes that nflverse spells differently.
_NFLVERSE_TEAM = {"JAC": "JAX", "LAR": "LA", "WSH": "WAS", "LVR": "LV", "OAK": "LV", "STL": "LA", "SD": "LAC"}

_PBP_COLUMNS = [
    "game_id", "play_id", "season_type", "week", "time_of_day", "desc", "posteam",
    "home_team", "away_team", "qtr", "quarter_seconds_remaining", "game_seconds_remaining",
    "passer_player_id", "rusher_player_id", "receiver_player_id",
    "lateral_rusher_player_id", "lateral_receiver_player_id",
    "passing_yards", "rushing_yards", "receiving_yards",
    "lateral_rushing_yards", "lateral_receiving_yards",
    "complete_pass", "pass_touchdown", "interception",
    "touchdown", "td_player_id", "td_team",
    "kicker_player_id", "field_goal_result", "kick_distance", "extra_point_result",
    "two_point_conv_result", "fumble_lost", "fumbled_1_player_id",
]


# --- Scoring -----------------------------------------------------------------

def _num(value) -> float:
    """A pbp number as float; NaN/None → 0."""
    if value is None:
        return 0.0
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if math.isnan(number) else number


def _id(value) -> str | None:
    """A pbp player id, or None for the NaN pandas leaves in empty cells."""
    return value if isinstance(value, str) and value else None


def _fg_points(distance: float) -> float:
    if distance >= 50:
        return SCORING_SETTINGS["fg_made_50_plus"]
    if distance >= 40:
        return SCORING_SETTINGS["fg_made_40_49"]
    return SCORING_SETTINGS["fg_made_0_39"]


def play_points(play: dict) -> dict[str, float]:
    """Fantasy points each player earned on one play, keyed by gsis id (pure).

    Offense and kickers only — the league has no defense or return scoring.
    Sacks carry no passing yards in nflverse, and a nullified play carries no
    yards at all, which is also how Ottoneu counts them.
    """
    s, x = SCORING_SETTINGS, SCORING_EXTRAS
    points: dict[str, float] = defaultdict(float)

    def add(player, value: float) -> None:
        pid = _id(player)
        if pid and value:
            points[pid] += value

    passer = _id(play.get("passer_player_id"))
    rusher = _id(play.get("rusher_player_id"))
    receiver = _id(play.get("receiver_player_id"))
    lateral_rusher = _id(play.get("lateral_rusher_player_id"))
    lateral_receiver = _id(play.get("lateral_receiver_player_id"))

    add(passer, _num(play.get("passing_yards")) * s["passing_yards"])
    if _num(play.get("pass_touchdown")):
        add(passer, s["passing_tds"])
    if _num(play.get("interception")):
        add(passer, s["interceptions"])

    add(rusher, _num(play.get("rushing_yards")) * s["rushing_yards"])
    add(lateral_rusher, _num(play.get("lateral_rushing_yards")) * s["rushing_yards"])
    add(receiver, _num(play.get("receiving_yards")) * s["receiving_yards"])
    add(lateral_receiver, _num(play.get("lateral_receiving_yards")) * s["receiving_yards"])
    if _num(play.get("complete_pass")):
        add(receiver, s["receptions"])

    scorer = _id(play.get("td_player_id"))
    if scorer and _num(play.get("touchdown")) and play.get("td_team") == play.get("posteam"):
        if scorer in (rusher, lateral_rusher):
            add(scorer, s["rushing_tds"])
        elif scorer in (receiver, lateral_receiver):
            add(scorer, s["receiving_tds"])

    kicker = play.get("kicker_player_id")
    field_goal = play.get("field_goal_result")
    if field_goal == "made":
        add(kicker, _fg_points(_num(play.get("kick_distance"))))
    elif field_goal in ("missed", "blocked"):
        add(kicker, x["fg_missed"])
    extra_point = play.get("extra_point_result")
    if extra_point == "good":
        add(kicker, s["pat_made"])
    elif extra_point in ("failed", "blocked", "aborted"):
        add(kicker, x["pat_missed"])

    if play.get("two_point_conv_result") == "success":
        add(passer, x["two_point_pass"])
        add(rusher, x["two_point_rush_rec"])
        add(receiver, x["two_point_rush_rec"])

    if _num(play.get("fumble_lost")):
        add(play.get("fumbled_1_player_id"), x["fumbles_lost"])

    return dict(points)


# --- nflverse ----------------------------------------------------------------

def _download(url: str) -> bytes:
    error: Exception | None = None
    for attempt in range(3):
        try:
            resp = requests.get(url, timeout=120)
            resp.raise_for_status()
            return resp.content
        except requests.RequestException as exc:  # a dropped connection: retry
            error = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"could not fetch {url}: {error}")


def load_pbp(season: int) -> pd.DataFrame:
    """The season's regular-season plays, only the columns scoring needs."""
    df = pd.read_parquet(io.BytesIO(_download(PBP_URL.format(season=season))), columns=_PBP_COLUMNS)
    return df[df["season_type"] == "REG"].copy()


def load_roster(season: int) -> pd.DataFrame:
    df = pd.read_parquet(io.BytesIO(_download(ROSTER_URL.format(season=season))))
    return df[["gsis_id", "full_name", "position", "team", "week"]].dropna(subset=["gsis_id", "full_name"])


def load_schedule(season: int) -> pd.DataFrame:
    df = pd.read_csv(io.BytesIO(_download(GAMES_URL)))
    return df[(df["season"] == season) & (df["game_type"] == "REG")][["game_id", "week"]]


def finished_nfl_weeks(schedule: pd.DataFrame, pbp: pd.DataFrame) -> set[int]:
    """NFL weeks whose every scheduled game has an END GAME row in play-by-play."""
    ended = set(pbp.loc[pbp["desc"] == "END GAME", "game_id"])
    weeks: dict[int, bool] = {}
    for game_id, week in schedule.itertuples(index=False):
        weeks[int(week)] = weeks.get(int(week), True) and game_id in ended
    return {week for week, done in weeks.items() if done}


def play_times(pbp: pd.DataFrame) -> pd.Series:
    """Each play's UTC time. The few untimed rows (timeouts, game ends) take the
    previous play's time within the game, or the next one's at the very start."""
    ordered = pbp.sort_values(["game_id", "play_id"])
    times = pd.to_datetime(ordered["time_of_day"], utc=True, errors="coerce")
    filled = times.groupby(ordered["game_id"]).transform(lambda s: s.ffill().bfill())
    return filled.reindex(pbp.index)


def scoring_events(pbp_week: pd.DataFrame) -> list[tuple[pd.Timestamp, str, float, dict[str, float]]]:
    """(time, nfl game id, play id, {gsis: points}) for every play that scored, in time order."""
    timed = pbp_week.assign(_at=play_times(pbp_week)).dropna(subset=["_at"])
    events = []
    for play in timed.to_dict("records"):
        points = play_points(play)
        if points:
            events.append((play["_at"], play["game_id"], float(play["play_id"]), points))
    events.sort(key=lambda e: (e[0], e[1], e[2]))
    return events


# --- Game clocks -------------------------------------------------------------

def elapsed_seconds(qtr, quarter_remaining, game_remaining) -> float | None:
    """Game seconds played at a play. In overtime nflverse restarts
    `game_seconds_remaining` on the period's own clock, so read the quarter's."""
    quarter = _num(qtr)
    if quarter >= 5:
        remaining = _num(quarter_remaining)
        return REGULATION_SECONDS + OVERTIME_PERIOD_SECONDS * (quarter - 5) + OVERTIME_PERIOD_SECONDS - remaining
    if game_remaining is None or (isinstance(game_remaining, float) and math.isnan(game_remaining)):
        return None
    return REGULATION_SECONDS - _num(game_remaining)


class GameClock:
    """One NFL game's elapsed game time against wall-clock time."""

    def __init__(self, times: list[pd.Timestamp], elapsed: list[float]):
        self.times = times
        self.elapsed = elapsed
        # A game's length is where its clock stopped: 3600, or more after overtime.
        self.length = max(elapsed[-1] if elapsed else 0.0, REGULATION_SECONDS)

    def at(self, when: pd.Timestamp) -> float:
        """Seconds played by `when` (0 before kickoff, the full length after the end)."""
        index = bisect_right(self.times, when) - 1
        if index < 0:
            return 0.0
        if index == len(self.times) - 1:
            return self.length
        return self.elapsed[index]


def game_clocks(pbp_week: pd.DataFrame) -> dict[str, GameClock]:
    """nfl game id -> its clock, from every timed play's elapsed seconds.

    The elapsed series is made non-decreasing, so a replay review or an
    out-of-order timeout never moves a lineup backwards.
    """
    timed = pbp_week.assign(_at=play_times(pbp_week)).dropna(subset=["_at"])
    clocks: dict[str, GameClock] = {}
    for game_id, plays in timed.sort_values(["_at", "play_id"]).groupby("game_id", sort=False):
        times, elapsed, high = [], [], 0.0
        for at, qtr, q_rem, g_rem in plays[["_at", "qtr", "quarter_seconds_remaining",
                                            "game_seconds_remaining"]].itertuples(index=False):
            seconds = elapsed_seconds(qtr, q_rem, g_rem)
            if seconds is None:
                continue
            high = max(high, seconds)
            times.append(at)
            elapsed.append(high)
        clocks[game_id] = GameClock(times, elapsed)
    return clocks


def team_games(pbp_week: pd.DataFrame) -> dict[str, str]:
    """nflverse team code -> that week's nfl game id."""
    games: dict[str, str] = {}
    for game_id, home, away in pbp_week[["game_id", "home_team", "away_team"]].drop_duplicates().itertuples(index=False):
        games[home] = game_id
        games[away] = game_id
    return games


def starter_game(
    starter: dict,
    gsis: str | None,
    weekly_team: dict[str, str],
    games_by_team: dict[str, str],
) -> str | None:
    """The NFL game a starter's minutes come from, or None (bye, not found).

    The nflverse roster's team for that week wins (it follows trades); the
    lineup's own team code is the fallback for a player who did not match.
    """
    if starter.get("game_state") == "bye":
        return None
    team = weekly_team.get(gsis) if gsis else None
    if team is None and starter.get("nfl_team"):
        team = _NFLVERSE_TEAM.get(starter["nfl_team"], starter["nfl_team"])
    return games_by_team.get(team) if team else None


def side_progress(games: list[str], clocks: dict[str, GameClock], when: pd.Timestamp) -> float | None:
    """Share (0–1) of a side's lineup minutes played by `when`; None if it has none."""
    known = [clocks[g] for g in games if g in clocks]
    total = sum(c.length for c in known)
    if total <= 0:
        return None
    return round(sum(c.at(when) for c in known) / total, 4)


# --- Player matching ---------------------------------------------------------

def gsis_index(roster: pd.DataFrame) -> dict[str, list[tuple[str, str, str]]]:
    """normalized full name -> [(gsis_id, position, team)]."""
    index: dict[str, set[tuple[str, str, str]]] = defaultdict(set)
    for gsis, name, position, team in roster[["gsis_id", "full_name", "position", "team"]].itertuples(index=False):
        index[normalize_player_name(name)].add((gsis, position, team))
    return {name: sorted(entries) for name, entries in index.items()}


def match_gsis(starter: dict, index: dict[str, list[tuple[str, str, str]]]) -> str | None:
    """A lineup row's gsis id: by name, then position, then NFL team to break ties."""
    candidates = index.get(normalize_player_name(starter["player_name"] or ""), [])
    for key, field in ((1, "position"), (2, "nfl_team")):
        if len({c[0] for c in candidates}) <= 1:
            break
        narrowed = [c for c in candidates if c[key] == starter.get(field)]
        candidates = narrowed or candidates
    gsis_ids = {c[0] for c in candidates}
    return gsis_ids.pop() if len(gsis_ids) == 1 else None


# --- The worm ----------------------------------------------------------------

def _short_name(name: str) -> str:
    """'Ja'Marr Chase' -> 'J. Chase'."""
    parts = name.split()
    return name if len(parts) < 2 else f"{parts[0][0]}. {' '.join(parts[1:])}"


def build_game_plays(
    game: dict,
    starters: list[dict],
    gsis_of: dict[int, str],
    events: list[tuple[pd.Timestamp, str, float, dict[str, float]]],
    league_id: int,
    side_games: dict[str, list[str]] | None = None,
    clocks: dict[str, GameClock] | None = None,
) -> list[dict]:
    """One game's `matchup_score_plays` rows (pure).

    `starters` are the game's `matchup_lineups` starter rows; `gsis_of` maps
    their ottoneu_id to a gsis id. Each event that moves either side's total
    becomes a row of running totals. If the rebuilt finals differ from the
    lineups' (Ottoneu's) totals, a last adjustment row closes the gap.

    `side_games` (side -> each starter's NFL game id, one entry per starter)
    and `clocks` give each row both sides' share of lineup minutes played;
    without them the progress columns are None.
    """
    owner: dict[str, tuple[str, str]] = {}
    official = {"home": 0.0, "away": 0.0}
    for row in starters:
        official[row["side"]] += row["points"] or 0.0
        gsis = gsis_of.get(row["ottoneu_id"])
        if gsis:
            owner[gsis] = (row["side"], _short_name(row["player_name"] or "?"))

    totals = {"home": 0.0, "away": 0.0}
    rows: list[dict] = []

    def progress(side: str, at: pd.Timestamp) -> float | None:
        if side_games is None or clocks is None:
            return None
        return side_progress(side_games.get(side, []), clocks, at)

    def emit(at: datetime, note: str, *, finished: bool = False) -> None:
        when = pd.Timestamp(at)
        rows.append({
            "league_id": league_id,
            "season": game["season"],
            "week": game["week"],
            "game_id": game["game_id"],
            "seq": len(rows) + 1,
            "play_at": at.isoformat(),
            "home_points": round(totals["home"], 2),
            "away_points": round(totals["away"], 2),
            "note": note,
            "home_progress": 1.0 if finished and side_games else progress("home", when),
            "away_progress": 1.0 if finished and side_games else progress("away", when),
        })

    for at, _nfl_game, _play_id, points in events:
        credited = [(owner[g], pts) for g, pts in points.items() if g in owner]
        if not credited:
            continue
        for (side, _name), pts in credited:
            totals[side] += pts
        note = " · ".join(f"{name} {pts:+.2f}" for (_side, name), pts in credited)
        emit(at.to_pydatetime(), note)

    off = any(abs(official[side] - totals[side]) >= _EPSILON for side in totals)
    if rows and off:
        totals.update(official)
        last = datetime.fromisoformat(rows[-1]["play_at"])
        emit(last + timedelta(minutes=1), ADJUSTMENT_NOTE, finished=True)
    return rows


def player_mismatches(
    starters: list[dict],
    gsis_of: dict[int, str],
    events: list[tuple[pd.Timestamp, str, float, dict[str, float]]],
) -> list[str]:
    """Starters whose rebuilt points differ from Ottoneu's, as printable lines."""
    rebuilt: dict[str, float] = defaultdict(float)
    for _at, _game, _play, points in events:
        for gsis, pts in points.items():
            rebuilt[gsis] += pts
    lines = []
    for row in starters:
        if row["points"] is None:
            continue
        gsis = gsis_of.get(row["ottoneu_id"])
        if gsis is None:
            lines.append(f"{row['player_name']} ({row['nfl_team']}): no nflverse match")
            continue
        mine = round(rebuilt.get(gsis, 0.0), 2)
        if abs(mine - row["points"]) >= _EPSILON:
            lines.append(f"{row['player_name']} ({row['nfl_team']}): Ottoneu {row['points']:.2f}, rebuilt {mine:.2f}")
    return lines


# --- Database ----------------------------------------------------------------

def league_games(supabase, league_id: int) -> list[dict]:
    """The latest season's league_matchups rows."""
    rows = (
        supabase.table("league_matchups")
        .select("game_id, season, week, status")
        .eq("league_id", league_id)
        .order("season", desc=True)
        .order("game_id")
        .limit(400)  # pagination-safe: a league-season is ~90 games
        .execute()
        .data
        or []
    )
    if not rows:
        return []
    season = rows[0]["season"]
    return [r for r in rows if r["season"] == season]


def rebuilt_weeks(supabase, league_id: int, season: int) -> set[int]:
    rows = fetch_all_rows(
        supabase, TABLE, "week",
        filters=[("eq", "league_id", league_id), ("eq", "season", season), ("eq", "seq", 1)],
    )
    return {r["week"] for r in rows}


def week_starters(supabase, league_id: int, season: int, week: int) -> list[dict]:
    return fetch_all_rows(
        supabase, "matchup_lineups",
        "game_id, side, ottoneu_id, player_name, nfl_team, position, points, game_state",
        filters=[("eq", "league_id", league_id), ("eq", "season", season),
                 ("eq", "week", week), ("eq", "is_starter", True)],
    )


def replace_game(supabase, league_id: int, game_id: int, rows: list[dict]) -> None:
    supabase.table(TABLE).delete().eq("league_id", league_id).eq("game_id", game_id).execute()
    for start in range(0, len(rows), 500):
        supabase.table(TABLE).insert(rows[start:start + 500]).execute()


# --- Main --------------------------------------------------------------------

def pick_weeks(
    games: list[dict],
    nfl_done: set[int],
    already: set[int],
    week: int | None,
    rebuild_all: bool,
) -> tuple[list[int], list[str]]:
    """Weeks to rebuild, plus a reason for each finished-but-skipped week asked for."""
    by_week: dict[int, list[dict]] = defaultdict(list)
    for g in games:
        by_week[g["week"]].append(g)
    chosen, skipped = [], []
    for w in sorted(by_week):
        if week is not None and w != week:
            continue
        if not all(g["status"] == "final" for g in by_week[w]):
            if week is not None:
                skipped.append(f"week {w}: league games not all final yet")
            continue
        if w not in nfl_done:
            skipped.append(f"week {w}: nflverse play-by-play not complete yet")
            continue
        if week is None and not rebuild_all and w in already:
            continue
        chosen.append(w)
    return chosen, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description="Rebuild score worms from nflverse play-by-play.")
    parser.add_argument("--league-id", type=int, default=LEAGUE_ID)
    parser.add_argument("--week", type=int, help="Rebuild this week (even if already rebuilt).")
    parser.add_argument("--all", action="store_true", help="Rebuild every finished week again.")
    parser.add_argument("--dry-run", action="store_true", help="Score and check without writing.")
    args = parser.parse_args()

    supabase = get_supabase_client()
    games = league_games(supabase, args.league_id)
    if not games:
        print("No league games stored.")
        return
    season = games[0]["season"]
    already = rebuilt_weeks(supabase, args.league_id, season)

    # Most daily runs have nothing to do; find that out before downloading play-by-play.
    every_week = {g["week"] for g in games}
    if not pick_weeks(games, every_week, already, args.week, args.all)[0]:
        print("Nothing to rebuild: no final week is waiting.")
        return

    pbp = load_pbp(season)
    nfl_done = finished_nfl_weeks(load_schedule(season), pbp)
    weeks, skipped = pick_weeks(games, nfl_done, already, args.week, args.all)
    for reason in skipped:
        print(f"Skipping {reason}")
    if not weeks:
        print("Nothing to rebuild.")
        return

    roster = load_roster(season)
    index = gsis_index(roster)
    for week in weeks:
        starters = week_starters(supabase, args.league_id, season, week)
        gsis_of = {}
        for row in starters:
            gsis = match_gsis(row, index)
            if gsis:
                gsis_of[row["ottoneu_id"]] = gsis
        pbp_week = pbp[pbp["week"] == week]
        events = scoring_events(pbp_week)
        clocks = game_clocks(pbp_week)
        games_by_team = team_games(pbp_week)
        weekly_team = dict(roster.loc[roster["week"] == week, ["gsis_id", "team"]].itertuples(index=False))

        mismatches = player_mismatches(starters, gsis_of, events)
        print(f"Week {week}: {len(starters)} starters, {len(events)} scoring plays, "
              f"{len(mismatches)} player mismatches")
        for line in mismatches:
            print(f"  {line}")

        by_game: dict[int, list[dict]] = defaultdict(list)
        for row in starters:
            by_game[row["game_id"]].append(row)
        for game in (g for g in games if g["week"] == week):
            side_games: dict[str, list[str]] = {"home": [], "away": []}
            for row in by_game[game["game_id"]]:
                nfl_game = starter_game(row, gsis_of.get(row["ottoneu_id"]), weekly_team, games_by_team)
                if nfl_game:
                    side_games[row["side"]].append(nfl_game)
                elif row.get("game_state") != "bye":
                    print(f"  game {game['game_id']}: no NFL game for {row['player_name']} ({row['nfl_team']})")
            rows = build_game_plays(game, by_game[game["game_id"]], gsis_of, events, args.league_id,
                                    side_games, clocks)
            adjusted = " (adjusted to Ottoneu's final)" if rows and rows[-1]["note"] == ADJUSTMENT_NOTE else ""
            final = f"{rows[-1]['home_points']:.2f}–{rows[-1]['away_points']:.2f}" if rows else "no plays"
            print(f"  game {game['game_id']}: {len(rows)} rows, {final}{adjusted}")
            if rows and not args.dry_run:
                replace_game(supabase, args.league_id, game["game_id"], rows)

    if args.dry_run:
        print("Dry run — not writing to the database.")


if __name__ == "__main__":
    sys.exit(main())
