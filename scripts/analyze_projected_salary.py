"""Salary analysis — keep vs. cut decisions for The Witchcraft roster.

Uses surplus value (dollar_value - salary) which accounts for positional
scarcity via VORP. This correctly values QBs higher in superflex.

NOTE: Database salaries already reflect the end-of-season $4/$1 bump,
so `price` is the current salary going into the new season.
"""

import os
import pandas as pd
from analysis_utils import (
    MY_TEAM, SEASON, CAP_PER_TEAM, ensure_reports_dir, fetch_all_data, merge_data,
)
from analyze_surplus_value import calculate_surplus


def analyze_projected_salary(merged_df: pd.DataFrame) -> pd.DataFrame:
    """Analyze my roster for keep/cut decisions based on surplus value.

    Returns a DataFrame with recommendation column.
    """
    surplus_df = calculate_surplus(merged_df)
    if surplus_df.empty:
        return pd.DataFrame()

    # Filter to my team
    my_roster = surplus_df[surplus_df['team_name'] == MY_TEAM].copy()
    if my_roster.empty:
        print(f"No players found for team '{MY_TEAM}'.")
        return pd.DataFrame()

    # Classify based on surplus value thresholds
    def classify(surplus):
        if surplus >= 10:
            return 'Strong Keep'
        elif surplus >= 0:
            return 'Keep'
        elif surplus >= -5:
            return 'Borderline'
        else:
            return 'Cut Candidate'

    my_roster['recommendation'] = my_roster['surplus'].apply(classify)

    return my_roster


def generate_report(df: pd.DataFrame) -> str:
    """Write salary analysis report to reports/projected_salary.md."""
    reports_dir = ensure_reports_dir()
    output_file = os.path.join(reports_dir, 'projected_salary.md')

    # Sort by position then recommendation priority
    rec_order = {'Strong Keep': 0, 'Keep': 1, 'Borderline': 2, 'Cut Candidate': 3}
    df = df.copy()
    df['rec_sort'] = df['recommendation'].map(rec_order)
    df = df.sort_values(['position', 'rec_sort', 'surplus'], ascending=[True, True, False])

    cols = ['name', 'position', 'nfl_team', 'price', 'dollar_value', 'surplus',
            'ppg', 'total_points', 'games_played', 'recommendation']

    with open(output_file, 'w') as f:
        f.write(f'# Salary Analysis — {MY_TEAM} ({SEASON})\n\n')
        f.write('Keep vs. cut decisions based on surplus value (dollar_value - salary).\n')
        f.write('Surplus accounts for positional scarcity via VORP, correctly valuing QBs in superflex.\n\n')
        f.write('**Thresholds:** Strong Keep ≥ $10, Keep ≥ $0, Borderline ≥ -$5, Cut < -$5\n\n')

        total_salary = df['price'].sum()
        total_value = df['dollar_value'].sum()
        total_surplus = df['surplus'].sum()
        cap_space = CAP_PER_TEAM - total_salary
        f.write(f'**Total salary:** ${total_salary:.0f}  \n')
        f.write(f'**Total value:** ${total_value:.0f}  \n')
        f.write(f'**Total surplus:** ${total_surplus:.0f}  \n')
        f.write(f'**Cap space:** ${cap_space:.0f}\n\n')

        for pos in ['QB', 'RB', 'WR', 'TE', 'K']:
            pos_df = df[df['position'] == pos]
            if pos_df.empty:
                continue
            f.write(f'## {pos}\n\n')
            f.write(pos_df[cols].to_markdown(index=False))
            f.write('\n\n')

    print(f'Report generated: {output_file}')
    return output_file


if __name__ == '__main__':
    prices_df, stats_df, players_df = fetch_all_data()
    merged = merge_data(prices_df, stats_df, players_df)
    result = analyze_projected_salary(merged)
    if not result.empty:
        generate_report(result)
