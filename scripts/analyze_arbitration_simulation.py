"""Arbitration simulation — predict how all teams will allocate arbitration budgets.

This analysis simulates independent decision-making by all 12 teams, where each team:
1. Has slightly different value estimates for players (represents different evaluation philosophies)
2. Targets opponents' high-surplus players to maximize disruption
3. Must respect all arbitration constraints ($1-$8 per team, max $4 per player per team)

NOTE: In Ottoneu, teams can ONLY arbitrate opponents' players, not their own.

Output shows expected arbitration raises across multiple simulation runs, helping identify:
- Expected raises to your own roster (from opponent targeting)
- Which opponent players will receive heavy raises (avoid wasting your budget)
- Which opponent players are vulnerable (good targets for you)
- Optimal arbitration strategy given predicted opponent behavior
"""

import os
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple
from analysis_utils import (
    MY_TEAM, NUM_TEAMS, SEASON, ARB_BUDGET_PER_TEAM, ARB_MIN_PER_TEAM,
    ARB_MAX_PER_TEAM, ARB_MAX_PER_PLAYER_PER_TEAM, ARB_MAX_PER_PLAYER_LEAGUE,
    ensure_reports_dir, fetch_all_data, merge_data,
)
from analyze_surplus_value import calculate_surplus


# === Simulation Parameters ===
NUM_SIMULATIONS = 100  # Number of Monte Carlo simulation runs
VALUE_VARIATION = 0.20  # Each team's value estimates vary ±20% from base


def generate_team_valuations(
    players: pd.DataFrame,
    num_teams: int,
    variation: float
) -> Dict[str, pd.DataFrame]:
    """Generate different value estimates for each team.

    Each team evaluates players differently based on their roster needs,
    risk tolerance, and projection methodology. We model this by adding
    random variation to the base dollar_value calculation.

    Args:
        players: DataFrame with base dollar_value calculations
        num_teams: Number of teams in league
        variation: Standard deviation of valuation differences (e.g., 0.20 = ±20%)

    Returns:
        Dictionary mapping team_name -> DataFrame with team-specific valuations
    """
    all_teams = sorted(players['team_name'].unique())
    # Ensure we have exactly num_teams (including FA)
    rostered_teams = [t for t in all_teams if t != 'FA' and t != '']

    team_valuations = {}

    for team in rostered_teams:
        # Create a copy of the players dataframe
        team_df = players.copy()

        # Generate team-specific value multiplier (lognormal distribution centered at 1.0)
        # This ensures values stay positive and variation is percentage-based
        np.random.seed(hash(team) % (2**32))  # Deterministic per team but random
        multiplier = np.random.lognormal(
            mean=0,  # ln(1) = 0, so median = 1.0
            sigma=variation,
            size=len(team_df)
        )

        # Apply team-specific valuation
        team_df['team_value_estimate'] = team_df['dollar_value'] * multiplier
        team_df['team_value_estimate'] = team_df['team_value_estimate'].clip(lower=0)

        team_valuations[team] = team_df

    return team_valuations


