"""Fetch FantasyPros seasonal consensus projections by position and year."""

from __future__ import annotations

import time

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

# Column name mappings: flattened FP header → our normalized stat name.
# FP uses two-level headers like (PASSING, YDS) which flatten to "passing_yds".
_QB_COLS = {
    "passing_yds": "pass_yds",
    "passing_tds": "pass_tds",
    "passing_ints": "interceptions",
    "rushing_yds": "rush_yds",
    "rushing_tds": "rush_tds",
}

_SKILL_COLS = {
    "rushing_yds": "rush_yds",
    "rushing_tds": "rush_tds",
    "receiving_rec": "receptions",
    "receiving_yds": "rec_yds",
    "receiving_tds": "rec_tds",
}

_STAT_COLS = [
    "pass_yds", "pass_tds", "interceptions",
    "rush_yds", "rush_tds",
    "receptions", "rec_yds", "rec_tds",
]


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

    df = tables[0].copy()

    # Flatten multi-level column headers: (PASSING, YDS) → "passing_yds"
    # Skip "Unnamed" level-0 labels (FP uses those for the player column).
    df.columns = [
        "_".join(
            str(c).strip()
            for c in (col if isinstance(col, tuple) else (col,))
            if "unnamed" not in str(c).lower()
        ).lower()
        for col in df.columns
    ]

    # The first column is always the player column after flattening
    player_col = df.columns[0]

    # Drop header-repeat rows and empty rows
    df = df[df[player_col].notna()]
    df = df[~df[player_col].astype(str).str.strip().str.lower().isin(["player", ""])]

    # Parse player name + team from the player cell
    parsed = df[player_col].astype(str).apply(_parse_player_team)
    df["player_name"] = [p[0] for p in parsed]
    df["team"] = [p[1] for p in parsed]
    df["position"] = position.upper()
    df["season"] = year

    # Apply column mapping to normalized stat names
    mapping = _QB_COLS if position == "qb" else _SKILL_COLS
    df = df.rename(columns=mapping)

    # Ensure all expected stat columns exist (fill missing with 0)
    for col in _STAT_COLS:
        if col not in df.columns:
            df[col] = 0.0

    # Cast stat columns to numeric
    for col in _STAT_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    # Keep only the columns we need
    keep = ["player_name", "team", "position", "season"] + _STAT_COLS
    df = df[keep]

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
