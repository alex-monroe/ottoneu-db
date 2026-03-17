"""Games played feature — availability/durability adjustment."""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature

FULL_SEASON_GAMES = 17
AVAILABILITY_THRESHOLD = 0.85        # was implicit 0.95; ignores 1-2 missed games as noise
MIN_SEASONS_BELOW_THRESHOLD = 2      # require chronic injury pattern, not one bad year
PENALTY_DAMPING = 0.5                # halve the raw penalty; base_ppg already reflects health


class GamesPlayedFeature(ProjectionFeature):
    """Adjusts projection based on historical availability patterns.

    Players who consistently miss games should have their per-game projection
    discounted by an expected availability factor. The adjustment is:
      delta = base_ppg * (availability_factor - 1.0) * PENALTY_DAMPING

    An always-healthy player (17 GP) gets 0.0 delta.
    A player chronically missing games gets a dampened negative delta.
    Penalty only applies if 2+ recent seasons were below the availability threshold.
    """

    RECENCY_WEIGHTS = [0.60, 0.25, 0.15]

    @property
    def name(self) -> str:
        return "games_played"

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

        base_ppg = context.get("base_ppg")
        if not base_ppg or base_ppg <= 0:
            return None

        sorted_df = history_df.sort_values("season")
        recent = sorted_df.tail(3)
        n = len(recent)
        weights = self.RECENCY_WEIGHTS[:n]

        weighted_availability = 0.0
        total_weight = 0.0
        seasons_below_threshold = 0

        for i, (_, row) in enumerate(recent.iloc[::-1].iterrows()):
            games = float(row.get("games_played", 0))
            availability = min(games / FULL_SEASON_GAMES, 1.0)
            w = weights[i]
            weighted_availability += availability * w
            total_weight += w
            if availability < AVAILABILITY_THRESHOLD:
                seasons_below_threshold += 1

        if total_weight == 0:
            return None

        avg_availability = weighted_availability / total_weight

        # Only apply adjustment if weighted availability is below threshold
        if avg_availability >= AVAILABILITY_THRESHOLD:
            return 0.0

        # Require chronic injury pattern — one bad year then recovery is not penalized
        if seasons_below_threshold < MIN_SEASONS_BELOW_THRESHOLD:
            return 0.0

        return base_ppg * (avg_availability - 1.0) * PENALTY_DAMPING
