# Standard library
import sys
from unittest.mock import MagicMock

# Create a fake supabase module
sys.modules['supabase'] = MagicMock()

# Third-party
import pandas as pd
import pytest

# Local imports
from scripts.analyze_projected_arbitration import apply_projections


def test_apply_projections_merges_and_drops():
    """Verify that apply_projections:
    1. Replaces 'ppg' with 'projected_ppg'.
    2. Copies original 'ppg' to 'observed_ppg'.
    3. Retains 'projection_method'.
    4. Drops players who are missing projections.
    """
    # Setup - 3 players, but only 2 have projections
    merged_data = {
        'player_id': ['1', '2', '3'],
        'ppg': [10.0, 15.0, 20.0],
        'name': ['Alice', 'Bob', 'Charlie']
    }
    merged_df = pd.DataFrame(merged_data)

    proj_data = {
        'player_id': ['1', '2'],
        'projected_ppg': [12.0, 14.0],
        'projection_method': ['weighted', 'linear']
    }
    projections_df = pd.DataFrame(proj_data)

    # Execute
    result = apply_projections(merged_df, projections_df)

    # Assert
    assert len(result) == 2
    assert list(result['player_id']) == ['1', '2']

    # Original PPG is copied
    assert list(result['observed_ppg']) == [10.0, 15.0]

    # New PPG is projected PPG
    assert list(result['ppg']) == [12.0, 14.0]

    # Methods are retained
    assert list(result['projection_method']) == ['weighted', 'linear']

    # Other columns are retained
    assert list(result['name']) == ['Alice', 'Bob']

def test_apply_projections_empty():
    """Verify behavior when DataFrames are empty."""
    merged_df = pd.DataFrame(columns=['player_id', 'ppg', 'name'])
    projections_df = pd.DataFrame(columns=['player_id', 'projected_ppg', 'projection_method'])

    result = apply_projections(merged_df, projections_df)
    assert len(result) == 0
    assert 'observed_ppg' in result.columns
    assert 'projection_method' in result.columns
