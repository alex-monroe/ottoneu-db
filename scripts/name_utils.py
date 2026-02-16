"""
Utility functions for normalizing player names across data sources.
"""
import re


def normalize_player_name(name: str) -> str:
    """
    Normalize player name for matching across data sources.

    Removes:
    - Suffixes: Jr, Jr., Sr, Sr., II, III, IV, V
    - Extra whitespace
    - Case differences (convert to title case)

    Args:
        name: Raw player name from any source

    Returns:
        Normalized name suitable for matching

    Examples:
        >>> normalize_player_name("Oronde Gadsden II")
        'Oronde Gadsden'
        >>> normalize_player_name("Marvin Harrison Jr.")
        'Marvin Harrison'
        >>> normalize_player_name("Patrick Jones II")
        'Patrick Jones'
        >>> normalize_player_name("Velus Jones Jr.")
        'Velus Jones'
        >>> normalize_player_name("Josh Allen")
        'Josh Allen'
    """
    # Strip whitespace
    name = name.strip()

    # Remove suffix patterns (case-insensitive, at end of string only)
    # Matches: Jr, Jr., Sr, Sr., II, III, IV, V
    name = re.sub(r'\s+(Jr\.?|Sr\.?|II|III|IV|V)$', '', name, flags=re.IGNORECASE)

    # Normalize whitespace to single space
    name = re.sub(r'\s+', ' ', name)

    # Title case for consistency
    name = name.title()

    return name.strip()
