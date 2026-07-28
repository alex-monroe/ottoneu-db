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

# League constants are GENERATED from config.json by scripts/gen_config.py
# (`just gen-config`). Do not hand-edit the block between the markers below —
# edit config.json and regenerate. Notes:
#   - The current season is NOT static config — it is resolved from the
#     league_calendar table (scripts/season.py: league_season / projection_season
#     / stats_season / arbitration_season).
#   - NFL_TEAM_CODES is converted to a set for O(1) college-player detection.
#   - Database salaries already reflect the end-of-season $4/$1 bump, so no
#     additional salary projection is needed.
# --- BEGIN GENERATED CONFIG (do not edit; run `just gen-config`) ---
LEAGUE_ID = _config["LEAGUE_ID"]
MY_TEAM = _config["MY_TEAM"]
HISTORICAL_SEASONS = _config["HISTORICAL_SEASONS"]
NUM_TEAMS = _config["NUM_TEAMS"]
CAP_PER_TEAM = _config["CAP_PER_TEAM"]
POSITIONS = _config["POSITIONS"]
COLLEGE_POSITIONS = _config["COLLEGE_POSITIONS"]
SCORING_SETTINGS = _config["SCORING_SETTINGS"]
MIN_GAMES = _config["MIN_GAMES"]
REPLACEMENT_LEVEL = _config["REPLACEMENT_LEVEL"]
SALARY_REPLACEMENT_PERCENTILE = _config["SALARY_REPLACEMENT_PERCENTILE"]
MIN_SALARY_PLAYERS = _config["MIN_SALARY_PLAYERS"]
ARB_BUDGET_PER_TEAM = _config["ARB_BUDGET_PER_TEAM"]
ARB_MIN_PER_TEAM = _config["ARB_MIN_PER_TEAM"]
ARB_MAX_PER_TEAM = _config["ARB_MAX_PER_TEAM"]
ARB_MAX_PER_PLAYER_PER_TEAM = _config["ARB_MAX_PER_PLAYER_PER_TEAM"]
ARB_MAX_PER_PLAYER_LEAGUE = _config["ARB_MAX_PER_PLAYER_LEAGUE"]
NFL_TEAM_CODES = set(_config["NFL_TEAM_CODES"])
# --- END GENERATED CONFIG ---


# Path to the Playwright storage_state file holding an authenticated Ottoneu
# session (cookies + localStorage). Produced by `just ottoneu-login` and loaded
# by the scraper worker to clear the Cloudflare bot challenge on the search page.
# Override the location with OTTONEU_STORAGE_STATE; the default lives at the repo
# root and is gitignored so the session secret is never committed.
OTTONEU_STORAGE_STATE_PATH = Path(
    os.getenv("OTTONEU_STORAGE_STATE", str(CONFIG_PATH.parent / "ottoneu_state.json"))
)


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


def fetch_all_rows(supabase, table: str, select: str = "*",
                   filters=None, page_size: int = 1000) -> list[dict]:
    """Fetch all rows from a Supabase table, paginating past the PostgREST limit.

    PostgREST defaults to returning at most 1000 rows. This helper pages
    through all results transparently, so callers never need to write a manual
    ``.range()`` loop. It is the canonical way to read a query that may exceed
    1000 rows (see the "Supabase pagination" guidance in CLAUDE.md) and is
    enforced by ``scripts/tests/test_architecture.py::TestSupabasePagination``.

    Args:
        supabase: Supabase client instance.
        table: Table name to query.
        select: Column selection string (default "*").
        filters: Optional iterable of ``(op, column, value)`` tuples applied to
            the query before paging, where ``op`` is a PostgREST filter method
            name such as ``"eq"``, ``"in_"``, ``"lt"``, ``"gte"``, ``"lte"``.
            Examples::

                fetch_all_rows(sb, "player_stats", "ppg",
                               filters=[("eq", "season", 2025)])
                fetch_all_rows(sb, "model_projections", "player_id",
                               filters=[("eq", "model_id", mid), ("eq", "season", s)])

        page_size: Rows per page (default 1000).

    Returns:
        List of row dicts.
    """
    all_data: list[dict] = []
    offset = 0
    while True:
        query = supabase.table(table).select(select)
        for op, column, value in (filters or []):
            query = getattr(query, op)(column, value)
        batch = (
            query
            .range(offset, offset + page_size - 1)
            .execute()
            .data or []
        )
        all_data.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return all_data
