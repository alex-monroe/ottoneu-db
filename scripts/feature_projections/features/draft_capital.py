"""Draft capital feature — pre-NFL signal from where a player was drafted.

Draft capital is the strongest predictor of rookie/early-career performance.
A 1st-round WR has fundamentally different opportunity expectations than a
5th-rounder; until the player has built up a multi-year statistical track
record, this is the only orthogonal signal available beyond age and prior
PPG. After year 3 the signal decays — veteran performance is dominated by
their actual NFL track record, so the feature returns 0. GH #376.

Feature value is log-scaled overall pick on a "higher = better" axis. We use
``log(257) - log(overall_pick)`` so pick 1 ≈ 5.55, pick 32 ≈ 2.08, pick 256 ≈ 0.
The learned combiner picks the coefficient. Interaction terms with position
let it find position-specific effects (e.g. RB 1st-rounders behave differently
than QB 1st-rounders).
"""

from __future__ import annotations

import math
from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature

VETERAN_CUTOFF_SEASONS = 4  # 4+ seasons since draft → signal returns 0
TOTAL_PICKS = 257  # Roughly modern draft length, used to anchor log scaling


class DraftCapitalRawFeature(ProjectionFeature):
    """Log-scaled overall pick for players in their first three NFL seasons."""

    @property
    def name(self) -> str:
        return "draft_capital_raw"

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        target_season = context.get("target_season")
        draft = context.get("draft_capital")
        if target_season is None or not draft:
            return None

        season_drafted = draft.get("season_drafted")
        overall_pick = draft.get("overall_pick")
        if season_drafted is None or overall_pick is None:
            return None
        if overall_pick <= 0:
            return None

        seasons_since_draft = int(target_season) - int(season_drafted)
        if seasons_since_draft < 0 or seasons_since_draft >= VETERAN_CUTOFF_SEASONS:
            return 0.0

        return math.log(TOTAL_PICKS) - math.log(int(overall_pick))
