"""Analyze model residuals (prediction errors) to identify structural weaknesses.

Computes residual distribution statistics, heteroscedasticity checks,
feature-conditional bias, persistent per-player errors, and season stability.

Usage:
    venv/bin/python scripts/feature_projections/residual_analysis.py --model v20_learned_usage --seasons 2022,2023,2024,2025
    venv/bin/python scripts/feature_projections/residual_analysis.py --model v20_learned_usage --seasons 2022,2023,2024,2025 --output docs/generated/residual-analysis.md
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import pandas as pd

# Setup paths so imports work when run directly
script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
repo_root = os.path.dirname(script_dir)
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from config import get_supabase_client, POSITIONS, MIN_GAMES


def _compute_distribution_stats(residuals: List[float]) -> dict:
    """Compute mean, std, skewness, kurtosis of residuals."""
    n = len(residuals)
    if n < 3:
        return {"mean": None, "std": None, "skewness": None, "kurtosis": None, "n": n}

    mean = sum(residuals) / n
    variance = sum((r - mean) ** 2 for r in residuals) / (n - 1)
    std = math.sqrt(variance) if variance > 0 else 0.0

    if std == 0:
        return {"mean": round(mean, 4), "std": 0.0, "skewness": 0.0, "kurtosis": 0.0, "n": n}

    # Skewness (Fisher)
    m3 = sum((r - mean) ** 3 for r in residuals) / n
    skewness = m3 / (std ** 3)

    # Kurtosis (excess, Fisher)
    m4 = sum((r - mean) ** 4 for r in residuals) / n
    kurtosis = (m4 / (std ** 4)) - 3.0

    return {
        "mean": round(mean, 4),
        "std": round(std, 4),
        "skewness": round(skewness, 4),
        "kurtosis": round(kurtosis, 4),
        "n": n,
    }


def _bin_into_quantiles(values: List[float], n_bins: int = 4) -> List[Tuple[str, List[int]]]:
    """Bin values into quantiles and return (label, indices) pairs."""
    if not values:
        return []

    indexed = sorted(enumerate(values), key=lambda x: x[1])
    bin_size = max(1, len(indexed) // n_bins)

    bins = []
    for i in range(n_bins):
        start = i * bin_size
        end = start + bin_size if i < n_bins - 1 else len(indexed)
        if start >= len(indexed):
            break
        bin_items = indexed[start:end]
        low = bin_items[0][1]
        high = bin_items[-1][1]
        label = f"[{low:.1f}, {high:.1f}]"
        indices = [idx for idx, _ in bin_items]
        bins.append((label, indices))

    return bins


def collect_residuals(
    model_name: str,
    seasons: List[int],
    min_games: int = MIN_GAMES,
) -> pd.DataFrame:
    """Fetch projections and actuals, compute residuals.

    Returns DataFrame with columns: player_id, name, position, season,
    projected_ppg, actual_ppg, residual, abs_residual, feature_values.
    """
    supabase = get_supabase_client()

    # Look up model
    model_res = (
        supabase.table("projection_models")
        .select("id, name")
        .eq("name", model_name)
        .execute()
    )
    if not model_res.data:
        raise ValueError(f"Model '{model_name}' not found in projection_models table")
    model_id = model_res.data[0]["id"]

    # Fetch player info
    players_res = supabase.table("players").select("id, name, position").execute()
    player_info = {row["id"]: row for row in (players_res.data or [])}

    rows = []
    for season in seasons:
        # Fetch projections
        proj_res = (
            supabase.table("model_projections")
            .select("player_id, projected_ppg, feature_values")
            .eq("model_id", model_id)
            .eq("season", season)
            .execute()
        )
        proj_map = {}
        for row in (proj_res.data or []):
            fv = row.get("feature_values") or {}
            if isinstance(fv, str):
                fv = json.loads(fv)
            proj_map[row["player_id"]] = {
                "projected_ppg": float(row["projected_ppg"]),
                "feature_values": fv,
            }

        # Fetch actuals
        actuals_res = (
            supabase.table("player_stats")
            .select("player_id, ppg, games_played")
            .eq("season", season)
            .execute()
        )

        for row in (actuals_res.data or []):
            pid = row["player_id"]
            games = int(row.get("games_played", 0) or 0)
            if games < min_games or pid not in proj_map:
                continue

            actual_ppg = float(row["ppg"])
            proj = proj_map[pid]
            info = player_info.get(pid, {})
            residual = actual_ppg - proj["projected_ppg"]

            rows.append({
                "player_id": pid,
                "name": info.get("name", "Unknown"),
                "position": info.get("position", "?"),
                "season": season,
                "projected_ppg": proj["projected_ppg"],
                "actual_ppg": actual_ppg,
                "residual": residual,
                "abs_residual": abs(residual),
                "feature_values": proj["feature_values"],
            })

    return pd.DataFrame(rows)


def analyze_distribution(df: pd.DataFrame) -> dict:
    """Analyze residual distribution overall and by position."""
    results = {"overall": _compute_distribution_stats(df["residual"].tolist())}

    for pos in POSITIONS:
        pos_df = df[df["position"] == pos]
        if not pos_df.empty:
            results[pos] = _compute_distribution_stats(pos_df["residual"].tolist())

    return results


def analyze_heteroscedasticity(df: pd.DataFrame, n_bins: int = 4) -> dict:
    """Check if residual variance changes with prediction magnitude."""
    predicted = df["projected_ppg"].tolist()
    residuals = df["residual"].tolist()

    bins = _bin_into_quantiles(predicted, n_bins)
    if not bins:
        return {"bins": [], "heteroscedastic": False, "max_std_ratio": 0.0}

    bin_stats = []
    stds = []
    for label, indices in bins:
        bin_residuals = [residuals[i] for i in indices]
        stats = _compute_distribution_stats(bin_residuals)
        stats["prediction_bin"] = label
        stats["count"] = len(bin_residuals)
        bin_stats.append(stats)
        if stats["std"] is not None and stats["std"] > 0:
            stds.append(stats["std"])

    max_ratio = max(stds) / min(stds) if len(stds) >= 2 and min(stds) > 0 else 1.0

    return {
        "bins": bin_stats,
        "heteroscedastic": max_ratio > 2.0,
        "max_std_ratio": round(max_ratio, 2),
    }


def analyze_feature_residuals(df: pd.DataFrame, n_bins: int = 4) -> dict:
    """For each feature, bin values and show mean residual per bin."""
    if df.empty:
        return {}

    # Collect all feature names
    all_features = set()
    for fv in df["feature_values"]:
        if isinstance(fv, dict):
            all_features.update(fv.keys())

    results = {}
    for feat_name in sorted(all_features):
        # Extract feature values and corresponding residuals
        feat_vals = []
        resids = []
        for _, row in df.iterrows():
            fv = row["feature_values"]
            if isinstance(fv, dict) and feat_name in fv and fv[feat_name] is not None:
                feat_vals.append(float(fv[feat_name]))
                resids.append(row["residual"])

        if len(feat_vals) < 8:
            continue

        bins = _bin_into_quantiles(feat_vals, n_bins)
        bin_stats = []
        for label, indices in bins:
            bin_resids = [resids[i] for i in indices]
            mean_resid = sum(bin_resids) / len(bin_resids) if bin_resids else 0.0
            bin_stats.append({
                "feature_bin": label,
                "mean_residual": round(mean_resid, 4),
                "count": len(bin_resids),
            })

        results[feat_name] = bin_stats

    return results


def analyze_persistent_errors(df: pd.DataFrame, min_seasons: int = 2) -> List[dict]:
    """Find players who appear in multiple seasons with consistently wrong projections."""
    player_residuals: Dict[str, List[dict]] = defaultdict(list)

    for _, row in df.iterrows():
        player_residuals[row["player_id"]].append({
            "name": row["name"],
            "position": row["position"],
            "season": row["season"],
            "residual": row["residual"],
        })

    persistent = []
    for pid, entries in player_residuals.items():
        if len(entries) < min_seasons:
            continue

        resids = [e["residual"] for e in entries]
        # Check if all residuals have the same sign
        all_positive = all(r > 0.5 for r in resids)
        all_negative = all(r < -0.5 for r in resids)

        if all_positive or all_negative:
            avg_resid = sum(resids) / len(resids)
            persistent.append({
                "player_id": pid,
                "name": entries[0]["name"],
                "position": entries[0]["position"],
                "seasons": len(entries),
                "avg_residual": round(avg_resid, 2),
                "direction": "under-projected" if all_positive else "over-projected",
                "details": [
                    {"season": e["season"], "residual": round(e["residual"], 2)}
                    for e in sorted(entries, key=lambda x: x["season"])
                ],
            })

    persistent.sort(key=lambda x: abs(x["avg_residual"]), reverse=True)
    return persistent


def analyze_season_stability(df: pd.DataFrame) -> List[dict]:
    """Check if model accuracy is stable across seasons."""
    results = []
    for season in sorted(df["season"].unique()):
        season_df = df[df["season"] == season]
        resids = season_df["residual"].tolist()
        abs_resids = season_df["abs_residual"].tolist()

        mae = sum(abs_resids) / len(abs_resids) if abs_resids else 0.0
        bias = sum(resids) / len(resids) if resids else 0.0

        results.append({
            "season": int(season),
            "mae": round(mae, 4),
            "bias": round(bias, 4),
            "n": len(resids),
        })

    return results


def format_markdown(
    model_name: str,
    distribution: dict,
    heteroscedasticity: dict,
    feature_residuals: dict,
    persistent_errors: List[dict],
    season_stability: List[dict],
    seasons: List[int],
) -> str:
    """Format all analysis results as a markdown report."""
    lines = []
    lines.append("# Residual Analysis Report\n")
    lines.append(f"_Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}_\n")
    lines.append(f"**Model:** `{model_name}`  ")
    lines.append(f"**Seasons:** {', '.join(str(s) for s in seasons)}\n")

    # 1. Distribution
    lines.append("## 1. Residual Distribution\n")
    lines.append("| Segment | Mean | Std | Skewness | Kurtosis | N | Flags |")
    lines.append("| --- | --- | --- | --- | --- | --- | --- |")

    for segment in ["overall"] + POSITIONS:
        stats = distribution.get(segment)
        if not stats or stats.get("n", 0) < 3:
            continue
        flags = []
        if stats["skewness"] is not None and abs(stats["skewness"]) > 0.5:
            flags.append("SKEWED")
        if stats["kurtosis"] is not None and stats["kurtosis"] > 3.0:
            flags.append("HEAVY-TAILED")
        flag_str = ", ".join(flags) if flags else "—"
        lines.append(
            f"| {segment} | {stats['mean']:.4f} | {stats['std']:.4f} | "
            f"{stats['skewness']:.4f} | {stats['kurtosis']:.4f} | "
            f"{stats['n']} | {flag_str} |"
        )
    lines.append("")

    # 2. Heteroscedasticity
    lines.append("## 2. Residuals vs Predicted (Heteroscedasticity Check)\n")
    if heteroscedasticity["heteroscedastic"]:
        lines.append(f"**WARNING: Heteroscedasticity detected** (std ratio: {heteroscedasticity['max_std_ratio']}x)\n")
    else:
        lines.append(f"No significant heteroscedasticity (std ratio: {heteroscedasticity['max_std_ratio']}x)\n")

    lines.append("| Prediction Bin | Mean Residual | Std | N |")
    lines.append("| --- | --- | --- | --- |")
    for b in heteroscedasticity.get("bins", []):
        lines.append(
            f"| {b['prediction_bin']} | {b['mean']:.4f} | {b['std']:.4f} | {b['count']} |"
        )
    lines.append("")

    # 3. Feature-conditional residuals
    lines.append("## 3. Residuals by Feature Value\n")
    for feat_name, bins in sorted(feature_residuals.items()):
        lines.append(f"### {feat_name}\n")
        lines.append("| Feature Bin | Mean Residual | N |")
        lines.append("| --- | --- | --- |")
        for b in bins:
            direction = "+" if b["mean_residual"] >= 0 else ""
            lines.append(f"| {b['feature_bin']} | {direction}{b['mean_residual']:.4f} | {b['count']} |")
        lines.append("")

    # 4. Persistent errors
    lines.append("## 4. Persistent Errors (Same Direction Across Seasons)\n")
    if persistent_errors:
        lines.append("| Player | Pos | Seasons | Avg Residual | Direction | Per-Season |")
        lines.append("| --- | --- | --- | --- | --- | --- |")
        for p in persistent_errors[:20]:
            details = ", ".join(f"{d['season']}:{d['residual']:+.2f}" for d in p["details"])
            lines.append(
                f"| {p['name']} | {p['position']} | {p['seasons']} | "
                f"{p['avg_residual']:+.2f} | {p['direction']} | {details} |"
            )
    else:
        lines.append("No persistent errors detected across multiple seasons.")
    lines.append("")

    # 5. Season stability
    lines.append("## 5. Season Stability\n")
    lines.append("| Season | MAE | Bias | N |")
    lines.append("| --- | --- | --- | --- |")
    for s in season_stability:
        lines.append(f"| {s['season']} | {s['mae']:.4f} | {s['bias']:+.4f} | {s['n']} |")

    if len(season_stability) >= 2:
        maes = [s["mae"] for s in season_stability]
        mae_range = max(maes) - min(maes)
        if mae_range > 0.5:
            lines.append(f"\n**WARNING: MAE varies by {mae_range:.3f} across seasons — model may be unstable.**")
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Residual analysis for projection models")
    parser.add_argument("--model", required=True, help="Model name from model_config")
    parser.add_argument("--seasons", required=True, help="Comma-separated seasons (e.g., 2022,2023,2024,2025)")
    parser.add_argument(
        "--output",
        default=None,
        help="Output file path (default: stdout only)",
    )
    args = parser.parse_args()

    model_name = args.model
    seasons = [int(s.strip()) for s in args.seasons.split(",")]

    print(f"Collecting residuals for model '{model_name}' across seasons {seasons}...")
    df = collect_residuals(model_name, seasons)

    if df.empty:
        print("No data found. Ensure model has projections and actuals for the specified seasons.")
        sys.exit(1)

    print(f"Collected {len(df)} residuals\n")

    # Run analyses
    distribution = analyze_distribution(df)
    heteroscedasticity = analyze_heteroscedasticity(df)
    feature_residuals = analyze_feature_residuals(df)
    persistent_errors = analyze_persistent_errors(df)
    season_stability = analyze_season_stability(df)

    # Print summary
    print("=" * 70)
    print("RESIDUAL DISTRIBUTION")
    overall = distribution["overall"]
    print(f"  Mean: {overall['mean']}, Std: {overall['std']}")
    print(f"  Skewness: {overall['skewness']}, Kurtosis: {overall['kurtosis']}")

    if overall["skewness"] is not None and abs(overall["skewness"]) > 0.5:
        print("  ⚠ Residuals are SKEWED — model has systematic directional bias")
    if overall["kurtosis"] is not None and overall["kurtosis"] > 3.0:
        print("  ⚠ Residuals are HEAVY-TAILED — model has occasional large errors")

    print(f"\nHETEROSCEDASTICITY: {'DETECTED' if heteroscedasticity['heteroscedastic'] else 'OK'}")
    print(f"  Max std ratio: {heteroscedasticity['max_std_ratio']}x")

    print(f"\nPERSISTENT ERRORS: {len(persistent_errors)} players")
    for p in persistent_errors[:5]:
        print(f"  {p['name']} ({p['position']}): avg {p['avg_residual']:+.2f} ({p['direction']})")

    print(f"\nSEASON STABILITY:")
    for s in season_stability:
        print(f"  {s['season']}: MAE={s['mae']:.4f}, Bias={s['bias']:+.4f}, n={s['n']}")

    # Write markdown report
    if args.output:
        report = format_markdown(
            model_name, distribution, heteroscedasticity,
            feature_residuals, persistent_errors, season_stability, seasons,
        )
        output_path = args.output
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w") as f:
            f.write(report)
        print(f"\nReport written to: {output_path}")


if __name__ == "__main__":
    main()
