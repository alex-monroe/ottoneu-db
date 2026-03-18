"""Weighted PPG feature — port of existing WeightedAveragePPG + RookieTrajectoryPPG."""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


class WeightedPPGFeature(ProjectionFeature):
    """Recency-weighted, games-scaled average PPG.

    For veterans (2+ seasons): uses WeightedAveragePPG logic with recency weights
    [0.55, 0.25, 0.20] and games_played/17 scaling.

    For rookies (1 season): uses RookieTrajectoryPPG logic with H2/H1 snap trajectory.

    This is the baseline feature — an exact port of the existing projection_methods.py.
    """

    RECENCY_WEIGHTS = [0.55, 0.25, 0.20]
    ROOKIE_MIN_FACTOR = 0.75
    ROOKIE_MAX_FACTOR = 1.50

    @property
    def name(self) -> str:
        return "weighted_ppg"

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
        if history_df.empty:
            return None

        sorted_df = history_df.sort_values("season")
        recent = sorted_df.tail(3)
        n = len(recent)

        if n == 1:
            return self._rookie_trajectory(recent.iloc[0])
        else:
            return self._weighted_average(recent)

    def _weighted_average(self, recent: pd.DataFrame) -> Optional[float]:
        """Veteran projection: recency-weighted, games-scaled average."""
        n = len(recent)
        weights = self.RECENCY_WEIGHTS[:n]

        numerator = 0.0
        denominator = 0.0

        for i, (_, row) in enumerate(recent.iloc[::-1].iterrows()):
            recency_w = weights[i]
            games_scale = float(row["games_played"]) / 17.0
            effective_w = recency_w * games_scale

            numerator += float(row["ppg"]) * effective_w
            denominator += effective_w

        if denominator == 0:
            return None
        return numerator / denominator

    def _rookie_trajectory(self, row: pd.Series) -> Optional[float]:
        """Rookie projection: PPG × clamp(H2_SPG / H1_SPG, 0.75, 1.50)."""
        ppg = float(row["ppg"]) if pd.notna(row.get("ppg")) else 0.0
        if ppg == 0:
            return None

        h1_snaps = int(row.get("h1_snaps") or 0) if pd.notna(row.get("h1_snaps")) else 0
        h1_games = max(int(row.get("h1_games") or 1) if pd.notna(row.get("h1_games")) else 1, 1)
        h2_snaps = int(row.get("h2_snaps") or 0) if pd.notna(row.get("h2_snaps")) else 0
        h2_games = max(int(row.get("h2_games") or 1) if pd.notna(row.get("h2_games")) else 1, 1)

        h1_spg = h1_snaps / h1_games
        h2_spg = h2_snaps / h2_games

        if h1_spg == 0:
            return ppg

        factor = min(max(h2_spg / h1_spg, self.ROOKIE_MIN_FACTOR), self.ROOKIE_MAX_FACTOR)
        return ppg * factor
