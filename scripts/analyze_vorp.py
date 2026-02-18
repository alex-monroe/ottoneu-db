"""VORP (Value Over Replacement Player) analysis for positional scarcity."""

import os
import pandas as pd
from analysis_utils import (
    MIN_GAMES, SEASON, ensure_reports_dir,
    fetch_all_data, merge_data,
)
from config import BENCH_REPLACEMENT_LEVEL, WAIVER_REPLACEMENT_LEVEL


def calculate_vorp(
    merged_df: pd.DataFrame, min_games: int = MIN_GAMES
) -> tuple[pd.DataFrame, dict, dict]:
    """Calculate two-tier VORP for all qualified players.

    Args:
        merged_df: Merged DataFrame from merge_data().
        min_games: Minimum games played to qualify.

    Returns:
        (df, waiver_ppg, bench_ppg) where:
          - df has vorp_vs_waiver, vorp_vs_bench, vorp_per_game, full_season_vorp
          - waiver_ppg: replacement PPG at the waiver level per position
          - bench_ppg: replacement PPG at the bench level per position
        vorp_per_game and full_season_vorp are aliases for waiver VORP (backward compat).
    """
    # Exclude kickers from VORP analysis
    qualified = merged_df[
        (merged_df['games_played'] >= min_games) &
        (merged_df['position'] != 'K')
    ].copy()
    if qualified.empty:
        print('No qualified players found.')
        return pd.DataFrame(), {}, {}

    # Determine replacement-level PPG for each tier
    bench_ppg = {}
    waiver_ppg = {}

    for pos in BENCH_REPLACEMENT_LEVEL:
        bench_rank = BENCH_REPLACEMENT_LEVEL[pos]
        waiver_rank = WAIVER_REPLACEMENT_LEVEL[pos]

        pos_players = qualified[qualified['position'] == pos].sort_values(
            'total_points', ascending=False
        )

        if len(pos_players) >= bench_rank:
            bench_ppg[pos] = pos_players.iloc[bench_rank - 1]['ppg']
        elif not pos_players.empty:
            bench_ppg[pos] = pos_players.iloc[-1]['ppg']
        else:
            bench_ppg[pos] = 0.0

        if len(pos_players) >= waiver_rank:
            waiver_ppg[pos] = pos_players.iloc[waiver_rank - 1]['ppg']
        elif not pos_players.empty:
            waiver_ppg[pos] = pos_players.iloc[-1]['ppg']
        else:
            waiver_ppg[pos] = 0.0

    qualified['bench_replacement_ppg'] = qualified['position'].map(bench_ppg).fillna(0)
    qualified['waiver_replacement_ppg'] = qualified['position'].map(waiver_ppg).fillna(0)
    qualified['vorp_vs_bench'] = qualified['ppg'] - qualified['bench_replacement_ppg']
    qualified['vorp_vs_waiver'] = qualified['ppg'] - qualified['waiver_replacement_ppg']

    # Primary VORP = vs waiver (backward compat aliases)
    qualified['replacement_ppg'] = qualified['waiver_replacement_ppg']
    qualified['vorp_per_game'] = qualified['vorp_vs_waiver']
    qualified['full_season_vorp'] = qualified['vorp_per_game'] * 17

    return qualified, waiver_ppg, bench_ppg


def generate_report(df: pd.DataFrame, waiver_ppg: dict, bench_ppg: dict) -> str:
    """Write VORP analysis report to reports/vorp_analysis.md."""
    reports_dir = ensure_reports_dir()
    output_file = os.path.join(reports_dir, 'vorp_analysis.md')

    cols = ['name', 'position', 'nfl_team', 'ppg', 'total_points', 'games_played',
            'vorp_vs_waiver', 'vorp_vs_bench', 'full_season_vorp', 'price']

    df = df.copy()
    df['vorp_vs_waiver'] = df['vorp_vs_waiver'].round(2)
    df['vorp_vs_bench'] = df['vorp_vs_bench'].round(2)
    df['full_season_vorp'] = df['full_season_vorp'].round(1)

    with open(output_file, 'w') as f:
        f.write(f'# VORP Analysis ({SEASON})\n\n')
        f.write('Value Over Replacement Player — two tiers of replacement:\n')
        f.write('- **vs Waiver**: above the best freely available player (primary metric)\n')
        f.write('- **vs Bench**: above the worst rostered player league-wide\n\n')

        # Replacement level benchmarks
        f.write('## Replacement Level Benchmarks\n\n')
        f.write('| Position | Bench Rank | Bench PPG | Waiver Rank | Waiver PPG |\n')
        f.write('|----------|-----------|-----------|-------------|------------|\n')
        for pos in ['QB', 'RB', 'WR', 'TE']:
            bppg = bench_ppg.get(pos, 0)
            wppg = waiver_ppg.get(pos, 0)
            brank = BENCH_REPLACEMENT_LEVEL.get(pos, 0)
            wrank = WAIVER_REPLACEMENT_LEVEL.get(pos, 0)
            f.write(f'| {pos} | {brank} | {bppg:.2f} | {wrank} | {wppg:.2f} |\n')
        f.write('\n')

        # Top 20 per position
        for pos in ['QB', 'RB', 'WR', 'TE']:
            pos_df = df[df['position'] == pos].sort_values('full_season_vorp', ascending=False).head(20)
            if pos_df.empty:
                continue
            f.write(f'## Top 20 {pos} by VORP\n\n')
            f.write(pos_df[cols].to_markdown(index=False))
            f.write('\n\n')

        # Top 30 overall
        f.write('## Top 30 Overall (Cross-Position)\n\n')
        top_overall = df.sort_values('full_season_vorp', ascending=False).head(30)
        f.write(top_overall[cols].to_markdown(index=False))
        f.write('\n')

    print(f'Report generated: {output_file}')
    return output_file


if __name__ == '__main__':
    prices_df, stats_df, players_df = fetch_all_data()
    merged = merge_data(prices_df, stats_df, players_df)
    result, wpg, bpg = calculate_vorp(merged)
    if not result.empty:
        generate_report(result, wpg, bpg)
