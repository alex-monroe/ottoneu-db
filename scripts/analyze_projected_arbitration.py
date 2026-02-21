"""Projected arbitration analysis — uses recency-weighted multi-year PPG projections.

Unlike analyze_arbitration.py (which uses observed current-season PPG), this script
projects each player's future PPG via WeightedAveragePPG before running VORP → surplus
→ arbitration targeting. This gives a more forward-looking view of player value since
arbitration determines *next year's* salaries.
"""

from __future__ import annotations
import os
import pandas as pd
from config import (
    get_supabase_client,
    SEASON,
    REPLACEMENT_LEVELS,
    ARBITRATION_BUDGET,
    LEAGUE_PARAMS,
    ARBITRATION_MAX_RAISE,
    ARBITRATION_MIN_SURPLUS
)
from analysis_utils import (
    MY_TEAM,
    ensure_reports_dir, fetch_all_data, merge_data, fetch_player_data, calculate_vorp
)
from analyze_arbitration import analyze_arbitration


def apply_projections(merged_df: pd.DataFrame, projections_df: pd.DataFrame) -> pd.DataFrame:
    """Replace observed PPG with projected PPG.

    Preserves the original PPG as 'observed_ppg' for display purposes.
    Drops players with no projection (e.g. brand-new players with 0 historical seasons).

    Args:
        merged_df: Output of merge_data() — contains current-season data.
        projections_df: DataFrame with player_id, projected_ppg, and projection_method.

    Returns:
        Modified DataFrame with ppg = projected_ppg and observed_ppg = original ppg.
    """
    df = merged_df.copy()
    df['observed_ppg'] = df['ppg']
    df = df.merge(projections_df[['player_id', 'projected_ppg', 'projection_method']],
                  on='player_id', how='left')
    df['ppg'] = df['projected_ppg']
    df = df.dropna(subset=['ppg'])
    return df


def generate_report(targets: pd.DataFrame) -> str:
    """Write projected arbitration targets report to reports/projected_arbitration.md."""
    reports_dir = ensure_reports_dir()
    output_file = os.path.join(reports_dir, 'projected_arbitration.md')

    cols = ['name', 'position', 'nfl_team', 'team_name', 'price',
            'observed_ppg', 'ppg', 'dollar_value', 'surplus',
            'salary_after_arb', 'surplus_after_arb', 'projection_method']
    display_cols = [c for c in cols if c in targets.columns]

    with open(output_file, 'w') as f:
        f.write(f'# Projected Arbitration Targets ({SEASON})\n\n')
        f.write('PPG projected via various methods (see `projection_method` column).\n\n')
        f.write('`ppg` = projected PPG, `observed_ppg` = actual 2024 PPG.\n')
        f.write('`surplus` = projected dollar_value − current salary.\n')
        f.write('`surplus_after_arb` = projected dollar_value − salary after $4 raise.\n\n')
        f.write(f'**Budget:** ${ARBITRATION_BUDGET} total, '
                f'${LEAGUE_PARAMS["ARBITRATION_MIN_PER_TEAM"]}–${LEAGUE_PARAMS["ARBITRATION_MAX_PER_TEAM"]} per opposing team, '
                f'max ${LEAGUE_PARAMS["ARBITRATION_MAX_PER_PLAYER_PER_TEAM"]} per player from you.\n\n')

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

            num_opponents = LEAGUE_PARAMS['NUM_TEAMS'] - 1
            base_allocation = LEAGUE_PARAMS['ARBITRATION_MIN_PER_TEAM']
            remaining_budget = ARBITRATION_BUDGET - (num_opponents * base_allocation)
            team_target_counts = targets.groupby('team_name').size().sort_values(ascending=False)
            team_cols = ['name', 'position', 'price', 'observed_ppg', 'ppg',
                         'dollar_value', 'surplus', 'surplus_after_arb', 'projection_method']
            display_team_cols = [c for c in team_cols if c in targets.columns]

            for team in team_target_counts.index:
                team_targets = targets[targets['team_name'] == team].head(5)
                n_targets = len(team_targets)
                suggested = min(
                    LEAGUE_PARAMS['ARBITRATION_MAX_PER_TEAM'],
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

    print(f"Fetching {SEASON} projections from database...")
    supabase = get_supabase_client()
    res = supabase.table('player_projections').select('player_id,projected_ppg,projection_method').eq('season', SEASON).execute()

    projections: dict[str, tuple[float, str]] = {}
    for row in res.data:
        projections[row['player_id']] = (row['projected_ppg'], row['projection_method'])

    print(f"Found {len(projections)} projected players.")

    # Convert projection map to a dataframe suitable for merging
    proj_rows = []
    for pid, (proj_ppg, method) in projections.items():
        proj_rows.append({'player_id': pid, 'projected_ppg': proj_ppg, 'projection_method': method})
    projections_df = pd.DataFrame(proj_rows)

    projected_merged = apply_projections(merged, projections_df)
    print(f'{len(projected_merged)} players after applying projections '
          f'(dropped {len(merged) - len(projected_merged)} with no history).')

    targets = analyze_arbitration(projected_merged)
    if not targets.empty:
        # Preserve observed_ppg and projection_method through the arbitration pipeline
        if 'observed_ppg' in projected_merged.columns:
            obs_ppg = projected_merged.set_index('player_id')['observed_ppg']
            targets['observed_ppg'] = targets['player_id'].map(obs_ppg)
        generate_report(targets)
    else:
        print('No arbitration targets found.')
