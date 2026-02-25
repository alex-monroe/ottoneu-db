"""Orchestrator — runs all analysis scripts in dependency order."""

import subprocess
import sys
import time
from analysis_utils import fetch_all_data, merge_data, ensure_reports_dir, fetch_multi_season_stats
from config import HISTORICAL_SEASONS


def main():
    print('=' * 60)
    print('Ottoneu Fantasy Football Analysis Suite')
    print('=' * 60)
    start = time.time()

    # Fetch data once (shared across all analyses)
    print('\n[1/7] Fetching data from Supabase...')
    prices_df, stats_df, players_df = fetch_all_data()
    merged = merge_data(prices_df, stats_df, players_df)
    if merged.empty:
        print('ERROR: No data available. Exiting.')
        sys.exit(1)
    print(f'  -> {len(merged)} player records loaded.')

    # Ensure reports directory exists
    ensure_reports_dir()

    # Run analyses in dependency order
    reports = []

    # New Step: Update projections
    print("\n" + "="*50)
    print("STEP 0: Updating Player Projections")
    print("="*50)
    try:
        subprocess.run(["python", "scripts/update_projections.py"], check=True)
        print("Player projections updated successfully.")
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Failed to update player projections: {e}")
        sys.exit(1)
    except FileNotFoundError:
        print("ERROR: 'python' command not found. "
              "Ensure Python is in your PATH.")
        sys.exit(1)

    print('\n[2/8] Projected Salary Analysis...') # Updated step count
    from analyze_projected_salary import analyze_projected_salary, generate_report as ps_report
    ps_result = analyze_projected_salary(merged)
    if not ps_result.empty:
        reports.append(ps_report(ps_result))

    print('\n[3/8] VORP Analysis...') # Updated step count
    from analyze_vorp import calculate_vorp, generate_report as vorp_report
    vorp_result, rpg, replacement_n = calculate_vorp(merged)
    if not vorp_result.empty:
        reports.append(vorp_report(vorp_result, rpg, replacement_n))

    print('\n[4/7] Surplus Value Analysis...')
    from analyze_surplus_value import calculate_surplus, generate_report as sv_report
    sv_result = calculate_surplus(merged)
    if not sv_result.empty:
        reports.append(sv_report(sv_result))

    print('\n[5/7] Arbitration Targets...')
    from analyze_arbitration import analyze_arbitration, generate_report as arb_report
    arb_result = analyze_arbitration(merged)
    if not arb_result.empty:
        reports.append(arb_report(arb_result))

    print('\n[6/7] Arbitration Simulation...')
    from analyze_arbitration_simulation import run_simulation, generate_simulation_report
    sim_result = run_simulation(sv_result)
    if not sim_result.empty:
        reports.append(generate_simulation_report(sim_result))

    print('\n[7/7] Projected Arbitration Targets...')
    from analyze_projected_arbitration import (
        build_projection_map, apply_projections, generate_report as parb_report,
    )
    from analyze_arbitration import analyze_arbitration as _analyze_arb
    multi_season_df = fetch_multi_season_stats(HISTORICAL_SEASONS)
    if not multi_season_df.empty:
        projection_map = build_projection_map(multi_season_df)
        projected_merged = apply_projections(merged, projection_map)
        parb_result = _analyze_arb(projected_merged)
        if not parb_result.empty:
            if 'observed_ppg' in projected_merged.columns:
                obs_ppg = projected_merged.set_index('player_id')['observed_ppg']
                parb_result['observed_ppg'] = parb_result['player_id'].map(obs_ppg)
            reports.append(parb_report(parb_result))
    else:
        print('  WARNING: No historical stats — skipping projected arbitration.')

    elapsed = time.time() - start
    print('\n' + '=' * 60)
    print(f'Done! {len(reports)} reports generated in {elapsed:.1f}s:')
    for r in reports:
        print(f'  - {r}')
    print('=' * 60)


if __name__ == '__main__':
    main()
