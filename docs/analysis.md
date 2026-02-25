# Analysis

## Pipeline

`scripts/run_all_analyses.py` orchestrates the analysis scripts in dependency order:

1. `analyze_projected_salary.py`: Keep vs cut decisions
2. `analyze_vorp.py`: Positional scarcity / Value Over Replacement
3. `analyze_surplus_value.py`: Dollar value vs salary for all players
4. `analyze_arbitration.py`: Identify opponents' vulnerable players for arbitration
5. `analyze_arbitration_simulation.py`: Simulate opponent arbitration spending

The scripts produce markdown reports in `reports/` (gitignored).

Shared config and DB helpers are in `scripts/analysis_utils.py`.

## Dependencies

- `analyze_vorp.py` exposes `calculate_vorp()` for import by downstream scripts (e.g. surplus value).
- `analyze_surplus_value.py` exposes `calculate_surplus()` for import by downstream scripts.

## Simulation

`analyze_arbitration_simulation.py` uses Monte Carlo methods to predict opponent spending patterns. It performs 100 runs with ±20% value variation per team to estimate arbitration allocations.

## Key Metrics

- **PPG (Points Per Game):** `total_points / games_played`
- **PPS (Points Per Snap):** `total_points / snaps`
- **VORP (Value Over Replacement):** `ppg - replacement_ppg` at position
- **Surplus Value:** `dollar_value (from VORP) - salary`
- **Dollar Value:** Conversion of VORP to fantasy auction value
