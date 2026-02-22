"""
Unit tests for calculate_vorp() from analyze_vorp.py.

Tests use mock DataFrames — no Supabase calls.
"""
import pandas as pd
import pytest
from scripts.analyze_vorp import calculate_vorp


def _make_merged_df(rows: list[dict]) -> pd.DataFrame:
    """Build a DataFrame that looks like merge_data() output."""
    defaults = {
        "player_id": "1",
        "name": "Test Player",
        "position": "QB",
        "nfl_team": "BUF",
        "price": 10,
        "team_name": "Team A",
        "total_points": 100,
        "games_played": 10,
        "snaps": 200,
        "ppg": 10.0,
        "pps": 0.5,
    }
    data = []
    for i, row in enumerate(rows):
        merged = {**defaults, "player_id": str(i + 1), **row}
        data.append(merged)
    return pd.DataFrame(data)


class TestCalculateVorp:
    """Tests for the Python VORP calculation."""

    def test_empty_input(self):
        """Empty DataFrame with correct schema should return empty result."""
        df = pd.DataFrame(columns=[
            "player_id", "name", "position", "nfl_team", "price",
            "team_name", "total_points", "games_played", "snaps", "ppg", "pps",
        ])
        result = calculate_vorp(df)
        # Returns an empty DataFrame (single return when empty)
        assert isinstance(result, pd.DataFrame)

    def test_excludes_kickers(self):
        rows = [
            {"name": "Kicker", "position": "K", "ppg": 8.0, "games_played": 16},
            {"name": "QB1", "position": "QB", "ppg": 20.0, "games_played": 16},
        ]
        df = _make_merged_df(rows)
        result, rpg, rn = calculate_vorp(df)
        assert "K" not in result["position"].values

    def test_filters_by_min_games(self):
        rows = [
            {"name": "Starter", "position": "QB", "ppg": 15.0, "games_played": 10},
            {"name": "Backup", "position": "QB", "ppg": 20.0, "games_played": 2},
        ]
        df = _make_merged_df(rows)
        result, _, _ = calculate_vorp(df, min_games=4)
        assert len(result) == 1
        assert result.iloc[0]["name"] == "Starter"

    def test_adds_vorp_columns(self):
        rows = [
            {"name": f"QB{i}", "position": "QB", "ppg": 10.0 + i, "games_played": 10,
             "total_points": (10 + i) * 10, "team_name": f"Team {chr(65 + i)}"}
            for i in range(5)
        ]
        df = _make_merged_df(rows)
        result, rpg, rn = calculate_vorp(df)
        assert "replacement_ppg" in result.columns
        assert "vorp_per_game" in result.columns
        assert "full_season_vorp" in result.columns

    def test_vorp_per_game_equals_ppg_minus_replacement(self):
        rows = [
            {"name": f"QB{i}", "position": "QB", "ppg": 10.0 + i * 5, "games_played": 10,
             "total_points": (10 + i * 5) * 10, "team_name": f"Team {chr(65 + i)}"}
            for i in range(5)
        ]
        df = _make_merged_df(rows)
        result, rpg, _ = calculate_vorp(df)
        for _, row in result.iterrows():
            expected_vorp = row["ppg"] - rpg.get(row["position"], 0)
            assert abs(row["vorp_per_game"] - expected_vorp) < 0.01

    def test_full_season_vorp_is_17x(self):
        rows = [
            {"name": f"QB{i}", "position": "QB", "ppg": 10.0 + i, "games_played": 10,
             "total_points": (10 + i) * 10, "team_name": f"Team {chr(65 + i)}"}
            for i in range(5)
        ]
        df = _make_merged_df(rows)
        result, _, _ = calculate_vorp(df)
        for _, row in result.iterrows():
            assert abs(row["full_season_vorp"] - row["vorp_per_game"] * 17) < 0.2

    def test_replacement_ppg_per_position(self):
        """Each position should have its own replacement PPG."""
        rows = []
        for pos in ["QB", "RB", "WR", "TE"]:
            for i in range(5):
                rows.append({
                    "name": f"{pos}{i}",
                    "position": pos,
                    "ppg": 5.0 + i * 3,
                    "games_played": 10,
                    "total_points": (5 + i * 3) * 10,
                    "team_name": f"Team {chr(65 + i)}",
                })
        df = _make_merged_df(rows)
        _, rpg, _ = calculate_vorp(df)
        for pos in ["QB", "RB", "WR", "TE"]:
            assert pos in rpg
            assert rpg[pos] > 0

    def test_fallback_when_insufficient_rostered(self):
        """With only free agents (team_name=None), salary-implied path can't fire."""
        rows = [
            {"name": "FA1", "position": "QB", "ppg": 15.0, "games_played": 10,
             "total_points": 150, "team_name": None},
            {"name": "FA2", "position": "QB", "ppg": 10.0, "games_played": 10,
             "total_points": 100, "team_name": None},
        ]
        df = _make_merged_df(rows)
        result, rpg, rn = calculate_vorp(df)
        assert "QB" in rpg
        # Should use fixed-rank fallback
        assert rpg["QB"] == 10.0  # last player's PPG (only 2 < rank 24)

    def test_college_players_excluded_from_replacement_ppg(self):
        """College players should not influence replacement PPG calculation."""
        nfl_rows = [
            {"name": f"QB{i}", "position": "QB", "ppg": 10.0 + i * 2, "games_played": 10,
             "total_points": (10 + i * 2) * 10, "team_name": f"Team {chr(65 + i)}",
             "is_college": False}
            for i in range(5)
        ]
        # College player with very low PPG — should NOT pull down replacement
        college_rows = [
            {"name": "College QB", "position": "QB", "ppg": 0.5, "games_played": 0,
             "total_points": 0, "team_name": "Team Z", "is_college": True},
        ]
        df = _make_merged_df(nfl_rows + college_rows)
        _, rpg_with_college, _ = calculate_vorp(df)

        df_nfl_only = _make_merged_df(nfl_rows)
        _, rpg_nfl_only, _ = calculate_vorp(df_nfl_only)

        # Replacement PPG should be the same whether college players are present or not
        assert rpg_with_college["QB"] == rpg_nfl_only["QB"]
