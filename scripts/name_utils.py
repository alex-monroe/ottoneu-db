"""
Utility functions for normalizing player names across data sources.
"""
import re


def normalize_player_name(name: str) -> str:
    """
    Normalize player name for matching across data sources.

    Removes:
    - Periods (normalizes initials: "D.J." and "DJ" both become "Dj")
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
        >>> normalize_player_name("Josh Allen")
        'Josh Allen'
    """
    # Strip whitespace
    name = name.strip()

    # Strip periods so initials normalize consistently across sources
    # e.g. "D.J. Moore" (nfl_data_py) and "DJ Moore" (Ottoneu) both become "DJ Moore"
    # Suffix regex handles "Jr" without period too (period is optional in pattern)
    name = name.replace('.', '')

    # Remove suffix patterns (case-insensitive, at end of string only)
    # Matches: Jr, Jr., Sr, Sr., II, III, IV, V
    name = re.sub(r'\s+(Jr\.?|Sr\.?|II|III|IV|V)$', '', name, flags=re.IGNORECASE)

    # Normalize whitespace to single space
    name = re.sub(r'\s+', ' ', name)

    # Title case for consistency
    name = name.title()

    return name.strip()
