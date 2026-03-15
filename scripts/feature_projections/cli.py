"""CLI for the feature-based projection system.

Commands:
    run       — Generate projections for a model
    backtest  — Compare projections to actuals
    compare   — Side-by-side model comparison
    promote   — Copy model projections to production table
    list      — List available models
"""

from __future__ import annotations

import argparse
import sys
import os

# Setup paths so imports work when run directly
script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
repo_root = os.path.dirname(script_dir)
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)


def cmd_run(args: argparse.Namespace) -> None:
    from scripts.feature_projections.runner import run_model

    seasons = [int(s.strip()) for s in args.seasons.split(",")]
    count = run_model(args.model, seasons)
    print(f"\nDone. Generated {count} projections.")


def cmd_backtest(args: argparse.Namespace) -> None:
    from scripts.feature_projections.backtest import backtest_model

    test_seasons = [int(s.strip()) for s in args.test_seasons.split(",")]
    backtest_model(args.model, test_seasons)


def cmd_compare(args: argparse.Namespace) -> None:
    from scripts.feature_projections.backtest import compare_models

    models = [m.strip() for m in args.models.split(",")]
    compare_models(models, args.season)


def cmd_promote(args: argparse.Namespace) -> None:
    from scripts.feature_projections.promote import promote_model

    count = promote_model(args.model)
    print(f"\nDone. Promoted {count} projections.")


def cmd_list(args: argparse.Namespace) -> None:
    from scripts.feature_projections.model_config import MODELS

    print(f"\n{'Name':<35} {'Ver':>3} {'Features':<50} {'Baseline':>8}")
    print("-" * 100)
    for name, m in MODELS.items():
        features_str = ", ".join(m.features)
        baseline = "YES" if m.is_baseline else ""
        print(f"{name:<35} {m.version:>3} {features_str:<50} {baseline:>8}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Feature-based projection system CLI"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # run
    run_parser = subparsers.add_parser("run", help="Generate projections for a model")
    run_parser.add_argument("--model", required=True, help="Model name (e.g., v1_baseline_weighted_ppg)")
    run_parser.add_argument("--seasons", required=True, help="Comma-separated seasons (e.g., 2024,2025,2026)")
    run_parser.set_defaults(func=cmd_run)

    # backtest
    bt_parser = subparsers.add_parser("backtest", help="Backtest a model against actuals")
    bt_parser.add_argument("--model", required=True, help="Model name")
    bt_parser.add_argument("--test-seasons", required=True, help="Comma-separated seasons to test")
    bt_parser.set_defaults(func=cmd_backtest)

    # compare
    cmp_parser = subparsers.add_parser("compare", help="Compare models side-by-side")
    cmp_parser.add_argument("--models", required=True, help="Comma-separated model names")
    cmp_parser.add_argument("--season", required=True, type=int, help="Season to compare")
    cmp_parser.set_defaults(func=cmd_compare)

    # promote
    prm_parser = subparsers.add_parser("promote", help="Promote model to production")
    prm_parser.add_argument("--model", required=True, help="Model name to promote")
    prm_parser.set_defaults(func=cmd_promote)

    # list
    list_parser = subparsers.add_parser("list", help="List available model definitions")
    list_parser.set_defaults(func=cmd_list)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
