"""
Unit tests for player name normalization utilities.
"""
from scripts.name_utils import normalize_player_name


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
