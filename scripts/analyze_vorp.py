"""VORP (Value Over Replacement Player) analysis for positional scarcity."""

import os
import pandas as pd
from analysis_utils import (
    REPLACEMENT_LEVEL, MIN_GAMES, SEASON, ensure_reports_dir,
    fetch_all_data, merge_data,
)


def calculate_vorp(merged_df: pd.DataFrame, min_games: int = MIN_GAMES) -> pd.DataFrame:
    """Calculate VORP for all players.

    Args:
        merged_df: Merged DataFrame from merge_data().
        min_games: Minimum games played to qualify.

    Returns:
        DataFrame with added columns: replacement_ppg, vorp_per_game, full_season_vorp.
    """
    qualified = merged_df[merged_df['games_played'] >= min_games].copy()
    if qualified.empty:
        print('No qualified players found.')
        return pd.DataFrame()

    # Determine replacement-level PPG per position
    replacement_ppg = {}
    for pos, rank in REPLACEMENT_LEVEL.items():
        pos_players = qualified[qualified['position'] == pos].sort_values(
            'total_points', ascending=False
        )
        if len(pos_players) >= rank:
            replacement_ppg[pos] = pos_players.iloc[rank - 1]['ppg']
        elif not pos_players.empty:
            # If fewer players than rank, use the worst qualifier
            replacement_ppg[pos] = pos_players.iloc[-1]['ppg']
        else:
            replacement_ppg[pos] = 0.0

    qualified['replacement_ppg'] = qualified['position'].map(replacement_ppg).fillna(0)
    qualified['vorp_per_game'] = qualified['ppg'] - qualified['replacement_ppg']
    qualified['full_season_vorp'] = qualified['vorp_per_game'] * 17

    return qualified, replacement_ppg


def generate_report(df: pd.DataFrame, replacement_ppg: dict) -> str:
    """Write VORP analysis report to reports/vorp_analysis.md."""
    reports_dir = ensure_reports_dir()
    output_file = os.path.join(reports_dir, 'vorp_analysis.md')

    cols = ['name', 'position', 'nfl_team', 'ppg', 'total_points', 'games_played',
            'vorp_per_game', 'full_season_vorp', 'price']

    df = df.copy()
    df['vorp_per_game'] = df['vorp_per_game'].round(2)
    df['full_season_vorp'] = df['full_season_vorp'].round(1)

    with open(output_file, 'w') as f:
        f.write(f'# VORP Analysis ({SEASON})\n\n')
        f.write('Value Over Replacement Player — measures how much better a player is\n')
        f.write('than the replacement-level player at his position.\n\n')

        # Replacement level benchmarks
        f.write('## Replacement Level Benchmarks\n\n')
        f.write('| Position | Replacement Rank | Replacement PPG |\n')
        f.write('|----------|-----------------|----------------|\n')
        for pos in ['QB', 'RB', 'WR', 'TE', 'K']:
            rpg = replacement_ppg.get(pos, 0)
            rank = REPLACEMENT_LEVEL.get(pos, 0)
            f.write(f'| {pos} | {rank} | {rpg:.2f} |\n')
        f.write('\n')

        # Top 20 per position
        for pos in ['QB', 'RB', 'WR', 'TE', 'K']:
            pos_df = df[df['position'] == pos].sort_values('full_season_vorp', ascending=False).head(20)
            if pos_df.empty:
                continue
            f.write(f'## Top 20 {pos} by VORP\n\n')
            f.write(pos_df[cols].to_markdown(index=False))
            f.write('\n\n')

        # Top 30 overall (cross-position — shows superflex QB premium)
        f.write('## Top 30 Overall (Cross-Position)\n\n')
        top_overall = df.sort_values('full_season_vorp', ascending=False).head(30)
        f.write(top_overall[cols].to_markdown(index=False))
        f.write('\n')

    print(f'Report generated: {output_file}')
    return output_file


if __name__ == '__main__':
    prices_df, stats_df, players_df = fetch_all_data()
    merged = merge_data(prices_df, stats_df, players_df)
    result, rpg = calculate_vorp(merged)
    if not result.empty:
        generate_report(result, rpg)
