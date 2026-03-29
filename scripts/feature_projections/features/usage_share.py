"""Usage share feature — share level as role stability signal.

Rewritten from trend-based approach (v6, GH #285). Uses share *level*
relative to positional averages instead of share *trend* extrapolation.
High-share players have more sustainable production; low-share players
are more volatile and likely to regress.
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature

# Which stat represents "usage" for each position.
# QB is excluded: passing_attempts share is structurally ~0.95 for starters,
# so deviations are noise, not signal. See docs/exec-plans/qb-usage-share.md.
USAGE_STAT_BY_POSITION = {
    "RB": "rushing_attempts",
    "WR": "targets",
    "TE": "targets",
}

# Approximate average starter share by position.
# Used as the "neutral" baseline — deviations from this drive the adjustment.
NEUTRAL_SHARE = {
    "RB": 0.35,  # Starter RB ~35% of team rushing attempts (committee era)
    "WR": 0.18,  # WR1 ~18% of team targets
    "TE": 0.15,  # TE1 ~15% of team targets
}

# Minimum volume (season total) to include a season in share calculation.
# Filters out backup stints and injury-shortened seasons.
MIN_VOLUME = {
    "RB": 40,
    "WR": 25,
    "TE": 15,
}

MIN_GAMES = 4  # Minimum games played in a season to include it

RECENCY_WEIGHTS = [0.60, 0.30, 0.10]  # Most recent → oldest (up to 3 seasons)


class UsageShareFeature(ProjectionFeature):
    """Adjusts projection based on player's share level of team usage.

    Computes the player's share of team-level volume (targets for WR/TE,
    rushing attempts for RB), compares to positional average, and returns
    a PPG delta based on whether the player commands above- or below-average share.

    High share → role is established, production more sustainable → positive delta.
    Low share → role is fragile, production less reliable → negative delta.
    """

    SCALING = 0.06  # How much of the share deviation to apply (conservative)
    MAX_ADJ = 0.06  # Clamp to ±6% of base_ppg

    @property
    def name(self) -> str:
        return "usage_share"

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        if nfl_stats_df.empty:
            return None

        base_ppg = context.get("base_ppg")
        if not base_ppg or base_ppg <= 0:
            return None

        usage_stat = USAGE_STAT_BY_POSITION.get(position)
        if not usage_stat:
            return None

        neutral_share = NEUTRAL_SHARE.get(position)
        if not neutral_share:
            return None

        min_volume = MIN_VOLUME.get(position, 0)

        team_usage = context.get("team_usage")
        if not team_usage:
            return None

        sorted_df = nfl_stats_df.sort_values("season")
        recent = sorted_df.tail(3)

        # Compute per-season shares, filtering by minimum games and volume
        shares = []
        for _, row in recent.iterrows():
            player_val = float(row.get(usage_stat, 0) or 0)
            games = float(row.get("games_played", 0) or 0)
            season = int(row["season"])

            if games < MIN_GAMES or player_val < min_volume:
                continue

            team_val = team_usage.get(season, {}).get(usage_stat, 0)
            if team_val > 0:
                # Per-game share normalized to full-season team total
                player_per_game = player_val / games
                team_per_game = team_val / 17.0
                if team_per_game > 0:
                    shares.append(player_per_game / team_per_game)

        if not shares:
            return None

        # Recency-weighted share level
        weights = RECENCY_WEIGHTS[: len(shares)]
        # Shares are ordered oldest→newest from tail(3), reverse for weighting
        shares_reversed = list(reversed(shares))
        total_weight = sum(weights)
        weighted_share = sum(s * w for s, w in zip(shares_reversed, weights)) / total_weight

        # Compare to positional neutral share
        share_ratio = weighted_share / neutral_share
        delta = base_ppg * (share_ratio - 1.0) * self.SCALING

        # Clamp to ±MAX_ADJ of base_ppg
        max_delta = self.MAX_ADJ * base_ppg
        delta = max(-max_delta, min(max_delta, delta))

        return delta
