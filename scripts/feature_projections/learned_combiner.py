"""Learned combiner: Ridge regression over raw feature values with interaction terms.

Instead of hand-tuned additive weights, this combiner uses Ridge regression coefficients
learned from historical data via leave-one-season-out cross-validation. This allows the
model to capture nonlinear relationships (e.g., diminishing returns at high usage share,
position-specific share effects) that a linear delta formula cannot.

See GH #367 for motivation. This is the scaffolding for the full ML ensemble (#283).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature

# Positions that get dummy variables in interaction terms
POSITIONS = ["QB", "RB", "WR", "TE"]

TRAINED_MODELS_DIR = Path(__file__).parent / "trained_models"


def build_feature_vector(
    feature_values: dict[str, Optional[float]],
    position: str,
    interaction_terms: list[str],
) -> Optional[list[float]]:
    """Convert feature outputs + interaction terms into a numeric vector.

    The vector layout is:
    1. Raw feature values in alphabetical order (None → NaN)
    2. Interaction term values in the order specified

    Supported interaction term formats:
    - "feat*position" → 4 values (feat × QB_dummy, feat × RB_dummy, ...)
    - "feat*other_feat" → 1 value (product of two features)
    - "feat^2" → 1 value (feature squared)

    Returns None if the base feature (first alphabetically) is None, since we
    can't project without a base PPG estimate.
    """
    # Sort feature names for consistent ordering
    feature_names = sorted(feature_values.keys())

    # Build base feature vector
    values: list[float] = []
    for name in feature_names:
        val = feature_values.get(name)
        values.append(float(val) if val is not None else 0.0)

    # Build interaction terms
    for term in interaction_terms:
        if "^2" in term:
            # Quadratic: "feat^2"
            feat_name = term.replace("^2", "")
            feat_val = feature_values.get(feat_name)
            if feat_val is not None:
                values.append(float(feat_val) ** 2)
            else:
                values.append(0.0)
        elif "*position" in term:
            # Position interaction: "feat*position" → 4 dummy columns
            feat_name = term.replace("*position", "")
            feat_val = feature_values.get(feat_name)
            for pos in POSITIONS:
                if feat_val is not None and position == pos:
                    values.append(float(feat_val))
                else:
                    values.append(0.0)
        elif "*" in term:
            # Feature interaction: "feat_a*feat_b"
            parts = term.split("*", 1)
            val_a = feature_values.get(parts[0])
            val_b = feature_values.get(parts[1])
            if val_a is not None and val_b is not None:
                values.append(float(val_a) * float(val_b))
            else:
                values.append(0.0)
        else:
            values.append(0.0)

    return values


def get_feature_column_names(
    feature_names: list[str],
    interaction_terms: list[str],
) -> list[str]:
    """Return the column names corresponding to the feature vector layout.

    Used for inspection and debugging of learned coefficients.
    """
    columns = list(sorted(feature_names))

    for term in interaction_terms:
        if "^2" in term:
            columns.append(term)
        elif "*position" in term:
            feat_name = term.replace("*position", "")
            for pos in POSITIONS:
                columns.append(f"{feat_name}*{pos}")
        elif "*" in term:
            columns.append(term)
        else:
            columns.append(term)

    return columns


def compute_features_for_player(
    features: list[ProjectionFeature],
    player_id: str,
    position: str,
    history_df: pd.DataFrame,
    nfl_stats_df: pd.DataFrame,
    context: dict[str, Any],
    weights: dict[str, float] | None = None,
) -> dict[str, Optional[float]]:
    """Compute all feature values for a player (both base and adjustments).

    Unlike the additive combiner, this returns raw feature outputs without
    combining them — the learned model handles combination.
    """
    if weights is None:
        weights = {}

    feature_values: dict[str, Optional[float]] = {}

    # First pass: compute base feature and set base_ppg in context
    for feature in features:
        if feature.is_base:
            val = feature.compute(player_id, position, history_df, nfl_stats_df, context)
            if val is not None:
                w = weights.get(feature.name, 1.0)
                val = val * w
            feature_values[feature.name] = val
            break

    base_ppg = feature_values.get(next((f.name for f in features if f.is_base), ""))
    if base_ppg is None:
        return feature_values

    # Update context so adjustment features can use base_ppg
    context_with_base = {**context, "base_ppg": base_ppg}

    # Second pass: compute adjustment features
    for feature in features:
        if feature.is_base:
            continue
        val = feature.compute(player_id, position, history_df, nfl_stats_df, context_with_base)
        feature_values[feature.name] = val

    return feature_values


def predict(
    feature_values: dict[str, Optional[float]],
    position: str,
    model_params: dict[str, Any],
) -> Optional[float]:
    """Apply saved Ridge coefficients to produce a PPG prediction.

    Args:
        feature_values: Raw feature outputs from compute_features_for_player.
            Extra keys not seen at training time are dropped (residual models
            evaluate a superset of features).
        position: Player position.
        model_params: Loaded from trained_models JSON (coefficients, intercept,
                      feature_names, interaction_terms, scaler params).

    Returns:
        Predicted PPG, or None if feature vector cannot be built.
    """
    interaction_terms = model_params["interaction_terms"]

    # Restrict to the raw features this model was trained on. The saved
    # ``feature_names`` list contains both raw columns and interaction columns
    # (e.g. ``usage_share_raw*WR``); raw columns are those without ``*`` or
    # ``^``. Filtering avoids shape mismatches when the caller hands in a
    # superset of feature_values (e.g. a residual model also computing the
    # base model's features alongside its own).
    saved_columns = model_params.get("feature_names")
    if saved_columns:
        raw_feature_names = [c for c in saved_columns if "*" not in c and "^" not in c]
        feature_values = {k: feature_values.get(k) for k in raw_feature_names}

    vector = build_feature_vector(feature_values, position, interaction_terms)
    if vector is None:
        return None

    x = np.array(vector, dtype=np.float64)

    # Apply standardization if scaler params are present
    if "scaler_mean" in model_params and "scaler_scale" in model_params:
        mean = np.array(model_params["scaler_mean"], dtype=np.float64)
        scale = np.array(model_params["scaler_scale"], dtype=np.float64)
        # Avoid division by zero for constant features
        scale = np.where(scale == 0, 1.0, scale)
        x = (x - mean) / scale

    coefficients = np.array(model_params["coefficients"], dtype=np.float64)
    intercept = float(model_params["intercept"])

    predicted = float(np.dot(x, coefficients) + intercept)
    return max(0.0, predicted)


def load_model_params(model_name: str) -> dict[str, Any]:
    """Load trained model parameters from JSON file."""
    path = TRAINED_MODELS_DIR / f"{model_name}.json"
    if not path.exists():
        raise FileNotFoundError(
            f"No trained model found at {path}. "
            f"Run: venv/bin/python scripts/feature_projections/train_model.py "
            f"--model {model_name}"
        )
    with open(path) as f:
        return json.load(f)


def combine_features_learned(
    features: list[ProjectionFeature],
    player_id: str,
    position: str,
    history_df: pd.DataFrame,
    nfl_stats_df: pd.DataFrame,
    context: dict[str, Any],
    model_params: dict[str, Any],
    weights: dict[str, float] | None = None,
) -> tuple[Optional[float], dict[str, Optional[float]]]:
    """Learned combiner entry point — drop-in replacement for combine_features.

    Computes features, builds the feature vector with interactions, and applies
    Ridge regression coefficients. Returns (predicted_ppg, feature_values) in the
    same format as the additive combiner.
    """
    feature_values = compute_features_for_player(
        features, player_id, position, history_df, nfl_stats_df, context, weights
    )

    # Check if base feature produced a value
    base_feature_name = next((f.name for f in features if f.is_base), None)
    if base_feature_name and feature_values.get(base_feature_name) is None:
        return None, feature_values

    predicted = predict(feature_values, position, model_params)
    return predicted, feature_values


def predict_residual(
    feature_values: dict[str, Optional[float]],
    position: str,
    model_params: dict[str, Any],
) -> Optional[float]:
    """Apply a residual model on top of its embedded base model.

    `model_params` is the JSON saved by ``train_ridge_residual``. It carries the
    full base model under ``base_model_params`` plus the residual coefficients.
    Returns ``base_pred + residual`` (clamped at 0). The residual model has
    ``intercept=0`` and is fit with ``fit_intercept=False`` so a sample whose
    residual feature values are all zero contributes exactly zero — those
    samples receive byte-identical base predictions.
    """
    base_params = model_params.get("base_model_params")
    if not base_params:
        return None

    base_pred = predict(feature_values, position, base_params)
    if base_pred is None:
        return None

    residual_features = model_params.get("feature_names") or []
    interaction_terms = model_params.get("interaction_terms") or []

    # Build the residual vector using only the residual model's features.
    residual_fv = {f: feature_values.get(f) for f in residual_features}
    vector = build_feature_vector(residual_fv, position, interaction_terms)
    if vector is None:
        return max(0.0, base_pred)

    coefficients = np.array(model_params["coefficients"], dtype=np.float64)
    delta = float(np.dot(np.array(vector, dtype=np.float64), coefficients))
    return max(0.0, base_pred + delta)


def combine_features_residual(
    features: list[ProjectionFeature],
    player_id: str,
    position: str,
    history_df: pd.DataFrame,
    nfl_stats_df: pd.DataFrame,
    context: dict[str, Any],
    model_params: dict[str, Any],
    weights: dict[str, float] | None = None,
) -> tuple[Optional[float], dict[str, Optional[float]]]:
    """Residual combiner entry point.

    `features` should include both the base model's features (so its prediction
    is reproducible) and the residual model's features. The runner is
    responsible for assembling that union — this function just computes
    everything that's passed in and hands it to ``predict_residual``.
    """
    feature_values = compute_features_for_player(
        features, player_id, position, history_df, nfl_stats_df, context, weights
    )

    base_feature_name = next((f.name for f in features if f.is_base), None)
    if base_feature_name and feature_values.get(base_feature_name) is None:
        return None, feature_values

    predicted = predict_residual(feature_values, position, model_params)
    return predicted, feature_values
