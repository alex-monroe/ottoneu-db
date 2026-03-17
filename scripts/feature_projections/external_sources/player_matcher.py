"""Match FantasyPros player names to player_ids in the players table."""

from __future__ import annotations

import difflib
from typing import Optional

import pandas as pd


# Fuzzy match threshold: SequenceMatcher ratio must exceed this to accept.
_FUZZY_THRESHOLD = 0.82


def _normalize_name(name: str) -> str:
    """Lowercase, strip punctuation noise for consistent comparison."""
    return (
        name.lower()
        .replace(".", "")
        .replace("'", "")
        .replace("-", " ")
        .replace("  ", " ")
        .strip()
    )


def build_player_index(players_df: pd.DataFrame) -> dict[str, list[dict]]:
    """Build a position-keyed index of players for fast lookup.

    Args:
        players_df: DataFrame from the players table with columns:
            id, name, position, nfl_team.

    Returns:
        Dict mapping position → list of {id, name, norm_name, nfl_team}.
    """
    index: dict[str, list[dict]] = {}
    for _, row in players_df.iterrows():
        pos = str(row.get("position", "")).upper()
        entry = {
            "id": str(row["id"]),
            "name": str(row.get("name", "")),
            "norm_name": _normalize_name(str(row.get("name", ""))),
            "nfl_team": str(row.get("nfl_team", "")).upper(),
        }
        index.setdefault(pos, []).append(entry)
    return index


def match_player(
    name: str,
    position: str,
    team: str,
    player_index: dict[str, list[dict]],
    cache: dict[tuple[str, str, str], Optional[str]],
) -> Optional[str]:
    """Map a FantasyPros player entry to a player_id in the players table.

    Strategy:
        1. Cache lookup (avoids repeated work across seasons)
        2. Exact match on normalized name within same position
        3. Fuzzy match on normalized name within same position
        4. Team cross-check to disambiguate multiple fuzzy candidates

    Args:
        name: Player name from FantasyPros.
        position: Position string ('QB', 'RB', 'WR', 'TE').
        team: Team abbreviation from FantasyPros (may be empty).
        player_index: Pre-built index from build_player_index().
        cache: Mutable dict for caching results across calls.

    Returns:
        Player UUID string, or None if no match found.
    """
    cache_key = (name, position, team)
    if cache_key in cache:
        return cache[cache_key]

    pos = position.upper()
    candidates = player_index.get(pos, [])
    norm = _normalize_name(name)
    fp_team = team.upper()

    # 1. Exact match
    exact = [c for c in candidates if c["norm_name"] == norm]
    if len(exact) == 1:
        cache[cache_key] = exact[0]["id"]
        return exact[0]["id"]
    if len(exact) > 1:
        # Multiple exact name matches — use team to disambiguate
        if fp_team:
            team_match = [c for c in exact if c["nfl_team"] == fp_team]
            if len(team_match) == 1:
                cache[cache_key] = team_match[0]["id"]
                return team_match[0]["id"]
        # Ambiguous — skip
        print(f"  WARNING: Ambiguous exact match for '{name}' ({pos}) — skipping")
        cache[cache_key] = None
        return None

    # 2. Fuzzy match
    candidate_norms = [c["norm_name"] for c in candidates]
    matches = difflib.get_close_matches(norm, candidate_norms, n=5, cutoff=_FUZZY_THRESHOLD)
    if not matches:
        print(f"  WARNING: No match for '{name}' ({pos}, {team})")
        cache[cache_key] = None
        return None

    fuzzy_candidates = [c for c in candidates if c["norm_name"] in matches]

    # 3. Team cross-check to narrow down fuzzy candidates
    if fp_team and len(fuzzy_candidates) > 1:
        team_filtered = [c for c in fuzzy_candidates if c["nfl_team"] == fp_team]
        if team_filtered:
            fuzzy_candidates = team_filtered

    if len(fuzzy_candidates) == 1:
        matched = fuzzy_candidates[0]
        print(
            f"  Fuzzy match: '{name}' → '{matched['name']}' ({pos}, {matched['nfl_team']})"
        )
        cache[cache_key] = matched["id"]
        return matched["id"]

    # Still ambiguous — pick best ratio
    best = max(
        fuzzy_candidates,
        key=lambda c: difflib.SequenceMatcher(None, norm, c["norm_name"]).ratio(),
    )
    print(
        f"  Fuzzy match (best): '{name}' → '{best['name']}' ({pos}, {best['nfl_team']})"
    )
    cache[cache_key] = best["id"]
    return best["id"]


def match_dataframe(
    fp_df: pd.DataFrame,
    player_index: dict[str, list[dict]],
) -> pd.DataFrame:
    """Add a player_id column to a FantasyPros projections DataFrame.

    Args:
        fp_df: DataFrame with columns: player_name, position, team.
        player_index: Pre-built index from build_player_index().

    Returns:
        DataFrame with player_id column added. Rows with no match have
        player_id = None.
    """
    cache: dict[tuple[str, str, str], Optional[str]] = {}
    fp_df = fp_df.copy()
    fp_df["player_id"] = fp_df.apply(
        lambda row: match_player(
            row["player_name"],
            row["position"],
            row.get("team", ""),
            player_index,
            cache,
        ),
        axis=1,
    )
    return fp_df
