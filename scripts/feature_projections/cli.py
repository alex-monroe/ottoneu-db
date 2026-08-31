"""CLI for the feature-based projection system.

Commands:
    run                — Generate projections for a model
    backtest           — Compare projections to actuals
    compare            — Side-by-side model comparison
    promote            — Copy model projections to production table
    list               — List available models
    diagnostics        — Per-player backtest diagnostics with error categorization
    segment-analysis   — Segmented accuracy analysis by player category
"""

from __future__ import annotations

import argparse
import os

# Repo root — used to compute default report output paths below.
repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


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
        from scripts.config import get_supabase_client

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
        from scripts.analysis_utils import available_model_seasons
        available = available_model_seasons(supabase, model_id)
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


def cmd_segment_analysis(args: argparse.Namespace) -> None:
    from scripts.feature_projections.segment_analysis import (
        run_segment_analysis,
        format_segment_markdown,
        DEFAULT_MODELS,
        DEFAULT_SEASONS,
    )

    model_names = [m.strip() for m in args.models.split(",")]
    seasons = [int(s.strip()) for s in args.seasons.split(",")]
    segments = [s.strip() for s in args.segments.split(",")] if args.segments else None

    print(f"Running segment analysis: models={model_names}, seasons={seasons}, segments={segments or 'all'}")
    results = run_segment_analysis(model_names, seasons, segments)

    report = format_segment_markdown(results, model_names, seasons)

    if args.output:
        os.makedirs(os.path.dirname(args.output), exist_ok=True)
        with open(args.output, "w") as f:
            f.write(report)
        print(f"\nReport written to: {args.output}")

    # Print summary
    for seg_name, rows in results.items():
        print(f"\n  {seg_name.upper()}:")
        for row in rows:
            r2 = f"{row['r_squared']:.3f}" if row["r_squared"] is not None and row["n"] >= 10 else "   --"
            print(f"    {row['segment_value']:<20} {row['model']:<40} MAE={row['mae']:.3f} Bias={row['bias']:+.3f} R²={r2} N={row['n']}")


_STATUS_ORDER = ["production", "baseline", "external", "archived"]

_STATUS_BLURB = {
    "production": "served to the website",
    "baseline": "deliberately simple controls, kept for comparison",
    "external": "third-party projections, ingested as comparators",
    "archived": "superseded experiments — see docs/generated/experiment-log.md",
}


def cmd_list(args: argparse.Namespace) -> None:
    """List model definitions grouped by lifecycle status.

    Most of these 55 definitions are history. Grouping keeps the handful that are
    load-bearing at the top, so a reader isn't left ranking them all equally.
    """
    from scripts.feature_projections.model_config import MODELS

    wanted = getattr(args, "status", None)
    show_archived = getattr(args, "all", False) or wanted == "archived"

    for status in _STATUS_ORDER:
        models = [(n, m) for n, m in MODELS.items() if m.status == status]
        if not models or (wanted and wanted != status):
            continue

        print(f"\n{status.upper()} — {_STATUS_BLURB[status]}  ({len(models)})")

        if status == "archived" and not show_archived:
            print("  (hidden; pass --all or --status archived to list them)")
            continue

        print(f"  {'Name':<33} {'Ver':>3}  Features")
        print("  " + "-" * 96)
        for name, m in models:
            print(f"  {name:<33} {m.version:>3}  {', '.join(m.features)}")

    if getattr(args, "check", False):
        _check_status_against_db(MODELS)
    else:
        print(
            "\nThe live model is whichever projection_models row has is_active=True — "
            "verify with: just list-models --check"
        )


def _check_status_against_db(models: dict) -> None:
    """Report whether the `production` label still matches the database.

    The label in model_config.py is documentation; `projection_models.is_active`
    is the switch. They drift whenever a promote happens without a code update,
    so this makes the disagreement visible instead of silently misleading.
    """
    from scripts.config import get_supabase_client

    labelled = sorted(n for n, m in models.items() if m.status == "production")
    rows = (
        get_supabase_client()
        .table("projection_models")
        .select("name")
        .eq("is_active", True)
        .execute()
        .data
    )  # pagination-safe: at most one model is active
    active = sorted(r["name"] for r in rows)

    print(f"\nLabelled production: {', '.join(labelled) or '(none)'}")
    print(f"Active in database:  {', '.join(active) or '(none)'}")
    if labelled == active:
        print("OK — the label matches the database.")
    else:
        print(
            "MISMATCH — update the `status=` labels in "
            "scripts/feature_projections/model_config.py to match the database."
        )


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

    # segment-analysis
    seg_parser = subparsers.add_parser("segment-analysis", help="Segmented accuracy analysis by player category")
    seg_parser.add_argument(
        "--models",
        default="v1_baseline_weighted_ppg,v8_age_regression,external_fantasypros_v1",
        help="Comma-separated model names",
    )
    seg_parser.add_argument(
        "--seasons",
        default="2022,2023,2024,2025",
        help="Comma-separated seasons",
    )
    seg_parser.add_argument(
        "--segments",
        default=None,
        help="Comma-separated segments to compute (default: all)",
    )
    seg_parser.add_argument(
        "--output",
        default=os.path.join(repo_root, "docs", "generated", "segment-analysis.md"),
        help="Output file path",
    )
    seg_parser.set_defaults(func=cmd_segment_analysis)

    # list
    list_parser = subparsers.add_parser("list", help="List available model definitions")
    list_parser.add_argument("--all", action="store_true", help="Include archived experiments")
    list_parser.add_argument(
        "--status", choices=_STATUS_ORDER, help="Show only models with this status"
    )
    list_parser.add_argument(
        "--check", action="store_true",
        help="Verify the `production` label still matches projection_models.is_active (needs DB access)",
    )
    list_parser.set_defaults(func=cmd_list)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
