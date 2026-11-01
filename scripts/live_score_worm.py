"""Keep the live week's score worms current, play by play, while NFL games are on.

Usage:
    just live-score-worm --once --dry-run   # one pass, print, write nothing
    just live-score-worm --once             # one pass
    just live-score-worm --loop             # every minute until no game is on or about to be

Each pass builds every league game's `matchup_score_plays` rows for the live
fantasy week with scripts/rebuild_score_worm.py's own scoring, clocks, win
probability and cone, from a mix of two play-by-play feeds, chosen per NFL game:

- **nflverse**, the source of truth, for every NFL game it has published (one
  with an END GAME row). nflverse publishes a game within a day of its end.
- **ESPN** (scripts/espn_pbp.py) for every other game that has kicked off,
  within a minute of each play.

NFL games not yet started still count: their starters bring 60 minutes and their
whole projection, so progress and win probability reflect the games to come.
Rows are labelled with their feed (`source`), and a week is not treated as
rebuilt until none is 'espn' — once it is over, the daily
scripts/rebuild_score_worm.py run rebuilds it from nflverse alone and closes any
gap to Ottoneu's final.

`--loop` is what .github/workflows/live-score-worm.yml runs. GitHub's own cron
fires too rarely on game days to drive minute-by-minute updates, so that job is
started by Supabase pg_cron (migration 059, `dispatch_live_worm`) and then loops
itself: ESPN every `--interval` seconds, the Ottoneu box scores (lineups, live
points) every `--lineup-every` passes, nflverse every 30 minutes. It writes a
heartbeat and the next kickoff to `live_worm_state`, which is how pg_cron knows
when to start it and that it is still running. It exits when no NFL game of the
week is in progress or kicks off within `--lead` minutes, or at `--max-minutes`
(a GitHub job may run six hours; pg_cron starts the next one).
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import pandas as pd
import requests

from scripts import espn_pbp
from scripts import rebuild_score_worm as worm
from scripts.config import LEAGUE_ID, get_supabase_client
from scripts.scrape_lineups import games_for_week, scrape_week

STATE_TABLE = "live_worm_state"
NFLVERSE_REFRESH = timedelta(minutes=30)
# With no game in sight, look again in a day (pg_cron reads this as the next kickoff).
IDLE_RECHECK = timedelta(days=1)


# --- Feeds -------------------------------------------------------------------

def espn_gsis_map(season: int) -> dict[str, str]:
    """ESPN athlete id -> gsis id, from the nflverse roster's `espn_id` column."""
    roster = pd.read_parquet(io.BytesIO(worm._download(worm.ROSTER_URL.format(season=season))))
    pairs = roster[["espn_id", "gsis_id"]].dropna().drop_duplicates()
    return {str(int(float(espn))): gsis for espn, gsis in pairs.itertuples(index=False)}


def pick_sources(espn_games: list[dict], nflverse_ended: set[str]) -> dict[str, str]:
    """nfl game id -> 'nflverse' or 'espn' for every game that has kicked off (pure).

    nflverse wins wherever it has the whole game; ESPN covers the rest.
    """
    sources = {}
    for game in espn_games:
        if game["game_id"] in nflverse_ended:
            sources[game["game_id"]] = "nflverse"
        elif game["state"] != "pre":
            sources[game["game_id"]] = "espn"
    return sources


def week_frame(
    week: int,
    espn_games: list[dict],
    nflverse_week: pd.DataFrame,
    espn_plays: dict[str, list[dict]],
    gsis_of_espn: dict[str, str],
) -> tuple[pd.DataFrame, dict[str, str], list[tuple[str, str, str]]]:
    """One week's plays from both feeds (pure): (frame, sources, scheduled games).

    `espn_plays` maps ESPN event id -> its plays, for the games ESPN covers.
    """
    ended = set(nflverse_week.loc[nflverse_week["desc"] == "END GAME", "game_id"])
    sources = pick_sources(espn_games, ended)
    parts = [nflverse_week[nflverse_week["game_id"].isin(ended)]]
    espn_rows = []
    for game in espn_games:
        if sources.get(game["game_id"]) == "espn":
            espn_rows += espn_pbp.espn_rows(espn_plays.get(game["event"], []), game, week, gsis_of_espn)
    if espn_rows:
        parts.append(pd.DataFrame(espn_rows))
    frame = pd.concat([p for p in parts if not p.empty], ignore_index=True) if any(
        not p.empty for p in parts) else nflverse_week.iloc[0:0]
    scheduled = [(g["game_id"], g["home"], g["away"]) for g in espn_games if g["game_id"] not in sources]
    return frame, sources, scheduled


