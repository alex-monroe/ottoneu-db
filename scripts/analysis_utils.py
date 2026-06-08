"""Shared utilities for Ottoneu fantasy football analysis scripts.

Note: the VORP / surplus / arbitration / projected-salary calculations that used
to live in the ``analyze_*.py`` report scripts are now implemented canonically in
the TypeScript web UI (``web/lib/``). This module retains only the data-fetch
helper still consumed by the projection pipeline.
"""

import pandas as pd

from scripts.config import get_supabase_client


def _fetch_seasons_paginated(supabase, table: str, select: str,
                             seasons: list[int]) -> list:
    """Fetch all rows of ``table`` for ``seasons``, paginating the 1000-row cap.

    PostgREST silently truncates a plain ``.execute()`` at 1000 rows. A
    multi-season window of ``player_stats`` (~450/season) or ``nfl_stats``
    (~800/season) easily exceeds that, and a silent truncation randomly drops
    player-season rows — corrupting weighted-PPG bases and team aggregates.
    """
    page_size = 1000
    offset = 0
    rows: list = []
    while True:
        batch = (
            supabase.table(table).select(select)
            .in_('season', seasons)
            .range(offset, offset + page_size - 1)
            .execute()
            .data or []
        )
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def fetch_multi_season_stats(seasons: list[int]) -> pd.DataFrame:
    """Fetch player_stats rows for multiple seasons.

    Args:
        seasons: List of season years to include.

    Returns:
        DataFrame with all rows for those seasons, including 'season' column.
    """
    supabase = get_supabase_client()
    print(f"Fetching multi-season stats for seasons {seasons}...")
    # Select only Ottoneu-relevant columns; raw NFL stat columns live in nfl_stats.
    select = (
        'player_id, season, total_points, games_played, snaps, ppg, pps, '
        'h1_snaps, h1_games, h2_snaps, h2_games'
    )
    rows = _fetch_seasons_paginated(supabase, 'player_stats', select, seasons)
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    for col in ['ppg', 'pps', 'total_points', 'games_played', 'snaps']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    df['season'] = pd.to_numeric(df['season'], errors='coerce')
    return df


def available_model_seasons(supabase, model_id: str) -> list:
    """Seasons (descending) with BOTH model_projections for ``model_id`` and
    player_stats actuals.

    Paginates both distinct-season reads past the 1000-row cap — model_projections
    across all seasons (~2k rows) and player_stats (~3k) both exceed it, so a
    plain ``.execute()`` could silently drop a season from default-season
    auto-detection (GH #562).
    """
    def _seasons(table: str, eq=None) -> set:
        out: set = set()
        offset, page = 0, 1000
        while True:
            query = supabase.table(table).select("season")
            if eq is not None:
                query = query.eq(eq[0], eq[1])
            batch = query.range(offset, offset + page - 1).execute().data or []
            out.update(r["season"] for r in batch)
            if len(batch) < page:
                break
            offset += page
        return out

    proj = _seasons("model_projections", ("model_id", model_id))
    stats = _seasons("player_stats")
    return sorted(proj & stats, reverse=True)


def fetch_multi_season_nfl_stats(seasons: list[int]) -> pd.DataFrame:
    """Fetch nfl_stats rows for multiple seasons (paginated).

    nfl_stats holds ~800 rows/season, so any multi-season window exceeds the
    1000-row PostgREST cap. Truncation here silently drops players, corrupting
    the team aggregates and usage/target-share features built from this data
    in the projection runner and learned-model trainer. Returns the raw rows
    as a DataFrame (``select *``); callers coerce the numeric columns they use.
    """
    supabase = get_supabase_client()
    rows = _fetch_seasons_paginated(supabase, 'nfl_stats', '*', seasons)
    return pd.DataFrame(rows)
