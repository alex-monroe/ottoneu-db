"""SQLite storage for the league explorer.

Local single-file DB (data/league_explorer/league_explorer.db, gitignored) —
deliberately separate from the shared Supabase project. Roster and finances
rows are dated snapshots so salary evolution accrues across runs; settings,
teams, trophies, and standings are idempotent upserts.
"""

from __future__ import annotations

import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path

DEFAULT_DB_PATH = Path("data/league_explorer/league_explorer.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS leagues (
    league_id        INTEGER PRIMARY KEY,
    name             TEXT,
    established      TEXT,
    established_year INTEGER,
    tier             TEXT,
    is_private       INTEGER,
    num_teams        INTEGER,
    points_system    TEXT,
    roster_settings  TEXT,
    playoff_settings TEXT,
    last_scraped_at  TEXT
);

CREATE TABLE IF NOT EXISTS teams (
    league_id INTEGER NOT NULL,
    team_id   INTEGER NOT NULL,
    name      TEXT,
    owner     TEXT,
    PRIMARY KEY (league_id, team_id)
);

CREATE TABLE IF NOT EXISTS trophies (
    league_id INTEGER NOT NULL,
    team_id   INTEGER NOT NULL,
    season    INTEGER NOT NULL,
    place     TEXT NOT NULL,   -- champion | runner_up | third_place
    PRIMARY KEY (league_id, team_id, season, place)
);

CREATE TABLE IF NOT EXISTS standings (
    league_id      INTEGER NOT NULL,
    season         INTEGER NOT NULL,
    team_id        INTEGER,
    team_name      TEXT NOT NULL,
    division       TEXT,
    wins           INTEGER,
    losses         INTEGER,
    ties           INTEGER,
    points_for     REAL,
    points_against REAL,
    PRIMARY KEY (league_id, season, team_name)
);

CREATE TABLE IF NOT EXISTS roster_slots (
    snapshot_date     TEXT NOT NULL,
    league_id         INTEGER NOT NULL,
    team_id           INTEGER NOT NULL,
    team_name         TEXT,
    ottoneu_player_id INTEGER,
    player_name       TEXT,
    pro_team          TEXT,
    positions         TEXT,
    salary            INTEGER,
    PRIMARY KEY (snapshot_date, league_id, team_id, ottoneu_player_id)
);

CREATE TABLE IF NOT EXISTS finances (
    snapshot_date  TEXT NOT NULL,
    league_id      INTEGER NOT NULL,
    team_name      TEXT NOT NULL,
    players        INTEGER,
    spots          INTEGER,
    salaries       INTEGER,
    cap_penalties  INTEGER,
    incoming_loans INTEGER,
    outgoing_loans INTEGER,
    free_cap_space INTEGER,
    PRIMARY KEY (snapshot_date, league_id, team_name)
);

CREATE TABLE IF NOT EXISTS discovered_leagues (
    league_id     INTEGER PRIMARY KEY,
    source        TEXT,
    discovered_at TEXT
);
"""


def connect(db_path: Path | str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def upsert_league(conn: sqlite3.Connection, settings: dict) -> None:
    conn.execute(
        """INSERT INTO leagues (league_id, name, established, established_year, tier,
                                is_private, num_teams, points_system, roster_settings,
                                playoff_settings, last_scraped_at)
           VALUES (:league_id, :name, :established, :established_year, :tier,
                   :is_private, :num_teams, :points_system, :roster_settings,
                   :playoff_settings, :last_scraped_at)
           ON CONFLICT(league_id) DO UPDATE SET
               name=excluded.name, established=excluded.established,
               established_year=excluded.established_year, tier=excluded.tier,
               is_private=excluded.is_private, num_teams=excluded.num_teams,
               points_system=excluded.points_system,
               roster_settings=excluded.roster_settings,
               playoff_settings=excluded.playoff_settings,
               last_scraped_at=excluded.last_scraped_at""",
        {**settings, "is_private": int(settings.get("is_private") or 0),
         "last_scraped_at": _now()},
    )


def upsert_team(conn: sqlite3.Connection, league_id: int, team_id: int,
                name: str | None, owner: str | None) -> None:
    conn.execute(
        """INSERT INTO teams (league_id, team_id, name, owner)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(league_id, team_id) DO UPDATE SET
               name=COALESCE(excluded.name, name),
               owner=COALESCE(excluded.owner, owner)""",
        (league_id, team_id, name, owner),
    )


def replace_trophies(conn: sqlite3.Connection, league_id: int, team_id: int,
                     trophies: list[dict]) -> None:
    conn.execute("DELETE FROM trophies WHERE league_id=? AND team_id=?",
                 (league_id, team_id))
    conn.executemany(
        "INSERT OR IGNORE INTO trophies (league_id, team_id, season, place) VALUES (?, ?, ?, ?)",
        [(league_id, team_id, t["season"], t["place"]) for t in trophies],
    )


def replace_standings(conn: sqlite3.Connection, league_id: int, season: int,
                      rows: list[dict]) -> None:
    conn.execute("DELETE FROM standings WHERE league_id=? AND season=?",
                 (league_id, season))
    conn.executemany(
        """INSERT OR REPLACE INTO standings
           (league_id, season, team_id, team_name, division, wins, losses, ties,
            points_for, points_against)
           VALUES (:league_id, :season, :team_id, :team_name, :division, :wins,
                   :losses, :ties, :points_for, :points_against)""",
        [{**r, "league_id": league_id, "season": season} for r in rows],
    )


def snapshot_rosters(conn: sqlite3.Connection, league_id: int, rows: list[dict],
                     snapshot_date: str | None = None) -> None:
    day = snapshot_date or date.today().isoformat()
    conn.executemany(
        """INSERT OR REPLACE INTO roster_slots
           (snapshot_date, league_id, team_id, team_name, ottoneu_player_id,
            player_name, pro_team, positions, salary)
           VALUES (:snapshot_date, :league_id, :team_id, :team_name,
                   :ottoneu_player_id, :player_name, :pro_team, :positions,
                   :salary)""",
        [{**r, "snapshot_date": day, "league_id": league_id} for r in rows],
    )


def snapshot_finances(conn: sqlite3.Connection, league_id: int, rows: list[dict],
                      snapshot_date: str | None = None) -> None:
    day = snapshot_date or date.today().isoformat()
    conn.executemany(
        """INSERT OR REPLACE INTO finances
           (snapshot_date, league_id, team_name, players, spots, salaries,
            cap_penalties, incoming_loans, outgoing_loans, free_cap_space)
           VALUES (:snapshot_date, :league_id, :team_name, :players, :spots,
                   :salaries, :cap_penalties, :incoming_loans, :outgoing_loans,
                   :free_cap_space)""",
        [{**r, "snapshot_date": day, "league_id": league_id} for r in rows],
    )


def record_discovered(conn: sqlite3.Connection, league_id: int, source: str) -> None:
    conn.execute(
        """INSERT INTO discovered_leagues (league_id, source, discovered_at)
           VALUES (?, ?, ?) ON CONFLICT(league_id) DO NOTHING""",
        (league_id, source, _now()),
    )


def discovered_league_ids(conn: sqlite3.Connection) -> list[int]:
    return [r["league_id"] for r in
            conn.execute("SELECT league_id FROM discovered_leagues ORDER BY league_id")]
