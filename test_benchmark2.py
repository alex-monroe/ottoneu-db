import time
import os
import sys
from unittest.mock import MagicMock

# Setup paths
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.append(script_dir)

import pandas as pd
import scripts.update_projections as up

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


up.get_supabase_client = MagicMock(return_value=mock_supabase)
up.generate_projections_for_season = MagicMock(return_value=(pd.DataFrame(), pd.DataFrame()))
up.compute_avg_rookie_ppg = MagicMock(return_value={'QB': 10.0})

start_opt = time.time()
up.update_projections()
end_opt = time.time()
time_opt = end_opt - start_opt
print(f"Optimized time taken (with simulated 50ms network delay): {time_opt:.5f} seconds")
