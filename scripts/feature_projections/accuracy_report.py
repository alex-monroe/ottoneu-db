"""Generate a markdown accuracy comparison table across all projection models.

Usage:
    python scripts/feature_projections/accuracy_report.py [--seasons 2024,2025] [--run-backtest] [--output PATH]

Options:
    --seasons       Comma-separated seasons to include (default: 2024,2025)
    --run-backtest  Re-run backtest for all models before generating report (slow, hits DB)
    --output        Path to write markdown report (default: docs/generated/projection-accuracy.md)
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime

# Setup paths so imports work when run directly
script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
repo_root = os.path.dirname(script_dir)
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from config import get_supabase_client, POSITIONS
from scripts.feature_projections.model_config import MODELS


# Positions to show in table (ALL first, then standard positions)
REPORT_POSITIONS = ["ALL"] + list(POSITIONS)

# Metrics to display and their display names
METRICS = [
    ("mae", "MAE", ".3f"),
    ("bias", "Bias", "+.3f"),
    ("r_squared", "R²", ".3f"),
    ("rmse", "RMSE", ".3f"),
    ("player_count", "N", "d"),
]


def _fetch_backtest_results(model_id: int, seasons: list[int]) -> dict[int, dict[str, dict]]:
    """Fetch cached backtest results from DB for a model.

    Returns: {season: {position_or_ALL: metrics_dict}}
    """
    supabase = get_supabase_client()
    result: dict[int, dict[str, dict]] = {}

    for season in seasons:
        bt_res = (
            supabase.table("backtest_results")
            .select("position, mae, bias, r_squared, rmse, player_count")
            .eq("model_id", model_id)
            .eq("season", season)
            .execute()
        )
        if bt_res.data:
            result[season] = {
                (row.get("position") or "ALL"): row for row in bt_res.data
            }

    return result


def _run_backtests(seasons: list[int]) -> None:
    """Run backtest for every model in MODELS against all seasons."""
    from scripts.feature_projections.backtest import backtest_model
    from scripts.feature_projections.runner import run_model

    supabase = get_supabase_client()

    for model_name in MODELS:
        # Ensure model is registered and has projections
        model_res = (
            supabase.table("projection_models")
            .select("id")
            .eq("name", model_name)
            .execute()
        )
        if not model_res.data:
            print(f"  Generating projections for {model_name}...")
            run_model(model_name, seasons)

        print(f"\nBacktesting {model_name}...")
        backtest_model(model_name, seasons)


def _format_val(val, fmt: str) -> str:
    if val is None:
        return "—"
    try:
        return format(val, fmt)
    except (ValueError, TypeError):
        return str(val)


def generate_markdown_table(seasons: list[int]) -> str:
    """Fetch backtest results and format a markdown comparison table."""
    supabase = get_supabase_client()

    # Load all model IDs
    model_data: dict[str, dict] = {}
    for model_name in MODELS:
        res = (
            supabase.table("projection_models")
            .select("id, name")
            .eq("name", model_name)
            .execute()
        )
        if res.data:
            model_id = res.data[0]["id"]
            model_data[model_name] = {
                "id": model_id,
                "results": _fetch_backtest_results(model_id, seasons),
            }

    if not model_data:
        return "_No backtest results found. Run with --run-backtest to generate them._\n"

    lines: list[str] = []
    lines.append(f"# Projection Model Accuracy Report\n")
    lines.append(f"_Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}_\n")
    lines.append(
        "Metrics: **MAE** = Mean Absolute Error (lower is better), "
        "**Bias** = Mean signed error (positive = under-projection), "
        "**R²** = Goodness of fit (higher is better), "
        "**RMSE** = Root mean square error, **N** = player sample size.\n"
    )

    model_names = list(model_data.keys())

    for season in seasons:
        lines.append(f"## Season {season}\n")

        for pos in REPORT_POSITIONS:
            lines.append(f"### {pos}\n")

            # Header row
            header_cols = ["Model"] + [m for m, _, _ in METRICS]
            lines.append("| " + " | ".join(header_cols) + " |")
            lines.append("| " + " | ".join(["---"] * len(header_cols)) + " |")

            baseline_metrics: dict[str, float | None] = {}

            for model_name in model_names:
                row_data = model_data[model_name]["results"].get(season, {}).get(pos)
                model_def = MODELS[model_name]
                label = f"`{model_name}`" + (" _(baseline)_" if model_def.is_baseline else "")

                cols = [label]
                for metric_key, _, fmt in METRICS:
                    val = row_data.get(metric_key) if row_data else None
                    formatted = _format_val(val, fmt)

                    # Bold improvement over baseline for MAE and RMSE (lower is better)
                    if not model_def.is_baseline and metric_key in ("mae", "rmse"):
                        baseline_val = baseline_metrics.get(metric_key)
                        if val is not None and baseline_val is not None and val < baseline_val:
                            formatted = f"**{formatted}**"

                    # Bold improvement for R² (higher is better)
                    if not model_def.is_baseline and metric_key == "r_squared":
                        baseline_val = baseline_metrics.get(metric_key)
                        if val is not None and baseline_val is not None and val > baseline_val:
                            formatted = f"**{formatted}**"

                    cols.append(formatted)

                    # Store baseline values for comparison
                    if model_def.is_baseline:
                        baseline_metrics[metric_key] = val

                lines.append("| " + " | ".join(cols) + " |")

            lines.append("")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate projection model accuracy report")
    parser.add_argument(
        "--seasons",
        default="2022,2023,2024,2025",
        help="Comma-separated seasons (default: 2022,2023,2024,2025)",
    )
    parser.add_argument(
        "--run-backtest",
        action="store_true",
        help="Re-run backtest for all models before generating report",
    )
    parser.add_argument(
        "--output",
        default=os.path.join(repo_root, "docs", "generated", "projection-accuracy.md"),
        help="Output file path (default: docs/generated/projection-accuracy.md)",
    )
    args = parser.parse_args()

    seasons = [int(s.strip()) for s in args.seasons.split(",")]

    if args.run_backtest:
        print("Running backtests for all models...")
        _run_backtests(seasons)

    print("\nGenerating accuracy report...")
    table = generate_markdown_table(seasons)

    # Write to file
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        f.write(table)
    print(f"Report written to: {args.output}")

    # Also print to stdout for task/PR use
    print("\n" + "=" * 80)
    print(table)


if __name__ == "__main__":
    main()
