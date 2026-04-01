"""Compute feature correlation and importance analysis for the projection system.

Usage:
    venv/bin/python scripts/feature_projections/feature_analysis.py --model v20_learned_usage --seasons 2022,2023,2024
    venv/bin/python scripts/feature_projections/feature_analysis.py --model v20_learned_usage --seasons 2022,2023,2024 --output docs/generated/feature-analysis.md

Outputs:
    1. Feature correlation matrix (pairwise Pearson correlations)
    2. Feature-target correlations ranked by absolute value
    3. Variance Inflation Factors (VIF > 5 flagged as HIGH COLLINEARITY)
    4. For learned models: effective feature importance (|coef * std_dev|)
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import List, Optional

import numpy as np
import pandas as pd

# Setup paths so imports work when run directly
script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
repo_root = os.path.dirname(script_dir)
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from config import get_supabase_client, MIN_GAMES
from scripts.feature_projections.model_config import get_model, MODELS
from scripts.feature_projections.train_model import collect_training_data
from scripts.feature_projections.learned_combiner import (
    build_feature_vector,
    get_feature_column_names,
    load_model_params,
)

VIF_THRESHOLD = 5.0


def build_feature_matrix(
    training_data: pd.DataFrame,
    interaction_terms: List[str],
) -> Optional[pd.DataFrame]:
    """Build a feature matrix (DataFrame) from training data rows.

    Each row in training_data must have a 'feature_values' dict column.
    Returns a DataFrame where columns are feature names and rows are samples,
    or None if the matrix is empty.
    """
    feature_names = None  # type: Optional[List[str]]
    all_vectors = []  # type: List[List[float]]

    for _, row in training_data.iterrows():
        fv = row["feature_values"]
        if not fv:
            continue
        position = row["position"]
        vec = build_feature_vector(fv, position, interaction_terms)
        if vec is None:
            continue
        if feature_names is None:
            feature_names = get_feature_column_names(list(fv.keys()), interaction_terms)
        all_vectors.append(vec)

    if not all_vectors or feature_names is None:
        return None

    return pd.DataFrame(all_vectors, columns=feature_names)


def compute_correlation_matrix(feature_df: pd.DataFrame) -> pd.DataFrame:
    """Compute pairwise Pearson correlation matrix across all features."""
    return feature_df.corr(method="pearson")


def compute_target_correlations(
    feature_df: pd.DataFrame,
    actuals: pd.Series,
) -> pd.DataFrame:
    """Compute correlation of each feature with actual PPG.

    Returns a DataFrame with columns: feature, correlation, abs_correlation,
    sorted by abs_correlation descending.
    """
    correlations = []
    for col in feature_df.columns:
        valid_mask = feature_df[col].notna() & actuals.notna()
        if valid_mask.sum() < 3:
            correlations.append({"feature": col, "correlation": float("nan")})
            continue
        corr = feature_df.loc[valid_mask, col].corr(actuals.loc[valid_mask])
        correlations.append({"feature": col, "correlation": corr})

    df = pd.DataFrame(correlations)
    df["abs_correlation"] = df["correlation"].abs()
    df = df.sort_values("abs_correlation", ascending=False).reset_index(drop=True)
    return df


def compute_vif(feature_df: pd.DataFrame) -> pd.DataFrame:
    """Compute Variance Inflation Factor for each feature.

    VIF = 1 / (1 - R^2) where R^2 is from regressing feature j on all other features.
    Computed manually using numpy to avoid statsmodels dependency.
    """
    X = feature_df.values.astype(float)
    n, p = X.shape
    vif_values = []

    for j in range(p):
        # Regress feature j on all other features using OLS: X_other @ beta = X_j
        y_j = X[:, j]
        X_other = np.delete(X, j, axis=1)

        # Add intercept
        X_other_i = np.column_stack([np.ones(n), X_other])

        # Solve via least squares
        r_squared = 0.0
        try:
            beta, residuals, rank, sv = np.linalg.lstsq(X_other_i, y_j, rcond=None)
            y_pred = X_other_i @ beta
            ss_res = np.sum((y_j - y_pred) ** 2)
            ss_tot = np.sum((y_j - np.mean(y_j)) ** 2)
            if ss_tot == 0:
                r_squared = 1.0
            else:
                r_squared = 1.0 - (ss_res / ss_tot)
            r_squared = max(0.0, min(1.0, r_squared))
            if r_squared >= 1.0:
                vif = float("inf")
            else:
                vif = 1.0 / (1.0 - r_squared)
        except np.linalg.LinAlgError:
            vif = float("inf")

        vif_values.append({
            "feature": feature_df.columns[j],
            "VIF": vif,
            "R_squared": r_squared,
            "flag": "HIGH COLLINEARITY" if vif > VIF_THRESHOLD else "",
        })

    return pd.DataFrame(vif_values)


def compute_effective_importance(model_name: str) -> Optional[pd.DataFrame]:
    """For learned models, compute effective importance: |coefficient * feature_std_dev|.

    Parses the trained JSON to extract coefficients and scaler parameters.
    Returns None if the model is not a learned model or has no trained params.
    """
    model_def = get_model(model_name)
    if model_def.combiner_type != "learned":
        return None

    try:
        params = load_model_params(model_name)
    except FileNotFoundError:
        print(f"WARNING: No trained model file for {model_name}")
        return None

    coefficients = params.get("coefficients", [])
    feature_names = params.get("feature_names", [])
    scaler_scale = params.get("scaler_scale", [])

    if not coefficients or not feature_names:
        return None

    rows = []
    for i, name in enumerate(feature_names):
        coef = coefficients[i] if i < len(coefficients) else 0.0
        std_dev = scaler_scale[i] if i < len(scaler_scale) else 1.0
        effective = abs(coef * std_dev)
        rows.append({
            "feature": name,
            "coefficient": coef,
            "std_dev": std_dev,
            "effective_importance": effective,
        })

    df = pd.DataFrame(rows)
    df = df.sort_values("effective_importance", ascending=False).reset_index(drop=True)
    return df


def format_correlation_matrix(corr_matrix: pd.DataFrame) -> str:
    """Format correlation matrix as a readable markdown table."""
    lines = []
    lines.append("## Feature Correlation Matrix\n")

    # Header
    header = "| Feature |"
    separator = "| --- |"
    for col in corr_matrix.columns:
        short = col[:12]
        header += " %s |" % short
        separator += " --- |"
    lines.append(header)
    lines.append(separator)

    # Rows
    for idx in corr_matrix.index:
        row_str = "| %s |" % idx[:12]
        for col in corr_matrix.columns:
            val = corr_matrix.loc[idx, col]
            row_str += " %+.3f |" % val
        lines.append(row_str)

    return "\n".join(lines)


def format_target_correlations(target_corr: pd.DataFrame) -> str:
    """Format feature-target correlations as a readable markdown table."""
    lines = []
    lines.append("## Feature-Target Correlations (vs actual PPG)\n")
    lines.append("| Rank | Feature | Correlation | |Correlation| |")
    lines.append("| --- | --- | --- | --- |")

    for i, (_, row) in enumerate(target_corr.iterrows()):
        corr = row["correlation"]
        abs_corr = row["abs_correlation"]
        corr_str = "%+.4f" % corr if not np.isnan(corr) else "N/A"
        abs_str = "%.4f" % abs_corr if not np.isnan(abs_corr) else "N/A"
        lines.append("| %d | %s | %s | %s |" % (i + 1, row["feature"], corr_str, abs_str))

    return "\n".join(lines)


def format_vif_table(vif_df: pd.DataFrame) -> str:
    """Format VIF table with flags."""
    lines = []
    lines.append("## Variance Inflation Factors\n")
    lines.append("| Feature | VIF | R² | Flag |")
    lines.append("| --- | --- | --- | --- |")

    for _, row in vif_df.iterrows():
        vif = row["VIF"]
        r2 = row["R_squared"]
        vif_str = "%.2f" % vif if not np.isinf(vif) else "INF"
        r2_str = "%.4f" % r2 if not np.isnan(r2) else "N/A"
        lines.append("| %s | %s | %s | %s |" % (row["feature"], vif_str, r2_str, row["flag"]))

    return "\n".join(lines)


def format_importance_table(importance_df: pd.DataFrame) -> str:
    """Format effective importance table."""
    lines = []
    lines.append("## Effective Feature Importance (Learned Model)\n")
    lines.append("| Rank | Feature | Coefficient | Std Dev | |Coef x Std| |")
    lines.append("| --- | --- | --- | --- | --- |")

    for i, (_, row) in enumerate(importance_df.iterrows()):
        lines.append(
            "| %d | %s | %+.4f | %.4f | %.4f |"
            % (i + 1, row["feature"], row["coefficient"], row["std_dev"], row["effective_importance"])
        )

    return "\n".join(lines)


def run_analysis(
    model_name: str,
    seasons: List[int],
    output_path: Optional[str] = None,
) -> None:
    """Run the full feature analysis pipeline."""
    model_def = get_model(model_name)
    print("Feature Analysis for model: %s" % model_name)
    print("Seasons: %s" % seasons)
    print("Combiner type: %s" % model_def.combiner_type)
    print()

    # Collect training data
    print("Collecting training data...")
    training_data = collect_training_data(model_name, seasons)

    if training_data.empty:
        print("ERROR: No training data collected. Exiting.")
        return

    # Build feature matrix
    interaction_terms = model_def.interaction_terms if model_def.combiner_type == "learned" else []
    feature_df = build_feature_matrix(training_data, interaction_terms)

    if feature_df is None or feature_df.empty:
        print("ERROR: Could not build feature matrix. Exiting.")
        return

    print("Feature matrix: %d samples x %d features\n" % (feature_df.shape[0], feature_df.shape[1]))

    # Align actuals with the feature matrix (only rows that produced valid vectors)
    valid_indices = []
    for i, (_, row) in enumerate(training_data.iterrows()):
        fv = row["feature_values"]
        if not fv:
            continue
        vec = build_feature_vector(fv, row["position"], interaction_terms)
        if vec is not None:
            valid_indices.append(i)

    actuals = training_data.iloc[valid_indices]["actual_ppg"].reset_index(drop=True)

    # 1. Correlation matrix
    print("=" * 60)
    print("FEATURE CORRELATION MATRIX")
    print("=" * 60)
    corr_matrix = compute_correlation_matrix(feature_df)
    print(corr_matrix.to_string(float_format="{:+.3f}".format))
    print()

    # 2. Feature-target correlations
    print("=" * 60)
    print("FEATURE-TARGET CORRELATIONS (vs actual PPG)")
    print("=" * 60)
    target_corr = compute_target_correlations(feature_df, actuals)
    for _, row in target_corr.iterrows():
        corr = row["correlation"]
        corr_str = "%+.4f" % corr if not np.isnan(corr) else "N/A"
        print("  %-40s  r = %s" % (row["feature"], corr_str))
    print()

    # 3. VIF
    print("=" * 60)
    print("VARIANCE INFLATION FACTORS")
    print("=" * 60)
    vif_df = compute_vif(feature_df)
    for _, row in vif_df.iterrows():
        vif = row["VIF"]
        vif_str = "%.2f" % vif if not np.isinf(vif) else "INF"
        flag = "  *** %s ***" % row["flag"] if row["flag"] else ""
        print("  %-40s  VIF = %s%s" % (row["feature"], vif_str, flag))
    print()

    # 4. Effective importance (learned models only)
    importance_df = compute_effective_importance(model_name)
    if importance_df is not None:
        print("=" * 60)
        print("EFFECTIVE FEATURE IMPORTANCE (|coef * std_dev|)")
        print("=" * 60)
        for _, row in importance_df.iterrows():
            print(
                "  %-40s  coef=%+.4f  std=%.4f  importance=%.4f"
                % (row["feature"], row["coefficient"], row["std_dev"], row["effective_importance"])
            )
        print()

    # Write markdown report if requested
    if output_path:
        sections = []
        sections.append("# Feature Analysis: %s\n" % model_name)
        sections.append("Seasons: %s" % ", ".join(str(s) for s in seasons))
        sections.append("Samples: %d, Features: %d\n" % (feature_df.shape[0], feature_df.shape[1]))
        sections.append(format_correlation_matrix(corr_matrix))
        sections.append("")
        sections.append(format_target_correlations(target_corr))
        sections.append("")
        sections.append(format_vif_table(vif_df))
        if importance_df is not None:
            sections.append("")
            sections.append(format_importance_table(importance_df))

        report = "\n".join(sections) + "\n"
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "w") as f:
            f.write(report)
        print("Report written to %s" % output_path)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Feature correlation and importance analysis for projection models."
    )
    parser.add_argument(
        "--model",
        required=True,
        help="Model name (e.g. v20_learned_usage). Must be in MODELS.",
    )
    parser.add_argument(
        "--seasons",
        required=True,
        help="Comma-separated seasons to analyze (e.g. 2022,2023,2024).",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Path to write a markdown report (optional).",
    )

    args = parser.parse_args()

    seasons = [int(s.strip()) for s in args.seasons.split(",")]

    if args.model not in MODELS:
        print("ERROR: Unknown model '%s'. Available: %s" % (args.model, ", ".join(MODELS.keys())))
        sys.exit(1)

    run_analysis(args.model, seasons, args.output)


if __name__ == "__main__":
    main()
