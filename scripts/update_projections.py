"""Script to generate player projections and update the player_projections database table.

This consolidates the projection logic into the Python backend, allowing the
TypeScript frontend to simply read the precalculated values without duplicating logic.
"""

import os
import sys
import pandas as pd
from datetime import datetime

# Setup paths
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.append(script_dir)

from config import get_supabase_client, MIN_GAMES, SEASON
from analysis_utils import fetch_multi_season_stats
from projection_methods import CollegeProspectPPG, WeightedAveragePPG, RookieTrajectoryPPG

# Generate projections for current season and previous seasons to support backtesting
TARGET_SEASONS = [2024, 2025, 2026]

def generate_projections_for_season(target_season: int, max_history: int = 3) -> pd.DataFrame:
    """Generate projections for a target season using historical data prior to that season."""
    historical_seasons = list(range(target_season - max_history, target_season))
    print(f"Generating {target_season} projections using history from {historical_seasons}...")
    
    multi_season_df = fetch_multi_season_stats(historical_seasons)
    if multi_season_df.empty:
        print(f"  No historical data found for {historical_seasons}")
        return pd.DataFrame()
        
    rookie_method = RookieTrajectoryPPG()
    veteran_method = WeightedAveragePPG()
    
    records = []
    
    for player_id, group in multi_season_df.groupby('player_id'):
        history = []
        for _, row in group.iterrows():
            entry = {
                'season': int(row['season']),
                'ppg': float(row['ppg']),
                'games_played': int(row['games_played']),
            }
            for field in ('h1_snaps', 'h1_games', 'h2_snaps', 'h2_games'):
                if field in row and pd.notna(row[field]):
                    entry[field] = int(row[field])
            history.append(entry)
            
        method = rookie_method if len(history) == 1 else veteran_method
        projected = method.project_ppg(history)
        
        if projected is not None:
            records.append({
                'player_id': str(player_id),
                'season': target_season,
                'projected_ppg': float(projected),
                'projection_method': method.name
            })
            
    return pd.DataFrame(records)


def compute_avg_rookie_ppg(multi_season_df: pd.DataFrame, players_df: pd.DataFrame,
                           min_games: int = MIN_GAMES) -> dict[str, float]:
    """Compute average PPG of first-year NFL players by position.

    A "rookie" is a player with exactly 1 season of history where
    games_played >= min_games. Returns {position: avg_ppg}.
    """
    if multi_season_df.empty or players_df.empty:
        return {}

    # Build player_id -> position map from players table
    pos_map = dict(zip(players_df['player_id_ref'], players_df['position']))

    # Group stats by player_id — rookies have exactly 1 season
    grouped = multi_season_df.groupby('player_id')

    rookie_ppgs: dict[str, list[float]] = {}
    for player_id, group in grouped:
        if len(group) != 1:
            continue
        row = group.iloc[0]
        if int(row['games_played']) < min_games:
            continue
        pos = pos_map.get(str(player_id))
        if not pos or pos == 'K':
            continue
        rookie_ppgs.setdefault(pos, []).append(float(row['ppg']))

    return {pos: sum(ppgs) / len(ppgs) for pos, ppgs in rookie_ppgs.items() if ppgs}


def generate_college_projections(avg_rookie_ppg: dict[str, float],
                                  supabase, target_season: int) -> pd.DataFrame:
    """Generate projections for college players using average rookie PPG."""
    if not avg_rookie_ppg:
        return pd.DataFrame()

    res = supabase.table('players').select('id, position').eq('is_college', True).execute()
    college_players = res.data or []
    if not college_players:
        print(f"  No college players found for {target_season}.")
        return pd.DataFrame()

    method = CollegeProspectPPG(avg_rookie_ppg)
    records = []
    for player in college_players:
        projected = method.project_ppg([], position=player['position'])
        if projected is not None:
            records.append({
                'player_id': str(player['id']),
                'season': target_season,
                'projected_ppg': float(projected),
                'projection_method': method.name,
            })

    print(f"  Generated {len(records)} college player projections for {target_season}.")
    return pd.DataFrame(records)


def update_projections() -> None:
    """Calculate projections and upsert them into the database."""
    supabase = get_supabase_client()

    # Fetch players table once for position mapping (used by college projections)
    players_res = supabase.table('players').select('id, position').execute()
    players_df = pd.DataFrame(players_res.data or [])
    players_df = players_df.rename(columns={'id': 'player_id_ref'})

    all_records = []
    for season in TARGET_SEASONS:
        df = generate_projections_for_season(season)
        if not df.empty:
            all_records.extend(df.to_dict('records'))

        # Compute average rookie PPG from the same historical data
        historical_seasons = list(range(season - 3, season))
        multi_season_df = fetch_multi_season_stats(historical_seasons)
        avg_rookie_ppg = compute_avg_rookie_ppg(multi_season_df, players_df)
        if avg_rookie_ppg:
            print(f"  Avg rookie PPG for {season}: {avg_rookie_ppg}")
            college_df = generate_college_projections(avg_rookie_ppg, supabase, season)
            if not college_df.empty:
                all_records.extend(college_df.to_dict('records'))

    if not all_records:
        print("No projections generated.")
        return
        
    print(f"Generated {len(all_records)} total projections across {len(TARGET_SEASONS)} seasons.")
    print("Upserting to player_projections table...")
    
    # Supabase upsert requires specifying the ON CONFLICT columns.
    # We batch them to avoid large payload errors.
    batch_size = 500
    for i in range(0, len(all_records), batch_size):
        batch = all_records[i:i+batch_size]
        res = supabase.table('player_projections').upsert(
            batch, 
            on_conflict='player_id,season'
        ).execute()
        print(f"  Upserted batch {i//batch_size + 1} ({len(batch)} records)")
        
    print("Successfully updated player projections.")

if __name__ == '__main__':
    update_projections()
