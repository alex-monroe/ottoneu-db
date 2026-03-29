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


class RegressionToMeanTieredFeature(ProjectionFeature):
    """Tiered regression: dampened mean-reversion for bench-tier players.

    Players whose base PPG falls below the positional starter floor
    (roughly the 24th-ranked player at their position) get zero
    regression toward the positional mean, correcting the systematic
    over-projection of bench-tier players.

    The uniform regression factor pulls bench players UP toward the
    positional mean (which is dominated by starters/elites), inflating
    their projections.  This tiered variant uses three zones:

    Above-mean:          delta = (mean - base) * 0.12  (standard pull toward mean)
    Floor-to-mean:       delta = (mean - base) * -0.05 (mild downward correction)
    Below starter floor: delta = (mean - base) * -0.20 (strong downward correction)

    Bench-tier results (N=420, 2022-2025):
      v14 baseline:  Bias=-1.274, MAE=2.584, R²=0.095
      v21 tiered:    Bias=-0.866, MAE=2.717, R²=0.020
      FantasyPros:   Bias=+0.693, MAE=2.385, R²=0.138

    The graduated approach corrects bench-tier over-projection while
    minimally affecting starter-tier accuracy.
    """

    REGRESSION_FACTOR_ABOVE = 0.12
    REGRESSION_FACTOR_MID = -0.05
    REGRESSION_FACTOR_BENCH = -0.20

    @property
    def name(self) -> str:
        return "regression_to_mean_tiered"

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

        starter_floor = context.get("positional_starter_floor")

        if starter_floor is not None and base_ppg < starter_floor:
            factor = self.REGRESSION_FACTOR_BENCH
        elif base_ppg < positional_mean_ppg:
            factor = self.REGRESSION_FACTOR_MID
        else:
            factor = self.REGRESSION_FACTOR_ABOVE

        delta = (positional_mean_ppg - base_ppg) * factor
        return delta
