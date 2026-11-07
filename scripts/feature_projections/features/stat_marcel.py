"""Stage A Marcel-plus stat baseline as a base feature (stat-projection redesign).

The projection itself is computed once per target season by
``scripts/feature_projections/stat_baseline.py`` (fit k and μ per position and
stat on seasons before the target, shrink each stat, score the per-game stat
line). The runner puts the resulting ``player_id → ppg`` map in
``context["stat_baseline_ppg"]``; this feature only looks the player up, so the
whole-population fit stays out of the per-player feature API.
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


class StatMarcelBaselineFeature(ProjectionFeature):
    """Absolute PPG from the Stage A per-stat shrunk stat line."""

    @property
    def name(self) -> str:
        return "stat_marcel_baseline"

    @property
    def is_base(self) -> bool:
        return True

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        lookup = context.get("stat_baseline_ppg")
        if not lookup:
            return None
        value = lookup.get(player_id)
        return float(value) if value is not None else None
