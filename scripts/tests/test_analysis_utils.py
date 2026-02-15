
import pandas as pd
import pytest
from scripts.analysis_utils import merge_data

def test_merge_data_basic():
    """Test basic merging of prices, stats, and players dataframes."""
    
    # Mock data
    prices_data = {
        'player_id': [1, 2],
        'price': [10, 20],
        'team_name': ['Team A', 'Team B']
    }
    prices_df = pd.DataFrame(prices_data)

    stats_data = {
        'player_id': [1, 2],
        'season': [2024, 2024],
        'total_points': [100, 200],
        'games_played': [10, 12],
        'ppg': [10.0, 16.6],
        'pps': [1.0, 1.5],
        'snaps': [100, 133]
    }
    stats_df = pd.DataFrame(stats_data)

    players_data = {
        'id': [1, 2],
        'name': ['Player 1', 'Player 2'],
        'position': ['QB', 'RB'],
        'nfl_team': ['BUF', 'MIA']
    }
    players_df = pd.DataFrame(players_data)

    # Execute
    result = merge_data(prices_df, stats_df, players_df)

    # Assertions
    assert not result.empty
    assert len(result) == 2
    assert 'name' in result.columns
    assert 'total_points' in result.columns
    assert result.loc[0, 'name'] == 'Player 1'
    assert result.loc[0, 'total_points'] == 100
    assert result.loc[1, 'price'] == 20

def test_merge_data_empty_input():
    """Test merge_data with empty input dataframes."""
    prices_df = pd.DataFrame()
    stats_df = pd.DataFrame()
    players_df = pd.DataFrame()

    result = merge_data(prices_df, stats_df, players_df)

    assert result.empty

def test_merge_data_missing_stats():
    """Test merging when a player is in prices but missing stats."""
    prices_data = {
        'player_id': [1],
        'price': [10],
        'team_name': ['Team A']
    }
    prices_df = pd.DataFrame(prices_data)

    # Stats exist, but not for player 1
    stats_data = {
        'player_id': [999],
        'total_points': [50]
    }
    stats_df = pd.DataFrame(stats_data) 

    players_data = {
        'id': [1],
        'name': ['Player 1'],
        'position': ['QB'],
        'nfl_team': ['BUF']
    }
    players_df = pd.DataFrame(players_data)

    result = merge_data(prices_df, stats_df, players_df)

    assert len(result) == 1
    assert result.loc[0, 'name'] == 'Player 1'
    # Should be 0 because of fillna(0)
    assert result.loc[0, 'total_points'] == 0 
