"""Arbitration target analysis — identify opponents' vulnerable players."""

import os
import pandas as pd
from analysis_utils import (
    MY_TEAM, NUM_TEAMS, SEASON, ARB_BUDGET_PER_TEAM, ARB_MIN_PER_TEAM,
    ARB_MAX_PER_TEAM, ARB_MAX_PER_PLAYER_PER_TEAM, ensure_reports_dir,
    fetch_all_data, merge_data,
)
from analyze_surplus_value import calculate_surplus


def analyze_arbitration(merged_df: pd.DataFrame) -> pd.DataFrame:
    """Identify arbitration targets on opponents' rosters.

    A good arbitration target is a player where a $4 raise (max single-team arb)
    could push them from barely keepable to cut territory.

    Returns:
        DataFrame of arbitration targets sorted by disruption potential.
    """
    surplus_df = calculate_surplus(merged_df)
    if surplus_df.empty:
        return pd.DataFrame()

    # Filter to opponents' rostered players only (exclude free agents and my team)
    opponents = surplus_df[
        (surplus_df['team_name'].notna())
        & (surplus_df['team_name'] != '')
        & (surplus_df['team_name'] != 'FA')
        & (surplus_df['team_name'] != MY_TEAM)
    ].copy()

    if opponents.empty:
        print('No opponent players found.')
        return pd.DataFrame()

    # DB salaries already include the end-of-season bump.
    # Arbitration adds up to $4 on top of current salary.
    opponents['salary_after_arb'] = opponents['price'] + ARB_MAX_PER_PLAYER_PER_TEAM
    opponents['surplus_after_arb'] = opponents['dollar_value'] - opponents['salary_after_arb']

    # Focus on players who are close to the cut line
    # (surplus between -10 and +15 means they're in the danger zone)
    targets = opponents[
        (opponents['surplus'] >= -10)
        & (opponents['surplus'] <= 15)
        & (opponents['dollar_value'] > 1)
    ].copy()

    targets = targets.sort_values('surplus', ascending=True)

    return targets


def generate_report(targets: pd.DataFrame) -> str:
    """Write arbitration targets report to reports/arbitration_targets.md."""
    reports_dir = ensure_reports_dir()
    output_file = os.path.join(reports_dir, 'arbitration_targets.md')

    cols = ['name', 'position', 'nfl_team', 'team_name', 'price',
            'dollar_value', 'surplus',
            'salary_after_arb', 'surplus_after_arb']

    with open(output_file, 'w') as f:
        f.write(f'# Arbitration Targets ({SEASON})\n\n')
        f.write('Players on opponent rosters most vulnerable to a $4 arbitration raise.\n')
        f.write('`surplus` = dollar_value - current salary.\n')
        f.write('`surplus_after_arb` = dollar_value - salary after $4 arbitration raise.\n')
        f.write('Negative surplus = player is overpaid and likely to be cut.\n\n')
        f.write(f'**Budget:** ${ARB_BUDGET_PER_TEAM} total, '
                f'${ARB_MIN_PER_TEAM}-${ARB_MAX_PER_TEAM} per opposing team, '
                f'max ${ARB_MAX_PER_PLAYER_PER_TEAM} per player from you.\n\n')

        # Top 20 targets
        f.write('## Top 20 Arbitration Targets\n\n')
        top_targets = targets.head(20)
        if top_targets.empty:
            f.write('No suitable targets found.\n\n')
        else:
            f.write(top_targets[cols].to_markdown(index=False))
            f.write('\n\n')

        # Grouped by opponent team with suggested allocation
        if not targets.empty:
            f.write('## Targets by Opponent Team\n\n')
            f.write('Suggested allocation strategy (must give each team $1-$8):\n\n')

            opponent_teams = sorted(targets['team_name'].unique())
            num_opponents = NUM_TEAMS - 1  # excluding my team
            base_allocation = ARB_MIN_PER_TEAM  # $1 minimum per team
            remaining_budget = ARB_BUDGET_PER_TEAM - (num_opponents * base_allocation)

            # Rank teams by number of vulnerable targets
            team_target_counts = targets.groupby('team_name').size().sort_values(ascending=False)

            for team in team_target_counts.index:
                team_targets = targets[targets['team_name'] == team].head(5)
                n_targets = len(team_targets)
                # Suggest higher allocation for teams with more targets
                suggested = min(
                    ARB_MAX_PER_TEAM,
                    base_allocation + min(remaining_budget, n_targets * 2)
                )
                f.write(f'### {team} (suggested: ${suggested:.0f})\n\n')
                team_cols = ['name', 'position', 'price',
                             'dollar_value', 'surplus', 'surplus_after_arb']
                f.write(team_targets[team_cols].to_markdown(index=False))
                f.write('\n\n')

    print(f'Report generated: {output_file}')
    return output_file


if __name__ == '__main__':
    prices_df, stats_df, players_df = fetch_all_data()
    merged = merge_data(prices_df, stats_df, players_df)
    targets = analyze_arbitration(merged)
    if not targets.empty:
        generate_report(targets)
