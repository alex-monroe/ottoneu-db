"""Advanced receiving features from nflverse — target share, air yards, WOPR, RACR.

These are the strongest WR/TE volume signals: opportunity independent of efficiency.
Unlike `usage_share_raw` (which derives target share from per-team aggregates), these
come pre-computed from nflverse and include air-yards-weighted metrics that capture
downfield usage. WR/TE only — target share is uninformative for QB/RB/K. GH #375.
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature

RECEIVING_POSITIONS = {"WR", "TE"}
MIN_GAMES = 4
RECENCY_WEIGHTS = [0.60, 0.30, 0.10]  # Most recent → oldest, up to 3 seasons


def _weighted_recent_value(
    nfl_stats_df: pd.DataFrame, column: str
) -> Optional[float]:
    """Recency-weighted average of a stat over the last 3 seasons.

    Filters out seasons with fewer than MIN_GAMES (small-sample noise).
    Returns None if no usable seasons.
    """
    if nfl_stats_df.empty or column not in nfl_stats_df.columns:
        return None

    sorted_df = nfl_stats_df.sort_values("season").tail(3)

    values: list[float] = []
    for _, row in sorted_df.iterrows():
        games = float(row.get("games_played", 0) or 0)
        if games < MIN_GAMES:
            continue
        val = row.get(column)
        if val is None or pd.isna(val):
            continue
        values.append(float(val))

    if not values:
        return None

    weights = RECENCY_WEIGHTS[: len(values)]
    values_reversed = list(reversed(values))  # tail() is oldest→newest
    total_weight = sum(weights)
    return sum(v * w for v, w in zip(values_reversed, weights)) / total_weight


class _AdvancedReceivingBase(ProjectionFeature):
    """Shared logic for advanced-receiving raw features."""

    COLUMN: str = ""

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        if position not in RECEIVING_POSITIONS:
            return None
        return _weighted_recent_value(nfl_stats_df, self.COLUMN)


class TargetShareRawFeature(_AdvancedReceivingBase):
    """Recency-weighted target share (fraction of team targets)."""

    COLUMN = "target_share"

    @property
    def name(self) -> str:
        return "target_share_raw"


class AirYardsShareRawFeature(_AdvancedReceivingBase):
    """Recency-weighted air-yards share (fraction of team air yards)."""

    COLUMN = "air_yards_share"

    @property
    def name(self) -> str:
        return "air_yards_share_raw"


class WOPRRawFeature(_AdvancedReceivingBase):
    """Recency-weighted Weighted Opportunity Rating: 1.5*target_share + 0.7*air_yards_share."""

    COLUMN = "wopr"

    @property
    def name(self) -> str:
        return "wopr_raw"


class RACRRawFeature(_AdvancedReceivingBase):
    """Recency-weighted Receiver Air Conversion Ratio: receiving_yards / air_yards."""

    COLUMN = "racr"

    @property
    def name(self) -> str:
        return "racr_raw"
