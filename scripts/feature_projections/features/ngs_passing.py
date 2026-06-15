"""NGS passing features — stabilized QB skill signals (issue #674).

The #667 spike's "new information" track was looking for a leakage-free signal a
same-data model can't already derive from a player's own PPG. For QB, that's the
NFL Next Gen Stats *process* metrics: how the throw was made, not just whether it
worked. The bet (vs the realized-efficiency reframes that all tied/regressed —
L1 xFP, L5 volume×efficiency, #640 QB volume) is that these are **more persistent
year-to-year** than the realized comp %, YPA and TD rate already baked into PPG:

  ngs_cpoe_raw                    completion % above expected — accuracy skill
  ngs_air_yards_to_sticks_raw     intended depth past the first-down marker
  ngs_aggressiveness_raw          % of throws into tight (≤1 yd) coverage
  ngs_time_to_throw_raw           pocket/process time (sec)
  ngs_air_yards_differential_raw  completed minus intended air yards

Each is a recency-weighted (most-recent → oldest, up to 3 seasons) average of the
player's *prior*-season NGS values, pulled from the `ngs_passing` lookup the
runner builds (keyed by (player_id, historical season) — never the target season,
so no leakage). **QB-only**: every feature returns None for non-QB, so the model
that stacks these on v44 leaves RB/WR/TE/K projections byte-identical. QBs with no
qualifying NGS season (backups, deep rookies) also get None → the learned combiner
imputes 0, so the coefficient acts only on the deviations of established starters
(exactly where Superflex QB value concentrates).
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature

# Minimum season pass attempts for a season to contribute. NGS only publishes
# qualified passers (~160+ attempts in recent seasons), so this is a light guard
# against any unusually thin aggregate row rather than the primary filter.
MIN_ATTEMPTS = 100
RECENCY_WEIGHTS = [0.6, 0.3, 0.1]  # Most recent → oldest, up to 3 seasons


def weighted_recent_ngs(
    player_id: str,
    nfl_stats_df: pd.DataFrame,
    ngs: dict[tuple[str, int], dict[str, Any]],
    column: str,
) -> Optional[float]:
    """Recency-weighted average of an NGS column over the player's last 3 seasons.

    Seasons are taken from the player's NFL-stats history (prior seasons only);
    for each we look up the NGS row by (player_id, season), skip seasons with no
    NGS row or fewer than MIN_ATTEMPTS, and recency-weight the remainder. Returns
    None if no usable season has the requested metric.
    """
    if nfl_stats_df is None or nfl_stats_df.empty or not ngs:
        return None

    sorted_df = nfl_stats_df.sort_values("season").tail(3)

    values: list[float] = []
    for _, row in sorted_df.iterrows():
        if pd.isna(row.get("season")):
            continue
        season = int(row["season"])
        rec = ngs.get((player_id, season))
        if rec is None or int(rec.get("attempts") or 0) < MIN_ATTEMPTS:
            continue
        val = rec.get(column)
        if val is None or pd.isna(val):
            continue
        values.append(float(val))

    if not values:
        return None

    weights = RECENCY_WEIGHTS[: len(values)]
    values_reversed = list(reversed(values))  # tail() is oldest→newest
    total_weight = sum(weights)
    return sum(v * w for v, w in zip(values_reversed, weights)) / total_weight


class _NGSPassingBase(ProjectionFeature):
    """Shared logic for the QB-only NGS passing raw features."""

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
        ngs = context.get("ngs_passing")
        if not ngs:
            return None
        return weighted_recent_ngs(player_id, nfl_stats_df, ngs, self.COLUMN)


class NGSCPOERawFeature(_NGSPassingBase):
    """Recency-weighted completion % above expectation (CPOE) — accuracy skill."""

    COLUMN = "completion_pct_above_expectation"

    @property
    def name(self) -> str:
        return "ngs_cpoe_raw"


class NGSAirYardsToSticksRawFeature(_NGSPassingBase):
    """Recency-weighted air yards to sticks — intended depth past the first-down marker."""

    COLUMN = "avg_air_yards_to_sticks"

    @property
    def name(self) -> str:
        return "ngs_air_yards_to_sticks_raw"


class NGSAggressivenessRawFeature(_NGSPassingBase):
    """Recency-weighted aggressiveness — % of throws into tight coverage."""

    COLUMN = "aggressiveness"

    @property
    def name(self) -> str:
        return "ngs_aggressiveness_raw"


class NGSTimeToThrowRawFeature(_NGSPassingBase):
    """Recency-weighted average time to throw (sec) — pocket/process time."""

    COLUMN = "avg_time_to_throw"

    @property
    def name(self) -> str:
        return "ngs_time_to_throw_raw"


class NGSAirYardsDifferentialRawFeature(_NGSPassingBase):
    """Recency-weighted completed-minus-intended air yards differential."""

    COLUMN = "avg_air_yards_differential"

    @property
    def name(self) -> str:
        return "ngs_air_yards_differential_raw"