def next_kickoff(espn_games: list[dict], now: datetime) -> datetime | None:
    """The earliest kickoff of a game not yet started; None if every game has."""
    times = [_parse_time(g["kickoff"]) for g in espn_games if g["state"] == "pre"]
    return min(times) if times else None


def keep_going(espn_games: list[dict], now: datetime, lead: timedelta) -> bool:
    """Whether a game is on, or kicks off within `lead`."""
    if any(g["state"] == "in" for g in espn_games):
        return True
    upcoming = next_kickoff(espn_games, now)
    return upcoming is not None and upcoming - now <= lead


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def fingerprint(rows: list[dict]) -> str:
    """A digest of a game's rows, so an unchanged game is not rewritten every minute."""
    return hashlib.sha1(json.dumps(rows, sort_keys=True, default=str).encode()).hexdigest()


# --- Side effects ------------------------------------------------------------

def write_state(supabase, **fields) -> None:
    """Upsert the single `live_worm_state` row. Never fatal: the worm is what matters."""
    try:
        supabase.table(STATE_TABLE).upsert({"id": 1, **fields}).execute()
    except Exception as exc:  # noqa: BLE001
        print(f"  live_worm_state not written: {exc}", file=sys.stderr)


def revalidate(game_ids: list[int]) -> None:
    """Ask the site to re-render the pages that draw these games' worms."""
    secret, site = os.environ.get("REVALIDATE_SECRET"), os.environ.get("SITE_URL")
    if not secret or not site or not game_ids:
        return
    paths = ["/scoreboard", "/matchup", *(f"/scoreboard/{g}" for g in game_ids)]
    try:
        requests.post(f"{site}/api/revalidate", json={"paths": paths}, timeout=15,
                      headers={"Authorization": f"Bearer {secret}"}).raise_for_status()
    except requests.RequestException as exc:
        print(f"  revalidate failed: {exc}", file=sys.stderr)


# --- One pass ----------------------------------------------------------------

class LiveWorm:
    """State carried between passes of the loop: feeds that are slow to fetch,
    and what was last written, so each pass does only what changed."""

    def __init__(self, supabase, league_id: int, dry_run: bool):
        self.supabase = supabase
        self.league_id = league_id
        self.dry_run = dry_run
        self.season: int | None = None
        self.nflverse: pd.DataFrame | None = None
        self.nflverse_at: datetime | None = None
        self.gsis_of_espn: dict[str, str] = {}
        self.roster: pd.DataFrame | None = None
        self.written: dict[int, str] = {}

    def load_season(self, season: int) -> None:
        if self.season == season:
            return
        self.season = season
        self.roster = worm.load_roster(season)
        self.gsis_of_espn = espn_gsis_map(season)
        self.nflverse, self.nflverse_at = None, None

    def refresh_nflverse(self, now: datetime, espn_games: list[dict]) -> None:
        """Re-download nflverse play-by-play when a finished game might have landed."""
        stale = self.nflverse_at is None or now - self.nflverse_at >= NFLVERSE_REFRESH
        if self.nflverse is not None and not stale:
            return
        if self.nflverse is not None:
            have = set(self.nflverse.loc[self.nflverse["desc"] == "END GAME", "game_id"])
            if all(g["game_id"] in have for g in espn_games if g["state"] == "post"):
                self.nflverse_at = now  # nothing new could be there yet
                return
        self.nflverse = worm.load_pbp(self.season)
        self.nflverse_at = now

    def run_pass(self, now: datetime) -> list[dict]:
        """Build and write the live week's worms; returns the week's ESPN games."""
        games = games_for_week(self.supabase, self.league_id, None)
        if not games:
            print("No live fantasy week.")
            return []
        season, week = games[0]["season"], games[0]["week"]
        self.load_season(season)
        espn_games = espn_pbp.fetch_week_games(season, week)
        self.refresh_nflverse(now, espn_games)
        nflverse_week = self.nflverse[self.nflverse["week"] == week]

        ended = set(nflverse_week.loc[nflverse_week["desc"] == "END GAME", "game_id"])
        espn_plays = {
            g["event"]: espn_pbp.fetch_plays(g["event"])
            for g in espn_games
            if g["state"] != "pre" and g["game_id"] not in ended
        }
        frame, sources, scheduled = week_frame(week, espn_games, nflverse_week, espn_plays, self.gsis_of_espn)

        starters = worm.week_starters(self.supabase, self.league_id, season, week)
        projections = worm.week_projections(self.supabase, season, week)
        index = worm.gsis_index(self.roster)
        gsis_of = {r["ottoneu_id"]: g for r in starters if (g := worm.match_gsis(r, index))}
        weekly_team = dict(self.roster.loc[self.roster["week"] == week, ["gsis_id", "team"]]
                           .itertuples(index=False))
        built = worm.week_game_rows(games, starters, projections, gsis_of, frame, weekly_team,
                                    self.league_id, sources=sources, scheduled=scheduled, adjust=False)

        feeds = {s: sum(1 for v in sources.values() if v == s) for s in ("nflverse", "espn")}
        print(f"{now:%H:%M:%S} week {week}: {feeds['nflverse']} NFL games from nflverse, "
              f"{feeds['espn']} from ESPN, {len(scheduled)} not started")
        changed = []
        for game in games:
            rows = built[game["game_id"]]
            if not rows:
                continue
            digest = fingerprint(rows)
            if self.written.get(game["game_id"]) == digest:
                continue
            last = rows[-1]
            win = f", home win {last['home_win_prob']:.0%}" if last["home_win_prob"] is not None else ""
            print(f"  game {game['game_id']}: {len(rows)} rows, "
                  f"{last['home_points']:.2f}–{last['away_points']:.2f}{win}")
            if not self.dry_run:
                worm.replace_game(self.supabase, self.league_id, game["game_id"], rows)
            self.written[game["game_id"]] = digest
            changed.append(game["game_id"])
        if changed and not self.dry_run:
            revalidate(changed)
        return espn_games


