"""Red-zone xFP base — expected points with TDs reconstructed from red-zone role.

The proper version of L1's xFP (#667), built on the new `red_zone_usage` data
(#671). L1 estimated expected TDs as `population_rate × total_volume`, which
strips *all* TD skill and over-regresses goal-line backs to average — it tied.
This feature instead reconstructs expected TDs from **red-zone / goal-line
usage**, the durable, role-based signal: a back who gets the goal-line carries
*should* score the rushing TDs.

For each historical season the realized touchdown points are replaced with
red-zone-expected touchdown points:

    xfp_ppg = ppg + (expected_TD_points - realized_TD_points) / games

Expected TDs use a league model fit (offline, through the origin) of realized
season TDs on red-zone usage — `corr(expected_rush_td, realized) = 0.92`:

    expected_rush_td = 0.3159·gz_carries + 0.0431·(rz_carries - gz_carries)
    expected_rec_td  = 0.2163·rz_targets + 0.2346·gz_targets
    expected_pass_td = 0.2910·rz_pass_attempts

A goal-line carry is worth ~7× a 10-to-20 carry in expected rush TDs — exactly
the finishing-role signal a player's own past PPG can't carry. Yards/receptions
stay realized (only the noisy TD component is reconstructed). A season with no
`red_zone_usage` row keeps its realized PPG. Non-QB/K trajectory and the tuned
recency weights are inherited unchanged; this is a drop-in base swap.
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.config import SCORING_SETTINGS
from scripts.feature_projections.features.weighted_ppg import WeightedPPGTunedNoQBFeature

# League RZ→TD coefficients (offline NNLS through the origin on 3,817 player-
# seasons of red_zone_usage ⋈ nfl_stats). Embedded-constant pattern.
RUSH_TD_PER_GZ_CARRY = 0.3159
RUSH_TD_PER_RZ_OUTER_CARRY = 0.0431  # carries inside the 20 but outside the 10
REC_TD_PER_RZ_TARGET = 0.2163
REC_TD_PER_GZ_TARGET = 0.2346  # additional, on top of the RZ-target term
PASS_TD_PER_RZ_ATTEMPT = 0.2910

_RUSH_TD_PTS = SCORING_SETTINGS["rushing_tds"]
_REC_TD_PTS = SCORING_SETTINGS["receiving_tds"]
_PASS_TD_PTS = SCORING_SETTINGS["passing_tds"]


class WeightedXFPRedZoneFeature(WeightedPPGTunedNoQBFeature):
    """Tuned base, but each season's TDs are reconstructed from red-zone usage."""

    @property
    def name(self) -> str:
        return "weighted_xfp_redzone"

    @property
    def is_base(self) -> bool:
        return True

    @staticmethod
    def _expected_td_points(rz: dict[str, int]) -> float:
        exp_rush = (
            RUSH_TD_PER_GZ_CARRY * rz["gz_carries"]
            + RUSH_TD_PER_RZ_OUTER_CARRY * max(rz["rz_carries"] - rz["gz_carries"], 0)
        )
        exp_rec = REC_TD_PER_RZ_TARGET * rz["rz_targets"] + REC_TD_PER_GZ_TARGET * rz["gz_targets"]
        exp_pass = PASS_TD_PER_RZ_ATTEMPT * rz["rz_pass_attempts"]
        return exp_rush * _RUSH_TD_PTS + exp_rec * _REC_TD_PTS + exp_pass * _PASS_TD_PTS

    @staticmethod
    def _realized_td_points(nfl: pd.Series) -> float:
        return (
            float(nfl.get("rushing_tds") or 0) * _RUSH_TD_PTS
            + float(nfl.get("receiving_tds") or 0) * _REC_TD_PTS
            + float(nfl.get("passing_tds") or 0) * _PASS_TD_PTS
        )

    def _redzone_adjust(
        self,
        player_id: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        red_zone: dict[tuple[str, int], dict[str, int]],
    ) -> pd.DataFrame:
        """Return history_df with `ppg` replaced by the RZ-expected-TD-adjusted PPG."""
        if history_df.empty or not red_zone:
            return history_df
        nfl_by_season = {
            int(r["season"]): r
            for _, r in nfl_stats_df.iterrows()
            if pd.notna(r.get("season"))
        } if nfl_stats_df is not None and not nfl_stats_df.empty else {}

        out = history_df.copy()
        new_ppg = []
        for _, row in out.iterrows():
            ppg = row.get("ppg")
            games = float(row.get("games_played") or 0)
            season = int(row["season"]) if pd.notna(row.get("season")) else None
            rz = red_zone.get((player_id, season)) if season is not None else None
            nfl = nfl_by_season.get(season)
            if ppg is None or games <= 0 or rz is None or nfl is None:
                new_ppg.append(ppg)
                continue
            delta_pts = self._expected_td_points(rz) - self._realized_td_points(nfl)
            new_ppg.append(float(ppg) + delta_pts / games)
        out["ppg"] = new_ppg
        return out

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        red_zone = context.get("red_zone")
        if red_zone:
            history_df = self._redzone_adjust(player_id, history_df, nfl_stats_df, red_zone)
        return super().compute(player_id, position, history_df, nfl_stats_df, context)


# Recency weights for the additive TD-regression signal (most recent → oldest).
_TD_REGRESSION_WEIGHTS = [0.6, 0.3, 0.1]


class TDRegressionRawFeature(WeightedXFPRedZoneFeature):
    """Additive TD over/under-performance flag from red-zone usage (#671).

    Instead of *replacing* the base (which discards realized-TD persistence —
    v46 tied/regressed), this is an **adjustment** feature on top of the realized
    base: the recency-weighted per-game gap between a player's *realized* TD
    points and the TD points their *red-zone role* implies,

        td_regression = Σ_w (realized_TD_pts − rz_expected_TD_pts) / games.

    Positive ⇒ the player out-scored their red-zone role (TD luck that won't
    repeat ⇒ the learned combiner should pull next year down); negative ⇒ they
    left TDs on the table given their role (positive regression candidate). The
    realized base feature is left intact; the combiner learns the coefficient.
    Returns None when no red-zone history is available (vets fall back cleanly).
    """

    @property
    def name(self) -> str:
        return "td_regression_raw"

    @property
    def is_base(self) -> bool:
        return False

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        red_zone = context.get("red_zone")
        if not red_zone or history_df.empty:
            return None
        nfl_by_season = {
            int(r["season"]): r
            for _, r in nfl_stats_df.iterrows()
            if pd.notna(r.get("season"))
        } if nfl_stats_df is not None and not nfl_stats_df.empty else {}

        rows = history_df.sort_values("season").tail(len(_TD_REGRESSION_WEIGHTS))
        per_season: list[float] = []
        for _, row in rows.iterrows():
            games = float(row.get("games_played") or 0)
            season = int(row["season"]) if pd.notna(row.get("season")) else None
            rz = red_zone.get((player_id, season)) if season is not None else None
            nfl = nfl_by_season.get(season)
            if games <= 0 or rz is None or nfl is None:
                per_season.append(None)
                continue
            per_season.append((self._realized_td_points(nfl) - self._expected_td_points(rz)) / games)

        # Recency-weight the seasons that have a value (oldest→newest in `rows`).
        vals = list(reversed(per_season))  # newest first
        num = den = 0.0
        for w, v in zip(_TD_REGRESSION_WEIGHTS, vals):
            if v is None:
                continue
            num += w * v
            den += w
        return num / den if den else None
