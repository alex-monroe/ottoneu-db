"""Fetch FantasyPros seasonal consensus projections by position and year."""

from __future__ import annotations

import time
from typing import Any

import pandas as pd
import requests

# FantasyPros projection URL pattern (seasonal/draft projections)
_FP_URL = "https://www.fantasypros.com/nfl/projections/{pos}.php?week=draft&year={year}"

# Positions to fetch and their FantasyPros slug
_POSITIONS = ["qb", "rb", "wr", "te"]

# Request headers to avoid 403s
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Column name mappings from FantasyPros HTML to our normalized names.
# FantasyPros uses nested headers; we join them and normalize.
_QB_COLS = {
    "att": "pass_att",
    "cmp": "pass_cmp",
    "yds": "pass_yds",
    "tds": "pass_tds",
    "ints": "interceptions",
    "att.1": "rush_att",
    "yds.1": "rush_yds",
    "tds.1": "rush_tds",
    "fl": "fumbles",
    "fpts": "fpts",
}

_SKILL_COLS = {
    "att": "rush_att",
    "yds": "rush_yds",
    "tds": "rush_tds",
    "rec": "receptions",
    "tgt": "targets",
    "yds.1": "rec_yds",
    "tds.1": "rec_tds",
    "fl": "fumbles",
    "fpts": "fpts",
}


def _normalize_columns(df: pd.DataFrame, position: str) -> pd.DataFrame:
    """Lowercase and map columns from FP format to our normalized names."""
    df.columns = [str(c).lower().strip() for c in df.columns]
    mapping = _QB_COLS if position == "qb" else _SKILL_COLS
    df = df.rename(columns=mapping)

    # Ensure all expected output columns exist (fill missing with 0)
    for col in [
        "pass_yds", "pass_tds", "interceptions",
        "rush_yds", "rush_tds",
        "receptions", "rec_yds", "rec_tds",
    ]:
        if col not in df.columns:
            df[col] = 0.0

    return df


def _parse_player_team(player_col: str) -> tuple[str, str]:
    """Extract player name and team abbreviation from FP player cell.

    FP formats the player column as 'Player Name TEAM' or just 'Player Name'.
    """
    parts = player_col.strip().rsplit(" ", 1)
    if len(parts) == 2 and parts[1].isupper() and 2 <= len(parts[1]) <= 3:
        return parts[0].strip(), parts[1].strip()
    return player_col.strip(), ""


def fetch_position(position: str, year: int, delay: float = 1.0) -> pd.DataFrame:
    """Fetch FantasyPros projections for one position and year.

    Args:
        position: One of 'qb', 'rb', 'wr', 'te'.
        year: Season year (e.g., 2024).
        delay: Seconds to sleep after the request (be polite to FP).

    Returns:
        DataFrame with columns: player_name, team, position, season,
        pass_yds, pass_tds, interceptions, rush_yds, rush_tds,
        receptions, rec_yds, rec_tds.
        Returns empty DataFrame on failure.
    """
    url = _FP_URL.format(pos=position, year=year)
    print(f"  Fetching {url}")

    try:
        resp = requests.get(url, headers=_HEADERS, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  WARNING: Failed to fetch {url}: {e}")
        return pd.DataFrame()

    try:
        tables = pd.read_html(resp.text, header=[0, 1])
    except Exception as e:
        print(f"  WARNING: Could not parse HTML tables from {url}: {e}")
        return pd.DataFrame()

    if not tables:
        print(f"  WARNING: No tables found at {url}")
        return pd.DataFrame()

    # FantasyPros has one main projection table; take the first.
    df = tables[0].copy()

    # Flatten multi-level column headers
    df.columns = [
        "_".join(str(c).strip() for c in col if "unnamed" not in str(c).lower()).lower()
        if isinstance(col, tuple) else str(col).lower()
        for col in df.columns
    ]

    # Find the player column (usually first column)
    player_col = df.columns[0]

    # Drop header-repeat rows and footer rows
    df = df[df[player_col].notna()]
    df = df[~df[player_col].str.strip().str.lower().isin(["player", ""])]

    # Parse player name + team
    parsed = df[player_col].apply(_parse_player_team)
    df["player_name"] = [p[0] for p in parsed]
    df["team"] = [p[1] for p in parsed]
    df["position"] = position.upper()
    df["season"] = year

    # Normalize remaining stat columns
    df = df.drop(columns=[player_col])
    df = _normalize_columns(df, position)

    # Cast stat columns to numeric
    stat_cols = [
        "pass_yds", "pass_tds", "interceptions",
        "rush_yds", "rush_tds",
        "receptions", "rec_yds", "rec_tds",
    ]
    for col in stat_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    # Keep only relevant columns
    keep = ["player_name", "team", "position", "season"] + stat_cols
    df = df[[c for c in keep if c in df.columns]]

    # Drop rows with no player name
    df = df[df["player_name"].str.strip() != ""]
    df = df.reset_index(drop=True)

    time.sleep(delay)
    return df


def fetch_all_positions(year: int, delay: float = 1.5) -> pd.DataFrame:
    """Fetch projections for all positions for a given year.

    Args:
        year: Season year.
        delay: Seconds between requests per position.

    Returns:
        Combined DataFrame with projections for QB, RB, WR, TE.
    """
    frames: list[pd.DataFrame] = []
    for pos in _POSITIONS:
        df = fetch_position(pos, year, delay=delay)
        if not df.empty:
            frames.append(df)
            print(f"    Got {len(df)} {pos.upper()} projections for {year}")
        else:
            print(f"    WARNING: No {pos.upper()} data for {year}")

    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)
