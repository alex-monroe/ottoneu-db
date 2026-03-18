"""Regression-to-positional-mean feature — pulls outlier projections toward positional average."""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


class RegressionToMeanFeature(ProjectionFeature):
    """Adjusts projection toward the positional mean PPG.

    Extreme performances regress naturally. This feature models that
    by nudging the base projection toward the positional average,
    weighted by a regression factor.

    delta = (positional_mean_ppg - base_ppg) * regression_factor

    A positive delta means the player is below the positional mean
    and gets a boost; negative means above mean and gets pulled down.
    """

    REGRESSION_FACTOR = 0.12

    @property
    def name(self) -> str:
        return "regression_to_mean"

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        base_ppg = context.get("base_ppg")
        positional_mean_ppg = context.get("positional_mean_ppg")

        if base_ppg is None or positional_mean_ppg is None:
            return None

        delta = (positional_mean_ppg - base_ppg) * self.REGRESSION_FACTOR
        return delta
