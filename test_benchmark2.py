import time
import os
import sys
from unittest.mock import MagicMock, patch

# Setup paths
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.append(script_dir)

# Mock the config imports that try to connect to Supabase
import scripts.config
scripts.config.get_supabase_client = MagicMock()
scripts.config.MIN_GAMES = 1

import pandas as pd

# Let's say we have 1000 players total, 200 are college players
mock_data_all_players = [{'id': str(i), 'position': 'QB', 'is_college': (i < 200)} for i in range(1000)]

# Let's mock a network delay of 50ms per network call!
def delayed_select_execute():
    time.sleep(0.05)
    mock = MagicMock()
    mock.data = mock_data_all_players
    return mock

mock_supabase = MagicMock()
mock_table = MagicMock()
mock_supabase.table.return_value = mock_table
mock_select = MagicMock()
mock_table.select.return_value = mock_select

mock_select.execute = delayed_select_execute


def run_benchmark():
    from scripts.update_projections import update_projections

    with patch('scripts.update_projections.get_supabase_client', return_value=mock_supabase), \
         patch('scripts.update_projections.generate_projections_for_season', return_value=(pd.DataFrame(), pd.DataFrame())), \
         patch('scripts.update_projections.compute_avg_rookie_ppg', return_value={'QB': 10.0}):

        start_opt = time.time()
        update_projections()
        end_opt = time.time()
        return end_opt - start_opt

time_opt = run_benchmark()
print(f"Optimized time taken (with simulated 50ms network delay): {time_opt:.5f} seconds")
