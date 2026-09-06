"""Scrape the league's head-to-head schedule and results into `league_matchups`.

Usage:
    just scrape-matchups                    # current season, write
    just scrape-matchups --dry-run
    just scrape-matchups --week 3           # print/write only one week
    just scrape-matchups --schedule-file schedule.html --csv-file schedule.csv

Two public pages, no browser and no login (see scripts/ottoneu_http.py for why
an honest User-Agent is the thing that gets through Cloudflare):

  /football/{league}/schedule       the authoritative game list — week numbers,
                                    the week's date window, each game's status
                                    label, and the playoff/championship icons
  /football/{league}/csv/schedule   the same games as clean CSV, and the only
                                    source of Ottoneu's numeric **team ids**

The HTML page leads because it carries the week structure and can list a game
before the CSV export catches up; the CSV supplies team ids (matched by name)
and is a cross-check on the scores. Either source alone is enough to produce
rows, so a change to one does not take the feature down.

Ottoneu publishes the whole regular-season schedule before kickoff, so the
first run of the season writes every game at 0-0 / 'scheduled' and later runs
update those same rows in place — the upsert conflicts on (league_id, game_id).

This script does NOT compute standings. Wins, points for/against and the playoff
seeding are derived from these rows at read time (web/lib/standings.ts) so that
a half-played Sunday shows live standings rather than yesterday's.
"""

from __future__ import annotations

import argparse
import csv
import io
import re
import sys
from datetime import date, datetime, timezone

import requests
from bs4 import BeautifulSoup

from scripts.config import LEAGUE_ID, get_supabase_client
from scripts.ottoneu_http import CloudflareBlockedError, GatedPageError, fetch_page

TABLE = "league_matchups"

USER_AGENT = "ottoneu-db-matchups/1.0 (+https://github.com/alex-monroe/ottoneu-db)"

SCHEDULE_PATH = "/football/{league_id}/schedule"
SCHEDULE_CSV_PATH = "/football/{league_id}/csv/schedule"

# "The SOFA 2026 Schedule" — the page header is where the season label lives.
_SEASON_RE = re.compile(r"(\d{4})\s+Schedule", re.IGNORECASE)
_WEEK_RE = re.compile(r"Week\s+(\d+)", re.IGNORECASE)
# "September 9 to September 15"
_WEEK_RANGE_RE = re.compile(
    r"([A-Za-z]{3,9})\s+(\d{1,2})\s+to\s+([A-Za-z]{3,9})\s+(\d{1,2})"
)
_GAME_ID_RE = re.compile(r"game-(\d+)")

# Ottoneu marks postseason games with an icon class on the status line. Anything
# in a week that has such a game but carries no icon of its own is the
# consolation bracket, which the league runs alongside the playoffs.
_GAME_TYPE_BY_CLASS = {
    "game-label-championship": "championship",
    "game-label-third-place": "third_place",
    "game-label-playoff": "playoff",
}
POSTSEASON_TYPES = frozenset({"playoff", "championship", "third_place", "consolation"})

STATUS_FINAL = "final"
STATUS_IN_PROGRESS = "in_progress"
STATUS_SCHEDULED = "scheduled"


class ScheduleParseError(RuntimeError):
    """Raised when the schedule page cannot be understood at all."""


# ─── Parsing ─────────────────────────────────────────────────────────────────


def _month_number(name: str) -> int | None:
    for fmt in ("%B", "%b"):
        try:
            return datetime.strptime(name, fmt).month
        except ValueError:
            continue
    return None


def _week_date(month_name: str, day: int, season: int) -> str | None:
    """ISO date for a week-window endpoint printed without a year.

    An Ottoneu season label spans two calendar years — the 2026 season's Week 18
    is played in January 2027 — so the year is inferred from the month rather
    than assumed to be the season. August is the earliest month a fantasy week
    can open, which makes it the natural split point.
    """
    month = _month_number(month_name)
    if month is None:
        return None
    year = season if month >= 8 else season + 1
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def _score(text: str) -> float | None:
    try:
        return float(text.strip())
    except (TypeError, ValueError):
        return None


