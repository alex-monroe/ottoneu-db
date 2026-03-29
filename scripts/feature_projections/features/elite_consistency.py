"""Elite consistency feature — boosts projections for proven consistent elite producers."""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


class EliteConsistencyFeature(ProjectionFeature):
    """Positive PPG adjustment for players with sustained elite production.

    Identifies players whose *worst* season (min PPG across 2+ qualifying
    seasons with 6+ games) still exceeds the positional starter floor.
    These consistent elite producers are systematically under-projected
    because regression-to-mean pulls them toward the positional average.

    The boost is scaled by a consistency multiplier that dampens the
    adjustment for high-variance players (high std relative to floor).

    delta = (min_ppg - starter_floor) * SCALE_FACTOR * consistency_multiplier

    Asymmetric: returns None (no effect) for non-qualifying players.
    Never penalises.

    Elite tier results (N=217, 2022-2025):
      v8  baseline:  Bias=+2.632, MAE=2.958, R²=0.216
      v22 w/ elite:  Bias=+2.112, MAE=2.901, R²=0.246
      v23 tiered:    Bias=+2.186, MAE=2.958, R²=0.189
    """

    MIN_QUALIFYING_SEASONS = 2
    MIN_GAMES = 6
    SCALE_FACTOR = 0.50
    MAX_BOOST = 3.0  # PPG cap

    @property
    def name(self) -> str:
        return "elite_consistency"

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        if position == "K":
            return None

        starter_floor = context.get("positional_starter_floor")
        if starter_floor is None:
            return None

        if history_df.empty:
            return None

        # Filter to seasons with enough games played
        qualified = history_df[history_df["games_played"] >= self.MIN_GAMES]
        if len(qualified) < self.MIN_QUALIFYING_SEASONS:
            return None

        season_ppgs = qualified["ppg"].tolist()
        min_ppg = min(season_ppgs)

        # Must exceed starter floor even in worst qualifying season
        if min_ppg <= starter_floor:
            return None

        # Base boost from floor gap
        elite_boost = (min_ppg - starter_floor) * self.SCALE_FACTOR

        # Consistency multiplier: low variance relative to floor = full boost
        ppg_std = qualified["ppg"].std()
        if min_ppg > 0:
            consistency = max(0.5, min(1.0, 1.0 - (ppg_std / min_ppg)))
        else:
            consistency = 0.5

        final_boost = elite_boost * consistency
        return min(final_boost, self.MAX_BOOST)
