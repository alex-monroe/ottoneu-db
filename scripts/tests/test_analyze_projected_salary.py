# Standard library
from unittest.mock import patch

# Third-party
import pandas as pd
import pytest

# Local imports
from scripts.analyze_projected_salary import analyze_projected_salary
from scripts.config import MY_TEAM


def _make_surplus_df(rows: list[dict]) -> pd.DataFrame:
    """Build a DataFrame that looks like calculate_surplus() output."""
    defaults = {
        'name': 'Test Player',
        'team_name': 'Default Team',
        'surplus': 0
    }
    data = []
    for row in rows:
        merged = {**defaults, **row}
        data.append(merged)
    return pd.DataFrame(data)


def test_empty_input():
    """Verify it returns an empty DataFrame when calculate_surplus returns empty."""
    with patch('scripts.analyze_projected_salary.calculate_surplus') as mock_calculate:
        mock_calculate.return_value = pd.DataFrame()
        result = analyze_projected_salary(pd.DataFrame())
        assert isinstance(result, pd.DataFrame)
        assert result.empty


def test_no_my_team_players():
    """Verify it returns empty if none of the players belong to MY_TEAM."""
    with patch('scripts.analyze_projected_salary.calculate_surplus') as mock_calculate:
        df = _make_surplus_df([
            {'name': 'Player 1', 'team_name': 'Other Team', 'surplus': 10},
            {'name': 'Player 2', 'team_name': 'Another Team', 'surplus': 5}
        ])
        mock_calculate.return_value = df
        result = analyze_projected_salary(pd.DataFrame())
        assert result.empty


def test_filters_to_my_team():
    """Verify it only returns players from MY_TEAM and handles mixed teams."""
    with patch('scripts.analyze_projected_salary.calculate_surplus') as mock_calculate:
        df = _make_surplus_df([
            {'name': 'My Player', 'team_name': MY_TEAM, 'surplus': 10},
            {'name': 'Other Player', 'team_name': 'Other Team', 'surplus': 5},
            {'name': 'Another My Player', 'team_name': MY_TEAM, 'surplus': -2}
        ])
        mock_calculate.return_value = df
        result = analyze_projected_salary(pd.DataFrame())
        assert len(result) == 2
        assert all(result['team_name'] == MY_TEAM)
        assert set(result['name']) == {'My Player', 'Another My Player'}


def test_recommendation_logic():
    """Verify correct classification based on surplus thresholds and boundaries."""
    with patch('scripts.analyze_projected_salary.calculate_surplus') as mock_calculate:
        df = _make_surplus_df([
            {'name': 'Strong', 'team_name': MY_TEAM, 'surplus': 15},
            {'name': 'Keep', 'team_name': MY_TEAM, 'surplus': 5},
            {'name': 'Borderline', 'team_name': MY_TEAM, 'surplus': -2},
            {'name': 'Cut', 'team_name': MY_TEAM, 'surplus': -10},
            {'name': 'Threshold10', 'team_name': MY_TEAM, 'surplus': 10},
            {'name': 'Threshold0', 'team_name': MY_TEAM, 'surplus': 0},
            {'name': 'Threshold-5', 'team_name': MY_TEAM, 'surplus': -5},
            {'name': 'JustBelow-5', 'team_name': MY_TEAM, 'surplus': -5.1},
            {'name': 'VeryLargePos', 'team_name': MY_TEAM, 'surplus': 1000},
            {'name': 'VeryLargeNeg', 'team_name': MY_TEAM, 'surplus': -1000},
            {'name': 'Identical1', 'team_name': MY_TEAM, 'surplus': 7},
            {'name': 'Identical2', 'team_name': MY_TEAM, 'surplus': 7},
        ])
        mock_calculate.return_value = df
        result = analyze_projected_salary(pd.DataFrame())

        recs = result.set_index('name')['recommendation'].to_dict()
        assert recs['Strong'] == 'Strong Keep'
        assert recs['Keep'] == 'Keep'
        assert recs['Borderline'] == 'Borderline'
        assert recs['Cut'] == 'Cut Candidate'
        assert recs['Threshold10'] == 'Strong Keep'
        assert recs['Threshold0'] == 'Keep'
        assert recs['Threshold-5'] == 'Borderline'
        assert recs['JustBelow-5'] == 'Cut Candidate'
        assert recs['VeryLargePos'] == 'Strong Keep'
        assert recs['VeryLargeNeg'] == 'Cut Candidate'
        assert recs['Identical1'] == 'Keep'
        assert recs['Identical2'] == 'Keep'
