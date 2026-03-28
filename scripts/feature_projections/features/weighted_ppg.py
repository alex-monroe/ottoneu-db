"""Weighted PPG feature — port of existing WeightedAveragePPG + RookieTrajectoryPPG."""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


# Position-specific rookie year-1 → year-2 growth ratios (median) and
# mean rookie PPG for small-sample blending.
# Computed from 2018-2025 player_stats via analyze_rookie_growth.py.
ROOKIE_GROWTH_CURVES: dict[str, dict[str, float]] = {
    "QB": {"growth_ratio": 0.95, "rookie_mean_ppg": 14.22},
    "RB": {"growth_ratio": 1.047, "rookie_mean_ppg": 9.22},
    "WR": {"growth_ratio": 1.04, "rookie_mean_ppg": 9.65},
    "TE": {"growth_ratio": 1.051, "rookie_mean_ppg": 5.14},
    "K":  {"growth_ratio": 1.022, "rookie_mean_ppg": 7.97},
}

# Rookies with fewer games than this threshold get PPG blended toward the
# positional rookie mean to reduce small-sample noise.
ROOKIE_MIN_GAMES_FULL_WEIGHT = 4


class WeightedPPGFeature(ProjectionFeature):
    """Recency-weighted, games-scaled average PPG.

    For veterans (2+ seasons): uses WeightedAveragePPG logic with recency weights
    [0.55, 0.25, 0.20] and games_played/17 scaling.

    For rookies (1 season): uses RookieTrajectoryPPG logic with H2/H1 snap trajectory.

    This is the baseline feature — an exact port of the existing projection_methods.py.
    """

    RECENCY_WEIGHTS = [0.55, 0.25, 0.20]
    ROOKIE_MIN_FACTOR = 0.75
    ROOKIE_MAX_FACTOR = 1.50

    @property
    def name(self) -> str:
        return "weighted_ppg"

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
        if history_df.empty:
            return None

        sorted_df = history_df.sort_values("season")
        recent = sorted_df.tail(3)
        n = len(recent)

        if n == 1:
            return self._rookie_trajectory(recent.iloc[0], position)
        else:
            return self._weighted_average(recent)

    def _weighted_average(self, recent: pd.DataFrame) -> Optional[float]:
        """Veteran projection: recency-weighted, games-scaled average."""
        n = len(recent)
        weights = self.RECENCY_WEIGHTS[:n]

        numerator = 0.0
        denominator = 0.0

        for i, (_, row) in enumerate(recent.iloc[::-1].iterrows()):
            recency_w = weights[i]
            games_scale = float(row["games_played"]) / 17.0
            effective_w = recency_w * games_scale

            numerator += float(row["ppg"]) * effective_w
            denominator += effective_w

        if denominator == 0:
            return None
        return numerator / denominator

    # Positions for which the snap trajectory is skipped (plain PPG returned).
    # QBs: starting QBs already receive all snaps — H2 vs H1 trajectory just
    # reflects mid-season role changes, not future performance signal.
    # Subclasses can override this to change behaviour.
    NO_TRAJECTORY_POSITIONS: frozenset[str] = frozenset()

    def _rookie_trajectory(self, row: pd.Series, position: str = "") -> Optional[float]:
        """Rookie projection: PPG × clamp(H2_SPG / H1_SPG, 0.75, 1.50).

        For positions in NO_TRAJECTORY_POSITIONS, returns plain season PPG instead.
        """
        ppg = float(row["ppg"]) if pd.notna(row.get("ppg")) else 0.0
        if ppg == 0:
            return None

        if position in self.NO_TRAJECTORY_POSITIONS:
            return ppg

        h1_snaps = int(row.get("h1_snaps") or 0) if pd.notna(row.get("h1_snaps")) else 0
        h1_games = max(int(row.get("h1_games") or 1) if pd.notna(row.get("h1_games")) else 1, 1)
        h2_snaps = int(row.get("h2_snaps") or 0) if pd.notna(row.get("h2_snaps")) else 0
        h2_games = max(int(row.get("h2_games") or 1) if pd.notna(row.get("h2_games")) else 1, 1)

        h1_spg = h1_snaps / h1_games
        h2_spg = h2_snaps / h2_games

        if h1_spg == 0:
            return ppg

        factor = min(max(h2_spg / h1_spg, self.ROOKIE_MIN_FACTOR), self.ROOKIE_MAX_FACTOR)
        return ppg * factor


