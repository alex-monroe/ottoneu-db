"""Weighted PPG feature — port of existing WeightedAveragePPG + RookieTrajectoryPPG."""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.config import SCORING_SETTINGS
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

    # Exponent applied to the per-season games-played reliability factor in
    # _weighted_average. The effective weight of a season is
    #   recency_weight * (games_played / 17) ** GAMES_RELIABILITY_EXPONENT.
    # 1.0 (default) is linear inverse-variance weighting — a 3-game season
    # contributes 3/17 of a full season's reliability. Values > 1.0 down-weight
    # small samples more aggressively (a steeper reliability curve), reflecting
    # that very-low-games seasons can be noisier than pure variance predicts
    # (injury/situational/garbage-time effects). 1.0 leaves output byte-identical
    # to the historical behaviour, so existing models are unaffected.
    GAMES_RELIABILITY_EXPONENT = 1.0

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

        weights = self._recency_weights(position)
        sorted_df = history_df.sort_values("season")
        recent = sorted_df.tail(len(weights))
        n = len(recent)

        if n == 1:
            return self._rookie_trajectory(recent.iloc[0], position)
        else:
            return self._weighted_average(recent, weights)

    def _recency_weights(self, position: str) -> list[float]:
        """Recency weights for this player's position (most recent season first).

        The vector's length is also the per-player history window: compute()
        uses the player's len(weights) most-recent seasons. Subclasses can
        override to vary weights (and window) by position — see
        WeightedPPGPerPositionTunedFeature (GH #639).
        """
        return self.RECENCY_WEIGHTS

    def _weighted_average(
        self, recent: pd.DataFrame, weights: Optional[list[float]] = None
    ) -> Optional[float]:
        """Veteran projection: recency-weighted, games-scaled average."""
        if weights is None:
            weights = self.RECENCY_WEIGHTS
        n = len(recent)
        weights = weights[:n]

        numerator = 0.0
        denominator = 0.0

        for i, (_, row) in enumerate(recent.iloc[::-1].iterrows()):
            recency_w = weights[i]
            games_scale = (float(row["games_played"]) / 17.0) ** self.GAMES_RELIABILITY_EXPONENT
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


class WeightedPPGReliabilityNoQBFeature(WeightedPPGNoQBTrajectoryFeature):
    """WeightedPPG (no QB/K trajectory) with a steeper small-sample reliability curve.

    Identical to WeightedPPGNoQBTrajectoryFeature except the per-season
    games-played reliability factor is raised to GAMES_RELIABILITY_EXPONENT = 1.5
    instead of the default linear 1.0. This relatively penalises very-low-games
    seasons harder when blending the recency-weighted average: a 3-game season's
    reliability drops from 3/17 ≈ 0.18 (linear) to (3/17)**1.5 ≈ 0.074, so a
    fuller prior season dominates more decisively.

    Veterans with all-full seasons are essentially unchanged (a 17-game season's
    factor is 1.0 regardless of exponent). The exponent only bites when a season
    is partial — exactly the case the user flagged: a recent low-games season
    carrying less signal than an older full season.
    """

    GAMES_RELIABILITY_EXPONENT = 1.5

    @property
    def name(self) -> str:
        return "weighted_ppg_reliability_no_qb"

    @property
    def is_base(self) -> bool:
        return True


class WeightedPPGTunedNoQBFeature(WeightedPPGNoQBTrajectoryFeature):
    """WeightedPPG (no QB/K trajectory) with inner-fold-tuned recency weights.

    GH #589: grid search over recency weights × games-reliability exponent on
    the inner tuning folds (2022-2024, honest protocol GH #595, isolated base
    scored against next-season actuals) found [0.65, 0.20, 0.15] best —
    heavier on the most recent season than the historical [0.55, 0.25, 0.20]
    — winning or tying every inner fold (2022 -0.008, 2023 -0.025, 2024
    +0.0003 MAE). The exponent grid (1.0/1.25/1.5/2.0) was monotone worse
    above 1.0 at every weight setting, so linear games-reliability stays.
    """

    RECENCY_WEIGHTS = [0.65, 0.20, 0.15]

    @property
    def name(self) -> str:
        return "weighted_ppg_tuned_no_qb"

    @property
    def is_base(self) -> bool:
        return True


