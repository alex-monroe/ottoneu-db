"""Coaching-change features — offseason scheme-shift signal (spike #651).

A new head coach changes scheme, pace, and pass rate — the classic
"QB/WR breakout or bust" driver a weighted-PPG base cannot see, because it only
reads the player's own (now stale) production. Coaching hires complete by late
January–February, well before the offseason projection run, so this is
leakage-free w.r.t. the target season.

Both features read the player's *target-season* depth-chart team
(``player_team_by_season``, team-changer safe — same lookup the QB-ecosystem
features use) and join to ``team_coaching`` for that (team, season):

- ``coaching_change_raw``: 1.0 if the team's season-opening head coach changed
  from the prior season, 0.0 if it's known and unchanged, ``None`` if the team
  or its coaching record is unknown. Because it is exactly 0.0 for the ~90% of
  player-seasons on a coach-stable team, it is **residual-safe**: in a
  ``fit_intercept=False`` two-stage residual those players receive a zero
  contribution and byte-identical base predictions (mirrors draft_capital #376).
- ``coach_tenure_raw``: consecutive seasons (incl. target) the head coach has
  led the team — continuity/stability. Nonzero for everyone, so this is a
  *learned-combiner* feature, **not** for the residual model.
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


def _player_team(context: dict[str, Any], player_id: str) -> Optional[str]:
    """The player's depth-chart team for the target season (team-changer safe)."""
    target_season = context.get("target_season")
    player_team_by_season: dict = context.get("player_team_by_season", {})
    if target_season is None or not player_team_by_season:
        return None
    return player_team_by_season.get((player_id, int(target_season)))


class CoachingChangeFeature(ProjectionFeature):
    """Indicator that the player's team changed its head coach this offseason."""

    @property
    def name(self) -> str:
        return "coaching_change_raw"

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        target_season = context.get("target_season")
        team_coaching: dict = context.get("team_coaching", {})
        if target_season is None or not team_coaching:
            return None
        team = _player_team(context, player_id)
        if team is None:
            return None
        record = team_coaching.get((team, int(target_season)))
        if record is None:
            return None
        changed = record.get("head_coach_changed")
        if changed is None:
            return None
        return 1.0 if changed else 0.0


class CoachTenureFeature(ProjectionFeature):
    """Consecutive seasons the player's team's head coach has been in place."""

    @property
    def name(self) -> str:
        return "coach_tenure_raw"

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        target_season = context.get("target_season")
        team_coaching: dict = context.get("team_coaching", {})
        if target_season is None or not team_coaching:
            return None
        team = _player_team(context, player_id)
        if team is None:
            return None
        record = team_coaching.get((team, int(target_season)))
        if record is None:
            return None
        tenure = record.get("coach_tenure_years")
        return None if tenure is None else float(tenure)
