"""Pass-catcher ecosystem features — "who is my QB?" from depth charts.

A WR/TE's fantasy production depends heavily on the quarterback throwing to
them, a dimension invisible to a weighted-PPG base (which only sees the
player's own past output). The failed historical ``team_context`` feature
(#391) tried team *ratings* — backward-looking and wrong for team-changers.
These features are forward-looking *personnel identity*, built from the same
opening-day ``depth_charts`` snapshot that made ``depth_chart_position_raw``
load-bearing (#588): we read each team's projected QB1 for the *target*
season (set before any games — no leakage) and grade it by that QB's *prior*
production.

Two WR/TE-only features (None elsewhere, so each learned coefficient is
effectively a WR/TE coefficient):

- ``team_qb_quality_raw``: the player's (target-season) team's projected QB1's
  recency-weighted prior PPG, centered against the league QB mean (so ~0 is an
  average starter, positive an elite passer). Captures upgrades/downgrades at
  QB that the player's own history can't.
- ``team_qb_changed_raw``: 1.0 if the team's projected QB1 differs from the
  prior season's QB1, else 0.0 — ecosystem disruption/uncertainty independent
  of the new QB's level (a value the level alone misses, e.g. a rookie QB with
  no prior PPG looks "average" but is high-variance).

GH #642.
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature

RECEIVING_POSITIONS = {"WR", "TE"}


def _player_team(context: dict[str, Any], player_id: str) -> Optional[str]:
    """The player's depth-chart team for the target season (team-changer safe)."""
    target_season = context.get("target_season")
    player_team_by_season: dict = context.get("player_team_by_season", {})
    if target_season is None or not player_team_by_season:
        return None
    return player_team_by_season.get((player_id, int(target_season)))


class TeamQBQualityFeature(ProjectionFeature):
    """Centered recency-weighted prior PPG of the WR/TE's projected QB1."""

    @property
    def name(self) -> str:
        return "team_qb_quality_raw"

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
        target_season = context.get("target_season")
        qb_quality: dict = context.get("qb_quality", {})
        if target_season is None or not qb_quality:
            return None
        team = _player_team(context, player_id)
        if team is None:
            return None
        return qb_quality.get((team, int(target_season)))


class TeamQBChangedFeature(ProjectionFeature):
    """Indicator that the WR/TE's team changed its projected QB1 year over year."""

    @property
    def name(self) -> str:
        return "team_qb_changed_raw"

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
        target_season = context.get("target_season")
        qb1_by_team: dict = context.get("qb1_by_team", {})
        if target_season is None or not qb1_by_team:
            return None
        team = _player_team(context, player_id)
        if team is None:
            return None

        season = int(target_season)
        qb_now = qb1_by_team.get((team, season))
        qb_prev = qb1_by_team.get((team, season - 1))
        if qb_now is None or qb_prev is None:
            # Can't establish a year-over-year comparison — emit neutral 0.0
            # rather than None so the feature stays populated for WR/TE.
            return 0.0
        return 1.0 if qb_now != qb_prev else 0.0