class WeightedPPGPerPositionTunedFeature(WeightedPPGNoQBTrajectoryFeature):
    """WeightedPPG (no QB/K trajectory) with per-position recency weights.

    GH #639: the #589 global tune ([0.65, 0.20, 0.15]) won at RB/WR while QB/TE
    moved slightly the wrong way, suggesting positions differ in how fast their
    signal decays. This variant gives each position its own weight vector,
    chosen by the per-position inner-fold sweep
    (``sweep_recency_weights.py --per-position``, honest protocol GH #595);
    positions without an entry fall back to the #589 global tuned weights.

    A vector's length is also that position's per-player history window
    (compute() uses the len(weights) most-recent seasons), so a 2-weight
    entry means "use only the player's two most recent seasons". Windows
    longer than 3 require plumbing ``max_history`` through the pipeline —
    don't add a 4-weight entry without that (the runner only fetches 3
    seasons of history).
    """

    # Per-position sweep winners (GH #639, inner folds 2022-2024, exponent
    # 1.0), picked with the #589 guardrail: prefer the cell that never loses
    # an inner fold to the #589 tuned weights over the absolute-best mean.
    # QB/WR: no cell beat the tuned weights in >=2 folds (QB's best-mean cell,
    # the old prod default, loses 2/3 folds) — keep the global tune. RB:
    # [0.70, 0.20, 0.10] never loses a fold (2.4006 vs 2.4034). TE: the only
    # dominating cell is a 4-season window ([0.60, 0.20, 0.12, 0.08], 1.4927
    # vs 1.5006, never loses) — sweep-only until max_history is plumbed, so
    # TE keeps the global tune here.
    POSITION_RECENCY_WEIGHTS: dict[str, list[float]] = {
        "QB": [0.65, 0.20, 0.15],
        "RB": [0.70, 0.20, 0.10],
        "WR": [0.65, 0.20, 0.15],
        "TE": [0.65, 0.20, 0.15],
    }

    # Fallback for K / unknown positions: the #589 global tuned weights.
    RECENCY_WEIGHTS = [0.65, 0.20, 0.15]

    @property
    def name(self) -> str:
        return "weighted_ppg_pos_tuned_no_qb"

    @property
    def is_base(self) -> bool:
        return True

    def _recency_weights(self, position: str) -> list[float]:
        return self.POSITION_RECENCY_WEIGHTS.get(position, self.RECENCY_WEIGHTS)


# League TD-rate-per-opportunity priors, by position and TD type (GH #667, L1).
# Computed offline from 2018–2025 nfl_stats (pooled TDs / pooled opportunities),
# the same embedded-constant pattern as ROOKIE_GROWTH_CURVES above. Only the
# TD types that are real signal for a position are listed: QB pass+rush, RB
# rush+rec, WR rec+rush, TE rec. (Non-QB "passing TDs" and TE rushing TDs are
# trick-play noise and are left at their realized value.) `opp` names the
# nfl_stats opportunity column whose volume the rate multiplies.
TD_RATE_PRIORS: dict[str, dict[str, tuple[str, float]]] = {
    #            td column        (opportunity column,      league rate)
    "QB": {"passing_tds":   ("passing_attempts", 0.04411),
           "rushing_tds":   ("rushing_attempts", 0.04608)},
    "RB": {"rushing_tds":   ("rushing_attempts", 0.03102),
           "receiving_tds": ("receptions",       0.03863)},
    "WR": {"receiving_tds": ("receptions",       0.07648),
           "rushing_tds":   ("rushing_attempts", 0.03955)},
    "TE": {"receiving_tds": ("receptions",       0.07881)},
}

# Empirical-Bayes prior strength per opportunity type, in opportunity units: the
# shrink weight on a player's own realized TD rate is opp / (opp + beta), so a
# high-volume starter keeps most of their own rate while a low-volume player is
# pulled hard toward the league prior. A full-time role lands near a 0.5–0.7
# self-weight; this is the deliberately un-tuned v1 (a proper per-fold sweep of
# beta is the L3 empirical-Bayes follow-up, not an eyeballed knob here).
TD_PRIOR_STRENGTH: dict[str, float] = {
    "passing_attempts": 550.0,
    "rushing_attempts": 180.0,
    "receptions": 60.0,
}

