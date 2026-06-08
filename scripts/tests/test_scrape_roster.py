"""
Unit tests for scrape_roster stats-building logic.

Tests the build_stats_data function to ensure it:
- Returns full stats when snap count data is available
- Returns minimal payload (preserving existing DB stats) when snap data is missing
"""
import pandas as pd
import pytest

from scripts.tasks.scrape_roster import build_stats_data, choose_prospect_to_adopt


# --- Fixtures ---

@pytest.fixture
def snap_count_df():
    """Sample NFL snap count DataFrame with one player."""
    return pd.DataFrame({
        "player": ["Bijan Robinson"],
        "position": ["HB"],
        "team": ["ATL"],
        "games_played": [17],
        "total_snaps": [800],
        "h1_snaps": [400],
        "h1_games": [8],
        "h2_snaps": [400],
        "h2_games": [9],
    })


@pytest.fixture
def traded_player_df():
    """Snap count DataFrame for a player traded mid-season (two rows)."""
    return pd.DataFrame({
        "player": ["Player X", "Player X"],
        "position": ["WR", "WR"],
        "team": ["NYG", "SF"],
        "games_played": [8, 9],
        "total_snaps": [400, 500],
        "h1_snaps": [400, 0],
        "h1_games": [8, 0],
        "h2_snaps": [0, 500],
        "h2_games": [0, 9],
    })


# --- Tests: snap count data found (full payload) ---

def test_build_stats_data_with_snaps():
    """When snap data is found, returns full stats payload."""
    df = pd.DataFrame({
        "player": ["Josh Allen"],
        "position": ["QB"],
        "team": ["BUF"],
        "games_played": [17],
        "total_snaps": [1034],
        "h1_snaps": [500],
        "h1_games": [8],
        "h2_snaps": [534],
        "h2_games": [9],
    })

    result = build_stats_data("uuid-123", 2025, 365.18, df)

    assert result["player_id"] == "uuid-123"
    assert result["season"] == 2025
    assert result["total_points"] == 365.18
    assert result["games_played"] == 17
    assert result["snaps"] == 1034
    assert result["ppg"] == 21.48  # 365.18 / 17
    assert result["pps"] == 0.3532  # 365.18 / 1034
    assert result["h1_snaps"] == 500
    assert result["h1_games"] == 8
    assert result["h2_snaps"] == 534
    assert result["h2_games"] == 9


def test_build_stats_data_traded_player_sums_stats(traded_player_df):
    """Traded player with multiple rows sums games and snaps across teams."""
    result = build_stats_data("uuid-456", 2025, 250.0, traded_player_df)

    assert result["games_played"] == 17  # 8 + 9
    assert result["snaps"] == 900  # 400 + 500
    assert result["ppg"] == 14.71  # 250.0 / 17
    assert result["h1_snaps"] == 400
    assert result["h2_snaps"] == 500


def test_build_stats_data_zero_games():
    """When snap data has 0 games, ppg defaults to 0."""
    df = pd.DataFrame({
        "player": ["Injured Player"],
        "position": ["RB"],
        "team": ["NYJ"],
        "games_played": [0],
        "total_snaps": [0],
    })

    result = build_stats_data("uuid-789", 2025, 0.0, df)

    assert result["games_played"] == 0
    assert result["snaps"] == 0
    assert result["ppg"] == 0.0
    assert result["pps"] == 0.0


# --- Tests: no snap count data (minimal payload) ---

def test_build_stats_data_empty_df_returns_minimal():
    """When snap data is empty, returns minimal payload without games/snaps/ppg/pps."""
    empty_df = pd.DataFrame()

    result = build_stats_data("uuid-abc", 2025, 331.3, empty_df)

    assert result["player_id"] == "uuid-abc"
    assert result["season"] == 2025
    assert result["total_points"] == 331.3
    # Critical: these fields must NOT be present to avoid overwriting DB values
    assert "games_played" not in result
    assert "snaps" not in result
    assert "ppg" not in result
    assert "pps" not in result
    assert "h1_snaps" not in result
    assert "h1_games" not in result
    assert "h2_snaps" not in result
    assert "h2_games" not in result


def test_build_stats_data_minimal_has_only_three_keys():
    """Minimal payload should have exactly player_id, season, total_points."""
    empty_df = pd.DataFrame()

    result = build_stats_data("uuid-xyz", 2025, 200.0, empty_df)

    assert set(result.keys()) == {"player_id", "season", "total_points"}


def test_build_stats_data_preserves_existing_on_empty_nfl_stats():
    """Regression test: empty nfl_stats should NOT produce games_played=0.

    This was the root cause of the bug where scrape_roster overwrote
    pull_player_stats' correct games_played values with zeros.
    """
    empty_df = pd.DataFrame()

    result = build_stats_data("uuid-bijan", 2025, 331.3, empty_df)

    # The key invariant: games_played must not be in the result
    # so that the upsert preserves whatever pull_player_stats already wrote
    assert "games_played" not in result, (
        "build_stats_data must not include games_played=0 when snap data is missing; "
        "this would overwrite correct values from pull_player_stats"
    )


# --- Tests: half-season splits ---

# --- Tests: prospect adoption (duplicate-player guard) ---

def test_adopt_positive_id_prospect_with_draft_capital():
    """A drafted prospect with a positive placeholder id + draft capital is adopted."""
    candidates = [{"id": "prospect-uuid", "ottoneu_id": 122070, "has_draft_capital": True}]
    assert choose_prospect_to_adopt(candidates) == "prospect-uuid"


def test_adopt_negative_synthetic_backfill_record():
    """The original behavior — negative synthetic ids — still adopts."""
    candidates = [{"id": "synthetic-uuid", "ottoneu_id": -123, "has_draft_capital": False}]
    assert choose_prospect_to_adopt(candidates) == "synthetic-uuid"


def test_no_adoption_for_unrelated_real_player():
    """A same-name+position real player without draft capital is NOT adopted."""
    candidates = [{"id": "other-real", "ottoneu_id": 4321, "has_draft_capital": False}]
    assert choose_prospect_to_adopt(candidates) is None


def test_no_candidates_returns_none():
    assert choose_prospect_to_adopt([]) is None


def test_prospect_preferred_over_unrelated_real_namesake():
    """With a real namesake and a draft-capital prospect, adopt the prospect."""
    candidates = [
        {"id": "real-namesake", "ottoneu_id": 5000, "has_draft_capital": False},
        {"id": "prospect", "ottoneu_id": 99001, "has_draft_capital": True},
    ]
    assert choose_prospect_to_adopt(candidates) == "prospect"


def test_build_stats_data_without_h1h2_columns():
    """When snap data lacks h1/h2 columns, half-season values default to 0."""
    df = pd.DataFrame({
        "player": ["Simple Player"],
        "position": ["TE"],
        "team": ["KC"],
        "games_played": [16],
        "total_snaps": [700],
    })

    result = build_stats_data("uuid-te", 2025, 180.0, df)

    assert result["games_played"] == 16
    assert result["snaps"] == 700
    assert result["h1_snaps"] == 0
    assert result["h1_games"] == 0
    assert result["h2_snaps"] == 0
    assert result["h2_games"] == 0
