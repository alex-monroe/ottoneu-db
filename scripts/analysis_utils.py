"""Shared utilities for Ottoneu fantasy football analysis scripts."""

import os
import pandas as pd

from config import (
    LEAGUE_ID,
    SEASON,
    MY_TEAM,
    NUM_TEAMS,
    CAP_PER_TEAM,
    MIN_GAMES,
    REPLACEMENT_LEVEL,
    ARB_BUDGET_PER_TEAM,
    ARB_MIN_PER_TEAM,
    ARB_MAX_PER_TEAM,
    ARB_MAX_PER_PLAYER_PER_TEAM,
    ARB_MAX_PER_PLAYER_LEAGUE,
    get_supabase_client,
)


def fetch_all_data(season: int = SEASON) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Fetch all three tables from Supabase and return as DataFrames.

    Returns:
        (prices_df, stats_df, players_df)
    """
    supabase = get_supabase_client()
    print(f"Fetching data for season {season}...")

    prices_res = supabase.table('league_prices').select('*').execute()
    stats_res = supabase.table('player_stats').select('*').eq('season', season).execute()
    players_res = supabase.table('players').select('*').execute()

    return (
        pd.DataFrame(prices_res.data),
        pd.DataFrame(stats_res.data),
        pd.DataFrame(players_res.data),
    )


def merge_data(
    prices_df: pd.DataFrame,
    stats_df: pd.DataFrame,
    players_df: pd.DataFrame,
) -> pd.DataFrame:
    """Join the three tables into a single analysis-ready DataFrame.

    Columns guaranteed after merge:
        name, position, nfl_team, price, team_name,
        total_points, games_played, snaps, ppg, pps
    """
    if prices_df.empty or stats_df.empty or players_df.empty:
        print("Warning: one or more DataFrames are empty.")
        return pd.DataFrame()

    players = players_df.rename(columns={'id': 'player_id_ref'})

    merged = pd.merge(
        prices_df, players,
        left_on='player_id', right_on='player_id_ref',
        how='left',
    )
    merged = pd.merge(
        merged, stats_df,
        on='player_id', how='left',
        suffixes=('', '_stats'),
    )

    # Clean numeric columns
    for col in ['ppg', 'pps', 'price', 'total_points', 'games_played', 'snaps']:
        if col in merged.columns:
            merged[col] = pd.to_numeric(merged[col], errors='coerce').fillna(0)

    return merged


def ensure_reports_dir() -> str:
    """Create reports/ directory if it doesn't exist and return its path."""
    reports_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'reports')
    os.makedirs(reports_dir, exist_ok=True)
    return reports_dir
