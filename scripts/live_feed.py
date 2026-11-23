"""Publish the live week's play-by-play as a league-agnostic feed (migration 066).

The live loop (scripts/live_score_worm.py) builds, every pass, one frame of
nflverse-shaped plays for the live NFL week: nflverse for the games it has
published, ESPN for the rest. This module writes that frame out *before* any
league's scoring or lineups touch it, so another app on this database — Roster
Loom (alex-monroe/fantasy-pulse), which aggregates leagues with their own
scoring — can score the same plays its own way instead of scraping ESPN again.

- `nfl_live_games`: each NFL game's state, feed and game clock.
- `nfl_live_plays`: each timed play's wall-clock time, game seconds elapsed, and
  each player's stat line on it, keyed by gsis id, in **Sleeper's stat keys**
  (pass_yd, rec, rush_td, fgm_40_49, fum_lost, ...). Sleeper's are the de-facto
  standard keys for league scoring settings, so a Sleeper league's
  `scoring_settings` applies to them with no translation.
- `nfl_live_players`: gsis id -> ESPN id, name, position, team.

`play_stats` decomposes a play into exactly the stats `rebuild_score_worm
.play_points` scores, so scoring a play's stats with OTTONEU_SLEEPER_SCORING
gives play_points to the hundredth; scripts/tests/test_live_feed.py holds that.

Writing is never fatal to the loop: the worm is what this repo needs.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from collections import defaultdict

import pandas as pd

from scripts import rebuild_score_worm as worm
from scripts.config import SCORING_EXTRAS, SCORING_SETTINGS

GAMES_TABLE = "nfl_live_games"
PLAYS_TABLE = "nfl_live_plays"
PLAYERS_TABLE = "nfl_live_players"

_CHUNK = 500

# Field-goal distance bands, as Sleeper names them.
_FG_BANDS = ((20, "fgm_0_19"), (30, "fgm_20_29"), (40, "fgm_30_39"), (50, "fgm_40_49"), (60, "fgm_50_59"))


def _fg_band(distance: float) -> str:
    for upper, key in _FG_BANDS:
        if distance < upper:
            return key
    return "fgm_60p"


# This league's own scoring, in Sleeper's keys: what play_stats must reproduce.
OTTONEU_SLEEPER_SCORING: dict[str, float] = {
    "pass_yd": SCORING_SETTINGS["passing_yards"],
    "pass_td": SCORING_SETTINGS["passing_tds"],
    "pass_int": SCORING_SETTINGS["interceptions"],
    "rush_yd": SCORING_SETTINGS["rushing_yards"],
    "rush_td": SCORING_SETTINGS["rushing_tds"],
    "rec": SCORING_SETTINGS["receptions"],
    "rec_yd": SCORING_SETTINGS["receiving_yards"],
    "rec_td": SCORING_SETTINGS["receiving_tds"],
    "fgm_0_19": SCORING_SETTINGS["fg_made_0_39"],
    "fgm_20_29": SCORING_SETTINGS["fg_made_0_39"],
    "fgm_30_39": SCORING_SETTINGS["fg_made_0_39"],
    "fgm_40_49": SCORING_SETTINGS["fg_made_40_49"],
    "fgm_50_59": SCORING_SETTINGS["fg_made_50_plus"],
    "fgm_60p": SCORING_SETTINGS["fg_made_50_plus"],
    "xpm": SCORING_SETTINGS["pat_made"],
    "fum_lost": SCORING_EXTRAS["fumbles_lost"],
    "pass_2pt": SCORING_EXTRAS["two_point_pass"],
    "rush_2pt": SCORING_EXTRAS["two_point_rush_rec"],
    "rec_2pt": SCORING_EXTRAS["two_point_rush_rec"],
    "fgmiss": SCORING_EXTRAS["fg_missed"],
    "xpmiss": SCORING_EXTRAS["pat_missed"],
}


def play_stats(play: dict) -> dict[str, dict[str, float]]:
    """Each player's stat line on one play, keyed by gsis id (pure).

    Mirrors rebuild_score_worm.play_points rule for rule — offense and kickers
    only, a touchdown credited only to the scoring offense, a fumble charged to
    `fumbled_1_player_id` — but keeps the stats instead of their points. Also
    carries `pass_cmp` and `fgm` / `fgm_yds`, which some leagues score.
    """
    num, pid = worm._num, worm._id
    stats: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    def add(player, key: str, value: float) -> None:
        player = pid(player)
        if player and value:
            stats[player][key] += value

    passer = pid(play.get("passer_player_id"))
    rusher = pid(play.get("rusher_player_id"))
    receiver = pid(play.get("receiver_player_id"))
    lateral_rusher = pid(play.get("lateral_rusher_player_id"))
    lateral_receiver = pid(play.get("lateral_receiver_player_id"))

    add(passer, "pass_yd", num(play.get("passing_yards")))
    if num(play.get("pass_touchdown")):
        add(passer, "pass_td", 1)
    if num(play.get("interception")):
        add(passer, "pass_int", 1)

    add(rusher, "rush_yd", num(play.get("rushing_yards")))
    add(lateral_rusher, "rush_yd", num(play.get("lateral_rushing_yards")))
    add(receiver, "rec_yd", num(play.get("receiving_yards")))
    add(lateral_receiver, "rec_yd", num(play.get("lateral_receiving_yards")))
    if num(play.get("complete_pass")):
        add(receiver, "rec", 1)
        add(passer, "pass_cmp", 1)

    scorer = pid(play.get("td_player_id"))
    if scorer and num(play.get("touchdown")) and play.get("td_team") == play.get("posteam"):
        if scorer in (rusher, lateral_rusher):
            add(scorer, "rush_td", 1)
        elif scorer in (receiver, lateral_receiver):
            add(scorer, "rec_td", 1)

    kicker = play.get("kicker_player_id")
    field_goal = play.get("field_goal_result")
    if field_goal == "made":
        distance = num(play.get("kick_distance"))
        add(kicker, _fg_band(distance), 1)
        add(kicker, "fgm", 1)
        add(kicker, "fgm_yds", distance)
    elif field_goal in ("missed", "blocked"):
        add(kicker, "fgmiss", 1)
    extra_point = play.get("extra_point_result")
    if extra_point == "good":
        add(kicker, "xpm", 1)
    elif extra_point in ("failed", "blocked", "aborted"):
        add(kicker, "xpmiss", 1)

    if play.get("two_point_conv_result") == "success":
        add(passer, "pass_2pt", 1)
        add(rusher, "rush_2pt", 1)
        add(receiver, "rec_2pt", 1)

    if num(play.get("fumble_lost")):
        add(play.get("fumbled_1_player_id"), "fum_lost", 1)

    return {player: {k: round(v, 2) for k, v in line.items()} for player, line in stats.items()}


def score_stats(stats: dict[str, float], scoring: dict[str, float]) -> float:
    """A stat line's points under a Sleeper-keyed scoring map (pure)."""
    return sum(value * scoring.get(key, 0.0) for key, value in stats.items())


