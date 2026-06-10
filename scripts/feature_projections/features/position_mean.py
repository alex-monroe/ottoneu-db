"""Positional-mean baseline (GH #575, Finding 4).

A zero-information floor: every player is projected at their position's mean PPG
(computed from the prior-season window, so leakage-free). By construction it
cannot discriminate between players (R² ≈ 0), which is the point — it shows how
much of a model's apparent accuracy is just knowing the positional scale vs.
actually ranking players. Any real model must clearly beat this.
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


class PositionMeanFeature(ProjectionFeature):
    """Absolute PPG = the position's mean PPG from the history window."""

    @property
    def name(self) -> str:
        return "position_mean"

    @property
    def is_base(self) -> bool:
        return True

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        val = context.get("positional_mean_ppg")
        return float(val) if val is not None else None