class WeightedPPGNoQBTrajectoryFeature(WeightedPPGFeature):
    """WeightedPPG with snap trajectory disabled for QB and K.

    QBs: a starting QB gets all offensive snaps regardless of H1/H2 split —
    a high H2/H1 ratio just means they took over mid-season, which is a poor
    proxy for next-year performance. Use raw season PPG instead.
    Kickers: snaps are irrelevant to scoring.
    """

    NO_TRAJECTORY_POSITIONS: frozenset[str] = frozenset({"QB", "K"})

    @property
    def name(self) -> str:
        return "weighted_ppg_no_qb_trajectory"

    @property
    def is_base(self) -> bool:
        return True


class WeightedPPGRookieGrowthFeature(WeightedPPGFeature):
    """WeightedPPG with position-specific rookie growth curves and small-sample blending.

    Enhancements over base WeightedPPGFeature for rookies:
    1. Small-sample blending: if games_played < ROOKIE_MIN_GAMES_FULL_WEIGHT,
       PPG is blended toward the positional rookie mean.
    2. Position-specific growth adjustment: applies historical year-1→year-2
       median improvement as a dampened additive delta (not multiplicative,
       to avoid compounding with the snap trajectory factor).

    Formula: base_ppg * snap_factor + growth_delta
    where growth_delta = base_ppg * (growth_ratio - 1.0) * GROWTH_DAMPING

    Veteran path (2+ seasons) is unchanged.
    """

    # Scale factor for the positional growth adjustment. The growth delta is
    # only applied when snap trajectory data is absent (snap_factor == 1.0),
    # since the snap trajectory already captures within-season momentum.
    GROWTH_DAMPING = 0.5

    @property
    def name(self) -> str:
        return "weighted_ppg_rookie_growth"

    @property
    def is_base(self) -> bool:
        return True

    def _rookie_trajectory(self, row: pd.Series, position: str = "") -> Optional[float]:
        """Rookie projection with growth curves and small-sample blending."""
        ppg = float(row["ppg"]) if pd.notna(row.get("ppg")) else 0.0
        if ppg == 0:
            return None

        # Positions that skip snap trajectory get plain PPG (no growth either,
        # since the growth ratio is coupled to the trajectory logic).
        if position in self.NO_TRAJECTORY_POSITIONS:
            return ppg

        curve = ROOKIE_GROWTH_CURVES.get(position)
        if not curve:
            # Unknown position — fall back to snap-only trajectory
            return super()._rookie_trajectory(row, position)

        games_played = int(row.get("games_played", 0) or 0) if pd.notna(row.get("games_played")) else 0

        # Small-sample blending: blend toward positional rookie mean
        if games_played < ROOKIE_MIN_GAMES_FULL_WEIGHT and games_played > 0:
            blend_weight = games_played / ROOKIE_MIN_GAMES_FULL_WEIGHT
            blended_ppg = ppg * blend_weight + curve["rookie_mean_ppg"] * (1 - blend_weight)
        else:
            blended_ppg = ppg

        # Snap trajectory factor (existing logic)
        h1_snaps = int(row.get("h1_snaps") or 0) if pd.notna(row.get("h1_snaps")) else 0
        h1_games = max(int(row.get("h1_games") or 1) if pd.notna(row.get("h1_games")) else 1, 1)
        h2_snaps = int(row.get("h2_snaps") or 0) if pd.notna(row.get("h2_snaps")) else 0
        h2_games = max(int(row.get("h2_games") or 1) if pd.notna(row.get("h2_games")) else 1, 1)

        h1_spg = h1_snaps / h1_games
        h2_spg = h2_snaps / h2_games

        if h1_spg == 0:
            snap_factor = 1.0
        else:
            snap_factor = min(max(h2_spg / h1_spg, self.ROOKIE_MIN_FACTOR), self.ROOKIE_MAX_FACTOR)

        # Position-specific growth: only applied when snap trajectory data is
        # absent (snap_factor == 1.0). When snap data exists, the trajectory
        # already captures within-season momentum and adding growth over-projects.
        if snap_factor == 1.0:
            growth_delta = blended_ppg * (curve["growth_ratio"] - 1.0) * self.GROWTH_DAMPING
        else:
            growth_delta = 0.0

        return blended_ppg * snap_factor + growth_delta


class WeightedPPGRookieGrowthNoQBFeature(WeightedPPGRookieGrowthFeature):
    """Rookie growth curves + no QB/K snap trajectory.

    Combines position-specific rookie growth with the QB/K trajectory
    exclusion from WeightedPPGNoQBTrajectoryFeature.
    """

    NO_TRAJECTORY_POSITIONS: frozenset[str] = frozenset({"QB", "K"})

    @property
    def name(self) -> str:
        return "weighted_ppg_rookie_growth_no_qb"

    @property
    def is_base(self) -> bool:
        return True