# --- Rows --------------------------------------------------------------------

def _iso(value) -> str | None:
    if value is None or (isinstance(value, float) and math.isnan(value)) or pd.isna(value):
        return None
    return pd.Timestamp(value).isoformat()


def play_rows(frame: pd.DataFrame, season: int, sources: dict[str, str]) -> dict[str, list[dict]]:
    """nfl game id -> its `nfl_live_plays` rows, in play order (pure).

    Every timed play is kept: one with no stats still moves the game clock,
    which is what a reader's minutes-played and win probability run on. Elapsed
    seconds never go backwards within a game (a replay review, an out-of-order
    timeout), the same rule as rebuild_score_worm.game_clocks.
    """
    if frame.empty:
        return {}
    timed = frame.assign(_at=worm.play_times(frame)).dropna(subset=["_at"])
    by_game: dict[str, list[dict]] = {}
    for game_id, plays in timed.sort_values(["_at", "play_id"]).groupby("game_id", sort=False):
        source = sources.get(game_id)
        if source is None:
            continue
        rows, high, seen = [], 0.0, set()
        for play in plays.to_dict("records"):
            play_id = float(play["play_id"])
            if play_id in seen:
                continue
            seen.add(play_id)
            seconds = worm.elapsed_seconds(play.get("qtr"), play.get("quarter_seconds_remaining"),
                                           play.get("game_seconds_remaining"))
            if seconds is not None:
                high = max(high, seconds)
            rows.append({
                "game_id": game_id,
                "season": season,
                "week": int(play["week"]),
                "play_id": play_id,
                "play_at": _iso(play["_at"]),
                "elapsed_seconds": round(high, 1) if seconds is not None or rows else None,
                "stats": play_stats(play) or None,
                "source": source,
            })
        by_game[game_id] = rows
    return by_game


