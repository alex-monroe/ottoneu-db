"""Shared utilities for Ottoneu fantasy football analysis scripts."""

import os
from supabase import create_client, Client
from dotenv import load_dotenv
import pandas as pd

load_dotenv()

# === Config Constants ===
LEAGUE_ID = 309
SEASON = 2025
MY_TEAM = "The Witchcraft"
NUM_TEAMS = 12
CAP_PER_TEAM = 400
MIN_GAMES = 4

# Replacement level: approximate number of fantasy-relevant players per position
# in a 12-team superflex league (accounts for 2 QBs starting per team)
REPLACEMENT_LEVEL = {'QB': 24, 'RB': 30, 'WR': 30, 'TE': 15, 'K': 13}

# Salary bump rules (end of season)
SALARY_BUMP_PLAYED = 4   # players who played >= 1 NFL game
SALARY_BUMP_DEFAULT = 1  # all others

# Arbitration constants
ARB_BUDGET_PER_TEAM = 60
ARB_MIN_PER_TEAM = 1
ARB_MAX_PER_TEAM = 8
ARB_MAX_PER_PLAYER_PER_TEAM = 4
ARB_MAX_PER_PLAYER_LEAGUE = 44  # max from all teams combined


def get_supabase_client() -> Client:
    """Return a configured Supabase client."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env")
        exit(1)
    return create_client(url, key)


def fetch_all_data(season: int = SEASON) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Fetch all three tables from Supabase and return as DataFrames.

    Returns:
        (prices_df, stats_df, players_df)
    """
    supabase = get_supabase_client()
    print(f"Fetching data for season {season}...")

    prices_res = supabase.table('league_prices').select('*').eq('season', season).execute()
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


def projected_salary(price: float, games_played: float) -> float:
    """Calculate next-season salary after the automatic end-of-season bump."""
    bump = SALARY_BUMP_PLAYED if games_played > 0 else SALARY_BUMP_DEFAULT
    return price + bump


def ensure_reports_dir() -> str:
    """Create reports/ directory if it doesn't exist and return its path."""
    reports_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'reports')
    os.makedirs(reports_dir, exist_ok=True)
    return reports_dir
