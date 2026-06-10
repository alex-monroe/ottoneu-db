"""Generate a markdown accuracy comparison table across all projection models.

Usage:
    python scripts/feature_projections/accuracy_report.py [--seasons 2024,2025] [--run-backtest] [--output PATH]

Options:
    --seasons       Comma-separated seasons to include (default: 2024,2025)
    --run-backtest  Re-run backtest for all models before generating report (slow, hits DB).
                    Note: this only re-backtests existing projections. If you changed a feature
                    (e.g. recency weights), you must first regenerate projections via cli.py run.
    --output        Path to write markdown report (default: docs/generated/projection-accuracy.md)
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime
from typing import Optional

# Repo root — used to compute the default report output path below.
repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.config import get_supabase_client, POSITIONS
from scripts.feature_projections.model_config import MODELS
from scripts.feature_projections.learned_combiner import TRAINED_MODELS_DIR


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


# --- Train/test leakage detection (Finding 1, docs/exec-plans/projection-methodology-audit.md) ---
#
# Learned/residual models are fit by `train_model.py` and their coefficients are
# saved to trained_models/<name>.json with the training seasons recorded under
# training_metadata.seasons. When those seasons overlap the seasons being
# backtested here, the reported MAE is in-sample fit quality, not held-out
# accuracy — and it is NOT comparable to the additive models (no learned
# params → already out-of-sample) or to FantasyPros (external). These helpers
# surface that overlap and the out-of-sample LOSO CV metric so the optimism gap
# is visible in the report rather than silently inflating the ranking.


def _all_train_seasons(params: dict) -> set:
    """Recursively collect every training season a model saw.

    For residual models the base model was also fit on its own seasons (embedded
    under base_model_params), so the leakage profile is the union of both.
    """
    seasons = set(int(s) for s in params.get("training_metadata", {}).get("seasons", []))
    base = params.get("base_model_params")
    if base:
        seasons |= _all_train_seasons(base)
    return seasons


def _load_training_provenance(model_name: str) -> Optional[dict]:
    """Read a learned/residual model's trained_models JSON.

    Returns None for additive/external models (no JSON on disk), which are
    already evaluated out-of-sample. Otherwise returns:
        {"train_seasons": set[int], "is_residual": bool,
         "loso_mae": float | None, "loso_is_absolute": bool}
    For residual models the LOSO metric is on the residual scale
    (actual − base_pred), not absolute PPG, so it is not directly comparable to
    the backtest MAE — flagged via loso_is_absolute=False.
    """
    path = TRAINED_MODELS_DIR / f"{model_name}.json"
    if not path.exists():
        return None
    try:
        with open(path) as f:
            params = json.load(f)
    except (OSError, ValueError):
        return None

    is_residual = params.get("combiner_type") == "residual"
    meta = params.get("training_metadata", {})
    loso = meta.get("loso_residual_mae") if is_residual else meta.get("loso_mae")
    return {
        "train_seasons": _all_train_seasons(params),
        "is_residual": is_residual,
        "loso_mae": loso,
        "loso_is_absolute": not is_residual,
    }


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


def generate_markdown_table(seasons: list[int], include_leakage_section: bool = True) -> str:
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

    model_names = list(model_data.keys())

    # Detect train/eval season overlap per model (Finding 1). A learned/residual
    # model whose training seasons intersect the eval seasons is reported
    # in-sample; mark it so its MAE is not silently compared against the
    # out-of-sample additive models and FantasyPros.
    eval_set = set(int(s) for s in seasons)
    provenance: dict[str, dict] = {}
    leaked_models: set[str] = set()
    for model_name in model_names:
        prov = _load_training_provenance(model_name)
        if prov is None:
            continue
        prov["leaked_seasons"] = sorted(prov["train_seasons"] & eval_set)
        provenance[model_name] = prov
        if prov["leaked_seasons"]:
            leaked_models.add(model_name)

    if not include_leakage_section:
        # Suppress both the inline markers and the dedicated section.
        leaked_models = set()

    lines: list[str] = []
    lines.append(f"# Projection Model Accuracy Report\n")
    lines.append(f"_Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}_\n")
    lines.append(
        "Metrics: **MAE** = Mean Absolute Error (lower is better), "
        "**Bias** = Mean signed error (positive = under-projection), "
        "**R²** = Goodness of fit (higher is better), "
        "**RMSE** = Root mean square error, **N** = player sample size.\n"
    )
    if leaked_models:
        lines.append(
            "⚠️ = model was **trained on one or more of the seasons scored below**, "
            "so its metrics are in-sample fit quality, not held-out accuracy, and are "
            "**not comparable** to the additive (`v1`–`v19`) or external models, which are "
            "evaluated out-of-sample. See the [Out-of-Sample Reference](#out-of-sample-reference-loso-cv) "
            "section and [docs/exec-plans/projection-methodology-audit.md](../exec-plans/projection-methodology-audit.md).\n"
        )

    def _render_position_table(
        lines: list[str],
        pos: str,
        get_row_data,  # callable(model_name) -> dict | None
    ) -> None:
        """Render a single position table, bolding improvements over baseline."""
        header_cols = ["Model"] + [m for m, _, _ in METRICS]
        lines.append("| " + " | ".join(header_cols) + " |")
        lines.append("| " + " | ".join(["---"] * len(header_cols)) + " |")

        baseline_metrics: dict[str, float | None] = {}

        for model_name in model_names:
            row_data = get_row_data(model_name)
            model_def = MODELS[model_name]
            leak_marker = " ⚠️" if model_name in leaked_models else ""
            label = f"`{model_name}`{leak_marker}" + (" _(baseline)_" if model_def.is_baseline else "")

            cols = [label]
            for metric_key, _, fmt in METRICS:
                val = row_data.get(metric_key) if row_data else None
                formatted = _format_val(val, fmt)

                if not model_def.is_baseline and metric_key in ("mae", "rmse"):
                    baseline_val = baseline_metrics.get(metric_key)
                    if val is not None and baseline_val is not None and val < baseline_val:
                        formatted = f"**{formatted}**"

                if not model_def.is_baseline and metric_key == "r_squared":
                    baseline_val = baseline_metrics.get(metric_key)
                    if val is not None and baseline_val is not None and val > baseline_val:
                        formatted = f"**{formatted}**"

                cols.append(formatted)

                if model_def.is_baseline:
                    baseline_metrics[metric_key] = val

            lines.append("| " + " | ".join(cols) + " |")

        lines.append("")

    for season in seasons:
        lines.append(f"## Season {season}\n")

        for pos in REPORT_POSITIONS:
            lines.append(f"### {pos}\n")
            _render_position_table(
                lines,
                pos,
                lambda model_name, s=season, p=pos: (
                    model_data[model_name]["results"].get(s, {}).get(p)
                ),
            )

    # --- Combined totals across all seasons ---
    lines.append("## All Seasons Combined\n")
    lines.append(
        "_N-weighted across all seasons. MAE/Bias are exact (linear in the errors); "
        "RMSE is √(N-weighted mean of RMSE²), also exact. **R² is intentionally omitted "
        "(—) from the combined rows**: it is not a weighted average of per-season R² (each "
        "season's R² uses its own actual-variance denominator), and this report works from "
        "cached per-slice metrics without the raw residuals needed to pool it correctly. See "
        "per-season R² above, and the leakage-free held-out reports "
        "([projection-holdout-eval.md](projection-holdout-eval.md), "
        "[projection-availability-eval.md](projection-availability-eval.md)) which compute a "
        "proper pooled R² from raw pairs. (GH #576, Finding 5.)_\n"
    )

    def _aggregate(model_name: str, pos: str) -> dict | None:
        """Compute weighted-average metrics for a model+position across all seasons."""
        rows = [
            model_data[model_name]["results"].get(s, {}).get(pos)
            for s in seasons
        ]
        rows = [r for r in rows if r is not None]
        if not rows:
            return None

        total_n = sum(r.get("player_count") or 0 for r in rows)
        if total_n == 0:
            return None

        def _wavg(key: str) -> float | None:
            vals = [(r.get(key), r.get("player_count") or 0) for r in rows]
            pairs = [(v, w) for v, w in vals if v is not None and w > 0]
            if not pairs:
                return None
            return sum(v * w for v, w in pairs) / sum(w for _, w in pairs)

        mae = _wavg("mae")
        bias = _wavg("bias")
        # RMSE: sqrt of weighted average of squared RMSE values
        rmse_pairs = [
            (r.get("rmse"), r.get("player_count") or 0)
            for r in rows
            if r.get("rmse") is not None and (r.get("player_count") or 0) > 0
        ]
        rmse = (
            (sum(v ** 2 * w for v, w in rmse_pairs) / sum(w for _, w in rmse_pairs)) ** 0.5
            if rmse_pairs
            else None
        )

        return {
            "mae": mae,
            "bias": bias,
            # R² omitted from combined rows — not weighted-averageable; see note above (GH #576).
            "r_squared": None,
            "rmse": rmse,
            "player_count": total_n,
        }

    for pos in REPORT_POSITIONS:
        lines.append(f"### {pos}\n")
        _render_position_table(
            lines,
            pos,
            lambda model_name, p=pos: _aggregate(model_name, p),
        )

    # --- Out-of-sample reference (Finding 1) ---
    if include_leakage_section and provenance:
        lines.append("## Out-of-Sample Reference (LOSO CV)\n")
        lines.append(
            "_The **Backtest ALL MAE** column is the pooled 2022–2025 backtest reported in the "
            "tables above. For a learned/residual model it is in-sample on every season listed "
            "under **Leaked eval seasons** (and only genuinely out-of-sample on the rest), so it "
            "understates true error and is **not** comparable to the additive (`v1`–`v19`) or "
            "external models. The **LOSO MAE** is the leave-one-season-out cross-validation error "
            "recorded at training time — the honest out-of-sample number for that model. "
            "Residual models report LOSO on the residual scale (actual − base prediction), which "
            "is not comparable to absolute MAE and is shown as `n/a`. LOSO folds differ by model "
            "(each was trained on its own season set), so cross-model LOSO is indicative, not "
            "exact — the clean fix is a shared held-out window (Finding 1b). See "
            "[docs/exec-plans/projection-methodology-audit.md](../exec-plans/projection-methodology-audit.md)._\n"
        )
        lines.append("| Model | Trained on | Leaked eval seasons | Backtest ALL MAE | LOSO MAE |")
        lines.append("| --- | --- | --- | --- | --- |")
        for model_name in model_names:
            prov = provenance.get(model_name)
            if prov is None:
                continue
            agg = _aggregate(model_name, "ALL")
            in_sample = agg.get("mae") if agg else None
            train_str = ",".join(str(s) for s in sorted(prov["train_seasons"])) or "—"
            leaked_str = (
                ",".join(str(s) for s in prov["leaked_seasons"]) if prov["leaked_seasons"] else "none"
            )
            loso = prov["loso_mae"]
            if not prov["loso_is_absolute"]:
                loso_str = "n/a (residual)"
            elif loso is None:
                loso_str = "—"
            else:
                loso_str = f"{loso:.3f}"
            in_sample_str = f"{in_sample:.3f}" if in_sample is not None else "—"
            lines.append(
                f"| `{model_name}`{' ⚠️' if model_name in leaked_models else ''} | {train_str} "
                f"| {leaked_str} | {in_sample_str} | {loso_str} |"
            )
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
    parser.add_argument(
        "--no-leakage-section",
        action="store_true",
        help="Omit the train/eval leakage flags and Out-of-Sample (LOSO) reference section",
    )
    args = parser.parse_args()

    seasons = [int(s.strip()) for s in args.seasons.split(",")]

    if args.run_backtest:
        print("Running backtests for all models...")
        _run_backtests(seasons)

    print("\nGenerating accuracy report...")
    table = generate_markdown_table(seasons, include_leakage_section=not args.no_leakage_section)

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
