"""QB starter designations loader.

Reads manual QB starter designations from data/qb_starters.json and resolves
player names to IDs for use in the projection pipeline.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pandas as pd

from scripts.name_utils import normalize_player_name

_DATA_PATH = Path(__file__).parent.parent.parent / "data" / "qb_starters.json"

# Module-level cache to avoid re-reading the file
_cache: dict[str, Any] | None = None


def _load_raw() -> dict[str, Any]:
    """Load and cache the raw JSON file."""
    global _cache
    if _cache is not None:
        return _cache

    if not _DATA_PATH.exists():
        _cache = {}
        return _cache

    with open(_DATA_PATH, "r") as f:
        _cache = json.load(f)
    return _cache


def clear_cache() -> None:
    """Clear the module-level cache (useful for testing)."""
    global _cache
    _cache = None


def load_qb_starters(season: int) -> dict[str, dict[str, str]]:
    """Load QB starter designations for a given season.

    Returns dict mapping team abbreviation -> {player_name, confidence, notes}.
    Returns empty dict if season not found.
    """
    data = _load_raw()
    return data.get(str(season), {})


def resolve_starter_ids(
    starters: dict[str, dict[str, str]],
    players_df: pd.DataFrame,
) -> dict[str, str | None]:
    """Resolve starter player names to player IDs.

    Args:
        starters: Dict from load_qb_starters(), mapping team -> {player_name, ...}.
        players_df: DataFrame with columns player_id_ref, position, nfl_team,
                     and a name-like column (display_name or player_name).

    Returns:
        Dict mapping team abbreviation -> player_id (or None if not resolved).
    """
    if not starters or players_df.empty:
        return {}

    # Build a lookup of normalized name -> player_id for QBs
    qbs = players_df[players_df["position"] == "QB"].copy()

    # Find the name column in the DataFrame
    name_col = None
    for col in ["name", "display_name", "player_name"]:
        if col in qbs.columns:
            name_col = col
            break

    if name_col is None:
        return {}

    # Build normalized name -> player_id mapping
    name_to_id: dict[str, str] = {}
    for _, row in qbs.iterrows():
        name = row.get(name_col)
        pid = row.get("player_id_ref")
        if name and pid and pd.notna(name):
            normalized = normalize_player_name(str(name))
            name_to_id[normalized] = str(pid)

    resolved: dict[str, str | None] = {}
    for team, info in starters.items():
        player_name = info.get("player_name", "")
        if not player_name:
            resolved[team] = None
            continue

        normalized = normalize_player_name(player_name)
        resolved[team] = name_to_id.get(normalized)

    return resolved


def get_all_starter_ids(
    seasons: list[int],
    players_df: pd.DataFrame,
) -> dict[int, dict[str, str | None]]:
    """Load and resolve QB starters for multiple seasons.

    Returns dict mapping season -> {team -> player_id}.
    """
    result: dict[int, dict[str, str | None]] = {}
    for season in seasons:
        starters = load_qb_starters(season)
        if starters:
            result[season] = resolve_starter_ids(starters, players_df)
    return result


def is_qb_starter(
    player_id: str,
    season: int,
    all_starters: dict[int, dict[str, str | None]],
) -> bool:
    """Check if a player is a designated QB starter for a given season."""
    season_starters = all_starters.get(season)
    if not season_starters:
        return False
    return player_id in season_starters.values()
