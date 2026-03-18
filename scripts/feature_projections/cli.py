"""CLI for the feature-based projection system.

Commands:
    run          — Generate projections for a model
    backtest     — Compare projections to actuals
    compare      — Side-by-side model comparison
    promote      — Copy model projections to production table
    list         — List available models
    diagnostics  — Per-player backtest diagnostics with error categorization
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


def cmd_diagnostics(args: argparse.Namespace) -> None:
    from scripts.feature_projections.diagnostics import run_diagnostics, format_markdown, _get_default_model

    model_name = args.model or _get_default_model()
    season = args.season
    top_n = args.top

    if season is None:
        # Auto-detect latest season with data
        from config import get_supabase_client

        supabase = get_supabase_client()
        model_res = (
            supabase.table("projection_models")
            .select("id")
            .eq("name", model_name)
            .execute()
        )
        if not model_res.data:
            print(f"Error: Model '{model_name}' not found")
            return
        model_id = model_res.data[0]["id"]
        proj_res = (
            supabase.table("model_projections")
            .select("season")
            .eq("model_id", model_id)
            .execute()
        )
        stats_res = supabase.table("player_stats").select("season").execute()
        proj_seasons = {row["season"] for row in (proj_res.data or [])}
        stats_seasons = {row["season"] for row in (stats_res.data or [])}
        available = sorted(proj_seasons & stats_seasons, reverse=True)
        if not available:
            print("No seasons found with both projections and actuals")
            return
        season = available[0]

    print(f"Running diagnostics: model={model_name}, season={season}, top={top_n}")
    results = run_diagnostics(model_name, season, top_n=top_n)

    # Print summary
    print(f"\nPlayers: {results['total_players']}")
    print(f"\nError Categories:")
    for cat, count in sorted(results["category_counts"].items(), key=lambda x: -x[1]):
        pct = round(100 * count / results["total_players"], 1)
        print(f"  {cat:20s}: {count:4d} ({pct}%)")

    print(f"\nTop {top_n} Worst Projections:")
    for i, p in enumerate(results["worst"][:top_n], 1):
        sign = "+" if p["error"] >= 0 else ""
        print(f"  {i:>2}. {p['name']:<25} {p['position']:>3} proj={p['projected_ppg']:.2f} actual={p['actual_ppg']:.2f} err={sign}{p['error']:.2f} [{p['category']}]")

    if args.output:
        import os

        os.makedirs(os.path.dirname(args.output), exist_ok=True)
        report = format_markdown(results, top_n=top_n)
        with open(args.output, "w") as f:
            f.write(report)
        print(f"\nReport written to: {args.output}")


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

    # diagnostics
    diag_parser = subparsers.add_parser("diagnostics", help="Per-player backtest diagnostics")
    diag_parser.add_argument("--model", default=None, help="Model name (default: most complete)")
    diag_parser.add_argument("--season", type=int, default=None, help="Season (default: latest with data)")
    diag_parser.add_argument("--top", type=int, default=20, help="Number of worst projections (default: 20)")
    diag_parser.add_argument("--output", default=None, help="Output markdown file path")
    diag_parser.set_defaults(func=cmd_diagnostics)

    # list
    list_parser = subparsers.add_parser("list", help="List available model definitions")
    list_parser.set_defaults(func=cmd_list)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