# Fantasy points per TD by type, pulled from the league scoring config so the
# correction matches the actual scoring (no hardcoded point values).
_TD_POINTS = {
    "passing_tds": SCORING_SETTINGS["passing_tds"],
    "rushing_tds": SCORING_SETTINGS["rushing_tds"],
    "receiving_tds": SCORING_SETTINGS["receiving_tds"],
}


class WeightedXFPTunedNoQBFeature(WeightedPPGTunedNoQBFeature):
    """xFP base (GH #667, L1): weighted past *expected* PPG, not realized PPG.

    A drop-in replacement for ``weighted_ppg_tuned_no_qb`` (same tuned recency
    weights, same games-reliability scaling, same QB/K no-trajectory rule) that
    differs in exactly one thing: **the quantity being autoregressed.** Realized
    PPG bundles stable volume with noisy efficiency (TD rate especially), and
    autoregressing a noise-contaminated quantity onto a noisier version of
    itself hits a variance floor no combiner can beat (the 2026-06 MAE wall).

    For each historical season we replace realized touchdowns with
    **opportunity-expected** touchdowns — each TD type's rate is shrunk toward
    the league prior with strength proportional to the player's opportunity
    volume (``opp / (opp + beta)``) — and adjust that season's PPG by the
    per-game TD-points delta:

        xfp_ppg = ppg + (expected_TD_points - realized_TD_points) / games_played

    Yards, receptions, and interceptions stay realized; only the TD component
    (the dominant, hardest-regressing efficiency noise) is regressed. A season
    with no matching nfl_stats row falls back to realized PPG. Everything
    downstream (recency weighting, rookie trajectory) is inherited unchanged —
    it simply operates on the xFP-adjusted per-season values.
    """

    @property
    def name(self) -> str:
        return "weighted_xfp_tuned_no_qb"

    @property
    def is_base(self) -> bool:
        return True

    @staticmethod
    def _expected_tds(realized: float, opp: float, beta: float, rate: float) -> float:
        """Volume-weighted shrink of realized TDs toward the opportunity-expected count."""
        if opp <= 0:
            return realized  # no opportunity to regress on — keep realized
        w = opp / (opp + beta)
        return w * realized + (1.0 - w) * rate * opp

    def _xfp_adjust(
        self, history_df: pd.DataFrame, nfl_stats_df: pd.DataFrame, position: str
    ) -> pd.DataFrame:
        """Return a copy of history_df with `ppg` replaced by the xFP-adjusted PPG."""
        priors = TD_RATE_PRIORS.get(position)
        if not priors or history_df.empty or nfl_stats_df is None or nfl_stats_df.empty:
            return history_df

        nfl_by_season = {
            int(r["season"]): r
            for _, r in nfl_stats_df.iterrows()
            if pd.notna(r.get("season"))
        }
        out = history_df.copy()
        new_ppg = []
        for _, row in out.iterrows():
            ppg = float(row["ppg"]) if pd.notna(row.get("ppg")) else None
            games = float(row.get("games_played") or 0)
            nfl = nfl_by_season.get(int(row["season"])) if pd.notna(row.get("season")) else None
            if ppg is None or games <= 0 or nfl is None:
                new_ppg.append(row.get("ppg"))
                continue
            delta_pts = 0.0
            for td_col, (opp_col, rate) in priors.items():
                realized = float(nfl.get(td_col) or 0)
                opp = float(nfl.get(opp_col) or 0)
                beta = TD_PRIOR_STRENGTH[opp_col]
                expected = self._expected_tds(realized, opp, beta, rate)
                delta_pts += (expected - realized) * _TD_POINTS[td_col]
            new_ppg.append(ppg + delta_pts / games)
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
        adjusted = self._xfp_adjust(history_df, nfl_stats_df, position)
        return super().compute(player_id, position, adjusted, nfl_stats_df, context)


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