def _team_from_div(div) -> tuple[str, float | None]:
    """(team name, score) from an `.other-game-{home,away}-team` div.

    The score lives in a nested <span>, so it is extracted and then removed
    before reading the name — otherwise every team would be called
    "Irish Invasion0.00".
    """
    span = div.find("span")
    score = _score(span.get_text(strip=True)) if span else None
    if span:
        span.extract()
    return div.get_text(" ", strip=True), score


def parse_schedule(html: str) -> tuple[int, list[dict]]:
    """(season, games) from the schedule page.

    Games carry everything the page knows: week, the week's date window, both
    team names and scores, the verbatim status label, and the postseason type.
    Team ids are NOT here — `parse_schedule_csv` supplies those.
    """
    soup = BeautifulSoup(html, "html.parser")

    header = soup.find(string=_SEASON_RE)
    if not header:
        raise ScheduleParseError(
            "No '<year> Schedule' header on the page — the league may be private, "
            "or the page markup changed."
        )
    season = int(_SEASON_RE.search(str(header)).group(1))

    games: list[dict] = []
    for block in soup.find_all("ul", class_="other-games"):
        week, starts_on, ends_on = _week_context(block, season)
        for item in block.find_all("li"):
            game = _parse_game(item, week, starts_on, ends_on)
            if game:
                games.append(game)

    _mark_consolation(games)
    return season, games


def _week_context(block, season: int) -> tuple[int | None, str | None, str | None]:
    """Week number and date window for a slate, from the header above it."""
    container = block.find_parent("div", class_="table-container") or block.parent
    header = container.find("header") if container else None
    if not header:
        return None, None, None

    week_text = header.find(["h2", "h3"])
    week_match = _WEEK_RE.search(header.get_text(" ", strip=True)) if week_text else None
    week = int(week_match.group(1)) if week_match else None

    range_match = _WEEK_RANGE_RE.search(header.get_text(" ", strip=True))
    if not range_match:
        return week, None, None
    starts_on = _week_date(range_match.group(1), int(range_match.group(2)), season)
    ends_on = _week_date(range_match.group(3), int(range_match.group(4)), season)
    return week, starts_on, ends_on


def _parse_game(item, week: int | None, starts_on: str | None,
                ends_on: str | None) -> dict | None:
    """One `<li id="game-1234">` slate entry, or None if it is not a game."""
    id_match = _GAME_ID_RE.search(item.get("id") or "")
    if not id_match:
        return None

    home_div = item.find("div", class_="other-game-home-team")
    away_div = item.find("div", class_="other-game-away-team")
    if not home_div or not away_div:
        return None

    status_div = item.find("div", class_="game-status")
    game_type = "regular"
    status_label = None
    if status_div:
        for icon in status_div.find_all("i"):
            for cls in icon.get("class", []):
                if cls in _GAME_TYPE_BY_CLASS:
                    game_type = _GAME_TYPE_BY_CLASS[cls]
        status_label = status_div.get_text(" ", strip=True) or None

    home_name, home_score = _team_from_div(home_div)
    away_name, away_score = _team_from_div(away_div)

    return {
        "game_id": int(id_match.group(1)),
        "week": week,
        "starts_on": starts_on,
        "ends_on": ends_on,
        "home_team_name": home_name,
        "home_score": home_score,
        "away_team_name": away_name,
        "away_score": away_score,
        "status_label": status_label,
        "game_type": game_type,
        "status": _derive_status(status_label, home_score, away_score),
    }


def _derive_status(label: str | None, home: float | None, away: float | None) -> str:
    """'final' / 'in_progress' / 'scheduled' from what the page shows.

    Only "Final" is trusted as a literal — every other label Ottoneu prints is a
    date or a clock we would have to keep guessing at. Otherwise the scores
    decide: any points on the board means somebody's players have played.
    """
    if (label or "").strip().lower().endswith("final"):
        return STATUS_FINAL
    if (home or 0) > 0 or (away or 0) > 0:
        return STATUS_IN_PROGRESS
    return STATUS_SCHEDULED


