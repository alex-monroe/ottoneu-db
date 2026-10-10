"""
Player-name normalization and matching across data sources — the ONE place.

Every pipeline that maps an outside name (nflverse, Sleeper, Draft Sharks, NGS,
...) to a row in our players table goes through `normalize_player_name`, so a
fix here (a new alias, a punctuation rule) reaches all of them. There used to be
a second normalizer in feature_projections/external_sources/player_matcher.py
that the weekly Sleeper ingest used; it never read NAME_ALIASES, so the "Cam
Ward" alias added for the stats pipelines in #400 did nothing for the weekly
board and Cam Ward silently had no projection (#749). Don't add another.

    normalize_player_name  canonical form, for exact dict lookups
    build_player_index /   exact-then-fuzzy matching with a team cross-check,
      match_player         for sources whose spellings drift (Sleeper)
"""
from __future__ import annotations

import difflib
import re
from typing import Iterable, Mapping, Optional

# Bolt Optimization: Pre-compile regexes used in hot loops
SUFFIX_REGEX = re.compile(r'\s+(Jr\.?|Sr\.?|II|III|IV|V)$', flags=re.IGNORECASE)
WHITESPACE_REGEX = re.compile(r'\s+')

# Canonical name aliases: maps alternate names to the canonical form used in Ottoneu.
# Applied AFTER normalization, so keys must be in normalized form: title case,
# no periods / apostrophes / hyphens, no suffixes. Add entries when a player's
# common/NFL name differs from their Ottoneu name — the weekly ingest's coverage
# check (scripts/weekly_projections/ingest.py) reports these.
NAME_ALIASES: dict[str, str] = {
    "Cam Ward": "Cameron Ward",
    "Cameron Skattebo": "Cam Skattebo",
    "Marquise Brown": "Hollywood Brown",  # Sleeper's spelling; flagged by the ingest coverage check
}


def normalize_player_name(name: str) -> str:
    """
    Normalize player name for matching across data sources.

    Removes:
    - Periods (normalizes initials: "D.J." and "DJ" both become "Dj")
    - Apostrophes ("Ja'Marr" and "JaMarr" both become "Jamarr")
    - Hyphens, as a space ("Smith-Schuster" and "Smith Schuster" agree)
    - Suffixes: Jr, Jr., Sr, Sr., II, III, IV, V
    - Extra whitespace
    - Case differences (convert to title case)

    Args:
        name: Raw player name from any source

    Returns:
        Normalized name suitable for matching

    Examples:
        >>> normalize_player_name("D.J. Moore")
        'Dj Moore'
        >>> normalize_player_name("DJ Moore")
        'Dj Moore'
        >>> normalize_player_name("Oronde Gadsden II")
        'Oronde Gadsden'
        >>> normalize_player_name("Marvin Harrison Jr.")
        'Marvin Harrison'
        >>> normalize_player_name("Ja'Marr Chase")
        'Jamarr Chase'
        >>> normalize_player_name("Josh Allen")
        'Josh Allen'
    """
    # Strip whitespace
    name = name.strip()

    # Strip periods so initials normalize consistently across sources
    # e.g. "D.J. Moore" (nfl_data_py) and "DJ Moore" (Ottoneu) both become "DJ Moore"
    # Suffix regex handles "Jr" without period too (period is optional in pattern)
    name = name.replace('.', '')

    # Apostrophes vary by source (and by curly vs straight quote); hyphenated
    # surnames are sometimes written with a space. Neither tells players apart.
    name = name.replace("'", '').replace('\u2019', '').replace('-', ' ')

    # Remove suffix patterns (case-insensitive, at end of string only)
    # Matches: Jr, Jr., Sr, Sr., II, III, IV, V
    name = SUFFIX_REGEX.sub('', name)

    # Normalize whitespace to single space
    name = WHITESPACE_REGEX.sub(' ', name)

    # Title case for consistency
    name = name.title()

    name = name.strip()

    # Apply canonical name aliases for known mismatches between sources
    name = NAME_ALIASES.get(name, name)

    return name


# --- Matching ---------------------------------------------------------------

# Fuzzy match threshold: SequenceMatcher ratio must exceed this to accept.
_FUZZY_THRESHOLD = 0.82


