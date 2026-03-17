"""Backfill historical data (2019-2021) to enable projection backtesting for 2022-2023.

This script:
1. Populates nfl_stats for 2019-2021 (features: stat_efficiency, team_context, usage_share)
2. Populates player_stats for 2019-2021 (feature: weighted_ppg history)
3. Generates model projections for 2022 and 2023 using all 6 models
4. Runs backtests for 2022 and 2023
5. Regenerates the projection accuracy report for seasons 2022-2025

Usage:
    python scripts/backfill_historical.py
    python scripts/backfill_historical.py --dry-run
    python scripts/backfill_historical.py --seasons 2019 2020 2021 --target-seasons 2022 2023
"""

from __future__ import annotations

import argparse
import os
import sys

# Setup paths so we can import from sibling packages
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.backfill_nfl_stats import backfill_seasons
from scripts.config import get_supabase_client
from scripts.feature_projections.model_config import MODELS
from scripts.feature_projections.runner import run_model
from scripts.feature_projections.backtest import backtest_model
from scripts.tasks.pull_player_stats import run as pull_player_stats_run


def step1_backfill_nfl_stats(seasons: list[int], dry_run: bool) -> None:
    print(f"\n{'='*60}")
    print(f"STEP 1: Backfill nfl_stats for seasons {seasons}")
    print(f"{'='*60}")
    backfill_seasons(seasons, dry_run=dry_run, skip_create_players=True)


def step2_backfill_player_stats(seasons: list[int], dry_run: bool) -> None:
    print(f"\n{'='*60}")
    print(f"STEP 2: Backfill player_stats for seasons {seasons}")
    print(f"{'='*60}")
    if dry_run:
        print(f"[DRY RUN] Would pull player_stats for seasons {seasons}")
        return

    supabase = get_supabase_client()
    result = pull_player_stats_run({"seasons": seasons}, supabase)
    if result.success:
        print(f"player_stats backfill complete: {result.data}")
    else:
        print(f"player_stats backfill failed: {result.error}")
        sys.exit(1)


def step3_generate_projections(target_seasons: list[int], dry_run: bool) -> None:
    print(f"\n{'='*60}")
    print(f"STEP 3: Generate projections for target seasons {target_seasons}")
    print(f"{'='*60}")
    if dry_run:
        print(f"[DRY RUN] Would run {len(MODELS)} models for seasons {target_seasons}")
        for model_name in MODELS:
            print(f"  - {model_name}")
        return

    for model_name in MODELS:
        print(f"\nRunning model: {model_name}")
        count = run_model(model_name, seasons=target_seasons)
        print(f"  Generated {count} projections")


def step4_run_backtests(target_seasons: list[int], dry_run: bool) -> None:
    print(f"\n{'='*60}")
    print(f"STEP 4: Run backtests for target seasons {target_seasons}")
    print(f"{'='*60}")
    if dry_run:
        print(f"[DRY RUN] Would backtest {len(MODELS)} models for seasons {target_seasons}")
        return

    for model_name in MODELS:
        print(f"\nBacktesting model: {model_name}")
        results = backtest_model(model_name, test_seasons=target_seasons)
        for season, season_results in results.items():
            positions_with_data = [pos for pos, m in season_results.items() if m.get("player_count", 0) > 0]
            print(f"  {season}: {len(positions_with_data)} positions with data")


def step5_generate_accuracy_report(dry_run: bool) -> None:
    print(f"\n{'='*60}")
    print("STEP 5: Regenerate projection accuracy report")
    print(f"{'='*60}")
    if dry_run:
        print("[DRY RUN] Would regenerate projection-accuracy.md for seasons 2022-2025")
        return

    from scripts.feature_projections.accuracy_report import generate_markdown_table

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_path = os.path.join(repo_root, "docs", "generated", "projection-accuracy.md")
    seasons = [2022, 2023, 2024, 2025]

    report = generate_markdown_table(seasons)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        f.write(report)

    print(f"Report written to {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill historical data for projection backtesting"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and process data without writing to the database",
    )
    parser.add_argument(
        "--seasons",
        type=int,
        nargs="+",
        default=[2019, 2020, 2021],
        help="Historical seasons to backfill into nfl_stats and player_stats (default: 2019 2020 2021)",
    )
    parser.add_argument(
        "--target-seasons",
        type=int,
        nargs="+",
        default=[2022, 2023],
        help="Seasons to generate projections and backtests for (default: 2022 2023)",
    )
    args = parser.parse_args()

    print("Historical Data Backfill")
    print(f"  Backfill seasons: {args.seasons}")
    print(f"  Target seasons:   {args.target_seasons}")
    print(f"  Dry run:          {args.dry_run}")

    step1_backfill_nfl_stats(args.seasons, args.dry_run)
    step2_backfill_player_stats(args.seasons, args.dry_run)
    step3_generate_projections(args.target_seasons, args.dry_run)
    step4_run_backtests(args.target_seasons, args.dry_run)
    step5_generate_accuracy_report(args.dry_run)

    print("\nDone!")


if __name__ == "__main__":
    main()