# --- Main --------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Keep the live week's score worms current.")
    parser.add_argument("--league-id", type=int, default=LEAGUE_ID)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--once", action="store_true", help="One pass, then exit.")
    mode.add_argument("--loop", action="store_true", help="Pass every --interval seconds while games are on.")
    parser.add_argument("--interval", type=int, default=60, help="Seconds between passes (default 60).")
    parser.add_argument("--lineup-every", type=int, default=5,
                        help="Scrape Ottoneu's box scores every N passes (default 5).")
    parser.add_argument("--lead", type=int, default=20,
                        help="Keep looping when a game kicks off within this many minutes (default 20).")
    parser.add_argument("--max-minutes", type=int, default=340,
                        help="Stop after this long; pg_cron starts the next job (default 340).")
    parser.add_argument("--dry-run", action="store_true", help="Build and print without writing.")
    args = parser.parse_args()

    supabase = get_supabase_client()
    live = LiveWorm(supabase, args.league_id, args.dry_run)
    started = datetime.now(timezone.utc)
    lead = timedelta(minutes=args.lead)
    passes = 0
    while True:
        now = datetime.now(timezone.utc)
        if args.loop and passes % args.lineup_every == 0 and not args.dry_run:
            try:
                scrape_week(supabase, args.league_id)
            except Exception as exc:  # noqa: BLE001 — stale lineups beat a dead loop
                print(f"  lineup scrape failed: {exc}", file=sys.stderr)
        try:
            espn_games = live.run_pass(now)
        except Exception as exc:  # noqa: BLE001 — a feed blip; try again next pass
            if args.once:
                raise
            print(f"  pass failed: {exc}", file=sys.stderr)
            espn_games = None
        passes += 1

        if espn_games is not None and not args.dry_run:
            upcoming = next_kickoff(espn_games, now)
            write_state(supabase, heartbeat_at=now.isoformat(),
                        next_kickoff=(upcoming or now + IDLE_RECHECK).isoformat())
        if args.once:
            break
        if espn_games is not None and not keep_going(espn_games, now, lead):
            print("No NFL game on or about to start — done.")
            break
        if now - started >= timedelta(minutes=args.max_minutes):
            print(f"Reached {args.max_minutes} minutes — pg_cron will start the next job.")
            break
        time.sleep(max(0.0, args.interval - (datetime.now(timezone.utc) - now).total_seconds()))

    if args.dry_run:
        print("Dry run — not writing to the database.")
    elif args.loop:
        write_state(supabase, heartbeat_at=None)


if __name__ == "__main__":
    main()
