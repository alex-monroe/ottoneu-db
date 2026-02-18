"""Central configuration for all Ottoneu DB scripts.

This module consolidates all configuration constants and provides a shared
Supabase client factory to eliminate duplication across scripts.
"""

import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# === League Configuration ===
LEAGUE_ID = 309
SEASON = 2025
MY_TEAM = "The Witchcraft"
HISTORICAL_SEASONS = [2022, 2023, 2024]

# === Fantasy League Rules ===
NUM_TEAMS = 12
CAP_PER_TEAM = 400
POSITIONS = ["QB", "RB", "WR", "TE", "K"]

# === Analysis Configuration ===
MIN_GAMES = 4

# Replacement level: approximate number of fantasy-relevant players per position
# in a 12-team superflex league (accounts for 2 QBs starting per team).
# Used as fallback when salary-implied method lacks sufficient data.
REPLACEMENT_LEVEL = {'QB': 24, 'RB': 30, 'WR': 30, 'TE': 20, 'K': 13}

# Salary-implied replacement level: players priced in the bottom quartile of
# rostered salaries are treated as "replacement tier" by market consensus.
SALARY_REPLACEMENT_PERCENTILE = 0.25  # bottom quartile of rostered salaries
MIN_SALARY_PLAYERS = 3                # min players needed to use salary method

# NOTE: Database salaries already reflect the end-of-season $4/$1 bump.
# No additional salary projection is needed.

# === Arbitration Constants ===
ARB_BUDGET_PER_TEAM = 60
ARB_MIN_PER_TEAM = 1
ARB_MAX_PER_TEAM = 8
ARB_MAX_PER_PLAYER_PER_TEAM = 4
ARB_MAX_PER_PLAYER_LEAGUE = 44  # max from all teams combined


def get_supabase_client() -> Client:
    """Return a configured Supabase client.

    Reads SUPABASE_URL and SUPABASE_KEY from environment variables.
    Exits with error message if credentials are not configured.

    Returns:
        Client: Configured Supabase client instance
    """
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env")
        exit(1)
    return create_client(url, key)
