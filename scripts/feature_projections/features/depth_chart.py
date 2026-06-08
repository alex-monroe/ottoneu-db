"""Depth-chart features — opening-day role signal from NFL depth charts.

Role changes (a backup promoted to starter via free agency, a rookie who wins
a Week 1 job, a veteran demoted) are among the largest sources of early-season
projection error and are invisible to a 3-year weighted-PPG model that only
sees past production. The `depth_charts` table stores each player's opening-day
depth tier (1 = starter, 2 = backup, 3 = deep reserve), set before any of the
projected season's games are played — a clean, forward-looking, no-leakage
signal. This replaces the failed historical `team_context` feature (#391) with
forward-looking role information.

Two features feed the learned combiner:

- ``depth_chart_position_raw``: a starter score for the target season,
  ``2 - depth_team`` (starter +1, backup 0, deep reserve -1). Higher = more
  central role. The combiner learns the PPG weight and position interactions.
- ``role_change_raw``: the year-over-year change in depth tier vs the player's
  most recent prior depth-chart season, ``prev_depth - target_depth`` (positive
  = promoted into a bigger role, negative = demoted). Grounds role transitions
  in actual depth charts rather than heuristics.

Kickers are excluded — depth charts don't meaningfully rank kicker role.
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


def _target_depth(context: dict[str, Any], player_id: str) -> Optional[int]:
    target_season = context.get("target_season")
    depth_charts: dict[tuple[str, int], int] = context.get("depth_charts", {})
    if target_season is None or not depth_charts:
        return None
    return depth_charts.get((player_id, int(target_season)))


class DepthChartPositionFeature(ProjectionFeature):
    """Opening-day starter score (2 - depth_team) for the target season."""

    @property
    def name(self) -> str:
        return "depth_chart_position_raw"

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
        depth = _target_depth(context, player_id)
        if depth is None:
            return None
        return float(2 - int(depth))


class RoleChangeFeature(ProjectionFeature):
    """Year-over-year depth-tier change vs the most recent prior depth season."""

    @property
    def name(self) -> str:
        return "role_change_raw"

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

        target_season = context.get("target_season")
        depth_charts: dict[tuple[str, int], int] = context.get("depth_charts", {})
        if target_season is None or not depth_charts:
            return None

        target_depth = depth_charts.get((player_id, int(target_season)))
        if target_depth is None:
            return None

        prior_seasons = sorted(
            (s for (pid, s) in depth_charts if pid == player_id and s < int(target_season)),
            reverse=True,
        )
        if not prior_seasons:
            # No prior depth-chart history (rookie / first tracked season) —
            # the level is already captured by depth_chart_position_raw; emit
            # a neutral 0 change rather than None so the feature is populated.
            return 0.0

        prev_depth = depth_charts[(player_id, prior_seasons[0])]
        return float(int(prev_depth) - int(target_depth))
