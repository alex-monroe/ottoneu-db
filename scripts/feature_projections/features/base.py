"""Base class for projection features."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional

import pandas as pd


class ProjectionFeature(ABC):
    """Abstract base class for projection features.

    Each feature computes a PPG-scale value:
    - Base features return absolute PPG estimates
    - Adjustment features return PPG deltas (positive = boost, negative = penalty)
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique identifier for this feature."""
        ...

    @property
    def is_base(self) -> bool:
        """Whether this is a base feature (absolute PPG) vs adjustment (delta)."""
        return False

    @abstractmethod
    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        """Compute feature value for a single player.

        Args:
            player_id: The player's UUID string.
            position: Player position (QB, RB, WR, TE, K).
            history_df: Player's rows from player_stats, sorted by season ascending.
            nfl_stats_df: Player's rows from nfl_stats, sorted by season ascending.
            context: Shared context dict (e.g. team-level aggregates, league averages).

        Returns:
            PPG-scale value (absolute for base features, delta for adjustments),
            or None if insufficient data.
        """
        ...
