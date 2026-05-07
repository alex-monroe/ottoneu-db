"""Vegas implied team total feature — preseason market signal.

Vegas implied team totals embed every qualitative offseason factor an
internal stats model can't see: new OC, new QB, free-agent signings,
draft additions, scheme shifts. The market is highly efficient at
pricing them. This feature carries that signal directly into the
learned combiner. GH #378.

Output is centered: ``(team_implied_total - league_mean_for_season)``,
in the same units as the raw `team_vegas_lines.implied_total` (season
sum of per-game implied points, ~280–500). Centering removes the
year-over-year drift in league scoring environment so coefficients
are comparable across seasons; the learned ridge does its own
standardization on top.

For the player's effective team in `target_season` we follow the same
convention as `team_context`:
1. Most recent season in `team_history` strictly before `target_season`
   (the team they played for last season — fair for backtest, no
   target-season leakage).
2. Fall back to `nfl_team` (the players-table current team) when there
   is no historical team — used for forward projections of rookies
   and free-agent signings.

Kickers are excluded — K production is bounded by red-zone failures
and FG attempt opportunity, both already captured by their own usage
trends. The market signal here is about offensive ceiling.
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


class ImpliedTeamTotalRawFeature(ProjectionFeature):
    """Centered Vegas implied team total for the player's target-season team."""

    @property
    def name(self) -> str:
        return "implied_team_total_raw"

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
        vegas_lines: dict[tuple[str, int], dict[str, float]] = context.get(
            "vegas_lines", {}
        )
        league_means: dict[int, float] = context.get(
            "vegas_league_mean_implied", {}
        )
        if not target_season or not vegas_lines or not league_means:
            return None

        team_history: dict[int, str] = context.get("team_history", {})
        current_team: str | None = context.get("nfl_team")

        effective_team: str | None = None
        if team_history:
            historical_seasons = sorted(
                [s for s in team_history if s < int(target_season)], reverse=True
            )
            if historical_seasons:
                effective_team = team_history[historical_seasons[0]]
        if not effective_team:
            effective_team = current_team
        if not effective_team:
            return None

        record = vegas_lines.get((effective_team, int(target_season)))
        if not record:
            return None

        implied_total = record.get("implied_total")
        league_mean = league_means.get(int(target_season))
        if implied_total is None or league_mean is None:
            return None

        return float(implied_total) - float(league_mean)
