"""Shared utilities for Ottoneu fantasy football analysis scripts.

Note: the VORP / surplus / arbitration / projected-salary calculations that used
to live in the ``analyze_*.py`` report scripts are now implemented canonically in
the TypeScript web UI (``web/lib/``). This module retains only the data-fetch
helper still consumed by the projection pipeline.
"""

import pandas as pd

from scripts.config import get_supabase_client


def fetch_multi_season_stats(seasons: list[int]) -> pd.DataFrame:
    """Fetch player_stats rows for multiple seasons.

    Args:
        seasons: List of season years to include.

    Returns:
        DataFrame with all rows for those seasons, including 'season' column.
    """
    supabase = get_supabase_client()
    print(f"Fetching multi-season stats for seasons {seasons}...")
    # Select only Ottoneu-relevant columns; raw NFL stat columns live in nfl_stats
    res = supabase.table('player_stats').select(
        'player_id, season, total_points, games_played, snaps, ppg, pps, '
        'h1_snaps, h1_games, h2_snaps, h2_games'
    ).in_('season', seasons).execute()
    df = pd.DataFrame(res.data)
    if df.empty:
        return df
    for col in ['ppg', 'pps', 'total_points', 'games_played', 'snaps']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    df['season'] = pd.to_numeric(df['season'], errors='coerce')
    return df
