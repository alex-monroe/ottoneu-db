"""
Unit tests for player name normalization utilities.
"""
import pytest
from scripts.name_utils import (
    NAME_ALIASES,
    build_player_index,
    match_player,
    normalize_player_name,
)


def test_normalize_suffix_ii():
    """Test removal of Roman numeral II suffix."""
    assert normalize_player_name("Oronde Gadsden II") == "Oronde Gadsden"


def test_normalize_suffix_jr():
    """Test removal of Jr. suffix with period."""
    assert normalize_player_name("Marvin Harrison Jr.") == "Marvin Harrison"


def test_normalize_suffix_jr_without_period():
    """Test removal of Jr suffix without period."""
    assert normalize_player_name("Velus Jones Jr") == "Velus Jones"


def test_normalize_suffix_iii():
    """Test removal of Roman numeral III suffix."""
    assert normalize_player_name("AJ Cole III") == "Aj Cole"


def test_normalize_suffix_sr():
    """Test removal of Sr. suffix."""
    assert normalize_player_name("John Smith Sr.") == "John Smith"


def test_normalize_suffix_iv():
    """Test removal of Roman numeral IV suffix."""
    assert normalize_player_name("Robert Griffin IV") == "Robert Griffin"


def test_normalize_suffix_v():
    """Test removal of Roman numeral V suffix."""
    assert normalize_player_name("Marcus Johnson V") == "Marcus Johnson"


def test_normalize_no_suffix():
    """Test that names without suffixes are unchanged (except title case)."""
    assert normalize_player_name("Josh Allen") == "Josh Allen"


def test_normalize_mixed_case():
    """Test case normalization with suffix."""
    assert normalize_player_name("PATRICK JONES II") == "Patrick Jones"


def test_normalize_extra_whitespace():
    """Test whitespace normalization."""
    assert normalize_player_name("Marvin  Harrison   Jr.") == "Marvin Harrison"


def test_normalize_preserves_names_without_suffixes():
    """Regression test: names without suffixes should be unchanged (except title case)."""
    assert normalize_player_name("Christian McCaffrey") == "Christian Mccaffrey"
    assert normalize_player_name("Travis Kelce") == "Travis Kelce"


def test_normalize_lowercase():
    """Test normalization of all-lowercase names."""
    assert normalize_player_name("josh allen") == "Josh Allen"


def test_normalize_suffix_case_insensitive():
    """Test that suffix removal is case-insensitive."""
    assert normalize_player_name("John Smith jr") == "John Smith"
    assert normalize_player_name("John Smith JR") == "John Smith"
    assert normalize_player_name("John Smith ii") == "John Smith"


def test_normalize_middle_suffix_not_removed():
    """Test that suffixes in the middle of names are not removed."""
    # Hypothetical edge case: player named "Junior Santos" shouldn't become "Santos"
    assert normalize_player_name("Junior Santos") == "Junior Santos"


def test_normalize_empty_string():
    """Test handling of empty string."""
    assert normalize_player_name("") == ""


def test_normalize_whitespace_only():
    """Test handling of whitespace-only string."""
    assert normalize_player_name("   ") == ""


def test_normalize_name_alias():
    """Test that known name aliases are resolved to canonical Ottoneu names."""
    assert normalize_player_name("Cam Ward") == "Cameron Ward"
    assert normalize_player_name("cam ward") == "Cameron Ward"


def test_normalize_canonical_name_unchanged():
    """Test that the canonical form of an aliased name is unchanged."""
    assert normalize_player_name("Cameron Ward") == "Cameron Ward"


def test_normalize_strips_apostrophes():
    # Sources disagree on apostrophes (and straight vs curly quotes).
    assert normalize_player_name("Ja'Marr Chase") == normalize_player_name("JaMarr Chase")
    assert normalize_player_name("De\u2019Von Achane") == normalize_player_name("De'Von Achane")


def test_normalize_hyphen_matches_space():
    assert normalize_player_name("JuJu Smith-Schuster") == normalize_player_name("JuJu Smith Schuster")


def test_alias_keys_are_in_normalized_form():
    """Aliases are looked up AFTER normalization, so a key that isn't already
    normalized (a period, apostrophe, suffix, odd casing) can never match."""
    for key in NAME_ALIASES:
        assert normalize_player_name(key) in (key, NAME_ALIASES[key]), key


# --- match_player: the shared exact-then-fuzzy matcher ------------------------

_PLAYERS = [
    {"id": "ward", "name": "Cameron Ward", "position": "QB", "nfl_team": "TEN"},
    {"id": "walker", "name": "Kenneth Walker", "position": "RB", "nfl_team": "KC"},
    {"id": "chase", "name": "Ja'Marr Chase", "position": "WR", "nfl_team": "CIN"},
    {"id": "allen-buf", "name": "Josh Allen", "position": "QB", "nfl_team": "BUF"},
    {"id": "allen-old", "name": "Josh Allen", "position": "QB", "nfl_team": "JAC"},
]


def _match(name, pos, team=""):
    return match_player(name, pos, team, build_player_index(_PLAYERS), {}, verbose=False)


def test_match_applies_name_aliases():
    # The bug behind #749: the old weekly matcher never read NAME_ALIASES.
    assert _match("Cam Ward", "QB", "TEN") == "ward"


def test_match_strips_suffixes():
    # The old weekly matcher kept suffixes and leaned on fuzzy matching.
    assert _match("Kenneth Walker III", "RB", "KC") == "walker"


def test_match_ignores_apostrophes():
    assert _match("JaMarr Chase", "WR", "CIN") == "chase"


def test_match_disambiguates_exact_duplicates_by_team():
    assert _match("Josh Allen", "QB", "BUF") == "allen-buf"
    assert _match("Josh Allen", "QB", "") is None  # ambiguous without a team


def test_match_respects_position():
    assert _match("Cameron Ward", "WR") is None


def test_build_player_index_accepts_a_dataframe():
    import pandas as pd

    assert build_player_index(pd.DataFrame(_PLAYERS)) == build_player_index(_PLAYERS)

