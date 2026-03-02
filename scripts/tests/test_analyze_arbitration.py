# Standard library
from unittest.mock import patch

# Third-party
import pandas as pd
import pytest

# Local imports
from scripts.analyze_arbitration import analyze_arbitration
from scripts.config import MY_TEAM, ARB_MAX_PER_PLAYER_PER_TEAM


def _make_surplus_df(rows: list[dict]) -> pd.DataFrame:
    """Build a DataFrame that looks like calculate_surplus() output."""
    defaults = {
        'name': 'Test Player',
        'position': 'WR',
        'team_name': 'Opponent Team',
        'price': 10,
        'dollar_value': 15,
        'surplus': 5
    }
    data = []
    for row in rows:
        merged = {**defaults, **row}
        data.append(merged)
    return pd.DataFrame(data)


@patch('scripts.analyze_arbitration.calculate_surplus')
def test_empty_input(mock_calculate_surplus):
    """Verify it returns an empty DataFrame when calculate_surplus returns empty."""
    mock_calculate_surplus.return_value = pd.DataFrame()
    # It takes merged_df, which we mock simply as an empty df
    result = analyze_arbitration(pd.DataFrame())
    assert isinstance(result, pd.DataFrame)
    assert result.empty


@patch('scripts.analyze_arbitration.calculate_surplus')
def test_no_opponents_found(mock_calculate_surplus):
    """Verify it returns empty if all players are on MY_TEAM, FA, or are kickers."""
    df = _make_surplus_df([
        {'name': 'My Player', 'team_name': MY_TEAM},
        {'name': 'Free Agent', 'team_name': 'FA'},
        {'name': 'Empty Team', 'team_name': ''},
        {'name': 'None Team', 'team_name': None},
        {'name': 'Kicker', 'team_name': 'Opponent Team', 'position': 'K'}
    ])
    mock_calculate_surplus.return_value = df
    result = analyze_arbitration(pd.DataFrame())
    assert result.empty


@patch('scripts.analyze_arbitration.calculate_surplus')
def test_filters_to_opponents(mock_calculate_surplus):
    """Verify it filters out non-opponents and keeps valid opponents."""
    df = _make_surplus_df([
        {'name': 'Opponent Player', 'team_name': 'Team A', 'position': 'RB', 'dollar_value': 10},
        {'name': 'My Player', 'team_name': MY_TEAM, 'position': 'WR'},
        {'name': 'Free Agent', 'team_name': 'FA', 'position': 'TE'},
        {'name': 'Kicker', 'team_name': 'Team B', 'position': 'K'}
    ])
    mock_calculate_surplus.return_value = df
    result = analyze_arbitration(pd.DataFrame())

    assert len(result) == 1
    assert result.iloc[0]['name'] == 'Opponent Player'


@patch('scripts.analyze_arbitration.calculate_surplus')
def test_calculates_arb_columns(mock_calculate_surplus):
    """Verify it correctly calculates salary_after_arb and surplus_after_arb."""
    df = _make_surplus_df([
        {'name': 'Target', 'price': 10, 'dollar_value': 18, 'surplus': 8}
    ])
    mock_calculate_surplus.return_value = df
    result = analyze_arbitration(pd.DataFrame())

    assert len(result) == 1
    row = result.iloc[0]
    expected_salary = 10 + ARB_MAX_PER_PLAYER_PER_TEAM
    expected_surplus = 18 - expected_salary

    assert row['salary_after_arb'] == expected_salary
    assert row['surplus_after_arb'] == expected_surplus


@patch('scripts.analyze_arbitration.calculate_surplus')
def test_filters_low_dollar_value(mock_calculate_surplus):
    """Verify it excludes players with dollar_value <= 1."""
    df = _make_surplus_df([
        {'name': 'High Value', 'dollar_value': 1.1},
        {'name': 'Low Value', 'dollar_value': 1.0},
        {'name': 'Negative Value', 'dollar_value': -2.0}
    ])
    mock_calculate_surplus.return_value = df
    result = analyze_arbitration(pd.DataFrame())

    assert len(result) == 1
    assert result.iloc[0]['name'] == 'High Value'


@patch('scripts.analyze_arbitration.calculate_surplus')
def test_sorts_by_surplus(mock_calculate_surplus):
    """Verify it sorts the targets by surplus descending."""
    df = _make_surplus_df([
        {'name': 'Lowest Surplus', 'surplus': 2},
        {'name': 'Highest Surplus', 'surplus': 15},
        {'name': 'Middle Surplus', 'surplus': 8}
    ])
    mock_calculate_surplus.return_value = df
    result = analyze_arbitration(pd.DataFrame())

    assert len(result) == 3
    names = result['name'].tolist()
    assert names == ['Highest Surplus', 'Middle Surplus', 'Lowest Surplus']
