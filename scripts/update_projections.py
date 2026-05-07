"""Script to generate player projections and update the player_projections database table.

This script acts as a bridge to the new feature_projections system. It looks
up the model currently flagged ``is_active=True`` in ``projection_models``,
runs it for ``TARGET_SEASONS``, promotes its outputs into ``player_projections``,
and then upserts rookie/college-prospect projections for players with no
NFL track record.

To switch which model the website serves, promote a different model:
    python scripts/feature_projections/cli.py promote --model v25_draft_capital_residual
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


def get_active_model_name() -> str:
    """Return the name of the model currently flagged is_active=True.

    Raises a clear error if zero or multiple models are active so the operator
    can fix the inconsistency before regenerating production projections.
    """
    supabase = get_supabase_client()
    res = supabase.table("projection_models").select("name").eq("is_active", True).execute()
    rows = res.data or []
    if not rows:
        raise RuntimeError(
            "No projection_models row has is_active=True. Promote one first:\n"
            "  python scripts/feature_projections/cli.py promote --model <name>"
        )
    if len(rows) > 1:
        names = ", ".join(r["name"] for r in rows)
        raise RuntimeError(
            f"Multiple projection_models flagged is_active=True ({names}). "
            "Promote a single model to disambiguate."
        )
    return rows[0]["name"]


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
        # Players with real NFL history go through the full feature_projections
        # pipeline. Rows with games_played == 0 don't count — the roster scraper
        # writes a placeholder stats row (0 games) when it first sees a player,
        # which would otherwise mask actual rookies (e.g. drafted college players
        # who were rostered before they took an NFL snap).
        all_stats = fetch_all_rows(supabase, 'player_stats', 'player_id, games_played')
        with_stats = {
            r['player_id'] for r in all_stats if (r.get('games_played') or 0) > 0
        }
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
    active_model = get_active_model_name()
    print(f"Generating projections across seasons {TARGET_SEASONS} using model '{active_model}'...")
    try:
        # 1. Run the active model for the target seasons.
        subprocess.run(
            [sys.executable, cli_path, "run", "--model", active_model, "--seasons", ",".join(map(str, TARGET_SEASONS))],
            check=True
        )
        # 2. Promote into player_projections.
        subprocess.run(
            [sys.executable, cli_path, "promote", "--model", active_model],
            check=True
        )
        # 3. Rookie/college fallback — feature_projections only emits rows for
        # players with NFL stats history, so 0-history players are layered on top.
        upsert_college_projections()

        print("Successfully updated player projections.")
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Failed to update projections: {e}")
        sys.exit(1)


if __name__ == '__main__':
    update_projections()

