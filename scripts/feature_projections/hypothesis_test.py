"""Quick hypothesis testing: modify an existing model and measure the impact.

Allows scaling feature weights or removing features from an existing model,
running projections and backtest, and comparing against the base model.

Usage:
    # Scale a feature weight
    venv/bin/python scripts/feature_projections/hypothesis_test.py \
        --base-model v14_qb_starter --scale-feature age_curve=1.5 --seasons 2022,2023,2024,2025

    # Remove a feature
    venv/bin/python scripts/feature_projections/hypothesis_test.py \
        --base-model v14_qb_starter --remove-feature qb_backup_penalty --seasons 2022,2023,2024,2025
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from copy import deepcopy
from typing import Dict, List, Optional, Tuple

# Setup paths so imports work when run directly
script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
repo_root = os.path.dirname(script_dir)
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from config import get_supabase_client, POSITIONS
from scripts.feature_projections.model_config import (
    MODELS,
    ModelDefinition,
    get_model,
)
from scripts.feature_projections.runner import run_model
from scripts.feature_projections.backtest import backtest_model


def _create_hypothesis_model(
    base_model: ModelDefinition,
    hypothesis_name: str,
    scale_features: Optional[Dict[str, float]] = None,
    remove_features: Optional[List[str]] = None,
) -> ModelDefinition:
    """Create a modified model definition for hypothesis testing."""
    features = list(base_model.features)
    weights = dict(base_model.weights)

    if remove_features:
        for feat in remove_features:
            if feat in features:
                features.remove(feat)
            weights.pop(feat, None)

    if scale_features:
        for feat, scale in scale_features.items():
            weights[feat] = weights.get(feat, 1.0) * scale

    return ModelDefinition(
        name=hypothesis_name,
        version=base_model.version,
        description=f"Hypothesis test based on {base_model.name}",
        features=features,
        weights=weights,
        is_baseline=False,
        position_overrides=deepcopy(base_model.position_overrides),
        combiner_type=base_model.combiner_type,
        interaction_terms=list(base_model.interaction_terms),
    )


def _cleanup_hypothesis(hypothesis_name: str) -> None:
    """Remove hypothesis model and its projections from the database."""
    supabase = get_supabase_client()

    model_res = (
        supabase.table("projection_models")
        .select("id")
        .eq("name", hypothesis_name)
        .execute()
    )
    if not model_res.data:
        return

    model_id = model_res.data[0]["id"]

    # Delete projections
    supabase.table("model_projections").delete().eq("model_id", model_id).execute()
    # Delete backtest results
    supabase.table("backtest_results").delete().eq("model_id", model_id).execute()
    # Delete model
    supabase.table("projection_models").delete().eq("id", model_id).execute()
    print(f"Cleaned up hypothesis model '{hypothesis_name}'")


def _fetch_base_results(
    model_name: str,
    seasons: List[int],
) -> Dict[int, Dict[str, dict]]:
    """Fetch existing backtest results for the base model."""
    supabase = get_supabase_client()

    model_res = (
        supabase.table("projection_models")
        .select("id")
        .eq("name", model_name)
        .execute()
    )
    if not model_res.data:
        return {}

    model_id = model_res.data[0]["id"]

    results: Dict[int, Dict[str, dict]] = {}
    for season in seasons:
        bt_res = (
            supabase.table("backtest_results")
            .select("*")
            .eq("model_id", model_id)
            .eq("season", season)
            .execute()
        )
        season_results = {}
        for row in (bt_res.data or []):
            pos = row.get("position") or "ALL"
            season_results[pos] = {
                "mae": row.get("mae"),
                "bias": row.get("bias"),
                "r_squared": row.get("r_squared"),
                "rmse": row.get("rmse"),
                "player_count": row.get("player_count"),
            }
        if season_results:
            results[season] = season_results

    return results


def _format_comparison(
    base_name: str,
    hypothesis_desc: str,
    base_results: Dict[int, Dict[str, dict]],
    hyp_results: Dict[int, Dict[str, dict]],
    seasons: List[int],
) -> str:
    """Format a comparison table between base and hypothesis results."""
    lines = []
    lines.append(f"Hypothesis: {hypothesis_desc}")
    lines.append(f"Base model: {base_name}")
    lines.append("")

    # Per-season comparison
    for season in seasons:
        base_s = base_results.get(season, {})
        hyp_s = hyp_results.get(season, {})

        if not base_s and not hyp_s:
            continue

        lines.append(f"Season {season}:")
        header = f"  {'Position':<8} {'Base MAE':>10} {'Hyp MAE':>10} {'ΔMAE':>8} {'Base R²':>10} {'Hyp R²':>10} {'ΔR²':>8}"
        lines.append(header)
        lines.append(f"  {'-' * 66}")

        for pos in ["ALL"] + POSITIONS:
            b = base_s.get(pos, {})
            h = hyp_s.get(pos, {})

            b_mae = b.get("mae")
            h_mae = h.get("mae")
            b_r2 = b.get("r_squared")
            h_r2 = h.get("r_squared")

            b_mae_str = f"{b_mae:.4f}" if b_mae is not None else "N/A"
            h_mae_str = f"{h_mae:.4f}" if h_mae is not None else "N/A"
            b_r2_str = f"{b_r2:.4f}" if b_r2 is not None else "N/A"
            h_r2_str = f"{h_r2:.4f}" if h_r2 is not None else "N/A"

            if b_mae is not None and h_mae is not None:
                d_mae = h_mae - b_mae
                d_mae_str = f"{d_mae:+.4f}"
            else:
                d_mae_str = "N/A"

            if b_r2 is not None and h_r2 is not None:
                d_r2 = h_r2 - b_r2
                d_r2_str = f"{d_r2:+.4f}"
            else:
                d_r2_str = "N/A"

            lines.append(
                f"  {pos:<8} {b_mae_str:>10} {h_mae_str:>10} {d_mae_str:>8} "
                f"{b_r2_str:>10} {h_r2_str:>10} {d_r2_str:>8}"
            )
        lines.append("")

    # Combined summary
    all_base_maes = []
    all_hyp_maes = []
    for season in seasons:
        b = base_results.get(season, {}).get("ALL", {})
        h = hyp_results.get(season, {}).get("ALL", {})
        if b.get("mae") is not None:
            all_base_maes.append(b["mae"])
        if h.get("mae") is not None:
            all_hyp_maes.append(h["mae"])

    if all_base_maes and all_hyp_maes:
        avg_base = sum(all_base_maes) / len(all_base_maes)
        avg_hyp = sum(all_hyp_maes) / len(all_hyp_maes)
        delta = avg_hyp - avg_base

        lines.append(f"COMBINED AVERAGE MAE:")
        lines.append(f"  Base: {avg_base:.4f}")
        lines.append(f"  Hyp:  {avg_hyp:.4f}")
        lines.append(f"  Δ:    {delta:+.4f}")

        if delta < -0.02:
            lines.append(f"  VERDICT: IMPROVEMENT (MAE reduced by {abs(delta):.4f})")
        elif delta > 0.02:
            lines.append(f"  VERDICT: REGRESSION (MAE increased by {delta:.4f})")
        else:
            lines.append(f"  VERDICT: NEUTRAL (within ±0.02 threshold)")

    return "\n".join(lines)


def run_hypothesis(
    base_model_name: str,
    seasons: List[int],
    scale_features: Optional[Dict[str, float]] = None,
    remove_features: Optional[List[str]] = None,
) -> str:
    """Run a full hypothesis test and return the comparison report."""
    base_model = get_model(base_model_name)

    # Build description
    parts = []
    if scale_features:
        for feat, scale in scale_features.items():
            parts.append(f"{feat} scaled {scale}x")
    if remove_features:
        for feat in remove_features:
            parts.append(f"remove {feat}")
    desc = f"{base_model_name} with {', '.join(parts)}"

    # Create hypothesis model name
    hypothesis_name = f"_hypothesis_{base_model_name}"
    if scale_features:
        for feat, scale in scale_features.items():
            hypothesis_name += f"_scale_{feat}_{scale}"
    if remove_features:
        for feat in remove_features:
            hypothesis_name += f"_no_{feat}"

    # Truncate if too long
    if len(hypothesis_name) > 100:
        hypothesis_name = hypothesis_name[:100]

    print(f"Running hypothesis: {desc}")
    print(f"Hypothesis model name: {hypothesis_name}")

    # Clean up any previous run
    _cleanup_hypothesis(hypothesis_name)

    # Create hypothesis model and temporarily register it
    hyp_model = _create_hypothesis_model(
        base_model, hypothesis_name, scale_features, remove_features,
    )

    # Temporarily add to MODELS dict for runner
    MODELS[hypothesis_name] = hyp_model

    try:
        # Only run for additive models (learned models need retraining)
        if hyp_model.combiner_type == "learned":
            print("WARNING: Hypothesis testing on learned models modifies weights")
            print("  but does NOT retrain. Results are approximate only.")
            print("  For accurate results, define a new model and train it.")

        # Run projections
        run_model(hypothesis_name, seasons)

        # Run backtest
        hyp_results = backtest_model(hypothesis_name, seasons)

        # Fetch base results (or run backtest if missing)
        base_results = _fetch_base_results(base_model_name, seasons)
        if not base_results:
            print(f"\nBase model results not cached, running backtest for {base_model_name}...")
            base_results = backtest_model(base_model_name, seasons)

        # Format comparison
        report = _format_comparison(base_model_name, desc, base_results, hyp_results, seasons)

        return report

    finally:
        # Always clean up
        MODELS.pop(hypothesis_name, None)
        _cleanup_hypothesis(hypothesis_name)


def main() -> None:
    parser = argparse.ArgumentParser(description="Quick hypothesis testing for projection models")
    parser.add_argument("--base-model", required=True, help="Base model name from model_config")
    parser.add_argument("--seasons", required=True, help="Comma-separated seasons (e.g., 2022,2023,2024,2025)")
    parser.add_argument(
        "--scale-feature",
        action="append",
        default=[],
        help="Scale a feature weight (format: feature_name=factor, e.g., age_curve=1.5)",
    )
    parser.add_argument(
        "--remove-feature",
        action="append",
        default=[],
        help="Remove a feature from the model",
    )
    args = parser.parse_args()

    if not args.scale_feature and not args.remove_feature:
        print("Error: Must specify at least one --scale-feature or --remove-feature")
        sys.exit(1)

    seasons = [int(s.strip()) for s in args.seasons.split(",")]

    # Parse scale features
    scale_features = {}
    for sf in args.scale_feature:
        parts = sf.split("=", 1)
        if len(parts) != 2:
            print(f"Error: --scale-feature must be format 'name=factor', got '{sf}'")
            sys.exit(1)
        scale_features[parts[0]] = float(parts[1])

    report = run_hypothesis(
        args.base_model,
        seasons,
        scale_features=scale_features or None,
        remove_features=args.remove_feature or None,
    )

    print("\n" + "=" * 70)
    print(report)


if __name__ == "__main__":
    main()