def allocate_team_budget(
    team_name: str,
    team_valuations: pd.DataFrame,
    all_teams: List[str],
    budget: float,
    min_per_team: float,
    max_per_team: float,
    max_per_player: float
) -> Dict[Tuple[str, str], float]:
    """Allocate one team's arbitration budget to opponent players only.

    In Ottoneu arbitration, teams can ONLY give money to opponents' players,
    not their own. Strategy focuses on targeting high-surplus players to
    maximize disruption to opponents' rosters.

    Args:
        team_name: Name of the team allocating budget
        team_valuations: This team's value estimates for all players
        all_teams: List of all team names
        budget: Total arbitration budget
        min_per_team: Minimum to give each opposing team
        max_per_team: Maximum to give each opposing team
        max_per_player: Maximum to give to any single player

    Returns:
        Dictionary mapping (player_name, player_team) -> arbitration amount
    """
    opponents = [t for t in all_teams if t != team_name and t != 'FA' and t != '']
    num_opponents = len(opponents)

    # Start with minimum allocation to each opponent
    allocations: Dict[Tuple[str, str], float] = {}
    remaining_budget = budget - (num_opponents * min_per_team)

    # Get all opponent players
    opponent_players = team_valuations[
        (team_valuations['team_name'].isin(opponents)) &
        (team_valuations['team_value_estimate'] > 1)
    ].copy()

    opponent_players['surplus'] = (
        opponent_players['team_value_estimate'] - opponent_players['price']
    )

    # Target players with high surplus (likely keepers for opponents = good targets)
    # Sort by surplus to prioritize the most valuable targets
    targets = opponent_players[
        opponent_players['surplus'] > 0
    ].sort_values('surplus', ascending=False).head(30)

    # Distribute budget across targets
    for _, player in targets.iterrows():
        if remaining_budget <= 0:
            break

        target_team = player['team_name']
        # Calculate how much we've already allocated to this opponent team
        current_to_team = sum(
            amt for (name, team), amt in allocations.items()
            if team == target_team
        )

        # Don't exceed max per team
        available_for_team = max_per_team - current_to_team
        if available_for_team < 0.5:  # Not enough room
            continue

        # Allocate to this player (proportional to remaining budget)
        amount = min(max_per_player, available_for_team, remaining_budget / 10)
        if amount >= 0.5:  # Only allocate meaningful amounts
            allocations[(player['name'], target_team)] = amount
            remaining_budget -= amount

    # Ensure minimum allocation to all opponents
    for opponent in opponents:
        current_to_team = sum(
            amt for (name, team), amt in allocations.items()
            if team == opponent
        )
        if current_to_team < min_per_team:
            # Find the highest surplus player on this team and give them the minimum
            team_players = opponent_players[
                opponent_players['team_name'] == opponent
            ].sort_values('surplus', ascending=False)

            if not team_players.empty:
                player = team_players.iloc[0]
                shortfall = min_per_team - current_to_team
                allocations[(player['name'], opponent)] = (
                    allocations.get((player['name'], opponent), 0) + shortfall
                )

    return allocations


def run_simulation(
    players_df: pd.DataFrame,
    num_sims: int = NUM_SIMULATIONS
) -> pd.DataFrame:
    """Run Monte Carlo simulation of arbitration allocations.

    Simulates each team independently allocating their budget across
    multiple runs. Returns aggregated statistics.

    Args:
        players_df: DataFrame with surplus calculations
        num_sims: Number of simulation runs

    Returns:
        DataFrame with columns:
        - name, position, nfl_team, team_name, price, dollar_value, surplus
        - mean_arb: Average arbitration raise across simulations
        - std_arb: Standard deviation of arbitration raises
        - min_arb: Minimum raise observed
        - max_arb: Maximum raise observed
        - pct_protected: % of simulations where player received max league raise
    """
    all_teams = sorted(players_df['team_name'].unique())
    rostered_teams = [t for t in all_teams if t != 'FA' and t != '']

    # Track arbitration totals across simulations
    # Key: (player_name, team_name), Value: list of total arbitration amounts
    arb_results: Dict[Tuple[str, str], List[float]] = {}

    for sim in range(num_sims):
        # Set random seed for reproducibility of each simulation run
        np.random.seed(sim)

        # Generate team-specific valuations for this simulation
        team_valuations = generate_team_valuations(
            players_df,
            NUM_TEAMS,
            VALUE_VARIATION
        )

        # Track arbitration allocated to each player in this simulation
        sim_arb_totals: Dict[Tuple[str, str], float] = {}

        # Each team allocates their budget
        for team in rostered_teams:
            allocations = allocate_team_budget(
                team_name=team,
                team_valuations=team_valuations[team],
                all_teams=all_teams,
                budget=ARB_BUDGET_PER_TEAM,
                min_per_team=ARB_MIN_PER_TEAM,
                max_per_team=ARB_MAX_PER_TEAM,
                max_per_player=ARB_MAX_PER_PLAYER_PER_TEAM
            )

            # Add this team's allocations to simulation totals
            for player_key, amount in allocations.items():
                sim_arb_totals[player_key] = (
                    sim_arb_totals.get(player_key, 0) + amount
                )

        # Cap at league maximum
        for player_key in sim_arb_totals:
            sim_arb_totals[player_key] = min(
                sim_arb_totals[player_key],
                ARB_MAX_PER_PLAYER_LEAGUE
            )

        # Record results from this simulation
        for player_key, total in sim_arb_totals.items():
            if player_key not in arb_results:
                arb_results[player_key] = []
            arb_results[player_key].append(total)

    # Aggregate simulation results
    results = []
    for (player_name, team_name), amounts in arb_results.items():
        # Find player info from original dataframe
        player_row = players_df[
            (players_df['name'] == player_name) &
            (players_df['team_name'] == team_name)
        ]

        if player_row.empty:
            continue

        player_row = player_row.iloc[0]

        mean_arb = np.mean(amounts)
        std_arb = np.std(amounts)
        min_arb = np.min(amounts)
        max_arb = np.max(amounts)

        # % of simulations hitting league max (very high protection)
        pct_protected = sum(1 for x in amounts if x >= ARB_MAX_PER_PLAYER_LEAGUE * 0.9) / len(amounts)

        results.append({
            'name': player_name,
            'position': player_row['position'],
            'nfl_team': player_row['nfl_team'],
            'team_name': team_name,
            'price': player_row['price'],
            'dollar_value': player_row['dollar_value'],
            'surplus': player_row['surplus'],
            'mean_arb': mean_arb,
            'std_arb': std_arb,
            'min_arb': min_arb,
            'max_arb': max_arb,
            'pct_protected': pct_protected,
        })

    results_df = pd.DataFrame(results)

    # Calculate post-arbitration metrics
    if not results_df.empty:
        results_df['salary_after_arb'] = results_df['price'] + results_df['mean_arb']
        results_df['surplus_after_arb'] = results_df['dollar_value'] - results_df['salary_after_arb']

    return results_df


