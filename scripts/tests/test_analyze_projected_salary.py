import pandas as pd
import pytest
from unittest.mock import patch
from scripts.analyze_projected_salary import analyze_projected_salary
from scripts.config import MY_TEAM

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
        df = pd.DataFrame([
            {'name': 'Player 1', 'team_name': 'Other Team', 'surplus': 10},
            {'name': 'Player 2', 'team_name': 'Another Team', 'surplus': 5}
        ])
        mock_calculate.return_value = df
        result = analyze_projected_salary(pd.DataFrame())
        assert result.empty

def test_filters_to_my_team():
    """Verify it only returns players from MY_TEAM."""
    with patch('scripts.analyze_projected_salary.calculate_surplus') as mock_calculate:
        df = pd.DataFrame([
            {'name': 'My Player', 'team_name': MY_TEAM, 'surplus': 10},
            {'name': 'Other Player', 'team_name': 'Other Team', 'surplus': 5}
        ])
        mock_calculate.return_value = df
        result = analyze_projected_salary(pd.DataFrame())
        assert len(result) == 1
        assert result.iloc[0]['name'] == 'My Player'
        assert result.iloc[0]['team_name'] == MY_TEAM

def test_recommendation_logic():
    """Verify correct classification based on surplus thresholds."""
    with patch('scripts.analyze_projected_salary.calculate_surplus') as mock_calculate:
        df = pd.DataFrame([
            {'name': 'Strong', 'team_name': MY_TEAM, 'surplus': 15},
            {'name': 'Keep', 'team_name': MY_TEAM, 'surplus': 5},
            {'name': 'Borderline', 'team_name': MY_TEAM, 'surplus': -2},
            {'name': 'Cut', 'team_name': MY_TEAM, 'surplus': -10},
            {'name': 'Threshold10', 'team_name': MY_TEAM, 'surplus': 10},
            {'name': 'Threshold0', 'team_name': MY_TEAM, 'surplus': 0},
            {'name': 'Threshold-5', 'team_name': MY_TEAM, 'surplus': -5},
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
