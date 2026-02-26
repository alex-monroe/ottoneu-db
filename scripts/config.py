"""Central configuration for all Ottoneu DB scripts.

This module consolidates all configuration constants and provides a shared
Supabase client factory to eliminate duplication across scripts.

Configuration values are loaded from the shared config.json in the repo root.
"""

import os
import json
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Load configuration from shared JSON file
# Resolve path relative to this file: ../config.json
CONFIG_PATH = Path(__file__).parent.parent / "config.json"

try:
    with open(CONFIG_PATH, "r") as f:
        _config = json.load(f)
except FileNotFoundError:
    raise FileNotFoundError(f"Could not find shared config file at {CONFIG_PATH}")
except json.JSONDecodeError as e:
    raise ValueError(f"Invalid JSON in config file at {CONFIG_PATH}: {e}")

# === League Configuration ===
LEAGUE_ID = _config["LEAGUE_ID"]
SEASON = _config["SEASON"]
MY_TEAM = _config["MY_TEAM"]
HISTORICAL_SEASONS = _config["HISTORICAL_SEASONS"]

# === Fantasy League Rules ===
NUM_TEAMS = _config["NUM_TEAMS"]
CAP_PER_TEAM = _config["CAP_PER_TEAM"]
POSITIONS = _config["POSITIONS"]
COLLEGE_POSITIONS = _config["COLLEGE_POSITIONS"]
SCORING_SETTINGS = _config["SCORING_SETTINGS"]

# === Analysis Configuration ===
MIN_GAMES = _config["MIN_GAMES"]

# Replacement level: approximate number of fantasy-relevant players per position
REPLACEMENT_LEVEL = _config["REPLACEMENT_LEVEL"]

# Salary-implied replacement level
SALARY_REPLACEMENT_PERCENTILE = _config["SALARY_REPLACEMENT_PERCENTILE"]
MIN_SALARY_PLAYERS = _config["MIN_SALARY_PLAYERS"]

# NOTE: Database salaries already reflect the end-of-season $4/$1 bump.
# No additional salary projection is needed.

# === Arbitration Constants ===
ARB_BUDGET_PER_TEAM = _config["ARB_BUDGET_PER_TEAM"]
ARB_MIN_PER_TEAM = _config["ARB_MIN_PER_TEAM"]
ARB_MAX_PER_TEAM = _config["ARB_MAX_PER_TEAM"]
ARB_MAX_PER_PLAYER_PER_TEAM = _config["ARB_MAX_PER_PLAYER_PER_TEAM"]
ARB_MAX_PER_PLAYER_LEAGUE = _config["ARB_MAX_PER_PLAYER_LEAGUE"]

# === NFL Team Codes ===
# Used to distinguish college players (whose nfl_team field contains a college name).
# Convert list back to set for O(1) lookups
NFL_TEAM_CODES = set(_config["NFL_TEAM_CODES"])


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