def _mark_consolation(games: list[dict]) -> None:
    """Relabel unmarked games in a postseason week as the consolation bracket.

    Ottoneu badges only the games that matter for the title — in a playoff week
    the other pairings are the consolation bracket, and they are drawn exactly
    like regular-season games. Left as 'regular' they would count toward the
    standings, which is the whole reason this distinction is stored.
    """
    postseason_weeks = {
        g["week"] for g in games
        if g["game_type"] in POSTSEASON_TYPES and g["week"] is not None
    }
    for game in games:
        if game["week"] in postseason_weeks and game["game_type"] == "regular":
            game["game_type"] = "consolation"


def parse_schedule_csv(text: str) -> list[dict]:
    """Rows from the /csv/schedule export — the only source of numeric team ids."""
    rows: list[dict] = []
    for row in csv.DictReader(io.StringIO(text)):
        try:
            rows.append({
                "game_id": int(row["Game ID"]),
                "week": int(row["Week ID"]),
                "home_team_id": int(row["Home Team ID"]),
                "home_team_name": row["Home Team Name"].strip(),
                "home_score": _score(row["Home Team Score"]),
                "away_team_id": int(row["Away Team ID"]),
                "away_team_name": row["Away Team Name"].strip(),
                "away_score": _score(row["Away Team Score"]),
            })
        except (KeyError, TypeError, ValueError):
            continue  # a header change or a blank trailing line, not a game
    return rows


def merge(html_games: list[dict], csv_rows: list[dict]) -> tuple[list[dict], list[str]]:
    """Combine the two sources into rows ready for the database.

    The HTML page owns the game list, week structure and status; the CSV owns
    team ids. Games the CSV knows but the page does not are carried over too, so
    neither source going quiet loses a game. Returns (rows, warnings).
    """
    by_id = {row["game_id"]: row for row in csv_rows}
    # Team ids are per-league and stable, so a name seen anywhere in the CSV
    # resolves that team in any game — including one the CSV has not listed yet.
    team_ids: dict[str, int] = {}
    for row in csv_rows:
        team_ids[row["home_team_name"]] = row["home_team_id"]
        team_ids[row["away_team_name"]] = row["away_team_id"]

    rows: list[dict] = []
    warnings: list[str] = []

    for game in html_games:
        csv_row = by_id.get(game["game_id"], {})
        home_id = csv_row.get("home_team_id", team_ids.get(game["home_team_name"]))
        away_id = csv_row.get("away_team_id", team_ids.get(game["away_team_name"]))
        if home_id is None or away_id is None:
            warnings.append(
                f"game {game['game_id']}: no team id for "
                f"{game['home_team_name']!r} vs {game['away_team_name']!r} — skipped"
            )
            continue
        if game["week"] is None:
            warnings.append(f"game {game['game_id']}: no week number found — skipped")
            continue
        rows.append({**game, "home_team_id": home_id, "away_team_id": away_id})

    seen = {row["game_id"] for row in rows}
    for game_id, csv_row in by_id.items():
        if game_id in seen:
            continue
        warnings.append(f"game {game_id}: in the CSV but not on the schedule page")
        rows.append({
            **csv_row,
            "starts_on": None,
            "ends_on": None,
            "status_label": None,
            "game_type": "regular",
            "status": _derive_status(None, csv_row["home_score"], csv_row["away_score"]),
        })

    rows.sort(key=lambda r: (r["week"], r["game_id"]))
    return rows, warnings


# ─── Fetching + writing ──────────────────────────────────────────────────────


def fetch_schedule_html(league_id: int = LEAGUE_ID, cookie: str | None = None) -> str:
    return fetch_page(SCHEDULE_PATH.format(league_id=league_id), USER_AGENT, cookie=cookie)


