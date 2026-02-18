"""Orchestrator — runs all analysis scripts in dependency order."""

import sys
import time
from analysis_utils import fetch_all_data, merge_data, ensure_reports_dir


def main():
    print('=' * 60)
    print('Ottoneu Fantasy Football Analysis Suite')
    print('=' * 60)
    start = time.time()

    # Fetch data once (shared across all analyses)
    print('\n[1/6] Fetching data from Supabase...')
    prices_df, stats_df, players_df = fetch_all_data()
    merged = merge_data(prices_df, stats_df, players_df)
    if merged.empty:
        print('ERROR: No data available. Exiting.')
        sys.exit(1)
    print(f'  -> {len(merged)} player records loaded.')

    # Ensure reports directory exists
    reports_dir = ensure_reports_dir()

    # Run analyses in dependency order
    reports = []

    print('\n[2/6] Projected Salary Analysis...')
    from analyze_projected_salary import analyze_projected_salary, generate_report as ps_report
    ps_result = analyze_projected_salary(merged)
    if not ps_result.empty:
        reports.append(ps_report(ps_result))

    print('\n[3/6] VORP Analysis...')
    from analyze_vorp import calculate_vorp, generate_report as vorp_report
    vorp_result, rpg, replacement_n = calculate_vorp(merged)
    if not vorp_result.empty:
        reports.append(vorp_report(vorp_result, rpg, replacement_n))

    print('\n[4/6] Surplus Value Analysis...')
    from analyze_surplus_value import calculate_surplus, generate_report as sv_report
    sv_result = calculate_surplus(merged)
    if not sv_result.empty:
        reports.append(sv_report(sv_result))

    print('\n[5/6] Arbitration Targets...')
    from analyze_arbitration import analyze_arbitration, generate_report as arb_report
    arb_result = analyze_arbitration(merged)
    if not arb_result.empty:
        reports.append(arb_report(arb_result))

    print('\n[6/6] Arbitration Simulation...')
    from analyze_arbitration_simulation import run_simulation, generate_simulation_report
    sim_result = run_simulation(sv_result)
    if not sim_result.empty:
        reports.append(generate_simulation_report(sim_result))

    elapsed = time.time() - start
    print('\n' + '=' * 60)
    print(f'Done! {len(reports)} reports generated in {elapsed:.1f}s:')
    for r in reports:
        print(f'  - {r}')
    print('=' * 60)


if __name__ == '__main__':
    main()
