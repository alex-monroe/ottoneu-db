"""Age curve feature — positional aging adjustment derived from nfl_stats."""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature

# Empirical peak ages and decline rates by position.
# Derived from NFL career arc research. Peak age is when PPG is highest;
# decline_per_year is the expected PPG delta per year past peak.
POSITION_AGE_CURVES = {
    "QB": {"peak_age": 30, "decline_per_year": 0.3, "growth_per_year": 0.4},
    "RB": {"peak_age": 25, "decline_per_year": 0.8, "growth_per_year": 0.5},
    "WR": {"peak_age": 27, "decline_per_year": 0.5, "growth_per_year": 0.4},
    "TE": {"peak_age": 28, "decline_per_year": 0.4, "growth_per_year": 0.3},
    "K": {"peak_age": 32, "decline_per_year": 0.1, "growth_per_year": 0.1},
}


class AgeCurveFeature(ProjectionFeature):
    """Adjusts projection based on player age relative to positional peak.

    Uses birth_date from context to compute age at season start (Sept 1),
    then applies positional growth/decline curve.
    """

    @property
    def name(self) -> str:
        return "age_curve"

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        birth_date = context.get("birth_date")
        target_season = context.get("target_season")
        if not birth_date or not target_season:
            return None

        try:
            if isinstance(birth_date, str):
                birth_date = pd.Timestamp(birth_date)
            season_start = pd.Timestamp(f"{target_season}-09-01")
            age = (season_start - birth_date).days / 365.25
        except (ValueError, TypeError):
            return None

        curve = POSITION_AGE_CURVES.get(position)
        if not curve:
            return None

        peak_age = curve["peak_age"]
        years_from_peak = age - peak_age

        if years_from_peak > 0:
            # Past peak — decline
            return -curve["decline_per_year"] * years_from_peak
        else:
            # Pre-peak — growth (diminishing as you approach peak)
            years_to_peak = -years_from_peak
            return curve["growth_per_year"] * min(years_to_peak, 3.0)