def game_rows(
    espn_games: list[dict],
    season: int,
    week: int,
    sources: dict[str, str],
    plays: dict[str, list[dict]],
    finished: set[str],
    now_iso: str,
) -> list[dict]:
    """The week's `nfl_live_games` rows (pure).

    A game's clock is its last play's elapsed seconds; its length is 60 minutes
    until that runs into overtime. A finished game has played its whole length.
    """
    rows = []
    for game in espn_games:
        game_plays = plays.get(game["game_id"], [])
        elapsed = max((p["elapsed_seconds"] or 0.0 for p in game_plays), default=0.0)
        length = max(elapsed, float(worm.REGULATION_SECONDS))
        done = game["game_id"] in finished or game["state"] == "post"
        rows.append({
            "game_id": game["game_id"],
            "season": season,
            "week": week,
            "espn_event": game.get("event"),
            "home_team": game["home"],
            "away_team": game["away"],
            "kickoff": game.get("kickoff"),
            "state": game["state"],
            "source": sources.get(game["game_id"]),
            "elapsed_seconds": length if done else elapsed,
            "length_seconds": length,
            "finished": done,
            "last_play_at": game_plays[-1]["play_at"] if game_plays else None,
            "updated_at": now_iso,
        })
    return rows


def player_rows(roster: pd.DataFrame, gsis_of_espn: dict[str, str], season: int) -> list[dict]:
    """The season's `nfl_live_players` rows: each gsis id's latest roster entry (pure)."""
    espn_of = {gsis: espn for espn, gsis in gsis_of_espn.items()}
    latest = roster.sort_values("week").drop_duplicates("gsis_id", keep="last")
    rows = []
    for gsis, name, position, team in latest[["gsis_id", "full_name", "position", "team"]].itertuples(index=False):
        rows.append({
            "gsis_id": gsis,
            "season": season,
            "espn_id": espn_of.get(gsis),
            "full_name": name,
            "position": position if isinstance(position, str) else None,
            "team": team if isinstance(team, str) else None,
        })
    return rows


def _digest(rows: list[dict]) -> str:
    return hashlib.sha1(json.dumps(rows, sort_keys=True, default=str).encode()).hexdigest()


# --- Writer ------------------------------------------------------------------

class LiveFeedWriter:
    """Writes the feed each pass, rewriting only the games whose plays changed."""

    def __init__(self, supabase, dry_run: bool = False):
        self.supabase = supabase
        self.dry_run = dry_run
        self.written: dict[str, str] = {}
        self.players_season: int | None = None

    def write_players(self, roster: pd.DataFrame, gsis_of_espn: dict[str, str], season: int) -> None:
        if self.players_season == season:
            return
        rows = player_rows(roster, gsis_of_espn, season)
        if not self.dry_run:
            for start in range(0, len(rows), _CHUNK):
                self.supabase.table(PLAYERS_TABLE).upsert(rows[start:start + _CHUNK]).execute()
        print(f"  live feed: {len(rows)} players")
        self.players_season = season

    def write_week(
        self,
        frame: pd.DataFrame,
        espn_games: list[dict],
        season: int,
        week: int,
        sources: dict[str, str],
        now_iso: str,
    ) -> list[str]:
        """Write the week's games and changed plays; returns the games rewritten."""
        plays = play_rows(frame, season, sources)
        finished = set(frame.loc[frame["desc"] == "END GAME", "game_id"]) if "desc" in frame else set()
        games = game_rows(espn_games, season, week, sources, plays, finished, now_iso)
        changed = []
        for game_id, rows in plays.items():
            digest = _digest(rows)
            if self.written.get(game_id) == digest:
                continue
            if not self.dry_run:
                self.supabase.table(PLAYS_TABLE).delete().eq("game_id", game_id).execute()
                for start in range(0, len(rows), _CHUNK):
                    self.supabase.table(PLAYS_TABLE).insert(rows[start:start + _CHUNK]).execute()
            self.written[game_id] = digest
            changed.append(game_id)
        if not self.dry_run and games:
            self.supabase.table(GAMES_TABLE).upsert(games).execute()
        if changed:
            print(f"  live feed: rewrote {len(changed)} NFL games' plays")
        return changed


def write_safely(action, *args, **kwargs):
    """Run a feed write; a failure is logged, never raised."""
    try:
        return action(*args, **kwargs)
    except Exception as exc:  # noqa: BLE001 — the worm matters more than the feed
        print(f"  live feed not written: {exc}", file=sys.stderr)
        return None
