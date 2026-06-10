"""Naïve prior-season PPG baseline (GH #575, Finding 4).

The simplest possible projection: next season's PPG = the player's most recent
season's PPG, with no recency weighting, age curve, or regression. Serves as an
honest floor — any model worth its complexity should beat "just use last year."
Even simpler than `v1_baseline_weighted_ppg` (a 3-year weighted average).
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


class NaivePriorSeasonPPGFeature(ProjectionFeature):
    """Absolute PPG = the player's most recent prior season's PPG."""

    @property
    def name(self) -> str:
        return "naive_prior_ppg"

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
        if history_df is None or history_df.empty:
            return None
        df = history_df.copy()
        df["season"] = pd.to_numeric(df["season"], errors="coerce")
        df["ppg"] = pd.to_numeric(df["ppg"], errors="coerce")
        df = df.dropna(subset=["season", "ppg"])
        if df.empty:
            return None
        latest = df.loc[df["season"].idxmax()]
        return float(latest["ppg"])
