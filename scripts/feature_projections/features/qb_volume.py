"""QB volume features from nflverse — rushing and passing attempts per game.

The new QB signal the #592 postmortem asked for: the stack projects QB from
blended PPG + role tier, but never from *how the production is composed*.
Rushing volume is the best-documented stable predictor of fantasy QB scoring
(designed-run roles persist year over year and rushing points are less
TD-variance-driven than passing), and pass attempts per game separates
full-time starters from committee/partial-season QBs better than raw PPG or
the depth-chart tier alone. QB-only — both return None for other positions,
so the learned combiner's coefficient on each is effectively a QB
coefficient. GH #640.
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature

MIN_GAMES = 4
RECENCY_WEIGHTS = [0.60, 0.30, 0.10]  # Most recent → oldest, up to 3 seasons


def _weighted_per_game_rate(
    nfl_stats_df: pd.DataFrame, column: str
) -> Optional[float]:
    """Recency-weighted per-game rate of a season-total stat over the last 3 seasons.

    Each usable season contributes column/games_played; seasons with fewer
    than MIN_GAMES are dropped (small-sample noise). Returns None if no
    usable seasons.
    """
    if nfl_stats_df.empty or column not in nfl_stats_df.columns:
        return None

    sorted_df = nfl_stats_df.sort_values("season").tail(3)

    rates: list[float] = []
    for _, row in sorted_df.iterrows():
        games = float(row.get("games_played", 0) or 0)
        if games < MIN_GAMES:
            continue
        val = row.get(column)
        if val is None or pd.isna(val):
            continue
        rates.append(float(val) / games)

    if not rates:
        return None

    weights = RECENCY_WEIGHTS[: len(rates)]
    rates_reversed = list(reversed(rates))  # tail() is oldest→newest
    total_weight = sum(weights)
    return sum(r * w for r, w in zip(rates_reversed, weights)) / total_weight


class _QBVolumeBase(ProjectionFeature):
    """Shared logic for QB volume raw features."""

    COLUMN: str = ""

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        if position != "QB":
            return None
        return _weighted_per_game_rate(nfl_stats_df, self.COLUMN)


class QBRushVolumeRawFeature(_QBVolumeBase):
    """Recency-weighted rushing attempts per game (QB only).

    Pure designed-role volume: a Konami-code QB's rushing floor is structural
    and far more year-over-year stable than passing efficiency.
    """

    COLUMN = "rushing_attempts"

    @property
    def name(self) -> str:
        return "qb_rush_volume_raw"


class QBPassVolumeRawFeature(_QBVolumeBase):
    """Recency-weighted passing attempts per game (QB only).

    Distinguishes true full-time starters (~34 att/g) from committee or
    partial-season QBs whose blended PPG looks similar.
    """

    COLUMN = "passing_attempts"

    @property
    def name(self) -> str:
        return "qb_pass_volume_raw"
