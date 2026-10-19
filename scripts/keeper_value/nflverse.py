"""nflverse inputs for the keeper model, downloaded once and cached on disk.

The database holds season totals (``nfl_stats``) but no weekly history, and the
backtest has to see each season only up to an "as of" week — the trade
deadline, say — so the weekly files are read straight from nflverse:

- ``stats_player_week_{year}``: per-player, per-game box score + target share.
- ``snap_counts_{year}``: offensive snap share per game (keyed by PFR id).
- ``players``: gsis id ↔ PFR id, birth date, rookie season, draft round.

Completed seasons never change, so their files are cached indefinitely. The
current season's files are re-fetched when older than ``MAX_AGE_HOURS``.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import pandas as pd
import requests

_BASE = "https://github.com/nflverse/nflverse-data/releases/download"
WEEKLY_URL = _BASE + "/stats_player/stats_player_week_{year}.parquet"
SNAPS_URL = _BASE + "/snap_counts/snap_counts_{year}.parquet"
PLAYERS_URL = _BASE + "/players/players.parquet"

# Snap counts start in 2012, so that is the first season with usage features.
FIRST_SEASON = 2012
MAX_AGE_HOURS = 12

SKILL_POSITIONS = ("QB", "RB", "WR", "TE")

_repo_root = Path(__file__).resolve().parents[2]


def cache_dir() -> Path:
    """``$OTTONEU_KEEPER_CACHE`` or ``<repo>/.cache/keeper_value``."""
    env = os.environ.get("OTTONEU_KEEPER_CACHE")
    path = Path(env) if env else _repo_root / ".cache" / "keeper_value"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _fetch(url: str, name: str, refresh: bool) -> Path | None:
    path = cache_dir() / name
    fresh = path.exists() and (time.time() - path.stat().st_mtime) < MAX_AGE_HOURS * 3600
    if path.exists() and (not refresh or fresh):
        return path
    error: Exception | None = None
    data: bytes | None = None
    for attempt in range(3):
        try:
            resp = requests.get(url, timeout=60)
            if resp.status_code == 404:  # a season nflverse has not published yet
                error = RuntimeError("404")
                break
            resp.raise_for_status()
            data = resp.content
            break
        except requests.RequestException as exc:  # a dropped connection: retry
            error = exc
            time.sleep(2 * (attempt + 1))
    if data is None:
        if path.exists():
            return path
        print(f"  nflverse: could not fetch {url} ({error})")
        return None
    # Write then rename, so an interrupted run never leaves a truncated cache file.
    tmp = path.with_suffix(".part")
    tmp.write_bytes(data)
    tmp.replace(path)
    return path


def load_weekly(year: int, current_season: int) -> pd.DataFrame:
    """Regular-season weekly stats for skill players. Empty if unpublished."""
    path = _fetch(WEEKLY_URL.format(year=year), f"weekly_{year}.parquet", refresh=year >= current_season)
    if path is None:
        return pd.DataFrame()
    df = pd.read_parquet(path)
    return df[(df["season_type"] == "REG") & df["position"].isin(SKILL_POSITIONS)].copy()


def load_snaps(year: int, current_season: int) -> pd.DataFrame:
    """Regular-season offensive snap share per player-game. Empty if unpublished."""
    path = _fetch(SNAPS_URL.format(year=year), f"snaps_{year}.parquet", refresh=year >= current_season)
    if path is None:
        return pd.DataFrame()
    df = pd.read_parquet(path)
    df = df[df["game_type"] == "REG"]
    return df[["season", "week", "pfr_player_id", "offense_pct"]].copy()


def load_players(refresh: bool = False) -> pd.DataFrame:
    """The nflverse player file: ids, birth date, rookie season, draft round."""
    path = _fetch(PLAYERS_URL, "players.parquet", refresh=refresh)
    if path is None:
        raise RuntimeError("nflverse players file is unavailable and not cached")
    cols = ["gsis_id", "display_name", "position", "pfr_id", "birth_date",
            "rookie_season", "draft_year", "draft_round", "draft_pick"]
    return pd.read_parquet(path)[cols].copy()
