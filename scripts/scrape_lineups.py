"""Scrape each game's box score into `matchup_lineups` — who each team actually played.

Usage:
    just scrape-lineups                     # every game of the live fantasy week
    just scrape-lineups --week 3            # every game of week 3
    just scrape-lineups --dry-run
    just scrape-lineups --game-file game.html --dry-run   # parse a saved page

`league_matchups` (scripts/scrape_matchups.py) knows who played whom and the
team totals. The lineups behind those totals are on Ottoneu's public box score,
/football/{league}/game/{game_id}: both teams' full rosters with lineup slot,
Ottoneu's player id (which joins to players.ottoneu_id), the player's NFL game
state ("Sun 1:00pm @IND" before kickoff, "L 10-13 @SEA" after) and live points.

Plain HTTP with an honest User-Agent, like every other Ottoneu read in this
repo (see scripts/ottoneu_http.py). One request per game — six a run — spaced a
second apart.

What this does NOT take from the page: Ottoneu's "Proj" column. Ottoneu
overwrites it with the actual score once a player has played, so it is not a
pre-game projection. The site's own weekly projection (weekly_projections,
frozen at kickoff) and the live projected total built from it are joined at
read time in web/lib/live-matchup.ts.
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

from scripts.config import LEAGUE_ID, get_supabase_client
from scripts.nfl_week import today_in_league_tz
from scripts.ottoneu_http import CloudflareBlockedError, GatedPageError, fetch_page

TABLE = "matchup_lineups"

USER_AGENT = "ottoneu-db-lineups/1.0 (+https://github.com/alex-monroe/ottoneu-db)"

GAME_PATH = "/football/{league_id}/game/{game_id}"

# Ottoneu's `data-position` slot names -> the short codes stored and displayed.
SLOT_CODES = {
    "QB": "QB",
    "RB": "RB",
    "WR": "WR",
    "TE": "TE",
    "K": "K",
    "Flex": "FLEX",
    "Superflex": "SFLX",
    "Bench": "BN",
}
BENCH = "BN"

STATE_SCHEDULED = "scheduled"
STATE_IN_PROGRESS = "in_progress"
STATE_FINAL = "final"
STATE_BYE = "bye"

_HEADER_RE = re.compile(r"(\d{4})\s+Week\s+(\d+)", re.IGNORECASE)
_TEAM_ID_RE = re.compile(r"/team/(\d+)")
# "Sun 1:00pm @IND" — a kickoff time means the game has not started.
_KICKOFF_RE = re.compile(r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+\d{1,2}:\d{2}\s*[ap]m", re.I)
# "L 10-13 @SEA" / "W 27-3 DAL" / "T 20-20 NYG" — a result means it is over.
_FINAL_RE = re.compile(r"^[WLT]\s+\d+-\d+")

# A run that lands this many seconds apart per game is a polite client.
REQUEST_DELAY = 1.0


class BoxScoreParseError(RuntimeError):
    """Raised when a game page cannot be understood at all."""


# ─── Parsing ─────────────────────────────────────────────────────────────────


def derive_game_state(game_info: str | None, points: float | None) -> str:
    """'scheduled' / 'in_progress' / 'final' / 'bye' from the player's game line.

    Only the two shapes Ottoneu uses at the ends of a game are trusted as
    literals — a kickoff time before, a W/L/T result after. Anything else is a
    game in progress (a live score or clock). With no line at all, points on
    the board are the only evidence the game has started.
    """
    text = (game_info or "").strip()
    if not text:
        return STATE_SCHEDULED if points is None else STATE_IN_PROGRESS
    if text.upper() == "BYE" or text.upper().startswith("BYE "):
        return STATE_BYE
    if _FINAL_RE.match(text):
        return STATE_FINAL
    if _KICKOFF_RE.match(text):
        return STATE_SCHEDULED
    return STATE_IN_PROGRESS


def _points(text: str | None) -> float | None:
    """'9.82' -> 9.82; '---' (not played yet) -> None."""
    try:
        return float((text or "").strip())
    except ValueError:
        return None


def _text(el, separator: str = " ") -> str | None:
    if el is None:
        return None
    value = el.get_text(separator, strip=True)
    return value or None


def _team(details) -> tuple[int | None, str | None]:
    """(team id, name) from a `.home-team-details` / `.away-team-details` block."""
    if details is None:
        return None, None
    link = details.find("a", href=_TEAM_ID_RE)
    if link is None:
        return None, None
    return int(_TEAM_ID_RE.search(link["href"]).group(1)), link.get_text(strip=True)


def _player(td, table) -> dict:
    """One lineup entry from its `td[data-player-id]` cell.

    The page is two lineups interleaved row by row and its `<tr>`s are not
    closed, so html.parser nests every row inside the one before it. Rather than
    walking rows, each field is found by the per-player class Ottoneu stamps on
    it (`player-points-{id}`, `player-game-info-{id}` …), searched within the
    details table so the per-team summary tables further down cannot answer.
    """
    ottoneu_id = int(td["data-player-id"])
    raw_slot = td.get("data-position") or ""
    slot = SLOT_CODES.get(raw_slot, raw_slot.upper() or BENCH)

    desktop = td.find("span", class_="player-link-desktop") or td
    name = _text(desktop.find("a")) or ""
    team_pos = (_text(desktop.find("span", class_="smaller")) or "").split()
    nfl_team = team_pos[0] if team_pos else None
    position = team_pos[1] if len(team_pos) > 1 else None

    info = table.find(class_=f"player-game-info-{ottoneu_id}")
    if info is not None:
        info = info.find(class_="desktop-only") or info
    game_info = _text(info)

    points = _points(_text(table.find(class_=f"player-points-{ottoneu_id}")))

    return {
        "ottoneu_id": ottoneu_id,
        "player_name": name,
        "nfl_team": nfl_team,
        "position": position,
        "slot": slot,
        "slot_number": int(td.get("data-slot-number") or 0),
        "is_starter": slot != BENCH,
        "points": points,
        "game_info": game_info,
        "game_state": derive_game_state(game_info, points),
        "injury_status": _text(desktop.find("span", class_="injury")),
        "stat_line": _text(table.find(class_=f"player-stat-details-{ottoneu_id}"), ", "),
    }


def parse_box_score(html: str) -> dict:
    """Everything the game page says about the two lineups.

    Returns {season, week, home: {team_id, team_name}, away: {...}, players: [...]},
    each player tagged with its `side`. Raises BoxScoreParseError when the page
    has no lineup table — a private league, a login wall, or new markup — so a
    change surfaces as a failed run rather than an empty write.
    """
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", class_="game-details-table")
    if table is None:
        raise BoxScoreParseError(
            "No game-details-table on the page — the league may be private, or the "
            "box score markup changed."
        )

    header = soup.find(string=_HEADER_RE)
    season = week = None
    if header:
        match = _HEADER_RE.search(str(header))
        season, week = int(match.group(1)), int(match.group(2))

    home_id, home_name = _team(soup.find(class_="home-team-details"))
    away_id, away_name = _team(soup.find(class_="away-team-details"))

    players: list[dict] = []
    seen: set[int] = set()
    for td in table.find_all("td", attrs={"data-player-id": True}):
        classes = td.get("class") or []
        if "home-team-position-player" in classes:
            side = "home"
        elif "away-team-position-player" in classes:
            side = "away"
        else:
            continue
        entry = _player(td, table)
        if entry["ottoneu_id"] in seen:
            continue
        seen.add(entry["ottoneu_id"])
        players.append({"side": side, **entry})

    if not players:
        raise BoxScoreParseError("The lineup table has no players in it.")

    return {
        "season": season,
        "week": week,
        "home": {"team_id": home_id, "team_name": home_name},
        "away": {"team_id": away_id, "team_name": away_name},
        "players": players,
    }


# ─── Rows ────────────────────────────────────────────────────────────────────


def to_db_rows(
    parsed: dict,
    game: dict,
    player_ids: dict[int, str],
    league_id: int,
    scraped_at: str,
) -> list[dict]:
    """Shape a parsed box score as `matchup_lineups` rows.

    `game` is the league_matchups row, which owns season, week and the team ids;
    the page's own header is only a fallback for a saved file parsed offline.
    """
    rows = []
    for player in parsed["players"]:
        side = player["side"]
        team_id = game.get(f"{side}_team_id") or parsed[side]["team_id"]
        team_name = game.get(f"{side}_team_name") or parsed[side]["team_name"]
        rows.append({
            "league_id": league_id,
            "season": game.get("season") or parsed["season"],
            "week": game.get("week") or parsed["week"],
            "game_id": game["game_id"],
            "side": side,
            "team_id": team_id,
            "team_name": team_name,
            "ottoneu_id": player["ottoneu_id"],
            "player_id": player_ids.get(player["ottoneu_id"]),
            "player_name": player["player_name"],
            "nfl_team": player["nfl_team"],
            "position": player["position"],
            "slot": player["slot"],
            "slot_number": player["slot_number"],
            "is_starter": player["is_starter"],
            "points": player["points"],
            "game_info": player["game_info"],
            "game_state": player["game_state"],
            "injury_status": player["injury_status"],
            "stat_line": player["stat_line"],
            "scraped_at": scraped_at,
        })
    return rows


def missing_team_ids(rows: list[dict]) -> list[str]:
    return sorted({f"game {r['game_id']} {r['side']}" for r in rows if r["team_id"] is None})


# ─── Database ────────────────────────────────────────────────────────────────


def games_for_week(supabase, league_id: int, week: int | None) -> list[dict]:
    """league_matchups rows to scrape: one week's, or the live fantasy week's.

    The live week is the one whose date window contains today (ET). Ottoneu's
    windows run Wednesday through Tuesday, so Tuesday morning's run still lands
    in the week that Monday night finished — which is when its last points post.
    """
    query = (
        supabase.table("league_matchups")
        .select("game_id, season, week, home_team_id, home_team_name, away_team_id, "
                "away_team_name, starts_on, ends_on")
        .eq("league_id", league_id)
        .order("season", desc=True)
        .order("game_id")
        .limit(400)  # pagination-safe: a league-season is ~90 games
    )
    rows = query.execute().data or []
    if not rows:
        return []
    season = rows[0]["season"]
    rows = [r for r in rows if r["season"] == season]

    if week is not None:
        return [r for r in rows if r["week"] == week]

    today = today_in_league_tz().isoformat()
    return [
        r for r in rows
        if r.get("starts_on") and r.get("ends_on") and r["starts_on"] <= today <= r["ends_on"]
    ]


def resolve_player_ids(supabase, ottoneu_ids: list[int]) -> dict[int, str]:
    """ottoneu_id -> players.id for the ids on the page (a few dozen per game)."""
    if not ottoneu_ids:
        return {}
    data = (
        supabase.table("players")
        .select("id, ottoneu_id")
        .in_("ottoneu_id", sorted(set(ottoneu_ids)))
        .limit(999)  # pagination-safe: bounded by the ids on one week's box scores
        .execute()
        .data
        or []
    )
    return {int(r["ottoneu_id"]): str(r["id"]) for r in data}


def replace_game(supabase, league_id: int, game_id: int, rows: list[dict]) -> None:
    """Upsert a game's lineup, then drop anyone no longer in it.

    Upsert-then-prune rather than delete-then-insert, so a failure between the
    two steps leaves a stale-but-complete lineup rather than an empty one.
    """
    supabase.table(TABLE).upsert(rows, on_conflict="league_id,game_id,ottoneu_id").execute()
    current = [r["ottoneu_id"] for r in rows]
    (
        supabase.table(TABLE)
        .delete()
        .eq("league_id", league_id)
        .eq("game_id", game_id)
        .not_.in_("ottoneu_id", current)
        .execute()
    )


# ─── Entry point ─────────────────────────────────────────────────────────────


def _summarise(rows: list[dict]) -> str:
    starters = [r for r in rows if r["is_starter"]]
    states: dict[str, int] = {}
    for r in starters:
        states[r["game_state"]] = states.get(r["game_state"], 0) + 1
    unmatched = sum(1 for r in rows if r["player_id"] is None)
    parts = ", ".join(f"{n} {s}" for s, n in sorted(states.items()))
    return f"{len(starters)} starters ({parts}), {len(rows) - len(starters)} bench" + (
        f", {unmatched} not in players" if unmatched else ""
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape Ottoneu box scores into matchup_lineups."
    )
    parser.add_argument("--league-id", type=int, default=LEAGUE_ID)
    parser.add_argument("--week", type=int, help="Scrape this week (default: the live week).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse and print without writing to the database.")
    parser.add_argument("--cookie", help="Raw Cookie header (or set OTTONEU_COOKIE).")
    parser.add_argument("--game-file", help="Parse a saved game page instead of fetching.")
    args = parser.parse_args()

    if args.game_file:
        with open(args.game_file, encoding="utf-8") as handle:
            parsed = parse_box_score(handle.read())
        rows = to_db_rows(parsed, {"game_id": 0}, {}, args.league_id, "")
        print(f"{parsed['home']['team_name']} vs {parsed['away']['team_name']}: {_summarise(rows)}")
        for r in rows:
            print(f"  {r['side']:<4} {r['slot']:<4} {r['player_name']:<24} "
                  f"{r['points'] if r['points'] is not None else '---':>6}  "
                  f"[{r['game_state']}] {r['game_info'] or ''}")
        return

    supabase = get_supabase_client()
    games = games_for_week(supabase, args.league_id, args.week)
    if not games:
        print("No games to scrape — no stored week covers today. Pass --week to backfill.")
        return

    week = games[0]["week"]
    print(f"Scraping {len(games)} box scores for week {week}")
    scraped_at = datetime.now(timezone.utc).isoformat()
    failures = 0

    for index, game in enumerate(games):
        if index:
            time.sleep(REQUEST_DELAY)
        path = GAME_PATH.format(league_id=args.league_id, game_id=game["game_id"])
        try:
            parsed = parse_box_score(fetch_page(path, USER_AGENT, cookie=args.cookie))
        except (requests.RequestException, CloudflareBlockedError, GatedPageError,
                BoxScoreParseError) as exc:
            print(f"  game {game['game_id']}: {exc}", file=sys.stderr)
            failures += 1
            continue

        player_ids = resolve_player_ids(supabase, [p["ottoneu_id"] for p in parsed["players"]])
        rows = to_db_rows(parsed, game, player_ids, args.league_id, scraped_at)
        missing = missing_team_ids(rows)
        if missing:
            print(f"  game {game['game_id']}: no team id for {missing} — skipped", file=sys.stderr)
            failures += 1
            continue

        print(f"  {game['home_team_name']} vs {game['away_team_name']}: {_summarise(rows)}")
        if not args.dry_run:
            replace_game(supabase, args.league_id, game["game_id"], rows)

    if args.dry_run:
        print("Dry run — not writing to the database.")
    if failures:
        print(f"{failures} of {len(games)} games failed.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
