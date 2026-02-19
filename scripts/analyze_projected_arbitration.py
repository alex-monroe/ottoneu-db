"""Projected arbitration analysis — uses recency-weighted multi-year PPG projections.

Unlike analyze_arbitration.py (which uses observed current-season PPG), this script
projects each player's future PPG via WeightedAveragePPG before running VORP → surplus
→ arbitration targeting. This gives a more forward-looking view of player value since
arbitration determines *next year's* salaries.
"""

from __future__ import annotations
import os
import pandas as pd
from analysis_utils import (
    MY_TEAM, NUM_TEAMS, SEASON, HISTORICAL_SEASONS,
    ARB_BUDGET_PER_TEAM, ARB_MIN_PER_TEAM, ARB_MAX_PER_TEAM,
    ARB_MAX_PER_PLAYER_PER_TEAM, MIN_GAMES,
    ensure_reports_dir, fetch_all_data, fetch_multi_season_stats, merge_data,
)
from analyze_arbitration import analyze_arbitration
from projection_methods import WeightedAveragePPG, SeasonData


def build_projection_map(multi_season_df: pd.DataFrame) -> dict[str, float]:
    """Build player_id → projected_ppg mapping from multi-season stats.

    Groups historical stats by player_id and applies WeightedAveragePPG.

    Returns:
        Dict mapping player_id (str) → projected PPG. Players with insufficient
        data (all games = 0) are excluded.
    """
    method = WeightedAveragePPG()
    projection_map: dict[str, float] = {}

    for player_id, group in multi_season_df.groupby('player_id'):
        history: list[SeasonData] = [
            {
                'season': int(row['season']),
                'ppg': float(row['ppg']),
                'games_played': int(row['games_played']),
            }
            for _, row in group.iterrows()
        ]
        projected = method.project_ppg(history)
        if projected is not None:
            projection_map[str(player_id)] = projected

    return projection_map


def apply_projections(merged_df: pd.DataFrame, projection_map: dict[str, float]) -> pd.DataFrame:
    """Replace observed PPG with projected PPG.

    Preserves the original PPG as 'observed_ppg' for display purposes.
    Drops players with no projection (e.g. brand-new players with 0 historical seasons).

    Args:
        merged_df: Output of merge_data() — contains current-season data.
        projection_map: player_id → projected_ppg.

    Returns:
        Modified DataFrame with ppg = projected_ppg and observed_ppg = original ppg.
    """
    df = merged_df.copy()
    df['observed_ppg'] = df['ppg']
    df['projected_ppg'] = df['player_id'].astype(str).map(projection_map)
    df['ppg'] = df['projected_ppg']
    df = df.dropna(subset=['ppg'])
    return df


def generate_report(targets: pd.DataFrame) -> str:
    """Write projected arbitration targets report to reports/projected_arbitration.md."""
    reports_dir = ensure_reports_dir()
    output_file = os.path.join(reports_dir, 'projected_arbitration.md')

    cols = ['name', 'position', 'nfl_team', 'team_name', 'price',
            'observed_ppg', 'ppg', 'dollar_value', 'surplus',
            'salary_after_arb', 'surplus_after_arb']
    display_cols = [c for c in cols if c in targets.columns]

    with open(output_file, 'w') as f:
        f.write(f'# Projected Arbitration Targets ({SEASON})\n\n')
        f.write('PPG projected via **games-weighted, recency-weighted average** ')
        f.write('(3-year window; weights 0.50/0.30/0.20 most-to-least recent, ')
        f.write('each scaled by games_played/17).\n\n')
        f.write('`ppg` = projected PPG, `observed_ppg` = actual 2024 PPG.\n')
        f.write('`surplus` = projected dollar_value − current salary.\n')
        f.write('`surplus_after_arb` = projected dollar_value − salary after $4 raise.\n\n')
        f.write(f'**Budget:** ${ARB_BUDGET_PER_TEAM} total, '
                f'${ARB_MIN_PER_TEAM}–${ARB_MAX_PER_TEAM} per opposing team, '
                f'max ${ARB_MAX_PER_PLAYER_PER_TEAM} per player from you.\n\n')

        f.write('## Top 20 Projected Arbitration Targets\n\n')
        top = targets.head(20)
        if top.empty:
            f.write('No suitable targets found.\n\n')
        else:
            f.write(top[display_cols].to_markdown(index=False))
            f.write('\n\n')

        if not targets.empty:
            f.write('## Targets by Opponent Team\n\n')
            f.write('Suggested allocation strategy (must give each team $1–$8):\n\n')

            num_opponents = NUM_TEAMS - 1
            base_allocation = ARB_MIN_PER_TEAM
            remaining_budget = ARB_BUDGET_PER_TEAM - (num_opponents * base_allocation)
            team_target_counts = targets.groupby('team_name').size().sort_values(ascending=False)
            team_cols = ['name', 'position', 'price', 'observed_ppg', 'ppg',
                         'dollar_value', 'surplus', 'surplus_after_arb']
            display_team_cols = [c for c in team_cols if c in targets.columns]

            for team in team_target_counts.index:
                team_targets = targets[targets['team_name'] == team].head(5)
                n_targets = len(team_targets)
                suggested = min(
                    ARB_MAX_PER_TEAM,
                    base_allocation + min(remaining_budget, n_targets * 2)
                )
                f.write(f'### {team} (suggested: ${suggested:.0f})\n\n')
                f.write(team_targets[display_team_cols].to_markdown(index=False))
                f.write('\n\n')

    print(f'Report generated: {output_file}')
    return output_file


if __name__ == '__main__':
    # Fetch current-season data (for prices, roster, current stats)
    prices_df, stats_df, players_df = fetch_all_data()
    merged = merge_data(prices_df, stats_df, players_df)

    if merged.empty:
        print('ERROR: No current-season data found.')
        exit(1)

    # Fetch historical stats for projection
    multi_season_df = fetch_multi_season_stats(HISTORICAL_SEASONS)
    if multi_season_df.empty:
        print('WARNING: No historical stats found. Falling back to observed PPG.')
        projected_merged = merged
    else:
        projection_map = build_projection_map(multi_season_df)
        print(f'Built projections for {len(projection_map)} players.')
        projected_merged = apply_projections(merged, projection_map)
        print(f'{len(projected_merged)} players after applying projections '
              f'(dropped {len(merged) - len(projected_merged)} with no history).')

    targets = analyze_arbitration(projected_merged)
    if not targets.empty:
        # Preserve observed_ppg through the arbitration pipeline
        if 'observed_ppg' in projected_merged.columns:
            obs_ppg = projected_merged.set_index('player_id')['observed_ppg']
            targets['observed_ppg'] = targets['player_id'].map(obs_ppg)
        generate_report(targets)
    else:
        print('No arbitration targets found.')
