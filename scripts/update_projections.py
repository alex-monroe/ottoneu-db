"""Script to generate player projections and update the player_projections database table.

This script acts as a bridge to the new feature_projections system.
It generates projections using the best configured model (v8_age_regression)
and promotes them to the production table. It also generates and upserts
projections for college prospects.
"""

import os
import subprocess
import sys
import pandas as pd

# Setup paths
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.append(script_dir)
from config import get_supabase_client, MIN_GAMES
from analysis_utils import fetch_multi_season_stats
from projection_methods import CollegeProspectPPG

cli_path = os.path.join(script_dir, "feature_projections", "cli.py")
TARGET_SEASONS = [2024, 2025, 2026]
ACTIVE_MODEL = "v12_no_qb_trajectory"


def compute_avg_rookie_ppg(multi_season_df: pd.DataFrame, players_df: pd.DataFrame,
                           min_games: int = MIN_GAMES) -> dict[str, float]:
    """Compute average PPG of first-year NFL players by position."""
    if multi_season_df.empty or players_df.empty:
        return {}
    pos_map = dict(zip(players_df['player_id_ref'], players_df['position']))
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
                                  college_players: list[dict], target_season: int) -> pd.DataFrame:
    """Generate projections for college players using average rookie PPG."""
    if not avg_rookie_ppg:
        return pd.DataFrame()
    if not college_players:
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
    return pd.DataFrame(records)


def upsert_college_projections():
    """Generate and upsert rookie/college-prospect projections.

    Covers two flavors of "no NFL track record yet" players:
      - is_college=True: still in college (Ottoneu allows rostering them).
      - Recently drafted: is_college=False with a draft_capital row but no
        player_stats history. After the draft we flip is_college off, so
        relying on that flag alone would orphan their projection.
    Both groups receive the position-average rookie PPG.
    """
    supabase = get_supabase_client()
    # Paginated fetch — the players table exceeds the 1000-row default page size
    # and a plain .execute() silently truncates, dropping newly-inserted rookies.
    from config import fetch_all_rows
    players_data = fetch_all_rows(supabase, 'players', 'id, position, is_college')
    players_df = pd.DataFrame(players_data)
    players_df = players_df.rename(columns={'id': 'player_id_ref'})

    if players_df.empty:
        return

    drafted_no_stats: set[str] = set()
    if 'is_college' in players_df.columns:
        # Players with any player_stats row are excluded — they go through the
        # full feature_projections pipeline. We only need the rookies.
        all_stats = fetch_all_rows(supabase, 'player_stats', 'player_id')
        with_stats = {r['player_id'] for r in all_stats}
        all_draft = fetch_all_rows(supabase, 'draft_capital', 'player_id')
        drafted = {r['player_id'] for r in all_draft}
        non_college_ids = set(
            players_df[players_df['is_college'] == False]['player_id_ref'].tolist()  # noqa: E712
        )
        drafted_no_stats = (drafted & non_college_ids) - with_stats

    college_players = []
    if 'is_college' in players_df.columns:
        rookie_mask = (players_df['is_college'] == True) | (
            players_df['player_id_ref'].isin(drafted_no_stats)
        )
        rookie_df = players_df[rookie_mask]
        for _, row in rookie_df.iterrows():
            college_players.append({'id': row['player_id_ref'], 'position': row['position']})

    all_records = []
    for season in TARGET_SEASONS:
        historical_seasons = list(range(season - 3, season))
        multi_season_df = fetch_multi_season_stats(historical_seasons)
        avg_rookie_ppg = compute_avg_rookie_ppg(multi_season_df, players_df)
        if avg_rookie_ppg:
            print(f"  Avg rookie PPG for {season}: {avg_rookie_ppg}")
            college_df = generate_college_projections(avg_rookie_ppg, college_players, season)
            if not college_df.empty:
                all_records.extend(college_df.to_dict('records'))

    if all_records:
        print(f"Upserting {len(all_records)} college projections...")
        batch_size = 500
        for i in range(0, len(all_records), batch_size):
            batch = all_records[i:i+batch_size]
            supabase.table('player_projections').upsert(
                batch, on_conflict='player_id,season'
            ).execute()


def update_projections() -> None:
    """Calculate projections and upsert them into the database."""
    print(f"Generating projections across seasons {TARGET_SEASONS} using model '{ACTIVE_MODEL}'...")
    try:
        # 1. Run the v8 model
        subprocess.run(
            [sys.executable, cli_path, "run", "--model", ACTIVE_MODEL, "--seasons", ",".join(map(str, TARGET_SEASONS))],
            check=True
        )
        # 2. Promote the v8 model
        subprocess.run(
            [sys.executable, cli_path, "promote", "--model", ACTIVE_MODEL],
            check=True
        )
        # 3. Handle college projections (v8 model doesn't handle players with 0 NFL history)
        upsert_college_projections()
        
        print("Successfully updated player projections.")
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Failed to update projections: {e}")
        sys.exit(1)


if __name__ == '__main__':
    update_projections()

