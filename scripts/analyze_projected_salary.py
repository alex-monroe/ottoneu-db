"""Salary analysis — keep vs. cut decisions for The Witchcraft roster.

NOTE: Database salaries already reflect the end-of-season $4/$1 bump,
so `price` is the current salary going into the new season.
"""

import os
import pandas as pd
from analysis_utils import (
    MY_TEAM, SEASON, CAP_PER_TEAM, ensure_reports_dir, fetch_all_data, merge_data,
)


def analyze_projected_salary(merged_df: pd.DataFrame) -> pd.DataFrame:
    """Analyze my roster for keep/cut decisions based on salary efficiency.

    Returns a DataFrame with recommendation column.
    """
    # Filter to my team
    my_roster = merged_df[merged_df['team_name'] == MY_TEAM].copy()
    if my_roster.empty:
        print(f"No players found for team '{MY_TEAM}'.")
        return pd.DataFrame()

    # Calculate price per PPG for my players (salary already includes bump)
    my_roster['price_per_ppg'] = my_roster.apply(
        lambda r: r['price'] / r['ppg'] if r['ppg'] > 0 else 999.0, axis=1
    )

    # Calculate position medians across ALL rostered players (league context)
    all_rostered = merged_df[merged_df['team_name'].notna() & (merged_df['team_name'] != '')].copy()
    all_rostered['pppg'] = all_rostered.apply(
        lambda r: r['price'] / r['ppg'] if r['ppg'] > 0 else 999.0, axis=1
    )
    # Only include players with real production for a meaningful median
    pos_medians = (
        all_rostered[all_rostered['ppg'] > 0]
        .groupby('position')['pppg']
        .median()
        .to_dict()
    )

    # Classify each player
    def classify(row):
        median = pos_medians.get(row['position'], 999.0)
        if row['ppg'] <= 0:
            return 'Cut Candidate'
        ratio = row['price_per_ppg'] / median if median > 0 else 999.0
        if ratio <= 0.60:
            return 'Strong Keep'
        elif ratio <= 0.90:
            return 'Keep'
        elif ratio <= 1.10:
            return 'Borderline'
        else:
            return 'Cut Candidate'

    my_roster['recommendation'] = my_roster.apply(classify, axis=1)
    my_roster['price_per_ppg'] = my_roster['price_per_ppg'].round(2)

    return my_roster


def generate_report(df: pd.DataFrame) -> str:
    """Write salary analysis report to reports/projected_salary.md."""
    reports_dir = ensure_reports_dir()
    output_file = os.path.join(reports_dir, 'projected_salary.md')

    # Sort by position then recommendation priority
    rec_order = {'Strong Keep': 0, 'Keep': 1, 'Borderline': 2, 'Cut Candidate': 3}
    df = df.copy()
    df['rec_sort'] = df['recommendation'].map(rec_order)
    df = df.sort_values(['position', 'rec_sort', 'price_per_ppg'])

    cols = ['name', 'position', 'nfl_team', 'price',
            'ppg', 'total_points', 'games_played', 'price_per_ppg', 'recommendation']

    with open(output_file, 'w') as f:
        f.write(f'# Salary Analysis — {MY_TEAM} ({SEASON})\n\n')
        f.write('Keep vs. cut decisions based on salary efficiency.\n')
        f.write('`price_per_ppg` = salary / PPG. Lower is better.\n')
        f.write('Recommendation compares each player to the league-wide position median.\n\n')

        total_salary = df['price'].sum()
        cap_space = CAP_PER_TEAM - total_salary
        f.write(f'**Total salary:** ${total_salary:.0f}\n')
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
