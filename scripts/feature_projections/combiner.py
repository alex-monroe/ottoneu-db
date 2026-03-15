"""Combiner: aggregates feature outputs into a final PPG projection."""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


def combine_features(
    features: list[ProjectionFeature],
    player_id: str,
    position: str,
    history_df: pd.DataFrame,
    nfl_stats_df: pd.DataFrame,
    context: dict[str, Any],
    weights: dict[str, float] | None = None,
) -> tuple[Optional[float], dict[str, Optional[float]]]:
    """Compute all features and combine into a final PPG projection.

    Uses weighted addition: final_ppg = base_value + Σ(adj_value * w_adj)

    Args:
        features: Ordered list of feature instances.
        player_id: Player UUID string.
        position: Player position.
        history_df: Player's player_stats rows.
        nfl_stats_df: Player's nfl_stats rows.
        context: Shared context dict.
        weights: Optional feature name → weight mapping. Defaults to 1.0.

    Returns:
        (final_ppg, feature_values) where feature_values maps name → computed value.
    """
    if weights is None:
        weights = {}

    feature_values: dict[str, Optional[float]] = {}
    base_value: Optional[float] = None
    base_feature_name: Optional[str] = None

    # First pass: compute base feature
    for feature in features:
        if feature.is_base:
            val = feature.compute(player_id, position, history_df, nfl_stats_df, context)
            feature_values[feature.name] = val
            if val is not None:
                w = weights.get(feature.name, 1.0)
                base_value = val * w
                base_feature_name = feature.name
            break

    if base_value is None:
        # No base feature produced a value — can't project
        return None, feature_values

    # Update context with base_ppg so adjustment features can use it
    context_with_base = {**context, "base_ppg": base_value}

    # Second pass: compute adjustment features
    total_adjustment = 0.0
    for feature in features:
        if feature.is_base:
            continue
        val = feature.compute(player_id, position, history_df, nfl_stats_df, context_with_base)
        feature_values[feature.name] = val
        if val is not None:
            w = weights.get(feature.name, 1.0)
            total_adjustment += val * w

    final_ppg = base_value + total_adjustment
    # Floor at 0 — negative PPG doesn't make sense
    final_ppg = max(0.0, final_ppg)

    return final_ppg, feature_values