def match_key(name: str) -> str:
    """Comparison key for matching: the canonical name, case-folded."""
    return normalize_player_name(name).casefold()


def build_player_index(players: Iterable[Mapping] | object) -> dict[str, list[dict]]:
    """Build a position-keyed index of our players for `match_player`.

    Args:
        players: Rows of the players table (a list of dicts, or a DataFrame)
            with id, name, position, nfl_team.

    Returns:
        Dict mapping position -> list of {id, name, norm_name, nfl_team}.
    """
    if hasattr(players, "to_dict"):  # a pandas DataFrame
        players = players.to_dict("records")
    index: dict[str, list[dict]] = {}
    for row in players:
        name = str(row.get("name") or "")
        entry = {
            "id": str(row["id"]),
            "name": name,
            "norm_name": match_key(name),
            "nfl_team": str(row.get("nfl_team") or "").upper(),
        }
        index.setdefault(str(row.get("position") or "").upper(), []).append(entry)
    return index


def match_player(
    name: str,
    position: str,
    team: str,
    player_index: dict[str, list[dict]],
    cache: dict[tuple[str, str, str], Optional[str]],
    verbose: bool = True,
) -> Optional[str]:
    """Map an outside source's player to a player_id in our players table.

    Strategy:
        1. Cache lookup
        2. Exact match on the normalized name (aliases applied) within position
        3. Fuzzy match on the normalized name within position
        4. Team cross-check to disambiguate multiple candidates

    Args:
        name: Player name as the source spells it.
        position: Position string ('QB', 'RB', 'WR', 'TE', 'K').
        team: The source's team abbreviation (may be empty).
        player_index: Pre-built index from build_player_index().
        cache: Mutable dict for caching results across calls.
        verbose: Print a line per miss / fuzzy match. Callers matching a whole
            source database (most of it long-retired players) pass False for
            rows they don't care about, so real misses aren't buried.

    Returns:
        Player UUID string, or None if no match found.
    """
    log = print if verbose else (lambda *_a, **_k: None)

    cache_key = (name, position, team)
    if cache_key in cache:
        return cache[cache_key]

    pos = position.upper()
    candidates = player_index.get(pos, [])
    norm = match_key(name)
    src_team = team.upper()

    # 1. Exact match
    exact = [c for c in candidates if c["norm_name"] == norm]
    if len(exact) == 1:
        cache[cache_key] = exact[0]["id"]
        return exact[0]["id"]
    if len(exact) > 1:
        # Multiple exact name matches — use team to disambiguate
        if src_team:
            team_match = [c for c in exact if c["nfl_team"] == src_team]
            if len(team_match) == 1:
                cache[cache_key] = team_match[0]["id"]
                return team_match[0]["id"]
        log(f"  WARNING: Ambiguous exact match for '{name}' ({pos}) — skipping")
        cache[cache_key] = None
        return None

    # 2. Fuzzy match
    candidate_norms = [c["norm_name"] for c in candidates]
    matches = difflib.get_close_matches(norm, candidate_norms, n=5, cutoff=_FUZZY_THRESHOLD)
    if not matches:
        log(f"  WARNING: No match for '{name}' ({pos}, {team})")
        cache[cache_key] = None
        return None

    fuzzy_candidates = [c for c in candidates if c["norm_name"] in matches]

    # 3. Team cross-check to narrow down fuzzy candidates
    if src_team and len(fuzzy_candidates) > 1:
        team_filtered = [c for c in fuzzy_candidates if c["nfl_team"] == src_team]
        if team_filtered:
            fuzzy_candidates = team_filtered

    if len(fuzzy_candidates) == 1:
        matched = fuzzy_candidates[0]
        log(f"  Fuzzy match: '{name}' → '{matched['name']}' ({pos}, {matched['nfl_team']})")
        cache[cache_key] = matched["id"]
        return matched["id"]

    # Still ambiguous — pick best ratio
    best = max(
        fuzzy_candidates,
        key=lambda c: difflib.SequenceMatcher(None, norm, c["norm_name"]).ratio(),
    )
    log(f"  Fuzzy match (best): '{name}' → '{best['name']}' ({pos}, {best['nfl_team']})")
    cache[cache_key] = best["id"]
    return best["id"]