def generate_simulation_report(sim_results: pd.DataFrame) -> str:
    """Generate markdown report from simulation results."""
    reports_dir = ensure_reports_dir()
    output_file = os.path.join(reports_dir, 'arbitration_simulation.md')

    with open(output_file, 'w') as f:
        f.write(f'# Arbitration Simulation Analysis ({SEASON})\n\n')
        f.write(f'**Simulation:** {NUM_SIMULATIONS} Monte Carlo runs\n')
        f.write(f'**Value Variation:** ±{VALUE_VARIATION*100:.0f}% per team\n\n')
        f.write('Each team independently allocates their arbitration budget to opponent players.\n')
        f.write('**Strategy:** Target high-surplus players to maximize disruption to opponents.\n\n')
        f.write('**Note:** In Ottoneu, teams can ONLY arbitrate opponents\' players, not their own.\n\n')
        f.write('Results show expected arbitration raises from opponent targeting.\n\n')

        # === Section 1: My Team Protection ===
        f.write(f'## My Roster ({MY_TEAM}) — Expected Arbitration Raises\n\n')
        my_players = sim_results[sim_results['team_name'] == MY_TEAM].copy()

        if my_players.empty:
            f.write('No players found on my roster.\n\n')
        else:
            my_players = my_players.sort_values('mean_arb', ascending=False)

            my_cols = [
                'name', 'position', 'price', 'dollar_value', 'surplus',
                'mean_arb', 'std_arb', 'salary_after_arb', 'surplus_after_arb'
            ]

            # Show top 15 players by expected arbitration
            f.write(f'### Top {min(15, len(my_players))} Players by Expected Arbitration\n\n')
            f.write(my_players.head(15)[my_cols].to_markdown(index=False, floatfmt='.1f'))
            f.write('\n\n')

            # Summary stats
            total_expected_arb = my_players['mean_arb'].sum()
            f.write(f'**Total Expected Arbitration on My Roster:** ${total_expected_arb:.0f}\n\n')

        # === Section 2: Vulnerable Opponent Targets ===
        f.write('## Vulnerable Opponent Targets — Low Protection\n\n')
        f.write('These are high-value opponent players receiving low arbitration protection.\n')
        f.write('**Strategy:** Target these players to maximize disruption.\n\n')

        opponents = sim_results[
            (sim_results['team_name'] != MY_TEAM) &
            (sim_results['team_name'] != 'FA') &
            (sim_results['team_name'] != '')
        ].copy()

        # Focus on players with high surplus but low expected arbitration
        # These are vulnerable because their owners aren't protecting them heavily
        vulnerable = opponents[
            (opponents['surplus'] > 5) &  # High value
            (opponents['mean_arb'] < 10)   # Low protection
        ].copy()

        vulnerable = vulnerable.sort_values('surplus', ascending=False)

        vuln_cols = [
            'name', 'position', 'nfl_team', 'team_name', 'price',
            'dollar_value', 'surplus', 'mean_arb', 'std_arb',
            'surplus_after_arb'
        ]

        f.write(f'### Top {min(20, len(vulnerable))} Vulnerable Targets\n\n')
        if vulnerable.empty:
            f.write('No vulnerable targets identified.\n\n')
        else:
            f.write(vulnerable.head(20)[vuln_cols].to_markdown(index=False, floatfmt='.1f'))
            f.write('\n\n')

        # === Section 3: Cut Candidates (Negative Surplus After Arb) ===
        f.write('## Cut Candidates — Negative Surplus After Arbitration\n\n')
        f.write('Players who will have negative surplus value after receiving expected arbitration.\n')
        f.write('**Strategy:** These players are likely to be cut, creating FA opportunities.\n\n')

        # Include all teams (not just opponents) to see potential cuts across the league
        all_players = sim_results[
            (sim_results['team_name'] != 'FA') &
            (sim_results['team_name'] != '')
        ].copy()

        cut_candidates = all_players[all_players['surplus_after_arb'] < 0].copy()
        cut_candidates = cut_candidates.sort_values('surplus_after_arb', ascending=True)

        cut_cols = [
            'name', 'position', 'nfl_team', 'team_name', 'price',
            'dollar_value', 'surplus', 'mean_arb', 'salary_after_arb',
            'surplus_after_arb'
        ]

        f.write(f'### Top {min(20, len(cut_candidates))} Cut Candidates\n\n')
        if cut_candidates.empty:
            f.write('No cut candidates identified (all players have positive surplus after arb).\n\n')
        else:
            f.write(cut_candidates.head(20)[cut_cols].to_markdown(index=False, floatfmt='.1f'))
            f.write('\n\n')

        # === Section 4: Full Roster Breakdown by Team ===
        f.write('## Full Roster Breakdown by Team\n\n')
        f.write('Complete roster for each team showing expected arbitration raises.\n\n')

        all_rostered_teams = sorted(sim_results[
            (sim_results['team_name'] != 'FA') &
            (sim_results['team_name'] != '')
        ]['team_name'].unique())

        for team in all_rostered_teams:
            team_players = sim_results[sim_results['team_name'] == team].copy()
            team_players = team_players.sort_values('mean_arb', ascending=False)

            f.write(f'### {team}\n\n')

            if team_players.empty:
                f.write('No players found.\n\n')
            else:
                roster_cols = [
                    'name', 'position', 'price', 'dollar_value', 'surplus',
                    'mean_arb', 'salary_after_arb', 'surplus_after_arb'
                ]
                f.write(team_players[roster_cols].to_markdown(index=False, floatfmt='.1f'))
                f.write('\n\n')

                # Summary stats
                total_arb = team_players['mean_arb'].sum()
                avg_arb = team_players['mean_arb'].mean()
                f.write(f'**Total Expected Arb:** ${total_arb:.0f} | ')
                f.write(f'**Avg per Player:** ${avg_arb:.1f}\n\n')

    print(f'Simulation report generated: {output_file}')
    return output_file


if __name__ == '__main__':
    # Fetch data and calculate surplus values
    prices_df, stats_df, players_df = fetch_all_data()
    merged = merge_data(prices_df, stats_df, players_df)
    surplus_df = calculate_surplus(merged)

    if surplus_df.empty:
        print('No surplus data available for simulation.')
        exit(1)

    # Exclude kickers from arbitration simulation
    surplus_df = surplus_df[surplus_df['position'] != 'K'].copy()

    # Run simulation
    print(f'Running {NUM_SIMULATIONS} arbitration simulations...')
    sim_results = run_simulation(surplus_df, num_sims=NUM_SIMULATIONS)

    if not sim_results.empty:
        generate_simulation_report(sim_results)
        print(f'\nSimulation complete. Analyzed {len(sim_results)} players.')
    else:
        print('No simulation results generated.')