def fetch_schedule_csv(league_id: int = LEAGUE_ID, cookie: str | None = None) -> str:
    return fetch_page(
        SCHEDULE_CSV_PATH.format(league_id=league_id), USER_AGENT,
        cookie=cookie, accept="text/csv, */*",
    )


def to_db_rows(rows: list[dict], league_id: int, season: int) -> list[dict]:
    """Shape merged games as `league_matchups` rows."""
    now = datetime.now(timezone.utc).isoformat()
    return [{
        "league_id": league_id,
        "season": season,
        "week": row["week"],
        "game_id": row["game_id"],
        "home_team_id": row["home_team_id"],
        "home_team_name": row["home_team_name"],
        "home_score": row["home_score"],
        "away_team_id": row["away_team_id"],
        "away_team_name": row["away_team_name"],
        "away_score": row["away_score"],
        "status": row["status"],
        "game_type": row["game_type"],
        "starts_on": row.get("starts_on"),
        "ends_on": row.get("ends_on"),
        "status_label": row.get("status_label"),
        "scraped_at": now,
        "updated_at": now,
    } for row in rows]


def _summarise(rows: list[dict]) -> str:
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    return ", ".join(f"{n} {status}" for status, n in sorted(counts.items()))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape Ottoneu head-to-head matchups into league_matchups."
    )
    parser.add_argument("--league-id", type=int, default=LEAGUE_ID)
    parser.add_argument("--week", type=int, help="Limit the write to one week.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse and print without writing to the database.")
    parser.add_argument("--cookie", help="Raw Cookie header (or set OTTONEU_COOKIE).")
    parser.add_argument("--schedule-file", help="Parse a saved schedule page instead of fetching.")
    parser.add_argument("--csv-file", help="Parse a saved /csv/schedule export instead of fetching.")
    args = parser.parse_args()

    try:
        if args.schedule_file:
            print(f"Parsing saved schedule page: {args.schedule_file}")
            with open(args.schedule_file, encoding="utf-8") as handle:
                html = handle.read()
        else:
            print(f"Scraping schedule: {SCHEDULE_PATH.format(league_id=args.league_id)}")
            html = fetch_schedule_html(args.league_id, cookie=args.cookie)

        if args.csv_file:
            with open(args.csv_file, encoding="utf-8") as handle:
                csv_text = handle.read()
        else:
            csv_text = fetch_schedule_csv(args.league_id, cookie=args.cookie)
    except (requests.RequestException, CloudflareBlockedError, GatedPageError, OSError) as exc:
        print(f"Fetch failed: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        season, html_games = parse_schedule(html)
    except ScheduleParseError as exc:
        print(f"Parse failed: {exc}", file=sys.stderr)
        sys.exit(1)

    rows, warnings = merge(html_games, parse_schedule_csv(csv_text))
    for warning in warnings:
        print(f"  warning: {warning}", file=sys.stderr)

    if args.week is not None:
        rows = [row for row in rows if row["week"] == args.week]

    if not rows:
        print("No games found — nothing to write.", file=sys.stderr)
        sys.exit(1)

    weeks = sorted({row["week"] for row in rows})
    print(f"{season} season: {len(rows)} games across weeks {weeks[0]}-{weeks[-1]} "
          f"({_summarise(rows)})")
    for row in rows:
        if row["status"] != STATUS_SCHEDULED:
            print(f"  W{row['week']:>2} {row['home_team_name']} {row['home_score']} - "
                  f"{row['away_score']} {row['away_team_name']} [{row['status']}]")

    if args.dry_run:
        print("Dry run — not writing to the database.")
        return

    supabase = get_supabase_client()
    supabase.table(TABLE).upsert(
        to_db_rows(rows, args.league_id, season), on_conflict="league_id,game_id"
    ).execute()
    print(f"Upserted {len(rows)} rows into {TABLE} for league {args.league_id}, "
          f"season {season}.")


if __name__ == "__main__":
    main()
