"""Surplus value analysis — dollar value vs. salary for all players."""

import os
import pandas as pd
from analysis_utils import (
    MY_TEAM, NUM_TEAMS, CAP_PER_TEAM, SEASON, ensure_reports_dir,
    fetch_all_data, merge_data,
)
from analyze_vorp import calculate_vorp


def calculate_surplus(merged_df: pd.DataFrame) -> pd.DataFrame:
    """Calculate surplus value for all players.

    Returns:
        DataFrame with added columns: dollar_value, surplus.
    """
    vorp_df, _ = calculate_vorp(merged_df)
    if vorp_df.empty:
        return pd.DataFrame()

    # Convert VORP to dollar value
    total_positive_vorp = vorp_df.loc[vorp_df['full_season_vorp'] > 0, 'full_season_vorp'].sum()
    if total_positive_vorp == 0:
        print('No positive VORP found — cannot calculate dollar values.')
        return pd.DataFrame()

    # ~87.5% of total league cap goes to above-replacement players
    total_cap = NUM_TEAMS * CAP_PER_TEAM * 0.875
    dollar_per_vorp = total_cap / total_positive_vorp

    vorp_df['dollar_value'] = (vorp_df['full_season_vorp'] * dollar_per_vorp).clip(lower=1).round(0)
    vorp_df['surplus'] = vorp_df['dollar_value'] - vorp_df['price']

    return vorp_df


def generate_report(df: pd.DataFrame) -> str:
    """Write surplus value report to reports/surplus_value.md."""
    reports_dir = ensure_reports_dir()
    output_file = os.path.join(reports_dir, 'surplus_value.md')

    core_cols = ['name', 'position', 'nfl_team', 'price', 'dollar_value',
                 'surplus', 'ppg', 'full_season_vorp', 'team_name']

    df = df.copy()
    df['full_season_vorp'] = df['full_season_vorp'].round(1)

    with open(output_file, 'w') as f:
        f.write(f'# Surplus Value Rankings ({SEASON})\n\n')
        f.write('`dollar_value` = what the player is worth based on VORP.\n')
        f.write('`surplus` = dollar_value - current salary. Positive = bargain.\n\n')

        # Top 30 surplus (best bargains / auction targets)
        f.write('## Top 30 Surplus (Best Bargains)\n\n')
        top_surplus = df.sort_values('surplus', ascending=False).head(30)
        f.write(top_surplus[core_cols].to_markdown(index=False))
        f.write('\n\n')

        # Bottom 30 surplus (most overpaid)
        f.write('## Bottom 30 Surplus (Most Overpaid)\n\n')
        bottom_surplus = df.sort_values('surplus', ascending=True).head(30)
        f.write(bottom_surplus[core_cols].to_markdown(index=False))
        f.write('\n\n')

        # My team's roster
        my_team = df[df['team_name'] == MY_TEAM].sort_values('surplus', ascending=False)
        if not my_team.empty:
            f.write(f'## {MY_TEAM} Roster — Surplus Breakdown\n\n')
            my_cols = ['name', 'position', 'price', 'dollar_value', 'surplus',
                       'ppg', 'full_season_vorp']
            f.write(my_team[my_cols].to_markdown(index=False))
            f.write(f'\n\n**Total salary:** ${my_team["price"].sum():.0f}  \n')
            f.write(f'**Total value:** ${my_team["dollar_value"].sum():.0f}  \n')
            f.write(f'**Total surplus:** ${my_team["surplus"].sum():.0f}\n\n')

        # Free agents with highest dollar value
        free_agents = df[df['team_name'].isna() | (df['team_name'] == '') | (df['team_name'] == 'FA')]
        if not free_agents.empty:
            f.write('## Top Free Agents by Dollar Value (Waiver Targets)\n\n')
            fa_cols = ['name', 'position', 'nfl_team', 'dollar_value', 'ppg', 'full_season_vorp']
            top_fa = free_agents.sort_values('dollar_value', ascending=False).head(20)
            f.write(top_fa[fa_cols].to_markdown(index=False))
            f.write('\n\n')

        # Per-team summary
        rostered = df[df['team_name'].notna() & (df['team_name'] != '') & (df['team_name'] != 'FA')]
        if not rostered.empty:
            f.write('## Per-Team Summary\n\n')
            team_summary = (
                rostered.groupby('team_name')
                .agg(
                    players=('name', 'count'),
                    total_salary=('price', 'sum'),
                    total_value=('dollar_value', 'sum'),
                    total_surplus=('surplus', 'sum'),
                )
                .sort_values('total_surplus', ascending=False)
                .reset_index()
            )
            team_summary['total_salary'] = team_summary['total_salary'].round(0)
            team_summary['total_value'] = team_summary['total_value'].round(0)
            team_summary['total_surplus'] = team_summary['total_surplus'].round(0)
            f.write(team_summary.to_markdown(index=False))
            f.write('\n')

    print(f'Report generated: {output_file}')
    return output_file


if __name__ == '__main__':
    prices_df, stats_df, players_df = fetch_all_data()
    merged = merge_data(prices_df, stats_df, players_df)
    result = calculate_surplus(merged)
    if not result.empty:
        generate_report(result)
